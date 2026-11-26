"use client";

// Self-contained screens of the map, ported from AtlasMap (MIT, erkinpaw): MapScreen.drawToolBar,
// drawStatus and drawDims, and SettingsScreen. They hold no map state of their own; the map view
// passes what they show and gets back what the player chose. Sizes are in GUI pixels.

import Link from "next/link";
import type { Ref } from "react";
import { THEMES, toolIcon, type AtlasTheme } from "./atlas-theme";
import { IconButton, Panel } from "./atlas-ui";
import { DRAW_TOOLS, PALETTE, WIDTHS, type DrawTool } from "./drawing";

export type Dim = "overworld" | "nether";
export const DIM_NAMES: Record<Dim, string> = {
  overworld: "Верхний мир",
  nether: "Незер",
};
export type MapPrefs = {
  players: boolean;
  drawings: boolean;
  markers: boolean;
};

const px = (n: number) => `${n}px`;
const at = (g: number) => (n: number) => px(n * g);

/* ------------------------------------------------------------------ drawing bar */

export const DRAW_BAR_W = 20 * 11 + 15;

export function DrawBar(props: {
  theme: AtlasTheme;
  g: number;
  /** the left edge, in screen pixels */
  left: number;
  tool: DrawTool;
  widthIdx: number;
  colorIdx: number;
  onTool: (t: DrawTool) => void;
  onWidth: (i: number) => void;
  onColor: (i: number) => void;
  onUndo: () => void;
  onClear: () => void;
}) {
  const { theme, g } = props;
  const u = at(g);
  // a white or parchment ink would vanish on the bar, so its dots are drawn in ink
  const dot =
    PALETTE[props.colorIdx] === "#ffffff" ||
    PALETTE[props.colorIdx] === "#f2e6c8"
      ? "var(--ink)"
      : PALETTE[props.colorIdx];
  return (
    <Panel
      style={{
        left: px(props.left),
        top: u(6),
        width: u(DRAW_BAR_W),
        height: u(64),
      }}
      role="group"
      aria-label="Рисование"
    >
      {DRAW_TOOLS.map((d, i) => (
        <div
          key={d.tool}
          className="absolute"
          style={{ left: u(6 + i * 20), top: u(4) }}
        >
          <IconButton
            theme={theme}
            icon={d.icon}
            label={d.label}
            size={18}
            offset={i + 3}
            pressed={props.tool === d.tool}
            onClick={() => props.onTool(d.tool)}
          />
        </div>
      ))}
      {WIDTHS.map((wd, i) => {
        const on = props.widthIdx === i;
        return (
          <button
            key={wd}
            type="button"
            aria-label={`Толщина ${wd}`}
            aria-pressed={on}
            className="absolute grid place-items-center"
            style={{
              left: u(6 + 5 * 20 + 4 + i * 14),
              top: u(4),
              width: u(13),
              height: u(18),
              cursor: "pointer",
              background: on
                ? "color-mix(in srgb, var(--gold) 25%, transparent)"
                : undefined,
              border: on ? `${u(1)} solid var(--gold)` : undefined,
            }}
            onClick={() => props.onWidth(i)}
          >
            <span
              style={{ width: u(wd + 1), height: u(wd + 1), background: dot }}
            />
          </button>
        );
      })}
      <div
        className="absolute"
        style={{ left: u(DRAW_BAR_W - 7 - 38 - 1), top: u(4) }}
      >
        <IconButton
          theme={theme}
          icon="undo"
          label="Отменить [Ctrl+Z]"
          size={18}
          offset={9}
          onClick={props.onUndo}
        />
      </div>
      <div
        className="absolute"
        style={{ left: u(DRAW_BAR_W - 7 - 18 - 1), top: u(4) }}
      >
        <IconButton
          theme={theme}
          icon="trash"
          label="Стереть все рисунки этого измерения"
          size={18}
          offset={10}
          onClick={props.onClear}
        />
      </div>
      {PALETTE.map((col, i) => (
        <button
          key={col + i}
          type="button"
          aria-label={`Цвет ${i + 1}`}
          aria-pressed={props.colorIdx === i}
          className="atlas-swatch absolute"
          style={{
            left: u(7 + (i % 20) * 11 - 1),
            top: u(27 + Math.floor(i / 20) * 11 - 1),
            background: col,
          }}
          onClick={() => props.onColor(i)}
        />
      ))}
    </Panel>
  );
}

/* ------------------------------------------------------------------ status bar */

/** MapScreen.drawStatus: the staff cursor readout and the scale bar. */
export function StatusBar({
  g,
  left,
  staff,
  cursorRef,
  scalePx,
  blocks,
}: {
  g: number;
  left: number;
  staff: boolean;
  cursorRef: Ref<HTMLSpanElement>;
  scalePx: number;
  blocks: number;
}) {
  const u = at(g);
  const rule = (style: React.CSSProperties) => (
    <span className="absolute" style={{ background: "var(--ink)", ...style }} />
  );
  return (
    <Panel
      className="flex items-center"
      style={{
        left: u(left),
        bottom: u(6),
        height: u(16),
        padding: `0 ${u(6)}`,
        gap: u(5),
      }}
    >
      {staff && (
        <span
          ref={cursorRef}
          style={{ marginRight: u(7), whiteSpace: "pre" }}
        />
      )}
      <span
        className="relative"
        style={{ width: px(scalePx * g), height: u(7), flex: "none" }}
        aria-hidden="true"
      >
        {rule({ left: 0, right: 0, bottom: u(1), height: u(2) })}
        {rule({ left: 0, bottom: 0, width: u(1), height: u(7) })}
        {rule({ right: 0, bottom: 0, width: u(1), height: u(7) })}
        {rule({ left: "50%", bottom: u(1), width: u(1), height: u(4) })}
      </span>
      <span style={{ color: "var(--ink-soft)" }}>{blocks} бл.</span>
    </Panel>
  );
}

/* ------------------------------------------------------------------ dimensions */

export function DimsMenu(props: {
  g: number;
  left: number;
  top: number;
  dim: Dim;
  onPick: (d: Dim) => void;
  onClose: () => void;
}) {
  const u = at(props.g);
  return (
    <>
      <div className="atlas-dim" onClick={props.onClose} />
      <Panel
        role="group"
        aria-label="Измерения"
        style={{
          left: u(props.left),
          top: u(props.top),
          width: u(150),
          padding: `${u(5)} ${u(7)} ${u(7)}`,
        }}
      >
        <div className="atlas-title" style={{ marginBottom: u(5) }}>
          Измерения
        </div>
        <div className="flex flex-col" style={{ gap: u(3) }}>
          {(["overworld", "nether"] as const).map((d) => (
            <button
              key={d}
              type="button"
              className="atlas-text-btn"
              aria-pressed={props.dim === d}
              onClick={() => props.onPick(d)}
            >
              {props.dim === d ? `» ${DIM_NAMES[d]} «` : DIM_NAMES[d]}
            </button>
          ))}
        </div>
      </Panel>
    </>
  );
}

/* ------------------------------------------------------------------ settings */

/** SettingsScreen: the eight designs, what the map shows, and the author credit. */
export function SettingsDialog(props: {
  theme: AtlasTheme;
  g: number;
  /** the window width in GUI pixels */
  gw: number;
  prefs: MapPrefs;
  hasCollections: boolean;
  onTheme: (t: AtlasTheme) => void;
  onPrefs: (p: MapPrefs) => void;
  onClose: () => void;
}) {
  const { theme, g, prefs } = props;
  const u = at(g);
  const width = Math.min(props.gw - 16, 430);
  const twoCols = width >= 380;
  const colW = twoCols ? (width - 30) / 2 : width - 20;
  const tileW = (colW - 4) / 2;
  const toggle = (key: keyof MapPrefs, label: string) => (
    <button
      type="button"
      className="atlas-text-btn"
      aria-pressed={prefs[key]}
      onClick={() => props.onPrefs({ ...prefs, [key]: !prefs[key] })}
    >
      {label}: {prefs[key] ? "вкл" : "выкл"}
    </button>
  );
  return (
    <>
      <div
        className="atlas-dim"
        style={{ background: "var(--dim)" }}
        onClick={props.onClose}
      />
      <Panel
        role="dialog"
        aria-label="Настройки"
        style={{
          left: "50%",
          top: "50%",
          transform: "translate(-50%,-50%)",
          width: u(width),
          maxHeight: `calc(100% - ${u(16)})`,
          padding: `${u(6)} ${u(10)} ${u(28)}`,
          overflowY: "auto",
        }}
      >
        <div className="atlas-title" style={{ marginBottom: u(7) }}>
          Настройки
        </div>
        <div className="absolute" style={{ right: u(4), top: u(4) }}>
          <IconButton
            theme={theme}
            icon="close"
            label="Закрыть настройки"
            size={13}
            offset={2}
            onClick={props.onClose}
          />
        </div>
        <div
          className={twoCols ? "flex" : "flex flex-col"}
          style={{ gap: u(10) }}
        >
          <div style={{ width: u(colW) }}>
            <div className="atlas-section">Оформление</div>
            <div className="grid grid-cols-2" style={{ gap: u(4) }}>
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="atlas-theme"
                  aria-pressed={theme.id === t.id}
                  aria-label={t.name}
                  onClick={() => props.onTheme(t)}
                  style={{
                    width: u(tileW),
                    backgroundImage: `url(${t.panel})`,
                    color: t.ink,
                  }}
                >
                  <span className="absolute" style={{ left: u(4), top: u(4) }}>
                    {t.name}
                  </span>
                  {theme.id === t.id && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={toolIcon(t, "check")}
                      alt=""
                      className="absolute"
                      style={{
                        right: u(2),
                        top: u(2),
                        width: u(12),
                        height: u(12),
                      }}
                    />
                  )}
                  <span
                    className="absolute"
                    style={{
                      left: u(3),
                      bottom: u(3),
                      width: u(26),
                      height: u(10),
                      background: `url(${t.panelDark}) 0 0 / ${u(256)}`,
                      border: `${u(1)} solid ${t.ink}`,
                    }}
                  />
                  <span
                    className="absolute"
                    style={{
                      left: u(33),
                      right: u(5),
                      bottom: u(7),
                      height: u(2),
                      background: t.accent,
                    }}
                  />
                </button>
              ))}
            </div>
          </div>
          <div style={{ width: u(colW) }}>
            <div className="atlas-section">Карта</div>
            <div className="flex flex-col" style={{ gap: u(3) }}>
              {toggle("players", "Игроки на карте")}
              {toggle("markers", "Метки на карте")}
              {toggle("drawings", "Рисунки на карте")}
            </div>
            <p className="atlas-hint" style={{ marginTop: u(6) }}>
              Рисунки хранятся только в этом браузере.
            </p>
            {props.hasCollections && (
              <Link
                href="/map/collections"
                className="atlas-text-btn"
                style={{ marginTop: u(6) }}
              >
                Подборки атласа
              </Link>
            )}
            <p className="atlas-hint" style={{ marginTop: u(6) }}>
              Вид карты и интерфейс — мод{" "}
              <a
                href="https://github.com/erkinpaw/atlasmap"
                className="underline"
                rel="noreferrer"
                target="_blank"
              >
                AtlasMap
              </a>{" "}
              (erkinpaw, лицензия{" "}
              <a
                href="/map/ATLASMAP-LICENSE.txt"
                className="underline"
                target="_blank"
              >
                MIT
              </a>
              ).
            </p>
          </div>
        </div>
        <div
          className="absolute"
          style={{ left: "50%", bottom: u(6), transform: "translateX(-50%)" }}
        >
          <button
            type="button"
            className="atlas-text-btn"
            style={{ width: u(100) }}
            onClick={props.onClose}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={toolIcon(theme, "check")} alt="" />
            Готово
          </button>
        </div>
      </Panel>
    </>
  );
}
