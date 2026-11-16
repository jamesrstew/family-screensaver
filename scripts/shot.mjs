// Screenshot the screen the way the TV sees it (1920x1080), for design review.
//   node scripts/shot.mjs <url> <out.png> [--wait ms] [--frames n,ms] [--key Key]
// --at sets the clock; --frames takes n shots ms apart (to watch the ink move); --key presses a key first.
import { chromium } from "playwright";

const [url, out, ...rest] = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : fallback;
};
const wait = Number(opt("wait", 4500));
const [frames, gap] = opt("frames", "1,0").split(",").map(Number);
const key = opt("key", null);
const width = Number(opt("width", 1920));
const height = Number(opt("height", 1080));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width, height } });
// --at "2026-11-16T22:30:00-08:00" runs the TV's clock from that moment.
const at = opt("at", null);
if (at) await page.clock.install({ time: new Date(at) });
page.on("console", (m) => m.type() === "error" && console.error("[page]", m.text()));
await page.goto(url, { waitUntil: "load" });
if (key) {
  await page.waitForTimeout(wait);
  await page.keyboard.press(key);
}
await page.waitForTimeout(key ? 0 : wait);
for (let i = 0; i < frames; i++) {
  const file = frames > 1 ? out.replace(/\.png$/, `-${i}.png`) : out;
  await page.screenshot({ path: file });
  if (gap) await page.waitForTimeout(gap);
}
await browser.close();
