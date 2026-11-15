import "server-only";
import { cache } from "react";
import { hasConfirmedTotp } from "@/lib/admin/store";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/supabase-admin";

/**
 * Who is looking (SC-SOC-06): a guest reads official news and the public gallery; a signed-in
 * player without admission reads public posts; a member also publishes and sees their own private
 * posts; a suspended member is limited to public content; staff moderate.
 */
export type ViewerClass = "guest" | "user" | "member" | "restricted" | "staff";

export type Viewer = {
  userId: string | null;
  cls: ViewerClass;
  canPublish: boolean;
  canModerate: boolean;
};

export const GUEST: Viewer = {
  userId: null,
  cls: "guest",
  canPublish: false,
  canModerate: false,
};

/** Memoised per request: the page and its metadata resolve the viewer once. */
export const getViewer = cache(async (): Promise<Viewer> => {
  const user = await getCurrentUser();
  if (!user) return GUEST;
  // Staff powers need a staff (12 h) session and confirmed TOTP, exactly like /admin (AC-34).
  // Without them a moderator is treated like any other player here.
  if (
    (user.site_role === "moderator" || user.site_role === "admin") &&
    user.isAdminSession &&
    (await hasConfirmedTotp(user.userId))
  ) {
    return {
      userId: user.userId,
      cls: "staff",
      canPublish: true,
      canModerate: true,
    };
  }
  const { data } = await db()
    .from("access_memberships")
    .select("status")
    .eq("user_id", user.userId)
    .in("status", ["approved", "suspended"])
    .maybeSingle();
  const cls: ViewerClass =
    data?.status === "approved"
      ? "member"
      : data?.status === "suspended"
        ? "restricted"
        : "user";
  return {
    userId: user.userId,
    cls,
    canPublish: cls === "member",
    canModerate: false,
  };
});

/** Can this viewer read a post? Hidden and deleted posts are never shown here (staff use the queue). */
export function canSeePost(
  v: Viewer,
  post: { kind: string; visibility: string; author_id: string },
): boolean {
  if (v.cls === "guest")
    return post.kind === "news" && post.visibility === "public";
  if (post.visibility === "public") return true;
  if (post.visibility === "private") return post.author_id === v.userId;
  return false; // guild visibility arrives with the guild wave
}
