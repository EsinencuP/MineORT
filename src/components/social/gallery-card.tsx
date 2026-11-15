import Link from "next/link";
import { withBack } from "@/lib/nav/back";
import { CATEGORIES, type GalleryItem } from "@/lib/social/gallery";

/** One thumbnail in the gallery grid; the whole card opens the viewer. */
export function GalleryCard({
  item,
  back,
}: {
  item: GalleryItem;
  /** The list address (filters, page) this card is shown on, so the viewer can return to it. */
  back?: string;
}) {
  const alt = item.caption || `Скриншот игрока ${item.owner}`;
  return (
    <Link
      href={withBack(`/social/gallery/${item.id}`, back)}
      className="border-line bg-surface hover:bg-brand-50 lift group flex h-full flex-col overflow-hidden rounded-2xl border"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/api/media/${item.id}`}
        alt={alt}
        width={item.width}
        height={item.height}
        loading="lazy"
        className="aspect-[4/3] w-full object-cover"
      />
      <span className="flex flex-1 flex-col gap-1 p-3">
        {item.caption && (
          <span className="line-clamp-2 text-sm font-medium break-words">
            {item.caption}
          </span>
        )}
        <span className="text-ink-muted mt-auto flex items-center justify-between gap-2 text-xs">
          <span className="truncate">{item.owner}</span>
          <span className="bg-brand-50 text-brand-700 shrink-0 rounded-md px-1.5 py-0.5 font-medium">
            {CATEGORIES[item.category]}
          </span>
        </span>
      </span>
    </Link>
  );
}
