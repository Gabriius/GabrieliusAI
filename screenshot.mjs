// Screenshot a URL with Puppeteer.
// Usage:  node screenshot.mjs http://localhost:3000 [label] [viewport]
//   label     optional filename suffix, e.g. "hero"
//   viewport  "desktop" (default, 1440w) or "mobile" (390w)
// Saves auto-incremented PNGs to ./temporary screenshots/  (never overwritten)
import puppeteer from 'puppeteer';
import { mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const url = process.argv[2] || 'http://localhost:3000';
const label = process.argv[3] || '';
const viewport = (process.argv[4] || 'desktop').toLowerCase();

const outDir = join(process.cwd(), 'temporary screenshots');
await mkdir(outDir, { recursive: true });

// find next number so we never overwrite
const existing = await readdir(outDir).catch(() => []);
const nums = existing
  .map((f) => (f.match(/^screenshot-(\d+)/) || [])[1])
  .filter(Boolean)
  .map(Number);
const n = nums.length ? Math.max(...nums) + 1 : 1;
const name = label ? `screenshot-${n}-${label}.png` : `screenshot-${n}.png`;
const out = join(outDir, name);

// deviceScaleFactor kept modest so very tall full-page shots stay under
// Chrome's ~16384px texture limit (past which the capture tiles/duplicates)
const dims = viewport === 'mobile'
  ? { width: 390, height: 844, deviceScaleFactor: 1 }
  : { width: 1440, height: 900, deviceScaleFactor: 2 };

const browser = await puppeteer.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.setViewport(dims);
  // reveal-on-scroll + count-up are gated behind motion; emulating reduced-motion
  // makes the CSS show every section instantly, so full-page shots capture everything
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
  // let webfonts settle
  try { await page.evaluate(() => document.fonts && document.fonts.ready); } catch {}
  // scroll through the page so IntersectionObserver reveal animations all fire,
  // then return to top — otherwise below-the-fold content stays hidden in the shot
  await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const h = document.body.scrollHeight;
    for (let y = 0; y < h; y += 500) { window.scrollTo(0, y); await sleep(60); }
    window.scrollTo(0, h); await sleep(200);
    window.scrollTo(0, 0); await sleep(200);
  });
  await new Promise((r) => setTimeout(r, 700));
  await page.screenshot({ path: out, fullPage: true });
  console.log(out);
} finally {
  await browser.close();
}
