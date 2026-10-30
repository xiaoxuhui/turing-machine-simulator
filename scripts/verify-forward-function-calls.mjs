import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";

const { chromium } = createRequire(import.meta.url)(process.argv[2] || "playwright");
const browser = await chromium.launch({ headless: true, ...(process.argv[3] ? { executablePath: process.argv[3] } : {}) });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("http://127.0.0.1:5173/turing-machine-simulator/");
  const functions = `seed(s,end):\n    s,□->end,0,R\nf(s,end):\n    s,□->end,1,R\ng(s,end):\n    s,□->end,2,R`;
  const cases = [
    { name: "later matching call", source: `${functions}\nseed\na,□->f,□,N\nskipped,□->HALT,9,N\ng\nf\nafter,□->HALT,3,N\nf`, expected: "013", steps: 4, initial: "" },
    { name: "no later matching call", source: `${functions}\nseed\na,□->f,□,N\nb,□->g,3,R\ng`, expected: "0132", steps: 5, initial: "" },
    { name: "declaration jumps forward", source: `${functions}\nstart,□->f,□,N\nskipped,□->HALT,9,N\ng\nf\nafter,□->HALT,3,N`, expected: "13", steps: 3, initial: "start" },
  ];
  const results = [];
  for (const item of cases) {
    await page.fill("#rules", item.source);
    await page.fill("#blankSymbol", "□");
    await page.fill("#input", "");
    await page.fill("#initialState", item.initial);
    await page.fill("#haltStates", "HALT");
    await page.click("#apply");
    assert.equal(await page.locator("#errors").textContent(), "");
    for (let i = 0; i < item.steps; i++) await page.click("#step");
    assert.equal(await page.locator("#currentState").textContent(), "HALT");
    assert.equal(await page.locator("#stepCount").textContent(), String(item.steps));
    const output = (await page.locator("#tape .cell > span:last-child").allTextContents()).filter(symbol => symbol !== "□").join("");
    assert.equal(output, item.expected);
    results.push({ name: item.name, output, steps: item.steps });
  }
  assert.deepEqual(errors, []);
  const result = { cases: results, pageErrors: errors };
  const directory = new URL("../doc/向后查找函数/evidence/", import.meta.url);
  await mkdir(directory, { recursive: true });
  await writeFile(new URL("browser.json", directory), JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result, null, 2));
} finally { await browser.close(); }
