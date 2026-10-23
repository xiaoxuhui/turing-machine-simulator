/** Largest number of repetitions of a nonempty suffix block. */
export function nextGijswijtTerm(sequence: readonly number[]): number {
  let best = 1;
  const length = sequence.length;
  for (let size = 1; size <= Math.floor(length / (best + 1)); size += 1) {
    let count = 1;
    while ((count + 1) * size <= length) {
      let matches = true;
      for (let offset = 0; offset < size; offset += 1) {
        if (sequence[length - (count + 1) * size + offset] !== sequence[length - size + offset]) {
          matches = false;
          break;
        }
      }
      if (!matches) break;
      count += 1;
    }
    best = Math.max(best, count);
  }
  return best;
}

export function appendGijswijtTerms(sequence: readonly number[], targetLength: number): number[] {
  if (!Number.isSafeInteger(targetLength) || targetLength < 1 || targetLength < sequence.length) {
    throw new RangeError("目标项数必须是不小于当前长度的正整数");
  }
  const result = [...sequence];
  while (result.length < targetLength) result.push(nextGijswijtTerm(result));
  return result;
}
