// Generates the isometric voxel illustrations used by the site into public/art.
// Usage: npm run art   (deterministic: the same code always produces the same files)
import { mkdirSync, writeFileSync } from "node:fs";
import { render } from "./art/engine.ts";
import {
  cherryScene,
  cloudsScene,
  cubeScene,
  heroScene,
  houseScene,
  landscapeScene,
  lavaScene,
  leavesScene,
  meadowScene,
  slimeScene,
  snowScene,
} from "./art/scenes.ts";

mkdirSync("public/art", { recursive: true });

const jobs: [
  string,
  ReturnType<typeof heroScene>,
  { s: number; seed?: number; jitter?: number },
][] = [
  ["hero", heroScene(), { s: 9, seed: 2 }],
  ["clouds", cloudsScene(), { s: 14, jitter: 0.02 }],
  ["house", houseScene(), { s: 9 }],
  ["slime", slimeScene(), { s: 10 }],
  ["meadow", meadowScene(), { s: 8 }],
  ["snow", snowScene(), { s: 8 }],
  ["cherry", cherryScene(), { s: 9 }],
  ["lava", lavaScene(), { s: 8 }],
  ["landscape", landscapeScene(), { s: 7 }],
  ["leaves", leavesScene(), { s: 26, jitter: 0.07 }],
  ["cube", cubeScene(), { s: 40, jitter: 0 }],
];

for (const [name, vox, opts] of jobs) {
  const { svg, width, height } = render(vox, opts);
  writeFileSync(`public/art/${name}.svg`, svg);
  console.log(
    `${name}.svg ${width}x${height} ${(svg.length / 1024).toFixed(0)} KB`,
  );
}
