"use client";

// Marker screens ported from AtlasMap's MapScreen (MIT, erkinpaw): the marker list on the left, the
// marker card and the editor on the right, the icon chooser and the colour chooser. Sizes in GUI px.

import { useMemo, useState } from "react";
import { bookmarkAction } from "@/app/actions/discussions";
import { toolIcon, type AtlasTheme } from "./atlas-theme";
import { IconButton, Panel, TextButton } from "./atlas-ui";
import { fmtDistance, PALETTE } from "./drawing";
import icons from "./icons.json";
import { MarkerMedia } from "./marker-media";
import { routeLength } from "@/lib/map/route-geometry";
import type { MapMarker } from "./render/markers";

type IconInfo = { id: string; ru: string; en: string };
export const ICONS = (icons as { icons: IconInfo[] }).icons;
const NAMES = new Map(ICONS.map((i) => [i.id, i]));
export const iconName = (id: string) => NAMES.get(id)?.ru ?? id;

/** Icons whose name or id holds every word of the query; Russian adjective endings are ignored. */
export function searchIcons(query: string): IconInfo[] {
  const words = query
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) =>
      w.length >= 4 && /[а-яё](ий|ый|ой|ая|яя|ое|ее|ые|ие)$/.test(w)
        ? w.slice(0, -2)
        : w,
    );
  if (words.length === 0) return ICONS;
  return ICONS.filter((i) => {
    const hay = `${i.id} ${i.ru} ${i.en}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

export const VISIBILITY_NAMES = {
  public: "Все",
  guild: "Гильдия",
  private: "Личная",
} as const;

const u = (g: number, n: number) => `${n * g}px`;

/** A marker icon in the page: its own colours, or its grey copy multiplied by the ink. */
export function MarkerIcon({
  icon,
  color,
  size,
  g,
  faded,
}: {
  icon: string;
  color: string | null;
  size: number;
  g: number;
  faded?: boolean;
}) {
  const box = {
    width: u(g, size),
    height: u(g, size),
    opacity: faded ? 0.45 : 1,
  };
  if (!color)
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/map/ui/markers/${icon}.png`}
        alt=""
        draggable={false}
        style={box}
      />
    );
  const tint = `url(/map/ui/markers_tint/${icon}.png)`;
  return (
    <span
      aria-hidden="true"
      style={{
        ...box,
        display: "inline-block",
        flex: "none",
        backgroundImage: tint,
        backgroundColor: color,
        backgroundBlendMode: "multiply",
        backgroundSize: "100% 100%",
        maskImage: tint,
        maskSize: "100% 100%",
        WebkitMaskImage: tint,
        WebkitMaskSize: "100% 100%",
        imageRendering: "pixelated",
      }}
    />
  );
}

/* ------------------------------------------------------------------ list */

export const SORTS = [
  { id: "name", label: "По названию" },
  { id: "distance", label: "По расстоянию" },
  { id: "date", label: "Сначала новые" },
  { id: "icon", label: "По иконке" },
] as const;
export type SortId = (typeof SORTS)[number]["id"];

const ICON_ORDER = new Map(ICONS.map((i, n) => [i.id, n]));

export function sortMarkers(
  list: MapMarker[],
  sort: SortId,
  query: string,
  from: [number, number],
) {
  const q = query.toLowerCase().trim();
  const out = list.filter(
    (m) =>
      !q ||
      m.name.toLowerCase().includes(q) ||
      m.description.toLowerCase().includes(q),
  );
  const dist = (m: MapMarker) => Math.hypot(m.x - from[0], m.z - from[1]);
  const byName = (a: MapMarker, b: MapMarker) =>
    a.name.localeCompare(b.name, "ru");
  if (sort === "distance") out.sort((a, b) => dist(a) - dist(b));
  else if (sort === "date")
    out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  else if (sort === "icon")
    out.sort(
      (a, b) =>
        (ICON_ORDER.get(a.icon) ?? 999) - (ICON_ORDER.get(b.icon) ?? 999) ||
        byName(a, b),
    );
  else out.sort(byName);
  return out;
}

export function MarkerList(props: {
  theme: AtlasTheme;
  g: number;
  width: number;
  total: number;
  markers: MapMarker[];
  selected: string | null;
  hidden: Set<string>;
  sort: SortId;
  query: string;
  from: [number, number];
  emptyText: string;
  onSort: (dir: 1 | -1) => void;
  onQuery: (q: string) => void;
  onSelect: (m: MapMarker) => void;
  onToggleHidden: (id: string) => void;
  onToggleAll: () => void;
}) {
  const { theme, g } = props;
  const anyVisible = props.markers.some((m) => !props.hidden.has(m.id));
  const sortLabel = SORTS.find((s) => s.id === props.sort)!.label;
  return (
    <Panel
      className="flex flex-col"
      role="region"
      aria-label="Список меток"
      style={{
        left: u(g, 6 + 20 + 8),
        top: u(g, 6),
        bottom: u(g, 6),
        width: u(g, props.width),
        padding: `${u(g, 4)} ${u(g, 6)} ${u(g, 6)}`,
      }}
    >
      <div className="atlas-title" style={{ marginBottom: u(g, 4) }}>
        Метки · {props.total}
      </div>
      <label
        className="atlas-inset flex items-center"
        style={{ height: u(g, 14), gap: u(g, 3), padding: `0 ${u(g, 2)}` }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={toolIcon(theme, "zoom_in")}
          alt=""
          style={{ width: u(g, 10), height: u(g, 10) }}
        />
        <input
          className="atlas-input"
          placeholder="Поиск меток…"
          aria-label="Поиск меток"
          value={props.query}
          onChange={(e) => props.onQuery(e.target.value)}
        />
      </label>
      <div
        className="flex"
        style={{ gap: u(g, 2), margin: `${u(g, 4)} 0 ${u(g, 4)}` }}
      >
        <TextButton
          theme={theme}
          icon="sort"
          className="flex-1"
          title="ЛКМ — следующая сортировка, ПКМ — предыдущая"
          onClick={() => props.onSort(1)}
          onContextMenu={(e) => {
            e.preventDefault();
            props.onSort(-1);
          }}
        >
          {sortLabel}
        </TextButton>
        <IconButton
          theme={theme}
          icon={anyVisible ? "eye" : "eye_off"}
          label={anyVisible ? "Скрыть все метки" : "Показать все метки"}
          size={18}
          onClick={props.onToggleAll}
        />
      </div>
      <div className="atlas-sep" />
      <ul
        className="atlas-scroll min-h-0 flex-1"
        style={{ marginTop: u(g, 3) }}
      >
        {props.markers.length === 0 && (
          <li style={{ color: "var(--ink-soft)", padding: u(g, 3) }}>
            {props.total === 0 ? props.emptyText : "Ничего не найдено."}
          </li>
        )}
        {props.markers.map((m) => {
          const off = props.hidden.has(m.id);
          return (
            <li key={m.id} className="relative" style={{ height: u(g, 22) }}>
              <button
                type="button"
                className="atlas-row flex w-full items-center text-left"
                aria-current={props.selected === m.id}
                style={{
                  height: u(g, 20),
                  gap: u(g, 3),
                  padding: `0 ${u(g, 16)} 0 ${u(g, 2)}`,
                }}
                onClick={() => props.onSelect(m)}
              >
                <MarkerIcon
                  icon={m.icon}
                  color={m.color}
                  size={16}
                  g={g}
                  faded={off}
                />
                <span
                  className="min-w-0 flex-1 truncate"
                  style={{ color: off ? "var(--disabled)" : undefined }}
                >
                  {m.name}
                </span>
                <span style={{ color: "var(--ink-soft)" }}>
                  {Math.round(
                    Math.hypot(m.x - props.from[0], m.z - props.from[1]),
                  )}{" "}
                  бл
                </span>
              </button>
              <button
                type="button"
                className="absolute"
                aria-label={off ? "Показать" : "Скрыть"}
                title={off ? "Показать" : "Скрыть"}
                style={{
                  right: u(g, 2),
                  top: u(g, 4),
                  width: u(g, 12),
                  height: u(g, 12),
                  cursor: "pointer",
                }}
                onClick={() => props.onToggleHidden(m.id)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={toolIcon(theme, off ? "eye_off" : "eye")}
                  alt=""
                  style={{ width: "100%", height: "100%", opacity: 0.7 }}
                />
              </button>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

/* ------------------------------------------------------------------ card */

const STATUS_NOTE = {
  pending: "Ждёт проверки модератором — другие пока её не видят.",
  hidden: "Скрыта модератором.",
  approved: "",
} as const;

export function MarkerCard(props: {
  theme: AtlasTheme;
  g: number;
  width: number;
  marker: MapMarker;
  staff: boolean;
  signedIn: boolean;
  hiddenForMe: boolean;
  onClose: () => void;
  onToggleHidden: () => void;
  onGoto: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onReport: () => void;
}) {
  const { theme, g, marker: m } = props;
  const date = new Date(m.createdAt).toLocaleDateString("ru-RU");
  return (
    <Panel
      className="flex flex-col"
      role="dialog"
      aria-label={`Метка: ${m.name}`}
      style={{
        right: u(g, 6),
        top: u(g, 6),
        bottom: u(g, 6),
        width: u(g, props.width),
        padding: `${u(g, 9)} ${u(g, 8)} ${u(g, 7)}`,
      }}
    >
      <div className="absolute" style={{ right: u(g, 4), top: u(g, 4) }}>
        <IconButton
          theme={theme}
          icon="close"
          label="Закрыть"
          size={13}
          onClick={props.onClose}
        />
      </div>
      <div
        className="flex items-center"
        style={{ gap: u(g, 6), paddingRight: u(g, 12) }}
      >
        <span
          className="atlas-inset grid flex-none place-items-center"
          style={{ width: u(g, 28), height: u(g, 28) }}
        >
          <MarkerIcon icon={m.icon} color={m.color} size={24} g={g} />
        </span>
        <div className="min-w-0">
          <div className="break-words">{m.name}</div>
          <div style={{ color: "var(--ink-soft)" }}>
            {m.kind === "label"
              ? "Ориентир"
              : m.kind === "path"
                ? "Путь игрока"
                : m.kind === "route"
                  ? "Маршрут"
                  : iconName(m.icon)}
          </div>
        </div>
      </div>
      {props.staff && m.y !== undefined && (
        <div style={{ marginTop: u(g, 5), whiteSpace: "pre" }}>
          {`X ${m.x}   Y ${m.y ?? "—"}   Z ${m.z}`}
        </div>
      )}
      <div style={{ color: "var(--ink-soft)", marginTop: u(g, 4) }}>
        {m.dim === "nether" ? "Незер" : "Верхний мир"} ·{" "}
        {VISIBILITY_NAMES[m.visibility]}
      </div>
      <div style={{ color: "var(--ink-soft)" }}>
        {m.author} · {date}
      </div>
      {m.geometry && (
        <div style={{ color: "var(--ink-soft)" }}>
          Длина{" "}
          {fmtDistance(
            m.geometry.reduce(
              (length, segment) => length + routeLength(segment),
              0,
            ),
          )}{" "}
          бл.
        </div>
      )}
      {STATUS_NOTE[m.status] && (
        <div style={{ color: "var(--gold)", marginTop: u(g, 3) }}>
          {STATUS_NOTE[m.status]}
        </div>
      )}
      <div
        className="atlas-sep"
        style={{ margin: `${u(g, 6)} 0 ${u(g, 4)}` }}
      />
      <div style={{ color: "var(--ink-soft)" }}>Описание</div>
      <div
        className="atlas-inset atlas-scroll break-words whitespace-pre-line"
        style={{
          marginTop: u(g, 2),
          padding: u(g, 3),
          maxHeight: "34%",
          color: m.description ? undefined : "var(--disabled)",
        }}
      >
        {m.description || "— описания нет —"}
      </div>
      <MarkerMedia key={m.id} id={m.id} canEdit={m.canEdit} />
      <div className="flex-1" />
      <div className="grid grid-cols-2" style={{ gap: u(g, 4) }}>
        <TextButton
          theme={theme}
          icon={props.hiddenForMe ? "eye" : "eye_off"}
          onClick={props.onToggleHidden}
        >
          {props.hiddenForMe ? "Показать" : "Скрыть"}
        </TextButton>
        <TextButton theme={theme} icon="target" onClick={props.onGoto}>
          На карте
        </TextButton>
        {m.bookmarked !== undefined && (
          <form action={bookmarkAction} className="col-span-2">
            <input type="hidden" name="type" value="marker" />
            <input type="hidden" name="target" value={m.id} />
            <input type="hidden" name="return_to" value={`/map?m=${m.id}`} />
            <input
              type="hidden"
              name="remove"
              value={m.bookmarked ? "1" : "0"}
            />
            <TextButton theme={theme} type="submit" className="w-full">
              {m.bookmarked ? "Убрать закладку" : "В закладки"}
            </TextButton>
          </form>
        )}
        {m.canDelete && (
          <TextButton theme={theme} icon="trash" onClick={props.onDelete}>
            Удалить
          </TextButton>
        )}
        {m.canEdit && (
          <TextButton
            theme={theme}
            icon="gear"
            title="Изменить название, иконку, описание и видимость"
            onClick={props.onEdit}
          >
            Настроить
          </TextButton>
        )}
        {props.signedIn &&
          !m.mine &&
          m.kind !== "label" &&
          m.status === "approved" && (
            <TextButton
              theme={theme}
              className="col-span-2"
              onClick={props.onReport}
            >
              Пожаловаться
            </TextButton>
          )}
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ editor */

export type Draft = {
  boundary?: MapMarker["boundary"];
  geometry?: MapMarker["geometry"];
  id: string | null;
  kind: MapMarker["kind"];
  dim: "overworld" | "nether";
  x: number;
  z: number;
  y: number | null;
  name: string;
  description: string;
  icon: string;
  color: string | null;
  visibility: "public" | "guild" | "private";
};

export function MarkerEditor(props: {
  theme: AtlasTheme;
  g: number;
  width: number;
  draft: Draft;
  canLabel: boolean;
  inGuild: boolean;
  busy: boolean;
  error: string | null;
  onChange: (d: Draft) => void;
  onPickIcon: () => void;
  onPickColor: () => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onBoundary: () => void;
  onClearBoundary: () => void;
}) {
  const { theme, g, draft: d } = props;
  const set = (p: Partial<Draft>) => props.onChange({ ...d, ...p });
  return (
    <Panel
      className="flex flex-col"
      role="dialog"
      aria-label={d.id ? "Настройка метки" : "Новая метка"}
      style={{
        right: u(g, 6),
        top: u(g, 6),
        bottom: u(g, 6),
        width: u(g, props.width),
        padding: `${u(g, 4)} ${u(g, 8)} ${u(g, 7)}`,
      }}
    >
      <div className="atlas-title">
        {d.id ? "Настройка метки" : "Новая метка"}
      </div>
      <div className="absolute" style={{ right: u(g, 4), top: u(g, 4) }}>
        <IconButton
          theme={theme}
          icon="close"
          label="Отмена"
          size={13}
          onClick={props.onCancel}
        />
      </div>
      {d.id && (
        <div className="absolute" style={{ left: u(g, 4), top: u(g, 4) }}>
          <IconButton
            theme={theme}
            icon="trash"
            label="Удалить"
            size={13}
            onClick={props.onDelete}
          />
        </div>
      )}
      <form
        className="atlas-scroll flex min-h-0 flex-1 flex-col"
        style={{ gap: u(g, 3), marginTop: u(g, 6) }}
        onSubmit={(e) => {
          e.preventDefault();
          props.onSave();
        }}
      >
        {d.kind === "label" && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="atlas-inset px-2 py-1"
              onClick={props.onBoundary}
            >
              {d.boundary ? "Изменить область" : "Обвести область"}
            </button>
            {d.boundary && (
              <button
                type="button"
                className="atlas-inset px-2 py-1"
                onClick={props.onClearBoundary}
              >
                Удалить контур
              </button>
            )}
          </div>
        )}
        <label style={{ color: "var(--ink-soft)" }} htmlFor="marker-name">
          Название
        </label>
        <span
          className="atlas-inset flex"
          style={{ height: u(g, 16), padding: `0 ${u(g, 4)}` }}
        >
          <input
            id="marker-name"
            className="atlas-input"
            maxLength={60}
            required
            placeholder="Введите название…"
            value={d.name}
            onChange={(e) => set({ name: e.target.value })}
          />
        </span>
        <button
          type="button"
          className="atlas-text-btn"
          style={{
            height: u(g, 22),
            justifyContent: "flex-start",
            marginTop: u(g, 3),
          }}
          title="ЛКМ — выбрать иконку, ПКМ — перекрасить"
          onClick={props.onPickIcon}
          onContextMenu={(e) => {
            e.preventDefault();
            props.onPickColor();
          }}
        >
          <MarkerIcon icon={d.icon} color={d.color} size={16} g={g} />
          <span className="min-w-0 flex-1 truncate text-left">
            Иконка: {iconName(d.icon)}
          </span>
          <span style={{ color: "var(--ink-soft)" }}>▼</span>
        </button>
        <TextButton theme={theme} onClick={props.onPickColor}>
          Цвет иконки: {d.color ? "свой" : "исходный"}
        </TextButton>

        {d.kind !== "label" && (
          <>
            <div style={{ color: "var(--ink-soft)", marginTop: u(g, 4) }}>
              Кто видит
            </div>
            <div className="grid grid-cols-3" style={{ gap: u(g, 2) }}>
              {(["public", "guild", "private"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  className="atlas-text-btn"
                  aria-pressed={d.visibility === v}
                  disabled={v === "guild" && !props.inGuild}
                  title={
                    v === "guild" && !props.inGuild
                      ? "Вы не состоите в гильдии"
                      : undefined
                  }
                  style={{
                    padding: 0,
                    opacity: v === "guild" && !props.inGuild ? 0.5 : 1,
                  }}
                  onClick={() => set({ visibility: v })}
                >
                  {VISIBILITY_NAMES[v]}
                </button>
              ))}
            </div>
            {d.visibility === "public" && (
              <div className="atlas-hint">
                Публичную метку остальные увидят после проверки модератором.
              </div>
            )}
          </>
        )}
        {props.canLabel &&
          !d.id &&
          (d.kind === "point" || d.kind === "label") && (
            <TextButton
              theme={theme}
              aria-pressed={d.kind === "label"}
              onClick={() =>
                set({ kind: d.kind === "label" ? "point" : "label" })
              }
            >
              Ориентир (подпись места): {d.kind === "label" ? "да" : "нет"}
            </TextButton>
          )}

        <label
          style={{ color: "var(--ink-soft)", marginTop: u(g, 4) }}
          htmlFor="marker-desc"
        >
          Описание
        </label>
        <textarea
          id="marker-desc"
          className="atlas-inset atlas-input"
          maxLength={1000}
          rows={5}
          placeholder="Заметки об этом месте…"
          style={{ padding: u(g, 3), resize: "none", minHeight: u(g, 44) }}
          value={d.description}
          onChange={(e) => set({ description: e.target.value })}
        />
        {props.error && (
          <div role="alert" style={{ color: "#9c3b2a" }}>
            {props.error}
          </div>
        )}
        <div className="flex-1" />
        <div
          className="grid grid-cols-2"
          style={{ gap: u(g, 4), marginTop: u(g, 4) }}
        >
          <button
            type="submit"
            className="atlas-text-btn"
            disabled={props.busy}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={toolIcon(theme, "check")} alt="" />
            Сохранить
          </button>
          <TextButton theme={theme} icon="close" onClick={props.onCancel}>
            Отмена
          </TextButton>
        </div>
      </form>
    </Panel>
  );
}

/* ------------------------------------------------------------------ choosers */

function Modal(props: {
  g: number;
  width: number;
  label: string;
  theme: AtlasTheme;
  onClose: () => void;
  children: React.ReactNode;
  tall?: boolean;
}) {
  const { g } = props;
  return (
    <>
      <div
        className="atlas-dim"
        style={{ background: "var(--dim)" }}
        onClick={props.onClose}
      />
      <Panel
        role="dialog"
        aria-label={props.label}
        className="flex flex-col"
        style={{
          left: "50%",
          top: props.tall ? u(g, 8) : "50%",
          bottom: props.tall ? u(g, 8) : undefined,
          transform: props.tall ? "translateX(-50%)" : "translate(-50%,-50%)",
          width: `min(${u(g, props.width)}, calc(100% - ${u(g, 16)}))`,
          padding: `${u(g, 4)} ${u(g, 8)} ${u(g, 8)}`,
        }}
      >
        <div className="atlas-title" style={{ marginBottom: u(g, 5) }}>
          {props.label}
        </div>
        <div className="absolute" style={{ right: u(g, 4), top: u(g, 4) }}>
          <IconButton
            theme={props.theme}
            icon="close"
            label="Закрыть"
            size={13}
            onClick={props.onClose}
          />
        </div>
        {props.children}
      </Panel>
    </>
  );
}

export function IconPicker(props: {
  theme: AtlasTheme;
  g: number;
  current: string;
  color: string | null;
  onPick: (icon: string, withColor: boolean) => void;
  onClose: () => void;
}) {
  const { g } = props;
  const [q, setQ] = useState("");
  const found = useMemo(() => searchIcons(q), [q]);
  return (
    <Modal
      g={g}
      width={18 * 22 + 24}
      label={`Выберите иконку  (${ICONS.length})`}
      theme={props.theme}
      onClose={props.onClose}
      tall
    >
      <label
        className="atlas-inset flex items-center"
        style={{ height: u(g, 15), gap: u(g, 3), padding: `0 ${u(g, 2)}` }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={toolIcon(props.theme, "zoom_in")}
          alt=""
          style={{ width: u(g, 11), height: u(g, 11) }}
        />
        <input
          autoFocus
          className="atlas-input"
          aria-label="Поиск иконки"
          placeholder="Поиск иконки: дом, пещера, 12, стрелка…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </label>
      <div style={{ color: "var(--ink-soft)", margin: `${u(g, 3)} 0` }}>
        ЛКМ — выбрать, ПКМ — выбрать с цветом
      </div>
      <div className="atlas-sep" />
      <div
        className="atlas-scroll min-h-0 flex-1"
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(auto-fill, ${u(g, 22)})`,
          gridAutoRows: u(g, 22),
          justifyContent: "center",
          marginTop: u(g, 3),
        }}
      >
        {found.map((i) => (
          <button
            key={i.id}
            type="button"
            className="atlas-cell grid place-items-center"
            aria-label={i.ru}
            title={i.ru}
            aria-pressed={i.id === props.current}
            style={{ width: u(g, 20), height: u(g, 20) }}
            onClick={() => props.onPick(i.id, false)}
            onContextMenu={(e) => {
              e.preventDefault();
              props.onPick(i.id, true);
            }}
          >
            <MarkerIcon
              icon={i.id}
              color={i.id === props.current ? props.color : null}
              size={16}
              g={g}
            />
          </button>
        ))}
        {found.length === 0 && (
          <span style={{ color: "var(--disabled)", gridColumn: "1 / -1" }}>
            Ничего не найдено.
          </span>
        )}
      </div>
    </Modal>
  );
}

export function ColorPicker(props: {
  theme: AtlasTheme;
  g: number;
  icon: string;
  color: string | null;
  onPick: (color: string | null) => void;
  onClose: () => void;
}) {
  const { g } = props;
  const [hover, setHover] = useState<string | null>(null);
  const shown = hover ?? props.color;
  return (
    <Modal
      g={g}
      width={20 * 11 + 16}
      label="Цвет иконки"
      theme={props.theme}
      onClose={props.onClose}
    >
      <div className="flex" style={{ gap: u(g, 6), marginBottom: u(g, 6) }}>
        <span
          className="atlas-inset grid flex-none place-items-center"
          style={{ width: u(g, 40), height: u(g, 40) }}
        >
          <MarkerIcon icon={props.icon} color={shown} size={32} g={g} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col" style={{ gap: u(g, 4) }}>
          <span className="truncate">{iconName(props.icon)}</span>
          <TextButton theme={props.theme} onClick={() => props.onPick(null)}>
            Исходные цвета
          </TextButton>
        </div>
      </div>
      <div
        className="grid"
        style={{
          gridTemplateColumns: `repeat(20, ${u(g, 11)})`,
          gridAutoRows: u(g, 11),
        }}
      >
        {PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`Цвет ${c}`}
            aria-pressed={c === props.color}
            className="atlas-swatch"
            style={{ background: c }}
            onMouseEnter={() => setHover(c)}
            onMouseLeave={() => setHover(null)}
            onClick={() => props.onPick(c)}
          />
        ))}
      </div>
    </Modal>
  );
}

export function ReportDialog(props: {
  theme: AtlasTheme;
  g: number;
  name: string;
  error: string | null;
  busy: boolean;
  onSend: (reason: string) => void;
  onClose: () => void;
}) {
  const { g } = props;
  const [reason, setReason] = useState("");
  return (
    <Modal
      g={g}
      width={240}
      label="Жалоба на метку"
      theme={props.theme}
      onClose={props.onClose}
    >
      <form
        className="flex flex-col"
        style={{ gap: u(g, 4) }}
        onSubmit={(e) => {
          e.preventDefault();
          props.onSend(reason);
        }}
      >
        <div className="break-words">«{props.name}»</div>
        <label style={{ color: "var(--ink-soft)" }} htmlFor="report-reason">
          Что не так с этой меткой?
        </label>
        <textarea
          id="report-reason"
          autoFocus
          className="atlas-inset atlas-input"
          rows={3}
          minLength={3}
          maxLength={500}
          required
          style={{ padding: u(g, 3), resize: "none" }}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        {props.error && (
          <div role="alert" style={{ color: "#9c3b2a" }}>
            {props.error}
          </div>
        )}
        <div className="grid grid-cols-2" style={{ gap: u(g, 4) }}>
          <button
            type="submit"
            className="atlas-text-btn"
            disabled={props.busy}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={toolIcon(props.theme, "check")} alt="" />
            Отправить
          </button>
          <TextButton theme={props.theme} icon="close" onClick={props.onClose}>
            Отмена
          </TextButton>
        </div>
      </form>
    </Modal>
  );
}

export { fmtDistance };
