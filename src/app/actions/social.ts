"use server";

import { redirect } from "next/navigation";
import { requireFlag, type FlagName } from "@/lib/flags";
import { safeReturnTo } from "@/lib/auth/session-policy";
import { SocialError } from "@/lib/social/errors";
import {
  addToGallery,
  deleteGalleryItem,
  moderateMedia,
  reportMedia,
  updateGalleryItem,
} from "@/lib/social/gallery";
import {
  createPost,
  decideReport,
  deletePost,
  reportPost,
  setPinned,
  toggleLike,
} from "@/lib/social/store";
import {
  cancelEvent,
  createEvent,
  joinEvent,
  leaveEvent,
  rescheduleEvent,
} from "@/lib/social/events";
import { castVote, closePoll, createPoll } from "@/lib/social/polls";
import { getViewer, type Viewer } from "@/lib/social/viewer";

const str = (v: FormDataEntryValue | null) =>
  typeof v === "string" ? v.trim() : "";
const strs = (formData: FormData, name: string) =>
  formData
    .getAll(name)
    .filter((v): v is string => typeof v === "string" && v.length > 0);

/**
 * Runs a Social mutation as the current viewer (re-checked on every call: actions are reachable by
 * a direct POST) and always ends in a redirect with ?error=code or ?ok=key.
 */
async function run(
  formData: FormData,
  fallback: string,
  okKey: string,
  fn: (viewer: Viewer) => Promise<unknown>,
  flag: FlagName = "ff_p1a",
): Promise<never> {
  await requireFlag(flag);
  const back = safeReturnTo(str(formData.get("return_to")) || fallback);
  const viewer = await getViewer();
  if (!viewer.userId)
    redirect(`/api/auth/telegram/start?return_to=${encodeURIComponent(back)}`);
  let error: string | null = null;
  try {
    await fn(viewer);
  } catch (e) {
    if (!(e instanceof SocialError)) throw e;
    error = e.code;
  }
  const url = new URL(back, "http://x");
  url.searchParams.delete("error");
  url.searchParams.delete("ok");
  url.searchParams.set(error ? "error" : "ok", error ?? okKey);
  redirect(url.pathname + url.search);
}

const visibilityOf = (v: string): "public" | "private" =>
  v === "private" ? "private" : "public";

export async function publishPostAction(formData: FormData) {
  return run(formData, "/social", "posted", (viewer) =>
    createPost(viewer, {
      body: str(formData.get("body")),
      kind: str(formData.get("kind")) === "news" ? "news" : "post",
      visibility: visibilityOf(str(formData.get("visibility"))),
      pinned: formData.get("pinned") === "on",
      incomingPaths: strs(formData, "upload"),
      galleryMediaIds: strs(formData, "gallery_media"),
    }),
  );
}

export async function deletePostAction(formData: FormData) {
  return run(formData, "/social", "deleted", (viewer) =>
    deletePost(
      viewer,
      str(formData.get("post_id")),
      str(formData.get("reason")),
    ),
  );
}

export async function pinPostAction(formData: FormData) {
  return run(formData, "/social", "pinned", (viewer) =>
    setPinned(
      viewer,
      str(formData.get("post_id")),
      formData.get("pin") === "1",
    ),
  );
}

export async function likePostAction(formData: FormData) {
  return run(formData, "/social", "liked", (viewer) =>
    toggleLike(viewer, str(formData.get("post_id"))),
  );
}

export async function reportPostAction(formData: FormData) {
  return run(formData, "/social", "reported", (viewer) =>
    reportPost(
      viewer,
      str(formData.get("post_id")),
      str(formData.get("reason")),
    ),
  );
}

export async function addToGalleryAction(formData: FormData) {
  return run(formData, "/social/gallery?mine=1", "added", (viewer) =>
    addToGallery(viewer, strs(formData, "upload"), {
      // empty captions are kept, so that they stay aligned with their files
      captions: formData
        .getAll("caption")
        .map((v) => (typeof v === "string" ? v : "")),
      category: str(formData.get("category")),
      visibility: visibilityOf(str(formData.get("visibility"))),
    }),
  );
}

export async function updateGalleryItemAction(formData: FormData) {
  return run(formData, "/social/gallery?mine=1", "saved", (viewer) =>
    updateGalleryItem(viewer, str(formData.get("media_id")), {
      caption: str(formData.get("caption")),
      category: str(formData.get("category")),
      visibility: str(formData.get("visibility")) || undefined,
    }),
  );
}

export async function galleryVisibilityAction(formData: FormData) {
  return run(formData, "/social/gallery?mine=1", "visibility", (viewer) =>
    updateGalleryItem(viewer, str(formData.get("media_id")), {
      visibility: visibilityOf(str(formData.get("visibility"))),
    }),
  );
}

export async function deleteGalleryItemAction(formData: FormData) {
  return run(formData, "/social/gallery?mine=1", "removed", (viewer) =>
    deleteGalleryItem(viewer, str(formData.get("media_id"))),
  );
}

export async function reportMediaAction(formData: FormData) {
  return run(formData, "/social/gallery", "reported", (viewer) =>
    reportMedia(
      viewer,
      str(formData.get("media_id")),
      str(formData.get("reason")),
    ),
  );
}

export async function moderateMediaAction(formData: FormData) {
  const a = str(formData.get("action"));
  const action = a === "unhide" || a === "delete" ? a : "hide";
  return run(formData, "/social/gallery", "moderated", (viewer) =>
    moderateMedia(
      viewer,
      str(formData.get("media_id")),
      action,
      str(formData.get("reason")),
    ),
  );
}

export async function decideReportAction(formData: FormData) {
  const d = str(formData.get("decision"));
  const decision = d === "hide" || d === "delete" ? d : "dismiss";
  return run(formData, "/admin/moderation", "decided", (viewer) =>
    decideReport(
      viewer,
      str(formData.get("report_id")),
      decision,
      str(formData.get("note")),
    ),
  );
}

/* ---------------- polls and events (wave P1b) ---------------- */
const P1B: FlagName = "ff_p1b_social";
const num = (v: FormDataEntryValue | null) => {
  const n = Number.parseInt(str(v), 10);
  return Number.isFinite(n) ? n : null;
};

export async function createPollAction(formData: FormData) {
  return run(
    formData,
    "/social/polls",
    "created",
    (viewer) =>
      createPoll(viewer, {
        question: str(formData.get("question")),
        options: strs(formData, "option"),
        closesAt: str(formData.get("closes_at")),
        multiChoice: formData.get("multi") === "on",
        maxChoices: num(formData.get("max_choices")),
        allowChange: formData.get("allow_change") === "on",
        resultsAfterClose: formData.get("results") === "after_close",
      }),
    P1B,
  );
}

export async function castVoteAction(formData: FormData) {
  return run(
    formData,
    "/social/polls",
    formData.get("change") === "1" ? "changed" : "voted",
    (viewer) =>
      castVote(
        viewer,
        str(formData.get("poll_id")),
        strs(formData, "choice"),
        formData.get("change") === "1",
      ),
    P1B,
  );
}

export async function closePollAction(formData: FormData) {
  return run(
    formData,
    "/social/polls",
    "closed",
    (viewer) => closePoll(viewer, str(formData.get("poll_id"))),
    P1B,
  );
}

export async function createEventAction(formData: FormData) {
  return run(
    formData,
    "/social/calendar",
    "created",
    (viewer) =>
      createEvent(viewer, {
        title: str(formData.get("title")),
        description: str(formData.get("description")),
        startsAt: str(formData.get("starts_at")),
        tz: str(formData.get("tz")),
        durationMinutes: num(formData.get("duration")) ?? 60,
        place: str(formData.get("place")),
        category: str(formData.get("category")),
        seatsLimit: num(formData.get("seats")),
      }),
    P1B,
  );
}

export async function joinEventAction(formData: FormData) {
  return run(
    formData,
    "/social/calendar",
    "joined",
    (viewer) => joinEvent(viewer, str(formData.get("event_id"))),
    P1B,
  );
}

export async function leaveEventAction(formData: FormData) {
  return run(
    formData,
    "/social/calendar",
    "left",
    (viewer) => leaveEvent(viewer, str(formData.get("event_id"))),
    P1B,
  );
}

export async function rescheduleEventAction(formData: FormData) {
  return run(
    formData,
    "/social/calendar",
    "rescheduled",
    (viewer) =>
      rescheduleEvent(
        viewer,
        str(formData.get("event_id")),
        str(formData.get("starts_at")),
      ),
    P1B,
  );
}

export async function cancelEventAction(formData: FormData) {
  return run(
    formData,
    "/social/calendar",
    "cancelled",
    (viewer) =>
      cancelEvent(
        viewer,
        str(formData.get("event_id")),
        str(formData.get("reason")),
      ),
    P1B,
  );
}
