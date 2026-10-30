import type { ParseOptions, ParseResult, Transition } from "./core";
import { transitionFormatError } from "./rule-error";

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
  bindings: Map<string, string>;
  exports: Map<string, number>;
  returns: Set<string>;
}

const header = /^([^,():\s]+)\(([^()]*)\):$/u;
const identifier = /^[\p{L}_][\p{L}\p{N}_-]*$/u;
const stateName = /^[^,():\s=]+$/u;

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
  const directCalls: Array<{ name: string; line: number; owner?: RuleFunction }> = [];
  let current: RuleFunction | null = null;
  for (const [index, raw] of lines.entries()) {
    const line = raw.trim(), number = index + 1;
    if (!line || line.startsWith("#")) continue;
    if (raw.includes("\t")) { fail(number, "函数格式请使用空格缩进，不要混入 Tab"); continue; }
    const indent = raw.length - raw.trimStart().length;
    const definition = line.match(header);
    if (definition) {
      if (indent) { fail(number, "函数定义必须顶格，不能嵌套定义"); continue; }
      const [, name, parameters] = definition;
      const [initial, exit, ...extras] = parameters.split(",").map(part => part.trim());
      if (!identifier.test(name)) { fail(number, "函数名只能使用字母、汉字、数字、下划线或连字符，且不能以数字开头"); continue; }
      if (!stateName.test(initial) || (exit !== undefined && !stateName.test(exit))) fail(number, "前两个参数必须是初始状态、退出状态，且不能为空");
      const bindings = new Map<string, string>();
      for (const extra of extras) {
        const parts = extra.split("=").map(part => part.trim());
        const [alias, target = alias] = parts;
        if (parts.length > 2 || !identifier.test(alias) || !identifier.test(target)) { fail(number, "子函数参数使用 函数名 或 别名=函数名"); continue; }
        if (bindings.has(alias)) fail(number, `子函数别名 ${alias} 重复`);
        bindings.set(alias, target);
      }
      current = { name, initial, exit, line: number, indent: 0, rules: [], calls: [], bindings, exports: new Map(), returns: new Set() };
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
    const exported = line.match(/^(返回状态|导出状态|ret)(?:\s+|:\s*)(.*)$/u);
    if (exported) {
      if (!current) { fail(number, "返回状态声明必须缩进在函数内"); continue; }
      for (const state of exported[2].split(",").map(item => item.trim())) {
        if (!stateName.test(state)) { fail(number, "返回状态必须是逗号分隔的状态名"); continue; }
        if (exported[1] === "导出状态") {
          if (current.exports.has(state)) fail(number, `状态 ${state} 重复导出`);
          current.exports.set(state, number);
        } else {
          if (current.returns.has(state)) fail(number, `返回状态 ${state} 重复声明`);
          current.returns.add(state);
        }
      }
      continue;
    }
    if (identifier.test(line)) (current?.calls ?? calls).push({ name: line, line: number });
    else {
      const direct = line.match(/^([^,]+),(.+?)\s*->\s*([^,]+)$/);
      const parsed = parseFlat(direct ? `${direct[1]},${direct[2]}->${direct[3]},${direct[2]},N` : line);
      if (parsed.errors.length || parsed.transitions.length !== 1) fail(number, transitionFormatError(line));
      else {
        (current?.rules ?? rules).push({ rule: parsed.transitions[0], line: number });
        if (direct) directCalls.push({ name: parsed.transitions[0].toState, line: number, owner: current ?? undefined });
      }
    }
  }

  const halt = new Set(options.haltStates ?? ["HALT"]);
  const accept = new Set(options.acceptStates ?? ["ACCEPT"]);
  const reject = new Set(options.rejectStates ?? ["REJECT"]);
  const terminal = new Set([...halt, ...accept, ...reject]);
  const callee = (owner: RuleFunction | undefined, name: string) => functions.get(owner?.bindings.get(name) ?? name);
  for (const call of directCalls) {
    if (!callee(call.owner, call.name)) fail(call.line, `简写调用目标 ${call.name} 不是已定义函数；普通转移需要写入符号和移动方向`);
  }
  if (functions.size && halt.size === 0) fail(1, "函数需要至少一个普通停机态，例如 HALT，作为自动结束点");
  const references = new Map<string, Call[]>();
  const firstCallLine = calls[0]?.line ?? Infinity;
  const declarations = rules.filter(item => item.line < firstCallLine);
  const scriptRules = rules.filter(item => item.line > firstCallLine);
  const checkDuplicates = (items: SourceRule[]) => {
    const keys = new Set<string>();
    for (const { rule, line } of items) {
      const key = JSON.stringify([rule.fromState, rule.readSymbol]);
      if (keys.has(key)) fail(line, "与已有规则重复");
      keys.add(key);
    }
  };
  checkDuplicates(declarations);
  for (const { rule, line } of rules) {
    if (functions.has(rule.fromState)) fail(line, "顶格状态不能与函数名重名，请直接调用函数名");
  }
  for (const fn of functions.values()) {
    if (terminal.has(fn.name)) fail(fn.line, "函数名不能与终态相同");
    if (fn.exit === fn.initial) fail(fn.line, "初始状态与退出状态不能相同");
    if (fn.exit && functions.has(fn.exit)) fail(fn.line, "退出状态不能与函数名重名");
    if (fn.exit && (accept.has(fn.exit) || reject.has(fn.exit))) fail(fn.line, "退出状态不能与接受或拒绝状态相同");
    for (const [alias, target] of fn.bindings) {
      if (!functions.has(target)) fail(fn.line, `未定义子函数 ${target}`);
      if (terminal.has(alias) || alias === fn.initial || alias === fn.exit) fail(fn.line, `子函数别名 ${alias} 与状态冲突`);
    }
    if (!fn.rules.length && !fn.calls.length) fail(fn.line, `函数 ${fn.name} 的函数体不能为空`);
    if (fn.rules.length && fn.calls.length) fail(fn.line, "函数体不能混写转移规则和顺序调用列表");
    const locals = new Set(fn.rules.map(item => item.rule.fromState));
    if (fn.rules.length && !locals.has(fn.initial)) fail(fn.line, `函数 ${fn.name} 的初始状态 ${fn.initial} 没有定义`);
    for (const { rule, line } of fn.rules) {
      if (terminal.has(rule.fromState)) fail(line, "终态不能再定义转移规则");
      if (rule.fromState === fn.exit) fail(line, "退出状态不能再定义转移规则");
      if (callee(fn, rule.fromState)) fail(line, "函数内局部状态不能与函数名或子函数别名重名");
    }
    const knownStates = new Set([fn.initial, ...(fn.exit ? [fn.exit] : []), ...fn.rules.flatMap(({ rule }) => [rule.fromState, rule.toState]).filter(state => !callee(fn, state))]);
    for (const { rule } of rules) for (const state of [rule.fromState, rule.toState]) {
      if (state.startsWith(`${fn.name}.`)) knownStates.add(state.slice(fn.name.length + 1));
    }
    for (const [state, line] of fn.exports) {
      if (callee(fn, state)) fail(line, "导出状态不能与子函数名或别名重名");
      if (!knownStates.has(state)) fail(line, `导出状态 ${state} 未在函数内使用`);
      if (fn.calls.length && state !== fn.initial && state !== fn.exit) fail(line, "组合函数只能导出初始状态或退出状态");
    }
    checkDuplicates(fn.rules);
    for (const state of fn.returns) {
      if (!knownStates.has(state)) fail(fn.line, `返回状态 ${state} 未在函数内使用`);
      if (state === fn.initial || locals.has(state)) fail(fn.line, `返回状态 ${state} 不能再定义函数内转移规则`);
      if (callee(fn, state)) fail(fn.line, "返回状态不能与子函数名或别名重名");
    }
    references.set(fn.name, [...fn.calls.map(call => ({ ...call, name: callee(fn, call.name)?.name ?? call.name })), ...fn.rules.filter(({ rule }) => callee(fn, rule.toState)).map(({ rule, line }) => ({ name: callee(fn, rule.toState)!.name, line }))]);
  }
  for (const call of calls) {
    if (!functions.has(call.name)) fail(call.line, `未定义函数 ${call.name}`);
  }
  for (const fn of functions.values()) for (const call of fn.calls) {
    if (!callee(fn, call.name)) fail(call.line, `未定义函数 ${call.name}`);
  }
  const publicRef = (state: string, owner?: RuleFunction, line?: number) => {
    const dot = state.indexOf(".");
    if (dot < 0) return null;
    const fn = callee(owner, state.slice(0, dot));
    if (!fn) return null;
    const local = state.slice(dot + 1);
    if (!fn.exports.has(local)) {
      if (line !== undefined) fail(line, `状态 ${fn.name}.${local} 未导出，请在函数内声明 导出状态 ${local}`);
      return null;
    }
    return { fn, local, alias: `${fn.name}.${local}` };
  };
  const extensions = new Map<string, Array<{ local: string; source: SourceRule }>>();
  for (const item of declarations) {
    const from = publicRef(item.rule.fromState, undefined, item.line);
    publicRef(item.rule.toState, from?.fn, item.line);
    if (from) {
      const list = extensions.get(from.fn.name) ?? [];
      list.push({ local: from.local, source: item });
      extensions.set(from.fn.name, list);
      const called = callee(from.fn, item.rule.toState);
      if (called) references.get(from.fn.name)!.push({ name: called.name, line: item.line });
    }
  }
  for (const { rule, line } of scriptRules) {
    publicRef(rule.fromState, undefined, line);
    publicRef(rule.toState, undefined, line);
  }
  type Statement = { kind: "call"; call: Call } | { kind: "rules"; state: string; rules: SourceRule[] };
  const statements: Statement[] = [];
  const events = [...calls.map(call => ({ line: call.line, call })), ...scriptRules.map(source => ({ line: source.line, source }))].sort((a, b) => a.line - b.line);
  for (const event of events) {
    if ("call" in event) statements.push({ kind: "call", call: event.call });
    else {
      const previous = statements.at(-1);
      if (previous?.kind === "rules" && previous.state === event.source.rule.fromState && !previous.rules.some(item => item.rule.readSymbol === event.source.rule.readSymbol)) previous.rules.push(event.source);
      else statements.push({ kind: "rules", state: event.source.rule.fromState, rules: [event.source] });
    }
  }
  for (const statement of statements) if (statement.kind === "rules") checkDuplicates(statement.rules);
  for (const fn of functions.values()) {
    publicRef(fn.initial, fn, fn.line);
    if (fn.exit) publicRef(fn.exit, fn, fn.line);
    for (const { rule, line } of fn.rules) {
      publicRef(rule.fromState, fn, line);
      publicRef(rule.toState, fn, line);
    }
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
  const publicNames = [...functions.values()].flatMap(fn => [...fn.exports.keys()].map(state => `${fn.name}.${state}`));
  while ([...states, ...terminal, ...functions.keys(), ...publicNames].some(state => state.startsWith(prefix))) prefix = `_${prefix}`;
  const transitions: Transition[] = [];
  const origins: number[] = [];
  interface Context { fn: RuleFunction; continuation: string; entry: string; scope?: string; returns: Map<string, string> }
  const contexts = new Map<string, Context>();
  let instances = 0;
  const finalState = [...halt][0] ?? "HALT";
  const globalStates = new Set(declarations.map(({ rule }) => rule.fromState));
  for (const [name, items] of extensions) {
    const fn = functions.get(name)!;
    if (fn.exit && items.some(item => item.local === fn.exit)) globalStates.add(fn.exit);
  }
  const defaultReturn = (_name: string) => finalState;
  const scriptEntries = new Map<number, string>();
  for (const [index, statement] of statements.entries()) {
    if (statement.kind === "rules") scriptEntries.set(index, `${prefix}script.${index}.${statement.state}`);
  }
  const outerReturn = (fn: RuleFunction, state: string): string => {
    if (globalStates.has(state) || terminal.has(state)) return state;
    const index = statements.findIndex(statement => statement.kind === "rules" && (statement.state === state || statement.state === `${fn.name}.${state}`));
    return index < 0 ? state : scriptEntries.get(index)!;
  };
  const append = (rule: Transition, line: number) => {
    if (transitions.length >= 100_000) throw new Error("函数展开超过 100000 条规则，请减少调用或拆分程序");
    transitions.push(rule);
    origins.push(line);
  };
  const sequence = (items: Call[], continuation: string, owner?: RuleFunction, parent?: Context): string => {
    let entry = continuation;
    for (let index = items.length - 1; index >= 0; index--) entry = compile(callee(owner, items[index].name)!.name, entry, parent);
    return entry;
  };
  const exits = (fn: RuleFunction, state: string) => fn.exit ? state === fn.exit : halt.has(state) && !accept.has(state) && !reject.has(state);
  const localState = (ctx: Context, state: string): string => {
    if (ctx.fn.returns.has(state)) return ctx.returns.get(state)!;
    if (state === ctx.fn.initial && !ctx.scope) return ctx.entry;
    if (exits(ctx.fn, state)) return ctx.continuation;
    if (terminal.has(state)) return state;
    return publicRef(state, ctx.fn)?.alias ?? `${ctx.scope}${state}`;
  };
  const callFrom = (ctx: Context, called: RuleFunction, line: number): string => {
    const currentState = ctx.fn.rules.find(item => item.line === line)?.rule.fromState;
    const next = ctx.fn.rules.find(item => item.line > line && item.rule.fromState !== currentState);
    return compile(called.name, next ? localState(ctx, next.rule.fromState) : ctx.continuation, ctx);
  };
  const compile = (name: string, continuation: string, parent?: Context): string => {
    const fn = functions.get(name)!;
    const returns = new Map([...fn.returns].map(state => {
      const known = parent && (state === parent.fn.exit || parent.fn.rules.some(item => item.rule.fromState === state));
      return [state, known ? localState(parent!, state) : outerReturn(fn, state)] as const;
    }));
    const key = JSON.stringify([name, continuation, [...returns]]);
    const cached = contexts.get(key);
    if (cached) return cached.entry;
    if (++instances > 10_000) throw new Error("函数展开超过 10000 个实例，请减少重复调用");
    if (fn.calls.length) {
      const ctx: Context = { fn, continuation, entry: "", returns };
      const end = fn.exit && returns.has(fn.exit) ? returns.get(fn.exit)! : continuation;
      const entry = sequence(fn.calls, end, fn, ctx);
      ctx.entry = entry;
      contexts.set(key, ctx);
      return entry;
    }
    const scope = `${prefix}${instances}.${name}.`;
    const entry = publicRef(fn.initial, fn)?.alias ?? `${scope}${fn.initial}`;
    const ctx = { fn, continuation, entry, scope, returns };
    contexts.set(key, ctx);
    for (const { rule, line } of fn.rules) {
      const called = callee(fn, rule.toState);
      const target = fn.returns.has(rule.toState) ? returns.get(rule.toState)!
        : exits(fn, rule.toState) ? continuation
        : terminal.has(rule.toState) ? rule.toState
        : called ? callFrom(ctx, called, line)
        : localState(ctx, rule.toState);
      append({ ...rule, fromState: localState(ctx, rule.fromState), toState: target }, line);
    }
    return entry;
  };
  const scriptEntry = (index: number, state: string | undefined, fallback: string): string => {
    // Scan forward through source statements; a return never restarts an earlier block.
    while (index < statements.length) {
      const statement = statements[index];
      if (statement.kind === "call") return scriptEntries.get(index)!;
      const ref = publicRef(statement.state);
      const matches = !state || statement.state === state || (ref?.local === ref?.fn.exit && state === ref?.local);
      if (!matches) { index++; continue; }
      return scriptEntries.get(index)!;
    }
    return fallback;
  };
  const afterCall = (index: number, _fn: RuleFunction): string => {
    return scriptEntry(index, undefined, finalState);
  };
  const forwardCall = (index: number, name: string): string | undefined => {
    for (let position = index; position < statements.length; position++) {
      const item = statements[position];
      if (item.kind === "call" && item.call.name === name) return scriptEntries.get(position);
    }
    return undefined;
  };
  const scriptTarget = (index: number, state: string): string => {
    if (globalStates.has(state)) return state;
    let target = statements.findIndex((item, position) => position >= index && item.kind === "rules" && item.state === state);
    if (target < 0) target = statements.findIndex(item => item.kind === "rules" && item.state === state);
    return target < 0 ? scriptEntry(index, state, state) : scriptEntries.get(target)!;
  };
  const compileScript = (): string => {
    // Build continuations backwards so long straight-line scripts do not recurse in JS.
    for (let index = statements.length - 1; index >= 0; index--) {
      const statement = statements[index];
      if (statement.kind === "call") {
        const fn = functions.get(statement.call.name)!;
        scriptEntries.set(index, compile(fn.name, afterCall(index + 1, fn)));
        continue;
      }
      const entry = `${prefix}script.${index}.${statement.state}`;
      scriptEntries.set(index, entry);
      for (const { rule, line } of statement.rules) {
        const called = functions.get(rule.toState);
        const target = terminal.has(rule.toState) ? rule.toState
          : called ? forwardCall(index + 1, called.name) ?? compile(called.name, afterCall(index + 1, called))
          : scriptTarget(index + 1, rule.toState);
        append({ ...rule, fromState: entry, toState: target }, line);
      }
    }
    return scriptEntry(0, undefined, finalState);
  };
  try {
    const initialState = calls.length ? compileScript() : undefined;
    for (const { rule, line } of declarations) {
      if (publicRef(rule.fromState)) continue;
      const next = declarations.find(item => item.line > line && item.rule.fromState !== rule.fromState && !publicRef(item.rule.fromState));
      append({ ...rule, toState: functions.has(rule.toState) ? forwardCall(0, rule.toState) ?? compile(rule.toState, next?.rule.fromState ?? initialState ?? finalState) : rule.toState }, line);
    }
    const functionEntries = [...functions.keys()].map(name => ({ name, state: compile(name, finalState) }));
    // Extend each isolated invocation, not just one copy of an exported state.
    for (const ctx of contexts.values()) for (const { local, source } of extensions.get(ctx.fn.name) ?? []) {
      const { rule, line } = source;
      if ((!ctx.scope || exits(ctx.fn, local) || terminal.has(local)) && ctx.continuation !== defaultReturn(ctx.fn.name)) continue;
      const called = callee(ctx.fn, rule.toState);
      const targetRef = publicRef(rule.toState, ctx.fn);
      const target = ctx.fn.returns.has(rule.toState) ? ctx.returns.get(rule.toState)!
        : exits(ctx.fn, rule.toState) ? ctx.continuation
        : terminal.has(rule.toState) ? rule.toState
        : called ? callFrom(ctx, called, line)
        : targetRef?.fn.name === ctx.fn.name ? localState(ctx, targetRef.local)
        : targetRef?.alias ?? rule.toState;
      append({ ...rule, fromState: localState(ctx, local), toState: target }, line);
    }
    const aliases = new Map<string, string>();
    for (const fn of functions.values()) {
      const ctx = [...contexts.values()].find(item => item.fn === fn && item.continuation === finalState)!;
      for (const local of fn.exports.keys()) aliases.set(`${fn.name}.${local}`, local === fn.initial ? ctx.entry : localState(ctx, local));
    }
    for (const [index, statement] of statements.entries()) {
      if (statement.kind === "rules" && !globalStates.has(statement.state) && !terminal.has(statement.state) && !publicRef(statement.state) && !aliases.has(statement.state)) {
        aliases.set(statement.state, scriptEntries.get(index)!);
      }
    }
    const resolved = new Map<string, string>();
    const resolve = (state: string): string => {
      const path: string[] = [], visiting = new Set<string>();
      while (aliases.has(state)) {
        if (resolved.has(state)) { state = resolved.get(state)!; break; }
        if (visiting.has(state)) throw new Error("导出状态存在循环别名，无法确定实际状态");
        visiting.add(state);
        path.push(state);
        state = aliases.get(state)!;
      }
      for (const alias of path) resolved.set(alias, state);
      return state;
    };
    const keys = new Set<string>();
    const expanded = transitions.map((rule, index) => {
      const fromState = resolve(rule.fromState), toState = resolve(rule.toState);
      if (terminal.has(fromState)) throw new Error(`第 ${origins[index]} 行：不能为全局终态定义导出转移规则`);
      const key = JSON.stringify([fromState, rule.readSymbol]);
      if (keys.has(key)) throw new Error(`第 ${origins[index]} 行：导出状态合并后与已有规则重复，不能覆盖同名转移`);
      keys.add(key);
      return { ...rule, fromState, toState };
    });
    const stateExports = publicNames.map(name => ({ name, state: resolve(name) }));
    const sourceEntries: Array<{ name: string; state: string }> = [];
    for (const [index, statement] of statements.entries()) {
      const name = statement.kind === "call" ? statement.call.name : statement.state;
      if (!globalStates.has(name) && !sourceEntries.some(item => item.name === name)) sourceEntries.push({ name, state: resolve(scriptEntries.get(index)!) });
    }
    const internalNames: NonNullable<ParseResult["internalNames"]> = [];
    const seenNames = new Set<string>();
    const recordName = (source: string, actual: string, context: string) => {
      const item = { source, actual: resolve(actual), context };
      const key = JSON.stringify(item);
      if (!seenNames.has(key)) { seenNames.add(key); internalNames.push(item); }
    };
    for (const ctx of contexts.values()) {
      recordName(ctx.fn.name, ctx.entry, `实例入口 ${resolve(ctx.entry)}`);
      const locals = new Set([ctx.fn.initial, ...(ctx.fn.exit ? [ctx.fn.exit] : []), ...ctx.fn.exports.keys(), ...ctx.fn.returns, ...ctx.fn.rules.flatMap(({ rule }) => [rule.fromState, rule.toState])]);
      for (const state of locals) if (!callee(ctx.fn, state)) recordName(`${ctx.fn.name}.${state}`, localState(ctx, state), `实例入口 ${resolve(ctx.entry)}`);
    }
    for (const [index, statement] of statements.entries()) {
      const source = statement.kind === "call" ? statement.call.name : statement.state;
      const line = statement.kind === "call" ? statement.call.line : statement.rules[0].line;
      recordName(source, scriptEntries.get(index)!, `源码第 ${line} 行`);
    }
    for (const { rule, line } of declarations) recordName(rule.fromState, rule.fromState, `源码第 ${line} 行`);
    return { transitions: expanded, errors, hasFunctions: true, initialState: initialState ? resolve(initialState) : undefined, functionEntries: functionEntries.map(fn => ({ ...fn, state: resolve(fn.state) })), stateExports, sourceEntries, internalNames };
  } catch (error) {
    return { transitions: [], errors: [error instanceof Error ? error.message : "函数展开失败"], hasFunctions: true };
  }
}
