import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const { chromium } = createRequire(import.meta.url)(process.argv[2] || "playwright");
const browser = await chromium.launch({ headless: true, ...(process.argv[3] ? { executablePath: process.argv[3] } : {}) });
const directory = new URL("../doc/函数类型参数/evidence/", import.meta.url);
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
  assert.equal(await page.locator('#example optgroup[label="函数教程"] option[value="functionTypedParameters"]').count(), 1);
  const oldDraft = await page.inputValue("#rules");
  await page.selectOption("#example", "functionTypedParameters");
  assert.equal(await page.inputValue("#rules"), oldDraft);
  for (const [names, structure, style] of [["descriptive", "original", "plain"], ["descriptive", "original", "commented"], ["numeric", "original", "plain"], ["numeric", "flat", "commented"], ["descriptive", "functions", "plain"]]) {
    await page.selectOption("#exampleStateNames", names);
    await page.selectOption("#exampleStructure", structure);
    await page.selectOption("#exampleSourceStyle", style);
    await page.click("#loadExample");
    assert.equal(await page.textContent("#errors"), "");
    const source = await page.inputValue("#rules");
    if (style === "plain") assert.doesNotMatch(source, /^\s*#/m);
    else assert.match(source, /^\s*#/m);
    const trace = [];
    for (let step = 0; step < 4; step++) {
      await page.click("#step");
      trace.push({ state: await page.textContent("#currentState"), head: await page.textContent("#headPosition"), read: await page.textContent("#readSymbol") });
    }
    assert.deepEqual(trace.map(item => item.head), ["0", "1", "1", "1"]);
    assert.equal(trace[2].read, "2");
    assert.equal(trace[3].read, "3");
    assert.equal(trace[3].state, "HALT");
    assert.equal(await page.textContent("#stepCount"), "4");
    if (names === "descriptive") assert.equal(trace[2].state, "finish");
    results.push({ names, structure, style, trace });
  }
  await page.selectOption("#exampleStateNames", "descriptive");
  await page.selectOption("#exampleStructure", "original");
  await page.selectOption("#exampleSourceStyle", "commented");
  await page.click("#loadExample");
  const original = await page.inputValue("#rules");
  await page.locator("#compiledProgram").evaluate(element => { element.open = true; });
  await edit({ rules: original });
  assert.match(await page.inputValue("#internalNameMap"), /组合\.完成 → finish/);
  assert.match(await page.inputValue("#compiledRuleSource"), /->finish,2,N/);
  const fnSource = original.replace("完成=finish,状态", "完成=finish,函数");
  await edit({ rules: fnSource });
  assert.match(await page.textContent("#errors"), /第 \d+ 行.*未定义子函数 finish/);
  await edit({ rules: original });
  assert.equal(await page.textContent("#errors"), "");
  // Untyped equal bindings must look for a real function before using an outer state.
  await edit({ rules: original.replace("移动=右移,函数", "移动=右移").replace("完成=finish,状态", "完成=finish") });
  await page.click("#apply");
  for (let step = 0; step < 4; step++) await page.click("#step");
  assert.equal(await page.textContent("#currentState"), "HALT");
  assert.equal(await page.textContent("#readSymbol"), "3");
  await edit({ rules: original });
  await page.click("#apply");
  await page.locator("#rules").scrollIntoViewIfNeeded();
  await page.screenshot({ path: fileURLToPath(new URL("typed-example.png", directory)) });
  await page.locator("#compiledProgram").scrollIntoViewIfNeeded();
  await page.screenshot({ path: fileURLToPath(new URL("actual-mapping.png", directory)) });
  assert.deepEqual(errors, []);
  const report = { groupVisible: true, selectionKeepsDraft: true, results, actualExternalName: "finish", mappingAndRulesMatch: true, wrongTypeAndRecovery: true, untypedFunctionFirst: true, errors };
  await writeFile(new URL("browser.json", directory), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ ...report, results: results.map(({ trace, ...result }) => ({ ...result, final: trace.at(-1), steps: trace.length })) }, null, 2));
} finally { await browser.close(); }
