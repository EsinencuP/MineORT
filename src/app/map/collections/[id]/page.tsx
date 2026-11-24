import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { getCollection } from "@/lib/map/collections";
import { getMarkersForCollection, getMarkerViewer } from "@/lib/map/markers";

export const metadata = { title: "Подборка атласа MineOrt" };

export default async function CollectionPage({
  params,
}: PageProps<"/map/collections/[id]">) {
  const [{ id }, viewer] = await Promise.all([params, getMarkerViewer()]);
  const collection = await getCollection(viewer.userId, id);
  if (!collection) notFound();
  const markers = await getMarkersForCollection(viewer, collection.marker_ids);
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6 sm:px-8 sm:py-10">
      <Link
        href="/map/collections"
        className="text-brand-700 text-sm underline"
      >
        ← Подборки атласа
      </Link>
      <h1 className="text-3xl break-words">{collection.title}</h1>
      {collection.description && (
        <p className="text-ink-muted break-words whitespace-pre-line">
          {collection.description}
        </p>
      )}
      {!markers.length && (
        <p className="text-ink-muted text-sm">
          В этой подборке пока нет доступных мест.
        </p>
      )}
      <ol className="flex flex-col gap-3">
        {markers.map((marker) => (
          <li key={marker.id}>
            <Card className="flex flex-col gap-2">
              <Link
                href={`/map?m=${marker.id}&back=${encodeURIComponent(`/map/collections/${id}`)}`}
                className="text-brand-700 font-semibold underline"
              >
                {marker.name}
              </Link>
              {marker.description && (
                <p className="text-ink-muted text-sm break-words">
                  {marker.description}
                </p>
              )}
            </Card>
          </li>
        ))}
      </ol>
    </div>
  );
}
