import { expect, it } from "vitest";
import { examples } from "../src/examples";
import { exampleSource } from "../src/example-source";
import { parseTransitions, resolveInitialState } from "../src/core";

it.each(Object.entries(examples))("keeps the actual program identical for both comment styles: %s", (_id, project) => {
  const options = { haltStates: project.haltStates.split(",").filter(Boolean), acceptStates: project.acceptStates.split(",").filter(Boolean), rejectStates: project.rejectStates.split(",").filter(Boolean) };
  const plain = exampleSource(project, "plain"), commented = exampleSource(project, "commented");
  const a = parseTransitions(plain, options), b = parseTransitions(commented, options);
  expect(a.errors).toEqual([]);
  expect(b.errors).toEqual([]);
  expect(b.transitions).toEqual(a.transitions);
  expect(resolveInitialState(b, project.initialState)).toBe(resolveInitialState(a, project.initialState));
  expect(plain).not.toMatch(/^\s*#/m);
  expect(commented).toMatch(/^# /);
  expect(exampleSource({ ...project, rules: commented }, "plain")).toBe(plain);
});

it.each(["unaryMultiply", "unaryDivide", "unaryPower", "unaryTetration", "unaryPentation"])("explains arithmetic phases between the actual rules: %s", id => {
  const lines = exampleSource(examples[id], "commented").split("\n");
  const firstRule = lines.findIndex(line => !line.startsWith("#") && line.includes("->"));
  const middleNotes = lines.map((line, index) => ({ line, index })).filter(item => item.index > firstRule && item.line.startsWith("#"));
  expect(middleNotes.length).toBeGreaterThanOrEqual(6);
  expect(middleNotes.some(item => /清理|擦除/.test(item.line))).toBe(true);
  expect(middleNotes.some(item => item.index > lines.length / 2)).toBe(true);
});
