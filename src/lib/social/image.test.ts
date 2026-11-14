import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { normalizeImage } from "./image";

const png = (w = 40, h = 30) =>
  sharp({ create: { width: w, height: h, channels: 3, background: "#4caf50" } })
    .png()
    .toBuffer();

describe("normalizeImage", () => {
  it("re-encodes PNG and JPEG to WebP and strips EXIF", async () => {
    const jpg = await sharp({
      create: { width: 50, height: 20, channels: 3, background: "#222" },
    })
      .jpeg()
      .withExif({ IFD0: { Copyright: "secret-gps-owner" } })
      .toBuffer();
    expect((await sharp(jpg).metadata()).exif).toBeTruthy();
    const out = await normalizeImage(jpg);
    const meta = await sharp(out.data).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.exif).toBeUndefined();
    expect(out.data.includes(Buffer.from("secret-gps-owner"))).toBe(false);
    expect(out.width).toBe(50);
    expect((await normalizeImage(await png())).height).toBe(30);
  });

  it("rejects SVG, HTML, executables and garbage even under an image name", async () => {
    for (const body of [
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      "<html><script>alert(1)</script></html>",
      "MZ\x90\x00\x03\x00\x00\x00",
      "not an image",
    ]) {
      await expect(normalizeImage(Buffer.from(body))).rejects.toMatchObject({
        code: expect.stringMatching(/invalid_image/),
      });
    }
    await expect(normalizeImage(Buffer.alloc(0))).rejects.toMatchObject({
      code: "invalid_image",
    });
  });

  it("rejects GIF as a type, oversized files and oversized dimensions", async () => {
    const gif = await sharp({
      create: { width: 8, height: 8, channels: 3, background: "#fff" },
    })
      .gif()
      .toBuffer();
    await expect(normalizeImage(gif)).rejects.toMatchObject({
      code: "invalid_image_type",
    });
    await expect(
      normalizeImage(Buffer.alloc(10 * 1024 * 1024 + 1)),
    ).rejects.toMatchObject({ code: "file_too_large" });
    await expect(normalizeImage(await png(4097, 10))).rejects.toMatchObject({
      code: expect.stringMatching(/invalid_image|image_too_big/),
    });
  });

  it("does not keep polyglot trailing bytes", async () => {
    const poly = Buffer.concat([
      await png(),
      Buffer.from("<script>x</script>"),
    ]);
    const out = await normalizeImage(poly);
    expect(out.data.includes(Buffer.from("<script>"))).toBe(false);
  });
});
