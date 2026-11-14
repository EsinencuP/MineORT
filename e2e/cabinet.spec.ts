import { createHmac, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { telegramIdHash } from "../src/lib/secrets";
import { adminCode, ensureAdminTotp } from "./support";

// Cabinet and admin area against a real staging database: honest statuses, 2FA step-up, bans,
// the blocked screen, no ban evasion by deletion, and self-service account deletion.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const secret = process.env.TEST_LOGIN_SECRET;
const enabled =
  !!url &&
  !!key &&
  !!secret &&
  process.env.TEST_LOGIN_ENABLED === "true" &&
  !!process.env.BRIDGE_KEK &&
  !!process.env.TOMBSTONE_HMAC_KEY;

test.skip(!enabled, "needs staging database, test-login secret and keys");
test.describe.configure({ mode: "serial", timeout: 120_000 });
test.beforeEach(async ({}, info) => {
  test.skip(info.project.name !== "desktop", "one project is enough");
});

const db = enabled
  ? createClient(url!, key!, { auth: { persistSession: false } })
  : null!;
const ADDRESS = "play.example.test:25565";
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
  return `/api/test-login?token=${body}.${createHmac("sha256", secret!).update(body).digest("base64url")}`;
}
async function asUser(
  browser: Browser,
  who: Who,
  expectUrl: RegExp | null = /\/dashboard/,
): Promise<Page> {
  const ctx = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
  });
  const page = await ctx.newPage();
  await page.goto(loginUrl(who));
  if (expectUrl) await expect(page).toHaveURL(expectUrl);
  return page;
}
async function userIdOf(who: Who): Promise<string> {
  const { data } = await db
    .from("telegram_identities")
    .select("user_id")
    .eq("telegram_id", TG[who])
    .maybeSingle();
  if (data) return data.user_id as string;
  const { data: tomb } = await db
    .from("deletion_tombstones")
    .select("pseudonym_id")
    .eq("telegram_id_hash", telegramIdHash(TG[who]))
    .maybeSingle();
  throw new Error(`no identity for ${who} (tombstone: ${!!tomb})`);
}

/** Puts a player into "approved, whitelist applied" without going through the UI. */
async function arrange(who: Who, nickname: string) {
  const id = await userIdOf(who);
  await db.from("whitelist_entries").delete().eq("user_id", id);
  await db.from("access_memberships").delete().eq("user_id", id);
  await db.from("applications").delete().eq("user_id", id);
  await db.from("minecraft_identities").delete().eq("user_id", id);
  await db.from("rules_acceptances").delete().eq("user_id", id);
  const { data: rules } = await db
    .from("rules_versions")
    .select("id")
    .order("version_major", { ascending: false })
    .order("version_minor", { ascending: false })
    .limit(1)
    .single();
  await db
    .from("rules_acceptances")
    .insert({ user_id: id, rules_version_id: rules!.id });
  await db.from("minecraft_identities").insert({ user_id: id, nickname });
  await db.from("access_memberships").insert({
    user_id: id,
    status: "approved",
    decided_at: new Date().toISOString(),
  });
  await db
    .from("whitelist_entries")
    .insert({ user_id: id, nickname, desired: "on", applied_state: "applied" });
  await db
    .from("users")
    .update({
      account_status: "active",
      restriction_reason: null,
      banned_until: null,
    })
    .eq("id", id);
  return id;
}

/** Opens the step-up window for this browser session and returns to `path`. */
async function stepUpTo(admin: Page, path: string) {
  await admin.goto(`/admin/step-up?return_to=${encodeURIComponent(path)}`);
  await admin
    .getByLabel("Код из приложения")
    .fill(await adminCode(db, await userIdOf("alice")));
  await admin.getByRole("button", { name: "Подтвердить" }).click();
  await expect(admin).toHaveURL(new RegExp(path));
}

let rulesVersionCreated = false;
async function cleanup() {
  for (const who of ["bob", "carol"] as Who[]) {
    // a deleted account loses its identity; remove leftovers by tombstone hash as well
    await db
      .from("deletion_tombstones")
      .delete()
      .eq("telegram_id_hash", telegramIdHash(TG[who]));
  }
  await db
    .from("site_settings")
    .delete()
    .in("key", ["server_address", "support_contact"]);
  if (rulesVersionCreated)
    await db.from("rules_versions").delete().gte("version_major", 9_000_000);
}

test.beforeAll(async () => {
  await cleanup();
  // make sure the fixtures exist (they may have been deleted by an earlier run)
  for (const who of ["alice", "bob", "carol"] as Who[]) {
    const { data } = await db
      .from("telegram_identities")
      .select("user_id")
      .eq("telegram_id", TG[who])
      .maybeSingle();
    if (!data) {
      await db.rpc("upsert_telegram_user", {
        p_telegram_id: TG[who],
        p_username: `test_${who}`,
        p_display_name: `Test ${who}`,
      });
    }
  }
  const { data: alice } = await db
    .from("telegram_identities")
    .select("user_id")
    .eq("telegram_id", TG.alice)
    .single();
  await db
    .from("users")
    .update({ site_role: "admin" })
    .eq("id", alice!.user_id);
  await ensureAdminTotp(db, alice!.user_id as string);
  await adminCode(db, alice!.user_id as string); // also clears the attempt budget left by earlier runs
  const { data: existing } = await db
    .from("rules_versions")
    .select("id")
    .limit(1);
  if (!existing || existing.length === 0) {
    await db.rpc("publish_rules_version", {
      p_actor: alice!.user_id,
      p_major: 9_000_000,
      p_minor: 0,
      p_body: "Правила для e2e.",
    });
    rulesVersionCreated = true;
  }
  await db.from("site_settings").upsert([
    { key: "server_address", value: ADDRESS },
    { key: "support_contact", value: "admin@example.test" },
  ]);
});
test.afterAll(cleanup);

test("the dashboard shows four separate honest statuses and the address only after applied", async ({
  browser,
}) => {
  await arrange("carol", "CabCarol");
  const carol = await asUser(browser, "carol");
  await expect(
    carol.getByText("Доступ готов: сервер подтвердил"),
  ).toBeVisible();
  await expect(carol.getByText("Допуск получен")).toBeVisible();
  await expect(carol.getByText("Заявка", { exact: true })).toBeVisible();
  await expect(carol.getByText("Личность в игре")).toBeVisible();
  await expect(carol.getByText(ADDRESS)).toBeVisible();
  await expect(
    carol.getByRole("link", { name: "Инструкция по установке и подключению" }),
  ).toBeVisible();

  const id = await userIdOf("carol");
  await db
    .from("whitelist_entries")
    .update({ applied_state: "pending" })
    .eq("user_id", id);
  await carol.goto("/dashboard");
  await expect(carol.getByText("Применяется на сервере")).toBeVisible();
  expect(await carol.content()).not.toContain(ADDRESS);

  await db
    .from("whitelist_entries")
    .update({ applied_state: "failed" })
    .eq("user_id", id);
  await carol.goto("/dashboard");
  await expect(
    carol.getByText(/Не удалось применить на сервере/),
  ).toBeVisible();
  expect(await carol.content()).not.toContain(ADDRESS);
  await db
    .from("whitelist_entries")
    .update({ applied_state: "applied" })
    .eq("user_id", id);
});

test("admin area: critical actions need a fresh TOTP code (step-up)", async ({
  browser,
  request,
}) => {
  const admin = await asUser(browser, "alice");
  const carolId = await userIdOf("carol");

  await admin.goto("/admin/players");
  await admin.getByLabel("Поиск игрока").fill("CabCarol");
  await admin.getByRole("button", { name: "Найти" }).click();
  await admin.getByRole("link", { name: "CabCarol" }).click();
  await expect(admin).toHaveURL(new RegExp(`/admin/players/${carolId}`));
  await expect(
    admin.getByText("Для этих действий нужен код подтверждения"),
  ).toBeVisible();

  // without step-up the action sends the admin to the code page instead of executing
  await admin.getByLabel("Причина бана").fill("griefing");
  await admin.getByRole("button", { name: "Забанить" }).click();
  await expect(admin).toHaveURL(/\/admin\/step-up/);
  const { data: still } = await db
    .from("users")
    .select("account_status")
    .eq("id", carolId)
    .single();
  expect(still?.account_status).toBe("active");

  // a wrong code is refused
  await admin.getByLabel("Код из приложения").fill("000000");
  await admin.getByRole("button", { name: "Подтвердить" }).click();
  await expect(admin.getByText(/Неверный код/)).toBeVisible();

  // the right code opens the window and returns to the player
  await admin
    .getByLabel("Код из приложения")
    .fill(await adminCode(db, await userIdOf("alice")));
  await admin.getByRole("button", { name: "Подтвердить" }).click();
  await expect(admin).toHaveURL(new RegExp(`/admin/players/${carolId}`));
  await expect(
    admin.getByText("Для этих действий нужен код подтверждения"),
  ).toHaveCount(0);

  // the admin area is closed to guests and players
  expect(
    (await request.get("/admin/players", { maxRedirects: 0 })).status(),
  ).toBe(307);
});

test("a ban hides access, shows the reason and contact on login, and revokes the old session", async ({
  browser,
}) => {
  const admin = await asUser(browser, "alice");
  const carol = await asUser(browser, "carol");
  const carolId = await userIdOf("carol");

  await stepUpTo(admin, `/admin/players/${carolId}`);
  await admin.getByLabel("Причина бана").fill("griefing");
  await admin.getByLabel("Срок бана в днях (пусто = бессрочно)").fill("30");
  await admin.getByRole("button", { name: "Забанить" }).click();
  await expect(admin.getByText("Аккаунт забанен.")).toBeVisible();
  await expect(admin.getByText(/Забанен/)).toBeVisible();

  // the old session of the banned player is dead
  const res = await carol.request.get("/dashboard", { maxRedirects: 0 });
  expect(res.status()).toBe(307);

  // signing in again shows why, until when, and whom to contact
  const blocked = await asUser(browser, "carol", /\/login\?error=blocked/);
  await expect(blocked.getByText("Этот аккаунт не может войти.")).toBeVisible();
  await expect(blocked.getByText(/Причина: griefing/)).toBeVisible();
  await expect(blocked.getByText(/Действует до/)).toBeVisible();
  await expect(blocked.getByText(/admin@example.test/)).toBeVisible();

  // audit trail
  await admin.goto("/admin/audit");
  await expect(admin.getByText("user.banned").first()).toBeVisible();
});

test("deleting a banned account does not lift the ban: the identity cannot return as a new user", async ({
  browser,
}) => {
  const admin = await asUser(browser, "alice");
  const carolId = await userIdOf("carol");
  await stepUpTo(admin, `/admin/players/${carolId}`);
  await admin.getByRole("button", { name: "Удалить аккаунт" }).click();
  await expect(admin.getByText("Аккаунт удалён.")).toBeVisible();

  const before = await db
    .from("telegram_identities")
    .select("user_id")
    .eq("telegram_id", TG.carol);
  expect(before.data).toHaveLength(0);
  const attempt = await asUser(browser, "carol", /\/login\?error=blocked/);
  await expect(attempt.getByText("Этот аккаунт не может войти.")).toBeVisible();
  const after = await db
    .from("telegram_identities")
    .select("user_id")
    .eq("telegram_id", TG.carol);
  expect(after.data).toHaveLength(0); // no new account was created

  // after the ban ends (here: removed by hand) the person may register again, as a new user
  await db
    .from("deletion_tombstones")
    .update({ ban_until: new Date(Date.now() - 1000).toISOString() })
    .eq("telegram_id_hash", telegramIdHash(TG.carol));
  const again = await asUser(browser, "carol");
  await expect(again).toHaveURL(/\/dashboard/);
  expect(again.url()).toContain("/dashboard");
});

test("a player deletes their own account with a fresh sign-in; the old one is refused without it", async ({
  browser,
}) => {
  await arrange("bob", "CabBob");
  const bob = await asUser(browser, "bob");
  const bobId = await userIdOf("bob");

  // a sign-in older than 5 minutes is not enough
  await db
    .from("user_sessions")
    .update({ created_at: new Date(Date.now() - 10 * 60_000).toISOString() })
    .eq("user_id", bobId)
    .is("revoked_at", null);
  await bob.goto("/dashboard/delete");
  await expect(
    bob.getByText(/Для удаления нужен свежий вход через Telegram/),
  ).toBeVisible();
  await expect(
    bob.getByRole("button", { name: "Удалить аккаунт" }),
  ).toHaveCount(0);

  // a fresh sign-in allows it; it must be confirmed explicitly
  const fresh = await asUser(browser, "bob");
  await fresh.goto("/dashboard/delete");
  await fresh.getByRole("button", { name: "Удалить аккаунт" }).click();
  await expect(
    fresh.getByText("Подтвердите удаление, отметив флажок."),
  ).toBeVisible();
  await fresh.getByLabel("Я понимаю, что аккаунт будет удалён").check();
  await fresh.getByRole("button", { name: "Удалить аккаунт" }).click();
  await expect(fresh).toHaveURL(/\/\?ok=deleted/);

  const { data: u } = await db
    .from("users")
    .select("account_status, display_name")
    .eq("id", bobId)
    .single();
  expect(u).toMatchObject({ account_status: "deleted", display_name: null });
  const tg = await db
    .from("telegram_identities")
    .select("user_id")
    .eq("user_id", bobId);
  expect(tg.data).toHaveLength(0);
  // the session is gone
  const res = await fresh.request.get("/dashboard", { maxRedirects: 0 });
  expect(res.status()).toBe(307);
  // not banned: signing in again simply creates a new account
  const reborn = await asUser(browser, "bob");
  await expect(reborn).toHaveURL(/\/dashboard/);
});
