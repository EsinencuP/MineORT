import { createHmac, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { adminCode, ensureAdminTotp } from "./support";

// Social wave P1a against a real staging database and storage: publishing with a screenshot, upload
// checks, visibility by role, news, reports and moderation, deletion, reactions and rate limits.
// Needs FF_P1A=true for the app under test.
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

test.skip(!enabled, "needs staging, test-login secret, keys and FF_P1A=true");
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
const TAG = `e2e-${Date.now()}`;

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
async function userId(who: Who) {
  const { data } = await db
    .from("telegram_identities")
    .select("user_id")
    .eq("telegram_id", TG[who])
    .single();
  return data!.user_id as string;
}
const png = (color = "#4caf50") =>
  sharp({ create: { width: 64, height: 48, channels: 3, background: color } })
    .png()
    .toBuffer();

async function wipe() {
  const ids = await Promise.all(
    (["alice", "bob", "carol"] as Who[]).map(userId),
  );
  const { data: media } = await db
    .from("media")
    .select("id, storage_key")
    .in("uploader_id", ids);
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
  await db.from("moderation_reports").delete().in("reporter_id", ids);
  await db.from("posts").delete().in("author_id", ids);
}

let bobId = "";
test.beforeAll(async () => {
  const alice = await userId("alice");
  await db.from("users").update({ site_role: "admin" }).eq("id", alice);
  await ensureAdminTotp(db, alice);
  await adminCode(db, alice);
  bobId = await userId("bob");
  const carol = await userId("carol");
  await wipe();
  for (const id of [bobId, carol])
    await db.from("access_memberships").delete().eq("user_id", id);
  await db.from("access_memberships").insert({
    user_id: bobId,
    status: "approved",
    decided_at: new Date().toISOString(),
  });
  await db.from("rate_limit_counters").delete().like("key", "post:%");
  await db.from("rate_limit_counters").delete().like("key", "upload:%");
});
test.afterAll(async () => {
  await wipe();
  await db.from("access_memberships").delete().eq("user_id", bobId);
});

async function publish(
  page: Page,
  text: string,
  opts: { image?: Buffer; private?: boolean } = {},
) {
  await page.goto("/social");
  await page.getByLabel("Чем хочешь поделиться?").fill(text);
  if (opts.image) {
    await page.locator('input[type="file"]').setInputFiles({
      name: "shot.png",
      mimeType: "image/png",
      buffer: opts.image,
    });
    await expect(page.getByText("Готово", { exact: true })).toBeVisible();
  }
  if (opts.private) await page.getByLabel("Только я").check();
  const [submitted] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/social",
    ),
    page.getByRole("button", { name: "Опубликовать" }).click(),
  ]);
  await submitted.finished();
}

test("a member publishes and reloads a text-only post", async ({ browser }) => {
  const bob = await asUser(browser, "bob");
  const text = `Текстовая запись ${TAG}`;
  await publish(bob, text);
  await expect(bob.getByText("Опубликовано.")).toBeVisible();
  await bob.goto("/social");
  await expect(bob.locator("[data-post-id]", { hasText: text })).toBeVisible();
});

test("a member publishes a post with a screenshot; the file is re-encoded to WebP", async ({
  browser,
}) => {
  const bob = await asUser(browser, "bob");
  await publish(bob, `Моя стройка ${TAG}`, { image: await png() });
  await expect(bob.getByText("Опубликовано.")).toBeVisible();
  const card = bob.locator("[data-post-id]", { hasText: `Моя стройка ${TAG}` });
  await expect(card).toBeVisible();
  const src = await card
    .getByRole("img", { name: "Открыть изображение к публикации" })
    .getAttribute("src");
  const res = await bob.request.get(src!);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("image/webp");
  const { data: m } = await db
    .from("media")
    .select("mime")
    .eq("uploader_id", bobId);
  expect(m?.[0].mime).toBe("image/webp");
});

test("a disguised SVG is refused and no post is created", async ({
  browser,
}) => {
  const bob = await asUser(browser, "bob");
  await bob.goto("/social");
  await bob.getByLabel("Чем хочешь поделиться?").fill(`Ловушка ${TAG}`);
  await bob.locator('input[type="file"]').setInputFiles({
    name: "trap.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>',
    ),
  });
  await expect(bob.getByText("Готово", { exact: true })).toBeVisible();
  await bob.getByRole("button", { name: "Опубликовать" }).click();
  await expect(
    bob.getByText(/Допустимы только JPEG, PNG и WebP|Не удалось прочитать/),
  ).toBeVisible();
  await expect(bob.getByText(`Ловушка ${TAG}`, { exact: false })).toHaveCount(
    0,
  );
  const { count } = await db
    .from("posts")
    .select("id", { count: "exact", head: true })
    .like("body", `%Ловушка ${TAG}%`);
  expect(count).toBe(0);
});

test("visibility: guest sees only news; a player without admission reads but cannot publish; private stays private", async ({
  browser,
}) => {
  const bob = await asUser(browser, "bob");
  await publish(bob, `Секрет ${TAG}`, {
    image: await png("#222222"),
    private: true,
  });
  await expect(bob.getByText("Опубликовано.")).toBeVisible();
  const privSrc = await bob
    .locator("[data-post-id]", { hasText: `Секрет ${TAG}` })
    .getByRole("img", { name: "Открыть изображение к публикации" })
    .getAttribute("src");

  const alice = await asUser(browser, "alice");
  await alice.goto("/social");
  await alice.getByLabel("Чем хочешь поделиться?").fill(`Новость ${TAG}`);
  await alice.getByLabel("Официальная новость").check();
  await alice.getByLabel("Закрепить").check();
  await alice.getByRole("button", { name: "Опубликовать" }).click();
  await expect(alice.getByText("Опубликовано.")).toBeVisible();

  // guest: only the news, a login prompt, and no private media
  const guestCtx = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
  });
  const guest = await guestCtx.newPage();
  await guest.goto("/social");
  await expect(guest.getByText(`Новость ${TAG}`)).toBeVisible();
  await expect(guest.getByText(`Моя стройка ${TAG}`)).toHaveCount(0);
  await expect(
    guest.getByRole("link", { name: "Войти через Telegram" }),
  ).toBeVisible();
  expect(
    (await guest.request.get(privSrc!, { maxRedirects: 0 })).status(),
  ).toBe(404);

  // a signed-in player without admission: reads public posts, has no form, cannot get an upload address
  const carol = await asUser(browser, "carol");
  await carol.goto("/social");
  await expect(carol.getByText(`Моя стройка ${TAG}`)).toBeVisible();
  await expect(carol.getByText(`Секрет ${TAG}`)).toHaveCount(0);
  await expect(carol.getByRole("button", { name: "Опубликовать" })).toHaveCount(
    0,
  );
  expect((await carol.request.post("/api/social/upload-url")).status()).toBe(
    403,
  );
  expect(
    (await carol.request.get(privSrc!, { maxRedirects: 0 })).status(),
  ).toBe(404);

  // the pinned news is first and the news filter works
  await expect(carol.locator("[data-post-id]").first()).toContainText(
    `Новость ${TAG}`,
  );
  await carol.getByRole("link", { name: "Новости", exact: true }).click();
  await expect(carol.getByText(`Моя стройка ${TAG}`)).toHaveCount(0);
});

test("a player without admission gets no publishing form at all", async ({
  browser,
}) => {
  const carol = await asUser(browser, "carol");
  const { count } = await db
    .from("posts")
    .select("id", { count: "exact", head: true })
    .eq("author_id", await userId("carol"));
  expect(count).toBe(0);
  await carol.goto("/social");
  const html = await carol.content();
  expect(html).not.toContain("post-body");
});

test("reactions toggle, reports are deduplicated and a moderator hides the post", async ({
  browser,
}) => {
  const carol = await asUser(browser, "carol");
  await carol.goto("/social");
  const card = carol.locator("[data-post-id]", {
    hasText: `Моя стройка ${TAG}`,
  });
  await card.getByRole("button", { name: "Нравится" }).click();
  await expect(
    carol
      .locator("[data-post-id]", { hasText: `Моя стройка ${TAG}` })
      .getByRole("button", { name: /Убрать отметку/ }),
  ).toBeVisible();

  const target = carol.locator("[data-post-id]", {
    hasText: `Моя стройка ${TAG}`,
  });
  await target.getByText("Пожаловаться").click();
  await target.getByLabel("Что не так?").fill("Реклама сторонних серверов");
  await target.getByRole("button", { name: "Отправить жалобу" }).click();
  await expect(carol.getByText(/Жалоба отправлена/)).toBeVisible();
  await carol
    .locator("[data-post-id]", { hasText: `Моя стройка ${TAG}` })
    .getByText("Пожаловаться")
    .click();
  await carol
    .locator("[data-post-id]", { hasText: `Моя стройка ${TAG}` })
    .getByLabel("Что не так?")
    .fill("Ещё раз");
  await carol
    .locator("[data-post-id]", { hasText: `Моя стройка ${TAG}` })
    .getByRole("button", { name: "Отправить жалобу" })
    .click();
  await expect(
    carol.getByText("Вы уже отправили жалобу на эту публикацию."),
  ).toBeVisible();

  // the author sees no report button on their own post
  const bob = await asUser(browser, "bob");
  await bob.goto("/social");
  await expect(
    bob
      .locator("[data-post-id]", { hasText: `Моя стройка ${TAG}` })
      .getByText("Пожаловаться"),
  ).toHaveCount(0);

  // moderator: a decision needs a comment, then the post disappears from feed and by direct URL
  const { data: post } = await db
    .from("posts")
    .select("id")
    .like("body", `%Моя стройка ${TAG}%`)
    .single();
  const { data: att } = await db
    .from("media_attachments")
    .select("media_id")
    .eq("target_id", post!.id)
    .single();
  const alice = await asUser(browser, "alice");
  await alice.goto("/admin/moderation");
  const item = alice.locator("li", { hasText: "Реклама сторонних серверов" });
  await item.getByRole("button", { name: "Скрыть" }).click();
  await expect(
    alice.getByText("Укажите причину (не короче 3 символов)."),
  ).toBeVisible();
  await alice
    .locator("li", { hasText: "Реклама сторонних серверов" })
    .getByLabel(/Комментарий/)
    .fill("Реклама");
  await alice
    .locator("li", { hasText: "Реклама сторонних серверов" })
    .getByRole("button", { name: "Скрыть" })
    .click();
  await expect(alice.getByText("Решение сохранено.")).toBeVisible();

  await carol.goto("/social");
  await expect(carol.getByText(`Моя стройка ${TAG}`)).toHaveCount(0);
  expect(
    (
      await carol.request.get(`/api/media/${att!.media_id}`, {
        maxRedirects: 0,
      })
    ).status(),
  ).toBe(404);
  const { data: audit } = await db
    .from("audit_log")
    .select("action")
    .eq("action", "report.hide")
    .limit(1);
  expect(audit?.length).toBe(1);
});

test("deleting a post removes it at once and schedules the file for purge in 30 days", async ({
  browser,
}) => {
  const bob = await asUser(browser, "bob");
  await publish(bob, `Удаляемый ${TAG}`, { image: await png("#a0522d") });
  await expect(bob.getByText("Опубликовано.")).toBeVisible();
  const { data: post } = await db
    .from("posts")
    .select("id")
    .like("body", `%Удаляемый ${TAG}%`)
    .single();
  const { data: att } = await db
    .from("media_attachments")
    .select("media_id")
    .eq("target_id", post!.id)
    .single();
  const card = bob.locator("[data-post-id]", { hasText: `Удаляемый ${TAG}` });
  await card.getByText("Удалить", { exact: true }).click();
  await card.getByRole("button", { name: "Удалить публикацию" }).click();
  await expect(bob.getByText("Публикация удалена.")).toBeVisible();
  await expect(bob.getByText(`Удаляемый ${TAG}`)).toHaveCount(0);
  expect(
    (
      await bob.request.get(`/api/media/${att!.media_id}`, { maxRedirects: 0 })
    ).status(),
  ).toBe(404);
  const { data: m } = await db
    .from("media")
    .select("deleted_at, purge_after")
    .eq("id", att!.media_id)
    .single();
  expect(m!.deleted_at).not.toBeNull();
  const days = (Date.parse(m!.purge_after as string) - Date.now()) / 86_400_000;
  expect(days).toBeGreaterThan(29);
  expect(days).toBeLessThan(31);
});

test("post rate limit: the eleventh publication within an hour is refused", async ({
  browser,
}) => {
  for (let i = 0; i < 10; i++)
    await db.rpc("hit_rate_limit", {
      p_key: `post:${bobId}`,
      p_window_seconds: 3600,
      p_limit: 10,
    });
  const bob = await asUser(browser, "bob");
  await publish(bob, `Спам ${TAG}`);
  await expect(
    bob.getByText("Слишком много публикаций, попробуйте позже."),
  ).toBeVisible();
});
