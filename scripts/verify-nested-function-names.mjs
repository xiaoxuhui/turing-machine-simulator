import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const { chromium } = createRequire(import.meta.url)(process.argv[2] || "playwright");
const browser = await chromium.launch({ headless: true, ...(process.argv[3] ? { executablePath: process.argv[3] } : {}) });
const directory = new URL("../doc/嵌套函数归属名称/evidence/", import.meta.url);
await mkdir(directory, { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [], results = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("http://127.0.0.1:5173/turing-machine-simulator/");
  const edit = fields => page.evaluate(values => {
    for (const [id, value] of Object.entries(values)) {
      const field = document.getElementById(id); field.value = value;
      field.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }, fields);
  assert.equal(await page.locator('#example optgroup[label="函数教程"] option[value="functionNestedNames"]').count(), 1);
  await page.selectOption("#example", "functionNestedNames");
  for (const [names, structure, style] of [["descriptive", "original", "plain"], ["descriptive", "original", "commented"], ["numeric", "original", "plain"], ["numeric", "flat", "commented"], ["descriptive", "functions", "plain"]]) {
    await page.selectOption("#exampleStateNames", names);
    await page.selectOption("#exampleStructure", structure);
    await page.selectOption("#exampleSourceStyle", style);
    await page.click("#loadExample");
    assert.equal(await page.textContent("#errors"), "");
    const trace = [];
    for (let step = 0; step < 5; step++) {
      await page.click("#step");
      trace.push({ state: await page.textContent("#currentState"), head: await page.textContent("#headPosition") });
    }
    assert.deepEqual(trace.map(item => item.head), ["0", "1", "1", "2", "3"]);
    assert.equal(trace[4].state, "HALT");
    if (structure !== "flat") {
      assert.match(trace[0].state, /\.COPY\.SUCC\./);
      assert.match(trace[2].state, /\.COPY\.SUCC\./);
      assert.notEqual(trace[0].state, trace[2].state);
      assert.match(trace[3].state, /\.OTHER\.SUCC\./);
    }
    results.push({ names, structure, style, trace });
  }
  await page.selectOption("#exampleStateNames", "descriptive");
  await page.selectOption("#exampleStructure", "original");
  await page.selectOption("#exampleSourceStyle", "commented");
  await page.click("#loadExample");
  const original = await page.inputValue("#rules");
  await page.locator("#compiledProgram").evaluate(element => { element.open = true; });
  await edit({ rules: original });
  const mapping = await page.inputValue("#internalNameMap");
  assert.match(mapping, /COPY\.SUCC\.q0 →/);
  assert.match(mapping, /OTHER\.SUCC\.q0 →/);
  assert.match(mapping, /调用处第 \d+ 行/);
  assert.match(await page.inputValue("#compiledRuleSource"), /\.COPY\.SUCC\.q0/);
  await page.click("#step");
  await page.locator("#compiledProgram").scrollIntoViewIfNeeded();
  await page.screenshot({ path: fileURLToPath(new URL("nested-names.png", directory)) });
  const branchSource = "SUCC(s,end):\n    s,->end,1,*\nCOPY(q0,done,SUCC):\n    q0,0->SUCC,*,*\n    q0,1->SUCC,*,*\n    after,1->done,2,*\nCOPY";
  const branchTargets = [];
  for (const input of ["0", "1"]) {
    await edit({ rules: branchSource, input, initialState: "COPY", blankSymbol: "□" });
    await page.click("#apply"); await page.click("#step");
    const target = await page.textContent("#currentState");
    assert.match(target, /\.COPY\.SUCC\.s$/);
    branchTargets.push(target);
    await page.click("#step"); await page.click("#step");
    assert.equal(await page.textContent("#currentState"), "HALT");
    assert.equal(await page.textContent("#readSymbol"), "2");
  }
  assert.notEqual(branchTargets[0], branchTargets[1]);
  assert.deepEqual(errors, []);
  const report = { results, sameParentSameContinuationDifferentSites: branchTargets, mappingShowsOwnerAndCallLine: true, errors };
  await writeFile(new URL("browser.json", directory), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ variants: results.length, branchTargets, mappingShowsOwnerAndCallLine: true, errors }, null, 2));
} finally { await browser.close(); }
