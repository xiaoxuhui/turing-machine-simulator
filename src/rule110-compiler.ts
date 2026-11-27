import { inputToTape, parseTransitions, resolveInitialState, TuringMachine, type MachineDefinition } from "./core";
import type { MachineProjectFields } from "./project-state";
import blocks from "./rule110-blocks.json";
import { joinWords, mapWord, repeatWord, sliceWord, textWord, wordChar, wordCounts, type Word } from "./rule110-word";

export interface CompilerMachine { symbols: string[]; states: string[]; initial: number; input: number[]; transitions: Array<Array<{ state: number; write: number; move: "L" | "R" } | null>> }
export interface TagRun { symbol: number; count: bigint }
export interface CompiledTag { deletion: number; names: string[]; rules: TagRun[][]; tape: TagRun[] }
export interface Compiled110 { left: Word; center: Word; right: Word; stats: { states: number; symbols: number; tagSymbols: number; deletion: number; appendants: number; ctsTape: string; ctsTapeLength: string; ossifierSpacing: string }; source: MachineProjectFields }
const split = (value: string) => value.split(",").map(value => value.trim()).filter(Boolean);

/** Finite transition-table normalization, not execution of the input program. */
export function normalizeCompilerMachine(project: MachineProjectFields): CompilerMachine {
  if ([...project.blankSymbol].length !== 1) throw new Error("空白符必须是一个字符。");
  const options = { haltStates: split(project.haltStates), acceptStates: split(project.acceptStates), rejectStates: split(project.rejectStates) };
  const parsed = parseTransitions(project.rules, options);
  if (parsed.errors.length) throw new Error(parsed.errors.slice(0, 4).join("；"));
  const initialState = resolveInitialState(parsed, project.initialState);
  if (!initialState) throw new Error("请填写初始状态。");
  const tape = project.rules.includes("#(UT.I)")
    ? [...project.input].flatMap((char, index): Array<[number, string]> => char === project.blankSymbol ? [] : [[index, char]])
    : inputToTape(project.input, project.blankSymbol);
  const symbols = [...new Set([project.blankSymbol, ...tape.map(([, symbol]) => symbol), ...parsed.transitions.flatMap(rule => [rule.readSymbol, rule.writeSymbol]).filter(Boolean)])];
  const states = [initialState], ids = new Map([[initialState, 0]]);
  const transitions: CompilerMachine["transitions"] = [];
  const helpers: Array<{ from: number; symbol: number; destination: number }> = [];
  const stateId = (name: string) => {
    let id = ids.get(name);
    if (id === undefined) { id = states.length; ids.set(name, id); states.push(name); }
    return id;
  };
  for (let index = 0; index < states.length; index++) {
    // Added stay-move helper rows are materialized after all original states.
    if (states[index].startsWith("\u0000stay:")) { transitions.push([]); continue; }
    const definition: MachineDefinition = { ...options, transitions: parsed.transitions, blankSymbol: project.blankSymbol, initialState: states[index] };
    const machine = new TuringMachine(definition, []);
    const row: CompilerMachine["transitions"][number] = [];
    for (let symbol = 0; symbol < symbols.length; symbol++) {
      machine.reset(); machine.tape.write(0, symbols[symbol]);
      const step = machine.step();
      if (!step.record) { row.push(null); continue; }
      const destination = stateId(step.record.toState), write = symbols.indexOf(step.record.writeSymbol);
      if (step.record.direction === "N") {
        const helper = stateId(`\u0000stay:${index}:${symbol}`);
        helpers.push({ from: helper, symbol, destination });
        row.push({ state: helper, write, move: "R" });
      } else row.push({ state: destination, write, move: step.record.direction });
    }
    transitions.push(row);
  }
  for (const helper of helpers) transitions[helper.from] = symbols.map((_, symbol) => ({ state: helper.destination, write: symbol, move: "L" }));
  const cells = new Map(tape), last = Math.max(0, tape.at(-1)?.[0] ?? 0);
  return { symbols, states, initial: 0, transitions, input: Array.from({ length: last + 1 }, (_, index) => symbols.indexOf(cells.get(index) ?? project.blankSymbol)) };
}

/** Cook 2009 §1.2, with a one-symbol blank period on each infinite side. */
export function machineToTag(machine: CompilerMachine): CompiledTag {
  const m = machine.states.length, t = machine.symbols.length, s = t + 2;
  const rawSize = 4 * m + 3 * m * s, size = Math.ceil(rawSize / 6) * 6;
  if (size > 50000) throw new Error("标签字母表超过当前浏览器转换预算（50000）。请先缩减不可达规则或输入符号种类。");
  const names = Array.from({ length: size }, (_, index) => `pad${index}`), rules: TagRun[][] = Array.from({ length: size }, () => []);
  const base = (group: number, state: number) => group * m + state;
  const pair = (group: number, state: number, symbol: number) => 4 * m + group * m * s + state * s + symbol;
  const run = (symbol: number, count: number | bigint = 1): TagRun => ({ symbol, count: BigInt(count) });
  for (let state = 0; state < m; state++) {
    for (let group = 0; group < 4; group++) names[base(group, state)] = `${["H", "L", "R", "R*"][group]}[${state}]`;
    for (let group = 0; group < 3; group++) rules[base(group, state)] = Array.from({ length: s }, (_, symbol) => run(pair(group, state, symbol)));
    rules[base(3, state)] = [run(base(2, state), s)];
    for (let symbol = 0; symbol < s; symbol++) {
      for (let group = 0; group < 3; group++) names[pair(group, state, symbol)] = `${["H", "L", "R"][group]}[${state},${symbol + 1}]`;
      if (symbol >= t) {
        rules[pair(0, state, symbol)] = symbol === t
          ? [run(base(0, state), t + 1 + s - 1), run(base(1, state), s)]
          : [run(base(0, state), t + 2 + s - 1)];
        rules[pair(1, state, symbol)] = [run(base(1, state), s)];
        rules[pair(2, state, symbol)] = [run(base(2, state), s)];
        continue;
      }
      const transition = machine.transitions[state][symbol];
      if (!transition) continue;
      const q = transition.state, amount = s * (s - transition.write - 1);
      rules[pair(0, state, symbol)] = transition.move === "L"
        ? [run(base(3, q), amount), run(base(0, q), symbol + 1)]
        : [run(base(0, q), symbol + 1), run(base(1, q), amount)];
      rules[pair(1, state, symbol)] = [run(base(1, q), transition.move === "L" ? 1 : s * s)];
      rules[pair(2, state, symbol)] = [run(base(2, q), transition.move === "R" ? 1 : s * s)];
    }
  }
  let right = 0n;
  for (let index = machine.input.length - 1; index >= 1; index--) right = (right + BigInt(s - machine.input[index] - 1)) * BigInt(s);
  return { deletion: s, names, rules, tape: [run(base(0, machine.initial), s - machine.input[0]), run(base(1, machine.initial), s), run(base(2, machine.initial), right)].filter(run => run.count > 0n) };
}

/** Cook §1.3: one-hot alphabet padded to a multiple of six, with s−1 empty rounds. */
export function tagToCyclic(tag: CompiledTag): { appendants: Word[]; tape: Word } {
  const size = tag.names.length;
  const code = Array.from({ length: size }, (_, index) => joinWords([repeatWord(textWord("0"), index), textWord("1"), repeatWord(textWord("0"), size - index - 1)]));
  const encode = (runs: TagRun[]) => joinWords(runs.map(run => repeatWord(code[run.symbol], run.count)));
  const empty = textWord("");
  return { tape: encode(tag.tape), appendants: [...tag.rules.map(encode), ...Array.from({ length: (tag.deletion - 1) * size }, () => empty)] };
}

type BlockName = keyof typeof blocks.blocks;
function reverseWord(word: Word): Word {
  if (word.kind === "text") return textWord([...word.text].reverse().join(""));
  return word.kind === "repeat" ? repeatWord(reverseWord(word.word), word.count) : joinWords([...word.parts].reverse().map(reverseWord));
}

/** Fit the zig-zag seams. Phase maps were derived from the numerical figures. */
function blockCompiler(leftward: boolean) {
  const cache = new Map<Word, Map<number, { bits: Word; phase: number }>>();
  let work = 0;
  const compile = (word: Word, phase: number): { bits: Word; phase: number } => {
    const saved = cache.get(word)?.get(phase); if (saved) return saved;
    if (++work > 350000) throw new Error("本机转换规模过大，已停止以保留浏览器响应。可先转换规则更少的机器。");
    const incoming = phase;
    let result: { bits: Word; phase: number };
    if (word.kind === "text") {
      const pieces: Word[] = [];
      for (const char of word.text) {
        const block = blocks.blocks[char as BlockName];
        if (!block || (leftward ? !"AB".includes(char) : "AB".includes(char))) throw new Error("位图块方向错误。");
        const row = block.rows[phase];
        pieces.push(textWord(leftward ? [...row].reverse().join("") : row));
        phase = block.next[phase];
      }
      result = { bits: joinWords(pieces), phase };
    } else if (word.kind === "join") {
      const pieces: Word[] = [];
      for (const part of word.parts) { const next = compile(part, phase); pieces.push(next.bits); phase = next.phase; }
      result = { bits: joinWords(pieces), phase };
    } else {
      const seen = new Map<number, number>(), phases: number[] = [], outputs: Word[] = [];
      while (!seen.has(phase) && BigInt(outputs.length) < word.count) {
        seen.set(phase, outputs.length); phases.push(phase);
        const next = compile(word.word, phase); outputs.push(next.bits); phase = next.phase;
      }
      if (BigInt(outputs.length) === word.count) result = { bits: joinWords(outputs), phase };
      else {
        const start = seen.get(phase)!, length = outputs.length - start, remaining = word.count - BigInt(start);
        const tail = Number(remaining % BigInt(length));
        result = { bits: joinWords([joinWords(outputs.slice(0, start)), repeatWord(joinWords(outputs.slice(start)), remaining / BigInt(length)), joinWords(outputs.slice(start, start + tail))]), phase: phases[start + tail] };
      }
    }
    let entries = cache.get(word); if (!entries) { entries = new Map(); cache.set(word, entries); } entries.set(incoming, result); return result;
  };
  return compile;
}

export function cyclicTo110(appendants: Word[], tape: Word): { left: Word; center: Word; right: Word; spacing: bigint } {
  if (!tape.length || !appendants.length || !appendants[0].length) throw new Error("Cook 的 G 块构造要求非空纸带和非空的首个追加项。");
  if (appendants.some(word => word.length % 6n)) throw new Error("每个追加项长度须为 6 的倍数。");
  const data = mapWord(tape, char => textWord(char === "1" ? "FD" : "ED"));
  const centralBlocks = joinWords([sliceWord(data, 0n, data.length - 1n), textWord("G")]);
  const compileRight = blockCompiler(false), central = compileRight(centralBlocks, blocks.rightPhase);
  const center = joinWords([textWord(blocks.center), central.bits]);
  let yes = 0n, no = 0n, empty = 0n, nonempty = 0n;
  const countsCache = new Map<Word, Map<string, bigint>>();
  const program: Word[] = [];
  let emptyRun = 0n;
  for (let index = 0; index < appendants.length; index++) {
    const appendant = appendants[index];
    if (!appendant.length) { empty++; emptyRun++; continue; }
    if (emptyRun) { program.push(repeatWord(textWord("L"), emptyRun)); emptyRun = 0n; }
    nonempty++;
    const counts = wordCounts(appendant, countsCache); yes += counts.get("1") ?? 0n; no += counts.get("0") ?? 0n;
    const body = mapWord(sliceWord(appendant, 1n), char => textWord(char === "1" ? "II" : "IJ"));
    program.push(joinWords([textWord(index ? "KH" : "H"), textWord(wordChar(appendant, 0n) === "1" ? "I" : "J"), body]));
  }
  if (emptyRun) program.push(repeatWord(textWord("L"), emptyRun));
  program.push(textWord("K"));
  const rightBlocks = joinWords(program), spacing = 76n * yes + 80n * no + 60n * nonempty + 43n * empty;
  const periodic = (word: Word, start: number, leftward: boolean) => {
    const compile = leftward ? blockCompiler(true) : compileRight, pieces: Word[] = [];
    let phase = start;
    do { const next = compile(word, phase); pieces.push(next.bits); phase = next.phase; if (pieces.length > 30) throw new Error("周期相位未闭合。"); } while (phase !== start);
    const bits = joinWords(pieces); return leftward ? reverseWord(bits) : bits;
  };
  const leftBlocks = joinWords([textWord("B"), repeatWord(textWord("A"), 12), textWord("B"), repeatWord(textWord("A"), 11), textWord("B"), repeatWord(textWord("A"), 13), textWord("B"), repeatWord(textWord("A"), spacing)]);
  return { left: periodic(leftBlocks, blocks.leftPhase, true), center, right: periodic(rightBlocks, central.phase, false), spacing };
}

export function compileToRule110(project: MachineProjectFields, progress: (text: string) => void = () => {}): Compiled110 {
  progress("展开函数与通配规则，处理原地移动……");
  const machine = normalizeCompilerMachine(project);
  progress(`构造标签系统：${machine.states.length} 个状态、${machine.symbols.length} 个符号……`);
  const tag = machineToTag(machine);
  progress(`构造循环标签系统：${tag.names.length} 个标签……`);
  const cyclic = tagToCyclic(tag);
  progress("拼接规则 110 位图块，计算左右周期与压缩字串……");
  const result = cyclicTo110(cyclic.appendants, cyclic.tape);
  return { left: result.left, center: result.center, right: result.right, source: project, stats: { states: machine.states.length, symbols: machine.symbols.length, tagSymbols: tag.names.length, deletion: tag.deletion, appendants: cyclic.appendants.length, ctsTape: "one-hot", ctsTapeLength: String(cyclic.tape.length), ossifierSpacing: String(result.spacing) } };
}
