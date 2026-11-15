// Cuts the face (with the hat layer) out of the default Minecraft skins and writes 64x64 PNG avatars.
// Usage: node scripts/extract-avatars.mjs <dir with steve.png alex.png ...> public/avatars
import sharp from "sharp";
import path from "node:path";

const [, , src, out] = process.argv;
if (!src || !out)
  throw new Error("usage: extract-avatars.mjs <skins dir> <out dir>");
for (const name of ["steve", "alex", "ari", "kai", "noor", "sunny"]) {
  const file = path.join(src, `${name}.png`);
  const face = await sharp(file)
    .extract({ left: 8, top: 8, width: 8, height: 8 })
    .png()
    .toBuffer();
  const hat = await sharp(file)
    .extract({ left: 40, top: 8, width: 8, height: 8 })
    .png()
    .toBuffer();
  const head = await sharp(face)
    .composite([{ input: hat }])
    .png()
    .toBuffer();
  await sharp(head)
    .resize(64, 64, { kernel: "nearest" })
    .png({ palette: true })
    .toFile(path.join(out, `${name}.png`));
  console.log("wrote", name);
}
