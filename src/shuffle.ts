export type RandomSource = () => number;

export function shuffled<T>(source: readonly T[], random: RandomSource = Math.random): T[] {
  const result = [...source];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const sample = random();
    const bounded = Number.isFinite(sample) ? Math.min(Math.max(sample, 0), 1 - Number.EPSILON) : 0;
    const target = Math.floor(bounded * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}
