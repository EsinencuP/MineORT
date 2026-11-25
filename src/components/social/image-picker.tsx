"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

type Tile = {
  key: string;
  name: string;
  preview: string;
  state: "uploading" | "done" | "error";
  path?: string;
  error?: string;
};

const TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Picks images and uploads each straight to private storage through a one-shot signed address; the
 * form then carries only the storage paths (`upload` fields). The server re-checks every file
 * (type by content, size, dimensions) and converts it to WebP when the form is saved.
 */
export function ImagePicker({
  max = 10,
  name = "upload",
  withCaptions = false,
  uploadUrl = "/api/social/upload-url",
}: {
  max?: number;
  name?: string;
  /** Adds a caption field under every finished file (`caption`, same order as the files). */
  withCaptions?: boolean;
  uploadUrl?: string;
}) {
  const [tiles, setTiles] = useState<Tile[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const previews = useRef(new Set<string>());
  const busy = tiles.some((t) => t.state === "uploading");

  // Keep the form from being sent while a file is still on its way.
  useEffect(() => {
    const form = rootRef.current?.closest("form");
    if (!form) return;
    const onSubmit = (e: Event) => {
      if (busy) e.preventDefault();
    };
    form.addEventListener("submit", onSubmit);
    return () => form.removeEventListener("submit", onSubmit);
  }, [busy]);

  useEffect(() => {
    const urls = previews.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, []);

  const patch = (key: string, next: Partial<Tile>) =>
    setTiles((all) => all.map((t) => (t.key === key ? { ...t, ...next } : t)));

  async function upload(tile: Tile, file: File) {
    try {
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const body = (await res.json()) as {
        path?: string;
        token?: string;
        message?: string;
      };
      if (!res.ok || !body.path || !body.token)
        throw new Error(body.message ?? "Не удалось начать загрузку.");
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        { auth: { persistSession: false } },
      );
      const { error } = await supabase.storage
        .from("media")
        .uploadToSignedUrl(body.path, body.token, file, {
          contentType: file.type,
        });
      if (error) throw new Error("Загрузка не удалась. Попробуйте ещё раз.");
      patch(tile.key, { state: "done", path: body.path });
    } catch (e) {
      patch(tile.key, {
        state: "error",
        error: e instanceof Error ? e.message : "Загрузка не удалась.",
      });
    }
  }

  function onPick(files: FileList | null) {
    if (!files) return;
    const room = max - tiles.length;
    for (const file of Array.from(files).slice(0, Math.max(room, 0))) {
      const tile: Tile = {
        key: crypto.randomUUID(),
        name: file.name,
        preview: URL.createObjectURL(file),
        state: "uploading",
      };
      previews.current.add(tile.preview);
      if (!TYPES.includes(file.type)) {
        setTiles((all) => [
          ...all,
          {
            ...tile,
            state: "error",
            error: "Допустимы только JPEG, PNG и WebP.",
          },
        ]);
        continue;
      }
      if (file.size > MAX_BYTES) {
        setTiles((all) => [
          ...all,
          { ...tile, state: "error", error: "Файл больше 10 МБ." },
        ]);
        continue;
      }
      setTiles((all) => [...all, tile]);
      void upload(tile, file);
    }
    if (inputRef.current) inputRef.current.value = "";
  }

  const remove = (key: string) => {
    const t = tiles.find((x) => x.key === key);
    if (t) {
      URL.revokeObjectURL(t.preview);
      previews.current.delete(t.preview);
    }
    setTiles((all) => all.filter((x) => x.key !== key));
  };

  return (
    <div ref={rootRef} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <label
          className={`border-brand-500 text-brand-700 hover:bg-brand-50 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border-2 px-4 text-sm font-semibold ${
            tiles.length >= max ? "pointer-events-none opacity-50" : ""
          }`}
        >
          <span aria-hidden="true">＋</span> Добавить изображения
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="sr-only"
            disabled={tiles.length >= max}
            onChange={(e) => onPick(e.target.files)}
          />
        </label>
        <span className="text-ink-muted text-xs">
          JPEG, PNG, WebP · до 10 МБ · до {max} шт.
        </span>
      </div>
      {tiles.length > 0 && (
        <ul
          className={`grid gap-2 ${withCaptions ? "grid-cols-[repeat(auto-fill,minmax(10rem,1fr))]" : "grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))]"}`}
        >
          {tiles.map((t) => (
            <li
              key={t.key}
              className="border-line bg-paper relative overflow-hidden rounded-xl border"
            >
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={t.preview}
                  alt={t.name}
                  className={`aspect-square w-full object-cover ${t.state === "done" ? "" : "opacity-50"}`}
                />
                <span
                  role={t.state === "error" ? "alert" : "status"}
                  className={`absolute inset-x-0 bottom-0 px-2 py-1 text-[11px] font-semibold ${
                    t.state === "error"
                      ? "bg-danger text-on-danger"
                      : t.state === "done"
                        ? "bg-brand-600 text-on-brand"
                        : "bg-surface text-ink-muted"
                  }`}
                >
                  {t.state === "uploading"
                    ? "Загрузка…"
                    : t.state === "done"
                      ? "Готово"
                      : (t.error ?? "Ошибка")}
                </span>
                <button
                  type="button"
                  onClick={() => remove(t.key)}
                  aria-label={`Убрать ${t.name}`}
                  className="bg-paper/90 text-ink absolute top-1 right-1 inline-flex size-7 items-center justify-center rounded-full text-sm"
                >
                  ✕
                </button>
              </div>
              {t.state === "done" && t.path && (
                <input type="hidden" name={name} value={t.path} />
              )}
              {withCaptions && t.state === "done" && (
                <input
                  type="text"
                  name="caption"
                  maxLength={200}
                  placeholder="Подпись (необязательно)"
                  aria-label={`Подпись к ${t.name}`}
                  className="bg-paper text-ink border-line m-2 min-h-10 w-[calc(100%-1rem)] rounded-lg border px-2 text-xs"
                />
              )}
            </li>
          ))}
        </ul>
      )}
      {busy && (
        <p role="status" className="text-ink-muted text-sm">
          Дождитесь окончания загрузки…
        </p>
      )}
    </div>
  );
}
