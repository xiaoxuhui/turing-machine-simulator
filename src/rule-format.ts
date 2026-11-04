/** Compact arrow padding without changing function indentation or comment text. */
export function compactRuleArrows(source: string): string {
  return source.replace(/^[^\r\n]*/gm, line => /^\s*#/.test(line) ? line : line.replace(/[ \t]*(->|→)[ \t]*/g, "$1"));
}
import type { Transition } from "./core";

/** A run of literal stars is written with one extra star in source code. */
export function decodeRuleSymbol(source: string): string {
  return /^\*{2,}$/.test(source) ? source.slice(1) : source;
}

export function encodeRuleSymbol(symbol: string): string {
  return /^\*+$/.test(symbol) ? `*${symbol}` : symbol;
}

/** Emit complete, copyable source rather than ambiguous shorthand. */
export function formatTransition(rule: Transition): string {
  return `${rule.fromState || "*"},${rule.readSymbol ? encodeRuleSymbol(rule.readSymbol) : "*"}->${rule.toState},${rule.writeSymbol ? encodeRuleSymbol(rule.writeSymbol) : "*"},${rule.direction}`;
}

