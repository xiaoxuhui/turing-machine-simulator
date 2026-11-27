import { expect, it } from "vitest";
import { parseTransitions, TuringMachine } from "../src/core";
import { formatUniversalSource, makeUniversalTextProject, readUniversalResult } from "../src/universal-machine";
import { universalHalt, universalReject, universalRules, universalStart } from "../src/universal-tape";

const source = (input: string, rules: string, initialState = "q0", haltStates = "H", acceptStates = "", rejectStates = "", blank = "0") =>
  formatUniversalSource({ input, rules, initialState, haltStates, acceptStates, rejectStates }, blank);
const cases = [
  [source("1", "q0,1->H,1,N"), "H/1"],
  [source("1", "q0,1->A,0,N", "q0", "", "A"), "A/"],
  [source("1", "q0,1->J,1,N", "q0", "", "", "J"), "J/1"],
  [source("/", "q0,/->q1,\\,R\nq1,□->H,1,N", "q0", "H", "", "", "□"), "H/\\1"],
  [source("1", "q0,1->left,1,L\nleft,0->right,x,R\nright,1->H,y,N"), "H/xy"],
  [source(",", "q0,\\u002c->H,\\u002c,N"), "H/,"],
  [source("*", "q0,**->H,***,N"), "H/**"],
  [source(" /\\,\n ", "", "H"), "H/ /\\,\n "],
  [source("", "", "H"), "H/"],
  [source("1", "q0,1->结束,1,N", "q0", "结束"), "结束/1"],
  [source("1", "q0,1->OK2,1,N", "q0", "", "OK1|OK2"), "OK2/1"],
  [source("1", "q0,1->拒收,1,N", "q0", "", "", "拒收"), "拒收/1"],
  [source("1", "q0,1->接受,1,N", "q0", "接受"), "接受/1"],
  [source("1", "q0,1->end/done,1,N", "q0", "end/done"), "end\\/done/1"],
  [source("2", "q0,1->H,1,N"), "缺少规则/2"],
] as const;

// Exactly one interpreter handles all these programs. No target transition is
// selected or executed by the host; even its name-to-ID tables are built on tape.
const alphabet = [...new Set(cases.map(([text]) => text).join(""))];
const parsed = parseTransitions(universalRules({ alphabet, blank: "∅", budget: null }));

it.each(cases)("reads the literal main input and writes %s → %s", (text, expected) => {
  expect(parsed.errors).toEqual([]);
  const machine = new TuringMachine({ blankSymbol: "∅", initialState: universalStart, haltStates: [universalHalt], rejectStates: [universalReject], acceptStates: [], transitions: parsed.transitions }, [...text].map((char, index) => [index, char]));
  expect(machine.tape.entries().map(([, char]) => char).join("")).toBe(text);
  for (let step = 0; step < 10_000_000; step++) {
    const result = machine.step();
    if (!result.stopped) continue;
    expect(result.reason, `${machine.currentState}, ${machine.tape.read(machine.headPosition)}`).toBe("halt");
    break;
  }
  expect(machine.currentState).toBe(universalHalt);
  expect(machine.tape.entries().map(([, char]) => char).join("")).toBe(expected);
  expect(readUniversalResult(machine.tape, undefined, text)?.formatted).toBe(expected);
}, 60_000);

it("keeps the exact input text and chooses an outer blank absent from the source", () => {
  const text = source("∅", "q0,∅->H,1,N", "q0", "H", "", "", "□");
  const project = makeUniversalTextProject(text);
  expect(project.input).toBe(text);
  expect(text).not.toContain(project.blankSymbol);
  expect(project.maxSteps).toBeNull();
});
