import { parseTransitions, resolveInitialState } from "./core";
import { exampleSource } from "./example-source";
import type { ExampleProject } from "./examples";
import { extractSharedFunctions } from "./shared-functions";
import { functionParameterType, parseFunctionParameters } from "./function-parameters";

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
    const parameters = parseFunctionParameters(match[2].split(",").slice(2)).parameters;
    functions.set(match[1], new Set(parameters.filter(item => item.type !== "symbol").map(item => item.alias)));
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
      const converted = params.slice(0, 2).map(value => rename(value, owner));
      for (let index = 2; index < params.length; index++) {
        const field = params[index], typeName = params[index + 1];
        const type = functionParameterType(typeName ?? "");
        const [parameter] = parseFunctionParameters(type ? [field, typeName] : [field]).parameters;
        if (parameter && (parameter.type === "state" || (parameter.type === "auto" && !functions.has(parameter.value)))) converted.push(`${parameter.alias}=${rename(parameter.value)}`);
        else converted.push(field);
        if (type) { converted.push(typeName); index++; }
      }
      return `${owner}(${converted.join(",")}):`;
    }
    if (!indent) owner = undefined;
    const named = text.match(/^([^,():\s]+)\s*:\s*([^,():\s]+)\s*->\s*([^,():\s]+)$/u);
    if (named) return `${rename(named[1])}: ${named[2]} -> ${rename(named[3])}`;
    const exported = text.match(/^(ret|返回状态|导出状态)(?:\s+|:\s*)(.*)$/u);
    if (exported) return indent + exported[1] + " " + exported[2].split(",").map(value => rename(value, owner)).join(",");
    const rule = text.match(/^([^,]+),([^,]+?)->([^,]+)(,.*)?$/);
    if (!rule) return line;
    const [, from, read, to, fields = ""] = rule;
    return `${indent}${rename(from, owner)},${read}->${rename(to, owner)}${fields}`;
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
