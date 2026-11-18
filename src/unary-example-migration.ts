import type { ExampleProject } from "./examples";
import type { MachineProjectFields } from "./project-state";
import { unaryExamples } from "./unary-examples";
import { hyperoperationExamples } from "./hyperoperation-examples";
import { inverseOperationExamples } from "./inverse-operation-examples";
import { shortUnaryProject } from "./unary-state-names";
import { extractSharedFunctions } from "./shared-functions";
import { exampleVariant } from "./example-variants";

const originals = Object.values({ ...unaryExamples, ...hyperoperationExamples, ...inverseOperationExamples });
const sourceKey = (source: string) => source.split(/\r?\n/)
  .map(line => line.trim()).filter(line => line && !line.startsWith("#"))
  .map(line => line.replace(/\s*->\s*/g, "->").replace(/\s*:\s*/g, ":")).join("\n");

/** Update saved built-in examples, while keeping edited and unfinished programs intact. */
export function migrateUnaryExample<T extends MachineProjectFields>(project: T): T {
  if (!/(?:□|\b(?:HALT|ACCEPT|REJECT)\b|add\.|sub\.|mul\.|cmp\.|parse\.|carryBar|even,|odd,|公共右扫|公共左扫|寄存器加一|减一后收拢纸带)/.test(project.rules)) return project;
  for (const original of originals) {
    const converted = shortUnaryProject({ ...original, ...project });
    const target = shortUnaryProject(original);
    if (converted.blankSymbol !== target.blankSymbol || converted.acceptStates !== target.acceptStates ||
      converted.rejectStates !== target.rejectStates || converted.haltStates !== target.haltStates) continue;
    const numeric = /^\d+(?:\.|$)/.test(project.initialState);
    if (!numeric && converted.initialState !== target.initialState) continue;
    const key = sourceKey(converted.rules);
    const matches = (candidate: ExampleProject) => {
      const variant = shortUnaryProject(numeric ? exampleVariant(candidate, "numeric", "original") : candidate);
      return variant.initialState === converted.initialState && sourceKey(variant.rules) === key;
    };
    if (matches(original) || (original.sharedRules && matches({ ...original, rules: original.sharedRules() })) ||
      (project.rules.includes(":") && matches(extractSharedFunctions(original)))) {
      return { ...project, input: converted.input, blankSymbol: converted.blankSymbol, initialState: converted.initialState,
        haltStates: converted.haltStates, acceptStates: converted.acceptStates, rejectStates: converted.rejectStates, rules: converted.rules };
    }
  }
  return project;
}
