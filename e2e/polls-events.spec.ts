import { createHmac, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { adminCode, ensureAdminTotp } from "./support";

// Polls and events (wave P1b) against a real staging database: honest votes (one per user, races,
// closing, locked polls), seat limits under a race, roles, and time zones.
// Needs FF_P1A, FF_P1B and FF_P1B_SOCIAL set to true for the app under test.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const secret = process.env.TEST_LOGIN_SECRET;
const enabled =
  !!url &&
  !!key &&
  !!secret &&
  process.env.TEST_LOGIN_ENABLED === "true" &&
  !!process.env.BRIDGE_KEK &&
  process.env.FF_P1B === "true" &&
  process.env.FF_P1B_SOCIAL === "true";

test.skip(!enabled, "needs staging, keys and the P1b flags");
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
const TAG = `pe-${Date.now()}`;

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
  opts: { timezoneId?: string } = {},
): Promise<Page> {
  const ctx = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    ...opts,
  });
  const page = await ctx.newPage();
  await page.goto(loginUrl(who));
  await expect(page).toHaveURL(/\/dashboard/);
  return page;
}
const ids = {} as Record<Who, string>;
async function wipe() {
  const all = Object.values(ids);
  await db.from("votes").delete().in("user_id", all);
  await db.from("polls").delete().in("author_id", all);
  await db.from("events").delete().in("organizer_id", all);
}
const iso = (days: number, hour = 12) => {
  const d = new Date(Date.now() + days * 86_400_000);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
};
const localInput = (days: number) => iso(days, 18).slice(0, 16); // value for a datetime-local field

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
  for (const id of [ids.bob, ids.carol])
    await db.from("access_memberships").delete().eq("user_id", id);
  await db.from("access_memberships").insert({
    user_id: ids.bob,
    status: "approved",
    decided_at: new Date().toISOString(),
  });
  await db.from("rate_limit_counters").delete().like("key", "poll:%");
  await db.from("rate_limit_counters").delete().like("key", "event:%");
});
test.afterAll(async () => {
  await wipe();
  for (const id of [ids.bob, ids.carol])
    await db.from("access_memberships").delete().eq("user_id", id);
});

const pollCard = (page: Page, text: string) =>
  page.locator("[data-poll-id]", { hasText: text });
const eventCard = (page: Page, text: string) =>
  page.locator("[data-event-id]", { hasText: text });

test("an admin creates a poll, a member votes once, a player without admission cannot", async ({
  browser,
}) => {
  const alice = await asUser(browser, "alice");
  await alice.goto("/social/polls");
  await alice.getByText("＋ Новое голосование").click();
  await alice.getByLabel("Вопрос").fill(`Что строим ${TAG}?`);
  await alice.getByLabel("Вариант 1").fill("Порт");
  await alice.getByLabel("Вариант 2").fill("Библиотеку");
  await alice.getByLabel("Когда закончится").fill(localInput(2));
  await alice.getByRole("button", { name: "Создать голосование" }).click();
  await expect(alice.getByText("Голосование создано.")).toBeVisible();

  const bob = await asUser(browser, "bob");
  await bob.goto("/social/polls");
  const card = pollCard(bob, `Что строим ${TAG}?`);
  await card.getByLabel("Порт").check();
  await card.getByRole("button", { name: "Проголосовать" }).click();
  await expect(bob.getByText("Ваш голос учтён.").first()).toBeVisible();
  await expect(pollCard(bob, TAG).getByText("1 · 100%")).toBeVisible();

  const carol = await asUser(browser, "carol");
  await carol.goto("/social/polls");
  await expect(pollCard(carol, TAG)).toBeVisible();
  await expect(
    pollCard(carol, TAG).getByRole("button", { name: "Проголосовать" }),
  ).toHaveCount(0);
  await expect(
    pollCard(carol, TAG).getByText("Голосовать могут участники сервера."),
  ).toBeVisible();
  // and the 1 vote is not visible to somebody who has not voted
  await expect(pollCard(carol, TAG).getByText("1 · 100%")).toHaveCount(0);
});

test("one vote per user even under a race; an option of another poll is refused", async () => {
  const { data: poll } = await db
    .from("polls")
    .select("id")
    .like("question", `%${TAG}%`)
    .single();
  const { data: opts } = await db
    .from("poll_options")
    .select("id, label")
    .eq("poll_id", poll!.id);
  const library = opts!.find((o) => o.label === "Библиотеку")!.id;

  // five parallel votes by a user who has not voted yet: exactly one goes through
  const results = await Promise.all(
    Array.from({ length: 5 }, () =>
      db.rpc("cast_vote", {
        p_user: ids.alice,
        p_poll: poll!.id,
        p_options: [library],
        p_change: false,
      }),
    ),
  );
  expect(results.filter((r) => !r.error).length).toBe(1);
  for (const r of results.filter((r) => r.error))
    expect(r.error!.message).toBe("poll_already_voted");
  const { count } = await db
    .from("votes")
    .select("id", { count: "exact", head: true })
    .eq("poll_id", poll!.id)
    .eq("user_id", ids.alice);
  expect(count).toBe(1);

  // another poll's option
  const { data: other } = await db
    .from("polls")
    .insert({
      author_id: ids.alice,
      question: `Другой ${TAG}`,
      closes_at: iso(3),
    })
    .select("id")
    .single();
  const { data: foreign } = await db
    .from("poll_options")
    .insert([
      { poll_id: other!.id, label: "A", position: 0 },
      { poll_id: other!.id, label: "B", position: 1 },
    ])
    .select("id");
  const mismatch = await db.rpc("cast_vote", {
    p_user: ids.bob,
    p_poll: poll!.id,
    p_options: [foreign![0].id],
    p_change: false,
  });
  expect(mismatch.error?.message).toBe("poll_option_mismatch");
  // directly in the table the composite foreign key refuses it too
  const direct = await db.from("votes").insert({
    poll_id: poll!.id,
    option_id: foreign![0].id,
    user_id: ids.carol,
    multi_choice: false,
  });
  expect(direct.error?.code).toBe("23503");
  // changing a vote is not allowed in this poll
  const change = await db.rpc("cast_vote", {
    p_user: ids.alice,
    p_poll: poll!.id,
    p_options: [library],
    p_change: true,
  });
  expect(change.error?.message).toBe("poll_change_not_allowed");
});

test("a poll with votes cannot be edited behind the voters' backs", async () => {
  const { data: poll } = await db
    .from("polls")
    .select("id")
    .like("question", `%Что строим ${TAG}%`)
    .single();
  const edit = await db
    .from("polls")
    .update({ question: "Подменили вопрос" })
    .eq("id", poll!.id);
  expect(edit.error?.message).toContain("poll_has_votes");
  const { data: opts } = await db
    .from("poll_options")
    .select("id")
    .eq("poll_id", poll!.id);
  const rename = await db
    .from("poll_options")
    .update({ label: "Подмена" })
    .eq("id", opts![0].id);
  expect(rename.error?.message).toContain("poll_has_votes");
  const add = await db
    .from("poll_options")
    .insert({ poll_id: poll!.id, label: "Новый", position: 9 });
  expect(add.error?.message).toContain("poll_has_votes");
  const remove = await db.from("poll_options").delete().eq("id", opts![0].id);
  expect(remove.error).not.toBeNull();
  // the deadline cannot be pulled earlier either
  const shorten = await db
    .from("polls")
    .update({ closes_at: new Date(Date.now() + 60_000).toISOString() })
    .eq("id", poll!.id);
  expect(shorten.error?.message).toContain("poll_has_votes");
});

test("results stay hidden until the end when asked; a vote can be changed atomically when allowed; early close publishes results", async ({
  browser,
}) => {
  const { data: poll } = await db
    .from("polls")
    .insert({
      author_id: ids.alice,
      question: `Скрытые итоги ${TAG}`,
      allow_change: true,
      results_after_close: true,
      closes_at: iso(2),
    })
    .select("id")
    .single();
  await db.from("poll_options").insert([
    { poll_id: poll!.id, label: "Да", position: 0 },
    { poll_id: poll!.id, label: "Нет", position: 1 },
  ]);

  const bob = await asUser(browser, "bob");
  await bob.goto("/social/polls");
  const card = pollCard(bob, `Скрытые итоги ${TAG}`);
  await card.getByLabel("Да").check();
  await card.getByRole("button", { name: "Проголосовать" }).click();
  await expect(bob.getByText("Ваш голос учтён.").first()).toBeVisible();
  await expect(
    pollCard(bob, `Скрытые итоги ${TAG}`).getByText(
      "Результаты появятся после завершения голосования.",
    ),
  ).toBeVisible();
  await expect(
    pollCard(bob, `Скрытые итоги ${TAG}`).getByText("100%"),
  ).toHaveCount(0);

  await pollCard(bob, `Скрытые итоги ${TAG}`)
    .getByText("Изменить голос", { exact: true })
    .first()
    .click();
  await pollCard(bob, `Скрытые итоги ${TAG}`).getByLabel("Нет").check();
  await pollCard(bob, `Скрытые итоги ${TAG}`)
    .getByRole("button", { name: "Изменить голос" })
    .click();
  await expect(bob.getByText("Голос изменён.")).toBeVisible();
  const { data: mine } = await db
    .from("votes")
    .select("option_id")
    .eq("poll_id", poll!.id)
    .eq("user_id", ids.bob);
  expect(mine!.length).toBe(1);

  // a moderator closes it early; afterwards nobody can vote and everybody sees the result
  const alice = await asUser(browser, "alice");
  await alice.goto("/social/polls");
  await pollCard(alice, `Скрытые итоги ${TAG}`)
    .getByRole("button", { name: "Закрыть досрочно" })
    .click();
  await expect(
    alice.getByText("Голосование закрыто, итоги опубликованы."),
  ).toBeVisible();
  await expect(
    pollCard(alice, `Скрытые итоги ${TAG}`).getByText("Закрыто досрочно"),
  ).toBeVisible();
  await expect(
    pollCard(alice, `Скрытые итоги ${TAG}`).getByText("1 · 100%"),
  ).toBeVisible();
  const late = await db.rpc("cast_vote", {
    p_user: ids.alice,
    p_poll: poll!.id,
    p_options: [
      (
        await db
          .from("poll_options")
          .select("id")
          .eq("poll_id", poll!.id)
          .limit(1)
          .single()
      ).data!.id,
    ],
    p_change: false,
  });
  expect(late.error?.message).toBe("poll_closed");
  const { data: audit } = await db
    .from("audit_log")
    .select("action")
    .eq("action", "poll.closed_by_moderator")
    .limit(1);
  expect(audit?.length).toBe(1);
});

test("poll validation: one option and a deadline in the past are refused", async ({
  browser,
}) => {
  const alice = await asUser(browser, "alice");
  await alice.goto("/social/polls");
  await alice.getByText("＋ Новое голосование").click();
  await alice.getByLabel("Вопрос").fill(`Плохой ${TAG}`);
  await alice.getByLabel("Вариант 1").fill("Один");
  await alice.getByLabel("Вариант 2").fill("Один");
  await alice.getByLabel("Когда закончится").fill(localInput(2));
  await alice.getByRole("button", { name: "Создать голосование" }).click();
  await expect(alice.getByText(/Проверьте голосование/)).toBeVisible();

  await alice.getByText("＋ Новое голосование").click();
  await alice.getByLabel("Вопрос").fill(`Плохой срок ${TAG}`);
  await alice.getByLabel("Вариант 1").fill("Да");
  await alice.getByLabel("Вариант 2").fill("Нет");
  await alice.getByLabel("Когда закончится").fill(localInput(-1));
  await alice.getByRole("button", { name: "Создать голосование" }).click();
  await expect(
    alice.getByText("Срок окончания должен быть в будущем."),
  ).toBeVisible();
});

test("a member creates an event; an outsider cannot join; the last seat goes to one person only", async ({
  browser,
}) => {
  const bob = await asUser(browser, "bob");
  await bob.goto("/social/calendar");
  await bob.getByText("＋ Создать событие").click();
  await bob.getByLabel("Название").fill(`Стройка ${TAG}`);
  await bob.getByLabel("Начало").fill(localInput(3));
  await bob.getByLabel("Лимит мест (необязательно)").fill("2");
  await bob.getByLabel("Место").fill("Спавн");
  await bob.getByRole("button", { name: "Создать событие" }).click();
  await expect(bob.getByText("Событие создано.")).toBeVisible();
  const card = eventCard(bob, `Стройка ${TAG}`);
  await expect(card.getByText("Вы записаны")).toBeVisible();
  await expect(card.getByText("записалось 1 из 2")).toBeVisible();
  await expect(card.getByText(/ваше время, UTC[+-−]?\d/)).toBeVisible();

  const carol = await asUser(browser, "carol");
  await carol.goto("/social/calendar");
  await expect(eventCard(carol, `Стройка ${TAG}`)).toBeVisible();
  await expect(
    eventCard(carol, `Стройка ${TAG}`).getByRole("button", {
      name: "Записаться",
    }),
  ).toHaveCount(0);
  await expect(
    eventCard(carol, `Стройка ${TAG}`).getByRole("button", {
      name: "Перенести",
    }),
  ).toHaveCount(0);

  // two members race for the one remaining seat
  await db.from("access_memberships").insert({
    user_id: ids.carol,
    status: "approved",
    decided_at: new Date().toISOString(),
  });
  const { data: ev } = await db
    .from("events")
    .select("id")
    .like("title", `%${TAG}%`)
    .single();
  const race = await Promise.all([
    db.rpc("join_event", { p_user: ids.alice, p_event: ev!.id }),
    db.rpc("join_event", { p_user: ids.carol, p_event: ev!.id }),
  ]);
  expect(race.filter((r) => !r.error).length).toBe(1);
  expect(race.find((r) => r.error)!.error!.message).toBe("event_full");
  const { count } = await db
    .from("event_attendees")
    .select("user_id", { count: "exact", head: true })
    .eq("event_id", ev!.id);
  expect(count).toBe(2);
  const again = await db.rpc("join_event", {
    p_user: ids.bob,
    p_event: ev!.id,
  });
  expect(again.error?.message).toBe("event_already_joined");
});

test("the organizer reschedules and cancels; others cannot; a cancelled event takes no sign-ups", async ({
  browser,
}) => {
  const bob = await asUser(browser, "bob");
  await bob.goto("/social/calendar");
  await eventCard(bob, `Стройка ${TAG}`)
    .locator("summary", { hasText: "Перенести" })
    .click();
  await eventCard(bob, `Стройка ${TAG}`)
    .getByLabel("Новое время")
    .fill(localInput(5));
  await eventCard(bob, `Стройка ${TAG}`)
    .getByRole("button", { name: "Перенести" })
    .last()
    .click();
  await expect(bob.getByText("Событие перенесено.")).toBeVisible();
  await expect(
    eventCard(bob, `Стройка ${TAG}`).getByText("Перенесено"),
  ).toBeVisible();

  const carol = await asUser(browser, "carol");
  await carol.goto("/social/calendar");
  await expect(
    eventCard(carol, `Стройка ${TAG}`).locator("summary", {
      hasText: "Перенести",
    }),
  ).toHaveCount(0);

  await eventCard(bob, `Стройка ${TAG}`)
    .locator("summary", { hasText: "Отменить событие" })
    .click();
  await eventCard(bob, `Стройка ${TAG}`)
    .getByLabel("Причина")
    .fill("Сервер на обновлении");
  await eventCard(bob, `Стройка ${TAG}`)
    .getByRole("button", { name: "Отменить событие" })
    .last()
    .click();
  await expect(bob.getByText("Событие отменено.")).toBeVisible();
  await expect(
    eventCard(bob, `Стройка ${TAG}`).getByText(/✕\s*Отменено/),
  ).toBeVisible();

  const { data: ev } = await db
    .from("events")
    .select("id")
    .like("title", `%${TAG}%`)
    .single();
  const join = await db.rpc("join_event", {
    p_user: ids.alice,
    p_event: ev!.id,
  });
  expect(join.error?.message).toBe("event_cancelled");
});

test("an event in the past is refused", async ({ browser }) => {
  const bob = await asUser(browser, "bob");
  await bob.goto("/social/calendar");
  await bob.getByText("＋ Создать событие").click();
  await bob.getByLabel("Название").fill(`Вчера ${TAG}`);
  await bob.getByLabel("Начало").fill(localInput(-1));
  await bob.getByRole("button", { name: "Создать событие" }).click();
  await expect(bob.getByText("Дата и время уже прошли.")).toBeVisible();
});

test("time is shown in each viewer's own zone with the offset spelled out", async ({
  browser,
}) => {
  await db.from("events").insert({
    organizer_id: ids.bob,
    title: `Зоны ${TAG}`,
    starts_at: "2027-01-15T12:00:00.000Z",
    organizer_tz: "UTC",
  });
  for (const [tz, label] of [
    ["Asia/Tokyo", "UTC+9"],
    ["America/New_York", "UTC-5"],
  ] as const) {
    const page = await asUser(browser, "bob", { timezoneId: tz });
    await page.goto("/social/calendar?m=2027-01");
    const card = eventCard(page, `Зоны ${TAG}`);
    await expect(card.getByText(`ваше время, ${label}`)).toBeVisible();
    await expect(card.getByRole("time").first()).toHaveAttribute(
      "title",
      "2027-01-15 12:00 UTC",
    );
  }
  const page = await asUser(browser, "bob", { timezoneId: "Asia/Tokyo" });
  await page.goto("/social/calendar?m=2027-01");
  await expect(eventCard(page, `Зоны ${TAG}`).getByText(/21:00/)).toBeVisible();
});
