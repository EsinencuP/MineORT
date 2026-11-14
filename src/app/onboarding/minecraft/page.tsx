import type { Metadata } from "next";
import { getAccessOverview, getProfile } from "@/lib/access/store";
import { requireUser } from "@/lib/auth/guards";
import { getWhitelistState } from "@/lib/bridge/whitelist";
import { getSettings } from "@/lib/guides/store";
import { safely } from "@/lib/safe";
import { OnboardingView } from "@/components/portal/onboarding-view";

export const metadata: Metadata = { title: "Подключи своего персонажа" };
export const dynamic = "force-dynamic";

const CODE = /^[A-Za-z0-9_-]{8,64}$/;
const DAY = 86_400_000;

/** Date from which a new application is allowed, or null when the cooldown is over. */
function retryDate(decidedAt: number | null): string | null {
  if (!decidedAt) return null;
  const until = decidedAt + 7 * DAY;
  return until > Date.now()
    ? new Date(until).toLocaleDateString("ru-RU")
    : null;
}

export default async function OnboardingPage({
  searchParams,
}: PageProps<"/onboarding/minecraft">) {
  const user = await requireUser("/onboarding/minecraft");
  const sp = await searchParams;
  const [o, wl, profile, settings] = await Promise.all([
    getAccessOverview(user.userId),
    getWhitelistState(user.userId),
    getProfile(user.userId),
    safely("settings", getSettings, null),
  ]);

  const app = o.application;
  const decidedAt = app?.decided_at ? Date.parse(app.decided_at) : null;
  const rejected = app?.status === "rejected";
  const retryOn = rejected ? retryDate(decidedAt) : null;
  const code =
    typeof sp.code === "string" && CODE.test(sp.code) ? sp.code : null;

  return (
    <OnboardingView
      profile={profile}
      nick={o.identity?.nickname ?? null}
      nickLocked={
        o.membership?.status === "approved" ||
        o.identity?.binding_status === "confirmed"
      }
      rulesAccepted={o.rulesAccepted}
      invitePrefill={code}
      application={
        app
          ? {
              status: app.status as
                "pending" | "approved" | "rejected" | "withdrawn",
              reason: app.decision_reason,
              retryOn,
            }
          : null
      }
      viaInvitation={
        !!o.membership &&
        !!(o.membership as { source_redemption_id?: string | null })
          .source_redemption_id
      }
      membershipApproved={o.membership?.status === "approved"}
      whitelistApplied={wl?.desired === "on" && wl.applied_state === "applied"}
      error={typeof sp.error === "string" ? sp.error : null}
      ok={typeof sp.ok === "string" ? sp.ok : null}
      supportContact={settings?.support_contact || null}
    />
  );
}
