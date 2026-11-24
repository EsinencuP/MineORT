import { describe, expect, it } from "vitest";
import {
  channelEnabled,
  DEFAULT_PREFERENCES,
  nextTelegramWindow,
} from "./preferences";

describe("notification preferences", () => {
  it("keeps site consent independent from Telegram consent and type overrides", () => {
    const preferences = {
      ...DEFAULT_PREFERENCES,
      channels: {
        events: { telegram: true },
        event_reminder: { telegram: false },
      },
    };
    expect(
      channelEnabled(preferences, "events", "telegram", "event_reminder"),
    ).toBe(false);
    expect(
      channelEnabled(preferences, "events", "site", "event_reminder"),
    ).toBe(true);
    expect(
      channelEnabled(preferences, "events", "telegram", "event_cancelled"),
    ).toBe(true);
  });

  it("waits for the local end of quiet hours that cross midnight", () => {
    const now = new Date("2026-12-01T02:35:00Z");
    expect(
      nextTelegramWindow(
        { ...DEFAULT_PREFERENCES, quiet_from: "22:00", quiet_to: "08:00" },
        now,
        now,
      ).toISOString(),
    ).toBe("2026-12-01T06:00:00.000Z");
  });

  it("moves a digest received after the cut-off to the next local evening", () => {
    const now = new Date("2026-12-01T17:00:00Z");
    expect(
      nextTelegramWindow(
        { ...DEFAULT_PREFERENCES, telegram_mode: "digest" },
        now,
        now,
      ).toISOString(),
    ).toBe("2026-12-02T16:00:00.000Z");
  });

  it("delivers the following morning when quiet hours cover the digest deadline", () => {
    const now = new Date("2026-12-01T15:00:00Z");
    expect(
      nextTelegramWindow(
        {
          ...DEFAULT_PREFERENCES,
          telegram_mode: "digest",
          quiet_from: "18:00",
          quiet_to: "08:00",
        },
        now,
        now,
      ).toISOString(),
    ).toBe("2026-12-02T06:00:00.000Z");
  });
});
