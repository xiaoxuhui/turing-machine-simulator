import { parseTransitions, resolveInitialState, type Tape, type Transition } from "./core";
import type { ExampleProject } from "./examples";
import { protectSymbolAnnotations } from "./symbol-annotations";
import { universalHalt, universalReject, universalRules, universalStart } from "./universal-tape";

export const universalDefault = "q0,/->q1,\\,R/q1,□->HALT,1,N:/,q0,HALT,,";
export const universalMaxBudget = 250;
const metadataPrefix = "# universal ";
const maxPacketLength = 1_200;
let interpreter: string | undefined;

interface Alphabet {
  states: string[];
  symbols: string[];
}

export function splitUniversalSource(source: string): { rules: string; input: string } {
  const { text, restore } = protectSymbolAnnotations(source);
  const pieces: string[] = [];
  let start = 0;
  // Inline separators follow a complete rule: state,read->state,write,direction.
  // Physical newlines are also supported, including a colon on its own line.
  const boundary = /,[ \t]*[LRNlrn*][ \t]*([:/\\])|^[ \t]*(:)|\r?\n/gm;
  for (const match of text.matchAll(boundary)) {
    const separator = match[1] ?? match[2];
    if (!separator) {
      pieces.push(restore(text.slice(start, match.index)));
      start = match.index + match[0].length;
      continue;
    }
    const position = match.index + match[0].length - 1;
    const rule = text.slice(start, position);
    if (match[1] && (!rule.includes("->") || rule.split(",").length !== 4 || rule.trimStart().startsWith("#"))) continue;
    pieces.push(restore(rule));
    if (separator === ":") return { rules: pieces.join("\n"), input: restore(text.slice(position + 1)) };
    start = position + 1;
  }
  throw new Error("请在完整规则后写冒号，冒号右边填写初始输入。行内规则之间用 / 分隔。");
}

function expandWildcards(transitions: Transition[], states: string[], symbols: string[]): Transition[] {
  if (transitions.every(rule => rule.fromState && !rule.fromState.endsWith(".*") && rule.readSymbol)) return transitions;
  const byState = new Map<string, Map<string, Transition>>();
  for (const rule of transitions) {
    if (!byState.has(rule.fromState)) byState.set(rule.fromState, new Map());
    byState.get(rule.fromState)!.set(rule.readSymbol, rule);
  }
  const scopes = [...byState.keys()].filter(state => state.endsWith(".*")).sort((a, b) => b.length - a.length);
  const result: Transition[] = [];
  for (const state of states) for (const symbol of symbols) {
    const match = (name: string) => byState.get(name)?.get(symbol) ?? byState.get(name)?.get("");
    let rule = match(state);
    if (!rule) {
      for (const scope of scopes) {
        if (state.startsWith(scope.slice(0, -1))) rule = match(scope);
        if (rule) break;
      }
    }
    rule ??= match("");
    if (!rule) continue;
    result.push({ ...rule, fromState: state, readSymbol: symbol, writeSymbol: rule.writeSymbol || symbol });
    if (result.length > maxPacketLength / 5) throw new Error("展开通配规则后太长，请减少规则或字符种类。");
  }
  return result;
}

export function makeUniversalProject(
  source: string, blank: string, budget: number,
): { project: ExampleProject; alphabet: Alphabet; inputSymbols: string[]; sourceRules: number; encodedRules: number } {
  if (!Number.isSafeInteger(budget) || budget < 0 || budget > universalMaxBudget) {
    throw new Error("最多模拟步数须为 0 至 " + universalMaxBudget + " 的整数。");
  }
  if ([...blank].length !== 1) throw new Error("被模拟机器的空白符必须是一个字符。");
  if (source.length > 32_000) throw new Error("规则表或输入过长，请先试一个较小的程序。");
  const { rules, input: configuration } = splitUniversalSource(source);
  const fields = configuration.split(",");
  if (fields.length < 5) throw new Error("冒号后请写：初始纸带,初始状态,停止状态,接受状态,拒绝状态。");
  const [initialState, halt, accept, reject] = fields.splice(-4).map(field => field.trim());
  const input = fields.join(",");
  const terminalList = (text: string) => text.split("|").map(name => name.trim()).filter(Boolean);
  const terminals = { haltStates: terminalList(halt), acceptStates: terminalList(accept), rejectStates: terminalList(reject) };
  const parsed = parseTransitions(rules, terminals);
  if (parsed.errors.length) throw new Error(parsed.errors[0]);
  const initial = resolveInitialState(parsed, initialState);
  if (!initial) throw new Error("请填写被模拟机器的初始状态。");
  if (parsed.transitions.length > maxPacketLength / 5) throw new Error("规则表太长，请先试一个较小的程序。");
  const terminalRows = new Map<string, string>();
  for (const [kind, names] of [["A", terminals.acceptStates], ["J", terminals.rejectStates], ["H", terminals.haltStates]] as const) {
    for (const name of names) if (name && !terminalRows.has(name)) terminalRows.set(name, kind);
  }
  const inputSymbols = [...new Set(input)];
  const states = new Set([initial, ...terminalRows.keys()]);
  const symbols = new Set([blank, ...inputSymbols]);
  for (const rule of parsed.transitions) {
    if (rule.fromState && !rule.fromState.endsWith(".*")) states.add(rule.fromState);
    states.add(rule.toState);
    if (rule.readSymbol) symbols.add(rule.readSymbol);
    if (rule.writeSymbol) symbols.add(rule.writeSymbol);
  }
  const alphabet: Alphabet = { states: [...states], symbols: [...symbols] };
  if ([...input].length + budget + states.size + symbols.size > maxPacketLength) throw new Error("输入或名称表太长，请先试一个较小的程序。");
  const transitions = expandWildcards(parsed.transitions, alphabet.states, alphabet.symbols);
  const codebook = (labels: string[]) => new Map(labels.map((label, index) => [label, "1".repeat(index) + "."]));
  const stateCode = codebook(alphabet.states), symbolCode = codebook(alphabet.symbols);
  let packet = "1".repeat(budget) + "|" + stateCode.get(initial) + Array.from(input, symbol => symbolCode.get(symbol)!).join("") + "|";
  for (const [state, kind] of terminalRows) packet += kind + stateCode.get(state);
  for (const rule of transitions) {
    packet += "T" + stateCode.get(rule.fromState) + symbolCode.get(rule.readSymbol) + stateCode.get(rule.toState)
      + symbolCode.get(rule.writeSymbol || rule.readSymbol) + rule.direction;
    if (packet.length > maxPacketLength) throw new Error("编码后的规则表太长，请减少规则、字符或模拟步数。");
  }
  if (packet.length > maxPacketLength) throw new Error("编码后的输入太长，请减少输入字符或模拟步数。");
  const project: ExampleProject = {
    name: "通用图灵机", description: "读取纸带上的编码规则表并逐步模拟另一台图灵机。",
    rules: metadataPrefix + JSON.stringify(alphabet) + "\n" + (interpreter ??= universalRules()),
    input: packet, initialState: universalStart, blankSymbol: "□",
    acceptStates: "", rejectStates: universalReject, haltStates: universalHalt, maxSteps: null,
  };
  return { project, alphabet, inputSymbols, sourceRules: parsed.transitions.length, encodedRules: transitions.length };
}

export function readUniversalAlphabet(rules: string): Alphabet | undefined {
  if (!rules.startsWith(metadataPrefix)) return undefined;
  try {
    const data = JSON.parse(rules.slice(metadataPrefix.length, rules.indexOf("\n")));
    if (Array.isArray(data?.states) && Array.isArray(data?.symbols) && data.states.length && data.symbols.length &&
      [...data.states, ...data.symbols].every(item => typeof item === "string")) return data;
  } catch { /* A custom machine may have edited the metadata. */ }
}

export function readUniversalResult(tape: Tape, alphabet: Alphabet) {
  const packet = tape.entries().map(([, symbol]) => symbol).join("");
  const result = /^([AHJMB])(1*)\.(1*)\.([1.]*)\|(1*)\.\|([1.]*)$/.exec(packet);
  if (!result) return undefined;
  const [, reason, steps, stateCode, left, head, right] = result;
  const state = alphabet.states[stateCode.length];
  const read = alphabet.symbols[head.length];
  const cells = (code: string) => code.split(".").slice(0, -1).map(value => alphabet.symbols[value.length]);
  const symbols = [...cells(left).reverse(), read, ...cells(right)];
  if (state === undefined || symbols.some(value => value === undefined)) return undefined;
  let first = 0, end = symbols.length;
  while (first < end && symbols[first] === alphabet.symbols[0]) first++;
  while (end > first && symbols[end - 1] === alphabet.symbols[0]) end--;
  return { reason, steps: steps.length, state, read, output: symbols.slice(first, end).join("") };
}
