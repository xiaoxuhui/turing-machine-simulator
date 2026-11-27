import { parseTransitions, resolveInitialState, type Tape, type Transition } from "./core";
import type { ExampleProject } from "./examples";
import { protectSymbolAnnotations } from "./symbol-annotations";
import { universalHalt, universalReject, universalRules, universalStart } from "./universal-tape";

export const universalDefault = formatUniversalSource({
  input: "/", initialState: "q0", acceptStates: "", rejectStates: "", haltStates: "HALT",
  rules: "q0,/->q1,\\,R\nq1,□->HALT,1,N",
}, "□");
export const universalMaxBudget = 250;
const metadataPrefix = "# universal ";
const maxPacketLength = 1_200;
let interpreter: string | undefined;
const textInterpreters = new Map<string, string>();

interface Alphabet {
  states: string[];
  symbols: string[];
}

export interface UniversalMachineInput {
  rules: string;
  input: string;
  initialState: string;
  haltStates: string;
  acceptStates: string;
  rejectStates: string;
}

/** A slash separates fields/rows; only slash and backslash need escaping. */
export function parseUniversalSource(source: string): UniversalMachineInput & { blankSymbol: string } {
  let marker = "\uE100";
  while (source.includes(marker)) marker += "\uE100";
  const escaped: string[] = [];
  const protectedEscapes = source.replace(/\\([\\/])/g, (_, char: string) => `${marker}${escaped.push(char) - 1}${marker}`);
  const { text, restore } = protectSymbolAnnotations(protectedEscapes);
  const escapePattern = new RegExp(`${marker}(\\d+)${marker}`, "g");
  const fields = text.split("/").map(field => restore(field).replace(escapePattern, (_, index: string) => escaped[Number(index)]));
  if (fields.length < 7) throw new Error("格式：初始输入/空白符/初始状态/接受状态/拒绝状态/普通停机状态/规则第一行/规则第二行/…；留空的状态也要保留分隔斜杠。");
  const [input, blankSymbol, initialState, acceptStates, rejectStates, haltStates, ...rules] = fields;
  return { input, blankSymbol, initialState: initialState.trim(), acceptStates: acceptStates.trim(), rejectStates: rejectStates.trim(), haltStates: haltStates.trim(), rules: rules.join("\n") };
}

export function formatUniversalSource(settings: UniversalMachineInput, blankSymbol: string): string {
  return [settings.input, blankSymbol, settings.initialState, settings.acceptStates, settings.rejectStates, settings.haltStates, ...settings.rules.split(/\r?\n/)]
    .map(field => field.replace(/\\/g, "\\\\").replace(/\//g, "\\/")).join("/");
}

export function isUniversalTextProject(rules: string): boolean { return rules.includes("#(UT.I)"); }
export function hasUniversalTerminalNameOutput(rules: string): boolean { return rules.includes("#(UT.terminal-name)"); }

export function validateUniversalTextSource(source: string): void {
  const settings = parseUniversalSource(source);
  if ([...settings.blankSymbol].length !== 1 || !settings.initialState) throw new Error("请在初始输入中填写一个空白字符和初始状态。");
  const parsed = parseTransitions(settings.rules);
  if (parsed.errors.length) throw new Error(parsed.errors[0]);
  if (parsed.transitions.some(rule => !rule.fromState || !rule.readSymbol || !rule.writeSymbol || rule.fromState.endsWith(".*"))) throw new Error("原文通用机请填写明确的状态、读取和写入；通配规则请先展开。");
  for (const line of settings.rules.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const { text } = protectSymbolAnnotations(line);
    if (!/^\s*[^,]+,[^,]+(?:->|→)[^,]+,[^,]+,[ \t]*[LRNlrn][ \t]*$/.test(text)) throw new Error("原文通用机每行写齐：当前状态,读取->下一状态,写入,L/R/N；函数请先展开。");
  }
}

/** Compile a character alphabet only. Parsing, interning and execution happen on tape. */
export function makeUniversalTextProject(source = "1/0/q0///HALT/q0,1->HALT,1,N", budget: number | null = null): ExampleProject {
  if (budget !== null && (!Number.isSafeInteger(budget) || budget < 0 || budget > universalMaxBudget)) throw new Error("最多模拟步数须为 0 至 " + universalMaxBudget + " 的整数。");
  validateUniversalTextSource(source);
  const alphabet = [...new Set(source)].sort();
  let blank = "∅";
  for (let point = 0x2205; alphabet.includes(blank); point++) blank = String.fromCodePoint(point);
  const signature = JSON.stringify(["terminal-name-v1", alphabet, blank, budget]);
  let rules = textInterpreters.get(signature);
  if (!rules) {
    rules = universalRules({ alphabet, blank, budget });
    if (textInterpreters.size >= 2) textInterpreters.delete(textInterpreters.keys().next().value!);
    textInterpreters.set(signature, rules);
  }
  return {
    category: "基础示例", name: "通用图灵机（原文输入）",
    description: "在上方初始输入填写：初始输入/空白符/初始状态/接受状态/拒绝状态/普通停机状态/规则第一行/规则第二行/…。规则在纸带上解析，最后输出实际终态名称/当前结果，例如 结束/1。",
    input: source, blankSymbol: blank, initialState: universalStart, haltStates: universalHalt, acceptStates: "", rejectStates: universalReject,
    rules, maxSteps: null,
  };
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
  source: string | UniversalMachineInput, blank: string, budget: number | null = null,
): { project: ExampleProject; alphabet: Alphabet; inputSymbols: string[]; sourceRules: number; encodedRules: number } {
  if (budget !== null && (!Number.isSafeInteger(budget) || budget < 0 || budget > universalMaxBudget)) {
    throw new Error("最多模拟步数须为 0 至 " + universalMaxBudget + " 的整数。");
  }
  if ((typeof source === "string" ? source.length : JSON.stringify(source).length) > 32_000) throw new Error("规则表或输入过长，请先试一个较小的程序。");
  let settings: UniversalMachineInput;
  if (typeof source === "string") {
    const parsed = parseUniversalSource(source);
    settings = parsed;
    blank = parsed.blankSymbol;
  } else settings = source;
  if ([...blank].length !== 1) throw new Error("被模拟机器的空白符必须是一个字符。");
  const { rules, input, initialState, haltStates: halt, acceptStates: accept, rejectStates: reject } = settings;
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
  if ([...input].length + (budget ?? 0) + states.size + symbols.size > maxPacketLength) throw new Error("输入或名称表太长，请先试一个较小的程序。");
  const transitions = expandWildcards(parsed.transitions, alphabet.states, alphabet.symbols);
  const codebook = (labels: string[]) => new Map(labels.map((label, index) => [label, "1".repeat(index) + "."]));
  const stateCode = codebook(alphabet.states), symbolCode = codebook(alphabet.symbols);
  let packet = (budget === null ? "∞" : "1".repeat(budget)) + "|" + stateCode.get(initial) + Array.from(input, symbol => symbolCode.get(symbol)!).join("") + "|";
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

export function readUniversalResult(tape: Tape, alphabet?: Alphabet, source?: string) {
  const packet = tape.entries().map(([, symbol]) => symbol).join("");
  let stateName = "";
  for (let i = 0; i < packet.length; i++) {
    const char = packet[i];
    if (char === "\\" && (packet[i + 1] === "/" || packet[i + 1] === "\\")) { stateName += packet[++i]; continue; }
    if (char !== "/") { stateName += char; continue; }
    let reason = ({ 停机: "H", 拒绝: "J", 接受: "A", 缺少规则: "M", 达到步数上限: "B" } as Record<string, string>)[stateName] ?? "";
    if (source) {
      try {
        const config = parseUniversalSource(source);
        for (const [kind, names] of [["A", config.acceptStates], ["J", config.rejectStates], ["H", config.haltStates]]) {
          if (names.split("|").map(name => name.trim()).includes(stateName)) { reason = kind; break; }
        }
      } catch { /* The output remains readable if the editor has since changed. */ }
    }
    return { reason, state: stateName, output: packet.slice(i + 1), formatted: packet };
  }
  if (!alphabet) return undefined;
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
