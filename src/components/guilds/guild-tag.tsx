/** Readable label color for a guild color (WCAG-style relative luminance). */
function textOn(hex: string) {
  const n = Number.parseInt(hex.slice(1), 16);
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const l =
    0.2126 * lin((n >> 16) & 255) +
    0.7152 * lin((n >> 8) & 255) +
    0.0722 * lin(n & 255);
  return l > 0.4 ? "#10161b" : "#ffffff";
}

/** The guild tag as a colored pixel-style chip; the color is the guild's own. */
export function GuildTag({
  tag,
  color,
  className = "",
}: {
  tag: string;
  color: string;
  className?: string;
}) {
  const safe = /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#2fbf71";
  return (
    <span
      className={`font-pixel inline-flex items-center rounded-md px-2 py-0.5 text-xs tracking-wide ${className}`}
      style={{ background: safe, color: textOn(safe) }}
    >
      {tag}
    </span>
  );
}
