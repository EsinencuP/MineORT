"use client";

// Building blocks in the look of AtlasMap's Paper.java (MIT, erkinpaw): a parchment panel with
// gilded corners, a square icon button, a text button with an optional icon. Sizes in GUI pixels.

import { toolIcon, type AtlasTheme } from "./atlas-theme";

export const TB = 20;

export function Panel({
  className = "",
  children,
  style,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`atlas-panel ${className}`} style={style} {...rest}>
      <i className="atlas-stud tl" />
      <i className="atlas-stud tr" />
      <i className="atlas-stud bl" />
      <i className="atlas-stud br" />
      {children}
    </div>
  );
}

export function IconButton({
  theme,
  icon,
  label,
  pressed,
  disabled,
  onClick,
  size = TB,
  iconSize,
  offset = 0,
  src,
}: {
  theme: AtlasTheme;
  icon: string;
  /** an image other than a tool icon */
  src?: string;
  label: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  size?: number;
  iconSize?: number;
  offset?: number;
}) {
  const style = {
    "--s": size,
    "--i": iconSize ?? (size >= 20 ? 16 : size - 4),
    // every button shows another part of the sheet, as the mod's tiling by position does
    "--bx": `calc(var(--g) * ${-offset * 37})`,
    "--by": `calc(var(--g) * ${-offset * 61})`,
  } as React.CSSProperties;
  return (
    <button
      type="button"
      className="atlas-btn disabled:cursor-not-allowed disabled:opacity-60"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      style={style}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src ?? toolIcon(theme, icon)} alt="" draggable={false} />
    </button>
  );
}

export function TextButton({
  theme,
  icon,
  children,
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  theme: AtlasTheme;
  icon?: string;
}) {
  return (
    <button type="button" className={`atlas-text-btn ${className}`} {...rest}>
      {icon && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={toolIcon(theme, icon)} alt="" draggable={false} />
      )}
      {children}
    </button>
  );
}
