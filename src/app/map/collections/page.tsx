import Link from "next/link";
import { notFound } from "next/navigation";
import { createCollectionAction } from "@/app/actions/collections";
import { PendingButton } from "@/components/social/pending-button";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { collectionsEnabled, listCollections } from "@/lib/map/collections";
import { getMarkerViewer } from "@/lib/map/markers";

export const metadata = { title: "Подборки атласа" };
const FIELD = "border-line bg-paper min-h-11 rounded-xl border px-3 text-sm";

export default async function CollectionsPage({
  searchParams,
}: PageProps<"/map/collections">) {
  if (!collectionsEnabled()) notFound();
  const [viewer, feedback] = await Promise.all([
    getMarkerViewer(),
    searchParams,
  ]);
  const collections = await listCollections(viewer.userId);
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6 sm:px-8 sm:py-10">
      <Link href="/map" className="text-brand-700 text-sm underline">
        ← Атлас
      </Link>
      <h1 className="text-3xl">Подборки атласа</h1>
      <Notice error={feedback.error} />
      {(viewer.member || viewer.staff) && (
        <Card>
          <details>
            <summary className="text-brand-700 min-h-11 cursor-pointer py-2 font-semibold">
              Создать подборку
            </summary>
            <form
              action={createCollectionAction}
              className="flex flex-col gap-3"
            >
              <label className="flex flex-col gap-1 text-sm">
                Название
                <input
                  name="title"
                  required
                  minLength={3}
                  maxLength={80}
                  className={FIELD}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Описание
                <textarea
                  name="description"
                  maxLength={500}
                  rows={2}
                  className={`${FIELD} py-2`}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Ссылки на метки в порядке показа
                <textarea
                  name="markers"
                  required
                  maxLength={8500}
                  rows={4}
                  placeholder="/map?m=…"
                  className={`${FIELD} py-2`}
                />
                <span className="text-ink-muted text-xs">
                  Одна ссылка на строку, до 24 меток.
                </span>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Видимость
                <select name="visibility" className={FIELD}>
                  <option value="private">Только я</option>
                  <option value="public">Все</option>
                </select>
              </label>
              <PendingButton className="self-start">
                Создать подборку
              </PendingButton>
            </form>
          </details>
        </Card>
      )}
      {!collections.length && (
        <p className="text-ink-muted text-sm">Подборок пока нет.</p>
      )}
      {collections.map((collection) => (
        <Card key={collection.id}>
          <Link
            href={`/map/collections/${collection.id}`}
            className="text-brand-700 font-semibold underline"
          >
            {collection.title}
          </Link>
          {collection.description && (
            <p className="text-ink-muted mt-2 text-sm break-words">
              {collection.description}
            </p>
          )}
        </Card>
      ))}
    </div>
  );
}
