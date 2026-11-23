import type { Transition } from "./core";

export interface RuleExplanation {
  purpose: string;
  read: string;
  write: string;
  move: string;
  next: string;
  contexts?: string[];
}
export interface RuleGuide {
  rules: Record<string, RuleExplanation>;
  symbols: Record<string, string>;
}
export const ruleGuideKey = (rule: Transition): string => JSON.stringify([
  rule.fromState, rule.readSymbol, rule.toState, rule.writeSymbol, rule.direction,
]);
