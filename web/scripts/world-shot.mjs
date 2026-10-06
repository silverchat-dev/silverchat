// Renders views of a Meldan set to JPEG files from the development bench, with the GPU, so a set can be judged and
// its stills made. The dev server must be running (pnpm dev).
//   node scripts/world-shot.mjs --set hill --view ask --out /tmp/ask.jpg
//   node scripts/world-shot.mjs --set market --at 0,4,40 --look 0,4,0 --hour 14 --out /tmp/m.jpg --size 1600x900
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

import { chromium } from "playwright";

const { values: o } = parseArgs({
  options: {
    set: { type: "string", default: "hill" },
    view: { type: "string" },
    at: { type: "string" },
    look: { type: "string" },
    hour: { type: "string" },
    out: { type: "string", default: "/tmp/world-shot.jpg" },
    size: { type: "string", default: "1600x900" },
    base: { type: "string", default: "http://localhost:3200" },
    wait: { type: "string", default: "12" },
  },
});
const [width, height] = o.size.split("x").map(Number);
// headless Chrome still draws on the GPU (ANGLE on Metal), and opens no window
const browser = await chromium.launch({ headless: true, args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width, height } });
const q = new URLSearchParams({ set: o.set, ...(o.view ? { view: o.view } : {}), ...(o.hour ? { hour: o.hour } : {}) });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
// the local chain may be off: its refused connections are not the world's errors
page.on("console", (m) => m.type() === "error" && !/8545|ERR_CONNECTION_REFUSED/.test(m.text()) && errors.push(m.text()));
await page.goto(`${o.base}/world-lab?${q}`);
await page.waitForFunction(() => !!window.lab?.get().controls, null, { timeout: 180000 });
await page.waitForTimeout(Number(o.wait) * 1000);
const data = await page.evaluate(
  ({ at, look }) => {
    const s = window.lab.get();
    if (at) s.camera.position.set(...at.split(",").map(Number));
    if (look) s.controls.target.set(...look.split(",").map(Number));
    s.controls.update();
    for (let i = 0; i < 3; i++) s.advance(performance.now() + i * 16);
    s.gl.render(s.scene, s.camera);
    const tris = s.gl.info.render.triangles;
    s.advance(performance.now());
    return { url: s.gl.domElement.toDataURL("image/jpeg", 0.88), tris };
  },
  { at: o.at, look: o.look },
);
writeFileSync(o.out, Buffer.from(data.url.split(",")[1], "base64"));
// GPU time of one full frame, measured by the GPU itself
const gpuMs = await page.evaluate(async () => {
  const s = window.lab.get();
  const gl = s.gl.getContext();
  const ext = gl.getExtension("EXT_disjoint_timer_query_webgl2");
  if (!ext) return null;
  const q = gl.createQuery();
  gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
  s.advance(performance.now());
  gl.endQuery(ext.TIME_ELAPSED_EXT);
  for (let i = 0; i < 40 && !gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE); i++) await new Promise((r) => setTimeout(r, 50));
  return gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE) ? Math.round(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e5) / 10 : null;
});
console.log(JSON.stringify({ out: o.out, gpuMs, triangles: data.tris, errors: errors.slice(0, 5) }));
await browser.close();
