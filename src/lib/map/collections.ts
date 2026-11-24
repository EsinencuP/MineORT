import "server-only";
import { isEnabled } from "@/lib/flags";
import { EVENT_ID } from "@/lib/social/events";
import { db } from "@/lib/supabase-admin";

export const collectionsEnabled = () =>
  isEnabled("ff_p1c_atlas") && isEnabled("ff_community_collections");

export type Collection = {
  id: string;
  title: string;
  description: string;
  visibility: "public" | "private";
  marker_ids: string[];
};
const COLS = "id,title,description,visibility,marker_ids";

function visibleCollections(userId: string | null) {
  const query = db().from("map_collections").select(COLS);
  return userId
    ? query.or(`visibility.eq.public,author_id.eq.${userId}`)
    : query.eq("visibility", "public");
}

export async function getCollection(userId: string | null, id: string) {
  if (!collectionsEnabled() || !EVENT_ID.test(id)) return null;
  const { data, error } = await visibleCollections(userId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`atlas collection: ${error.message}`);
  return data as Collection | null;
}

export async function listCollections(userId: string | null) {
  const { data, error } = await visibleCollections(userId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(`atlas collections: ${error.message}`);
  return data as Collection[];
}
