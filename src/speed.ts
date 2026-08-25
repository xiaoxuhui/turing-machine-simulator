export function normalizeSpeed(raw: number): number {
  if (!Number.isFinite(raw)) return 5;
  return Math.min(1000, Math.max(1, Math.round(raw)));
}

export function measuredSpeed(completedSteps: number, elapsedMilliseconds: number): number {
  if (completedSteps <= 0 || elapsedMilliseconds <= 0) return 0;
  return completedSteps * 1000 / elapsedMilliseconds;
}
