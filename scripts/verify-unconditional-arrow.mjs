import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const { chromium } = createRequire(import.meta.url)(process.argv[2] || "playwright");
const browser = await chromium.launch({ headless: true, ...(process.argv[3] ? { executablePath: process.argv[3] } : {}) });
const directory = new URL("../doc/无条件箭头简写/evidence/", import.meta.url);
await mkdir(directory, { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [], trace = [], variants = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("http://127.0.0.1:5173/turing-machine-simulator/");
  const edit = fields => page.evaluate(values => {
    for (const [id, value] of Object.entries(values)) {
      const field = document.getElementById(id); field.value = value;
      field.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }, fields);
  await edit({ rules: "succ(s,end):\n    s,->end,1,*\n0.2->succ\nafter,1->HALT,2,*", input: "Z", initialState: "0.2", blankSymbol: "□", haltStates: "HALT", acceptStates: "", rejectStates: "" });
  await page.click("#apply");
  assert.equal(await page.textContent("#errors"), "");
  for (let i = 0; i < 3; i++) {
    await page.click("#step");
    trace.push({ state: await page.textContent("#currentState"), read: await page.textContent("#readSymbol"), head: await page.textContent("#headPosition") });
  }
  assert.match(trace[0].state, /^succ\.FN\.\d+\.s$/);
  assert.deepEqual(trace.map(item => item.head), ["0", "0", "0"]);
  assert.deepEqual(trace.map(item => item.read), ["Z", "1", "2"]);
  assert.equal(trace[2].state, "HALT");
  await page.locator("#compiledProgram").evaluate(element => { element.open = true; });
  await edit({ rules: await page.inputValue("#rules") });
  assert.match(await page.inputValue("#compiledRuleSource"), /0\.2,\*->succ\.FN\.\d+\.s,\*,N/);
  await page.locator("#compiledProgram").scrollIntoViewIfNeeded();
  await page.screenshot({ path: fileURLToPath(new URL("unconditional-arrow.png", directory)) });
  await page.selectOption("#example", "functionOmittedFields");
  for (const [names, style] of [["descriptive", "plain"], ["descriptive", "commented"], ["numeric", "plain"]]) {
    await page.selectOption("#exampleStateNames", names);
    await page.selectOption("#exampleStructure", "original");
    await page.selectOption("#exampleSourceStyle", style);
    await page.click("#loadExample");
    assert.match(await page.inputValue("#rules"), /^\s+[^,\n]+->[^,\n]+$/m);
    assert.equal(await page.textContent("#errors"), "");
    for (let step = 0; step < 8; step++) await page.click("#step");
    assert.equal(await page.textContent("#currentState"), "HALT");
    assert.equal(await page.textContent("#headPosition"), "0");
    assert.equal(await page.textContent("#readSymbol"), "2");
    variants.push({ names, style, steps: 8 });
  }
  assert.deepEqual(errors, []);
  const report = { trace, expandedRulesMatch: true, variants, errors };
  await writeFile(new URL("browser.json", directory), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
