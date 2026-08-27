import { panFromDragDelta } from "./core";

export interface TapeDragOptions {
  /** 读取当前平移格数（tapeScroll）。 */
  getScroll: () => number;
  /** 写入新的整数平移格数；实现方应在此触发纸带重渲染（仅在跨越格边界时变化）。 */
  setScroll: (value: number) => void;
  /** 相邻单元格的像素间距，用于将拖动像素换算为格子数。 */
  getPitch: () => number;
  /**
   * 施加亚格像素偏移（平滑跟手）。传入余数像素值即在两格之间连续平移纸带；
   * 传入 0 即清除偏移、吸附回整格位置。由宿主以 CSS transform 实现。
   */
  applyShift: (pixelOffset: number) => void;
  /** 当前是否允许拖动（仅「随意拖动」模式返回 true）。false 时不会启动拖动。 */
  isEnabled: () => boolean;
}

/**
 * 让纸带元素支持鼠标（及触摸/笔）左右拖动以实现整体平移。
 *
 * 平滑策略：整数格部分由 setScroll 负责（跨边界才重渲染，保证窗口/头部指示正确），
 * 亚格部分由 applyShift 以 CSS transform 连续跟随，松手时 applyShift(0) 吸附到整格。
 */
export function attachTapeDrag(tapeEl: HTMLElement, options: TapeDragOptions): void {
  let dragging = false;
  let startX = 0;
  let startScroll = 0;

  tapeEl.addEventListener("pointerdown", (event) => {
    if (!options.isEnabled()) return;
    dragging = true;
    startX = event.clientX;
    startScroll = options.getScroll();
    tapeEl.classList.add("dragging");
    document.body.classList.add("tape-dragging");
    if (typeof tapeEl.setPointerCapture === "function") {
      try { tapeEl.setPointerCapture(event.pointerId); } catch { /* 某些环境未实现，忽略 */ }
    }
    event.preventDefault();
  });

  tapeEl.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    const pitch = options.getPitch();
    if (pitch <= 0) return;
    const deltaX = event.clientX - startX;
    // 整数格基：跨边界时变化，触发整段重渲染。
    options.setScroll(panFromDragDelta(startScroll, deltaX, pitch));
    // 亚格余数：以 transform 连续跟手，填补两格之间的像素空隙。
    const remainder = deltaX - Math.round(deltaX / pitch) * pitch;
    options.applyShift(remainder);
  });

  const end = () => {
    if (!dragging) return;
    dragging = false;
    // 松手吸附：清除亚格 transform，停在最近整格。
    options.applyShift(0);
    tapeEl.classList.remove("dragging");
    document.body.classList.remove("tape-dragging");
  };

  tapeEl.addEventListener("pointerup", end);
  tapeEl.addEventListener("pointercancel", end);
}
