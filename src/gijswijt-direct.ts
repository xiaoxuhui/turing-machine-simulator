export function attachDirectGijswijt(root: HTMLElement): void {
  const get = <T extends HTMLElement>(id: string) => root.querySelector<T>(`#${id}`)!;
  let sequence = [1];
  let worker: Worker | null = null;
  const render = () => {
    get<HTMLTextAreaElement>("directOutput").value = sequence.join(", ");
    const first = Math.max(0, sequence.length - 40);
    get("directTape").innerHTML = [...sequence.slice(first), ...Array<number>(10).fill(0)].map((term, offset) =>
      `<div class="sequence-cell${term === 0 ? " unwritten" : ""}"><small>${first + offset + 1}</small><strong>${term}</strong></div>`,
    ).join("");
    get("directStatus").textContent = `已写入 ${sequence.length} 项，最新项 ${sequence.at(-1)}${worker ? "；生成中，可随时取消或切换模式。" : "。"}`;
  };
  const stop = () => {
    worker?.terminate();
    worker = null;
    get<HTMLButtonElement>("directCancel").disabled = true;
    get<HTMLButtonElement>("directNext").disabled = false;
    get<HTMLButtonElement>("directGenerate").disabled = false;
  };
  const generate = (target: number) => {
    if (!Number.isSafeInteger(target) || target < sequence.length || target < 1) {
      get("directStatus").textContent = `目标项数须为不小于 ${sequence.length} 的正整数。`;
      return;
    }
    if (target === sequence.length) { render(); return; }
    stop();
    try {
      const current = new Worker(new URL("./gijswijt-worker.ts", import.meta.url), { type: "module" });
      worker = current;
      get<HTMLButtonElement>("directCancel").disabled = false;
      get<HTMLButtonElement>("directNext").disabled = true;
      get<HTMLButtonElement>("directGenerate").disabled = true;
      const fail = () => {
        if (worker !== current) return;
        stop();
        get("directStatus").textContent = "计算中断，已写入项保留，可继续生成。";
      };
      current.onmessage = (event: MessageEvent<{ type: string; terms?: number[] }>) => {
        if (worker !== current) return;
        if (event.data.type === "progress") {
          for (const term of event.data.terms!) sequence.push(term);
          render();
        } else if (event.data.type === "done") { stop(); render(); }
        else if (event.data.type === "error") fail();
      };
      current.onerror = fail;
      current.postMessage({ sequence: [...sequence], targetLength: target });
      render();
    } catch {
      stop();
      get("directStatus").textContent = "无法启动直接计算，请重试。";
    }
  };
  get("directNext").addEventListener("click", () => generate(sequence.length + 1));
  get("directGenerate").addEventListener("click", () => generate(Number(get<HTMLInputElement>("directTarget").value)));
  get("directCancel").addEventListener("click", () => { stop(); render(); });
  get("directReset").addEventListener("click", () => { stop(); sequence = [1]; render(); });
  render();
}
