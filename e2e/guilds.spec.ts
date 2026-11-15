import { createHmac, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { adminCode, ensureAdminTotp } from "./support";

// Guilds and the player catalog against a real staging database: creation by an admin with a fresh
// TOTP, invitations and requests, the rank rules proven through direct database calls (the same
// functions the pages use), last-owner guard, races, bans, archive, privacy and public reads.
// Needs FF_P1A, FF_P1B and FF_P1B_GUILDS set to true for the app under test.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.TEST_LOGIN_SECRET;
const enabled =
  !!url &&
  !!key &&
  !!secret &&
  process.env.TEST_LOGIN_ENABLED === "true" &&
  !!process.env.BRIDGE_KEK &&
  process.env.FF_P1A === "true" &&
  process.env.FF_P1B === "true" &&
  process.env.FF_P1B_GUILDS === "true";

test.skip(!enabled, "needs staging, keys and the guild flags");
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
  erin: "9990000005",
} as const;
type Who = keyof typeof TG;
const RUN = Date.now().toString(36);
const nick = (who: Who) =>
  `${who[0].toUpperCase()}${who.slice(1)}_${RUN}`.slice(0, 16);
const SLUG = `e2e-${RUN}`;
const TAG = `E${RUN.slice(-3).toUpperCase()}`;
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
async function stepUpTo(admin: Page, path: string) {
  await admin.goto(`/admin/step-up?return_to=${encodeURIComponent(path)}`);
  await admin
    .getByLabel("Код из приложения")
    .fill(await adminCode(db, ids.alice));
  await admin.getByRole("button", { name: "Подтвердить" }).click();
  await expect(admin).toHaveURL(new RegExp(path.replace("?", "\\?")));
}

async function wipe() {
  const all = Object.values(ids);
  const { data: gs } = await db
    .from("guilds")
    .select("id")
    .like("slug", "e2e-%");
  const gids = (gs ?? []).map((g) => g.id as string);
  if (gids.length) {
    await db.from("guild_invitations").delete().in("guild_id", gids);
    await db.from("guild_join_requests").delete().in("guild_id", gids);
    await db.from("guild_members").delete().in("guild_id", gids);
    await db.from("guild_ranks").delete().in("guild_id", gids);
    await db.from("guilds").delete().in("id", gids);
  }
  await db.from("guild_members").delete().in("user_id", all);
  await db.from("guild_invitations").delete().in("invitee_id", all);
  await db.from("guild_join_requests").delete().in("user_id", all);
  await db.from("privacy_settings").delete().in("user_id", all);
  await db.from("posts").delete().in("author_id", all);
}

/** A confirmed player with admission, ready to be a guild member. */
async function makePlayer(who: Who) {
  const id = ids[who];
  await db.from("whitelist_entries").delete().eq("user_id", id);
  await db.from("access_memberships").delete().eq("user_id", id);
  await db.from("minecraft_identities").delete().eq("user_id", id);
  await db.from("users").update({ account_status: "active" }).eq("id", id);
  await db.from("minecraft_identities").insert({
    user_id: id,
    nickname: nick(who),
    binding_status: "confirmed",
    game_identity: "confirmed",
  });
  await db.from("access_memberships").insert({
    user_id: id,
    status: "approved",
    decided_at: new Date().toISOString(),
  });
}

const rpc = async (fn: string, args: Record<string, unknown>) =>
  (await db.rpc(fn, args)).error?.message ?? null;
let gid = "";
let g2 = "";
const owners = async (guild: string) =>
  (
    await db
      .from("guild_members")
      .select("user_id")
      .eq("guild_id", guild)
      .eq("is_owner", true)
      .eq("status", "active")
  ).data!.map((r) => r.user_id as string);
const levelOf = async (guild: string, who: Who) =>
  (
    await db
      .from("guild_members")
      .select("rank_level")
      .eq("guild_id", guild)
      .eq("user_id", ids[who])
      .eq("status", "active")
      .maybeSingle()
  ).data?.rank_level as number | undefined;

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
  for (const who of ["bob", "carol", "dave", "erin"] as Who[])
    await makePlayer(who);
});
test.afterAll(async () => {
  await wipe();
  for (const who of ["bob", "carol", "dave", "erin"] as Who[])
    await db.from("access_memberships").delete().eq("user_id", ids[who]);
});

test("an admin creates a guild with a fresh TOTP; a taken tag is refused; the page shows the owner", async ({
  browser,
}) => {
  const admin = await asUser(browser, "alice");
  await stepUpTo(admin, "/admin/guilds");
  await admin.getByText("＋ Создать гильдию").click();
  await admin.locator("#g-name").fill(`Тест ${RUN}`);
  await admin.getByLabel(/^Адрес/).fill(SLUG);
  await admin.getByLabel(/^Тег/).fill(TAG);
  await admin
    .getByLabel("Ник главы (подтверждённый игрок без гильдии)")
    .fill(nick("bob"));
  await admin.getByRole("button", { name: "Создать гильдию" }).click();
  await expect(admin.getByText("Гильдия создана.")).toBeVisible();
  gid = (await db.from("guilds").select("id").eq("slug", SLUG).single()).data!
    .id as string;

  // the same tag again
  await admin.getByText("＋ Создать гильдию").click();
  await admin.locator("#g-name").fill(`Другая ${RUN}`);
  await admin.getByLabel(/^Адрес/).fill(`${SLUG}-b`);
  await admin.getByLabel(/^Тег/).fill(TAG);
  await admin
    .getByLabel("Ник главы (подтверждённый игрок без гильдии)")
    .fill(nick("carol"));
  await admin.getByRole("button", { name: "Создать гильдию" }).click();
  await expect(admin.getByText("Этот тег уже занят.")).toBeVisible();

  const guest = await (
    await browser.newContext({ baseURL: test.info().project.use.baseURL })
  ).newPage();
  await guest.goto(`/guilds/${SLUG}`);
  await expect(
    guest.getByRole("heading", { name: `Тест ${RUN}` }),
  ).toBeVisible();
  await expect(guest.getByText(nick("bob"))).toBeVisible();
  await expect(guest.getByText("Глава").first()).toBeVisible();
  const owner = await owners(gid);
  expect(owner).toEqual([ids.bob]);

  // a second guild for the cross-guild checks, owned by carol
  const err = await rpc("create_guild", {
    p_actor: ids.alice,
    p_name: `Вторая ${RUN}`,
    p_slug: `${SLUG}-2`,
    p_tag: `F${RUN.slice(-3).toUpperCase()}`,
    p_color: "#1e88e5",
    p_description: "",
    p_owner: ids.carol,
  });
  expect(err).toBeNull();
  g2 = (await db.from("guilds").select("id").eq("slug", `${SLUG}-2`).single())
    .data!.id as string;
  // a player cannot create a guild through the function either
  expect(
    await rpc("create_guild", {
      p_actor: ids.bob,
      p_name: "Самозванцы",
      p_slug: `${SLUG}-x`,
      p_tag: "XXX",
      p_color: "#000000",
      p_description: "",
      p_owner: ids.bob,
    }),
  ).toBe("forbidden");
});

test("the owner invites, a player accepts; another applies and is accepted; the owner makes a deputy", async ({
  browser,
}) => {
  const bob = await asUser(browser, "bob");
  await bob.goto(`/guilds/${SLUG}/manage`);
  await bob.getByLabel("Ник игрока").fill(nick("dave"));
  await bob.getByRole("button", { name: "Пригласить" }).click();
  await expect(bob.getByText("Приглашение отправлено.")).toBeVisible();
  await bob.getByLabel("Ник игрока").fill(nick("dave"));
  await bob.getByRole("button", { name: "Пригласить" }).click();
  await expect(
    bob.getByText("Приглашение этому игроку уже отправлено."),
  ).toBeVisible();

  const dave = await asUser(browser, "dave");
  await expect(dave.getByText(`Вас приглашают в гильдию`)).toBeVisible();
  await dave.getByRole("button", { name: "Принять" }).click();
  await expect(dave.getByText("Вы вступили в гильдию.")).toBeVisible();
  expect(await levelOf(gid, "dave")).toBe(6);

  const erin = await asUser(browser, "erin");
  await erin.goto(`/guilds/${SLUG}`);
  await erin.getByText("Вступить в гильдию").click();
  await erin.getByLabel(/Пара слов/).fill("Хочу строить");
  await erin.getByRole("button", { name: "Отправить заявку" }).click();
  await expect(erin.getByText(/Заявка отправлена/)).toBeVisible();
  await bob.goto(`/guilds/${SLUG}/manage`);
  await expect(bob.getByText("Хочу строить")).toBeVisible();
  await bob.getByRole("button", { name: "Принять" }).first().click();
  await expect(bob.getByText("Игрок принят в гильдию.")).toBeVisible();
  expect(await levelOf(gid, "erin")).toBe(6);

  // the owner promotes Dave to deputy through the page
  const row = bob.locator("li", { hasText: nick("dave") });
  await row.getByLabel(/Новый ранг/).selectOption({ label: "Заместитель" });
  await row.getByRole("button", { name: "Назначить" }).click();
  await expect(bob.getByText("Ранг изменён.")).toBeVisible();
  expect(await levelOf(gid, "dave")).toBe(2);

  // somebody who already has a guild cannot be invited into another
  expect(
    await rpc("guild_invite", {
      p_actor: ids.bob,
      p_guild: gid,
      p_target: ids.carol,
    }),
  ).toBe("guild_already_member");
});

test("rank rules hold against direct calls: no self-promotion, nothing at or above one's own rank, one owner", async () => {
  const assign = (actor: Who, target: Who, level: number) =>
    rpc("guild_assign_rank", {
      p_actor: ids[actor],
      p_guild: gid,
      p_target: ids[target],
      p_level: level,
    });

  expect(await assign("dave", "erin", 3)).toBeNull(); // deputy -> officer I, below himself
  expect(await levelOf(gid, "erin")).toBe(3);
  expect(await assign("erin", "dave", 6)).toBe("guild_rank_too_low"); // target above the actor
  expect(await assign("erin", "erin", 2)).toBe("guild_self_assign");
  expect(await assign("dave", "dave", 1)).toBe("guild_self_assign");
  expect(await assign("dave", "erin", 2)).toBe("guild_rank_escalation"); // not above own rank
  expect(await assign("dave", "bob", 6)).toBe("guild_last_owner"); // the owner is untouchable
  expect(await assign("bob", "dave", 1)).toBe("guild_owner_conflict"); // a second owner only through the admin
  expect(await assign("bob", "bob", 6)).toBe("guild_self_assign");
  expect(await assign("carol", "erin", 6)).toBe("guild_forbidden"); // another guild's owner has no say here
  expect(await assign("bob", "carol", 6)).toBe("guild_member_not_found");
  expect(await assign("bob", "erin", 9)).toBe("guild_bad_input");
  expect(await levelOf(gid, "erin")).toBe(3);

  // only the owner makes deputies
  expect(await assign("bob", "erin", 2)).toBeNull();
  expect(await assign("bob", "erin", 3)).toBeNull();
  await db.from("guild_members").update({}).eq("user_id", ids.erin); // no-op update leaves the rank alone
  expect(await levelOf(gid, "erin")).toBe(3);

  // a rank of another guild cannot be written into this guild's membership
  const { data: foreign } = await db
    .from("guild_ranks")
    .select("id")
    .eq("guild_id", g2)
    .eq("level", 6)
    .single();
  const bad = await db
    .from("guild_members")
    .update({ rank_id: foreign!.id })
    .eq("user_id", ids.erin)
    .eq("status", "active");
  expect(bad.error?.code).toBe("23503");
});

test("a manager cannot reach the admin area or the manage page of a foreign guild", async ({
  browser,
}) => {
  const bob = await asUser(browser, "bob");
  expect(
    (await bob.request.get("/admin/guilds", { maxRedirects: 0 })).status(),
  ).toBe(307);
  expect((await bob.request.get(`/guilds/${SLUG}-2/manage`)).status()).toBe(
    404,
  );
  const dave = await asUser(browser, "dave");
  await dave.goto(`/guilds/${SLUG}`);
  await expect(dave.getByRole("link", { name: "Управление" })).toBeVisible();
});

test("leaders edit the description; an admin edits name, colour and size; others cannot", async ({
  browser,
}) => {
  const bob = await asUser(browser, "bob");
  await bob.goto(`/guilds/${SLUG}/manage`);
  await bob.getByLabel(/Что видят гости/).fill("Строим мосты и ночные рынки.");
  await bob.getByRole("button", { name: "Сохранить описание" }).click();
  await expect(bob.getByText("Описание гильдии сохранено.")).toBeVisible();
  const guest = await (
    await browser.newContext({ baseURL: test.info().project.use.baseURL })
  ).newPage();
  await guest.goto(`/guilds/${SLUG}`);
  await expect(guest.getByText("Строим мосты и ночные рынки.")).toBeVisible();

  // the deputy may, a member of another guild may not
  expect(
    await rpc("guild_edit_profile", {
      p_actor: ids.dave,
      p_guild: gid,
      p_description: "Описание от заместителя",
    }),
  ).toBeNull();
  expect(
    await rpc("guild_edit_profile", {
      p_actor: ids.carol,
      p_guild: gid,
      p_description: "взлом",
    }),
  ).toBe("guild_forbidden");
  expect(
    await rpc("guild_admin_edit", {
      p_actor: ids.bob,
      p_guild: gid,
      p_name: "Взлом",
      p_color: "#000000",
      p_description: "",
      p_max_members: 50,
    }),
  ).toBe("forbidden");

  const admin = await asUser(browser, "alice");
  await stepUpTo(admin, "/admin/guilds");
  const card = admin.locator("li", { hasText: `Тест ${RUN}` });
  await card.locator("summary", { hasText: "Изменить" }).click();
  // fewer seats than members is refused
  await card.getByLabel("Мест в гильдии").fill("2");
  await card.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(admin.getByText(/Проверьте поля/)).toBeVisible();
  const again = admin.locator("li", { hasText: `Тест ${RUN}` });
  await again.locator("summary", { hasText: "Изменить" }).click();
  await again
    .getByLabel("Название", { exact: true })
    .fill(`Тест ${RUN} обновлён`);
  await again.getByLabel("Мест в гильдии").fill("30");
  await again.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(admin.getByText("Гильдия изменена.")).toBeVisible();
  const { data: g } = await db
    .from("guilds")
    .select("name, max_members")
    .eq("id", gid)
    .single();
  expect(g).toEqual({ name: `Тест ${RUN} обновлён`, max_members: 30 });
  // restore the name the later tests look for
  await db
    .from("guilds")
    .update({ name: `Тест ${RUN}` })
    .eq("id", gid);
});

test("kicking takes the rights away at once; members have no management rights; the last owner cannot leave", async ({
  browser,
}) => {
  const erin = await asUser(browser, "erin");
  await erin.goto(`/guilds/${SLUG}/manage`);
  await expect(
    erin.getByRole("heading", { name: "Управление гильдией" }),
  ).toBeVisible();

  // as an ordinary member Erin cannot invite or kick
  await rpc("guild_assign_rank", {
    p_actor: ids.bob,
    p_guild: gid,
    p_target: ids.erin,
    p_level: 6,
  });
  expect(
    await rpc("guild_invite", {
      p_actor: ids.erin,
      p_guild: gid,
      p_target: ids.carol,
    }),
  ).toBe("guild_forbidden");
  expect(
    await rpc("guild_kick", {
      p_actor: ids.erin,
      p_guild: gid,
      p_target: ids.dave,
      p_reason: "x",
    }),
  ).toBe("guild_rank_too_low");
  expect((await erin.request.get(`/guilds/${SLUG}/manage`)).status()).toBe(404);

  // the deputy kicks Erin; her old session loses everything straight away
  expect(
    await rpc("guild_kick", {
      p_actor: ids.dave,
      p_guild: gid,
      p_target: ids.bob,
      p_reason: "x",
    }),
  ).toBe("guild_last_owner");
  expect(
    await rpc("guild_kick", {
      p_actor: ids.dave,
      p_guild: gid,
      p_target: ids.erin,
      p_reason: "спам",
    }),
  ).toBeNull();
  expect(await levelOf(gid, "erin")).toBeUndefined();
  expect(
    await rpc("guild_assign_rank", {
      p_actor: ids.erin,
      p_guild: gid,
      p_target: ids.dave,
      p_level: 6,
    }),
  ).toBe("guild_forbidden");
  expect((await erin.request.get(`/guilds/${SLUG}/manage`)).status()).toBe(404);

  // the owner cannot walk away
  expect(await rpc("guild_leave", { p_user: ids.bob })).toBe(
    "guild_last_owner",
  );
  // Erin is free to join again elsewhere at once
  expect(
    await rpc("guild_request_join", {
      p_user: ids.erin,
      p_guild: gid,
      p_message: "",
    }),
  ).toBeNull();
  expect(
    await rpc("guild_request_join", {
      p_user: ids.erin,
      p_guild: gid,
      p_message: "",
    }),
  ).toBe("guild_request_exists");
  const { data: req } = await db
    .from("guild_join_requests")
    .select("id")
    .eq("user_id", ids.erin)
    .eq("status", "pending")
    .single();
  expect(
    await rpc("guild_withdraw_request", {
      p_user: ids.erin,
      p_request: req!.id,
    }),
  ).toBeNull();
});

test("the owner stays single under a race; a banned owner flags the guild; the admin hands it over", async ({
  browser,
}) => {
  // two transfers at the same time: they run one after another, one owner is left
  await rpc("guild_invite", {
    p_actor: ids.bob,
    p_guild: gid,
    p_target: ids.erin,
  });
  const { data: inv } = await db
    .from("guild_invitations")
    .select("id")
    .eq("invitee_id", ids.erin)
    .eq("status", "pending")
    .single();
  expect(
    await rpc("guild_respond_invitation", {
      p_user: ids.erin,
      p_invitation: inv!.id,
      p_accept: true,
    }),
  ).toBeNull();
  const race = await Promise.all([
    rpc("guild_transfer_owner", {
      p_actor: ids.alice,
      p_guild: gid,
      p_new_owner: ids.dave,
      p_keep_vice: false,
    }),
    rpc("guild_transfer_owner", {
      p_actor: ids.alice,
      p_guild: gid,
      p_new_owner: ids.erin,
      p_keep_vice: false,
    }),
    rpc("guild_leave", { p_user: ids.bob }),
  ]);
  expect(race.filter((e) => e === null).length).toBeGreaterThanOrEqual(2);
  const now = await owners(gid);
  expect(now.length).toBe(1);

  // only an admin can hand the guild over
  const other = now[0] === ids.dave ? "erin" : "dave";
  expect(
    await rpc("guild_transfer_owner", {
      p_actor: ids.bob,
      p_guild: gid,
      p_new_owner: ids[other as Who],
      p_keep_vice: false,
    }),
  ).toBe("forbidden");

  // ban the owner: rights vanish, the guild is flagged, the public lists drop him
  const ownerWho = (Object.keys(ids) as Who[]).find((w) => ids[w] === now[0])!;
  await db.from("users").update({ account_status: "banned" }).eq("id", now[0]);
  expect(
    (await db.from("guilds").select("needs_owner").eq("id", gid).single()).data!
      .needs_owner,
  ).toBe(true);
  expect(
    await rpc("guild_assign_rank", {
      p_actor: now[0],
      p_guild: gid,
      p_target: ids[other as Who],
      p_level: 6,
    }),
  ).toBe("account_not_active");
  const { data: listed } = await db
    .from("public_members")
    .select("nickname")
    .eq("nickname", nick(ownerWho));
  expect(listed).toEqual([]);

  // the admin hands the guild to the other member through the page; the banned owner is taken off
  const admin = await asUser(browser, "alice");
  await stepUpTo(admin, "/admin/guilds");
  await expect(admin.getByText("Нужен глава")).toBeVisible();
  const card = admin.locator("li", { hasText: `Тест ${RUN}` });
  await card.getByText("Передать главенство").click();
  await card.getByLabel(/Ник нового главы/).fill(nick(other as Who));
  await card.getByRole("button", { name: "Передать", exact: true }).click();
  await expect(admin.getByText("Главенство передано.")).toBeVisible();
  expect(await owners(gid)).toEqual([ids[other as Who]]);
  expect(
    (await db.from("guilds").select("needs_owner").eq("id", gid).single()).data!
      .needs_owner,
  ).toBe(false);
  expect(await levelOf(gid, ownerWho)).toBeUndefined();
  await makePlayer(ownerWho); // back to an ordinary player without a guild
  const { data: ev } = await db
    .from("audit_log")
    .select("action")
    .eq("guild_id", gid)
    .eq("action", "guild.owner_transferred");
  expect(ev!.length).toBeGreaterThan(0);
});

test("an admin dissolves a guild with a typed confirmation; nothing works on it afterwards", async ({
  browser,
}) => {
  const admin = await asUser(browser, "alice");
  await stepUpTo(admin, "/admin/guilds");
  const card = admin.locator("li", { hasText: `Тест ${RUN}` });
  await card.getByText("Распустить гильдию").click();
  await card.getByLabel(/Введите название/).fill("неверно");
  await card.getByLabel("Причина").fill("Конец сезона");
  await card.getByRole("button", { name: "Распустить", exact: true }).click();
  await expect(
    admin.getByText("Название для подтверждения введено неверно."),
  ).toBeVisible();
  await admin
    .locator("li", { hasText: `Тест ${RUN}` })
    .getByText("Распустить гильдию")
    .click();
  await admin
    .locator("li", { hasText: `Тест ${RUN}` })
    .getByLabel(/Введите название/)
    .fill(`Тест ${RUN}`);
  await admin
    .locator("li", { hasText: `Тест ${RUN}` })
    .getByLabel("Причина")
    .fill("Конец сезона");
  await admin
    .locator("li", { hasText: `Тест ${RUN}` })
    .getByRole("button", { name: "Распустить", exact: true })
    .click();
  await expect(admin.getByText("Гильдия распущена.").first()).toBeVisible();

  const { count } = await db
    .from("guild_members")
    .select("id", { count: "exact", head: true })
    .eq("guild_id", gid)
    .eq("status", "active");
  expect(count).toBe(0);
  expect(
    await rpc("guild_invite", {
      p_actor: ids.dave,
      p_guild: gid,
      p_target: ids.bob,
    }),
  ).toBe("guild_archived");
  const guest = await (
    await browser.newContext({ baseURL: test.info().project.use.baseURL })
  ).newPage();
  await guest.goto(`/guilds/${SLUG}`);
  await expect(
    guest.getByText(
      "Гильдия распущена. Здесь осталась только публичная история.",
    ),
  ).toBeVisible();
  // the tag of a dissolved guild stays taken
  expect(
    await rpc("create_guild", {
      p_actor: ids.alice,
      p_name: "Ещё одна",
      p_slug: `${SLUG}-3`,
      p_tag: TAG,
      p_color: "#000000",
      p_description: "",
      p_owner: ids.bob,
    }),
  ).toBe("guild_tag_taken");
});

test("the catalog shows only confirmed members; search and the no-guild filter work; privacy is respected", async ({
  browser,
}) => {
  await rpc("guild_leave", { p_user: ids.carol }).catch(() => null);
  const guest = await (
    await browser.newContext({ baseURL: test.info().project.use.baseURL })
  ).newPage();
  await guest.goto(`/players?q=${RUN}`);
  await expect(
    guest.getByRole("link", { name: new RegExp(nick("bob")) }),
  ).toBeVisible();

  // a candidate with a pending admission is not listed and has no profile
  await db
    .from("access_memberships")
    .update({ status: "pending" })
    .eq("user_id", ids.erin);
  await guest.goto(`/players?q=${RUN}`);
  await expect(
    guest.getByRole("link", { name: new RegExp(nick("erin")) }),
  ).toHaveCount(0);
  expect((await guest.request.get(`/players/${nick("erin")}`)).status()).toBe(
    404,
  );
  expect((await guest.request.get("/players/NoSuchPlayer123")).status()).toBe(
    404,
  );
  await db
    .from("access_memberships")
    .update({ status: "approved" })
    .eq("user_id", ids.erin);

  await guest.goto(`/players?q=${nick("bob").toLowerCase()}`); // case-insensitive
  await expect(
    guest.getByRole("link", { name: new RegExp(nick("bob"), "i") }),
  ).toBeVisible();
  await guest.goto(`/players?q=zzzz-nothing`);
  await expect(
    guest.getByText("Игроков по выбранным условиям не найдено"),
  ).toBeVisible();

  // a guild member: guild shown by default; hidden when the player switches it off
  const fresh = `${SLUG}-4`;
  expect(
    await rpc("create_guild", {
      p_actor: ids.alice,
      p_name: `Четвёртая ${RUN}`,
      p_slug: fresh,
      p_tag: `G${RUN.slice(-3).toUpperCase()}`,
      p_color: "#e53935",
      p_description: "",
      p_owner: ids.bob,
    }),
  ).toBeNull();
  await guest.goto(`/players/${nick("bob")}`);
  await expect(
    guest.getByRole("link", { name: `Четвёртая ${RUN}` }),
  ).toBeVisible();
  await expect(guest.getByText(/В сообществе с/)).toBeVisible();
  const html = await guest.content();
  expect(html).not.toContain(TG.bob);
  expect(html).not.toContain(ids.bob);

  const bob = await asUser(browser, "bob");
  await bob.goto("/dashboard");
  await bob.getByLabel("Показывать мою гильдию и ранг").uncheck();
  await bob.getByLabel("Показывать, с какого времени я в сообществе").uncheck();
  await bob.getByLabel(/О себе/).fill("Строю мосты");
  await bob.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(bob.getByText("Настройки публичности сохранены.")).toBeVisible();
  await guest.goto(`/players/${nick("bob")}`);
  await expect(guest.getByText("Без гильдии")).toBeVisible();
  await expect(guest.getByText(/В сообществе с/)).toHaveCount(0);
  await expect(guest.getByText("Строю мосты")).toBeVisible();
  await guest.goto(`/guilds/${fresh}`);
  await expect(guest.getByText(nick("bob"))).toHaveCount(0);
});

test("closed tables are not readable with the public key", async () => {
  const anon = createClient(url!, anonKey!, {
    auth: { persistSession: false },
  });
  for (const table of [
    "guilds",
    "guild_members",
    "guild_ranks",
    "guild_invitations",
    "guild_join_requests",
    "privacy_settings",
    "public_members",
    "public_profiles",
    "public_guilds",
  ]) {
    const { data, error } = await anon.from(table).select("*").limit(1);
    expect(error !== null || (data ?? []).length === 0, table).toBe(true);
  }
  const call = await anon.rpc("guild_leave", { p_user: ids.bob });
  expect(call.error).not.toBeNull();
});
