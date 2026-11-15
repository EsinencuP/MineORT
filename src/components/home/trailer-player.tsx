"use client";

import { useState } from "react";

const VIDEO_ID = "YFM6tFcqwCc";

/**
 * Trailer of the previous season. Nothing is requested from YouTube until the visitor presses play:
 * the page shows our own picture first (no third-party request, no cookies), then swaps in the
 * privacy-friendly youtube-nocookie player.
 */
export function TrailerPlayer({
  poster,
  title = "Трейлер прошлого сезона",
}: {
  poster: string;
  title?: string;
}) {
  const [playing, setPlaying] = useState(false);

  if (playing)
    return (
      <iframe
        className="absolute inset-0 size-full"
        src={`https://www.youtube-nocookie.com/embed/${VIDEO_ID}?autoplay=1&rel=0&modestbranding=1`}
        title={title}
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    );

  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      aria-label={`${title}: смотреть`}
      className="group absolute inset-0 size-full cursor-pointer"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={poster}
        alt=""
        loading="lazy"
        className="size-full object-cover"
      />
      <span className="absolute inset-0 bg-black/25 transition-colors group-hover:bg-black/10" />
      <span className="absolute inset-0 flex flex-col items-center justify-center gap-3">
        <span className="bg-brand-600 text-on-brand flex size-20 items-center justify-center rounded-full shadow-lg ring-4 ring-white/30 transition-transform group-hover:scale-110 group-focus-visible:scale-110">
          <svg
            viewBox="0 0 24 24"
            className="ml-1 size-9"
            fill="currentColor"
            aria-hidden="true"
            shapeRendering="crispEdges"
          >
            <path d="M7 4h3v2h2v2h2v2h2v2h2v2h-2v2h-2v2h-2v2h-2v2H7z" />
          </svg>
        </span>
        <span className="font-pixel rounded-full bg-black/55 px-4 py-1.5 text-sm text-white">
          {title}
        </span>
        <span className="rounded-full bg-black/45 px-3 py-0.5 text-[11px] text-white/85">
          Видео откроется с YouTube
        </span>
      </span>
    </button>
  );
}
