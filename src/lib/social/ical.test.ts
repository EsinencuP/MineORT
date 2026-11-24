import { describe, expect, it } from "vitest";
import { renderCalendar } from "./ical";

const item = {
  id: "test-event",
  title: "Рейд, часть 2",
  description: "Первая строка\n" + "Текст с переносом ".repeat(8),
  startsAt: "2026-12-01T19:00:00+02:00",
  endsAt: "2026-12-01T20:00:00+02:00",
  updatedAt: "2026-11-25T08:00:00Z",
  sequence: 0,
  cancelled: false,
  place: "Тайная гавань",
  visibility: "public" as const,
};

describe("calendar export", () => {
  it("writes UTC and folds UTF-8 lines without corrupting text", () => {
    const result = renderCalendar([item], "https://mineort.example");
    expect(result).toContain("DTSTART:20261201T170000Z\r\n");
    expect(result).toContain("DTEND:20261201T180000Z\r\n");
    expect(result).toContain("SUMMARY:Рейд\\, часть 2\r\n");
    expect(result.replace(/\r\n /g, "")).toContain(
      "DESCRIPTION:Первая строка\\n",
    );
    expect(
      result.split("\r\n").every((line) => Buffer.byteLength(line) <= 75),
    ).toBe(true);
  });

  it("keeps the same UID and changes the sequence after a cancellation", () => {
    const result = renderCalendar(
      [{ ...item, sequence: 3, cancelled: true }],
      "https://mineort.example",
    );
    expect(result).toContain("UID:test-event@mineort-events");
    expect(result).toContain("SEQUENCE:3\r\nSTATUS:CANCELLED");
  });

  it("omits closed event details from a personal feed", () => {
    const result = renderCalendar(
      [{ ...item, visibility: "guild" }],
      "https://mineort.example",
      true,
    );
    expect(result).toContain("CLASS:PRIVATE");
    expect(result).toContain("Закрытое событие MineOrt");
    expect(result).not.toContain(item.title);
    expect(result).not.toContain(item.place);
  });
});
