import { describe, expect, it, vi } from "vitest";
import { attachTapeDrag } from "../src/tape-drag";

/** 用一个不依赖 jsdom 的桩对象承接真实事件回调，从而验证交互连线。 */
const bodyClasses = new Set<string>();
// attachTapeDrag 在拖动期间会给 document.body 加 tape-dragging 类（全局光标兜底）。
(globalThis as any).document = {
  body: {
    classList: {
      add: (c: string) => bodyClasses.add(c),
      remove: (c: string) => bodyClasses.delete(c),
      contains: (c: string) => bodyClasses.has(c),
    },
  },
};

function makeTapeStub() {
  const listeners: Record<string, (event: any) => void> = {};
  const classes = new Set<string>();
  const el: any = {
    addEventListener: (type: string, fn: (event: any) => void) => { listeners[type] = fn; },
    classList: {
      add: (c: string) => classes.add(c),
      remove: (c: string) => classes.delete(c),
      contains: (c: string) => classes.has(c),
    },
    setPointerCapture: vi.fn(),
  };
  return { el, listeners, classes };
}

/** 标准 options 工厂：enabled 默认 true，applyShift 可被断言。 */
function baseOptions(extra: Partial<{ scroll: number; enabled: boolean }> = {}) {
  let scroll = extra.scroll ?? 0;
  const enabled = extra.enabled ?? true;
  const applyShift = vi.fn();
  const setScroll = vi.fn((v: number) => { scroll = v; });
  return {
    opts: {
      getScroll: () => scroll,
      setScroll,
      getPitch: () => 57,
      applyShift,
      isEnabled: () => enabled,
    },
    getScroll: () => scroll,
    setScroll,
    applyShift,
  };
}

describe("attachTapeDrag", () => {
  it("pans left on a leftward drag and toggles the dragging class", () => {
    const { el, listeners, classes } = makeTapeStub();
    const { opts } = baseOptions();
    attachTapeDrag(el, opts);

    listeners.pointerdown({ clientX: 500, pointerId: 1, preventDefault: () => {} });
    expect(classes.has("dragging")).toBe(true);

    listeners.pointermove({ clientX: 443, pointerId: 1 }); // Δx=-57 → scroll +1
    expect(opts.getScroll()).toBe(1);
    listeners.pointermove({ clientX: 386, pointerId: 1 }); // 累计 Δx=-114 → scroll +2
    expect(opts.getScroll()).toBe(2);

    listeners.pointerup({ pointerId: 1 });
    expect(classes.has("dragging")).toBe(false);
  });

  it("pans right (negative scroll) on a rightward drag", () => {
    const { el, listeners } = makeTapeStub();
    const { opts } = baseOptions();
    attachTapeDrag(el, opts);
    listeners.pointerdown({ clientX: 500, pointerId: 1, preventDefault: () => {} });
    listeners.pointermove({ clientX: 557, pointerId: 1 }); // Δx=+57 → scroll -1
    expect(opts.getScroll()).toBe(-1);
  });

  it("applies a smooth sub-cell transform between cells", () => {
    const { el, listeners } = makeTapeStub();
    const { opts, applyShift } = baseOptions();
    attachTapeDrag(el, opts);
    listeners.pointerdown({ clientX: 500, pointerId: 1, preventDefault: () => {} });
    // Δx=-30（pitch=57）→ 取整到最近格 scroll+1，亚格余数 +27
    listeners.pointermove({ clientX: 470, pointerId: 1 });
    expect(opts.getScroll()).toBe(1);
    expect(applyShift).toHaveBeenCalledWith(27);
  });

  it("clears the transform on release to snap back to a whole cell", () => {
    const { el, listeners } = makeTapeStub();
    const { opts, applyShift } = baseOptions();
    attachTapeDrag(el, opts);
    listeners.pointerdown({ clientX: 500, pointerId: 1, preventDefault: () => {} });
    listeners.pointermove({ clientX: 470, pointerId: 1 }); // 亚格 27
    listeners.pointerup({ pointerId: 1 });
    expect(applyShift).toHaveBeenLastCalledWith(0); // 松手吸附
  });

  it("does not start a drag when disabled (non free-drag mode)", () => {
    const { el, listeners, classes } = makeTapeStub();
    const { opts, setScroll, applyShift } = baseOptions({ enabled: false });
    attachTapeDrag(el, opts);
    listeners.pointerdown({ clientX: 500, pointerId: 1, preventDefault: () => {} });
    expect(classes.has("dragging")).toBe(false);
    listeners.pointermove({ clientX: 443, pointerId: 1 });
    expect(setScroll).not.toHaveBeenCalled();
    expect(applyShift).not.toHaveBeenCalled();
  });

  it("ignores pointer moves that happen before pointerdown", () => {
    const { el, listeners } = makeTapeStub();
    const { opts } = baseOptions();
    attachTapeDrag(el, opts);
    listeners.pointermove({ clientX: 100, pointerId: 1 });
    expect(opts.getScroll()).toBe(0);
  });

  it("clears the dragging flag and transform on pointercancel", () => {
    const { el, listeners, classes } = makeTapeStub();
    const { opts, applyShift } = baseOptions();
    attachTapeDrag(el, opts);
    listeners.pointerdown({ clientX: 500, pointerId: 1, preventDefault: () => {} });
    listeners.pointercancel({ pointerId: 1 });
    expect(classes.has("dragging")).toBe(false);
    expect(applyShift).toHaveBeenLastCalledWith(0);
  });

  it("toggles the global body.tape-dragging class during a drag", () => {
    const { el, listeners } = makeTapeStub();
    const { opts } = baseOptions();
    attachTapeDrag(el, opts);
    expect(bodyClasses.has("tape-dragging")).toBe(false);
    listeners.pointerdown({ clientX: 500, pointerId: 1, preventDefault: () => {} });
    expect(bodyClasses.has("tape-dragging")).toBe(true);
    listeners.pointerup({ pointerId: 1 });
    expect(bodyClasses.has("tape-dragging")).toBe(false);
  });
});
