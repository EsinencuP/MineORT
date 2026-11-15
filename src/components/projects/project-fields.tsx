import { DIMENSIONS, type ProjectDetail } from "@/lib/projects/store";

const field =
  "bg-paper text-ink border-line min-h-11 rounded-xl border px-3 text-sm w-full";

/** Fields shared by the create form and the author's edit form. */
export function ProjectFields({
  value,
  covers,
  idPrefix = "p",
}: {
  value?: Partial<ProjectDetail>;
  /** The author's public gallery images to choose a cover from. */
  covers: { id: string; caption: string }[];
  idPrefix?: string;
}) {
  const id = (n: string) => `${idPrefix}-${n}`;
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={id("title")} className="text-sm font-medium">
          Название
        </label>
        <input
          id={id("title")}
          name="title"
          required
          minLength={3}
          maxLength={120}
          defaultValue={value?.title}
          className={field}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={id("desc")} className="text-sm font-medium">
          Описание
        </label>
        <textarea
          id={id("desc")}
          name="description"
          rows={4}
          maxLength={2000}
          defaultValue={value?.description}
          placeholder="Что строим, зачем и как будем работать"
          className="bg-paper text-ink border-line rounded-xl border px-3 py-2 text-sm"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={id("place")} className="text-sm font-medium">
            Место
          </label>
          <input
            id={id("place")}
            name="place"
            maxLength={120}
            defaultValue={value?.place}
            placeholder="Например: спавн, берег озера"
            className={field}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={id("dim")} className="text-sm font-medium">
            Мир
          </label>
          <select
            id={id("dim")}
            name="dimension"
            defaultValue={value?.dimension ?? "overworld"}
            className={field}
          >
            {Object.entries(DIMENSIONS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <fieldset className="grid grid-cols-3 gap-3">
        <legend className="mb-1.5 text-sm font-medium">
          Координаты (необязательно: X и Z вместе)
        </legend>
        {(
          [
            ["x", "X", value?.x],
            ["y", "Y", value?.y],
            ["z", "Z", value?.z],
          ] as const
        ).map(([name, label, v]) => (
          <div key={name} className="flex flex-col gap-1.5">
            <label htmlFor={id(name)} className="text-xs font-medium">
              {label}
            </label>
            <input
              id={id(name)}
              name={name}
              type="number"
              defaultValue={v ?? undefined}
              className={field}
            />
          </div>
        ))}
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={id("max")} className="text-sm font-medium">
            Сколько помощников нужно (необязательно)
          </label>
          <input
            id={id("max")}
            name="max_supporters"
            type="number"
            min={1}
            max={500}
            defaultValue={value?.maxSupporters ?? undefined}
            className={field}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={id("cover")} className="text-sm font-medium">
            Обложка из моей галереи
          </label>
          <select
            id={id("cover")}
            name="cover_media_id"
            defaultValue={value?.coverMediaId ?? ""}
            className={field}
          >
            <option value="">Без обложки</option>
            {covers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.caption || "Без подписи"}
              </option>
            ))}
          </select>
        </div>
      </div>
    </>
  );
}
