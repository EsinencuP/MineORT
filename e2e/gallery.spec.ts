import { createHmac, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { adminCode, ensureAdminTotp } from "./support";

// The gallery end to end against a real staging database and storage: upload with captions and a
// category, filters, the viewer with neighbours, hiding, editing, reports and moderation, reuse in a
// post and deletion with a warning, plus the profile and home strips. Needs FF_P1A=true.
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
} as const;
type Who = keyof typeof TG;
const RUN = Date.now().toString(36);
const NICK = `Gal_${RUN}`.slice(0, 16);
const CAP1 = `Закат над озером ${RUN}`;
const CAP2 = `Башня из камня ${RUN}`;
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
async function guestPage(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
  });
  return ctx.newPage();
}
const png = (color: string) =>
  sharp({ create: { width: 80, height: 60, channels: 3, background: color } })
    .png()
    .toBuffer();

async function wipe() {
  const all = Object.values(ids);
  const { data: media } = await db
    .from("media")
    .select("id, storage_key")
    .in("uploader_id", all);
  if (media?.length) {
    await db.storage.from("media").remove(media.map((m) => m.storage_key));
    await db
      .from("media")
      .delete()
      .in(
        "id",
        media.map((m) => m.id),
      );
  }
  await db.from("moderation_reports").delete().in("reporter_id", all);
  await db.from("posts").delete().in("author_id", all);
}
/** Status of the direct image URL for this browser, polled until the page action has been applied. */
const mediaStatus = (page: Page, id: string) => async () =>
  (await page.request.get(`/api/media/${id}`, { maxRedirects: 0 })).status();

async function mediaIdOf(caption: string) {
  const { data } = await db
    .from("media_attachments")
    .select("media_id")
    .eq("target_type", "gallery")
    .eq("caption", caption)
    .single();
  return data!.media_id as string;
}

test.beforeAll(async () => {
  for (const who of Object.keys(TG) as Who[]) {
    const { data } = await db
      .from("telegram_identities")
      .select("user_id")
      .eq("telegram_id", TG[who])
      .single();
    ids[who] = data!.user_id as string;
  }
  await db.from("users").update({ site_role: "admin" }).eq("id", ids.alice);
  await ensureAdminTotp(db, ids.alice);
  await adminCode(db, ids.alice);
  await wipe();
  for (const id of [ids.bob, ids.carol]) {
    await db.from("access_memberships").delete().eq("user_id", id);
    await db.from("minecraft_identities").delete().eq("user_id", id);
  }
  await db
    .from("minecraft_identities")
    .insert({ user_id: ids.bob, nickname: NICK });
  await db.from("access_memberships").insert({
    user_id: ids.bob,
    status: "approved",
    decided_at: new Date().toISOString(),
  });
  await db.from("rate_limit_counters").delete().like("key", "upload:%");
  await db.from("rate_limit_counters").delete().like("key", "post:%");
});
test.afterAll(async () => {
  await wipe();
  await db.from("access_memberships").delete().eq("user_id", ids.bob);
  await db.from("minecraft_identities").delete().eq("user_id", ids.bob);
});

test("a member uploads two screenshots with captions and a category; the storage meter shows", async ({
  browser,
}) => {
  const bob = await asUser(browser, "bob");
  await bob.goto("/social/gallery?mine=1");
  await bob.locator('input[type="file"]').setInputFiles([
    { name: "a.png", mimeType: "image/png", buffer: await png("#e65100") },
    { name: "b.png", mimeType: "image/png", buffer: await png("#546e7a") },
  ]);
  await expect(bob.getByText("Готово", { exact: true })).toHaveCount(2);
  const captions = bob.locator('input[name="caption"]');
  await captions.nth(0).fill(CAP1);
  await captions.nth(1).fill(CAP2);
  await bob.locator("#up-cat").selectOption("landscape");
  await bob.getByRole("button", { name: "Добавить в галерею" }).click();
  await expect(bob.getByText("Скриншоты добавлены.")).toBeVisible();
  await expect(bob.getByText(CAP1)).toBeVisible();
  await expect(bob.getByText(CAP2)).toBeVisible();
  await expect(bob.getByText(/Занято .* из 500\.0 МБ/)).toBeVisible();
  const { data: rows } = await db
    .from("media_attachments")
    .select("caption, category")
    .eq("target_type", "gallery")
    .in("caption", [CAP1, CAP2]);
  expect(rows).toHaveLength(2);
  expect(rows!.every((r) => r.category === "landscape")).toBe(true);
});

test("a guest filters by category, author and period, opens the viewer and pages with the keyboard", async ({
  browser,
}) => {
  const guest = await guestPage(browser);
  await guest.goto("/social/gallery");
  await expect(guest.getByText(CAP1)).toBeVisible();
  await expect(guest.getByText(CAP2)).toBeVisible();
  await expect(guest.getByRole("link", { name: "Мои" })).toHaveCount(0);

  await guest.getByRole("link", { name: "Пейзажи", exact: true }).click();
  await expect(guest.getByText(CAP1)).toBeVisible();
  await guest.goto("/social/gallery?category=funny");
  await expect(
    guest.getByText("По выбранным условиям ничего не найдено"),
  ).toBeVisible();
  await guest.goto(`/social/gallery?author=${NICK}`);
  await expect(guest.getByText(CAP2)).toBeVisible();
  await guest.goto("/social/gallery?author=Nobody_x");
  await expect(
    guest.getByText("По выбранным условиям ничего не найдено"),
  ).toBeVisible();
  await guest.goto(`/social/gallery?author=${NICK}&since=week&sort=old`);
  await expect(guest.getByText(CAP1)).toBeVisible();

  // the viewer: caption, author, a neighbour on one side, keyboard navigation
  const second = await mediaIdOf(CAP2); // uploaded last = newest
  await guest.goto(`/social/gallery/${second}`);
  await expect(guest.getByRole("heading", { name: CAP2 })).toBeVisible();
  await expect(guest.getByRole("link", { name: NICK })).toBeVisible();
  await expect(guest.getByRole("link", { name: /Старее/ })).toBeVisible();
  await guest.waitForLoadState("networkidle"); // the key handler is attached after hydration
  await guest.keyboard.press("ArrowRight");
  await expect(guest.getByRole("heading", { name: CAP1 })).toBeVisible();
  await guest.waitForLoadState("networkidle");
  await guest.keyboard.press("ArrowLeft");
  await expect(guest.getByRole("heading", { name: CAP2 })).toBeVisible();
  await guest.waitForLoadState("networkidle");
  await guest.keyboard.press("Escape");
  await expect(guest).toHaveURL(/\/social\/gallery$/);
});

test("the owner edits a caption, then hides an image: it disappears for everyone else at once", async ({
  browser,
}) => {
  const bob = await asUser(browser, "bob");
  await bob.goto("/social/gallery?mine=1");
  const card = bob.locator("li", { hasText: CAP2 });
  await card.locator("summary", { hasText: "Изменить" }).click();
  await card.getByLabel("Подпись").fill(`${CAP2} (новая)`);
  await card.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(bob.getByText("Изменения сохранены.")).toBeVisible();
  await expect(bob.getByText(`${CAP2} (новая)`)).toBeVisible();

  const id = await mediaIdOf(`${CAP2} (новая)`);
  const guest = await guestPage(browser);
  expect(
    (await guest.request.get(`/api/media/${id}`, { maxRedirects: 0 })).status(),
  ).toBe(200);

  const again = bob.locator("li", { hasText: CAP2 });
  await again.locator("summary", { hasText: "Изменить" }).click();
  await again.getByLabel("Видимость").selectOption("private");
  await again.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(bob.getByText("Изменения сохранены.")).toBeVisible();
  await expect.poll(mediaStatus(guest, id)).toBe(404);
  expect((await guest.request.get(`/social/gallery/${id}`)).status()).toBe(404);
  await guest.goto("/social/gallery");
  await expect(guest.getByText(CAP2)).toHaveCount(0);
  // the owner still opens it
  await bob.goto(`/social/gallery/${id}`);
  await expect(bob.getByText("Только автор")).toBeVisible();
  // and brings it back
  await bob.goto("/social/gallery?mine=1");
  const back = bob.locator("li", { hasText: CAP2 });
  await back.locator("summary", { hasText: "Изменить" }).click();
  await back.getByLabel("Видимость").selectOption("public");
  await back.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect.poll(mediaStatus(guest, id)).toBe(200);
});

test("a player reports an image, the moderator hides it with a reason, the author sees why", async ({
  browser,
}) => {
  const id = await mediaIdOf(CAP1);
  const carol = await asUser(browser, "carol");
  await carol.goto(`/social/gallery/${id}`);
  await carol.getByText("Пожаловаться").click();
  await carol.getByLabel("Что не так?").fill("Чужой скриншот из другой игры");
  await carol.getByRole("button", { name: "Отправить жалобу" }).click();
  await expect(carol.getByText(/Жалоба отправлена/)).toBeVisible();
  await carol.getByText("Пожаловаться").click();
  await carol.getByLabel("Что не так?").fill("Ещё раз");
  await carol.getByRole("button", { name: "Отправить жалобу" }).click();
  await expect(
    carol.getByText("Вы уже отправили жалобу на эту публикацию."),
  ).toBeVisible();

  // the owner has no report button on their own image
  const bob = await asUser(browser, "bob");
  await bob.goto(`/social/gallery/${id}`);
  await expect(bob.getByText("Пожаловаться")).toHaveCount(0);

  const alice = await asUser(browser, "alice");
  await alice.goto("/admin/moderation");
  const item = alice.locator("li", {
    hasText: "Чужой скриншот из другой игры",
  });
  await expect(item.getByText("Жалоба на изображение")).toBeVisible();
  await expect(
    item.getByAltText("Изображение, на которое пожаловались"),
  ).toBeVisible();
  await item.getByRole("button", { name: "Скрыть" }).click();
  await expect(
    alice.getByText("Укажите причину (не короче 3 символов)."),
  ).toBeVisible();
  await alice
    .locator("li", { hasText: "Чужой скриншот" })
    .getByLabel(/Комментарий/)
    .fill("Не со нашего сервера");
  await alice
    .locator("li", { hasText: "Чужой скриншот" })
    .getByRole("button", { name: "Скрыть" })
    .click();
  await expect(alice.getByText("Решение сохранено.")).toBeVisible();

  const guest = await guestPage(browser);
  expect(
    (await guest.request.get(`/api/media/${id}`, { maxRedirects: 0 })).status(),
  ).toBe(404);
  expect((await guest.request.get(`/social/gallery/${id}`)).status()).toBe(404);
  await bob.goto("/social/gallery?mine=1");
  await expect(bob.getByText("Скрыто модерацией").first()).toBeVisible();
  await expect(bob.getByText("Причина: Не со нашего сервера")).toBeVisible();

  // the moderator brings it back from the viewer
  await alice.goto(`/social/gallery/${id}`);
  await alice.getByRole("button", { name: "Вернуть" }).click();
  await expect(alice.getByText("Решение модератора сохранено.")).toBeVisible();
  expect(
    (await guest.request.get(`/api/media/${id}`, { maxRedirects: 0 })).status(),
  ).toBe(200);
  const { data: audit } = await db
    .from("audit_log")
    .select("action")
    .in("action", ["media.hidden_by_moderator", "media.approved"]);
  expect(audit!.length).toBeGreaterThanOrEqual(2);
});

test("an image can be reused in a post; deleting it warns, removes it everywhere and keeps the post text", async ({
  browser,
}) => {
  const id = await mediaIdOf(CAP1);
  const bob = await asUser(browser, "bob");
  await bob.goto("/social");
  await bob
    .getByLabel("Чем хочешь поделиться?")
    .fill(`Пост с картинкой ${RUN}`);
  await bob.getByText("Выбрать из моей галереи").click();
  await bob.getByAltText(CAP1).click();
  await bob.getByRole("button", { name: "Опубликовать" }).click();
  await expect(bob.getByText("Опубликовано.")).toBeVisible();
  const post = bob.locator("[data-post-id]", {
    hasText: `Пост с картинкой ${RUN}`,
  });
  await expect(post.getByAltText("Изображение к публикации")).toBeVisible();

  await bob.goto("/social/gallery?mine=1");
  const card = bob.locator("li", { hasText: CAP1 });
  await expect(card.getByText(/Пейзажи · в публикациях: 1/)).toBeVisible();
  await card.locator("summary", { hasText: "Удалить" }).click();
  await expect(card.getByText(/используется в публикациях: 1/)).toBeVisible();
  await card.getByRole("button", { name: "Удалить изображение" }).click();
  await expect(bob.getByText("Изображение удалено.")).toBeVisible();

  expect(
    (await bob.request.get(`/api/media/${id}`, { maxRedirects: 0 })).status(),
  ).toBe(404);
  await bob.goto("/social");
  const kept = bob.locator("[data-post-id]", {
    hasText: `Пост с картинкой ${RUN}`,
  });
  await expect(kept).toBeVisible();
  await expect(kept.getByAltText("Изображение к публикации")).toHaveCount(0);
  const { data: m } = await db
    .from("media")
    .select("deleted_at, purge_after")
    .eq("id", id)
    .single();
  expect(m!.deleted_at).not.toBeNull();
  expect(m!.purge_after).not.toBeNull();
});

test("the player profile and the home page show gallery strips", async ({
  browser,
}) => {
  const guest = await guestPage(browser);
  await guest.goto("/");
  await expect(guest.getByText("Из галереи сообщества")).toBeVisible();
  await guest.getByRole("link", { name: "Открыть галерею" }).click();
  await expect(guest).toHaveURL(/\/social\/gallery$/);
  await guest.goto(`/players/${NICK}`);
  await expect(guest.getByRole("heading", { name: "Скриншоты" })).toBeVisible();
  await expect(
    guest.getByRole("link", { name: "Все скриншоты игрока" }),
  ).toBeVisible();
});

test("a disguised SVG is refused in the gallery and nothing is added", async ({
  browser,
}) => {
  const bob = await asUser(browser, "bob");
  await bob.goto("/social/gallery?mine=1");
  const before = (
    await db
      .from("media")
      .select("id", { count: "exact", head: true })
      .eq("uploader_id", ids.bob)
  ).count;
  await bob.locator('input[type="file"]').setInputFiles({
    name: "trap.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>',
    ),
  });
  await expect(bob.getByText("Готово", { exact: true })).toBeVisible();
  await bob.getByRole("button", { name: "Добавить в галерею" }).click();
  await expect(
    bob.getByText(/Допустимы только JPEG, PNG и WebP|Не удалось прочитать/),
  ).toBeVisible();
  const after = (
    await db
      .from("media")
      .select("id", { count: "exact", head: true })
      .eq("uploader_id", ids.bob)
  ).count;
  expect(after).toBe(before);
});

test("a player without admission has no upload or edit controls", async ({
  browser,
}) => {
  const carol = await asUser(browser, "carol");
  await carol.goto("/social/gallery");
  await expect(carol.getByRole("link", { name: "Мои" })).toHaveCount(0);
  await carol.goto("/social/gallery?mine=1"); // the tab is not offered; the page falls back to the public gallery
  await expect(carol.locator('input[type="file"]')).toHaveCount(0);
  expect((await carol.request.post("/api/social/upload-url")).status()).toBe(
    403,
  );
});
