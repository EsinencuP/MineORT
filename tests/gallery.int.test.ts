import { randomInt, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { upsertTelegramUser } from "@/lib/auth/store";
import {
  deleteGalleryItem,
  getGalleryItem,
  moderateMedia,
  reportMedia,
  updateGalleryItem,
} from "@/lib/social/gallery";
import { SocialError } from "@/lib/social/errors";
import type { Viewer } from "@/lib/social/viewer";
import { db } from "@/lib/supabase-admin";

// Integration tests against a real Supabase project: gallery rights at the application layer.
const enabled =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.SUPABASE_SERVICE_ROLE_KEY;

const users: string[] = [];
const viewer = (userId: string, mod = false): Viewer => ({
  userId,
  cls: mod ? "staff" : "member",
  canPublish: true,
  canModerate: mod,
});

async function makeUser() {
  const { userId } = await upsertTelegramUser({
    telegramId: String(7_000_000_000 + randomInt(1_000_000_000)),
    username: "gal_" + randomUUID().slice(0, 6),
    name: "gal",
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

describe.skipIf(!enabled)("gallery rights (staging)", () => {
  let owner = "";
  let other = "";
  let mod = "";
  let mediaId = "";

  beforeAll(async () => {
    [owner, other, mod] = [
      await makeUser(),
      await makeUser(),
      await makeUser(),
    ];
    const { data } = await db()
      .from("media")
      .insert({
        uploader_id: owner,
        storage_key: `test/${randomUUID()}.webp`,
        bytes: 1000,
        width: 10,
        height: 10,
        visibility: "public",
      })
      .select("id")
      .single();
    mediaId = data!.id as string;
    await db().from("media_attachments").insert({
      media_id: mediaId,
      target_type: "gallery",
      target_id: owner,
      caption: "тест",
    });
  });

  afterAll(async () => {
    await db().from("moderation_reports").delete().eq("target_id", mediaId);
    await db().from("media_attachments").delete().eq("media_id", mediaId);
    await db().from("media").delete().eq("id", mediaId);
  });

  it("only the owner edits or deletes; a stranger gets 'not found', never a hint", async () => {
    await rejects(
      updateGalleryItem(viewer(other), mediaId, { caption: "взлом" }),
      "media_not_found",
    );
    await rejects(deleteGalleryItem(viewer(other), mediaId), "media_not_found");
    await rejects(
      updateGalleryItem(viewer(other), randomUUID(), { caption: "x" }),
      "media_not_found",
    );
    await updateGalleryItem(viewer(owner), mediaId, {
      caption: "новая подпись",
      category: "build",
    });
    const { data } = await db()
      .from("media_attachments")
      .select("caption, category")
      .eq("media_id", mediaId)
      .single();
    expect(data).toEqual({ caption: "новая подпись", category: "build" });
    // an invalid category is ignored, not stored
    await updateGalleryItem(viewer(owner), mediaId, { category: "nonsense" });
    expect(
      (
        await db()
          .from("media_attachments")
          .select("category")
          .eq("media_id", mediaId)
          .single()
      ).data!.category,
    ).toBe("build");
  });

  it("only moderators moderate; a hidden image is invisible to others and visible to its owner", async () => {
    await rejects(
      moderateMedia(viewer(other), mediaId, "hide", "причина"),
      "forbidden",
    );
    await rejects(
      moderateMedia(viewer(mod, true), mediaId, "hide", ""),
      "reason_too_short",
    );
    await moderateMedia(viewer(mod, true), mediaId, "hide", "нарушение правил");
    expect(await getGalleryItem(viewer(other), mediaId)).toBeNull();
    const own = await getGalleryItem(viewer(owner), mediaId);
    expect(own?.item.hidden).toBe(true);
    expect(own?.item.hiddenReason).toBe("нарушение правил");
    await moderateMedia(viewer(mod, true), mediaId, "unhide", "");
    expect((await getGalleryItem(viewer(other), mediaId))?.item.hidden).toBe(
      false,
    );
  });

  it("reports: not on one's own image, not twice, not by a guest", async () => {
    await rejects(
      reportMedia(viewer(owner), mediaId, "сам на себя"),
      "report_own",
    );
    await reportMedia(viewer(other), mediaId, "подозрительно");
    await rejects(
      reportMedia(viewer(other), mediaId, "ещё раз"),
      "report_duplicate",
    );
    await rejects(
      reportMedia(
        { userId: null, cls: "guest", canPublish: false, canModerate: false },
        mediaId,
        "гость",
      ),
      "post_forbidden",
    );
  });
});
