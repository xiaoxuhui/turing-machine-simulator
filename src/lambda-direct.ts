import type { LambdaReduction } from "./lambda-reduce";

export function attachLambdaCalculator(root: HTMLElement, loadMachine: (input: string) => void): void {
  const get = <T extends HTMLElement>(id: string) => root.querySelector<T>(`#${id}`)!;
  const mode = get<HTMLSelectElement>("lambdaMode");
  const input = get<HTMLTextAreaElement>("lambdaInput");
  const output = get<HTMLTextAreaElement>("lambdaOutput");
  const status = get("lambdaStatus");
  const calculate = get<HTMLButtonElement>("lambdaCalculate");
  const step = get<HTMLButtonElement>("lambdaStep");
  const cancel = get<HTMLButtonElement>("lambdaCancel");
  let worker: Worker | null = null;
  let intermediate: string | undefined;
  let steps = 0;
  let normalForm = false;

  const stop = () => {
    worker?.terminate();
    worker = null;
    calculate.disabled = normalForm;
    step.disabled = normalForm;
    cancel.disabled = true;
  };
  const report = (message: string, error = false) => {
    status.textContent = message;
    status.classList.toggle("error", error);
  };
  const start = (singleStep: boolean) => {
    if (worker || normalForm) return;
    try {
      const current = new Worker(new URL("./lambda-worker.ts", import.meta.url), { type: "module" });
      worker = current;
      calculate.disabled = true;
      step.disabled = true;
      cancel.disabled = false;
      report("正在归约…");
      const fail = () => {
        if (worker !== current) return;
        stop();
        report("计算中断，请重试。", true);
      };
      current.onerror = fail;
      current.onmessageerror = fail;
      current.onmessage = (event: MessageEvent<LambdaReduction>) => {
        if (worker !== current) return;
        const result = event.data;
        if ("output" in result) {
          steps += result.steps;
          intermediate = result.output;
          output.value = intermediate;
          normalForm = result.status === "done";
          report(normalForm ? `已得到正规形，共 ${steps} 次 β 归约。` : `已完成第 ${steps} 次 β 归约。`);
        } else {
          report(result.message, result.status === "invalid");
        }
        stop();
      };
      current.postMessage({ input: intermediate ?? input.value, singleStep, continuation: intermediate !== undefined });
    } catch {
      stop();
      report("无法启动直接计算，请重试。", true);
    }
  };

  mode.addEventListener("change", () => {
    const direct = mode.value === "direct";
    get("lambdaDirectMode").hidden = !direct;
    get("lambdaTapeMode").hidden = direct;
  });
  input.addEventListener("input", () => {
    intermediate = undefined;
    normalForm = false;
    steps = 0;
    stop();
    output.value = "";
    report("");
    get("lambdaTapeStatus").textContent = "";
  });
  get("lambdaForm").addEventListener("submit", event => {
    event.preventDefault();
    if (mode.value === "direct") start(false);
    else {
      try { loadMachine(input.value); }
      catch (error) {
        get("lambdaTapeStatus").textContent = error instanceof Error ? error.message : "表达式无法载入。";
        get("lambdaTapeStatus").classList.add("error");
      }
    }
  });
  step.addEventListener("click", () => start(true));
  cancel.addEventListener("click", () => {
    stop();
    report("已取消归约。");
  });
}
