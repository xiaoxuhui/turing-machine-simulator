import { nextGijswijtTerm } from "./gijswijt";

self.onmessage = (event: MessageEvent<{ sequence: number[]; targetLength: number }>) => {
  const { sequence, targetLength } = event.data;
  const calculate = () => {
    try {
      const terms: number[] = [];
      const start = performance.now();
      while (sequence.length < targetLength && performance.now() - start < 32) {
        const term = nextGijswijtTerm(sequence);
        sequence.push(term);
        terms.push(term);
      }
      if (terms.length) self.postMessage({ type: "progress", terms });
      if (sequence.length < targetLength) setTimeout(calculate, 0);
      else self.postMessage({ type: "done" });
    } catch {
      self.postMessage({ type: "error" });
    }
  };
  calculate();
};
