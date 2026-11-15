import { skinFor } from "@/lib/avatar";

/** The player's base avatar (a Minecraft default-skin face, picked by nickname). `size` is the edge in px. */
export function MinecraftAvatar({
  nick,
  size = 48,
  className = "",
}: {
  nick?: string | null;
  size?: number;
  className?: string;
}) {
  const skin = skinFor(nick);
  const frame = `border-line shrink-0 rounded-xl border bg-[color:var(--surface)] ${className}`;
  if (!skin) {
    // no nickname yet: a neutral blank head
    return (
      <svg
        viewBox="0 0 8 8"
        width={size}
        height={size}
        shapeRendering="crispEdges"
        role="img"
        aria-label="Аватар не выбран"
        className={frame}
      >
        <rect x="1" y="1" width="6" height="6" fill="#58636d" />
        <rect x="2" y="3" width="4" height="1" fill="#3b444c" />
        <rect x="2" y="5" width="4" height="1" fill="#3b444c" />
      </svg>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/avatars/${skin}.png`}
      alt={nick ? `Аватар ${nick}` : "Аватар"}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      className={`${frame} object-cover [image-rendering:pixelated]`}
    />
  );
}
