import { expect, it } from "vitest";
import { inputToTape, parseTransitions, TuringMachine } from "../src/core";
import { bfPresets, makeBrainfuckProject, readBrainfuckOutput, readBrainfuckSource } from "../src/brainfuck";

function run(source: string, input = "", limit = 4_000_000) {
  const project = makeBrainfuckProject(source, input);
  const parsed = parseTransitions(project.rules, { haltStates: ["H"], rejectStates: ["R"] });
  expect(parsed.errors).toEqual([]);
  const machine = new TuringMachine({ blankSymbol: project.blankSymbol, initialState: project.initialState,
    haltStates: ["H"], acceptStates: [], rejectStates: ["R"], transitions: parsed.transitions,
  }, inputToTape(project.input, project.blankSymbol));
  for (let step = 0; step < limit; step++) {
    const result = machine.step();
    if (!result.stopped) continue;
    expect(result.reason, machine.currentState).toBe("halt");
    const output = readBrainfuckOutput(machine.tape);
    expect(machine.tape.entries()).toHaveLength(output.bytes.length);
    return { ...output, steps: machine.stepCount, project };
  }
  throw new Error(`BF did not halt within ${limit} tape steps: ${machine.currentState}`);
}

it.each([
  ["", []], ["+.", [1]], ["-.", [255]], ["-.+.", [255, 0]],
  ["+++[>++<-]>.", [6]], ["[+[+]-]++.", [2]],
  ["++[>++[>+<-]<-]>>.", [4]], ["+>++<.>.", [1, 2]],
  ["<+++>+<.>.", [3, 1]], ["+[->+<]>.", [1]],
  ["with whitespace\n+ + .", [2]],
] as const)("executes %s with real tape transitions", (source, bytes) => {
  const result = run(source);
  expect(result.bytes).toEqual(bytes);
  expect(result.project.blankSymbol).toBe("|");
  expect(result.project.rules).not.toContain("□");
});

it("reads UTF-8 bytes, emits them in order, and sets EOF to zero", () => {
  expect(run(",[.,]", "Hi!|,/\\你好").text).toBe("Hi!|,/\\你好");
  expect(run(",.,.", "A").bytes).toEqual([65, 0]);
});

it("executes both the loop example and Hello World", () => {
  const letter = run(bfPresets.letter.source);
  console.info("BF output A tape steps:", letter.steps);
  expect(letter.text).toBe("A");
  expect(letter.steps).toBeLessThan(4000);
  expect(run(bfPresets.hello.source, "", 12_000_000).text).toBe("Hello World!\n");
}, 30_000);

it("reports bracket locations and retains the editable source in exports", () => {
  expect(() => makeBrainfuckProject("+\n ]")).toThrow("第 2 行第 2 列");
  expect(() => makeBrainfuckProject("\n [+")).toThrow("第 2 行第 2 列");
  const project = makeBrainfuckProject("+.", "/\\|");
  expect(readBrainfuckSource(project.rules)).toEqual({ source: "+.", input: "/\\|" });
  expect(readBrainfuckSource("user rules")).toBeUndefined();
});

it("increments a unary input with a BF program", () => {
  const preset = bfPresets.unary;
  expect(run(preset.source, preset.input).text).toBe("1111");
  expect(run(preset.source, "").text).toBe("1");
});
