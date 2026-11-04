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

/** Omitting the read field and its comma means an unconditional rule. */
export function expandImplicitRead(source: string): string {
  if (source.split("->").length !== 2) return source;
  const match = source.match(/^([^,():\s]+)\s*->\s*(.+)$/u);
  return match ? `${match[1]},*->${match[2]}` : source;
}

/** Emit complete, copyable source rather than ambiguous shorthand. */
export function formatTransition(rule: Transition): string {
  return `${rule.fromState || "*"},${rule.readSymbol ? encodeRuleSymbol(rule.readSymbol) : "*"}->${rule.toState},${rule.writeSymbol ? encodeRuleSymbol(rule.writeSymbol) : "*"},${rule.direction}`;
}

