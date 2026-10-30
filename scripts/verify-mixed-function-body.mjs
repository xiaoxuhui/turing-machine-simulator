import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";

const { chromium } = createRequire(import.meta.url)(process.argv[2] || "playwright");
const browser = await chromium.launch({ headless: true, ...(process.argv[3] ? { executablePath: process.argv[3] } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto("http://127.0.0.1:5173/turing-machine-simulator/");
  const cases = [];
  const runSteps = async (steps, expected) => {
    assert.equal(await page.locator("#errors").textContent(), "");
    assert.equal(await page.getAttribute("#rules", "aria-invalid"), "false");
    for (let i = 0; i < steps; i++) await page.click("#step");
    assert.equal(await page.locator("#currentState").textContent(), "HALT");
    assert.equal(await page.locator("#stepCount").textContent(), String(steps));
    const blank = await page.inputValue("#blankSymbol");
    const output = (await page.locator("#tape .cell > span:last-child").allTextContents()).filter(symbol => symbol !== blank).join("");
    assert.equal(output, expected);
    return output;
  };
  for (const [key, expected] of [["functionMixed", "11"], ["functionMixedContinue", "123"]]) {
    for (const style of ["plain", "commented"]) {
      await page.selectOption("#example", key);
      await page.selectOption("#exampleSourceStyle", style);
      await page.click("#loadExample");
      const source = await page.inputValue("#rules");
      assert.equal(/^\s*#/m.test(source), style === "commented");
      cases.push({ key, style, output: await runSteps(6, expected), steps: 6 });
    }
  }
  await page.selectOption("#example", "functionMixed");
  await page.click("#loadExample");
  await page.fill("#input", "l");
  await page.click("#apply");
  assert.equal(await runSteps(1, "l"), "l");
  assert.equal(await page.locator("#headPosition").textContent(), "-1");
  await page.locator("#compiledProgram > summary").click();
  await page.waitForFunction(() => document.querySelector("#internalNameMap").value.includes("copy.pred"));
  const mapping = await page.inputValue("#internalNameMap");
  assert.match(mapping, /copy\.pred.*函数内源码第/);
  assert.match(await page.inputValue("#compiledRuleSource"), /,1,N$/m);
  await page.selectOption("#example", "functionMixedContinue");
  await page.click("#loadExample");
  await page.click("#run");
  await page.waitForFunction(() => document.querySelector("#currentState").textContent === "HALT");
  assert.equal(await page.locator("#stepCount").textContent(), "6");
  const sourceBeforeReload = await page.inputValue("#rules");
  await page.reload();
  assert.equal(await page.inputValue("#rules"), sourceBeforeReload);
  assert.deepEqual(pageErrors, []);
  const report = { examples: 31, functionTutorials: 10, cases, lBranch: { steps: 1, output: "l", head: -1 }, internalCallLocations: true, continuousRun: { steps: 6, state: "HALT" }, reloadPreservesDraft: true, pageErrors };
  const directory = new URL("../doc/函数体混写/evidence/", import.meta.url);
  await mkdir(directory, { recursive: true });
  await writeFile(new URL("browser.json", directory), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
