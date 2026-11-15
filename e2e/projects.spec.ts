import { createHmac, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { adminCode, ensureAdminTotp } from "./support";

// Projects end to end against a real staging database: create with needs, place and coordinates,
// guests and non-members, signing up for support, progress, status, moderation and the cabinet.
// Needs FF_P1A=true.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const secret = process.env.TEST_LOGIN_SECRET;
const enabled =
  !!url &&
  !!key &&
  !!secret &&
  process.env.TEST_LOGIN_ENABLED === "true" &&
  !!process.env.BRIDGE_KEK &&
  process.env.FF_P1A === "true";

test.skip(!enabled, "needs staging, keys and FF_P1A=true");
test.describe.configure({ mode: "serial", timeout: 120_000 });
test.beforeEach(async ({}, info) => {
  test.skip(info.project.name !== "desktop", "one project is enough");
});

const db = enabled
  ? createClient(url!, key!, { auth: { persistSession: false } })
  : null!;
const TG = {
  alice: "9990000001",
  bob: "9990000002",
  carol: "9990000003",
  dave: "9990000004",
} as const;
type Who = keyof typeof TG;
const RUN = Date.now().toString(36);
const TITLE = `Мост через ущелье ${RUN}`;
const ids = {} as Record<Who, string>;

function loginUrl(u: Who) {
  const body = Buffer.from(
    JSON.stringify({
      u,
      exp: Math.floor(Date.now() / 1000) + 60,
      jti: randomUUID(),
    }),
  ).toString("base64url");
  return `/api/test-login?token=${body}.${createHmac("sha256", secret!).update(body).digest("base64url")}`;
}
async function asUser(browser: Browser, who: Who): Promise<Page> {
  const ctx = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
  });
  const page = await ctx.newPage();
  await page.goto(loginUrl(who));
  await expect(page).toHaveURL(/\/dashboard/);
  return page;
}
const guestPage = async (browser: Browser) =>
  (
    await browser.newContext({ baseURL: test.info().project.use.baseURL })
  ).newPage();

async function wipe() {
  const all = Object.values(ids);
  await db.from("projects").delete().in("author_id", all);
}
const projectId = async () =>
  (await db.from("projects").select("id").eq("title", TITLE).single()).data!
    .id as string;

test.beforeAll(async () => {
  for (const who of Object.keys(TG) as Who[]) {
    const { data } = await db.rpc("upsert_telegram_user", {
      p_telegram_id: TG[who],
      p_username: `test_${who}`,
      p_display_name: `Test ${who}`,
    });
    ids[who] = (Array.isArray(data) ? data[0] : data).user_id as string;
  }
  await db.from("users").update({ site_role: "admin" }).eq("id", ids.alice);
  await ensureAdminTotp(db, ids.alice);
  await adminCode(db, ids.alice);
  await wipe();
  for (const who of ["bob", "carol", "dave"] as Who[]) {
    await db.from("access_memberships").delete().eq("user_id", ids[who]);
    await db.from("minecraft_identities").delete().eq("user_id", ids[who]);
    await db.from("minecraft_identities").insert({
      user_id: ids[who],
      nickname: `${who[0].toUpperCase()}${who.slice(1)}_${RUN}`.slice(0, 16),
    });
  }
  for (const who of ["bob", "carol"] as Who[])
    await db.from("access_memberships").insert({
      user_id: ids[who],
      status: "approved",
      decided_at: new Date().toISOString(),
    });
  await db.from("rate_limit_counters").delete().like("key", "project:%");
});
test.afterAll(async () => {
  await wipe();
  for (const who of ["bob", "carol", "dave"] as Who[]) {
    await db.from("access_memberships").delete().eq("user_id", ids[who]);
    await db.from("minecraft_identities").delete().eq("user_id", ids[who]);
  }
});

test("a member creates a project with needs, a place and coordinates", async ({
  browser,
}) => {
  const bob = await asUser(browser, "bob");
  await bob.goto("/social/projects/new");
  await bob.getByLabel("Название", { exact: true }).fill(TITLE);
  await bob
    .getByLabel("Описание", { exact: true })
    .fill("Соединим два берега, чтобы ходить без обхода.");
  await bob.getByLabel("Место", { exact: true }).fill("Ущелье у спавна");
  await bob.getByLabel("Мир").selectOption("overworld");
  await bob.locator("#p-x").fill("120");
  await bob.locator("#p-y").fill("70");
  await bob.locator("#p-z").fill("-340");
  await bob.getByLabel("Потребность 1", { exact: true }).fill("Железо");
  await bob.getByLabel("Количество 1").fill("192");
  await bob.getByLabel("Единица 1").fill("шт.");
  await bob.getByText("＋ Добавить потребность").click();
  await bob
    .getByLabel("Потребность 2", { exact: true })
    .fill("Дизайнер ограждений");
  await bob.getByRole("button", { name: "Создать проект" }).click();

  await expect(bob.getByText("Проект создан.")).toBeVisible();
  await expect(bob.getByRole("heading", { name: TITLE })).toBeVisible();
  await expect(
    bob.getByText("Нужна помощь", { exact: false }).first(),
  ).toBeVisible();
  await expect(bob.getByText("Ущелье у спавна")).toBeVisible();
  await expect(bob.getByText("120 70 -340")).toBeVisible();
  await expect(bob.getByRole("button", { name: "Скопировать" })).toBeVisible();
  const iron = bob.locator("[data-need-id]", { hasText: "Железо" });
  await expect(iron.getByText("0 из 192 шт.")).toBeVisible();
  await expect(
    bob
      .locator("[data-need-id]", { hasText: "Дизайнер ограждений" })
      .getByText("Нужно", { exact: true }),
  ).toBeVisible();
  // the author does not sign up for their own project
  await expect(bob.getByText("Вы автор проекта")).toBeVisible();
  await expect(
    bob.getByRole("button", { name: "Записаться в поддержку" }),
  ).toHaveCount(0);
});

test("a guest and a player without admission read the project but cannot sign up", async ({
  browser,
}) => {
  const guest = await guestPage(browser);
  await guest.goto("/social/projects");
  await expect(
    guest.getByRole("link", { name: new RegExp(TITLE) }),
  ).toBeVisible();
  await guest.getByRole("link", { name: new RegExp(TITLE) }).click();
  await expect(guest.getByRole("heading", { name: TITLE })).toBeVisible();
  await expect(
    guest.getByText("Список помощников виден вошедшим игрокам."),
  ).toBeVisible();
  await expect(
    guest.getByRole("link", { name: "Войти через Telegram" }),
  ).toBeVisible();
  await expect(
    guest.getByRole("button", { name: "Записаться в поддержку" }),
  ).toHaveCount(0);
  await expect(guest.getByText("Управление")).toHaveCount(0);

  const dave = await asUser(browser, "dave");
  await dave.goto(`/social/projects/${await projectId()}`);
  await expect(
    dave.getByText("Записаться могут участники сервера."),
  ).toBeVisible();
  await expect(dave.getByRole("link", { name: "Создать проект" })).toHaveCount(
    0,
  );
  await dave.goto("/social/projects/new");
  await expect(
    dave.getByText("Проекты создают участники сервера."),
  ).toBeVisible();
});

test("a member signs up for support with a pledge, changes it and leaves", async ({
  browser,
}) => {
  const id = await projectId();
  const carol = await asUser(browser, "carol");
  await carol.goto(`/social/projects/${id}`);
  await carol.getByLabel("Чем помогу").selectOption({ label: "Железо" });
  await carol.getByLabel("Сколько принесу").fill("64");
  await carol.getByLabel(/Заметка автору/).fill("Принесу в субботу");
  await carol.getByRole("button", { name: "Записаться в поддержку" }).click();
  await expect(carol.getByText("Вы записаны в поддержку.")).toBeVisible();
  await expect(carol.getByText("Вы в поддержке")).toBeVisible();
  await expect(
    carol.getByText(/Железо · 64 · Принесу в субботу/),
  ).toBeVisible();
  await expect(carol.getByText("это вы")).toBeVisible();
  await expect(carol.getByText(/Обещано помощниками: 64 шт\./)).toBeVisible();

  // a second sign-up updates the same row
  await carol.getByLabel("Сколько принесу").fill("100");
  await carol.getByRole("button", { name: "Обновить запись" }).click();
  await expect(carol.getByText(/Железо · 100/)).toBeVisible();
  const { count } = await db
    .from("project_supporters")
    .select("user_id", { count: "exact", head: true })
    .eq("project_id", id);
  expect(count).toBe(1);

  // a supporter sees no management controls
  await expect(carol.getByRole("heading", { name: "Управление" })).toHaveCount(
    0,
  );

  // the cabinet lists the project with the role
  await carol.goto("/dashboard");
  await expect(carol.getByRole("link", { name: TITLE })).toBeVisible();
  await expect(carol.getByText("Поддерживаю")).toBeVisible();

  await carol.goto(`/social/projects/${id}`);
  await carol.getByRole("button", { name: "Выйти из поддержки" }).click();
  await expect(carol.getByText("Вы вышли из поддержки проекта.")).toBeVisible();
  await expect(carol.getByText("Пока никто не записался.")).toBeVisible();
  // and signs up again for the later steps
  await carol.getByRole("button", { name: "Записаться в поддержку" }).click();
  await expect(carol.getByText("Вы записаны в поддержку.")).toBeVisible();
});

test("the author sees supporters, records progress and removes a supporter; progress is weighted by quantity", async ({
  browser,
}) => {
  const bob = await asUser(browser, "bob");
  await bob.goto(`/social/projects/${await projectId()}`);
  await expect(bob.getByText(/Carol_/)).toBeVisible();

  const iron = bob.locator("[data-need-id]", { hasText: "Железо" });
  await iron.getByLabel("Сделано").fill("96");
  await iron.getByRole("button", { name: "Сохранить" }).click();
  await expect(bob.getByText("Прогресс сохранён.")).toBeVisible();
  await expect(
    bob
      .locator("[data-need-id]", { hasText: "Железо" })
      .getByText("96 из 192 шт."),
  ).toBeVisible();
  // 96 of 192 + a yes/no need = 96/193 -> 50 %
  await expect(
    bob.getByRole("progressbar", { name: "Готовность проекта" }),
  ).toHaveAttribute("aria-valuenow", "50");

  await bob
    .locator("[data-need-id]", { hasText: "Дизайнер ограждений" })
    .getByRole("button", { name: "Отметить сделанным" })
    .click();
  await expect(bob.getByText("Прогресс сохранён.")).toBeVisible();
  await expect(
    bob.getByRole("progressbar", { name: "Готовность проекта" }),
  ).toHaveAttribute("aria-valuenow", "50"); // 97 / 193

  await bob
    .locator("[data-need-id]", { hasText: "Железо" })
    .getByLabel("Сделано")
    .fill("192");
  await bob
    .locator("[data-need-id]", { hasText: "Железо" })
    .getByRole("button", { name: "Сохранить" })
    .click();
  await expect(
    bob.getByRole("progressbar", { name: "Готовность проекта" }),
  ).toHaveAttribute("aria-valuenow", "100");
  await expect(
    bob.locator("[data-need-id]", { hasText: "Железо" }).getByText(/Закрыто$/),
  ).toBeVisible();

  // a new need and its removal
  await bob.locator("#nn-title").fill("Факелы");
  await bob.locator("#nn-qty").fill("64");
  await bob.getByRole("button", { name: "Добавить", exact: true }).click();
  await expect(bob.getByText("Потребность добавлена.")).toBeVisible();
  await bob
    .locator("[data-need-id]", { hasText: "Факелы" })
    .getByRole("button", { name: "Удалить" })
    .click();
  await expect(bob.getByText("Потребность удалена.")).toBeVisible();

  await bob
    .locator("li", { hasText: /Carol_/ })
    .getByRole("button", { name: "Убрать" })
    .click();
  await expect(bob.getByText("Помощник убран из списка.")).toBeVisible();
  await expect(bob.getByText("Пока никто не записался.")).toBeVisible();
});

test("the author changes the status; a finished project takes no more supporters", async ({
  browser,
}) => {
  const id = await projectId();
  const bob = await asUser(browser, "bob");
  await bob.goto(`/social/projects/${id}`);
  await bob.getByRole("button", { name: "В работе" }).click();
  await expect(bob.getByText("Статус изменён.")).toBeVisible();
  await expect(
    bob.getByText("В работе", { exact: false }).first(),
  ).toBeVisible();
  await bob.getByRole("button", { name: "Готово", exact: true }).click();
  await expect(bob.getByText("Статус изменён.")).toBeVisible();

  const carol = await asUser(browser, "carol");
  await carol.goto(`/social/projects/${id}`);
  await expect(
    carol.getByText("Проект завершён: запись в поддержку закрыта."),
  ).toBeVisible();
  // back to recruiting for the moderation step
  await bob.getByRole("button", { name: "Нужна помощь" }).click();
  await expect(bob.getByText("Статус изменён.")).toBeVisible();
  await expect
    .poll(async () => {
      const { data: row } = await db
        .from("projects")
        .select("status, completed_at")
        .eq("id", id)
        .single();
      return row;
    })
    .toEqual({ status: "recruiting", completed_at: null });
});

test("a moderator closes a project with a reason; it disappears for others; the author still sees why", async ({
  browser,
}) => {
  const id = await projectId();
  const alice = await asUser(browser, "alice");
  await alice.goto(`/social/projects/${id}`);
  await alice.getByRole("button", { name: "Закрыть проект" }).click();
  await expect(
    alice.getByText("Укажите причину (не короче 3 символов)."),
  ).toBeVisible();
  await alice.goto(`/social/projects/${id}`);
  await alice.locator("#mod-reason").fill("Нарушает правила сервера");
  await alice.getByRole("button", { name: "Закрыть проект" }).click();
  await expect(alice.getByText("Проект закрыт.")).toBeVisible();

  const guest = await guestPage(browser);
  expect((await guest.request.get(`/social/projects/${id}`)).status()).toBe(
    404,
  );
  await guest.goto("/social/projects");
  await expect(guest.getByText(TITLE)).toHaveCount(0);
  const bob = await asUser(browser, "bob");
  await bob.goto(`/social/projects/${id}`);
  await expect(
    bob.getByText(/Проект закрыт: Нарушает правила сервера/),
  ).toBeVisible();
  const { data: audit } = await db
    .from("audit_log")
    .select("action")
    .eq("action", "project.cancelled_by_moderator")
    .limit(1);
  expect(audit?.length).toBe(1);
});
