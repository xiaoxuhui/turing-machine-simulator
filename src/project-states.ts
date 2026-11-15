import { resolveInitialState, type ParseResult } from "./core";
import type { MachineProjectFields } from "./project-state";
import { expandImplicitRead } from "./rule-format";
import { protectSymbolAnnotations } from "./symbol-annotations";

type StateProject = Pick<MachineProjectFields, "rules" | "initialState" | "acceptStates" | "rejectStates" | "haltStates">;

const terminalFields = [
  ["acceptStates", "接受"], ["rejectStates", "拒绝"], ["haltStates", "停机"],
] as const;

export function collectProjectStates(project: StateProject, parsed: ParseResult) {
  const states = new Map<string, { value: string; incoming: number; outgoing: number; roles: string[] }>();
  const get = (value: string) => {
    let state = states.get(value);
    if (!state) {
      state = { value, incoming: 0, outgoing: 0, roles: [] };
      states.set(value, state);
    }
    return state;
  };
  const initial = resolveInitialState(parsed, project.initialState);
  if (initial) get(initial).roles.push("初始");
  for (const [field, label] of terminalFields) {
    for (const name of project[field].split(",").map(name => name.trim()).filter(Boolean)) get(name).roles.push(label);
  }
  for (const { fromState, toState } of parsed.transitions) {
    if (fromState && !fromState.endsWith(".*")) get(fromState).outgoing++;
    if (toState) get(toState).incoming++;
  }
  return [...states.values()];
}

export function renameProjectState(project: StateProject, parsed: ParseResult, from: string, to: string): StateProject {
  if (parsed.errors.length) throw new Error("请先修正转移规则。");
  if (from === to) return project;
  if (parsed.hasFunctions) throw new Error("函数程序的状态由源码展开，请在源码里修改状态名。");
  if (!to || /[\s,():=]/.test(to) || to.includes("->") || to.includes("→") || to.startsWith("#") || to === "*" || to.endsWith(".*")) {
    throw new Error("请输入普通状态名，例如 q1 或 扫描。");
  }
  const states = collectProjectStates(project, parsed);
  if (!states.some(state => state.value === from)) throw new Error("找不到要修改的状态。");
  if (states.some(state => state.value === to)) throw new Error("该状态名已存在，请换一个。");
  for (const { fromState } of parsed.transitions) {
    if (!fromState.endsWith(".*")) continue;
    const prefix = fromState.slice(0, -1);
    if (from.startsWith(prefix) !== to.startsWith(prefix)) throw new Error(`改名会改变 ${fromState} 的匹配范围，请保留原有前缀。`);
  }
  const rename = (field: string) => field.trim() === from ? field.replace(from, () => to) : field;
  const rules = project.rules.split(/(\r?\n)/).map(line => {
    if (!line.includes("->") || line.trimStart().startsWith("#")) return line;
    const { text, restore } = protectSymbolAnnotations(line);
    const arrow = text.indexOf("->");
    if (arrow < 0) return line;
    const firstComma = text.indexOf(",");
    const sourceEnd = firstComma >= 0 && firstComma < arrow ? firstComma : arrow;
    if (sourceEnd === arrow && expandImplicitRead(text.trim()) === text.trim()) return line;
    const nextStart = arrow + 2;
    const nextEnd = text.indexOf(",", nextStart);
    const end = nextEnd < 0 ? text.length : nextEnd;
    return restore(rename(text.slice(0, sourceEnd)) + text.slice(sourceEnd, nextStart) +
      rename(text.slice(nextStart, end)) + text.slice(end));
  }).join("");
  const renameList = (list: string) => list.split(",").map(rename).join(",");
  return {
    rules, initialState: rename(project.initialState),
    acceptStates: renameList(project.acceptStates),
    rejectStates: renameList(project.rejectStates),
    haltStates: renameList(project.haltStates),
  };
}
