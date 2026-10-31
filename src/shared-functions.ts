import { parseTransitions, resolveInitialState, type Transition } from "./core";
import { exampleSource } from "./example-source";
import type { ExampleProject } from "./examples";

/** Extract repeated one-entry, one-exit scanning blocks with independent continuations. */
export function extractSharedFunctions(project: ExampleProject): ExampleProject {
  const list = (value: string) => value.split(",").filter(Boolean);
  const parsed = parseTransitions(project.rules, { haltStates: list(project.haltStates), acceptStates: list(project.acceptStates), rejectStates: list(project.rejectStates) });
  if (parsed.errors.length) throw new Error(parsed.errors[0]);
  if (parsed.hasFunctions) return project;
  const blocks = new Map<string, Transition[]>();
  for (const rule of parsed.transitions) {
    const block = blocks.get(rule.fromState) ?? [];
    block.push(rule); blocks.set(rule.fromState, block);
  }
  const groups = new Map<string, Array<{ state: string; rules: Transition[]; next: string }>>();
  for (const [state, rules] of blocks) {
    const exits = new Set(rules.filter(rule => rule.toState !== state).map(rule => rule.toState));
    if (rules.length < 2 || exits.size !== 1) continue;
    const signature = JSON.stringify([...rules].sort((a, b) => a.readSymbol.localeCompare(b.readSymbol)).map(rule => [rule.readSymbol, rule.writeSymbol, rule.direction, rule.toState === state ? "self" : "exit"]));
    const group = groups.get(signature) ?? [];
    group.push({ state, rules, next: [...exits][0] }); groups.set(signature, group);
  }
  const reusable = [...groups.values()].filter(group => group.length > 1);
  if (!reusable.length) return { ...project, description: project.description + " 本例没有可安全提取的重复规则块，保留普通规则。" };
  const used = new Set(parsed.transitions.flatMap(rule => [rule.fromState, rule.toState]));
  const definitions: string[] = [], calls = new Map<string, string>();
  let removed = 0;
  reusable.forEach((group, index) => {
    const first = group[0], loops = first.rules.filter(rule => rule.toState === first.state);
    const direction = loops.length && loops.every(rule => rule.direction === "R") ? "公共右扫" : loops.length && loops.every(rule => rule.direction === "L") ? "公共左扫" : "公共规则";
    let name = `${direction}${index + 1}`;
    while (used.has(name)) name += "_";
    used.add(name);
    const body = first.rules.map(rule => `    0,${rule.readSymbol}->${rule.toState === first.state ? "0" : "1"},${rule.writeSymbol},${rule.direction}`).join("\n");
    definitions.push(`# 此规则块定义一次，被 ${group.length} 个入口复用；每处完成后进入各自的续接状态。\n${name}(0,1):\n${body}`);
    for (const item of group) calls.set(item.state, `${item.state}: ${name} -> ${item.next}`);
    removed += (group.length - 1) * first.rules.length;
  });
  const comments = new Map<string, string[]>();
  let pending: string[] = [];
  for (const line of exampleSource(project, "commented", false).split("\n")) {
    const state = line.trim().match(/^([^,]+),/)?.[1];
    if (!state) { pending.push(line); continue; }
    comments.set(state, [...(comments.get(state) ?? []), ...pending]);
    pending = [];
  }
  const flow: string[] = [];
  for (const [state, rules] of blocks) {
    flow.push(...(comments.get(state) ?? []));
    if (calls.has(state)) flow.push(calls.get(state)!);
    else for (const rule of rules) flow.push(`${rule.fromState},${rule.readSymbol}->${rule.toState},${rule.writeSymbol},${rule.direction}`);
  }
  let fallback = "自动结束";
  while (used.has(fallback)) fallback += "_";
  return {
    ...project, initialState: resolveInitialState(parsed, project.initialState), haltStates: project.haltStates || fallback,
    rules: definitions.join("\n\n") + "\n\n" + flow.join("\n"),
    description: `${project.description} 提取 ${reusable.length} 个公共函数供 ${calls.size} 个入口复用，减少 ${removed} 条重复源码规则；入口:函数->续接状态 不增加计算步。`,
  };
}
