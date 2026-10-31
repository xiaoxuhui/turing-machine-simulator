import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";

const { chromium } = createRequire(import.meta.url)(process.argv[2] || "playwright");
const browser = await chromium.launch({ headless: true, ...(process.argv[3] ? { executablePath: process.argv[3] } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  // Observe the real UI worker response without replacing its execution or callbacks.
  await page.addInitScript(() => {
    const OriginalWorker = window.Worker;
    window.Worker = class extends OriginalWorker {
      constructor(...args) {
        super(...args);
        this.addEventListener("message", event => {
          if (event.data.type === "complete") window.__inverseRoute = event.data;
        });
      }
    };
  });
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto("http://127.0.0.1:5173/turing-machine-simulator/");
  assert.equal(await page.locator("#example option").count(), 37);
  const results = [];
  for (const key of ["unaryRoot", "unaryLog", "unarySuperRoot", "unarySuperLog", "unaryPentaRoot", "unaryPentaLog"]) {
    await page.selectOption("#example", key);
    let plain;
    for (const style of ["plain", "commented"]) {
      await page.selectOption("#exampleSourceStyle", style);
      await page.click("#loadExample");
      assert.equal(await page.locator("#errors").textContent(), "");
      assert.equal(await page.isChecked("#unlimitedSteps"), true);
      const source = await page.inputValue("#rules");
      if (style === "plain") { plain = source; assert.doesNotMatch(source, /^\s*#/m); }
      else {
        assert.match(source, /向下取整/);
        assert.match(source, /预算/);
        assert.equal(source.split("\n").filter(line => !line.trimStart().startsWith("#")).join("\n"), plain);
      }
      await page.fill("#routeSteps", "250000");
      await page.evaluate(() => { window.__inverseRoute = null; });
      await page.click("#generateRoute");
      await page.waitForFunction(() => /已显示|后台生成失败/.test(document.querySelector("#routeStatus").textContent), { timeout: 30000 });
      assert.match(await page.locator("#routeStatus").textContent(), /已显示/);
      const route = await page.evaluate(() => window.__inverseRoute);
      assert.equal(route.reason, "halt");
      const final = route.frames.at(-1);
      assert.equal(final.state, "HALT");
      assert.equal(final.cells.map(([, symbol]) => symbol).join(""), "11");
      assert.equal(await page.locator("#stepCount").textContent(), "0");
      results.push({ key, style, output: "11", steps: final.step, reason: route.reason });
    }
  }
  const source = await page.inputValue("#rules");
  await page.reload();
  assert.equal(await page.inputValue("#rules"), source);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.deepEqual(pageErrors, []);
  const result = { examples: 37, results, backgroundLeavesSimulatorUntouched: true, reloadPreservesDraft: true, mobileNoOverflow: true, pageErrors };
  const directory = new URL("../doc/整数逆运算/evidence/", import.meta.url);
  await mkdir(directory, { recursive: true });
  await writeFile(new URL("browser.json", directory), JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result, null, 2));
} finally { await browser.close(); }
