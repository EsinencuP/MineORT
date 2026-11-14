import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;
const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.4,
  strokeLinecap: "square",
  strokeLinejoin: "miter",
  "aria-hidden": true,
} as const;

/** Blocky arrow icons: square caps keep them in the pixel style. */
export const ArrowRight = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4 12h15M13 6l6 6-6 6" />
  </svg>
);
export const ArrowLeft = (p: P) => (
  <svg {...base} {...p}>
    <path d="M20 12H5M11 6l-6 6 6 6" />
  </svg>
);
export const ArrowUpRight = (p: P) => (
  <svg {...base} {...p}>
    <path d="M7 17 17 7M8 7h9v9" />
  </svg>
);
export const PlayIcon = (p: P) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}>
    <path d="M8 5h3v2h2v2h2v2h2v2h-2v2h-2v2h-2v2H8z" />
  </svg>
);
