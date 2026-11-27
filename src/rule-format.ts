import { normalizeAnnotationEscapes, protectSymbolAnnotations } from "./symbol-annotations";
import type { Transition } from "./core";

/** Compact arrow padding without changing function indentation or comment text. */
export function compactRuleArrows(source: string): string {
  return source.replace(/^[^\r\n]*/gm, line => {
    if (/^\s*#/.test(line)) return line;
    const { text, restore } = protectSymbolAnnotations(line);
    return restore(text.replace(/[ \t]*(->|→)[ \t]*/g, "$1"));
  });
}

const whitespaceByEscape = new Map([
  ["u002c", ","],
  ["s", " "],
  ["t", "\t"],
  ["n", "\n"],
  ["r", "\r"],
  ["u00a0", "\u00a0"],
  ["u3000", "\u3000"],
]);

const whitespaceEscapes = new Map([...whitespaceByEscape].map(([escape, symbol]) => [symbol, escape]));
const escapedWhitespace = /^(\\+)(s|t|n|r|u002c|u00a0|u3000)$/i;

/** Escape a literal star run or a whitespace symbol in a rule field. */
export function decodeRuleSymbol(source: string): string {
  if (source.length > 1 && /^[\\/]+[-#]?$/.test(source)) return source.slice(1);
  const match = source.match(escapedWhitespace);
  if (match) return match[1].length === 1 ? whitespaceByEscape.get(match[2].toLowerCase())! : source.slice(1);
  const annotated = /^(\\+)(s|t|n|r|u002c|u00a0|u3000)(#\(.*)$/i.exec(source);
  if (annotated) return annotated[1].length === 1 ? whitespaceByEscape.get(annotated[2].toLowerCase())! + annotated[3] : source.slice(1);
  return /^\*{2,}$/.test(source) ? source.slice(1) : normalizeAnnotationEscapes(source);
}

export function encodeRuleSymbol(symbol: string): string {
  if (/^[\\/]+[-#]?$/.test(symbol)) return symbol[0] + symbol;
  const whitespace = whitespaceEscapes.get(symbol);
  if (whitespace) return "\\" + whitespace;
  for (const [char, escape] of whitespaceEscapes) if (symbol.startsWith(char + "#(")) return "\\" + escape + symbol.slice(char.length);
  if (/^\\+(?:s|t|n|r|u002c|u00a0|u3000)#\(/i.test(symbol)) return "\\" + symbol;
  if (escapedWhitespace.test(symbol)) return "\\" + symbol;
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

