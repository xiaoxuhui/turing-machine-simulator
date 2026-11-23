import { expect, it } from "vitest";
import { examples } from "../src/examples";
import { buildRuleLessons, explainSymbol } from "../src/rule-lessons";
import { ruleGuideKey } from "../src/rule-guide";
import { inputToTape, parseTransitions, resolveInitialState, TuringMachine } from "../src/core";

const split = (value: string) => value.split(",").filter(Boolean);
it.each(["binaryAdd", "binarySubtract", "binaryMultiply", "binaryDivide", "binaryPower", "binaryLog", "brainfuck"])("explains every actual compiler transition in %s", id => {
  const project = examples[id], model = buildRuleLessons(project);
  expect(model.compilerRuleCount).toBe(model.ruleCount);
  for (const { rules } of model.states) for (const { explanation } of rules) {
    for (const field of [explanation.purpose, explanation.read, explanation.write, explanation.move, explanation.next]) expect(field.trim()).not.toBe("");
  }
});

it("preserves all arithmetic contexts when equivalent addition states are merged", () => {
  const model = buildRuleLessons(examples.binaryAdd);
  const contexts = model.states.flatMap(state => state.rules.flatMap(item => item.explanation.contexts ?? []));
  for (const a of [0, 1]) for (const b of [0, 1]) for (const carry of [0, 1]) {
    const total = a + b + carry;
    expect(contexts.some(text => text.includes(`${a}+${b}+${carry}=${total}`) && text.includes(`本位写 ${total % 2}`) && text.includes(`进位 ${Math.floor(total / 2)}`))).toBe(true);
  }
});

it("looks up explanations by exact executed rules and supports numeric state names", () => {
  const project = examples.binaryAdd, original = buildRuleLessons(project), numeric = buildRuleLessons(project, true);
  const options = { haltStates: split(project.haltStates), acceptStates: split(project.acceptStates), rejectStates: split(project.rejectStates) };
  const parsed = parseTransitions(project.rules, options);
  const machine = new TuringMachine({ ...options, initialState: resolveInitialState(parsed, project.initialState), blankSymbol: project.blankSymbol, transitions: parsed.transitions }, inputToTape(project.input, project.blankSymbol));
  const explanations = new Map(original.states.flatMap(state => state.rules.map(item => [ruleGuideKey(item.rule), item] as const)));
  let stopped = false;
  for (let step = 0; step < 10000; step++) {
    const result = machine.step();
    if (result.record) {
      // Wildcard rules have empty symbols in the definition; executed records contain actual symbols.
      const source = parsed.transitions.find(rule => rule.fromState === result.record!.fromState && rule.readSymbol === result.record!.readSymbol)
        ?? parsed.transitions.find(rule => rule.fromState === result.record!.fromState && !rule.readSymbol)!;
      expect(explanations.has(ruleGuideKey(source))).toBe(true);
    }
    if (result.stopped) { expect(result.reason).toBe("halt"); stopped = true; break; }
  }
  expect(stopped).toBe(true);
  expect(numeric.ruleCount).toBe(original.ruleCount);
  expect(numeric.compilerRuleCount).toBe(numeric.ruleCount);
  for (const state of numeric.states) {
    const baseline = original.states.find(item => item.name === state.original)!;
    expect(state.rules.map(item => item.explanation)).toEqual(baseline.rules.map(item => item.explanation));
    for (const item of state.rules) expect(numeric.states.some(target => target.name === item.rule.toState) || options.haltStates.includes(item.rule.toState) || options.rejectStates.includes(item.rule.toState)).toBe(true);
  }
});

it.each(Object.entries(examples))("keeps all actual rules searchable for %s", (_id, project) => {
  const model = buildRuleLessons(project);
  const parsed = parseTransitions(project.rules, { haltStates: split(project.haltStates), acceptStates: split(project.acceptStates), rejectStates: split(project.rejectStates) });
  expect(model.ruleCount).toBe(parsed.transitions.length);
  expect(new Set(model.states.flatMap(state => state.rules.map(item => ruleGuideKey(item.rule))))).toEqual(new Set(parsed.transitions.map(ruleGuideKey)));
});

it("distinguishes hidden stack identity, a literal zero, and the actual blank", () => {
  expect(explainSymbol("#(L)1", examples.binaryAdd)).toContain("左操作数");
  expect(explainSymbol("#(R)1", examples.binaryAdd)).toContain("右操作数");
  expect(explainSymbol("□", examples.binaryAdd)).toContain("空白");
  expect(explainSymbol("0", examples.binaryAdd)).toContain("普通数值");
  expect(explainSymbol("0", examples.fibonacci)).toContain("真正空白");
});
