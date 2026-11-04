import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const { chromium } = createRequire(import.meta.url)(process.argv[2] || "playwright");
const browser = await chromium.launch({ headless: true, ...(process.argv[3] ? { executablePath: process.argv[3] } : {}) });
const directory = new URL("../doc/星号转义与移动简写/evidence/", import.meta.url);
await mkdir(directory, { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [], cases = [], lessons = [];
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
  for (const [rules, input, initialState, write, head] of [
    ["q0,1->HALT,R", "1", "q0", "1", 1], ["q0,1->HALT,L", "1", "q0", "1", -1],
    ["q0,1->HALT,R,*", "1", "q0", "R", 0], ["q0,1->HALT,L,*", "1", "q0", "L", 0],
    ["q0,1->HALT,N", "1", "q0", "N", 0], ["q0,1->HALT,**", "1", "q0", "*", 0],
    ["q0,1->HALT,***", "1", "q0", "**", 0], ["q0,->HALT,*,*", "Z", "q0", "Z", 0],
    [",Z->HALT,*,R", "Z", "unknown", "Z", 1], ["*,*->HALT,**,*", "Z", "unknown", "*", 0],
    ["q0,**->HALT,R", "*", "q0", "*", 1],
  ]) {
    await edit({ rules, input, initialState, blankSymbol: "0", haltStates: "HALT", acceptStates: "", rejectStates: "" });
    await page.click("#apply");
    assert.equal(await page.textContent("#errors"), "");
    await page.click("#step");
    assert.equal(await page.textContent("#currentState"), "HALT");
    assert.equal(await page.textContent("#headPosition"), String(head));
    assert.ok((await page.textContent("#log")).includes(`${initialState},${input} → HALT,${write},`));
    cases.push({ rules, input, initialState, write, head });
  }
  const route = async () => {
    await page.fill("#routeSteps", "20");
    await page.evaluate(() => { window.__routeResult = null; });
    await page.click("#generateRoute");
    await page.waitForFunction(() => window.__routeResult);
    return page.evaluate(() => window.__routeResult);
  };
  for (const [id, expected, steps] of [
    ["functionOmittedFields", [[0, "2"], [1, "L"]], 8],
    ["functionStarLiterals", [[0, "*"], [1, "**"]], 5],
    ["functionWildcards", [[0, "A"], [1, "*"]], 4],
  ]) {
    assert.equal(await page.locator(`#example optgroup[label="函数教程"] option[value="${id}"]`).count(), 1);
    await page.selectOption("#example", id);
    for (const [names, structure, style] of [["descriptive", "original", "plain"], ["descriptive", "original", "commented"], ["numeric", "flat", "plain"]]) {
      await page.selectOption("#exampleStateNames", names);
      await page.selectOption("#exampleStructure", structure);
      await page.selectOption("#exampleSourceStyle", style);
      await page.click("#loadExample");
      assert.equal(await page.textContent("#errors"), "");
      const source = await page.inputValue("#rules");
      if (style === "plain") assert.doesNotMatch(source, /^\s*#/m);
      else assert.match(source, /^\s*#/m);
      const result = await route(), final = result.frames.at(-1);
      assert.equal(result.reason, "halt");
      assert.equal(final.step, steps);
      assert.deepEqual(final.cells, expected);
      lessons.push({ id, names, structure, style, final });
    }
  }
  await page.selectOption("#example", "functionWildcards");
  await page.selectOption("#exampleStateNames", "descriptive");
  await page.selectOption("#exampleStructure", "original");
  await page.selectOption("#exampleSourceStyle", "commented");
  await page.click("#loadExample");
  await edit({ input: "Z" });
  const unknown = await route();
  assert.deepEqual(unknown.frames.at(-1).cells, [[0, "Z"]]);
  assert.equal(unknown.frames.at(-1).step, 2);
  await page.locator("#rules").scrollIntoViewIfNeeded();
  await page.screenshot({ path: fileURLToPath(new URL("function-lessons.png", directory)) });
  await edit({ rules: "q0,1->q1,***,*\nq1,***->HALT,*,*", input: "1", initialState: "q0", blankSymbol: "0" });
  await page.click("#apply");
  assert.equal(await page.getByLabel("规则 1 写入符号", { exact: true }).inputValue(), "***");
  assert.equal(await page.getByLabel("规则 2 读取符号", { exact: true }).inputValue(), "***");
  await page.getByLabel("规则 1 下一状态", { exact: true }).fill("changed");
  await page.getByLabel("规则 1 下一状态", { exact: true }).press("Tab");
  await page.getByLabel("规则 2 当前状态", { exact: true }).fill("changed");
  await page.getByLabel("规则 2 当前状态", { exact: true }).press("Tab");
  await page.locator("#compiledProgram").evaluate(element => { element.open = true; });
  await edit({ rules: await page.inputValue("#rules") });
  const compiled = await page.inputValue("#compiledRuleSource");
  assert.match(compiled, /->changed,\*\*\*,N/);
  await edit({ rules: compiled });
  await page.click("#apply");
  await page.click("#step"); await page.click("#step");
  assert.equal(await page.textContent("#currentState"), "HALT");
  assert.equal(await page.textContent("#readSymbol"), "**");
  await page.getByLabel("规则 1 当前状态", { exact: true }).fill("");
  await page.getByLabel("规则 1 当前状态", { exact: true }).press("Tab");
  await page.getByLabel("规则 1 读取符号", { exact: true }).fill("");
  await page.getByLabel("规则 1 读取符号", { exact: true }).press("Tab");
  await edit({ initialState: "unknown", input: "Z" });
  await page.click("#apply"); await page.click("#step"); await page.click("#step");
  assert.equal(await page.textContent("#currentState"), "HALT");
  assert.equal(await page.textContent("#readSymbol"), "**");
  assert.match(await page.textContent("#log"), /unknown,Z → changed,\*\*,N/);
  await page.locator("#compiledProgram").scrollIntoViewIfNeeded();
  await page.screenshot({ path: fileURLToPath(new URL("literal-roundtrip.png", directory)) });
  assert.deepEqual(errors, []);
  const report = { cases, lessons, unknownInput: unknown.frames.at(-1), tableEditingAndCopyingLossless: true, emptyTableFieldsMatchUnknownStateAndSymbol: true, errors };
  await writeFile(new URL("browser.json", directory), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ cases: cases.length, lessonRuns: lessons.length, unknownInput: report.unknownInput, tableEditingAndCopyingLossless: true, errors }, null, 2));
} finally { await browser.close(); }
