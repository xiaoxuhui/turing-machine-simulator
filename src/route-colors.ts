export const ROUTE_BLANK_COLOR = "#f4f7fa";
export const ROUTE_HEAD_COLOR = "#ef476f";

export const ROUTE_COLOR_STOPS = ["#eab308", "#22c55e", "#3b82f6"] as const;
const hex = (value: number) => value.toString(16).padStart(2, "0");
const mix = (a: string, b: string, weight: number) => "#" + [1, 3, 5].map(offset => hex(Math.round(
  parseInt(a.slice(offset, offset + 2), 16) * (1 - weight) + parseInt(b.slice(offset, offset + 2), 16) * weight,
))).join("");

export function createRoutePalette(alphabet: Iterable<string>, blankSymbol: string): Map<string, string> {
  const symbols = [...new Set(alphabet)].filter(symbol => symbol !== blankSymbol);
  return new Map(symbols.map((symbol, index) => {
    const position = index * ROUTE_COLOR_STOPS.length / symbols.length;
    const stop = Math.floor(position);
    return [symbol, mix(ROUTE_COLOR_STOPS[stop], ROUTE_COLOR_STOPS[(stop + 1) % ROUTE_COLOR_STOPS.length], position - stop)];
  }));
}

export function routeHeadColor(symbolColor?: string): string {
  return !symbolColor || symbolColor === ROUTE_BLANK_COLOR ? ROUTE_HEAD_COLOR : mix(ROUTE_HEAD_COLOR, symbolColor, 0.3);
}
