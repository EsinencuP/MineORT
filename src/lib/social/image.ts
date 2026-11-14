import sharp from "sharp";
import { SocialError } from "./errors";

export const MAX_BYTES = 10 * 1024 * 1024;
export const MAX_SIDE = 4096;
const ALLOWED = new Set(["jpeg", "png", "webp"]);

/**
 * Validates by content, not by file name or declared type, and re-encodes to WebP: EXIF/GPS and any
 * trailing data are dropped, SVG/HTML/executables are rejected because they do not decode as a raster.
 */
export async function normalizeImage(
  input: Buffer,
): Promise<{ data: Buffer; width: number; height: number }> {
  if (input.length === 0) throw new SocialError("invalid_image");
  if (input.length > MAX_BYTES) throw new SocialError("file_too_large");
  const opts = {
    limitInputPixels: MAX_SIDE * MAX_SIDE,
    failOn: "error",
  } as const;
  let format: string | undefined;
  let width = 0;
  let height = 0;
  try {
    const meta = await sharp(input, opts).metadata();
    format = meta.format;
    width = meta.width ?? 0;
    height = meta.height ?? 0;
  } catch {
    throw new SocialError("invalid_image");
  }
  if (!format || !ALLOWED.has(format))
    throw new SocialError("invalid_image_type");
  if (width > MAX_SIDE || height > MAX_SIDE)
    throw new SocialError("image_too_big");
  try {
    const { data, info } = await sharp(input, opts)
      .rotate() // apply the EXIF orientation before the metadata is dropped
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height };
  } catch {
    throw new SocialError("invalid_image");
  }
}
