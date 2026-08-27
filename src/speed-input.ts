import { normalizeSpeed } from "./speed";

export interface SpeedSyncElements {
  slider: HTMLInputElement;
  number: HTMLInputElement;
  text: HTMLElement;
}

/**
 * 把任意输入值规范化后，同时同步到滑块、数字输入框与文案三处。
 * 数字输入框与滑块并存：手动输入是滑块的**补充**，不取代滑杆。
 */
export function applySpeed(els: SpeedSyncElements, raw: number): void {
  const speed = normalizeSpeed(raw);
  els.slider.value = String(speed);
  els.number.value = String(speed);
  els.text.textContent = `${speed} 步/秒`;
}

/**
 * 让「目标速度」的滑块与数字输入框双向同步：
 * 任一控件改动都规范化后回填双方（程序化设 .value 不会触发 input 事件，故无死循环）。
 */
export function attachSpeedSync(els: SpeedSyncElements): void {
  els.slider.addEventListener("input", () => applySpeed(els, Number(els.slider.value)));
  els.number.addEventListener("input", () => applySpeed(els, Number(els.number.value)));
}
