import { describe, expect, it, vi } from "vitest";
import { applySpeed, attachSpeedSync } from "../src/speed-input";

/** 用不依赖 jsdom 的桩元素承接真实监听与设值，验证双向同步逻辑。 */
function makeSpeedStub() {
  const make = () => {
    const listeners: Record<string, (event: any) => void> = {};
    const el: any = {
      value: "5",
      addEventListener: (type: string, fn: (event: any) => void) => { listeners[type] = fn; },
    };
    return { el, listeners };
  };
  const slider = make();
  const number = make();
  const text = { textContent: "" } as any;
  return { els: { slider: slider.el, number: number.el, text }, sliderListeners: slider.listeners, numberListeners: number.listeners };
}

describe("applySpeed / attachSpeedSync", () => {
  it("types into the number box syncs slider and text", () => {
    const { els, numberListeners } = makeSpeedStub();
    attachSpeedSync(els);
    els.number.value = "137";
    numberListeners.input({});
    expect(els.slider.value).toBe("137");
    expect(els.number.value).toBe("137");
    expect(els.text.textContent).toBe("137 步/秒");
  });

  it("dragging the slider syncs the number box and text", () => {
    const { els, sliderListeners } = makeSpeedStub();
    attachSpeedSync(els);
    els.slider.value = "50";
    sliderListeners.input({});
    expect(els.number.value).toBe("50");
    expect(els.text.textContent).toBe("50 步/秒");
  });

  it("clamps out-of-range input to 1000", () => {
    const { els, numberListeners } = makeSpeedStub();
    attachSpeedSync(els);
    els.number.value = "5000";
    numberListeners.input({});
    expect(els.slider.value).toBe("1000");
    expect(els.number.value).toBe("1000");
  });

  it("falls back to lower bound on empty/invalid input without crashing", () => {
    const { els, numberListeners } = makeSpeedStub();
    attachSpeedSync(els);
    els.number.value = "";
    expect(() => numberListeners.input({})).not.toThrow();
    expect(els.slider.value).toBe("1");
  });

  it("programmatic value writes do not cause an infinite loop", () => {
    const { els } = makeSpeedStub();
    // applySpeed 直接设值不应触发 input，否则会递归
    expect(() => applySpeed(els, 300)).not.toThrow();
    expect(els.slider.value).toBe("300");
    expect(els.number.value).toBe("300");
    expect(els.text.textContent).toBe("300 步/秒");
  });
});
