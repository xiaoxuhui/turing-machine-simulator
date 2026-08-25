export function routeCanvasSize(frameCount: number, positionCount: number): { width: number; height: number } {
  return {
    width: Math.min(1600, Math.max(320, positionCount * 10)),
    height: Math.min(2400, Math.max(180, frameCount)),
  };
}

export function routeSampleIndex(pixel: number, pixels: number, itemCount: number): number {
  if (itemCount <= 1 || pixels <= 1) return 0;
  return Math.min(itemCount - 1, Math.floor(pixel * itemCount / pixels));
}

export function normalizeRouteSteps(raw: number, fallback = 10000): number {
  if (!Number.isFinite(raw) || raw < 1) return fallback;
  return Math.min(Number.MAX_SAFE_INTEGER, Math.floor(raw));
}
