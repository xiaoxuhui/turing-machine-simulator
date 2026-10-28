/** Compact arrow padding without changing function indentation or comment text. */
export function compactRuleArrows(source: string): string {
  return source.replace(/^[^\r\n]*/gm, line => /^\s*#/.test(line) ? line : line.replace(/[ \t]*(->|→)[ \t]*/g, "$1"));
}
