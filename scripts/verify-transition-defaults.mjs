import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const { chromium } = createRequire(import.meta.url)(process.argv[2] || "playwright");
const browser = await chromium.launch({ headless: true, ...(process.argv[3] ? { executablePath: process.argv[3] } : {}) });
const directory = new URL(process.argv[4] === "star" ? "../doc/星号默认值/evidence/" : "../doc/转移规则默认值/evidence/", import.meta.url);
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
  const check = async (source, write, direction, head) => {
    await edit({ rules: source, input: "1", initialState: "q0", blankSymbol: "0", haltStates: "HALT", acceptStates: "", rejectStates: "" });
    await page.click("#apply");
    assert.equal(await page.textContent("#errors"), "");
    const row = page.locator(".rule-data-row").first();
    assert.equal(await row.getByLabel("规则 1 写入符号", { exact: true }).inputValue(), write);
    assert.equal(await row.getByLabel("规则 1 移动方向", { exact: true }).inputValue(), direction);
    await page.click("#step");
    assert.equal(await page.textContent("#currentState"), "HALT");
    assert.equal(await page.textContent("#headPosition"), String(head));
    assert.ok((await page.textContent("#log")).includes(`q0,1 → HALT,${write},${direction}`));
    results.push({ source, write, direction, head });
  };
  for (const [source, write, direction, head] of [
    ["q0,1->HALT", "1", "N", 0], ["q0,1->HALT,,", "1", "N", 0],
    ["q0,1->HALT,2", "2", "N", 0], ["q0,1->HALT,2,", "2", "N", 0],
    ["q0,1->HALT,,R", "1", "R", 1], ["q0,1->HALT, , l ", "1", "L", -1],
    ["q0,1->HALT,R", "1", "R", 1], ["q0,1->HALT,2,L", "2", "L", -1],
    ["q0,1->HALT,*,R", "1", "R", 1], ["q0,1->HALT,*,*", "1", "N", 0],
    ["q0,1->HALT,R,*", "R", "N", 0], ["q0,1->HALT,L,*", "L", "N", 0],
  ]) await check(source, write, direction, head);
  // Table fields are independently optional; each edit rebuilds the actual machine.
  await edit({ rules: "q0,1->HALT,2,R" });
  await page.click("#apply");
  await page.getByLabel("规则 1 写入符号", { exact: true }).fill("");
  await page.getByLabel("规则 1 写入符号", { exact: true }).press("Tab");
  assert.equal(await page.getByLabel("规则 1 写入符号", { exact: true }).inputValue(), "1");
  assert.equal(await page.getByLabel("规则 1 移动方向", { exact: true }).inputValue(), "R");
  await page.getByLabel("规则 1 移动方向", { exact: true }).selectOption("");
  assert.equal(await page.getByLabel("规则 1 移动方向", { exact: true }).inputValue(), "N");
  await page.locator("#compiledProgram").evaluate(element => { element.open = true; });
  // Re-render the expanded source through a normal source input event.
  await edit({ rules: await page.inputValue("#rules") });
  assert.equal(await page.inputValue("#compiledRuleSource"), "q0,1->HALT,1,N");
  await page.click("#step");
  assert.equal(await page.textContent("#headPosition"), "0");
  assert.equal(await page.textContent("#readSymbol"), "1");
  await edit({ rules: "q0,1->HALT,2,R" });
  await page.click("#apply");
  await page.getByLabel("规则 1 写入符号", { exact: true }).fill("*");
  await page.getByLabel("规则 1 写入符号", { exact: true }).press("Tab");
  assert.equal(await page.getByLabel("规则 1 写入符号", { exact: true }).inputValue(), "1");
  await page.getByLabel("规则 1 移动方向", { exact: true }).selectOption("*");
  assert.equal(await page.inputValue("#compiledRuleSource"), "q0,1->HALT,1,N");
  await page.click("#step");
  assert.equal(await page.textContent("#headPosition"), "0");
  assert.equal(await page.textContent("#readSymbol"), "1");
  await edit({ rules: "f(s,end):\n    s,1->end,*,R\nstart,1->f,*,*\nf\nafter,0->HALT,L,*", initialState: "start" });
  await page.click("#apply");
  assert.equal(await page.textContent("#errors"), "");
  await page.click("#step");
  assert.equal(await page.textContent("#headPosition"), "0");
  await page.click("#step");
  assert.equal(await page.textContent("#headPosition"), "1");
  await page.click("#step");
  assert.equal(await page.textContent("#currentState"), "HALT");
  assert.equal(await page.textContent("#readSymbol"), "L");
  assert.equal(await page.textContent("#headPosition"), "1");
  await edit({ initialState: "q0" });
  await edit({ rules: "q0,1->HALT,,Q" });
  assert.match(await page.textContent("#errors"), /第 1 行/);
  await edit({ rules: "q0,1->HALT,," });
  assert.equal(await page.textContent("#errors"), "");
  await page.locator("#ruleTable").scrollIntoViewIfNeeded();
  await page.screenshot({ path: fileURLToPath(new URL("defaults.png", directory)) });
  assert.deepEqual(errors, []);
  const report = { results, tableDefaults: true, tableStarDefaults: true, functionStarDefaults: true, compiledSourceMatches: true, invalidDirectionAndRecovery: true, errors };
  await writeFile(new URL("browser.json", directory), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
