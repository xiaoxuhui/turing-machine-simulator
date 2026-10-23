/** Edit one parsed rule while retaining comments and rules on other pages. */
export function editRuleSource(source: string, index: number, replacement: string | null): string {
  let current = 0;
  return source.split(/\r?\n/).flatMap((line) => {
    if (!line.trim() || line.trimStart().startsWith("#")) return [line];
    if (current++ !== index) return [line];
    return replacement === null ? [] : [replacement];
  }).join("\n");
}
