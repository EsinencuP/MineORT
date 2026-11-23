"use server";

import { redirect } from "next/navigation";
import { requireFlag } from "@/lib/flags";
import { decideMarker, MarkerError } from "@/lib/map/markers";
import { getViewer } from "@/lib/social/viewer";

const str = (v: FormDataEntryValue | null) =>
  typeof v === "string" ? v.trim() : "";

/** A moderator approves a public marker or hides it; the page then shows ?ok= or ?error=. */
export async function decideMarkerAction(formData: FormData) {
  await requireFlag("ff_p1c_atlas");
  const viewer = await getViewer();
  if (!viewer.userId || !viewer.canModerate)
    redirect("/admin/moderation?error=forbidden");
  let error: string | null = null;
  try {
    await decideMarker(
      viewer.userId,
      str(formData.get("marker_id")),
      str(formData.get("decision")) === "approve" ? "approve" : "hide",
      str(formData.get("note")),
    );
  } catch (e) {
    if (!(e instanceof MarkerError)) throw e;
    error = e.code;
  }
  redirect(
    error
      ? `/admin/moderation?error=${error}`
      : "/admin/moderation?ok=marker_decided",
  );
}
