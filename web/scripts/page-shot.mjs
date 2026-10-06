// Takes pictures of a page of the site as a visitor sees it in Meldan, from the top of its panel down, so a page can be
// judged at a desk and on a phone. The dev server must be running. Without --world the visitor asks for reduced
// motion, so the still shows behind the panel and no GPU is needed.
//   node scripts/page-shot.mjs --path /pulse --out /tmp/pulse --size 1440x900 --shots 3
import { parseArgs } from "node:util";

import { chromium } from "playwright";

const { values: o } = parseArgs({
  options: {
    path: { type: "string", default: "/" },
    out: { type: "string", default: "/tmp/page" },
    size: { type: "string", default: "1440x900" },
    shots: { type: "string", default: "2" },
    base: { type: "string", default: "http://localhost:3200" },
    world: { type: "boolean", default: false },
    wait: { type: "string", default: "4" },
  },
});
const [width, height] = o.size.split("x").map(Number);
const browser = await chromium.launch(o.world ? { headless: false, args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--window-position=-2400,0"] } : {});
const context = await browser.newContext({ viewport: { width, height }, reducedMotion: o.world ? "no-preference" : "reduce", isMobile: width < 768, hasTouch: width < 768 });
await context.addInitScript(() => sessionStorage.setItem("meldan:entered", "1"));
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && !/8545|ERR_CONNECTION_REFUSED|WalletConnect|reown|walletconnect/i.test(m.text()) && errors.push(m.text().slice(0, 300)));
await page.goto(`${o.base}${o.path}`, { waitUntil: "networkidle", timeout: 180000 }).catch(() => {});
await page.waitForTimeout(Number(o.wait) * 1000);
const files = [];
for (let i = 0; i < Number(o.shots); i++) {
  const file = `${o.out}-${i}.jpg`;
  await page.screenshot({ path: file, type: "jpeg", quality: 82 });
  files.push(file);
  const more = await page.evaluate(() => {
    const el = document.getElementById("panel") ?? document.scrollingElement;
    const before = el.scrollTop;
    el.scrollTop += el.clientHeight * 0.85;
    return el.scrollTop !== before;
  });
  if (!more) break;
  await page.waitForTimeout(700);
}
console.log(JSON.stringify({ files, errors }));
await browser.close();
