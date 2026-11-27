import { inputToTape, parseTransitions, resolveInitialState, TuringMachine, type Direction } from "./core";
import { build, type LifeCircuit, type LifeExpression } from "./vendor/life-circuit.js";
import type { LifeMachineInfo, LifePattern, LifeReading } from "./life";
import type { MachineProjectFields } from "./project-state";

const split = (s: string) => s.split(",").map(x => x.trim()).filter(Boolean);
export function machineLifeCircuit(source: MachineProjectFields, left: number, right: number): { circuit: LifeCircuit; machine: Omit<LifeMachineInfo, "period"> } {
  if (!Number.isInteger(left) || !Number.isInteger(right) || left > 0 || right < 0 || right - left + 1 > 64) throw new Error("纸带范围必须包含位置 0，最多 64 格。");
  if ([...source.blankSymbol].length !== 1) throw new Error("空白符必须是一个字符。");
  const terminals = { haltStates: split(source.haltStates), acceptStates: split(source.acceptStates), rejectStates: split(source.rejectStates) };
  const parsed = parseTransitions(source.rules, terminals);
  if (parsed.errors.length) throw new Error(parsed.errors.slice(0, 4).join("；"));
  const initial = resolveInitialState(parsed, source.initialState);
  if (!initial) throw new Error("请填写初始状态。");
  const input = source.rules.includes("#(UT.I)") ? [...source.input].map((c, i) => [i, c] as [number, string]) : inputToTape(source.input, source.blankSymbol);
  if (input.some(([x]) => x < left || x > right)) throw new Error("初始输入超出纸带范围，请扩大左右边界。");
  const symbols = [...new Set([source.blankSymbol, ...input.map(([, symbol]) => symbol), ...parsed.transitions.flatMap(r => [r.readSymbol, r.writeSymbol]).filter(Boolean)])];
  const states = [initial], ids = new Map([[initial, 0]]);
  const rows: Array<Array<{ state: number; write: number; move: Direction } | null>> = [];
  for (let q = 0; q < states.length; q++) {
    if (states.length > 64 || symbols.length > 32) throw new Error("当前转换支持最多 64 个可达状态、32 个符号；请先缩小机器。");
    const tm = new TuringMachine({ ...terminals, blankSymbol: source.blankSymbol, initialState: states[q], transitions: parsed.transitions }, []);
    rows.push(symbols.map(symbol => {
      tm.reset(); tm.tape.write(0, symbol); const transition = tm.step().record;
      if (!transition) return null;
      if (!ids.has(transition.toState)) { ids.set(transition.toState, states.length); states.push(transition.toState); }
      return { state: ids.get(transition.toState)!, write: symbols.indexOf(transition.writeSymbol), move: transition.direction };
    }));
  }
  let id = 0;
  const zero: LifeExpression = { id: id++, value: 0 }, one: LifeExpression = { id: id++, value: 1 }, expressions = new Map<string, LifeExpression>();
  const op = (kind: "AND" | "OR" | "NOT", a: LifeExpression, b?: LifeExpression): LifeExpression => {
    if (kind === "NOT") { if (a.value !== undefined) return a.value ? zero : one; if (a.op === "NOT") return a.args![0]; }
    else {
      if (a === b) return a;
      if (kind === "AND") { if (a === zero || b === zero) return zero; if (a === one) return b!; if (b === one) return a; }
      if (kind === "OR") { if (a === one || b === one) return one; if (a === zero) return b!; if (b === zero) return a; }
      if (a.id > b!.id) [a, b] = [b!, a];
    }
    const key = `${kind}:${a.id}:${b?.id ?? ""}`;
    if (!expressions.has(key)) expressions.set(key, { id: id++, op: kind, args: b ? [a, b] : [a] });
    return expressions.get(key)!;
  };
  const not = (a: LifeExpression) => op("NOT", a), and = (a: LifeExpression, b: LifeExpression) => op("AND", a, b), or = (a: LifeExpression, b: LifeExpression) => op("OR", a, b);
  const any = (items: LifeExpression[]) => items.reduce(or, zero);
  const all = (items: LifeExpression[]) => items.reduce(and, one);
  const select = (condition: LifeExpression, yes: LifeExpression, no: LifeExpression) => yes === no ? yes : or(and(condition, yes), and(not(condition), no));
  const registerList: LifeExpression[] = [], outputs: LifeCircuit["outputs"] = [];
  const register = (name: string, value: number) => { const expression = { id: id++, delayId: `tm-${name}`, defaultValue: value }; registerList.push(expression); return expression; };
  const bits = (count: number) => Math.max(1, Math.ceil(Math.log2(count)));
  const state = Array.from({ length: bits(states.length) }, (_, bit) => register(`q-${bit}`, 0));
  const head = Array.from({ length: right - left + 1 }, (_, i) => register(`h-${i}`, Number(i + left === 0)));
  const initialTape = new Map(input);
  const tape = head.map((_, i) => Array.from({ length: bits(symbols.length) }, (_, bit) => register(`t-${i}-${bit}`, symbols.indexOf(initialTape.get(i + left) ?? source.blankSymbol) >> bit & 1)));
  const fault = register("space", 0);
  const match = (values: LifeExpression[], n: number) => all(values.map((value, bit) => n >> bit & 1 ? value : not(value)));
  const read = tape[0].map((_, bit) => any(head.map((h, i) => and(h, tape[i][bit]))));
  const qMatches = states.map((_, q) => match(state, q)), sMatches = symbols.map((_, s) => match(read, s));
  const transitions = rows.flatMap((row, q) => row.flatMap((r, s) => r ? [{ ...r, condition: and(qMatches[q], sMatches[s]) }] : []));
  const moving = (direction: Direction) => any(transitions.filter(r => r.move === direction).map(r => r.condition));
  const movingL = moving("L"), movingR = moving("R"), staying = moving("N");
  const boundary = or(and(head[0], movingL), and(head.at(-1)!, movingR));
  const enabled = and(and(not(fault), not(boundary)), any(transitions.map(r => r.condition)));
  const next = (register: LifeExpression, expression: LifeExpression) => outputs.push({ label: register.delayId!, delayId: register.delayId, initialValue: register.defaultValue, expression });
  state.forEach((value, bit) => next(value, select(enabled, any(transitions.filter(r => r.state >> bit & 1).map(r => r.condition)), value)));
  const writes = tape[0].map((_, bit) => any(transitions.filter(r => r.write >> bit & 1).map(r => r.condition)));
  tape.forEach((cell, i) => cell.forEach((value, bit) => next(value, select(and(enabled, head[i]), writes[bit], value))));
  head.forEach((value, i) => next(value, select(enabled, any([and(value, staying), and(head[i - 1] ?? zero, movingR), and(head[i + 1] ?? zero, movingL)]), value)));
  next(fault, or(fault, boundary));
  if (expressions.size > 500) throw new Error(`转换需要 ${expressions.size} 个逻辑门，超过当前浏览器的 500 门预算；请减少纸带范围或规则数。`);
  const names = (registers: LifeExpression[]) => registers.map(r => r.delayId!);
  return { circuit: { inputs: [], outputs, registers: registerList }, machine: {
    version: 1, left, right, states, symbols, source: { ...source }, rules: rows.map(row => row.map(Boolean)),
    terminal: states.map(q => terminals.acceptStates.includes(q) ? "accept" : terminals.rejectStates.includes(q) ? "reject" : terminals.haltStates.includes(q) ? "halt" : null),
    registers: { state: names(state), head: names(head), tape: tape.map(names), fault: fault.delayId! }, stats: { gates: expressions.size, registers: registerList.length },
  } };
}
export function compileMachineLife(source: MachineProjectFields, left: number, right: number): LifePattern {
  const { circuit, machine } = machineLifeCircuit(source, left, right), result = build(circuit);
  const ports = result.registerPorts.map(p => ({ id: p.id, label: p.id.slice(3), kind: "output" as const, shape: "lwss" as const, value: 0 as const, x: p.x, y: p.y }));
  return { cells: result.cells, generation: 0, ports, sampling: { start: 0, period: result.period }, machine: { ...machine, period: result.period }, comments: [
    "#C Turing Machine -> synchronous Conway Life circuit; rule B3/S23.",
    `#C Tape interval [${left}, ${right}]; out-of-space is distinct from halt, accept and reject.`,
    `#C Sample register probes every ${result.period} generations, starting at generation 0.`,
    "#C Logic Workshop circuit layout (MIT); gate patterns by Myreen and Carneiro, CC BY 4.0.",
    "#C https://doi.org/10.4230/LIPIcs.ITP.2025.25 ; https://github.com/CakeML/game-of-life/tree/master/gates",
  ] };
}
export function readLifeMachine(info: LifeMachineInfo, reading: LifeReading | null) {
  if (!reading || [...info.registers.state, ...info.registers.head, ...info.registers.tape.flat(), info.registers.fault].some(id => !(id in reading.values))) return null;
  const number = (ids: string[]) => ids.reduce((value, id, bit) => value + reading.values[id] * 2 ** bit, 0);
  const q = number(info.registers.state), head = info.registers.head.findIndex(id => reading.values[id] === 1), tape = info.registers.tape.map(number);
  const valid = q < info.states.length && head >= 0 && info.registers.head.filter(id => reading.values[id]).length === 1 && tape.every(s => s < info.symbols.length);
  const terminal = info.terminal[q];
  const status = !valid ? "信号未对齐" : reading.values[info.registers.fault] ? "空间不足" : terminal ? ({ halt: "停机", accept: "接受", reject: "拒绝" })[terminal] : !info.rules[q][tape[head]] ? "缺少转移规则" : "运行中";
  return { state: info.states[q] ?? "?", head: head + info.left, tape: tape.map(s => info.symbols[s] ?? "?"), status, step: Math.floor(reading.generation / info.period), generation: reading.generation };
}
