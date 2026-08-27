import { panFromDragDelta } from "./core";

export interface TapeDragOptions {
  /** 读取当前平移格数（tapeScroll）。 */
  getScroll: () => number;
  /** 写入新的平移格数；实现方应在此触发纸带重渲染。 */
  setScroll: (value: number) => void;
  /** 相邻单元格的像素间距，用于将拖动像素换算为格子数。 */
  getPitch: () => number;
}

/**
 * 让纸带元素支持鼠标（及触摸/笔）左右拖动以实现整体平移。
 * 拖动偏移由调用方以「格数」维护（tapeScroll），本模块只负责把指针手势换算并回写。
 */
export function attachTapeDrag(tapeEl: HTMLElement, options: TapeDragOptions): void {
  let dragging = false;
  let startX = 0;
  let startScroll = 0;

  tapeEl.addEventListener("pointerdown", (event) => {
    dragging = true;
    startX = event.clientX;
    startScroll = options.getScroll();
    tapeEl.classList.add("dragging");
    if (typeof tapeEl.setPointerCapture === "function") {
      try { tapeEl.setPointerCapture(event.pointerId); } catch { /* 某些环境未实现，忽略 */ }
    }
    event.preventDefault();
  });

  tapeEl.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    const deltaX = event.clientX - startX;
    options.setScroll(panFromDragDelta(startScroll, deltaX, options.getPitch()));
  });

  const end = () => {
    if (!dragging) return;
    dragging = false;
    tapeEl.classList.remove("dragging");
  };

  tapeEl.addEventListener("pointerup", end);
  tapeEl.addEventListener("pointercancel", end);
}
