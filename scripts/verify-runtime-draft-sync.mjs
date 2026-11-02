import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const { chromium } = createRequire(import.meta.url)(process.argv[2] || "playwright");
const browser = await chromium.launch({ headless: true, ...(process.argv[3] ? { executablePath: process.argv[3] } : {}) });
const directory = new URL("../doc/运行与规则同步/evidence/", import.meta.url);
await mkdir(directory, { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [], pausedFields = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("http://127.0.0.1:5173/turing-machine-simulator/");
  await page.click("#compiledProgram summary");
  const edit = fields => page.evaluate(values => {
    for (const [id, value] of Object.entries(values)) {
      const field = document.getElementById(id); field.value = value;
      field.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }, fields);
  const loop = "f(s,end):\n    s,□->s,1,R\nf";
  const base = { rules: loop, input: "", blankSymbol: "□", initialState: "", acceptStates: "", rejectStates: "", haltStates: "HALT" };
  const start = async (fields = {}) => {
    await edit({ ...base, ...fields, speed: "1000" });
    await page.click("#apply");
    await page.click("#run");
    await page.waitForFunction(() => Number(document.getElementById("stepCount").textContent) >= 2);
  };
  const stableAfterEdit = async () => {
    assert.match(await page.textContent("#status"), /待应用/);
    assert.match(await page.textContent("#compiledEntry"), /草稿预览/);
    const steps = await page.textContent("#stepCount");
    await page.waitForTimeout(80);
    assert.equal(await page.textContent("#stepCount"), steps);
    return Number(steps);
  };
  for (const [field, value] of Object.entries({ rules: loop.replace("1,R", "2,R"), input: "1", blankSymbol: "0", initialState: "f", acceptStates: "ACCEPT", rejectStates: "REJECT", haltStates: "STOP" })) {
    await start();
    await edit({ [field]: value });
    pausedFields.push({ field, stoppedAt: await stableAfterEdit() });
  }

  await start({ rules: "q0,□->q0,1,R", initialState: "q0" });
  await edit({ rules: "q0,□->HALT,2,N" });
  await stableAfterEdit();
  await page.click("#step");
  assert.equal(await page.textContent("#stepCount"), "1");
  assert.equal(await page.textContent("#currentState"), "HALT");
  assert.match(await page.textContent("#log"), /q0,□ → HALT,2,N/);
  assert.doesNotMatch(await page.textContent("#log"), /q0,1,R/);
  assert.doesNotMatch(await page.textContent("#compiledEntry"), /尚未应用/);

  await edit({ rules: "q0,□->q0,1,R" });
  await page.click("#apply");
  await page.click("#step");
  await edit({ rules: "q0,□->HALT,3,N" });
  await page.click("#reset");
  assert.equal(await page.textContent("#stepCount"), "0");
  assert.equal(await page.textContent("#headPosition"), "0");
  assert.equal(await page.textContent("#currentState"), "q0");
  await page.click("#step");
  assert.match(await page.textContent("#log"), /q0,□ → HALT,3,N/);

  await start({ rules: "q0,□->q0,1,R", initialState: "q0" });
  await edit({ rules: "bad,rule" });
  const invalidSteps = await page.textContent("#stepCount");
  await page.click("#run");
  await page.click("#step");
  await page.click("#reset");
  assert.equal(await page.textContent("#stepCount"), invalidSteps);
  assert.match(await page.textContent("#errors"), /第 1 行/);

  await edit({ rules: "q0,□->HALT,4,N" });
  await page.click("#run");
  await page.waitForFunction(() => document.getElementById("currentState").textContent === "HALT");
  assert.equal(await page.textContent("#stepCount"), "1");
  assert.match(await page.textContent("#log"), /q0,□ → HALT,4,N/);

  await start();
  await edit({ rules: loop.replace("1,R", "2,R") });
  await edit({ rules: loop });
  const undoSteps = await page.textContent("#stepCount");
  assert.equal(await page.textContent("#status"), "已暂停");
  await page.waitForTimeout(80);
  assert.equal(await page.textContent("#stepCount"), undoSteps);

  await start({ rules: "loop,□->loop,1,R", initialState: "loop" });
  await page.click("#addRule");
  await stableAfterEdit();
  await page.click("#run");
  await page.waitForFunction(() => Number(document.getElementById("stepCount").textContent) >= 2);
  await page.click("#clear");
  await stableAfterEdit();

  const ret = "f(s,end):\n    s,□->out,1,R\n    ret out\nf\nout,□->HALT,2,N";
  await edit({ ...base, rules: ret });
  await page.locator("#compiledRuleSource").scrollIntoViewIfNeeded();
  await page.screenshot({ path: fileURLToPath(new URL("pending-draft.png", directory)) });
  await page.click("#apply");
  await page.click("#step");
  assert.equal(await page.textContent("#currentState"), "out");
  await page.click("#step");
  assert.equal(await page.textContent("#currentState"), "HALT");
  const match = await page.evaluate(() => {
    const compiled = new Set(document.getElementById("compiledRuleSource").value.split("\n"));
    const logs = [...document.querySelectorAll("#log .log-row")].map(row => row.lastElementChild.textContent.split("　[")[0].replace(" → ", "->"));
    const table = [...document.querySelectorAll("#ruleTable .rule-data-row")].map(row => {
      const f = [...row.querySelectorAll("input,select")].map(field => field.value);
      return `${f[0]},${f[1]}->${f[2]},${f[3]},${f[4]}`;
    });
    return { records: logs.length, logsMatch: logs.every(line => compiled.has(line)), tableMatches: table.length === compiled.size && table.every(line => compiled.has(line)) };
  });
  assert.deepEqual(match, { records: 2, logsMatch: true, tableMatches: true });
  assert.deepEqual(errors, []);
  const report = { pausedFields, editedRuleSingleStep: true, resetUsesDraft: true, invalidDraftCannotResume: true, runUsesDraft: true, undoStaysPaused: true, addAndClearPause: true, retTrace: ["out", "HALT"], match, errors };
  await writeFile(new URL("browser.json", directory), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
