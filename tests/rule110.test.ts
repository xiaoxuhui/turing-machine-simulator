import { expect, it } from "vitest";
import { compileToRule110, machineToTag, normalizeCompilerMachine, tagToCyclic } from "../src/rule110-compiler";
import { joinWords, packWords, repeatWord, sliceWord, textWord, unpackWords, wordChar, wordPreview } from "../src/rule110-word";
import { rule110Bit, rule110InitialBit, rule110Rows } from "../src/rule110";
import blocks from "../src/rule110-blocks.json";

const project = { input: "", blankSymbol: "_", initialState: "q0", haltStates: "H", acceptStates: "T", rejectStates: "F", rules: "q0,_->H,1,N" };
it("uses exactly the eight Rule 110 neighborhoods", () => {
  expect(Array.from({ length: 8 }, (_, index) => rule110Bit(index >> 2, index >> 1 & 1, index & 1))).toEqual([0, 1, 1, 1, 0, 1, 1, 0]);
});
it("handles astronomically long repeated words with exact slicing and export", () => {
  const count = 10n ** 50n, word = joinWords([textWord("10"), repeatWord(textWord("001"), count), textWord("11")]);
  expect(word.length).toBe(3n * count + 4n);
  expect(wordPreview(sliceWord(word, word.length - 8n), 8)).toBe("00100111");
  expect(wordChar(word, 2n + 3n * (count - 1n) + 2n)).toBe("1");
  const restored = unpackWords(JSON.parse(JSON.stringify(packWords([word]))))[0];
  expect(restored.length).toBe(word.length);
  expect(wordPreview(restored)).toBe(wordPreview(word));
});
it("expands a stay move into write/right and restore/left before halting", () => {
  const machine = normalizeCompilerMachine(project), first = machine.transitions[machine.initial][0]!;
  expect(first.move).toBe("R"); expect(machine.symbols[first.write]).toBe("1");
  const second = machine.transitions[first.state][0]!;
  expect(second.move).toBe("L"); expect(machine.states[second.state]).toBe("H");
  expect(machine.transitions[second.state].every(value => value === null)).toBe(true);
});
it("preserves function entry and finite wildcard semantics", () => {
  const machine = normalizeCompilerMachine({ ...project, input: "01", initialState: "inc", rules: "inc(q0,done):\n    q0,*->done,*,R\ninc" });
  expect(machine.transitions[0].every(rule => rule && rule.move === "R")).toBe(true);
  machine.transitions[0].forEach((rule, index) => expect(rule!.write).toBe(index));
});
it("uses Cook's deletion number, padded alphabet and one-hot cyclic rounds", () => {
  const machine = normalizeCompilerMachine(project), tag = machineToTag(machine), cyclic = tagToCyclic(tag);
  expect(tag.deletion).toBe(machine.symbols.length + 2);
  expect(tag.names.length % 6).toBe(0);
  expect(cyclic.appendants).toHaveLength(tag.deletion * tag.names.length);
  expect(cyclic.appendants.every(word => word.length % 6n === 0n)).toBe(true);
  expect(cyclic.appendants[0].length).toBeGreaterThan(0n);
});
it("compiles the program without running it, including a nonhalting input", () => {
  for (const source of [project, { ...project, rules: "q0,_->q0,_,R" }]) {
    const compiled = compileToRule110(source);
    expect(compiled.left.length > 0n && compiled.center.length > 0n && compiled.right.length > 0n).toBe(true);
    expect(wordPreview(compiled.center)).toMatch(/^[01]+…$/);
    expect(packWords([compiled.left, compiled.center, compiled.right]).nodes.length).toBeLessThan(150000);
  }
});
it("evolves a genuine causal cone without ring boundaries or skipped generations", () => {
  const initial = { left: textWord("0"), center: textWord("1"), right: textWord("0") };
  const rows = [...rule110Rows(initial, -3n, 7, 3)].map(row => [...row].join(""));
  expect(rows).toEqual(["0001000", "0011000", "0111000", "1101000"]);
  expect(rule110InitialBit(initial, -1n)).toBe(0);
});

it("fits every right-hand block seam and obeys Rule 110 across all 30 phases", () => {
  for (const name of "DEFGHIJKL") for (const next of "DEFGHIJKL") for (let phase = 0; phase < 30; phase++) {
    const block = blocks.blocks[name as keyof typeof blocks.blocks], following = blocks.blocks[next as keyof typeof blocks.blocks];
    const nextPhase = block.next[phase];
    const before = block.rows[phase] + following.rows[nextPhase];
    const after = block.rows[(phase + 29) % 30] + following.rows[(nextPhase + 29) % 30];
    const delta = block.upDelta[phase], seam = block.rows[phase].length;
    for (let x = seam - 3; x <= seam + 3; x++) expect(rule110Bit(Number(before[x - 1]), Number(before[x]), Number(before[x + 1])), `${name}/${next}/${phase}/${x}`).toBe(Number(after[x - delta]));
  }
});

it("fits the left-hand periodic seam and both sides of the marked C starting row", () => {
  for (const name of "AB") for (const next of "AB") for (let phase = 0; phase < 3; phase++) {
    const right = blocks.blocks[name as "A" | "B"], left = blocks.blocks[next as "A" | "B"];
    const p = right.next[phase], before = left.rows[p] + right.rows[phase];
    const after = left.rows[(p + 2) % 3] + right.rows[(phase + 2) % 3];
    const seam = left.rows[p].length, delta = left.upDelta[p];
    for (let x = seam - 3; x <= seam + 3; x++) expect(rule110Bit(Number(before[x - 1]), Number(before[x]), Number(before[x + 1]))).toBe(Number(after[x - delta]));
  }
  const before = blocks.blocks.B.rows[blocks.leftPhase] + blocks.center + blocks.blocks.E.rows[blocks.rightPhase];
  const after = blocks.blocks.B.rows[(blocks.leftPhase + 2) % 3] + blocks.centerNext + blocks.blocks.E.rows[(blocks.rightPhase + 29) % 30];
  for (let x = 1; x < before.length - 1; x++) {
    const y = x - blocks.blocks.B.upDelta[blocks.leftPhase];
    if (y >= 0 && y < after.length) expect(rule110Bit(Number(before[x - 1]), Number(before[x]), Number(before[x + 1]))).toBe(Number(after[y]));
  }
});

it("one full cyclic round exactly simulates one tag step, including deleted symbols", () => {
  const tag = machineToTag(normalizeCompilerMachine(project)), cyclic = tagToCyclic(tag);
  let tagTape = tag.tape.flatMap(run => Array(Number(run.count)).fill(run.symbol));
  let bits = wordPreview(cyclic.tape, Number(cyclic.tape.length));
  const encode = (symbols: number[]) => symbols.map(index => "0".repeat(index) + "1" + "0".repeat(tag.names.length - index - 1)).join("");
  for (let step = 0; step < 12 && tagTape.length >= tag.deletion; step++) {
    const appendant = tag.rules[tagTape[0]].flatMap(run => Array(Number(run.count)).fill(run.symbol));
    tagTape = [...tagTape.slice(tag.deletion), ...appendant];
    for (let index = 0; index < cyclic.appendants.length; index++) {
      const first = bits[0]; bits = bits.slice(1);
      if (first === "1") bits += wordPreview(cyclic.appendants[index], Number(cyclic.appendants[index].length));
    }
    expect(bits).toBe(encode(tagTape));
  }
});
