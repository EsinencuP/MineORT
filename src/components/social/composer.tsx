import { publishPostAction } from "@/app/actions/social";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { GalleryItem } from "@/lib/social/gallery";
import type { Viewer } from "@/lib/social/viewer";
import { ImagePicker } from "./image-picker";
import { DraftText } from "./draft-text";

/** New post form: text, optional screenshots, visibility; moderators can publish pinned news. */
export function Composer({
  viewer,
  gallery,
  back,
  advanced = false,
  published = false,
}: {
  viewer: Viewer;
  gallery: GalleryItem[];
  back: string;
  advanced?: boolean;
  published?: boolean;
}) {
  return (
    <Card aria-label="Новая публикация">
      <form action={publishPostAction} className="flex flex-col gap-4">
        <input type="hidden" name="return_to" value={back} />
        <div className="flex flex-col gap-2">
          <label htmlFor="post-body" className="font-semibold">
            Чем хочешь поделиться?
          </label>
          {viewer.userId ? (
            <DraftText
              key={String(published)}
              user={viewer.userId}
              published={published}
            />
          ) : (
            <textarea
              id="post-body"
              name="body"
              required
              maxLength={2000}
              rows={4}
              placeholder="Расскажи о постройке, находке или планах"
              className="bg-paper text-ink border-line rounded-2xl border px-4 py-3"
            />
          )}
        </div>

        <ImagePicker max={10} />

        {gallery.length > 0 && (
          <details>
            <summary className="text-brand-700 min-h-11 cursor-pointer py-2 text-sm font-semibold underline underline-offset-4">
              Выбрать из моей галереи
            </summary>
            <ul className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-2">
              {gallery.map((g) => (
                <li key={g.id}>
                  <label className="border-line has-[:checked]:border-brand-600 has-[:checked]:ring-brand-600 block cursor-pointer overflow-hidden rounded-xl border has-[:checked]:ring-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/media/${g.id}?size=thumb`}
                      alt={g.caption || "Изображение из галереи"}
                      loading="lazy"
                      className="aspect-square w-full object-cover"
                    />
                    <span className="flex items-center gap-2 px-2 py-1.5 text-xs">
                      <input
                        type="checkbox"
                        name="gallery_media"
                        value={g.id}
                        className="size-4 accent-[color:var(--brand-600)]"
                      />
                      Выбрать
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </details>
        )}

        {advanced && (
          <details>
            <summary className="text-brand-700 min-h-11 cursor-pointer py-2 text-sm font-semibold">
              Ссылка, обложка и подписи
            </summary>
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-sm">
                Ссылка на метку, подборку, событие или проект
                <input
                  name="linked"
                  maxLength={500}
                  className="border-line bg-paper min-h-11 rounded-xl border px-3"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Номер снимка для обложки
                <input
                  type="number"
                  name="cover_position"
                  min={1}
                  max={10}
                  defaultValue={1}
                  className="border-line bg-paper min-h-11 rounded-xl border px-3"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Подписи к кадрам, по одной на строку
                <textarea
                  name="captions"
                  rows={3}
                  maxLength={2000}
                  className="border-line bg-paper rounded-xl border p-3"
                />
              </label>
            </div>
          </details>
        )}

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <fieldset className="flex flex-wrap items-center gap-4">
            <legend className="sr-only">Кто видит публикацию</legend>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="radio"
                name="visibility"
                value="public"
                defaultChecked
                className="size-4 accent-[color:var(--brand-600)]"
              />
              Все
            </label>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="radio"
                name="visibility"
                value="private"
                className="size-4 accent-[color:var(--brand-600)]"
              />
              Только я
            </label>
          </fieldset>
          {viewer.canModerate && (
            <fieldset className="flex flex-wrap items-center gap-4">
              <legend className="sr-only">Официальная новость</legend>
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="kind"
                  value="news"
                  className="size-4 accent-[color:var(--brand-600)]"
                />
                Официальная новость
              </label>
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="pinned"
                  className="size-4 accent-[color:var(--brand-600)]"
                />
                Закрепить
              </label>
            </fieldset>
          )}
          <Button type="submit" className="ml-auto">
            Опубликовать
          </Button>
        </div>
      </form>
    </Card>
  );
}
