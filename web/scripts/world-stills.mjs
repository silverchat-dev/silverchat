// Makes the still of every stop: what slow devices see, what shows while the world loads, and what stays if it fails.
// Each still is the stop's own camera pose on the development bench, saved to public/world/stills/<stop>.webp.
// The dev server must be running; ffmpeg with libwebp encodes.
//   node scripts/world-stills.mjs            every stop
//   node scripts/world-stills.mjs pulse ask  some stops
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

// stop, set, pose: the same pairs as src/world/stops.ts
const STOPS = [
  ["gate", "hill", "gate"],
  ["pulse", "hill", "pulse"],
  ["ask", "hill", "ask"],
  ["predict", "bridge", "predict"],
  ["realm", "market", "realm"],
  ["fork", "tunnel", "fork"],
  ["library", "library", "library"],
  ["riddle", "pyramid", "riddle"],
];
const only = process.argv.slice(2);
mkdirSync("public/world/stills", { recursive: true });
for (const [stop, set, view] of STOPS.filter(([s]) => !only.length || only.includes(s))) {
  const raw = `/tmp/still-${stop}.jpg`;
  const out = execFileSync("node", ["scripts/world-shot.mjs", "--set", set, "--view", view, "--out", raw, "--size", "1920x1080", "--wait", "14"], { encoding: "utf8" });
  // grass is noise to an encoder: 1600 wide at quality 62 keeps a still near 160 kB
  execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-i", raw, "-vf", "scale=1600:-1", "-c:v", "libwebp", "-quality", "62", `public/world/stills/${stop}.webp`]);
  console.log(stop, out.trim());
}
