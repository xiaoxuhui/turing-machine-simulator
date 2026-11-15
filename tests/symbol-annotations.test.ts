import { expect, it } from "vitest";
import { inputToTape, parseTransitions, resolveInitialState, TuringMachine } from "../src/core";
import { collectProjectSymbols, renameProjectSymbol } from "../src/project-symbols";
import { compactRuleArrows, decodeRuleSymbol, encodeRuleSymbol, formatTransition } from "../src/rule-format";
import { visibleTapeSymbol } from "../src/symbol-annotations";

it("matches hidden tags exactly while displaying only characters outside the tag", () => {
  const source = "q,1#(a, b -> (c)) -> HALT,2#(done),N\nq,1#(b)->HALT,3,N\nq,1->HALT,4,N";
  const compact = compactRuleArrows(source);
  expect(compact).toContain("q,1#(a, b -> (c))->HALT");
  const parsed = parseTransitions(compact);
  expect(parsed.errors).toEqual([]);
  expect(parseTransitions(parsed.transitions.map(formatTransition).join("\n")).transitions).toEqual(parsed.transitions);
  for (const [input, output] of [["1#(a, b -> (c))", "2#(done)"], ["1#(b)", "3"], ["1", "4"]]) {
    const tape = inputToTape(input + "0", "□");
    expect(tape).toEqual([[0, input], [1, "0"]]);
    expect(visibleTapeSymbol(input)).toBe("1");
    const machine = new TuringMachine({
      initialState: "q", blankSymbol: "□", haltStates: ["HALT"], acceptStates: [], rejectStates: [],
      transitions: parsed.transitions,
    }, tape);
    expect(machine.step().reason).toBe("halt");
    expect(machine.tape.read(0)).toBe(output);
  }
  expect(visibleTapeSymbol("left#(hidden)right")).toBe("leftright");
});

it("keeps the literal hash, minus and slashes available through either escape prefix", () => {
  for (const [source, actual] of [["/#", "#"], ["\\#", "#"], ["/-", "-"], ["\\-", "-"], ["//", "/"], ["\\\\", "\\"], ["/\\", "\\"], ["\\/", "/"], ["///", "//"]]) {
    expect(decodeRuleSymbol(source)).toBe(actual);
    expect(decodeRuleSymbol(encodeRuleSymbol(actual))).toBe(actual);
  }
  expect(decodeRuleSymbol("/#(literal)")).toBe(decodeRuleSymbol("\\#(literal)"));
  expect(visibleTapeSymbol(decodeRuleSymbol("/#(literal)"))).toBe("#(literal)");
  expect(inputToTape("/#(literal)", "□")).toEqual([[0, decodeRuleSymbol("\\#(literal)")]]);
});

it("keeps annotated symbols in functions and lets the symbol table rename their tags", () => {
  const project = {
    rules: "f(q,done,1#(a,b),符号):\n    q,1#(a,b)->done,1#(b),N\nf",
    input: "1#(a,b)", blankSymbol: "□",
  };
  const parsed = parseTransitions(project.rules);
  expect(parsed.errors).toEqual([]);
  const symbols = collectProjectSymbols(project, parsed);
  expect(symbols.find(symbol => symbol.value === "1#(a,b)")).toMatchObject({ input: true, parameter: true });
  const renamed = renameProjectSymbol(project, parsed, "1#(a,b)", "1#(c -> d)");
  const result = parseTransitions(renamed.rules);
  expect(result.errors).toEqual([]);
  expect(renamed.rules).toContain("f(q,done,1#(c -> d),符号):");
  expect(renamed.input).toBe("1#(c -> d)");
  expect(result.transitions.find(rule => rule.fromState === resolveInitialState(result, ""))?.readSymbol).toBe(renamed.input);
});
