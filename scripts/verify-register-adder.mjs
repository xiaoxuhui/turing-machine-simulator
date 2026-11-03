import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const { chromium } = createRequire(import.meta.url)(process.argv[2] || "playwright");
const browser = await chromium.launch({ headless: true, ...(process.argv[3] ? { executablePath: process.argv[3] } : {}) });
const directory = new URL("../doc/寄存器加法器与跳转简写/evidence/", import.meta.url);
await mkdir(directory, { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [], results = [], variants = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => {
    const Original = Worker;
    window.Worker = class extends Original {
      constructor(...args) { super(...args); this.addEventListener("message", event => { if (event.data.type === "complete") window.__routeResult = event.data; }); }
    };
  });
  await page.goto("http://127.0.0.1:5173/turing-machine-simulator/");
  const edit = fields => page.evaluate(values => {
    for (const [id, value] of Object.entries(values)) {
      const field = document.getElementById(id); field.value = value;
      field.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }, fields);
  await edit({ rules: "q0,1->q1\nq1,1->HALT", input: "1", initialState: "q0", blankSymbol: "0", haltStates: "HALT" });
  await page.click("#apply"); await page.click("#step");
  assert.equal(await page.textContent("#currentState"), "q1");
  assert.equal(await page.textContent("#headPosition"), "0");
  assert.equal(await page.textContent("#readSymbol"), "1");
  await page.click("#step");
  assert.equal(await page.textContent("#currentState"), "HALT");
  await edit({ rules: "q0,1->q1,0,L\nq1,0->HALT,1,R" });
  await page.click("#apply"); await page.click("#step");
  assert.equal(await page.textContent("#headPosition"), "-1");
  assert.equal(await page.textContent("#readSymbol"), "0");
  assert.match(await page.textContent("#log"), /q0,1 → q1,0,L/);
  await page.click("#step");
  assert.equal(await page.textContent("#headPosition"), "0");
  assert.equal(await page.textContent("#currentState"), "HALT");
  await edit({ rules: "f(s,end):\n    s,1->end,9,N\nf\nstart,1->missing\nf", initialState: "start" });
  await page.click("#apply"); await page.click("#step"); await page.click("#step");
  assert.equal(await page.textContent("#currentState"), "missing");
  assert.equal(await page.textContent("#stepCount"), "1");
  assert.equal(await page.textContent("#status"), "缺少转移规则");

  const draft = await page.inputValue("#rules");
  await page.selectOption("#example", "registerAdder");
  assert.equal(await page.inputValue("#rules"), draft);
  await page.selectOption("#exampleSourceStyle", "plain");
  await page.selectOption("#exampleStructure", "original");
  await page.selectOption("#exampleStateNames", "descriptive");
  await page.click("#loadExample");
  const original = (await readFile(new URL("../src/register-adder.tm", import.meta.url), "utf8")).trimEnd();
  assert.equal(await page.inputValue("#rules"), original);
  assert.equal(await page.inputValue("#blankSymbol"), "0");
  assert.equal(await page.inputValue("#initialState"), "go");
  assert.match(await page.textContent("#exampleNote"), /原稿/);
  assert.match(await page.textContent("#exampleNote"), /11\+ 输出 1/);
  const run = async (input, expected) => {
    await edit({ input });
    await page.fill("#routeSteps", "10000");
    await page.evaluate(() => { window.__routeResult = null; });
    await page.click("#generateRoute");
    await page.waitForFunction(() => window.__routeResult);
    const result = await page.evaluate(() => window.__routeResult);
    assert.equal(result.reason, "halt");
    const final = result.frames.at(-1);
    const output = final.cells.map(([, symbol]) => symbol).join("");
    assert.equal(output, expected);
    return { input, output, steps: final.step };
  };
  for (const [input, expected] of [["+", ""], ["+1111", "1111"], ["1+", "1"], ["1+11", "111"], ["11+", "1"], ["111+11", "1111"]]) results.push(await run(input, expected));
  for (const [names, structure, style] of [["descriptive", "original", "commented"], ["numeric", "original", "plain"], ["descriptive", "flat", "plain"], ["numeric", "flat", "commented"], ["descriptive", "functions", "plain"]]) {
    await page.selectOption("#exampleStateNames", names);
    await page.selectOption("#exampleStructure", structure);
    await page.selectOption("#exampleSourceStyle", style);
    await page.click("#loadExample");
    assert.equal(await page.textContent("#errors"), "");
    if (style === "commented") assert.match(await page.inputValue("#rules"), /# 原稿收尾/);
    const result = await run("1+11", "111");
    assert.equal(result.steps, 146);
    variants.push({ names, structure, style, ...result });
  }
  await page.selectOption("#exampleStateNames", "descriptive");
  await page.selectOption("#exampleStructure", "original");
  await page.selectOption("#exampleSourceStyle", "plain");
  await page.click("#loadExample");
  await page.locator("#rules").press("Control+End");
  await page.screenshot({ path: fileURLToPath(new URL("original-example.png", directory)) });
  assert.deepEqual(errors, []);
  const report = { ordinaryShortJumpPreservesSymbolAndHead: true, fullSyntaxStillWritesAndMoves: true, unknownTargetNotReplacedByBareCall: true, selectionKeepsDraft: true, originalUnchanged: true, results, variants, errors };
  await writeFile(new URL("browser.json", directory), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
