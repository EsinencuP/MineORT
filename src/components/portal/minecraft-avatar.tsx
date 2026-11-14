import { avatarFor } from "@/lib/avatar";

/** Blocky head for a nickname (generated locally). `size` is the edge in px. */
export function MinecraftAvatar({
  nick,
  size = 48,
  className = "",
}: {
  nick?: string | null;
  size?: number;
  className?: string;
}) {
  const a = avatarFor(nick);
  return (
    <svg
      viewBox="0 0 8 8"
      width={size}
      height={size}
      shapeRendering="crispEdges"
      role="img"
      aria-label={nick ? `Аватар ${nick}` : "Аватар не выбран"}
      className={`border-line shrink-0 rounded-xl border bg-[color:var(--surface)] ${className}`}
    >
      {a.rows.flatMap((row, y) =>
        [...row].map((ch, x) =>
          ch === "." ? null : (
            <rect
              key={`${x}-${y}`}
              x={x}
              y={y}
              width="1.02"
              height="1.02"
              fill={a.palette[ch]}
            />
          ),
        ),
      )}
    </svg>
  );
}
