import { expect, it } from "vitest";
import { inputToTape, parseTransitions, TuringMachine } from "../src/core";
import { lambdaBeta, makeLambdaProject, migrateLambdaInput, readLambdaOutput } from "../src/lambda-local";
import { reduceLambda } from "../src/lambda-reduce";
import { visibleTapeSymbol } from "../src/symbol-annotations";

function run(input: string, limit = 300_000) {
  const project = makeLambdaProject(input);
  expect(project.input).toBe(input);
  const options = { acceptStates: [project.acceptStates], rejectStates: [project.rejectStates], haltStates: project.haltStates.split(",") };
  const parsed = parseTransitions(project.rules, options);
  expect(parsed.errors).toEqual([]);
  const machine = new TuringMachine({ ...options, initialState: project.initialState, blankSymbol: project.blankSymbol, transitions: parsed.transitions }, inputToTape(project.input, project.blankSymbol));
  let min = 0;
  let reduced = false;
  for (let step = 0; step < limit; step++) {
    min = Math.min(min, machine.headPosition);
    const result = machine.step();
    if (result.record?.fromState === lambdaBeta) reduced = true;
    if (!result.stopped) continue;
    expect(result.reason, `state ${machine.currentState} at ${machine.headPosition}, ${step} steps`).toBe("accept");
    const decoded = readLambdaOutput(machine.tape);
    const output = reduced ? decoded?.output : decoded?.literal;
    expect(decoded).toBeDefined();
    expect(machine.tape.entries().every(([, symbol]) => [...visibleTapeSymbol(symbol)].length <= 1)).toBe(true);
    expect([...decoded!.display.values()].every(label => [...label].length <= 1)).toBe(true);
    expect(min).toBeGreaterThanOrEqual(-1);
    expect(machine.headPosition).toBe(0);
    const display = reduced ? new Map([...decoded!.display, ...decoded!.parentheses]) : new Map<number, string>();
    const rendered = machine.tape.entries().filter(([position]) => position >= 0)
      .map(([position, symbol]) => display.get(position) ?? visibleTapeSymbol(symbol)).join("");
    return { output, rendered, steps: machine.stepCount };
  }
  throw new Error(`Did not stop: ${machine.currentState} at ${machine.headPosition}, ${JSON.stringify(machine.tape.entries()).slice(0, 500)}`);
}

it.each([
  ["A", "A"], ["V", "V"], ["AB_0123", "AB_0123"], ["0123456789", "0123456789"],
  ["(λx.x) A", "A"], ["(λx.λy.x) y", "λy0.y"],
  ["λABC_01.ABC_01", "λABC_01.ABC_01"],
  ["λx.(λy.y) x", "λx.x"], ["λx.λx.x", "λx.λx.x"],
  ["(λx.x x) (λy.y)", "λy.y"], ["λz.(λx.λy.x) z", "λz.λy.z"],
  ["(λx.A) ((λx.x x) (λx.x x))", "A"],
  ["(λ_._) V0123", "V0123"], ["(λ0.0) _", "_"],
  ["(λx.λy.x y) (λz.z)", "λy.y"],
] as const)("locally reduces %s to %s", (source, output) => {
  expect(reduceLambda(source)).toMatchObject({ status: "done", output });
  expect(run(source).output).toBe(output);
}, 20_000);

it("marks the original text without clearing it or inventing printed parentheses", () => {
  const source = "  ((\\AB_12.\n AB_12)) V0  ";
  const project = makeLambdaProject(source);
  const parsed = parseTransitions(project.rules, { acceptStates: [project.acceptStates], rejectStates: [project.rejectStates], haltStates: project.haltStates.split(",") });
  expect(parsed.errors).toEqual([]);
  expect(project.rules).not.toContain("lambda.input.erase");
  expect(project.rules).not.toContain("lambda.input.write");
  const machine = new TuringMachine({ initialState: project.initialState, blankSymbol: project.blankSymbol,
    acceptStates: [project.acceptStates], rejectStates: [project.rejectStates], haltStates: project.haltStates.split(","), transitions: parsed.transitions,
  }, inputToTape(source, project.blankSymbol));
  for (let step = 0; step < 20_000 && machine.currentState !== "lambda.scan"; step++) {
    const result = machine.step();
    expect(result.stopped).toBe(false);
    const visible = machine.tape.entries().map(([, token]) => visibleTapeSymbol(token)).join("");
    expect(visible.length).toBeGreaterThanOrEqual(source.length - 1);
    expect([...visible].filter(char => char === "(").length).toBeLessThanOrEqual(2);
    expect([...visible].filter(char => char === ")").length).toBeLessThanOrEqual(2);
  }
  expect(machine.currentState).toBe("lambda.scan");
  expect(machine.tape.entries().map(([, token]) => visibleTapeSymbol(token)).join("")).toBe(source);
});

it("prints only grouping that substitution actually needs", () => {
  expect(run("(λx.λy.x) y").rendered.trim()).toBe("λy0.y");
  expect(run("(λx.f x) (a b)").rendered.trim()).toBe("f (a b)");
  expect(run("(λx.f x) λz.z").rendered.trim()).toBe("f (λz.z)");
  expect(run("  λAB_12. AB_12  ").rendered).toBe("  λAB_12. AB_12  ");
});

it("stores long identifiers in real character cells and matches the whole name", () => {
  const name = "ABCDEFGHIJKLMNOPQRSTUVWXYZ_0123456789";
  const output = "LongVariable_0123456789";
  expect(run(`(λ${name}.${name}) ${output}`).output).toBe(output);
  expect(run("(λLongName.LongName LongName2) AB_12").output).toBe("AB_12 LongName2");
}, 20_000);

it("preserves Church numerals as lambda expressions and chooses numeric suffixes", () => {
  const numeral = "λf.λx.f (f x)";
  expect(run(numeral).output).toBe(numeral);
  expect(run("λf.λx.x").output).toBe("λf.λx.x");
  const crowded = "(λx.λy.x) (y y0 y1 y2 y3 y4 y5 y6 y7 y8 y9)";
  const result = run(crowded).output;
  expect(result?.startsWith("λy10.")).toBe(true);
  expect(reduceLambda(crowded)).toMatchObject({ output: result });
});

it("starts with the exact original expression and converts syntax using tape rules", () => {
  const source = "  (\\AB_12.\n AB_12)\tV0123  ";
  const project = makeLambdaProject(source);
  expect(inputToTape(project.input, project.blankSymbol)).toEqual([...source].map((symbol, i) => [i, symbol]));
  expect(run(source).output).toBe("V0123");
});

it("updates the old encoded-input project without overwriting edited rules", () => {
  const current = makeLambdaProject("(λx.x) V0");
  const rest = current.rules.split("\n").filter(line => !line.startsWith("lambda.start,") && !line.startsWith("lambda.input.")).join("\n");
  const legacy = { ...current, input: "t#(λ.token.0)", rules: rest + "\nlambda.start,t#(λ.token.0)->lambda.scan,t#(λ.token.0),R" };
  expect(migrateLambdaInput(legacy).input).toBe("(λx.x) V0");
  expect(migrateLambdaInput(legacy).rules).toBe(current.rules);
  const edited = { ...legacy, rules: legacy.rules + "\ncustom,1->custom,1,R" };
  expect(migrateLambdaInput(edited)).toBe(edited);
});

it("matches direct normal-order substitution across generated names and scopes", () => {
  let seed = 29471;
  const pick = (n: number) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n; };
  const names = ["A", "V", "_0", "123", "AB_12"];
  const expression = (depth: number): string => {
    if (!depth || pick(4) === 0) return names[pick(names.length)];
    return pick(2) ? `(λ${names[pick(names.length)]}.${expression(depth - 1)})`
      : `(${expression(depth - 1)} ${expression(depth - 1)})`;
  };
  for (let sample = 0; sample < 50; sample++) {
    const source = expression(3);
    const expected = reduceLambda(source, 25);
    if ("output" in expected) expect(run(source).output, source).toBe(expected.output);
  }
}, 30_000);
