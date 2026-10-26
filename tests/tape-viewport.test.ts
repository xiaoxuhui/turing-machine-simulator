import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const source = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

it("keeps the clipping viewport outside the moving tape and the state label outside that viewport", () => {
  expect(source).toContain('<div class="tape-viewport"><div id="tape" class="tape"></div></div><div id="headState"');
  expect(source).not.toContain('byId("tape").parentElement!.style.transform');
});

it("clips a centered 17-cell viewport that can shrink below its desktop and narrow-screen limits", () => {
  const viewport = css.match(/\.tape-viewport\s*\{([^}]+)\}/)?.[1] ?? "";
  expect(viewport).toMatch(/overflow:\s*hidden/);
  expect(viewport).toMatch(/width:\s*min\(100%,\s*970px\)/);
  expect(viewport).toMatch(/margin-inline:\s*auto/);
  expect(viewport).toMatch(/padding:\s*26px 0 38px/);
  expect(css).toMatch(/@media \(max-width: 1200px\)[^\n]*\.tape-viewport \{ max-width: 868px; \}/);
});
