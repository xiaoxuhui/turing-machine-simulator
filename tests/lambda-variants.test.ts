import { expect, it } from "vitest";
import { examples, type ExampleProject } from "../src/examples";
import { exampleVariant } from "../src/example-variants";
import { exampleSource } from "../src/example-source";
import { parseTransitions, resolveInitialState, inputToTape, TuringMachine } from "../src/core";

// λ 示例是 6 万多条规则的生成机：单次编译约 2 秒，一套变体下来 40 秒以上。
// 拆成每个「命名方式 × 结构」一条用例，断言与 example-variants.test.ts 完全一致，
// 但单条用例不会长时间占住 vitest worker（超过 60 秒会触发 RPC 心跳超时）。
function compile(project: ExampleProject, source = project.rules) {
  const split = (text: string) => text.split(",").filter(Boolean);
  const options = { haltStates: split(project.haltStates), acceptStates: split(project.acceptStates), rejectStates: split(project.rejectStates) };
  const parsed = parseTransitions(source, options);
  expect(parsed.errors).toEqual([]);
  return { parsed, definition: { ...options, initialState: resolveInitialState(parsed, project.initialState), blankSymbol: project.blankSymbol, transitions: parsed.transitions } };
}

const combos = [
  ["descriptive", "original"],
  ["descriptive", "flat"],
  ["descriptive", "functions"],
  ["numeric", "original"],
  ["numeric", "flat"],
  ["numeric", "functions"],
] as const;

const cases = ["lambda", "campaign-example-lambda"].flatMap(key =>
  combos.map(([names, structure]) => ({ key, project: examples[key], names, structure }))
);

it.each(cases)("preserves $key variants: $names/$structure", ({ project, names, structure }) => {
  const baseline = compile(project);
  expect(exampleVariant(project, "descriptive", "original")).toBe(project);
  const variant = exampleVariant(project, names, structure);
  const result = compile(variant);
  if (structure !== "functions") expect(result.parsed.transitions.length).toBe(baseline.parsed.transitions.length);
  expect(compile(variant, exampleSource(variant, "plain")).parsed.transitions).toEqual(result.parsed.transitions);
  expect(compile(variant, exampleSource(variant, "commented")).parsed.transitions).toEqual(result.parsed.transitions);
  const a = new TuringMachine(baseline.definition, inputToTape(project.input, project.blankSymbol));
  const b = new TuringMachine(result.definition, inputToTape(project.input, project.blankSymbol));
  for (let step = 0; step < 1000; step++) {
    const x = a.step(), y = b.step();
    if (x.stopped !== y.stopped || x.reason !== y.reason || a.headPosition !== b.headPosition || x.record?.readSymbol !== y.record?.readSymbol || x.record?.writeSymbol !== y.record?.writeSymbol || x.record?.direction !== y.record?.direction) throw new Error(`${project.name}/${names}/${structure} differs at ${step}: ${JSON.stringify({ x, y, a: a.currentState, b: b.currentState })}`);
    if (x.stopped) break;
  }
  expect(b.tape.entries()).toEqual(a.tape.entries());
}, 60000);
