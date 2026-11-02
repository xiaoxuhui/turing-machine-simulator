import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const { chromium } = createRequire(import.meta.url)(process.argv[2] || "playwright");
const browser = await chromium.launch({ headless: true, ...(process.argv[3] ? { executablePath: process.argv[3] } : {}) });
const directory = new URL("../doc/分散状态分支/evidence/", import.meta.url);
await mkdir(directory, { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [], results = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("http://127.0.0.1:5173/turing-machine-simulator/");
  await page.click("#compiledProgram summary");
  const functions = "output(0,1):\n    0,|->1,□,N\nr(0,1):\n    0,1->1,1,R\n";
  const prefix = "entry,□->left,□,L\nleft,□->mark,□,L\nmark,□->0,|,N\n";
  const load = async (rules, initialState, input = "") => {
    await page.evaluate(fields => {
      for (const [id, value] of Object.entries(fields)) {
        const field = document.getElementById(id); field.value = value;
        field.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }, { rules, initialState, input, blankSymbol: "□", acceptStates: "", rejectStates: "", haltStates: "HALT" });
    assert.equal(await page.textContent("#errors"), "");
    await page.click("#apply");
  };
  const step = () => page.click("#step");
  for (const [name, source] of [
    ["separated-script", functions + prefix + "r\n0,1->HALT,1,N\nr\n0,|->output\noutput"],
    ["across-declaration", functions + prefix + "0,1->HALT,1,N\nr\n0,|->output\noutput"],
  ]) {
    await load(source, "entry");
    const actual = await page.inputValue("#compiledRuleSource");
    assert.match(actual, /^0,\|->__fn\.\d+\.output\.0,\|,N$/m);
    assert.doesNotMatch(actual, /^0_\d+,\|->/m);
    await step(); await step(); await step();
    assert.equal(await page.textContent("#currentState"), "0");
    assert.equal(await page.textContent("#readSymbol"), "|");
    assert.equal(await page.textContent("#headPosition"), "-2");
    await step();
    const entry = await page.textContent("#currentState");
    assert.match(entry, /\.output\.0$/);
    assert.match(await page.textContent("#log"), /0,\| → __fn\.\d+\.output\.0,\|,N/);
    await step();
    assert.equal(await page.textContent("#status"), "已停机");
    assert.equal(await page.textContent("#stepCount"), "5");
    assert.equal(await page.textContent("#headPosition"), "-2");
    results.push({ name, beforeCall: { state: "0", symbol: "|", head: -2 }, called: entry, final: "HALT", steps: 5 });
    if (name === "separated-script") {
      await page.locator("#compiledRuleSource").scrollIntoViewIfNeeded();
      await page.screenshot({ path: fileURLToPath(new URL("separator-call.png", directory)) });
    }
  }
  await load(functions + "scan(0,end):\n    0,1->0,1,R\n    unused,□->end,9,N\n    0,|->output\n    output\nscan", "scan", "11|");
  const trace = [];
  for (let i = 0; i < 4; i++) { await step(); trace.push(await page.textContent("#currentState")); }
  assert.equal(trace[0], trace[1]);
  assert.match(trace[2], /\.output\.0$/);
  assert.equal(trace[3], "HALT");
  const output = await page.locator("#tape .cell").evaluateAll(cells => cells.map(cell => cell.querySelector("span:not(.cell-index)")?.textContent).filter(symbol => symbol !== "□").join(""));
  assert.equal(output, "11");
  const consistency = await page.evaluate(() => {
    const compiled = new Set(document.getElementById("compiledRuleSource").value.split("\n"));
    const logs = [...document.querySelectorAll("#log .log-row")].map(row => row.lastElementChild.textContent.split("　[")[0].replace(" → ", "->"));
    return logs.every(line => compiled.has(line));
  });
  assert.equal(consistency, true);
  results.push({ name: "local-scan-cleanup", trace, output, steps: 4, logMatchesCompiled: consistency });
  assert.deepEqual(errors, []);
  const report = { results, errors };
  await writeFile(new URL("browser.json", directory), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
