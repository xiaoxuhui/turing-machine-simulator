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

describe("attachTapeDrag", () => {
  it("pans left on a leftward drag and toggles the dragging class", () => {
    const { el, listeners, classes } = makeTapeStub();
    let scroll = 0;
    attachTapeDrag(el, {
      getScroll: () => scroll,
      setScroll: (v) => { scroll = v; },
      getPitch: () => 57,
    });

    listeners.pointerdown({ clientX: 500, pointerId: 1, preventDefault: () => {} });
    expect(classes.has("dragging")).toBe(true);

    listeners.pointermove({ clientX: 443, pointerId: 1 }); // Δx=-57 → scroll +1
    expect(scroll).toBe(1);
    listeners.pointermove({ clientX: 386, pointerId: 1 }); // 累计 Δx=-114 → scroll +2
    expect(scroll).toBe(2);

    listeners.pointerup({ pointerId: 1 });
    expect(classes.has("dragging")).toBe(false);
  });

  it("pans right (negative scroll) on a rightward drag", () => {
    const { el, listeners } = makeTapeStub();
    let scroll = 0;
    attachTapeDrag(el, {
      getScroll: () => scroll,
      setScroll: (v) => { scroll = v; },
      getPitch: () => 57,
    });
    listeners.pointerdown({ clientX: 500, pointerId: 1, preventDefault: () => {} });
    listeners.pointermove({ clientX: 557, pointerId: 1 }); // Δx=+57 → scroll -1
    expect(scroll).toBe(-1);
  });

  it("ignores pointer moves that happen before pointerdown", () => {
    const { el, listeners } = makeTapeStub();
    let scroll = 0;
    attachTapeDrag(el, {
      getScroll: () => scroll,
      setScroll: (v) => { scroll = v; },
      getPitch: () => 57,
    });
    listeners.pointermove({ clientX: 100, pointerId: 1 });
    expect(scroll).toBe(0);
  });

  it("clears the dragging flag on pointercancel", () => {
    const { el, listeners, classes } = makeTapeStub();
    let scroll = 0;
    attachTapeDrag(el, {
      getScroll: () => scroll,
      setScroll: (v) => { scroll = v; },
      getPitch: () => 57,
    });
    listeners.pointerdown({ clientX: 500, pointerId: 1, preventDefault: () => {} });
    listeners.pointercancel({ pointerId: 1 });
    expect(classes.has("dragging")).toBe(false);
  });

  it("toggles the global body.tape-dragging class during a drag", () => {
    const { el, listeners } = makeTapeStub();
    let scroll = 0;
    attachTapeDrag(el, {
      getScroll: () => scroll,
      setScroll: (v) => { scroll = v; },
      getPitch: () => 57,
    });
    expect(bodyClasses.has("tape-dragging")).toBe(false);
    listeners.pointerdown({ clientX: 500, pointerId: 1, preventDefault: () => {} });
    expect(bodyClasses.has("tape-dragging")).toBe(true);
    listeners.pointerup({ pointerId: 1 });
    expect(bodyClasses.has("tape-dragging")).toBe(false);
  });
});
