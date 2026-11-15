"use server";

import { redirect } from "next/navigation";
import { requireFlag } from "@/lib/flags";
import { safeReturnTo } from "@/lib/auth/session-policy";
import {
  addNeed,
  cancelProject,
  createProject,
  joinSupport,
  leaveSupport,
  removeNeed,
  removeSupporter,
  updateNeed,
  updateProject,
} from "@/lib/projects/store";
import { SocialError } from "@/lib/social/errors";
import { getViewer, type Viewer } from "@/lib/social/viewer";

const str = (v: FormDataEntryValue | null) =>
  typeof v === "string" ? v.trim() : "";
const int = (v: FormDataEntryValue | null) => {
  const s = str(v);
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.trunc(n) : Number.NaN;
};

async function viewerOrLogin(back: string) {
  await requireFlag("ff_p1a");
  const viewer = await getViewer();
  if (!viewer.userId)
    redirect(`/api/auth/telegram/start?return_to=${encodeURIComponent(back)}`);
  return viewer;
}

function done(back: string, error: string | null, ok: string): never {
  const url = new URL(back, "http://x");
  url.searchParams.delete("error");
  url.searchParams.delete("ok");
  url.searchParams.set(error ? "error" : "ok", error ?? ok);
  redirect(url.pathname + url.search);
}

/** Runs one project action as the current viewer and ends in a redirect with ?error=code or ?ok=key. */
async function run(
  formData: FormData,
  fallback: string,
  okKey: string,
  fn: (viewer: Viewer) => Promise<unknown>,
): Promise<never> {
  const back = safeReturnTo(str(formData.get("return_to")) || fallback);
  const viewer = await viewerOrLogin(back);
  let error: string | null = null;
  try {
    await fn(viewer);
  } catch (e) {
    if (!(e instanceof SocialError)) throw e;
    error = e.code;
  }
  return done(back, error, okKey);
}

function needsFrom(formData: FormData) {
  const titles = formData
    .getAll("need_title")
    .map((v) => (typeof v === "string" ? v : ""));
  const qty = formData
    .getAll("need_qty")
    .map((v) => (typeof v === "string" ? v : ""));
  const units = formData
    .getAll("need_unit")
    .map((v) => (typeof v === "string" ? v : ""));
  return titles.map((title, i) => ({
    title,
    quantity: qty[i] ? Number(qty[i]) : null,
    unit: units[i] ?? "",
  }));
}

function fieldsFrom(formData: FormData) {
  return {
    title: str(formData.get("title")),
    description: str(formData.get("description")),
    place: str(formData.get("place")),
    dimension: str(formData.get("dimension")),
    x: int(formData.get("x")),
    y: int(formData.get("y")),
    z: int(formData.get("z")),
    coverMediaId: str(formData.get("cover_media_id")) || null,
    maxSupporters: int(formData.get("max_supporters")),
  };
}

export async function createProjectAction(formData: FormData) {
  const back = "/social/projects/new";
  const viewer = await viewerOrLogin(back);
  let id: string | null = null;
  let error: string | null = null;
  try {
    id = await createProject(viewer, {
      ...fieldsFrom(formData),
      needs: needsFrom(formData),
    });
  } catch (e) {
    if (!(e instanceof SocialError)) throw e;
    error = e.code;
  }
  if (id) redirect(`/social/projects/${id}?ok=created`);
  return done(back, error, "created");
}

export async function updateProjectAction(formData: FormData) {
  const id = str(formData.get("project_id"));
  return run(formData, `/social/projects/${id}`, "saved", (viewer) =>
    updateProject(viewer, id, fieldsFrom(formData)),
  );
}

export async function setProjectStatusAction(formData: FormData) {
  const id = str(formData.get("project_id"));
  return run(formData, `/social/projects/${id}`, "status", (viewer) =>
    updateProject(viewer, id, { status: str(formData.get("status")) }),
  );
}

export async function addNeedAction(formData: FormData) {
  const id = str(formData.get("project_id"));
  return run(formData, `/social/projects/${id}`, "need_added", (viewer) =>
    addNeed(viewer, id, {
      title: str(formData.get("title")),
      quantity: int(formData.get("quantity")),
      unit: str(formData.get("unit")),
    }),
  );
}

export async function updateNeedAction(formData: FormData) {
  const id = str(formData.get("project_id"));
  const done = formData.get("mark");
  return run(formData, `/social/projects/${id}`, "need_saved", (viewer) =>
    updateNeed(
      viewer,
      str(formData.get("need_id")),
      done === "done"
        ? { done: true }
        : done === "undone"
          ? { done: false }
          : { quantityDone: Number(str(formData.get("quantity_done"))) },
    ),
  );
}

export async function removeNeedAction(formData: FormData) {
  const id = str(formData.get("project_id"));
  return run(formData, `/social/projects/${id}`, "need_removed", (viewer) =>
    removeNeed(viewer, str(formData.get("need_id"))),
  );
}

export async function joinSupportAction(formData: FormData) {
  const id = str(formData.get("project_id"));
  return run(formData, `/social/projects/${id}`, "joined", (viewer) =>
    joinSupport(viewer, id, {
      needId: str(formData.get("need_id")) || null,
      quantity: int(formData.get("quantity")),
      note: str(formData.get("note")),
    }),
  );
}

export async function leaveSupportAction(formData: FormData) {
  const id = str(formData.get("project_id"));
  return run(formData, `/social/projects/${id}`, "left", (viewer) =>
    leaveSupport(viewer, id),
  );
}

export async function removeSupporterAction(formData: FormData) {
  const id = str(formData.get("project_id"));
  return run(
    formData,
    `/social/projects/${id}`,
    "supporter_removed",
    (viewer) => removeSupporter(viewer, id, str(formData.get("nick"))),
  );
}

export async function cancelProjectAction(formData: FormData) {
  const id = str(formData.get("project_id"));
  return run(formData, `/social/projects/${id}`, "cancelled", (viewer) =>
    cancelProject(viewer, id, str(formData.get("reason"))),
  );
}
