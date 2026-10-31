import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";

const { chromium } = createRequire(import.meta.url)(process.argv[2] || "playwright");
const browser = await chromium.launch({ headless: true, ...(process.argv[3] ? { executablePath: process.argv[3] } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.addInitScript(() => {
    const Original = Worker;
    window.Worker = class extends Original {
      constructor(...args) { super(...args); this.addEventListener("message", event => { if (event.data.type === "complete") window.__routeResult = event.data; }); }
    };
  });
  await page.goto("http://127.0.0.1:5173/turing-machine-simulator/");
  assert.equal(await page.locator("#exampleProgramOptions").isVisible(), true);
  const results = [];
  for (const [key, names, structure, expected] of [
    ["unaryPower", "descriptive", "functions", "111111111"],
    ["unaryPower", "numeric", "functions", "111111111"],
    ["unaryRoot", "numeric", "functions", "11"],
    ["functionExports", "numeric", "original", "1234"],
    ["functionExports", "numeric", "flat", "1234"],
    ["binary", "numeric", "functions", "1100"],
  ]) {
    const before = await page.inputValue("#rules");
    await page.selectOption("#example", key);
    await page.selectOption("#exampleStateNames", names);
    await page.selectOption("#exampleStructure", structure);
    assert.equal(await page.inputValue("#rules"), before);
    await page.selectOption("#exampleSourceStyle", "plain");
    await page.click("#loadExample");
    assert.equal(await page.locator("#errors").textContent(), "");
    const source = await page.inputValue("#rules");
    assert.doesNotMatch(source, /^\s*#/m);
    let summary = await page.locator("#exampleNote").textContent();
    if (structure === "functions" && key.startsWith("unary")) {
      assert.match(summary, /提取 \d+ 个公共函数/);
      assert.match(source, /^[^,\n]+: 公共.+ -> /m);
      assert.doesNotMatch(source, /主程序\(/);
    }
    await page.fill("#routeSteps", "250000");
    await page.evaluate(() => { window.__routeResult = null; });
    await page.click("#generateRoute");
    await page.waitForFunction(() => window.__routeResult);
    const result = await page.evaluate(() => window.__routeResult);
    assert.equal(result.reason, "halt");
    const last = result.frames.at(-1);
    assert.equal(last.cells.map(([, symbol]) => symbol).join(""), expected);
    await page.selectOption("#exampleSourceStyle", "commented");
    await page.click("#loadExample");
    const commented = await page.inputValue("#rules");
    assert.equal(commented.split("\n").filter(line => !line.trimStart().startsWith("#")).join("\n"), source);
    results.push({ key, names, structure, output: expected, steps: last.step, summary });
  }
  await page.reload();
  assert.equal(await page.locator("#exampleProgramOptions").isVisible(), true);
  assert.deepEqual(pageErrors, []);
  const report = { globalOptionsVisible: true, selectionPreservesDraft: true, results, pageErrors };
  const directory = new URL("../doc/全局示例版本/evidence/", import.meta.url);
  await mkdir(directory, { recursive: true });
  await writeFile(new URL("browser.json", directory), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
