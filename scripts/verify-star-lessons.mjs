import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const { chromium } = createRequire(import.meta.url)(process.argv[2] || "playwright");
const browser = await chromium.launch({ headless: true, ...(process.argv[3] ? { executablePath: process.argv[3] } : {}) });
const directory = new URL("../doc/星号函数教程/evidence/", import.meta.url);
await mkdir(directory, { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [], results = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("http://127.0.0.1:5173/turing-machine-simulator/");
  assert.equal(await page.locator('#example optgroup[label="函数教程"] option[value="functionStarDefaults"]').count(), 1);
  const oldDraft = await page.inputValue("#rules");
  await page.selectOption("#example", "functionStarDefaults");
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
    if (structure === "original") assert.match(source, /,\*,\*/);
    const trace = [];
    for (let i = 0; i < 5; i++) {
      await page.click("#step");
      trace.push({ state: await page.textContent("#currentState"), head: await page.textContent("#headPosition"), read: await page.textContent("#readSymbol") });
    }
    assert.deepEqual(trace.map(item => item.head), ["0", "0", "0", "1", "1"]);
    assert.equal(trace[2].read, "R");
    assert.equal(trace[4].read, "L");
    assert.equal(trace[4].state, "HALT");
    assert.equal(await page.textContent("#stepCount"), "5");
    results.push({ names, structure, style, trace });
  }
  await page.selectOption("#exampleStateNames", "descriptive");
  await page.selectOption("#exampleStructure", "original");
  await page.selectOption("#exampleSourceStyle", "commented");
  await page.click("#loadExample");
  await page.locator("#rules").scrollIntoViewIfNeeded();
  await page.screenshot({ path: fileURLToPath(new URL("example.png", directory)) });
  await page.goto("http://127.0.0.1:5173/turing-machine-simulator/campaign.html?level=function-conditional");
  assert.match(await page.textContent("#levelTitle"), /下一状态也能调用函数/);
  assert.match(await page.textContent("#levelExplanation"), /普通状态/);
  assert.match(await page.textContent("#lessonSyntax"), /ready,1->flip,\*,\*/);
  assert.match(await page.textContent("#workedExampleStages"), /第 4 步/);
  const starter = await page.inputValue("#rulesEditor");
  assert.match(starter, /start,1->ready,\*,\*/);
  assert.match(starter, /ready,1->flip,\*,\*/);
  assert.doesNotMatch(starter, /q0,1->done,0,R/);
  await page.locator("#levelExplanation").scrollIntoViewIfNeeded();
  await page.screenshot({ path: fileURLToPath(new URL("campaign.png", directory)) });
  assert.deepEqual(errors, []);
  const report = { groupVisible: true, selectionKeepsDraft: true, results, campaignLessonVisible: true, starterIncomplete: true, errors };
  await writeFile(new URL("browser.json", directory), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ ...report, results: results.map(({ trace, ...result }) => ({ ...result, final: trace.at(-1), steps: trace.length })) }, null, 2));
} finally { await browser.close(); }
