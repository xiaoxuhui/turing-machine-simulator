import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const { chromium } = createRequire(import.meta.url)(process.argv[2] || "playwright");
const browser = await chromium.launch({ headless: true, ...(process.argv[3] ? { executablePath: process.argv[3] } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto("http://127.0.0.1:5173/turing-machine-simulator/");
  await page.fill("#rules", "q0,1->HALT,1,R");
  await page.fill("#input", "1XY");
  await page.fill("#blankSymbol", "□");
  await page.fill("#initialState", "q0");
  await page.fill("#haltStates", "HALT");
  await page.click("#apply");
  await page.fill("#routeSteps", "10");
  const generate = async () => {
    await page.click("#generateRoute");
    await page.waitForFunction(() => /已显示|后台生成失败/.test(document.querySelector("#routeStatus").textContent));
    assert.match(await page.locator("#routeStatus").textContent(), /已显示/);
  };
  await generate();
  const colors = await page.locator("#routeCanvas").evaluate(canvas => {
    const ctx = canvas.getContext("2d"), pixel = (x, y) => [...ctx.getImageData(x, y, 1, 1).data];
    return { firstHead: pixel(0, 0), x: pixel(107, 0), y: pixel(214, 0), normalOne: pixel(0, canvas.height - 1), headOnX: pixel(107, canvas.height - 1) };
  });
  assert.deepEqual(colors, { firstHead: [174, 91, 107, 255], x: [59, 130, 246, 255], y: [228, 161, 27, 255], normalOne: [22, 137, 99, 255], headOnX: [185, 89, 152, 255] });
  const legend = await page.locator("#routeLegend [data-symbol]").evaluateAll(items => items.map(item => ({ symbol: item.dataset.symbol, color: item.dataset.color })));
  assert.deepEqual(legend, [{ symbol: "1", color: "#168963" }, { symbol: "X", color: "#3b82f6" }, { symbol: "Y", color: "#e4a11b" }]);
  assert.equal(await page.locator("#stepCount").textContent(), "0");
  const directory = new URL("../doc/路线符号配色/evidence/", import.meta.url);
  await mkdir(directory, { recursive: true });
  await page.locator(".route-panel").screenshot({ path: fileURLToPath(new URL("route-colors.png", directory)) });
  await page.fill("#rules", "q0,1->HALT,<img src=x>,R");
  await page.fill("#input", "1");
  await page.click("#apply");
  await generate();
  assert.equal(await page.locator("#routeLegend img").count(), 0);
  assert.ok((await page.locator("#routeLegend").textContent()).includes("<img src=x>"));
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.deepEqual(pageErrors, []);
  const result = { colors, legend, machineUnchanged: true, safeSymbolText: true, mobileNoOverflow: true, pageErrors };
  await writeFile(new URL("browser.json", directory), JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result, null, 2));
} finally { await browser.close(); }
