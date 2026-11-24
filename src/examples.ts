import type { RuleGuide } from "./rule-guide";
import { builtinExamples } from "./example-catalog";
import { campaignExamples } from "./campaign-examples";
import { exampleLevelId } from "./example-level-links";

export interface ExampleProject {
  category?: "基础示例" | "函数教程" | "一进制运算" | "二进制运算" | "猜想验证" | "关卡示例";
  campaignLevelId?: string;
  ruleGuide?: RuleGuide;
  /** State or state-prefix to numeric section path, used by the numeric example variant. */
  numericStateSections?: Readonly<Record<string, string>>;
  /** Optional function source for the same transitions. Built when selected. */
  sharedRules?: () => string;
  /** Original BF source retained when the displayed rules have no comments. */
  brainfuckSource?: { source: string; input: string };
  lambdaSource?: { source: string; capacity: number; betaState?: string };
  maxSteps?: number | null;
  name: string;
  description: string;
  input: string;
  initialState: string;
  blankSymbol: string;
  acceptStates: string;
  rejectStates: string;
  haltStates: string;
  rules: string;
}

export const examples: Record<string, ExampleProject> = {
  ...Object.fromEntries(Object.entries(builtinExamples).map(([id, project]) => [id, { ...project, campaignLevelId: exampleLevelId(id) }])),
  ...campaignExamples,
};
