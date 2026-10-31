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
  const source = "unused,0->HALT,0,N\nq0,1->q1,1,R\nq1,2->HALT,2,R\n" + [3,4,5,6,7,8].map(n => `unused${n},0->HALT,${n},N`).join("\n");
  await page.fill("#rules", source);
  await page.fill("#input", "12");
  await page.fill("#blankSymbol", "0");
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
    return { firstHead: pixel(0, 0), secondSymbol: pixel(107, 0), blank: pixel(214, 0), normalOne: pixel(0, canvas.height - 1), headOnBlank: pixel(214, canvas.height - 1) };
  });
  assert.deepEqual(colors, { firstHead: [238, 103, 80, 255], secondSymbol: [159, 186, 40, 255], blank: [244, 247, 250, 255], normalOne: [234, 179, 8, 255], headOnBlank: [239, 71, 111, 255] });
  const legend = await page.locator("#routeLegend [data-symbol]").evaluateAll(items => items.map(item => ({ symbol: item.dataset.symbol, color: item.dataset.color })));
  const expected = ["#eab308", "#9fba28", "#54c149", "#25bd71", "#2fa4aa", "#388ae3", "#678ebb", "#a8a161"];
  assert.deepEqual(legend, expected.map((color, index) => ({ symbol: String(index + 1), color })));
  assert.equal(await page.locator("#stepCount").textContent(), "0");
  const directory = new URL("../doc/符号等分配色/evidence/", import.meta.url);
  await mkdir(directory, { recursive: true });
  await page.locator(".route-panel").screenshot({ path: fileURLToPath(new URL("route-colors.png", directory)) });
  await page.fill("#routeSteps", "1");
  await generate();
  assert.deepEqual(await page.locator("#routeLegend [data-symbol]").evaluateAll(items => items.map(item => ({ symbol: item.dataset.symbol, color: item.dataset.color }))), legend);
  await page.fill("#rules", "q0,1->HALT,<img src=x>,R");
  await page.fill("#input", "1");
  await page.click("#apply");
  await generate();
  assert.equal(await page.locator("#routeLegend img").count(), 0);
  assert.ok((await page.locator("#routeLegend").textContent()).includes("<img src=x>"));
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.deepEqual(pageErrors, []);
  const result = { colors, legend, allEightWriteSymbolsIncluded: true, onlyTwoSymbolsVisited: true, stableAcrossStepCounts: true, redReservedForHead: true, machineUnchanged: true, safeSymbolText: true, mobileNoOverflow: true, pageErrors };
  await writeFile(new URL("browser.json", directory), JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result, null, 2));
} finally { await browser.close(); }
