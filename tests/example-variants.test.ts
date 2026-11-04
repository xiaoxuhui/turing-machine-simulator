import { expect, it } from "vitest";
import { examples, type ExampleProject } from "../src/examples";
import { exampleVariant } from "../src/example-variants";
import { exampleSource } from "../src/example-source";
import { parseTransitions, resolveInitialState, inputToTape, TuringMachine } from "../src/core";

function compile(project: ExampleProject, source = project.rules) {
  const split = (text: string) => text.split(",").filter(Boolean);
  const options = { haltStates: split(project.haltStates), acceptStates: split(project.acceptStates), rejectStates: split(project.rejectStates) };
  const parsed = parseTransitions(source, options);
  expect(parsed.errors).toEqual([]);
  return { parsed, definition: { ...options, initialState: resolveInitialState(parsed, project.initialState), blankSymbol: project.blankSymbol, transitions: parsed.transitions } };
}

it.each(Object.entries(examples))("preserves all state-name and structure variants of %s", (_key, project) => {
  const baseline = compile(project);
  expect(exampleVariant(project, "descriptive", "original")).toBe(project);
  for (const names of ["descriptive", "numeric"] as const) for (const structure of ["original", "flat", "functions"] as const) {
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
  }
}, 20000);

it("keeps local aliases, returns, exported paths, symbols and terminals when numbering", () => {
  const project: ExampleProject = { ...examples.functionExports, input: "", initialState: "父.入口", rules: `子(s,back):\n    s,□->back,1,R\n    ret back\n父(s,end,x=子):\n    s,□->入口,□,N\n    入口,□->x\n    back,□->end,2,N\n    导出状态 入口\n父` };
  const numeric = exampleVariant(project, "numeric", "original");
  expect(numeric.rules).toContain("x=子");
  expect(numeric.rules).toMatch(/ret \d+/);
  expect(numeric.initialState).toMatch(/^父\.\d+$/);
  const { definition } = compile(numeric);
  const machine = new TuringMachine(definition, []);
  while (!machine.step().stopped && machine.stepCount < 100) { /* actual transitions */ }
  expect(machine.currentState).toBe("HALT");
  expect(machine.tape.entries().map(([, symbol]) => symbol).join("")).toBe("12");
});
it("numbers direct external state parameters without changing their internal alias or symbol values", () => {
  const project = { ...examples.functionTypedParameters, rules: "f(s,end,outside,状态,C1,符号):\n    s,C1->outside,*,*\noutside,C1->HALT,2,*\nf", input: "", initialState: "f" };
  const numeric = exampleVariant(project, "numeric", "original");
  expect(numeric.rules).toMatch(/outside=\d+,状态,C1,符号/);
  expect(numeric.rules).toContain(",C1->outside,*,*");
  expect(compile(numeric).parsed.errors).toEqual([]);
});

it("actually shares duplicate rules and keeps each call site's continuation", () => {
  const project: ExampleProject = { ...examples.unary, input: "11", initialState: "left", rules: `left,1->left,1,R\nleft,□->after,□,N\nafter,□->right,2,L\nright,1->right,1,R\nright,□->HALT,□,N` };
  const variant = exampleVariant(project, "descriptive", "functions");
  expect(variant.rules).not.toContain("主程序(");
  expect(variant.rules).toContain("left: 公共右扫1 -> after");
  expect(variant.rules).toContain("right: 公共右扫1 -> HALT");
  expect(variant.rules.match(/^公共右扫1\(/gm)).toHaveLength(1);
});
