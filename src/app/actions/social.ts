"use server";

import { redirect } from "next/navigation";
import { requireFlag } from "@/lib/flags";
import { safeReturnTo } from "@/lib/auth/session-policy";
import { SocialError } from "@/lib/social/errors";
import {
  addToGallery,
  removeFromGallery,
  setGalleryVisibility,
} from "@/lib/social/gallery";
import {
  createPost,
  decideReport,
  deletePost,
  reportPost,
  setPinned,
  toggleLike,
} from "@/lib/social/store";
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
): Promise<never> {
  await requireFlag("ff_p1a");
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
  return run(formData, "/social/gallery", "added", (viewer) =>
    addToGallery(
      viewer,
      strs(formData, "upload"),
      visibilityOf(str(formData.get("visibility"))),
    ),
  );
}

export async function galleryVisibilityAction(formData: FormData) {
  return run(formData, "/social/gallery", "visibility", (viewer) =>
    setGalleryVisibility(
      viewer,
      str(formData.get("media_id")),
      visibilityOf(str(formData.get("visibility"))),
    ),
  );
}

export async function galleryRemoveAction(formData: FormData) {
  return run(formData, "/social/gallery", "removed", (viewer) =>
    removeFromGallery(viewer, str(formData.get("media_id"))),
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
