/// <reference types="vite/client" />
import { expect, it } from "vitest";
import source from "../src/main.ts?raw";

it("keeps the clipping viewport outside the moving tape and the state label outside that viewport", () => {
  expect(source).toContain('<div class="tape-viewport"><div id="tape" class="tape"></div></div><div id="headState"');
});
