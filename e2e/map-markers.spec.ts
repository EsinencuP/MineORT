import { createHmac, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type Page } from "@playwright/test";

// Markers on the map as players use them: put one with a right click, choose an icon and a colour,
// find it in the list, and see a public one wait for a moderator. Needs FF_P1C and FF_P1C_ATLAS on,
// test login enabled and the staging keys.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const secret = process.env.TEST_LOGIN_SECRET;
const enabled =
  !!url &&
  !!key &&
  !!secret &&
  process.env.TEST_LOGIN_ENABLED === "true" &&
  process.env.FF_P1C === "true" &&
  process.env.FF_P1C_ATLAS === "true";

test.skip(!enabled, "needs staging, test login and the atlas flags");
test.describe.configure({ mode: "serial", timeout: 90_000 });
test.beforeEach(async ({}, info) => {
  test.skip(info.project.name !== "desktop", "one project is enough");
});

const db = enabled
  ? createClient(url!, key!, { auth: { persistSession: false } })
  : null!;
const TG = { bob: "9990000002", carol: "9990000003" } as const;
type Who = keyof typeof TG;
const ids = {} as Record<Who, string>;
const NAME = `Шахта ${Date.now().toString(36)}`;

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
async function asMember(browser: Browser, who: Who): Promise<Page> {
  const page = await (
    await browser.newContext({ baseURL: test.info().project.use.baseURL })
  ).newPage();
  await page.goto(loginUrl(who));
  await expect(page).toHaveURL(/\/dashboard/);
  const { data } = await db
    .from("telegram_identities")
    .select("user_id")
    .eq("telegram_id", TG[who])
    .single();
  ids[who] = data!.user_id as string;
  await db.from("access_memberships").delete().eq("user_id", ids[who]);
  await db.from("access_memberships").insert({
    user_id: ids[who],
    status: "approved",
    decided_at: new Date().toISOString(),
  });
  return page;
}

test.afterAll(async () => {
  const all = Object.values(ids);
  if (!all.length) return;
  await db.from("moderation_reports").delete().in("reporter_id", all);
  await db.from("map_markers").delete().in("author_id", all);
  await db.from("access_memberships").delete().in("user_id", all);
  await db.from("rate_limit_counters").delete().like("key", "map:marker:%");
});

test("a member puts a marker, styles it and finds it in the list", async ({
  browser,
}) => {
  const page = await asMember(browser, "bob");
  // the map learns what this viewer may do from its first marker request
  const ready = page.waitForResponse(/\/api\/map\/markers\?dim=/);
  await page.goto("/map");
  await ready;
  const canvas = page.getByRole("img", { name: /Карта мира/ });
  const box = (await canvas.boundingBox())!;
  await canvas.click({
    button: "right",
    position: { x: box.width / 2 + 40, y: box.height / 2 },
  });

  const editor = page.getByRole("dialog", { name: "Новая метка" });
  await expect(editor).toBeVisible();
  await editor.getByLabel("Название").fill(NAME);
  await editor.getByRole("button", { name: /Иконка:/ }).click();
  const picker = page.getByRole("dialog", { name: /Выберите иконку/ });
  await picker.getByLabel("Поиск иконки").fill("шахта");
  await picker.getByRole("button", { name: "Шахта" }).first().click();
  await editor.getByRole("button", { name: /Цвет иконки/ }).click();
  await page.getByRole("button", { name: "Цвет #b03a2e" }).click();
  await editor.getByLabel("Описание").fill("Алмазы глубоко внизу");
  await editor.getByRole("button", { name: "Сохранить" }).click();

  const card = page.getByRole("dialog", { name: `Метка: ${NAME}` });
  await expect(card).toBeVisible();
  await expect(card).toContainText("Личная");
  await expect(card).toContainText("Алмазы глубоко внизу");

  const { data } = await db
    .from("map_markers")
    .select("icon, color, visibility, moderation_status")
    .eq("name", NAME)
    .single();
  expect(data).toMatchObject({
    icon: "mine",
    color: "#b03a2e",
    visibility: "private",
    moderation_status: "approved",
  });

  await page.getByRole("button", { name: /Список меток/ }).click();
  const list = page.getByRole("region", { name: "Список меток" });
  await list.getByLabel("Поиск меток").fill("алмазы");
  await expect(
    list.getByRole("button", { name: new RegExp(NAME) }),
  ).toBeVisible();
  await list.getByLabel("Поиск меток").fill("нет такого");
  await expect(list).toContainText("Ничего не найдено.");
});

test("a public marker waits for a moderator and others cannot see it yet", async ({
  browser,
}) => {
  const bob = await asMember(browser, "bob");
  await bob.goto("/map");
  await bob.getByRole("button", { name: /Список меток/ }).click();
  await bob
    .getByRole("region", { name: "Список меток" })
    .getByRole("button", { name: new RegExp(NAME) })
    .click();
  await bob.getByRole("button", { name: "Настроить" }).click();
  await bob
    .getByRole("dialog", { name: "Настройка метки" })
    .getByRole("button", { name: "Все", exact: true })
    .click();
  await bob.getByRole("button", { name: "Сохранить" }).click();
  await expect(bob.getByText("Ждёт проверки модератором")).toBeVisible({
    timeout: 20_000,
  });

  const carol = await asMember(browser, "carol");
  const res = await carol.request.get("/api/map/markers?dim=overworld");
  const names = ((await res.json()).markers as { name: string }[]).map(
    (m) => m.name,
  );
  expect(names).not.toContain(NAME);

  // after the approval Carol sees it and may complain about it
  await db
    .from("map_markers")
    .update({ moderation_status: "approved" })
    .eq("name", NAME);
  const { data } = await db
    .from("map_markers")
    .select("id")
    .eq("name", NAME)
    .single();
  await carol.goto(`/map?m=${data!.id}`);
  const card = carol.getByRole("dialog", { name: `Метка: ${NAME}` });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Пожаловаться" }).click();
  await carol.getByLabel("Что не так с этой меткой?").fill("Ложная метка");
  await carol.getByRole("button", { name: "Отправить" }).click();
  await expect(carol.getByText("Жалоба отправлена модераторам.")).toBeVisible();
});

test("a guest may not put markers and the API refuses writes from elsewhere", async ({
  page,
  request,
}) => {
  const ready = page.waitForResponse(/\/api\/map\/markers\?dim=/);
  await page.goto("/map");
  await ready;
  const canvas = page.getByRole("img", { name: /Карта мира/ });
  await canvas.click({ button: "right", position: { x: 300, y: 300 } });
  await expect(page.getByText("Войдите, чтобы ставить метки.")).toBeVisible();
  const forged = await request.post("/api/map/markers", {
    headers: { "content-type": "text/plain", "sec-fetch-site": "cross-site" },
    data: "x",
  });
  expect(forged.status()).toBe(403);
});
