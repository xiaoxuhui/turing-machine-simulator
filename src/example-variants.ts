import { parseTransitions, resolveInitialState } from "./core";
import { exampleSource } from "./example-source";
import type { ExampleProject } from "./examples";
import { extractSharedFunctions } from "./shared-functions";
import { functionHeader, functionParameterType, parseFunctionParameters } from "./function-parameters";
import { protectSymbolAnnotations } from "./symbol-annotations";
import { expandImplicitRead, formatTransition } from "./rule-format";

export type ExampleNames = "descriptive" | "numeric";
export type ExampleStructure = "original" | "flat" | "functions";
const split = (value: string) => value.split(",").map(item => item.trim()).filter(Boolean);

function numericStates(project: ExampleProject): ExampleProject {
  const terminal = new Set([...split(project.haltStates), ...split(project.acceptStates), ...split(project.rejectStates)]);
  const functions = new Map<string, Set<string>>();
  const source = exampleSource(project, "commented", false);
  for (const line of source.split("\n")) {
    const match = functionHeader(line.trim());
    if (!match) continue;
    const parameters = parseFunctionParameters(match.fields.slice(2)).parameters;
    functions.set(match.name, new Set(parameters.filter(item => item.type !== "symbol").map(item => item.alias)));
  }
  const names = new Map<string, string>();
  const sections = new Map<string, string>();
  const counters = new Map<string, number>();
  const reserved = new Set(terminal);
  for (const section of Object.values(project.numericStateSections ?? {})) reserved.add(section);
  // Reserve every ancestor so a state or a generated section cannot take an existing section's number.
  for (const value of reserved) {
    const dot = value.lastIndexOf(".");
    if (dot >= 0) reserved.add(value.slice(0, dot));
  }
  const allocate = (parent: string) => {
    let index = counters.get(parent) ?? 1;
    const prefix = parent ? parent + "." : "";
    while (reserved.has(prefix + index)) index++;
    counters.set(parent, index + 1);
    return prefix + index;
  };
  const phase = (state: string): string | undefined => {
    const declared = project.numericStateSections;
    if (!declared) return undefined;
    for (let key = state; key; key = key.includes(".") ? key.slice(0, key.lastIndexOf(".")) : "") {
      if (Object.hasOwn(declared, key)) return declared[key];
    }
  };
  const local = (state: string): string => {
    if (terminal.has(state)) return state;
    if (!names.has(state)) {
      const pieces = state.split(".");
      const leaf = pieces.pop();
      let path = phase(state) ?? "";
      if (!path) {
        let original = "";
        for (const piece of pieces) {
          original += piece + ".";
          if (!sections.has(original)) sections.set(original, allocate(path));
          path = sections.get(original)!;
        }
      }
      names.set(state, leaf === "*" && path ? path + ".*" : allocate(path));
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
    const definition = functionHeader(text);
    if (definition) {
      owner = definition.name;
      const params = definition.fields.map(value => value.trim());
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
    const exported = text.match(/^(ret|pub|返回状态|导出状态)(?:\s+|:\s*)(.*)$/u);
    if (exported) return indent + exported[1] + " " + exported[2].split(",").map(value => rename(value, owner)).join(",");
    const { text: protectedText, restore } = protectSymbolAnnotations(text);
    const normalized = expandImplicitRead(protectedText);
    const rule = normalized.match(/^([^,]*),([^,]*?)->([^,]+)(,.*)?$/);
    if (!rule) return line;
    const [, from, read, to, fields = ""] = rule;
    const state = !from.trim() || from.trim() === "*" ? from : rename(restore(from), owner);
    return restore(`${indent}${state}${normalized === protectedText ? `,${read}` : ""}->${rename(restore(to), owner)}${fields}`);
  });
  const initialState = project.initialState ? rename(project.initialState) : "";
  const mapping = [...names].slice(0, 40).map(([from, to]) => `# 状态 ${from} → ${to}`);
  const lambdaSource = project.lambdaSource ? { ...project.lambdaSource, betaState: rename(project.lambdaSource.betaState ?? "lambda.beta") } : undefined;
  return { ...project, initialState, lambdaSource, rules: [...mapping, ...lines].join("\n") };
}

export function exampleVariant(project: ExampleProject, names: ExampleNames, structure: ExampleStructure): ExampleProject {
  let variant = project;
  if (structure === "functions") variant = project.sharedRules ? {
    ...project,
    rules: project.sharedRules(),
    description: project.description + " 公共函数版复用寄存器加一、减一后的整理和左右扫描。",
  } : extractSharedFunctions(project);
  if (structure === "flat") {
    const parsed = parseTransitions(project.rules, { haltStates: split(project.haltStates), acceptStates: split(project.acceptStates), rejectStates: split(project.rejectStates) });
    if (parsed.errors.length) throw new Error(parsed.errors[0]);
    const initialState = resolveInitialState(parsed, project.initialState);
    const rules = parsed.hasFunctions
      ? parsed.transitions.map(formatTransition).join("\n")
      : exampleSource(project, "commented", false);
    variant = { ...project, initialState, rules };
  }
  if (names === "numeric") variant = numericStates(variant);
  return variant;
}
