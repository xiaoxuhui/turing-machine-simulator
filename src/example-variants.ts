import { parseTransitions, resolveInitialState } from "./core";
import { exampleSource } from "./example-source";
import type { ExampleProject } from "./examples";
import { extractSharedFunctions } from "./shared-functions";

export type ExampleNames = "descriptive" | "numeric";
export type ExampleStructure = "original" | "flat" | "functions";
const split = (value: string) => value.split(",").map(item => item.trim()).filter(Boolean);

function numericStates(project: ExampleProject): ExampleProject {
  const terminal = new Set([...split(project.haltStates), ...split(project.acceptStates), ...split(project.rejectStates)]);
  const functions = new Map<string, Set<string>>();
  const source = exampleSource(project, "commented", false);
  const header = /^([^,():\s]+)\(([^()]*)\):$/u;
  for (const line of source.split("\n")) {
    const match = line.trim().match(header);
    if (!match) continue;
    functions.set(match[1], new Set(match[2].split(",").slice(2).map(value => value.trim().split("=")[0])));
  }
  const names = new Map<string, string>();
  let next = 0;
  const local = (state: string): string => {
    if (terminal.has(state)) return state;
    if (!names.has(state)) {
      while (terminal.has(String(next))) next++;
      names.set(state, String(next++));
    }
    return names.get(state)!;
  };
  const rename = (state: string, owner?: string): string => {
    state = state.trim();
    if (terminal.has(state) || functions.has(state) || (owner && functions.get(owner)?.has(state))) return state;
    const dot = state.indexOf(".");
    if (dot >= 0 && (functions.has(state.slice(0, dot)) || (owner && functions.get(owner)?.has(state.slice(0, dot))))) return state.slice(0, dot + 1) + local(state.slice(dot + 1));
    return local(state);
  };
  let owner: string | undefined;
  const lines = source.split("\n").map(line => {
    const text = line.trim();
    if (!text || text.startsWith("#")) return line;
    const indent = line.slice(0, line.length - line.trimStart().length);
    const definition = text.match(header);
    if (definition) {
      owner = definition[1];
      const params = definition[2].split(",").map(value => value.trim());
      return `${owner}(${params.map((value, index) => index < 2 ? rename(value, owner) : value).join(",")}):`;
    }
    if (!indent) owner = undefined;
    const named = text.match(/^([^,():\s]+)\s*:\s*([^,():\s]+)\s*->\s*([^,():\s]+)$/u);
    if (named) return `${rename(named[1])}: ${named[2]} -> ${rename(named[3])}`;
    const exported = text.match(/^(ret|返回状态|导出状态)(?:\s+|:\s*)(.*)$/u);
    if (exported) return indent + exported[1] + " " + exported[2].split(",").map(value => rename(value, owner)).join(",");
    const rule = text.match(/^([^,]+),(.+?)->([^,]+)(?:,(.+?),([LRNlrn]))?$/);
    if (!rule) return line;
    const [, from, read, to, write, direction] = rule;
    return `${indent}${rename(from, owner)},${read}->${rename(to, owner)}${direction ? `,${write},${direction}` : ""}`;
  });
  const initialState = project.initialState ? rename(project.initialState) : "";
  const mapping = [...names].slice(0, 40).map(([from, to]) => `# 状态 ${from} → ${to}`);
  return { ...project, initialState, rules: [...mapping, ...lines].join("\n") };
}

export function exampleVariant(project: ExampleProject, names: ExampleNames, structure: ExampleStructure): ExampleProject {
  let variant = project;
  if (structure === "functions") variant = extractSharedFunctions(project);
  if (structure === "flat") {
    const parsed = parseTransitions(project.rules, { haltStates: split(project.haltStates), acceptStates: split(project.acceptStates), rejectStates: split(project.rejectStates) });
    if (parsed.errors.length) throw new Error(parsed.errors[0]);
    const initialState = resolveInitialState(parsed, project.initialState);
    const rules = parsed.hasFunctions
      ? parsed.transitions.map(rule => `${rule.fromState},${rule.readSymbol}->${rule.toState},${rule.writeSymbol},${rule.direction}`).join("\n")
      : exampleSource(project, "commented", false);
    variant = { ...project, initialState, rules };
  }
  if (names === "numeric") variant = numericStates(variant);
  return variant;
}
