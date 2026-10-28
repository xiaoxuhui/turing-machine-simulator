import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";

// Optional arguments: installed Playwright directory, Chromium executable, isolated URL.
// Always use a fresh browser context; never connect to the user's editor tab.
const { chromium } = createRequire(import.meta.url)(process.argv[2] || "playwright");
const browser = await chromium.launch({ headless: true, ...(process.argv[3] ? { executablePath: process.argv[3] } : {}) });
const cases = [
  ["functionBasics", "1", 1], ["functions", "11111", 5],
  ["functionReturn", "12", 3], ["functionComposition", "123", 3],
  ["functionParentReturn", "123", 4], ["functionExportEntry", "23", 2],
  ["functionExportRepeat", "1212", 4], ["functionExports", "1234", 5],
];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const pageErrors = [], consoleErrors = [], failedResources = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  page.on("console", message => { if (message.type() === "error") consoleErrors.push({ text: message.text(), url: message.location().url }); });
  page.on("response", response => { if (response.status() >= 400) failedResources.push({ url: response.url(), status: response.status() }); });
  const response = await page.goto(process.argv[4] || "http://127.0.0.1:5182/turing-machine-simulator/");
  assert.equal(response.status(), 200);
  await page.waitForSelector("#example option", { state: "attached" });
  const groups = await page.locator("#example optgroup").evaluateAll(items => items.map(group => ({ name: group.label, count: group.children.length })));
  assert.equal(await page.locator("#example option").count(), 28);
  assert.equal(groups.find(group => group.name === "函数教程")?.count, 8);
  assert.equal(await page.inputValue("#exampleSourceStyle"), "plain");

  const results = [];
  for (const [key, expected, steps] of cases) {
    await page.selectOption("#example", key);
    assert.match(await page.locator("#exampleNote").textContent(), /第 [1-8] 课/);
    await page.click("#loadExample");
    assert.equal(await page.locator("#errors").textContent(), "");
    assert.equal(await page.locator("#addRule").isDisabled(), true);
    assert.match(await page.locator("#functionStatus").textContent(), /已识别.*函数/);
    for (let i = 0; i < steps; i++) await page.click("#step");
    const actual = await page.locator("#tape .cell > span:last-child").allTextContents();
    const output = actual.filter(symbol => symbol !== "□").join("");
    assert.equal(output, expected, key);
    assert.equal(await page.locator("#stepCount").textContent(), String(steps), key);
    assert.equal(await page.locator("#currentState").textContent(), "HALT", key);
    assert.equal(await page.locator("#status").textContent(), "已停机", key);
    results.push({ key, output, steps, state: "HALT" });
  }

  const beforeStyleChange = await page.inputValue("#rules");
  await page.selectOption("#exampleSourceStyle", "commented");
  assert.equal(await page.inputValue("#rules"), beforeStyleChange);
  await page.click("#loadExample");
  assert.match(await page.inputValue("#rules"), /^# /);
  for (let i = 0; i < 5; i++) await page.click("#step");
  assert.equal(await page.locator("#currentState").textContent(), "HALT");
  const commentedSymbols = await page.locator("#tape .cell > span:last-child").allTextContents();
  assert.equal(commentedSymbols.filter(symbol => symbol !== "□").join(""), "1234");
  const commentedSource = await page.inputValue("#rules");
  await page.selectOption("#exampleSourceStyle", "plain");
  assert.equal(await page.inputValue("#rules"), commentedSource);
  await page.click("#loadExample");
  assert.doesNotMatch(await page.inputValue("#rules"), /^\s*#/m);
  const source = await page.inputValue("#rules");
  await page.selectOption("#example", "functionBasics");
  assert.equal(await page.inputValue("#rules"), source, "preview must preserve the draft");
  await page.reload();
  await page.waitForSelector("#rules");
  assert.equal(await page.inputValue("#rules"), source, "reload must preserve source and indentation");
  assert.match(await page.locator("#draftStatus").textContent(), /保存/);

  await page.selectOption("#example", "functionExportEntry");
  await page.click("#loadExample");
  for (const [entry, expected, steps] of [["流程", "123", 3], ["流程.第三步", "3", 1]]) {
    await page.fill("#initialState", entry);
    await page.click("#apply");
    assert.equal(await page.locator("#errors").textContent(), "");
    for (let i = 0; i < steps; i++) await page.click("#step");
    const symbols = await page.locator("#tape .cell > span:last-child").allTextContents();
    assert.equal(symbols.filter(symbol => symbol !== "□").join(""), expected);
    assert.equal(await page.locator("#currentState").textContent(), "HALT");
  }

  // Exercise the continuous-run control as well as manual steps.
  await page.selectOption("#example", "functionComposition");
  await page.click("#loadExample");
  await page.fill("#speedNumber", "100");
  await page.click("#run");
  await page.waitForFunction(() => document.getElementById("currentState").textContent === "HALT");
  assert.equal(await page.locator("#stepCount").textContent(), "3");
  // ret is opt-in: removing it resumes at the next expression, not the exit-named rule.
  await page.selectOption("#example", "functionReturn");
  await page.click("#loadExample");
  const returnSource = await page.inputValue("#rules");
  assert.match(returnSource, /ret q1/);
  await page.fill("#rules", returnSource.replace("    ret q1\n", ""));
  await page.click("#apply");
  for (let i = 0; i < 3; i++) await page.click("#step");
  const normalSymbols = await page.locator("#tape .cell > span:last-child").allTextContents();
  assert.equal(normalSymbols.filter(symbol => symbol !== "□").join(""), "19");

  const initialSource = "甲(q,out):\n    q,□ -> out,1,R\n乙(q,out):\n    q,□ -> out,2,R\nstart,□ -> HALT,9,N\n甲\n乙";
  await page.fill("#rules", initialSource);
  const initialChoices = [];
  for (const [initial, expected, steps] of [["", "12", 2], ["甲", "12", 2], ["乙", "2", 1], ["start", "9", 1]]) {
    await page.fill("#initialState", initial);
    await page.click("#apply");
    assert.equal(await page.locator("#errors").textContent(), "");
    for (let i = 0; i < steps; i++) await page.click("#step");
    const symbols = await page.locator("#tape .cell > span:last-child").allTextContents();
    assert.equal(symbols.filter(symbol => symbol !== "□").join(""), expected);
    initialChoices.push({ initial, output: expected, steps });
  }
  const userSource = await readFile(new URL("../tests/fixtures/function-calls-no-ret.tm", import.meta.url), "utf8");
  await page.fill("#rules", userSource);
  await page.fill("#input", "");
  await page.fill("#blankSymbol", "0");
  await page.fill("#haltStates", "H");
  await page.fill("#initialState", "a1");
  await page.click("#apply");
  assert.equal(await page.locator("#errors").textContent(), "");
  await page.click("#compiledProgram summary");
  await page.waitForFunction(() => document.getElementById("internalNameMap").value.length > 0);
  assert.match(await page.locator("#compiledEntry").textContent(), /实际初始入口：a1/);
  const nameMap = await page.inputValue("#internalNameMap");
  const actualRules = await page.inputValue("#compiledRuleSource");
  assert.match(nameMap, /r\.q0 → __fn\./);
  assert.match(nameMap, /d1 → __fn\.script\./);
  assert.match(actualRules, /a1,0->__fn\.script\./);
  assert.doesNotMatch(actualRules, /[ \t]+->|->[ \t]+|^#/m);
  assert.equal(await page.locator("#compiledRuleSource").evaluate(element => element.readOnly), true);
  const userTrace = [];
  for (let i = 0; i < 8; i++) {
    await page.click("#step");
    userTrace.push(await page.locator("#currentState").textContent());
    assert.notEqual(await page.locator("#status").textContent(), "缺少转移规则");
  }
  assert.equal(await page.locator("#currentState").textContent(), "H");
  assert.equal(await page.locator("#stepCount").textContent(), "8");
  assert.equal(await page.locator("#headPosition").textContent(), "2");
  // Refresh also migrates a saved workbench draft without changing indentation.
  await page.fill("#rules", "r(q0,q1):\n    q0,0  ->  q1,0,R\n\nr");
  await page.reload();
  await page.waitForSelector("#rules");
  assert.equal(await page.inputValue("#rules"), "r(q0,q1):\n    q0,0->q1,0,R\n\nr");
  assert.deepEqual(pageErrors, []);
  // Vite has no default favicon; record its 404 separately from application failures.
  assert.deepEqual(failedResources.filter(resource => !new URL(resource.url).pathname.endsWith("/favicon.ico")), []);
  assert.deepEqual(consoleErrors.filter(error => !error.url.endsWith("/favicon.ico") || !error.text.includes("404")), []);
  const report = { groups, cases: results, exampleStyles: { default: "plain", switchPreservesDraft: true, commentedOutput: "1234", plainReloadRemovesComments: true }, previewPreserved: true, reloadPreserved: true, alternateEntries: 2, continuousRun: "3 steps, HALT", retComparison: { explicit: "12", normal: "19" }, initialChoices, userProgram: { steps: 8, head: 2, state: "H", trace: userTrace }, internalNameRows: nameMap.split("\n").length, pureActualRules: true, arrowDraftMigrated: true, pageErrors, consoleErrors, failedResources };
  const evidenceDir = new URL("../doc/调用返回顺序/evidence/", import.meta.url);
  await mkdir(evidenceDir, { recursive: true });
  await writeFile(new URL("browser.json", evidenceDir), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
