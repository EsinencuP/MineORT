import { describe, expect, it } from "vitest";
import {
  CAN_CONNECT,
  ctaFor,
  computeStage,
  type OnboardingStage,
  type StageInput,
} from "./stage";

const now = Date.parse("2026-12-01T12:00:00Z");
const day = 24 * 3600_000;
const base: StageInput = {
  signedIn: true,
  accountStatus: "active",
  membership: null,
  lastApplication: null,
  rulesAccepted: true,
  hasNick: true,
  whitelist: null,
  gameIdentity: "unconfirmed",
  firstLoginStarted: false,
  now,
};
const stage = (o: Partial<StageInput>) => computeStage({ ...base, ...o });
const approved = {
  membership: "approved" as const,
  whitelist: { desired: "on", applied: "applied" },
};

describe("onboarding_stage (section 8, top to bottom)", () => {
  it("guest without a session", () =>
    expect(stage({ signedIn: false })).toBe("guest"));

  it("walks the path: rules -> nick -> access -> pending", () => {
    expect(stage({ rulesAccepted: false, hasNick: false })).toBe("needs_rules");
    expect(stage({ hasNick: false })).toBe("needs_nick");
    expect(stage({})).toBe("needs_access");
    expect(
      stage({ lastApplication: { status: "pending", decidedAt: null } }),
    ).toBe("application_pending");
    expect(stage({ membership: "pending" })).toBe("application_pending");
  });

  it("restricted overrides everything", () => {
    for (const o of [
      { accountStatus: "suspended" },
      { accountStatus: "banned", ...approved },
      { membership: "suspended" as const },
      { membership: "revoked" as const },
    ]) {
      expect(stage(o)).toBe("restricted");
    }
  });

  it("a rejected application is not a sanction; after 7 days the user may apply again", () => {
    const rejected = (daysAgo: number) => ({
      lastApplication: {
        status: "rejected",
        decidedAt: new Date(now - daysAgo * day).toISOString(),
      },
    });
    expect(stage(rejected(2))).toBe("application_rejected");
    expect(stage({ ...rejected(2), membership: "revoked" })).toBe(
      "application_rejected",
    );
    expect(stage(rejected(8))).toBe("needs_access");
  });

  it("new rules block only people without admission; admitted players are not pushed back", () => {
    expect(stage({ rulesAccepted: false })).toBe("needs_rules");
    expect(
      stage({ rulesAccepted: false, ...approved, gameIdentity: "confirmed" }),
    ).toBe("active");
  });

  it("access_preparing until the server confirms (pending, failed, drift, desired off)", () => {
    for (const applied of ["pending", "failed", "drift"]) {
      expect(
        stage({
          membership: "approved",
          whitelist: { desired: "on", applied },
        }),
      ).toBe("access_preparing");
    }
    expect(stage({ membership: "approved", whitelist: null })).toBe(
      "access_preparing",
    );
    expect(
      stage({
        membership: "approved",
        whitelist: { desired: "off", applied: "applied" },
      }),
    ).toBe("access_preparing");
  });

  it("ready_to_install -> first_login_pending -> active", () => {
    expect(stage(approved)).toBe("ready_to_install");
    expect(stage({ ...approved, firstLoginStarted: true })).toBe(
      "first_login_pending",
    );
    expect(stage({ ...approved, gameIdentity: "confirmed" })).toBe("active");
  });

  it("a drifted active player drops back to access_preparing", () => {
    expect(
      stage({
        membership: "approved",
        whitelist: { desired: "on", applied: "drift" },
        gameIdentity: "confirmed",
      }),
    ).toBe("access_preparing");
  });

  it("an admitted user without a nickname is asked for one first", () => {
    expect(stage({ membership: "approved", hasNick: false })).toBe(
      "needs_nick",
    );
  });
});

describe("main CTA per stage", () => {
  const all: OnboardingStage[] = [
    "guest",
    "restricted",
    "application_rejected",
    "needs_rules",
    "needs_nick",
    "application_pending",
    "needs_access",
    "access_preparing",
    "ready_to_install",
    "first_login_pending",
    "active",
  ];

  it("has a label and an internal target for every stage", () => {
    for (const s of all) {
      const c = ctaFor(s);
      expect(c.label.length).toBeGreaterThan(0);
      expect(c.href.startsWith("/")).toBe(true);
    }
  });

  it("matches the documented targets", () => {
    expect(ctaFor("needs_rules").href).toBe("/onboarding/minecraft");
    expect(ctaFor("needs_access").href).toBe("/onboarding/minecraft");
    expect(ctaFor("application_pending").href).toBe("/dashboard");
    expect(ctaFor("access_preparing").href).toBe("/start");
    expect(ctaFor("ready_to_install").href).toBe("/start");
    expect(ctaFor("active").label).toBe("Как подключиться");
  });

  it("the server address may be shown only once the whitelist is applied", () => {
    expect([...CAN_CONNECT].sort()).toEqual([
      "active",
      "first_login_pending",
      "ready_to_install",
    ]);
    for (const s of all.filter((x) => !CAN_CONNECT.has(x)))
      expect(CAN_CONNECT.has(s)).toBe(false);
  });
});
