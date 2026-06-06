// Capture screenshots of the running SPA (and a mockup reference) so we can
// eyeball the redesign against docs/handoff/design-mockups. Requires the app
// served at http://localhost:8000/app and `playwright` installed in frontend/.
//   node scripts/shots.mjs
import { chromium } from "playwright";
import path from "path";
import fs from "fs";

const BASE = process.env.BASE || "http://localhost:8000/app";
const OUT = "D:/personal-projects/comed-pricealert/.shots";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();

async function shot(name, { url = BASE + "/", width = 1280, height = 900, action } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForTimeout(1800); // let data fetch + charts render
  if (action) await action(page);
  await page.screenshot({ path: path.join(OUT, name), fullPage: !action });
  await ctx.close();
  console.log("saved", name);
}

await shot("now-desktop.png", {});
await shot("now-mobile.png", { width: 390, height: 844 });
await shot("drawer-mobile.png", {
  width: 390,
  height: 844,
  action: async (p) => {
    await p.getByRole("button", { name: /menu/i }).click();
    await p.waitForTimeout(450);
  },
});
await shot("forecast-desktop.png", { url: BASE + "/forecast" });

const mock =
  "file:///D:/personal-projects/comed-pricealert/docs/handoff/design-mockups/01-dashboard-redesign.html";
await shot("mock-01.png", { url: mock });

await browser.close();
console.log("done ->", OUT);
