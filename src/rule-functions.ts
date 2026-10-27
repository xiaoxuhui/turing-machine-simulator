import type { ParseOptions, ParseResult, Transition } from "./core";

interface SourceRule { rule: Transition; line: number }
interface Call { name: string; line: number }
interface RuleFunction {
  name: string;
  initial: string;
  exit?: string;
  line: number;
  indent: number;
  rules: SourceRule[];
  calls: Call[];
}

const header = /^([^,():\s]+)\(\s*([^,():\s]+)\s*(?:,\s*([^,():\s]+)\s*)?\):$/u;
const identifier = /^[\p{L}_][\p{L}\p{N}_-]*$/u;

/** Expand finite calls into ordinary transitions. Never evaluate tape data. */
export function parseRuleFunctions(
  source: string, options: ParseOptions, parseFlat: (source: string) => ParseResult,
): ParseResult | null {
  const lines = source.split(/\r?\n/);
  // Preserve the existing fast parser, including indentation, for flat files.
  if (!lines.some(raw => {
    const line = raw.trim();
    return !line.startsWith("#") && (header.test(line) || identifier.test(line));
  })) return null;

  const errors: string[] = [];
  const fail = (line: number, message: string) => errors.push(`第 ${line} 行：${message}`);
  const functions = new Map<string, RuleFunction>();
  const rules: SourceRule[] = [];
  const calls: Call[] = [];
  let current: RuleFunction | null = null;
  for (const [index, raw] of lines.entries()) {
    const line = raw.trim(), number = index + 1;
    if (!line || line.startsWith("#")) continue;
    if (raw.includes("\t")) { fail(number, "函数格式请使用空格缩进，不要混入 Tab"); continue; }
    const indent = raw.length - raw.trimStart().length;
    const definition = line.match(header);
    if (definition) {
      if (indent) { fail(number, "函数定义必须顶格，不能嵌套定义"); continue; }
      const [, name, initial, exit] = definition;
      if (!identifier.test(name)) { fail(number, "函数名只能使用字母、汉字、数字、下划线或连字符，且不能以数字开头"); continue; }
      current = { name, initial, exit, line: number, indent: 0, rules: [], calls: [] };
      if (functions.has(name)) fail(number, `函数 ${name} 重复定义`);
      else functions.set(name, current);
      continue;
    }
    if (indent === 0) current = null;
    if (indent && !current) { fail(number, "缩进规则必须放在函数定义下面"); continue; }
    if (current) {
      if (current.indent === 0) current.indent = indent;
      if (indent !== current.indent) { fail(number, "同一函数体的空格缩进必须一致"); continue; }
    }
    if (identifier.test(line)) (current?.calls ?? calls).push({ name: line, line: number });
    else {
      const parsed = parseFlat(line);
      if (parsed.errors.length || parsed.transitions.length !== 1) fail(number, "格式错误；使用转移规则或单独的函数名");
      else (current?.rules ?? rules).push({ rule: parsed.transitions[0], line: number });
    }
  }

  const halt = new Set(options.haltStates ?? ["HALT"]);
  const accept = new Set(options.acceptStates ?? ["ACCEPT"]);
  const reject = new Set(options.rejectStates ?? ["REJECT"]);
  const terminal = new Set([...halt, ...accept, ...reject]);
  if (functions.size && halt.size === 0) fail(1, "函数需要至少一个普通停机态，例如 HALT，作为自动结束点");
  if (calls.length && rules.length) fail(calls[0].line, "顶格调用列表不能与顶格普通转移规则混写");
  const references = new Map<string, Call[]>();
  const checkDuplicates = (items: SourceRule[]) => {
    const keys = new Set<string>();
    for (const { rule, line } of items) {
      const key = JSON.stringify([rule.fromState, rule.readSymbol]);
      if (keys.has(key)) fail(line, "与已有规则重复");
      keys.add(key);
    }
  };
  checkDuplicates(rules);
  for (const { rule, line } of rules) {
    if (functions.has(rule.fromState)) fail(line, "顶格状态不能与函数名重名，请直接调用函数名");
  }
  for (const fn of functions.values()) {
    if (terminal.has(fn.name)) fail(fn.line, "函数名不能与终态相同");
    if (fn.exit === fn.initial) fail(fn.line, "初始状态与退出状态不能相同");
    if (fn.exit && functions.has(fn.exit)) fail(fn.line, "退出状态不能与函数名重名");
    if (fn.exit && (accept.has(fn.exit) || reject.has(fn.exit))) fail(fn.line, "退出状态不能与接受或拒绝状态相同");
    if (!fn.rules.length && !fn.calls.length) fail(fn.line, `函数 ${fn.name} 的函数体不能为空`);
    if (fn.rules.length && fn.calls.length) fail(fn.line, "函数体不能混写转移规则和顺序调用列表");
    const locals = new Set(fn.rules.map(item => item.rule.fromState));
    if (fn.rules.length && !locals.has(fn.initial)) fail(fn.line, `函数 ${fn.name} 的初始状态 ${fn.initial} 没有定义`);
    for (const { rule, line } of fn.rules) {
      if (terminal.has(rule.fromState)) fail(line, "终态不能再定义转移规则");
      if (rule.fromState === fn.exit) fail(line, "退出状态不能再定义转移规则");
      if (functions.has(rule.fromState)) fail(line, "函数内局部状态不能与函数名重名");
    }
    checkDuplicates(fn.rules);
    references.set(fn.name, [...fn.calls, ...fn.rules.filter(({ rule }) => functions.has(rule.toState)).map(({ rule, line }) => ({ name: rule.toState, line }))]);
  }
  for (const call of [...calls, ...[...functions.values()].flatMap(fn => fn.calls)]) {
    if (!functions.has(call.name)) fail(call.line, `未定义函数 ${call.name}`);
  }
  const depths = new Map<string, number>(), visiting = new Set<string>();
  const checkGraph = (name: string, depth: number): number => {
    const fn = functions.get(name);
    if (!fn) return 0;
    if (depth > 64) { fail(fn.line, "函数嵌套深度超过 64"); return 0; }
    if (visiting.has(name)) { fail(fn.line, `不支持递归调用：${name}`); return 0; }
    const cached = depths.get(name);
    if (cached !== undefined) {
      if (depth + cached > 64) fail(fn.line, "函数嵌套深度超过 64");
      return cached;
    }
    visiting.add(name);
    let height = 0;
    for (const call of references.get(name) ?? []) height = Math.max(height, 1 + checkGraph(call.name, depth + 1));
    visiting.delete(name);
    depths.set(name, height);
    return height;
  };
  for (const name of functions.keys()) checkGraph(name, 0);
  if (errors.length) return { transitions: [], errors, hasFunctions: true };

  const states = [...rules, ...[...functions.values()].flatMap(fn => fn.rules)].flatMap(({ rule }) => [rule.fromState, rule.toState]);
  let prefix = "__fn.";
  while ([...states, ...terminal, ...functions.keys()].some(state => state.startsWith(prefix))) prefix = `_${prefix}`;
  const transitions: Transition[] = [];
  const memo = new Map<string, string>();
  let instances = 0;
  const finalState = [...halt][0] ?? "HALT";
  const append = (rule: Transition) => {
    if (transitions.length >= 100_000) throw new Error("函数展开超过 100000 条规则，请减少调用或拆分程序");
    transitions.push(rule);
  };
  const sequence = (items: Call[], continuation: string): string => {
    let entry = continuation;
    for (let index = items.length - 1; index >= 0; index--) entry = compile(items[index].name, entry);
    return entry;
  };
  const compile = (name: string, continuation: string): string => {
    const key = JSON.stringify([name, continuation]);
    const cached = memo.get(key);
    if (cached) return cached;
    const fn = functions.get(name)!;
    if (++instances > 10_000) throw new Error("函数展开超过 10000 个实例，请减少重复调用");
    if (fn.calls.length) {
      const entry = sequence(fn.calls, continuation);
      memo.set(key, entry);
      return entry;
    }
    const scope = `${prefix}${instances}.${name}.`;
    const entry = `${scope}${fn.initial}`;
    memo.set(key, entry);
    for (const { rule } of fn.rules) {
      const exits = fn.exit ? rule.toState === fn.exit : halt.has(rule.toState) && !accept.has(rule.toState) && !reject.has(rule.toState);
      const target = exits ? continuation
        : terminal.has(rule.toState) ? rule.toState
        : functions.has(rule.toState) ? compile(rule.toState, continuation)
        : `${scope}${rule.toState}`;
      append({ ...rule, fromState: `${scope}${rule.fromState}`, toState: target });
    }
    return entry;
  };
  try {
    for (const { rule } of rules) append({ ...rule, toState: functions.has(rule.toState) ? compile(rule.toState, finalState) : rule.toState });
    const initialState = calls.length ? sequence(calls, finalState) : undefined;
    const functionEntries = [...functions.keys()].map(name => ({ name, state: compile(name, finalState) }));
    return { transitions, errors, hasFunctions: true, initialState, functionEntries };
  } catch (error) {
    return { transitions: [], errors: [error instanceof Error ? error.message : "函数展开失败"], hasFunctions: true };
  }
}
