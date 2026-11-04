export type FunctionParameterType = "function" | "state" | "symbol" | "auto";

export interface FunctionParameter {
  alias: string;
  value: string;
  type: FunctionParameterType;
}

export function functionParameterType(value: string): Exclude<FunctionParameterType, "auto"> | undefined {
  if (["函数", "function", "fn"].includes(value)) return "function";
  if (["状态", "state"].includes(value)) return "state";
  if (["符号", "字符", "symbol", "char"].includes(value)) return "symbol";
  return undefined;
}

/** Entry and exit are handled separately; these are only the trailing fields. */
export function parseFunctionParameters(fields: string[]): { parameters: FunctionParameter[]; errors: string[] } {
  const parameters: FunctionParameter[] = [], errors: string[] = [];
  const aliases = new Set<string>();
  for (let index = 0; index < fields.length; index++) {
    const field = fields[index].trim();
    const declaredType = functionParameterType(fields[index + 1]?.trim() ?? "");
    if (declaredType) index++;
    if (declaredType === "symbol") {
      if (!field || /[,():\s]/u.test(field)) errors.push("符号参数必须直接填写一个非空符号，例如 1,符号 或 C1,符号");
      else parameters.push({ alias: decodeRuleSymbol(field), value: decodeRuleSymbol(field), type: "symbol" });
      continue;
    }
    const parts = field.split("=").map(part => part.trim());
    const [alias, value = alias] = parts;
    if (parts.length > 2 || !/^[^,():\s=]+$/u.test(alias) || !/^[^,():\s=]+$/u.test(value)) {
      errors.push("参数使用 内部名=外部名,函数/状态；符号直接填写 值,符号");
      continue;
    }
    if (aliases.has(alias)) errors.push(`参数别名 ${alias} 重复`);
    aliases.add(alias);
    parameters.push({ alias, value, type: declaredType ?? (parts.length === 2 ? "auto" : "function") });
  }
  return { parameters, errors };
}
import { decodeRuleSymbol } from "./rule-format";

