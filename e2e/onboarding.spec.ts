import { createHmac, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type Page } from "@playwright/test";

// Landing, CTA by stage, connection wizard and Guidebook against a real staging database.
// Needs the service key and the test-login secret; skipped otherwise. Seed: npm run seed:test && npm run seed:guides.
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
const ADDRESS = "play.example.test:25565";
const TG = { alice: "9990000001", carol: "9990000003" } as const;
type Who = keyof typeof TG;
const major = Math.floor(Date.now() / 1000) + 5_000_000; // newer than the access spec's version

function loginUrl(u: string) {
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
async function userId(who: Who) {
  const { data } = await db
    .from("telegram_identities")
    .select("user_id")
    .eq("telegram_id", TG[who])
    .single();
  return data!.user_id as string;
}
async function reset() {
  const ids = [await userId("alice"), await userId("carol")];
  await db.from("whitelist_entries").delete().in("user_id", ids);
  await db.from("access_memberships").delete().in("user_id", ids);
  await db.from("invitation_redemptions").delete().in("user_id", ids);
  await db.from("applications").delete().in("user_id", ids);
  await db.from("minecraft_identities").delete().in("user_id", ids);
  await db.from("rules_acceptances").delete().in("user_id", ids);
  await db.from("rules_versions").delete().gte("version_major", major);
  await db.from("site_settings").delete().eq("key", "server_address");
  await db.from("guide_articles").delete().like("slug", "e2e-%");
}

test.beforeAll(async () => {
  await reset();
  const { data } = await db
    .from("users")
    .select("id")
    .eq("id", await userId("alice"))
    .single();
  await db.rpc("publish_rules_version", {
    p_actor: data!.id,
    p_major: major,
    p_minor: 0,
    p_body: "Правило первое. Правило второе.",
  });
  await db
    .from("site_settings")
    .upsert({ key: "server_address", value: ADDRESS });
});
test.afterAll(reset);

test("guest sees the landing page: main CTA, rules block, server status", async ({
  page,
}) => {
  await page.goto("/");
  const cta = page
    .getByRole("main")
    .getByRole("link", { name: "Начать играть" });
  await expect(cta).toBeVisible();
  await expect(cta).toHaveAttribute("href", /\/login\?return_to=/);
  await expect(
    page.getByRole("heading", { name: "Правила сервера" }),
  ).toBeVisible();
  await expect(page.getByText("Правило первое.")).toBeVisible();
  await expect(
    page.getByText(
      /Сервер в сети|Сервер недоступен|Статус сервера уточняется|временно закрыт/,
    ),
  ).toBeVisible();
});

test("the main CTA follows onboarding_stage without logging in again", async ({
  browser,
}) => {
  const carol = await asUser(browser, "carol");
  await carol.goto("/");
  await expect(
    carol.getByRole("main").getByRole("link", { name: "Принять правила" }),
  ).toHaveAttribute("href", "/onboarding/minecraft");

  const id = await userId("carol");
  const { data: rules } = await db
    .from("rules_versions")
    .select("id")
    .eq("version_major", major)
    .single();
  await db
    .from("rules_acceptances")
    .insert({ user_id: id, rules_version_id: rules!.id });
  await carol.goto("/");
  await expect(
    carol.getByRole("link", { name: "Указать ник и получить доступ" }),
  ).toBeVisible();

  await db
    .from("minecraft_identities")
    .insert({ user_id: id, nickname: "E2eCarol" });
  await carol.goto("/");
  await expect(
    carol.getByRole("link", { name: "Продолжить регистрацию" }),
  ).toBeVisible();

  const { data: app } = await db
    .from("applications")
    .insert({ user_id: id, status: "pending", text: "x" })
    .select("id")
    .single();
  await carol.goto("/");
  await expect(
    carol.getByRole("link", { name: "Заявка на рассмотрении" }),
  ).toHaveAttribute("href", "/dashboard");
  await db
    .from("applications")
    .update({ status: "withdrawn" })
    .eq("id", app!.id);
});

test("the wizard cannot be skipped: access forms stay closed until rules and nickname are done", async ({
  browser,
}) => {
  await db
    .from("rules_acceptances")
    .delete()
    .eq("user_id", await userId("carol"));
  await db
    .from("minecraft_identities")
    .delete()
    .eq("user_id", await userId("carol"));
  const carol = await asUser(browser, "carol");
  await carol.goto("/onboarding/minecraft");
  await expect(
    carol.getByText("Сначала примите правила сервера (шаг 2)."),
  ).toBeVisible();
  await expect(
    carol.getByRole("button", { name: "Подать заявку" }),
  ).toHaveCount(0);
  await expect(
    carol.getByText(
      "Этот шаг откроется, когда вы примете правила и укажете ник.",
    ),
  ).toBeVisible();
});

test("server address and 'can connect' appear only after the whitelist is applied", async ({
  browser,
  page,
}) => {
  // guest: wizard is open, address is not
  await page.goto("/start");
  await expect(
    page.getByRole("heading", { name: "Установка и подключение" }),
  ).toBeVisible();
  expect(await page.content()).not.toContain(ADDRESS);

  // approved, but the server has not confirmed yet
  const id = await userId("carol");
  const { data: rules } = await db
    .from("rules_versions")
    .select("id")
    .eq("version_major", major)
    .single();
  await db
    .from("rules_acceptances")
    .upsert(
      { user_id: id, rules_version_id: rules!.id },
      { onConflict: "user_id,rules_version_id" },
    );
  await db
    .from("minecraft_identities")
    .insert({ user_id: id, nickname: "E2eCarol" });
  await db.from("access_memberships").insert({
    user_id: id,
    status: "approved",
    decided_at: new Date().toISOString(),
  });
  await db.from("whitelist_entries").insert({
    user_id: id,
    nickname: "E2eCarol",
    desired: "on",
    applied_state: "pending",
  });
  const carol = await asUser(browser, "carol");
  await carol.goto("/start");
  await expect(
    carol
      .getByRole("status")
      .getByText(/Доступ подготавливается/)
      .first(),
  ).toBeVisible();
  await expect(carol.getByText("Можно подключаться")).toHaveCount(0);
  expect(await carol.content()).not.toContain(ADDRESS);
  await carol.goto("/");
  await expect(
    carol.getByRole("link", { name: "Доступ подготавливается" }),
  ).toHaveAttribute("href", "/start");

  // the server confirms: now the address is shown
  await db
    .from("whitelist_entries")
    .update({ applied_state: "applied" })
    .eq("user_id", id);
  await carol.goto("/start");
  await expect(carol.getByText("Можно подключаться")).toBeVisible();
  await expect(carol.getByText(ADDRESS)).toBeVisible();
  await carol.goto("/");
  await expect(
    carol.getByRole("link", { name: "Установить сборку и подключиться" }),
  ).toBeVisible();

  // drift drops the player back to "preparing" and hides the address again
  await db
    .from("whitelist_entries")
    .update({ applied_state: "drift" })
    .eq("user_id", id);
  await carol.goto("/start");
  expect(await carol.content()).not.toContain(ADDRESS);
});

test("a player is warned when the build is outdated", async ({ page }) => {
  await db
    .from("site_settings")
    .upsert([{ key: "client_build_version", value: "2.0.0" }]);
  await page.goto("/start?my_build=1.0.0");
  await expect(page.getByText(/Ваша сборка 1.0.0 устарела/)).toBeVisible();
  await page.goto("/start?my_build=2.0.0");
  await expect(page.getByText("Версия сборки актуальна")).toBeVisible();
  await db.from("site_settings").delete().eq("key", "client_build_version");
});

test("Guidebook: categories, search, 'not found' and a real 404", async ({
  page,
  request,
}) => {
  await page.goto("/guide");
  await expect(
    page.getByRole("heading", { name: "Установка и вход" }),
  ).toBeVisible();
  await page.getByLabel("Поиск по Гайдбуку").fill("установить");
  await page.getByRole("button", { name: "Найти" }).click();
  await expect(
    page.getByRole("link", { name: /Как установить сборку/ }),
  ).toBeVisible();
  await page.getByRole("link", { name: /Как установить сборку/ }).click();
  await expect(
    page.getByRole("heading", { name: "Как установить сборку" }),
  ).toBeVisible();

  await page.goto("/guide?q=zzzнетакого");
  await expect(page.getByText("Ничего не найдено")).toBeVisible();
  await page.goto("/guide?q=%25_%2C()");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible(); // control characters do not break the page

  expect((await request.get("/guide/no-such-article")).status()).toBe(404);
  expect((await request.get("/guide/Bad..Slug")).status()).toBe(404);
});

test("an admin edits the Guidebook without a code release; a draft is a 404; edits are audited", async ({
  browser,
  request,
}) => {
  const admin = await asUser(browser, "alice");
  await admin.goto("/admin/guides/new");
  await admin.getByLabel("Заголовок").fill("E2E статья");
  await admin.getByLabel("Адрес (slug)").fill("e2e-draft");
  await admin.getByLabel("Текст").fill("Черновик для проверки.");
  await admin.getByRole("button", { name: "Сохранить" }).click();
  await expect(admin.getByText("Статья сохранена.")).toBeVisible();
  expect((await request.get("/guide/e2e-draft")).status()).toBe(404); // unpublished

  await admin.getByRole("link", { name: "E2E статья" }).click();
  await admin.getByLabel("Дата проверки").fill("2026-12-01");
  await admin.getByLabel("Опубликовать").check();
  await admin.getByRole("button", { name: "Сохранить" }).click();
  await expect(admin.getByText("Статья сохранена.")).toBeVisible(); // wait for the save to finish
  expect((await request.get("/guide/e2e-draft")).status()).toBe(200);

  const reader = await browser.newPage({
    baseURL: test.info().project.use.baseURL,
  });
  await reader.goto("/guide/e2e-draft");
  await expect(reader.getByText("Проверено: 01.12.2026")).toBeVisible();

  await admin.goto("/admin/guides");
  await admin.getByLabel("Версия сборки").fill("9.9.9");
  await admin.getByRole("button", { name: "Сохранить настройки" }).click();
  await expect(admin.getByText("Настройки сохранены.")).toBeVisible();
  await db.from("site_settings").delete().eq("key", "client_build_version");

  await admin.goto("/admin/audit");
  await expect(admin.getByText("guide.created").first()).toBeVisible();
  await expect(admin.getByText("settings.updated").first()).toBeVisible();

  // a player cannot open the editor
  const carol = await asUser(browser, "carol");
  await carol.goto("/admin/guides");
  await expect(carol).toHaveURL(/localhost:\d+\/$/);
});
