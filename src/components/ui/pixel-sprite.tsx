/**
 * Draws a small pixel-art sprite from ASCII rows. Each distinct character maps to a colour;
 * "." is transparent. Used for decorative marks (pickaxe, leaf sprig) in the page identity.
 */
export function PixelSprite({
  rows,
  colors,
  size = 6,
  className,
  title,
}: {
  rows: string[];
  colors: Record<string, string>;
  size?: number;
  className?: string;
  title?: string;
}) {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const cells: React.ReactNode[] = [];
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      const fill = colors[ch];
      if (fill)
        cells.push(
          <rect
            key={`${x}-${y}`}
            x={x}
            y={y}
            width="1.02"
            height="1.02"
            fill={fill}
          />,
        );
    }),
  );
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width={w * size}
      height={h * size}
      shapeRendering="crispEdges"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {cells}
    </svg>
  );
}

// Pale pickaxe watermark next to "About" in the reference.
export const PICKAXE = [
  "...........aaaaaa.",
  "........aaabbbbbbaa",
  "......aabb.....bbbaa",
  ".....abb.........bba",
  "....ab......ccc...ba",
  "...ab......cc.b....a",
  "..ab......cc..b.....",
  ".........cc...b.....",
  "........cc....b.....",
  ".......cc.....b.....",
  "......cc............",
  ".....cc.............",
  "....cc..............",
  "...cc...............",
  "..cc................",
  ".cc.................",
];
export const PICKAXE_COLORS = { a: "#e4d5bc", b: "#efe4d0", c: "#e9dcc4" };

// Little green leaf sprig used as an accent next to headings.
export const LEAF = [
  "......aa",
  ".....abba",
  "....abbba",
  "...abbbba",
  "..abbbbba",
  ".abbbbbaa",
  "abbbbba..",
  ".aaaaa...",
  "..c......",
  ".c.......",
];
export const LEAF_COLORS = { a: "#478035", b: "#6baf5d", c: "#3c6e2d" };
