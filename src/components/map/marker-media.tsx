"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ImagePicker } from "@/components/social/image-picker";
import { MAX_MARKER_SCREENSHOTS } from "@/lib/map/marker-media-rules";

export function MarkerMedia({ id, canEdit }: { id: string; canEdit: boolean }) {
  const endpoint = `/api/map/markers/${id}/media`;
  const [screenshots, setScreenshots] = useState<string[] | null>(null);
  const [active, setActive] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [pickerKey, setPickerKey] = useState(0);
  const viewer = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(endpoint, { signal: controller.signal });
        if (!response.ok) throw new Error(String(response.status));
        const data = (await response.json()) as { screenshots: string[] };
        if (!controller.signal.aborted) setScreenshots(data.screenshots);
      } catch {
        if (!controller.signal.aborted)
          setError("Не удалось загрузить скриншоты.");
      }
    }
    void load();
    return () => controller.abort();
  }, [endpoint]);

  async function attach(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const uploads = new FormData(event.currentTarget).getAll("upload");
    if (!uploads.length) {
      setError("Выберите скриншоты и дождитесь загрузки.");
      return;
    }
    setPending(true);
    setError("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ uploads }),
      });
      const data = (await response.json()) as {
        screenshots?: string[];
        message?: string;
      };
      if (!response.ok || !data.screenshots)
        throw new Error(data.message ?? "Не удалось прикрепить скриншоты.");
      setScreenshots(data.screenshots);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Не удалось прикрепить скриншоты.",
      );
    } finally {
      setPending(false);
      setPickerKey((value) => value + 1);
    }
  }

  const count = screenshots?.length ?? 0;
  const open = (index: number) => {
    setActive(index);
    viewer.current?.showModal();
  };
  const step = (delta: number) =>
    setActive((index) =>
      index === null ? null : (index + delta + count) % count,
    );

  if (screenshots === null && !error) return null;
  if (!canEdit && !count && !error) return null;
  const selected = active === null ? undefined : screenshots?.[active];

  return (
    <section className="atlas-scroll mt-2 min-h-0" aria-label="Скриншоты метки">
      {count > 0 && (
        <div className="grid grid-cols-5 gap-1">
          {screenshots?.map((mediaId, index) => (
            <button
              key={mediaId}
              type="button"
              className="atlas-inset aspect-square overflow-hidden"
              aria-label={`Открыть скриншот ${index + 1}`}
              onClick={() => open(index)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`${endpoint}/${mediaId}?size=thumb`}
                className="size-full object-cover"
                alt=""
              />
            </button>
          ))}
        </div>
      )}
      {canEdit && screenshots && count < MAX_MARKER_SCREENSHOTS && (
        <details className="mt-2">
          <summary className="cursor-pointer">Добавить скриншоты</summary>
          <form
            className="mt-2 flex flex-col gap-2"
            onSubmit={(event) => void attach(event)}
          >
            <ImagePicker
              key={pickerKey}
              max={MAX_MARKER_SCREENSHOTS - count}
              uploadUrl={`${endpoint}/upload-url`}
            />
            <button type="submit" className="atlas-text-btn" disabled={pending}>
              {pending ? "Сохраняем…" : "Прикрепить"}
            </button>
          </form>
        </details>
      )}
      {error && (
        <p className="mt-2" role="alert">
          {error}
        </p>
      )}
      <dialog
        ref={viewer}
        aria-label="Просмотр скриншотов метки"
        className="fixed inset-0 m-auto w-[min(92vw,960px)] border-2 bg-(--cream) p-3 text-(--ink) backdrop:bg-black/75"
        onClose={() => setActive(null)}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (count < 2) return;
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            step(event.key === "ArrowLeft" ? -1 : 1);
          }
        }}
      >
        <div className="flex flex-col gap-2">
          {selected && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`${endpoint}/${selected}`}
              alt={`Скриншот ${(active ?? 0) + 1} из ${count}`}
              className="mx-auto max-h-[75dvh] max-w-full object-contain"
              style={{ imageRendering: "auto" }}
            />
          )}
          <div className="flex flex-wrap justify-center gap-2">
            {count > 1 && (
              <>
                <button
                  type="button"
                  className="atlas-text-btn"
                  onClick={() => step(-1)}
                >
                  Предыдущий
                </button>
                <button
                  type="button"
                  className="atlas-text-btn"
                  onClick={() => step(1)}
                >
                  Следующий
                </button>
              </>
            )}
            <button
              type="button"
              className="atlas-text-btn"
              onClick={() => viewer.current?.close()}
            >
              Закрыть просмотр
            </button>
          </div>
        </div>
      </dialog>
    </section>
  );
}
