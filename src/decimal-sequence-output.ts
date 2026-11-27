import type { Tape } from "./core";
import { visibleTapeSymbol } from "./symbol-annotations";

/** Inspect completed words only; preserve integer precision and ignore working marks. */
export function readDecimalSequenceOutput(tape: Tape): string[] {
  const entries = tape.entries().filter(([position]) => position >= 0);
  // Compatibility with earlier saved Gijswijt machines using one whole term per cell.
  if (!entries.some(([, text]) => visibleTapeSymbol(text) === "|")) return entries.map(([, text]) => text.split("|")[0]);
  const terms: string[] = [];
  let term = "", include = false;
  for (const [, text] of entries) {
    const char = visibleTapeSymbol(text);
    if (char === "|") {
      if (include && term) terms.push(term);
      term = ""; include = text !== "|#(pending)";
    } else if (/^\d$/.test(char)) term += char;
  }
  if (include && term) terms.push(term);
  return terms;
}
