import type { ExampleProject } from "./examples";
import { functionHeader, functionParameterType } from "./function-parameters";
import { protectSymbolAnnotations } from "./symbol-annotations";

export const campaignTerminalStates = { haltStates: "H", acceptStates: "T", rejectStates: "F" } as const;
export type TerminalNames = ReadonlyMap<string, string>;

export function campaignTerminalNames(project: Pick<ExampleProject, "haltStates" | "acceptStates" | "rejectStates">): TerminalNames {
  const names = new Map<string, string>();
  for (const field of ["haltStates", "acceptStates", "rejectStates"] as const) {
    for (const name of project[field].split(",").map(name => name.trim()).filter(Boolean)) names.set(name, campaignTerminalStates[field]);
  }
  return names;
}

export function shortCampaignProject<T extends ExampleProject>(project: T): T {
  const names = campaignTerminalNames(project);
  return { ...project, ...campaignTerminalStates,
    initialState: names.get(project.initialState) ?? project.initialState,
    rules: renameCampaignTerminalSource(project.rules, names),
    sharedRules: project.sharedRules && (() => renameCampaignTerminalSource(project.sharedRules!(), names)),
  };
}

/** Rename state fields, never tape symbols, directions or embedded input data.
 * This intentionally accepts unfinished rules so old editor drafts can migrate.
 */
export function renameCampaignTerminalSource(source: string, names: TerminalNames): string {
  if (![...names].some(([from, to]) => from !== to && source.includes(from))) return source;
  const rename = (value: string) => value.replace(/\S(?:.*\S)?/u, name => names.get(name) ?? name);
  return source.split(/(\r?\n)/).map(line => {
    const text = line.trim();
    if (!text || text.startsWith("#")) return line;
    const indent = line.slice(0, line.length - line.trimStart().length);
    const header = functionHeader(text);
    if (header) {
      const fields = header.fields.map((field, index, fields) => {
        if (index < 2) return rename(field);
        const type = functionParameterType(fields[index + 1] ?? "");
        if (type === "state" || !type && field.includes("=")) {
          const equal = field.indexOf("=");
          if (equal >= 0) return field.slice(0, equal + 1) + rename(field.slice(equal + 1));
        }
        return field;
      });
      return `${indent}${header.name}(${fields.join(",")}):`;
    }
    const exported = /^(ret|pub|返回状态|导出状态)(\s+|:\s*)(.*)$/u.exec(text);
    if (exported) return indent + exported[1] + exported[2] + exported[3].split(",").map(rename).join(",");
    const { text: protectedText, restore } = protectSymbolAnnotations(line);
    const namedCall = /^(\s*)([^,():\s]+)(\s*:\s*)([^,():\s]+)(\s*->\s*)([^,():\s]+)(\s*)$/u.exec(protectedText);
    if (namedCall) return restore(namedCall[1] + rename(namedCall[2]) + namedCall[3] + namedCall[4] + namedCall[5] + rename(namedCall[6]) + namedCall[7]);
    const arrow = /->|→/.exec(protectedText);
    if (!arrow) return line;
    const left = protectedText.slice(0, arrow.index);
    const right = protectedText.slice(arrow.index + arrow[0].length);
    const comma = left.indexOf(",");
    const nextComma = right.indexOf(",");
    const from = comma < 0 ? rename(left) : rename(left.slice(0, comma)) + left.slice(comma);
    const to = nextComma < 0 ? rename(right) : rename(right.slice(0, nextComma)) + right.slice(nextComma);
    return restore(from + arrow[0] + to);
  }).join("");
}

export function renameCampaignTerminalText(text: string, names: TerminalNames): string {
  let result = renameCampaignTerminalSource(text, names);
  for (const [from, to] of names) {
    if (from === to || from.length === 1) continue;
    const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(`(?<![\\p{L}\\p{N}_.])${escaped}(?![\\p{L}\\p{N}_.])`, "gu"), to);
  }
  return result;
}
