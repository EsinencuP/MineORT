// Renders the voxel illustrations in art-src/ (SVG) to WebP in public/art/. The browser decodes a
// WebP much faster than it parses and paints a 300 KB path-heavy SVG, which matters most for the
// hero image and for the blurred backdrop. Run after changing a source: `node scripts/build-art.mjs`.
import fs from "node:fs";
import sharp from "sharp";

// [name, output width in px (about 1.5-2x the largest size it is shown at), quality]
const JOBS = [
  ["hero", 1200, 74],
  ["landscape", 1100, 74],
  ["house", 640, 74],
  ["meadow", 640, 74],
  ["snow", 640, 74],
  ["lava", 640, 74],
  ["cherry", 640, 74],
  ["slime", 560, 74],
  ["leaves", 520, 70],
  ["clouds", 460, 70],
];

fs.mkdirSync("public/art", { recursive: true });
for (const [name, width, quality] of JOBS) {
  const svg = fs.readFileSync(`art-src/${name}.svg`);
  const meta = await sharp(svg).metadata();
  const out = await sharp(svg, {
    density: Math.ceil((72 * width) / meta.width),
  })
    .resize({ width })
    .webp({ quality, effort: 6, alphaQuality: 90 })
    .toBuffer({ resolveWithObject: true });
  fs.writeFileSync(`public/art/${name}.webp`, out.data);
  console.log(
    name.padEnd(10),
    `${out.info.width}x${out.info.height}`,
    `${(out.data.length / 1024).toFixed(1)} KB`,
  );
}

// The page backdrop (leaves and clouds) is blurred. Baking the blur into the picture means the
// browser does not have to run a CSS blur filter over large fixed layers on every frame.
const BLURRED = [
  ["leaves", "leaves-a", 4],
  ["leaves", "leaves-b", 9],
  ["clouds", "clouds-a", 1.6],
  ["clouds", "clouds-b", 3.2],
];
for (const [src, name, sigma] of BLURRED) {
  const buf = await sharp(`public/art/${src}.webp`)
    .blur(sigma)
    .webp({ quality: 60, effort: 6, alphaQuality: 80 })
    .toBuffer();
  fs.writeFileSync(`public/art/${name}.webp`, buf);
  console.log(
    name.padEnd(10),
    "blurred",
    `${(buf.length / 1024).toFixed(1)} KB`,
  );
}
