"use server";

import { notFound, redirect } from "next/navigation";
import { collectionsEnabled } from "@/lib/map/collections";
import { getMarkerViewer, getMarkersForCollection } from "@/lib/map/markers";
import { EVENT_ID } from "@/lib/social/events";
import { db } from "@/lib/supabase-admin";

export async function createCollectionAction(form: FormData) {
  if (!collectionsEnabled()) notFound();
  const viewer = await getMarkerViewer();
  if (!viewer.userId || (!viewer.member && !viewer.staff)) notFound();
  const title = String(form.get("title") ?? "").trim();
  const description = String(form.get("description") ?? "").trim();
  const links = String(form.get("markers") ?? "");
  if (links.length > 8500) redirect("/map/collections?error=marker_invalid");
  const ids = [
    ...new Set(
      links
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const link = URL.parse(line, "https://mineort.invalid");
          return link?.pathname === "/map"
            ? (link.searchParams.get("m") ?? "")
            : "";
        }),
    ),
  ];
  if (
    title.length < 3 ||
    title.length > 80 ||
    description.length > 500 ||
    !ids.length ||
    ids.length > 24 ||
    ids.some((id) => !EVENT_ID.test(id)) ||
    (await getMarkersForCollection(viewer, ids)).length !== ids.length
  )
    redirect("/map/collections?error=marker_invalid");
  const { data, error } = await db()
    .from("map_collections")
    .insert({
      author_id: viewer.userId,
      title,
      description,
      marker_ids: ids,
      visibility: form.get("visibility") === "public" ? "public" : "private",
    })
    .select("id")
    .single();
  if (error) throw new Error(`create atlas collection: ${error.message}`);
  redirect(`/map/collections/${data.id}`);
}
