import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const { chromium } = createRequire(import.meta.url)(process.argv[2] || "playwright");
const browser = await chromium.launch({ headless: true, ...(process.argv[3] ? { executablePath: process.argv[3] } : {}) });
const directory = new URL("../doc/外部状态保留原名/evidence/", import.meta.url);
await mkdir(directory, { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [], results = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("http://127.0.0.1:5173/turing-machine-simulator/");
  await page.click("#compiledProgram summary");
  for (const [name, source, expected, steps] of [
    ["ret", "f(s,q1):\n    s,□->q1,1,R\n    ret q1\nf\nq1,□->HALT,2,N", "12", 2],
    ["normal", "f(s,q1):\n    s,□->q1,1,R\nf\nq1,□->HALT,2,N", "12", 2],
    ["local-isolation", "f(s,end):\n    s,□->q1,1,R\n    q1,□->end,2,R\nf\nq1,□->HALT,9,N", "129", 3],
    ["collision", "f(s,end):\n    s,□->end,1,R\nf\nq1,□->q1,2,R\nq1,□->HALT,3,N\nq1_2,□->HALT,8,N", "123", 3],
    ["parent-return", "child(s,back):\n    s,□->back,1,R\n    ret back\nparent(s,end):\n    s,□->child\n    child\n    back,□->end,2,R\nparent\nfinal,□->HALT,3,N\nback,□->HALT,9,N", "123", 4],
  ]) {
    await page.evaluate(rules => {
      for (const [id, value] of Object.entries({ rules, input: "", initialState: "", blankSymbol: "□", acceptStates: "", rejectStates: "", haltStates: "HALT" })) {
        const field = document.getElementById(id); field.value = value;
        field.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }, source);
    assert.equal(await page.textContent("#errors"), "");
    await page.click("#apply");
    const actual = await page.inputValue("#compiledRuleSource");
    const mapping = await page.inputValue("#internalNameMap");
    assert.doesNotMatch(actual, /__fn\.script\./);
    if (name !== "parent-return") {
      assert.match(actual, /^q1,□->/m);
      assert.match(mapping, /^q1 → q1  /m);
    }
    const trace = [];
    for (let step = 0; step < steps; step++) {
      await page.click("#step");
      trace.push(await page.textContent("#currentState"));
    }
    assert.equal(trace.at(-1), "HALT");
    const output = await page.locator("#tape .cell").evaluateAll(cells => cells.map(cell => cell.querySelector("span:not(.cell-index)")?.textContent ?? "").filter(symbol => symbol !== "□").join(""));
    // The record shows each actually executed write, independent of the tape viewport.
    const log = await page.textContent("#log");
    if (name === "ret" || name === "normal") assert.equal(trace[0], "q1");
    if (name === "local-isolation") { assert.match(trace[0], /\.f\.q1$/); assert.equal(trace[1], "q1"); }
    if (name === "collision") { assert.deepEqual(trace, ["q1", "q1_3", "HALT"]); assert.match(actual, /^q1_2,□->HALT,8,N$/m); }
    if (name === "parent-return") { assert.match(trace[1], /\.parent\.back$/); assert.equal(trace[2], "final"); }
    assert.equal(output, expected);
    if (name !== "parent-return") assert.match(log, /q1/);
    results.push({ name, trace, output, steps, externalPrefixRemoved: true });
    if (name === "ret") {
      await page.locator("#compiledRuleSource").scrollIntoViewIfNeeded();
      await page.screenshot({ path: fileURLToPath(new URL("outer-state.png", directory)) });
    }
  }
  assert.deepEqual(errors, []);
  const report = { results, errors };
  await writeFile(new URL("browser.json", directory), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
