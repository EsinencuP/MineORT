import "server-only";
import { getCurrentUser } from "@/lib/auth/current-user";
import { hasAcceptedCurrentRules } from "@/lib/access/store";
import { db } from "@/lib/supabase-admin";
import { computeStage, type OnboardingStage } from "./stage";

/** Loads the independent dimensions for a user and derives onboarding_stage. */
export async function getStageForUser(userId: string): Promise<{
  stage: OnboardingStage;
  whitelistApplied: boolean;
}> {
  const [user, memberships, apps, rules, identity, wl] = await Promise.all([
    db().from("users").select("account_status").eq("id", userId).single(),
    db()
      .from("access_memberships")
      .select("status, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1),
    db()
      .from("applications")
      .select("status, decided_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1),
    hasAcceptedCurrentRules(userId),
    db()
      .from("minecraft_identities")
      .select("game_identity")
      .eq("user_id", userId)
      .in("binding_status", ["reserved", "confirmed"])
      .maybeSingle(),
    db()
      .from("whitelist_entries")
      .select("desired, applied_state")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  const membership = (memberships.data?.[0]?.status ?? null) as
    "pending" | "approved" | "suspended" | "revoked" | null;
  const app = apps.data?.[0];
  const whitelist = wl.data
    ? {
        desired: wl.data.desired as string,
        applied: wl.data.applied_state as string,
      }
    : null;

  const stage = computeStage({
    signedIn: true,
    accountStatus: user.data?.account_status ?? null,
    membership,
    lastApplication: app
      ? {
          status: app.status as string,
          decidedAt: app.decided_at as string | null,
        }
      : null,
    rulesAccepted: await rules,
    hasNick: !!identity.data,
    whitelist,
    gameIdentity:
      (identity.data?.game_identity as
        "unconfirmed" | "confirmed" | undefined) ?? null,
    firstLoginStarted: false, // becomes true with the game login challenge (US-E04-08)
  });
  return {
    stage,
    whitelistApplied:
      whitelist?.desired === "on" && whitelist.applied === "applied",
  };
}

/** Stage of the current visitor ("guest" without a session). */
export async function getCurrentStage(): Promise<OnboardingStage> {
  const user = await getCurrentUser();
  return user ? (await getStageForUser(user.userId)).stage : "guest";
}
