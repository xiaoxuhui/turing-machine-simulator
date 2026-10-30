export const ROUTE_BLANK_COLOR = "#f4f7fa";
export const ROUTE_HEAD_COLOR = "#ef476f";

const known = new Map(Object.entries({
  "1": "#168963", "0": "#475569", X: "#3b82f6", Y: "#e4a11b",
  l: "#8b5cf6", o: "#06a5a5", C1: "#ed7c32", Cl: "#c45ba0", S: "#64748b",
}));
const hex = (value: number) => value.toString(16).padStart(2, "0");

export function routeSymbolColor(symbol: string, blankSymbol: string): string {
  if (symbol === blankSymbol) return ROUTE_BLANK_COLOR;
  const color = known.get(symbol);
  if (color) return color;
  let hash = 2166136261;
  for (const char of symbol) hash = Math.imul(hash ^ char.codePointAt(0)!, 16777619) >>> 0;
  return "#" + [0, 8, 16].map(shift => hex(48 + ((hash >>> shift) & 255) % 145)).join("");
}

export function routeHeadColor(symbol: string, blankSymbol: string): string {
  if (symbol === blankSymbol) return ROUTE_HEAD_COLOR;
  const color = routeSymbolColor(symbol, blankSymbol);
  return "#" + [1, 3, 5].map(offset => hex(Math.round(
    parseInt(ROUTE_HEAD_COLOR.slice(offset, offset + 2), 16) * 0.7 + parseInt(color.slice(offset, offset + 2), 16) * 0.3,
  ))).join("");
}
