import { describe, expect, it } from "vitest";
import { inputToTape, parseTransitions, Tape, tapeWindowCenter, panFromDragDelta, isHeadInWindow, effectiveTapeScroll, TuringMachine, type MachineDefinition } from "../src/core";

describe("Tape", () => {
  it("reads blank cells and supports negative positions", () => {
    const tape = new Tape("□");
    expect(tape.read(-1)).toBe("□");
    tape.write(-1, "1");
    expect(tape.read(-1)).toBe("1");
    tape.write(-1, "□");
    expect(tape.entries()).toEqual([]);
  });
});

describe("transition parser", () => {
  it("parses rules and rejects duplicate keys", () => {
    expect(parseTransitions("q0,1 -> q1,0,R").transitions[0].direction).toBe("R");
    expect(parseTransitions("q0,1 -> q1,0,R\nq0,1 -> q2,1,L").errors).toHaveLength(1);
  });
});

describe("tape viewport", () => {
  it("can either follow the head or remain centered on zero", () => {
    expect(tapeWindowCenter("follow-head", 14)).toBe(14);
    expect(tapeWindowCenter("fixed-zero", 14)).toBe(0);
    expect(tapeWindowCenter("fixed-zero", -9)).toBe(0);
  });
  it("treats free-drag as centered on zero (initial position at zero)", () => {
    expect(tapeWindowCenter("free-drag", 14)).toBe(0);
    expect(tapeWindowCenter("free-drag", -9)).toBe(0);
  });
});

describe("effectiveTapeScroll", () => {
  it("only applies the panning scroll in free-drag mode", () => {
    expect(effectiveTapeScroll("free-drag", 5)).toBe(5);
    expect(effectiveTapeScroll("free-drag", -3)).toBe(-3);
  });
  it("drops the scroll in every other view mode (deletes cross-mode dragging)", () => {
    expect(effectiveTapeScroll("follow-head", 5)).toBe(0);
    expect(effectiveTapeScroll("fixed-zero", 5)).toBe(0);
  });
});

describe("panFromDragDelta", () => {
  it("converts a leftward drag into a positive scroll (shows larger positions)", () => {
    expect(panFromDragDelta(0, -57, 57)).toBe(1);
  });
  it("converts a rightward drag into a negative scroll (shows smaller positions)", () => {
    expect(panFromDragDelta(0, 57, 57)).toBe(-1);
    expect(panFromDragDelta(0, 120, 57)).toBe(-2);
  });
  it("accumulates on top of the current scroll", () => {
    expect(panFromDragDelta(2, 28, 57)).toBe(2); // round(0.49)=0 → 2-0
    expect(panFromDragDelta(-3, -57, 57)).toBe(-2); // round(-1)=-1 → -3-(-1)
  });
  it("falls back to the start value when pitch is non-positive", () => {
    expect(panFromDragDelta(5, 100, 0)).toBe(5);
  });
  it("rounds to the nearest cell", () => {
    expect(panFromDragDelta(0, 30, 57)).toBe(-1); // round(0.53)=1 → 0-1
    expect(panFromDragDelta(0, -30, 57)).toBe(1); // round(-0.53)=-1 → 0-(-1)
    expect(panFromDragDelta(0, 0, 57)).toBe(0);
  });
});

describe("isHeadInWindow", () => {
  it("treats the window as center±8 (17 cells)", () => {
    expect(isHeadInWindow(0, -8)).toBe(true);
    expect(isHeadInWindow(0, 8)).toBe(true);
    expect(isHeadInWindow(0, 9)).toBe(false);
    expect(isHeadInWindow(0, -9)).toBe(false);
  });
  it("shifts the window with the tape scroll/center", () => {
    expect(isHeadInWindow(10, 2)).toBe(true); // window [2,18], head at lower bound
    expect(isHeadInWindow(10, 18)).toBe(true);
    expect(isHeadInWindow(10, 1)).toBe(false);
  });
});

describe("TuringMachine", () => {
  const unary: MachineDefinition = {
    blankSymbol: "□",
    initialState: "q0",
    acceptStates: [],
    rejectStates: [],
    haltStates: ["HALT"],
    transitions: parseTransitions("q0,1 -> q0,1,R\nq0,□ -> HALT,1,N").transitions,
  };

  it("runs unary increment", () => {
    const machine = new TuringMachine(unary, inputToTape("111", "□"));
    let result;
    do result = machine.step(); while (!result.stopped);
    expect(machine.tape.entries().map(([, symbol]) => symbol).join("")).toBe("1111");
    expect(machine.stepCount).toBe(4);
    expect(result.reason).toBe("halt");
  });

  it("reports a missing transition without changing the tape", () => {
    const machine = new TuringMachine({ ...unary, transitions: [] }, inputToTape("1", "□"));
    expect(machine.step()).toEqual({ stopped: true, reason: "missing-transition" });
    expect(machine.stepCount).toBe(0);
  });

  it("resets the complete runtime configuration to its initial snapshot", () => {
    const machine = new TuringMachine(unary, inputToTape("111", "□"), 0);
    machine.step();
    machine.step();
    expect(machine.stepCount).toBe(2);
    expect(machine.headPosition).not.toBe(0);

    machine.reset();

    expect(machine.currentState).toBe("q0");
    expect(machine.headPosition).toBe(0);
    expect(machine.stepCount).toBe(0);
    expect(machine.tape.entries()).toEqual(inputToTape("111", "□"));
  });
});
