import { createHmac, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { ensureAdminTotp } from "./support";
import { expect, test, type Browser, type Page } from "@playwright/test";

// Full admission flow against a real staging database. Needs the service key and the
// test-login secret; skipped otherwise (for example in CI without secrets).
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const secret = process.env.TEST_LOGIN_SECRET;
const enabled =
  !!url && !!key && !!secret && process.env.TEST_LOGIN_ENABLED === "true";

test.skip(!enabled, "needs staging database and test-login secret");
test.describe.configure({ mode: "serial", timeout: 90_000 });
test.beforeEach(async ({}, info) => {
  test.skip(info.project.name !== "desktop", "one project is enough");
});

const db = enabled
  ? createClient(url!, key!, { auth: { persistSession: false } })
  : null!;
const major = Math.floor(Date.now() / 1000);
const TG = {
  alice: "9990000001",
  bob: "9990000002",
  carol: "9990000003",
} as const;
type Who = keyof typeof TG;

function loginUrl(u: Who) {
  const body = Buffer.from(
    JSON.stringify({
      u,
      exp: Math.floor(Date.now() / 1000) + 60,
      jti: randomUUID(),
    }),
  ).toString("base64url");
  const mac = createHmac("sha256", secret!).update(body).digest("base64url");
  return `/api/test-login?token=${body}.${mac}`;
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

async function userId(who: Who) {
  const { data } = await db
    .from("telegram_identities")
    .select("user_id")
    .eq("telegram_id", TG[who])
    .single();
  return data!.user_id as string;
}

async function reset() {
  const ids = await Promise.all(
    (["alice", "bob", "carol"] as Who[]).map(userId),
  );
  await db.from("access_memberships").delete().in("user_id", ids);
  await db.from("invitation_redemptions").delete().in("user_id", ids);
  await db.from("applications").delete().in("user_id", ids);
  await db.from("invitations").delete().in("issued_by", ids);
  await db.from("minecraft_identities").delete().in("user_id", ids);
  await db.from("rules_acceptances").delete().in("user_id", ids);
  await db.from("rules_versions").delete().gte("version_major", major);
}

test.beforeAll(async () => {
  await ensureAdminTotp(db, await userId("alice")); // staff need 2FA to open /admin
  // fixtures are created by `npm run seed:test`
  await reset();
});
test.afterAll(reset);

test("admin publishes rules, creates an invitation; a player redeems it", async ({
  browser,
}) => {
  const admin = await asUser(browser, "alice");
  await admin.goto("/admin/rules");
  await admin.getByLabel("Мажорная").fill(String(major));
  await admin.getByLabel("Минорная").fill("0");
  await admin
    .getByLabel("Текст правил")
    .fill("Не гриферить. Уважать других игроков.");
  await admin.getByRole("button", { name: "Опубликовать" }).click();
  await expect(admin.getByText("Версия опубликована.")).toBeVisible();

  await admin.goto("/admin/invitations");
  await admin.getByRole("button", { name: "Создать приглашение" }).click();
  const link = await admin.getByLabel("Ссылка-приглашение").inputValue();
  expect(link).toContain("/invite/");
  const path = new URL(link).pathname;

  const bob = await asUser(browser, "bob");
  await bob.goto(path);
  await bob.getByRole("button", { name: "Использовать приглашение" }).click();
  await expect(
    bob.getByText("Сначала примите актуальные правила сервера."),
  ).toBeVisible();

  await bob.getByRole("link", { name: "Прочитать правила" }).click();
  await expect(
    bob.getByText("Не гриферить. Уважать других игроков."),
  ).toBeVisible();
  await bob.getByRole("button", { name: "Принимаю правила" }).click();
  await expect(bob.getByText("Правила приняты.")).toBeVisible();

  await bob.goto(path);
  await bob.getByRole("button", { name: "Использовать приглашение" }).click();
  await expect(
    bob.getByText("Приглашение принято. Допуск получен."),
  ).toBeVisible();

  // single use: the same link no longer works for anybody else
  const carol = await asUser(browser, "carol");
  await carol.goto("/rules");
  await carol.getByRole("button", { name: "Принимаю правила" }).click();
  await carol.goto(path);
  await carol.getByRole("button", { name: "Использовать приглашение" }).click();
  await expect(carol.getByText("Приглашение уже использовано.")).toBeVisible();

  // the admin sees the audit trail
  await admin.goto("/admin/audit");
  await expect(admin.getByText("invitation.redeemed").first()).toBeVisible();
  await expect(admin.getByText("rules.published").first()).toBeVisible();
});

test("a player applies and a moderator decision gives access", async ({
  browser,
}) => {
  const carol = await asUser(browser, "carol");
  await carol.goto("/rules");
  const accept = carol.getByRole("button", { name: "Принимаю правила" });
  if (await accept.isVisible()) await accept.click();
  await carol.goto("/onboarding/minecraft");
  await carol.getByLabel("Ник", { exact: true }).fill("ab");
  await carol.getByRole("button", { name: "Сохранить ник" }).click();
  await expect(
    carol.getByText("Ник: 3–16 символов, только латиница, цифры и «_»."),
  ).toBeVisible();

  await carol.getByLabel("Ник", { exact: true }).fill("Carol_E2E");
  await carol.getByRole("button", { name: "Сохранить ник" }).click();
  await expect(carol.getByText("Carol_E2E")).toBeVisible();
  await carol.getByLabel("Или подайте заявку").fill("Хочу играть");
  await carol.getByRole("button", { name: "Подать заявку" }).click();
  await expect(carol.getByText("Заявка на рассмотрении")).toBeVisible();

  const admin = await asUser(browser, "alice");
  await admin.goto("/admin/applications");
  const card = admin.locator("li", { hasText: "Carol_E2E" });
  await card.getByRole("button", { name: "Отклонить" }).click();
  await expect(admin.getByText("Укажите причину отклонения.")).toBeVisible();
  await card
    .getByLabel("Причина (обязательна при отклонении)")
    .fill("Мало информации");
  await card.getByRole("button", { name: "Отклонить" }).click();
  await expect(admin.getByText("Решение сохранено.")).toBeVisible();

  await carol.goto("/onboarding/minecraft");
  await expect(carol.getByText("Причина: Мало информации")).toBeVisible();

  // within 7 days a new application is refused
  await carol.getByRole("button", { name: "Подать заявку" }).click();
  await expect(
    carol.getByText(
      "Повторно подать заявку можно через 7 дней после отклонения.",
    ),
  ).toBeVisible();

  // a player cannot open the admin area
  await carol.goto("/admin/applications");
  await expect(carol).toHaveURL(/localhost:\d+\/$/);

  // after the retry window, a new application is approved
  const id = await userId("carol");
  await db
    .from("applications")
    .update({ decided_at: new Date(Date.now() - 8 * 86_400_000).toISOString() })
    .eq("user_id", id);
  await carol.goto("/onboarding/minecraft");
  await carol.getByRole("button", { name: "Подать заявку" }).click();
  await admin.goto("/admin/applications");
  await admin
    .locator("li", { hasText: "Carol_E2E" })
    .getByRole("button", { name: "Одобрить" })
    .click();
  await expect(admin.getByText("Решение сохранено.")).toBeVisible();

  await carol.goto("/dashboard");
  await expect(carol.getByText("Допуск получен")).toBeVisible();
});
