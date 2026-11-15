import { randomInt, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { upsertTelegramUser } from "@/lib/auth/store";
import {
  addNeed,
  cancelProject,
  createProject,
  getProject,
  joinSupport,
  progressOf,
  removeNeed,
  removeSupporter,
  updateNeed,
  updateProject,
  type NewProject,
} from "@/lib/projects/store";
import { SocialError } from "@/lib/social/errors";
import type { Viewer } from "@/lib/social/viewer";
import { db } from "@/lib/supabase-admin";

const enabled =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.SUPABASE_SERVICE_ROLE_KEY;

const users: string[] = [];
const member = (userId: string): Viewer => ({
  userId,
  cls: "member",
  canPublish: true,
  canModerate: false,
});
async function makeUser() {
  const { userId } = await upsertTelegramUser({
    telegramId: String(7_000_000_000 + randomInt(1_000_000_000)),
    username: "pr_" + randomUUID().slice(0, 6),
    name: "pr",
  });
  users.push(userId);
  return userId;
}
const rejects = (p: Promise<unknown>, code: string) =>
  p.then(
    () => {
      throw new Error(`expected ${code}`);
    },
    (e) => {
      expect(e).toBeInstanceOf(SocialError);
      expect((e as SocialError).code).toBe(code);
    },
  );
const base = (over: Partial<NewProject> = {}): NewProject => ({
  title: "Проект " + randomUUID().slice(0, 6),
  description: "",
  place: "",
  dimension: "overworld",
  x: null,
  y: null,
  z: null,
  coverMediaId: null,
  maxSupporters: null,
  needs: [{ title: "Дерево", quantity: 10, unit: "шт." }],
  ...over,
});

describe("progressOf", () => {
  it("weights counted needs by quantity and yes/no needs by one", () => {
    expect(progressOf([])).toBe(0);
    expect(
      progressOf([
        { quantityNeeded: 100, quantityDone: 50, done: false },
        { quantityNeeded: null, quantityDone: 0, done: true },
      ]),
    ).toBe(Math.round((51 / 101) * 100));
    expect(
      progressOf([{ quantityNeeded: 10, quantityDone: 99, done: false }]),
    ).toBe(100);
    expect(
      progressOf([{ quantityNeeded: 10, quantityDone: 0, done: true }]),
    ).toBe(100);
  });
});

describe.skipIf(!enabled)("project rights and limits (staging)", () => {
  let owner = "";
  let other = "";
  let projectId = "";

  beforeAll(async () => {
    owner = await makeUser();
    other = await makeUser();
    projectId = await createProject(member(owner), base());
  });
  afterAll(async () => {
    await db()
      .from("rate_limit_counters")
      .delete()
      .like("key", `project:${owner}%`);
    await db().from("projects").delete().in("author_id", users);
  });

  it("only the author manages the project; a stranger gets 'not found'", async () => {
    const need = (await getProject(member(owner), projectId))!.needs[0];
    await rejects(
      updateProject(member(other), projectId, { title: "Взлом" }),
      "project_not_found",
    );
    await rejects(
      addNeed(member(other), projectId, { title: "x", quantity: 1, unit: "" }),
      "project_not_found",
    );
    await rejects(
      updateNeed(member(other), need.id, { done: true }),
      "project_not_found",
    );
    await rejects(removeNeed(member(other), need.id), "project_not_found");
    await rejects(
      removeSupporter(member(other), projectId, "Nobody_1"),
      "project_not_found",
    );
    await rejects(
      cancelProject(member(other), projectId, "чужой"),
      "project_not_found",
    );
    await updateNeed(member(owner), need.id, { quantityDone: 4 });
    expect((await getProject(member(owner), projectId))!.progress).toBe(40);
  });

  it("support: not for the author, not without admission, a need must belong to the project, seats are limited", async () => {
    await rejects(
      joinSupport(member(owner), projectId, {
        needId: null,
        quantity: null,
        note: "",
      }),
      "project_own",
    );
    await rejects(
      joinSupport(
        { userId: other, cls: "user", canPublish: false, canModerate: false },
        projectId,
        { needId: null, quantity: null, note: "" },
      ),
      "project_forbidden",
    );
    const foreign = await createProject(member(other), base());
    const foreignNeed = (await getProject(member(other), foreign))!.needs[0];
    const third = await makeUser();
    await rejects(
      joinSupport(member(third), projectId, {
        needId: foreignNeed.id,
        quantity: 1,
        note: "",
      }),
      "project_need_not_found",
    );
    await updateProject(member(owner), projectId, { maxSupporters: 1 });
    await joinSupport(member(other), projectId, {
      needId: null,
      quantity: null,
      note: "я",
    });
    await rejects(
      joinSupport(member(third), projectId, {
        needId: null,
        quantity: null,
        note: "",
      }),
      "project_full",
    );
    // the same player may update their own row when the project is full
    await joinSupport(member(other), projectId, {
      needId: null,
      quantity: null,
      note: "обновил",
    });
    await updateProject(member(owner), projectId, { status: "done" });
    await rejects(
      joinSupport(member(third), projectId, {
        needId: null,
        quantity: null,
        note: "",
      }),
      "project_closed",
    );
    await updateProject(member(owner), projectId, { status: "recruiting" });
  });

  it("validation: coordinates come in pairs, numbers stay in range, needs are capped", async () => {
    await rejects(
      createProject(member(owner), base({ x: 10 })),
      "project_invalid",
    );
    await rejects(
      createProject(member(owner), base({ x: 10, z: 99_000_000 })),
      "project_invalid",
    );
    await rejects(
      createProject(member(owner), base({ title: "ab" })),
      "project_invalid",
    );
    await rejects(
      createProject(
        member(owner),
        base({
          needs: Array.from({ length: 16 }, (_, i) => ({
            title: `n${i}`,
            quantity: 1,
            unit: "",
          })),
        }),
      ),
      "project_needs_limit",
    );
    await rejects(
      createProject(member(owner), base({ coverMediaId: randomUUID() })),
      "project_cover_invalid",
    );
  });

  it("at most five active projects per player", async () => {
    const who = await makeUser();
    await db()
      .from("projects")
      .insert(
        Array.from({ length: 5 }, (_, i) => ({
          author_id: who,
          title: `Активный ${i}`,
        })),
      );
    await rejects(createProject(member(who), base()), "project_limit");
    await db()
      .from("rate_limit_counters")
      .delete()
      .like("key", `project:${who}%`);
  });
});
