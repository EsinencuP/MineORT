import type { EventView } from "./events";

const escapeText = (text: string) =>
  text
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
const dateTime = (date: string) =>
  new Date(date)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

function fold(line: string) {
  let output = "";
  let bytes = 0;
  for (const character of line) {
    const length = Buffer.byteLength(character);
    if (bytes + length > 75) {
      output += "\r\n ";
      bytes = 1;
    }
    output += character;
    bytes += length;
  }
  return output;
}

type CalendarEvent = Pick<
  EventView,
  | "id"
  | "title"
  | "description"
  | "place"
  | "startsAt"
  | "endsAt"
  | "updatedAt"
  | "sequence"
  | "cancelled"
  | "visibility"
>;

export function renderCalendar(
  events: CalendarEvent[],
  origin: string,
  subscription = false,
) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//MineOrt//Events//RU",
    "CALSCALE:GREGORIAN",
  ];
  if (subscription) lines.push("X-WR-CALNAME:Мои события MineOrt");
  for (const event of events) {
    const url = new URL(`/social/calendar/${event.id}`, origin).href;
    const limited =
      subscription &&
      (event.visibility === "guild" || event.visibility === "private");
    const description = limited ? "" : event.description;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${event.id}@mineort-events`,
      `DTSTAMP:${dateTime(event.updatedAt)}`,
      `DTSTART:${dateTime(event.startsAt)}`,
      `DTEND:${dateTime(event.endsAt)}`,
      `SEQUENCE:${event.sequence}`,
      `STATUS:${event.cancelled ? "CANCELLED" : "CONFIRMED"}`,
      `SUMMARY:${escapeText(limited ? "Закрытое событие MineOrt" : event.title)}`,
      `DESCRIPTION:${escapeText([description, url].filter(Boolean).join("\n"))}`,
      `URL:${url}`,
    );
    if (event.place && !limited)
      lines.push(`LOCATION:${escapeText(event.place)}`);
    if (limited) lines.push("CLASS:PRIVATE");
    lines.push("END:VEVENT");
  }
  return lines.concat("END:VCALENDAR", "").map(fold).join("\r\n");
}

export function calendarResponse(contents: string, fileName: string) {
  return new Response(contents, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
