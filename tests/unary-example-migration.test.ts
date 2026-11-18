import { expect, it } from "vitest";
import { unaryExamples } from "../src/unary-examples";
import { hyperoperationExamples } from "../src/hyperoperation-examples";
import { inverseOperationExamples } from "../src/inverse-operation-examples";
import { examples } from "../src/examples";
import { migrateUnaryExample } from "../src/unary-example-migration";
import { exampleSource } from "../src/example-source";
import { exampleVariant } from "../src/example-variants";
import { parseTransitions } from "../src/core";

it.each(Object.entries({ ...unaryExamples, ...hyperoperationExamples, ...inverseOperationExamples }))(
  "updates the saved old %s example while preserving input and settings", (id, original) => {
    for (const style of ["plain", "commented"] as const) {
      const saved = { ...original, input: "11", speed: 37, maxSteps: 1234, rules: exampleSource(original, style) };
      const migrated = migrateUnaryExample(saved);
      expect(migrated.initialState).toBe(examples[id].initialState);
      expect(migrated.blankSymbol).toBe("_");
      expect(migrated.haltStates).toBe(examples[id].haltStates);
      expect(migrated.acceptStates).toBe(examples[id].acceptStates);
      expect(migrated.rejectStates).toBe(examples[id].rejectStates);
      expect(parseTransitions(migrated.rules).transitions).toEqual(parseTransitions(examples[id].rules).transitions);
      expect(migrated.input).toBe("11");
      expect(migrated.speed).toBe(37);
      expect(migrated.maxSteps).toBe(1234);
      expect(migrateUnaryExample(migrated)).toEqual(migrated);
    }
  },
);

it("migrates old reusable function names and leaves every call resolvable", () => {
  const original = hyperoperationExamples.unaryDivide;
  const saved = { ...original, rules: original.sharedRules!() };
  const migrated = migrateUnaryExample(saved);
  expect(migrated.rules).toContain("inc(s,e):");
  expect(migrated.rules).not.toMatch(/寄存器加一|减一后收拢纸带|carryBar|parse\.scan/);
  const parsed = parseTransitions(migrated.rules);
  expect(parsed.errors).toEqual([]);
  expect(parsed.transitions).toEqual(parseTransitions(examples.unaryDivide.sharedRules!()).transitions);
});

it("updates the previous short-name version and numbered examples as well", () => {
  const current = examples.unaryMultiply;
  const previous = { ...current, blankSymbol: "□", haltStates: "HALT",
    rules: current.rules.replaceAll("_", "□").replace(/\bH\b/g, "HALT") };
  expect(migrateUnaryExample(previous)).toEqual(current);
  const oldNumeric = exampleVariant(unaryExamples.unaryMultiply, "numeric", "original");
  const migrated = migrateUnaryExample(oldNumeric);
  expect(migrated.blankSymbol).toBe("_");
  expect(migrated.haltStates).toBe("H");
  expect(migrated.initialState).toBe(oldNumeric.initialState);
  expect(/□|HALT/.test(migrated.rules)).toBe(false);
});

it("also migrates saved automatically extracted unary functions", () => {
  const original = unaryExamples.unaryCompare;
  const oldFunctions = exampleVariant(original, "descriptive", "functions");
  const migrated = migrateUnaryExample(oldFunctions);
  expect(migrated.initialState).toBe("c.p");
  expect(parseTransitions(migrated.rules).errors).toEqual([]);
  expect(migrated.rules).not.toContain("cmp.");
});

it("keeps custom, edited and unfinished drafts unchanged", () => {
  for (const rules of ["mul.init,1->", unaryExamples.unaryMultiply.rules + "\ncustom,0->HALT,1,N",
    unaryExamples.unaryMultiply.rules.replace("mul.init,1 -> mul.init,1,R", "mul.init,1 -> mul.init,0,R")]) {
    const project = { ...unaryExamples.unaryMultiply, rules };
    expect(migrateUnaryExample(project)).toBe(project);
  }
});
