import type { ExampleProject } from "./examples";
import { functionHeader, functionParameterType } from "./function-parameters";
import { protectSymbolAnnotations } from "./symbol-annotations";
import { decodeRuleSymbol, encodeRuleSymbol } from "./rule-format";

export interface CampaignKeyboardNames {
  identifiers: ReadonlyMap<string, string>;
  oldBlank: string;
  blank: string;
}
const han = /\p{Script=Han}/u;

/** Reserve existing names before allocating short names, including local aliases. */
export function campaignKeyboardNames(project: ExampleProject, source = project.rules): CampaignKeyboardNames {
  const reserved = new Set(source.match(/[\p{L}\p{N}_]+/gu) ?? []);
  const identifiers = new Map<string, string>();
  const counts = new Map<string, number>();
  const add = (name: string, kind: string) => {
    for (const part of name.trim().split(".")) {
      if (!han.test(part) || identifiers.has(part)) continue;
      let next = counts.get(kind) ?? 0;
      while (reserved.has(kind + ++next)) { /* Avoid existing source names. */ }
      const short = kind + next;
      counts.set(kind, next); reserved.add(short); identifiers.set(part, short);
    }
  };
  const lines = source.split(/\r?\n/);
  for (const line of lines) {
    const header = functionHeader(line.trim());
    if (!header) continue;
    add(header.name, "f");
    for (let index = 2; index < header.fields.length; index++) {
      const field = header.fields[index].trim(), type = functionParameterType(header.fields[index + 1]?.trim() ?? "");
      if (type !== "symbol") {
        const [alias, target = alias] = field.split("=");
        add(alias, "a"); add(target, type === "state" ? "s" : "f");
      }
      if (type) index++;
    }
  }
  for (const line of lines) {
    const text = line.trim();
    if (!text || text.startsWith("#")) continue;
    const header = functionHeader(text);
    if (header) { header.fields.slice(0, 2).forEach(name => add(name, "s")); continue; }
    const exported = /^(?:ret|pub|返回状态|导出状态)(?:\s+|:\s*)(.*)$/u.exec(text);
    if (exported) { exported[1].split(",").forEach(name => add(name, "s")); continue; }
    const { text: protectedText } = protectSymbolAnnotations(text);
    const arrow = /->|→/.exec(protectedText);
    if (arrow) {
      add(protectedText.slice(0, arrow.index).split(",")[0], "s");
      add(protectedText.slice(arrow.index + arrow[0].length).split(",")[0], "s");
    } else add(text, "f");
  }
  add(project.initialState, "s");
  let blank = project.blankSymbol;
  if (!/^[!-~]$/.test(blank)) {
    // A lambda variable can contain '_'; never merge it with an empty cell.
    blank = ["_", "~", "`", "|", ";", "$", "&", "%", "!"].find(char =>
      !project.input.includes(char) && !source.includes("," + char) && !source.includes(", " + char)) ?? project.blankSymbol;
  }
  return { identifiers, oldBlank: project.blankSymbol, blank };
}

export function keyboardCampaignIdentifier(value: string, names: CampaignKeyboardNames): string {
  return value.replace(/[^\s,():=]+/gu, name => name.split(".").map(part => names.identifiers.get(part) ?? part).join("."));
}

export function keyboardCampaignSource(source: string, names: CampaignKeyboardNames): string {
  const name = (value: string) => keyboardCampaignIdentifier(value, names);
  const symbol = (value: string) => decodeRuleSymbol(value.trim()) === names.oldBlank
    ? value.replace(/\S(?:.*\S)?/u, encodeRuleSymbol(names.blank)) : value;
  return source.split(/(\r?\n)/).map(line => {
    const text = line.trim();
    if (!text || text.startsWith("#")) return line;
    const indent = line.slice(0, line.length - line.trimStart().length);
    const header = functionHeader(text);
    if (header) {
      const fields = header.fields.slice(0, 2).map(name);
      for (let index = 2; index < header.fields.length; index++) {
        const field = header.fields[index], type = functionParameterType(header.fields[index + 1]?.trim() ?? "");
        fields.push(type === "symbol" ? symbol(field) : name(field));
        if (type) { fields.push(type === "symbol" ? "char" : type === "function" ? "fn" : "state"); index++; }
      }
      return `${indent}${name(header.name)}(${fields.join(",")}):`;
    }
    const exported = /^(ret|pub|返回状态|导出状态)(\s+|:\s*)(.*)$/u.exec(text);
    if (exported) return indent + (exported[1] === "导出状态" || exported[1] === "pub" ? "pub" : "ret") + exported[2] + name(exported[3]);
    const { text: protectedText, restore } = protectSymbolAnnotations(line);
    const namedCall = /^(\s*)([^,():\s]+)(\s*:\s*)([^,():\s]+)(\s*->\s*)([^,():\s]+)(\s*)$/u.exec(protectedText);
    if (namedCall) return restore(namedCall[1] + name(namedCall[2]) + namedCall[3] + name(namedCall[4]) + namedCall[5] + name(namedCall[6]) + namedCall[7]);
    const arrow = /->|→/.exec(protectedText);
    if (!arrow) return name(line);
    const left = protectedText.slice(0, arrow.index).split(",");
    const right = protectedText.slice(arrow.index + arrow[0].length).split(",");
    left[0] = name(left[0]);
    if (left.length > 1) left[1] = symbol(left[1]);
    right[0] = name(right[0]);
    if (right.length > 1) right[1] = symbol(right[1]);
    return restore(left.join(",") + arrow[0] + right.join(","));
  }).join("");
}

export function keyboardCampaignText(text: string, names: CampaignKeyboardNames): string {
  let result = text.replaceAll(names.oldBlank, names.blank);
  // Longer names must win over a shorter name contained in them.
  for (const [from, to] of [...names.identifiers].sort((a, b) => b[0].length - a[0].length)) {
    const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, "gu"), to);
  }
  return result.replaceAll("导出状态", "pub").replaceAll("返回状态", "ret")
    .replace(/,(函数|状态|符号|字符)(?=[,):\s]|$)/g, (_, type: string) => "," + ({ 函数: "fn", 状态: "state", 符号: "char", 字符: "char" }[type]));
}

export function keyboardCampaignProject<T extends ExampleProject>(project: T, names = campaignKeyboardNames(project)): T {
  return { ...project, blankSymbol: names.blank,
    input: project.input.replaceAll(names.oldBlank, names.blank), initialState: keyboardCampaignIdentifier(project.initialState, names),
    rules: keyboardCampaignSource(project.rules, names),
    sharedRules: project.sharedRules && (() => keyboardCampaignSource(project.sharedRules!(), names)),
  };
}
