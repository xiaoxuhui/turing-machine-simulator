import { parseTransitions, type ParseResult, type Transition } from "./core";
import { functionHeader, functionParameterType } from "./function-parameters";
import type { MachineProjectFields } from "./project-state";
import { decodeRuleSymbol, encodeRuleSymbol, formatTransition } from "./rule-format";
import { protectSymbolAnnotations, splitInputSymbols } from "./symbol-annotations";

export interface ProjectSymbol {
  value: string;
  reads: number;
  writes: number;
  input: boolean;
  blank: boolean;
  parameter: boolean;
}

type SymbolProject = Pick<MachineProjectFields, "rules" | "input" | "blankSymbol">;

function mapSymbolParameters(line: string, map: (symbol: string) => string): string {
  const header = functionHeader(line.trimEnd());
  if (!header) return line;
  const { fields } = header;
  for (let i = 2; i < fields.length; i++) {
    const type = functionParameterType(fields[i + 1]?.trim() ?? "");
    if (type === "symbol") {
      const symbol = decodeRuleSymbol(fields[i].trim());
      const renamed = map(symbol);
      if (renamed !== symbol) fields[i] = fields[i].replace(fields[i].trim(), () => encodeRuleSymbol(renamed));
    }
    if (type) i++;
  }
  return line.slice(0, line.indexOf("(") + 1) + fields.join(",") + line.slice(line.lastIndexOf("):"));
}

export function collectProjectSymbols(project: SymbolProject, parsed: ParseResult): ProjectSymbol[] {
  const symbols = new Map<string, ProjectSymbol>();
  const get = (value: string) => {
    let symbol = symbols.get(value);
    if (!symbol) {
      symbol = { value, reads: 0, writes: 0, input: false, blank: false, parameter: false };
      symbols.set(value, symbol);
    }
    return symbol;
  };
  if (project.blankSymbol) get(project.blankSymbol).blank = true;
  for (const value of splitInputSymbols(project.input)) get(value).input = true;
  for (const rule of parsed.transitions) {
    if (rule.readSymbol) get(rule.readSymbol).reads++;
    if (rule.writeSymbol) get(rule.writeSymbol).writes++;
  }
  if (parsed.hasFunctions) {
    for (const line of project.rules.split(/\r?\n/)) {
      mapSymbolParameters(line, symbol => { get(symbol).parameter = true; return symbol; });
    }
  }
  return [...symbols.values()];
}

export function renameProjectSymbol(project: SymbolProject, parsed: ParseResult, from: string, to: string): SymbolProject {
  if (parsed.errors.length) throw new Error("请先修正规则格式。");
  if (from === to) return project;
  const symbols = collectProjectSymbols(project, parsed);
  const source = symbols.find(symbol => symbol.value === from);
  if (!source) throw new Error("找不到要修改的符号。");
  const encoded = encodeRuleSymbol(to);
  const syntax = protectSymbolAnnotations(encoded).text;
  if (!to || encoded.trim() !== encoded || /[\r\n]/.test(encoded) || /,|->|→/.test(syntax)) {
    throw new Error("请输入有效符号，逗号、箭头和换行是规则分隔符。");
  }
  if (symbols.some(symbol => symbol.value === to)) throw new Error("该符号已存在，请换一个。");
  if (source.blank && [...to].length !== 1) {
    throw new Error("空白符只能改成一个字符。");
  }
  const map = (symbol: string) => symbol === from ? to : symbol;
  const inputSymbols = splitInputSymbols(project.input).map(map);
  const input = inputSymbols.join("");
  if (source.input && JSON.stringify(splitInputSymbols(input)) !== JSON.stringify(inputSymbols)) {
    throw new Error("初始输入中的符号须能识别为一个格子，例如 A 或 A#(标记)。");
  }
  if (source.parameter && /[():\s]/.test(syntax)) {
    throw new Error("函数的符号参数不能包含括号、冒号或未转义的空白。");
  }

  const rewrite = (rule: Transition) => formatTransition({
    ...rule, readSymbol: map(rule.readSymbol), writeSymbol: map(rule.writeSymbol),
  });
  const rules = project.rules.split(/(\r?\n)/).map(line => {
    const content = line.trimStart();
    if (!content || content.startsWith("#") || !content.includes(",")) return line;
    const header = parsed.hasFunctions ? mapSymbolParameters(line, map) : line;
    if (header !== line || !content.includes("->")) return header;
    if (parsed.hasFunctions && /^(?:ret|返回状态|导出状态)(?:\s|:)/.test(content)) return line;
    const [rule] = parseTransitions(content).transitions;
    return rule && (rule.readSymbol === from || rule.writeSymbol === from)
      ? line.slice(0, line.length - content.length) + rewrite(rule) : line;
  }).join("");
  return { rules, blankSymbol: map(project.blankSymbol), input: source.input ? input : project.input };
}
