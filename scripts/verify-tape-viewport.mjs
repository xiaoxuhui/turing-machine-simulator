import assert from "node:assert/strict";
import { createRequire } from "node:module";

// Optional arguments: installed Playwright directory, Chromium executable, URL.
const { chromium } = createRequire(import.meta.url)(process.argv[2] || "playwright");
const browser = await chromium.launch({ headless: true, ...(process.argv[3] ? { executablePath: process.argv[3] } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(process.argv[4] || "http://127.0.0.1:5182/turing-machine-simulator/");
  await page.waitForLoadState("networkidle"); // Vite may reload once after its first dependency scan.
  await page.waitForTimeout(1000);
  const desktop = await page.evaluate(async () => {
    const el = id => document.getElementById(id);
    el("example").value = "unary";
    el("example").dispatchEvent(new Event("change", { bubbles: true }));
    el("loadExample").click();
    el("input").value = "1".repeat(3000);
    el("apply").click();
    const speed = n => {
      el("speedNumber").value = String(n);
      el("speedNumber").dispatchEvent(new Event("input", { bubbles: true }));
    };
    const manual = [];
    for (const n of [10, 11, 1000]) {
      speed(n);
      const before = Number(el("stepCount").textContent);
      el("step").click();
      manual.push({ speed: n, delta: Number(el("stepCount").textContent) - before, transition: el("tape").style.transition });
    }
    const viewport = document.querySelector(".tape-viewport");
    const continuous = [];
    for (const n of [10, 11, 1000]) {
      speed(n);
      el("run").click();
      let outside = 0;
      for (let i = 0; i < 15; i++) {
        await new Promise(requestAnimationFrame);
        const r = viewport.getBoundingClientRect(), h = el("tape").querySelector(".head").getBoundingClientRect();
        if (h.left < r.left || h.right > r.right) outside++;
      }
      el("pause").click();
      continuous.push({ speed: n, outside, transition: el("tape").style.transition });
    }
    await new Promise(resolve => setTimeout(resolve, 30));
    const r = viewport.getBoundingClientRect();
    const head = el("tape").querySelector(".head").getBoundingClientRect();
    const index = el("tape").querySelector(".head .cell-index").getBoundingClientRect();
    el("tape").style.transition = "none";
    el("tape").style.transform = "translateX(400px)";
    const outside = [...el("tape").querySelectorAll(".cell")].filter(c => c.getBoundingClientRect().left > r.right + 2);
    const clipped = outside.every(c => {
      const rect = c.getBoundingClientRect();
      const hit = document.elementFromPoint(Math.min(innerWidth - 1, rect.left + 2), rect.top + 10);
      return !hit || !el("tape").contains(hit);
    });
    el("tapeViewMode").value = "fixed-zero";
    el("tapeViewMode").dispatchEvent(new Event("change", { bubbles: true }));
    const fixedCenter = el("tape").querySelectorAll(".cell-index")[8].textContent;
    return { manual, continuous, width: r.width, overflow: getComputedStyle(viewport).overflow, viewportTransform: getComputedStyle(viewport).transform, clippedCells: outside.length, clipped, indexInside: index.top >= r.top, arrowRoom: r.bottom - head.bottom, fixedCenter };
  });
  for (const row of desktop.manual) {
    assert.equal(row.delta, 1);
    assert.equal(row.transition, "transform 180ms ease-out");
  }
  for (const row of desktop.continuous) {
    assert.equal(row.outside, 0, `head escaped at speed ${row.speed}`);
    assert.match(row.transition, /^transform /);
  }
  assert.equal(desktop.width, 970);
  assert.equal(desktop.overflow, "hidden");
  assert.equal(desktop.viewportTransform, "none");
  assert.ok(desktop.clippedCells > 0 && desktop.clipped && desktop.indexInside && desktop.arrowRoom >= 34);
  assert.equal(desktop.fixedCenter, "0");
  await page.setViewportSize({ width: 390, height: 844 });
  const narrow = await page.evaluate(async () => {
    const el = id => document.getElementById(id);
    el("tapeViewMode").value = "follow-head";
    el("tapeViewMode").dispatchEvent(new Event("change", { bubbles: true }));
    el("run").click();
    let outside = 0;
    for (let i = 0; i < 20; i++) {
      await new Promise(requestAnimationFrame);
      const r = document.querySelector(".tape-viewport").getBoundingClientRect(), h = el("tape").querySelector(".head").getBoundingClientRect();
      if (h.left < r.left || h.right > r.right) outside++;
    }
    el("pause").click();
    const r = document.querySelector(".tape-viewport").getBoundingClientRect();
    el("tapeViewMode").value = "free-drag";
    el("tapeViewMode").dispatchEvent(new Event("change", { bubbles: true }));
    return { outside, viewportWidth: r.width, fits: r.left >= 0 && r.right <= innerWidth, noOverflow: document.documentElement.scrollWidth <= innerWidth, canDrag: el("tape").classList.contains("can-drag") };
  });
  assert.equal(narrow.outside, 0);
  assert.ok(narrow.fits && narrow.noOverflow && narrow.canDrag);
  const beforeDrag = await page.locator("#tape .cell-index").first().textContent();
  const bounds = await page.locator(".tape-viewport").boundingBox();
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 45);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 90, bounds.y + 45, { steps: 5 });
  await page.mouse.up();
  assert.notEqual(await page.locator("#tape .cell-index").first().textContent(), beforeDrag);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ desktop, narrow, drag: "passed", errors }, null, 2));
} finally {
  await browser.close();
}
