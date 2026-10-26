import { describe, expect, it } from "vitest";
import { inputToTape, parseTransitions, Tape, tapeWindowCenter, panFromDragDelta, isHeadInWindow, effectiveTapeScroll, headFollowShift, slideDurationMs, TuringMachine, type MachineDefinition } from "../src/core";

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

describe("headFollowShift", () => {
  it("produces a +pitch shift when the head moves one cell right", () => {
    expect(headFollowShift(0, 1, 58)).toBe(58);
  });
  it("produces a negative shift when the head moves left", () => {
    expect(headFollowShift(5, 3, 60)).toBe(-120);
  });
  it("is zero when the center does not change", () => {
    expect(headFollowShift(4, 4, 58)).toBe(0);
  });
  it("falls back to zero for a non-positive pitch", () => {
    expect(headFollowShift(0, 10, 0)).toBe(0);
  });
});

describe("slideDurationMs", () => {
  it("spreads the slide across most of the step interval at slow speed", () => {
    expect(slideDurationMs(1)).toBe(900); // interval 1000 -> 900, capped
  });
  it("uses ~90% of the interval at default speed", () => {
    expect(slideDurationMs(5)).toBe(180); // interval 200 -> 180
  });
  it("shrinks with the interval at medium speed", () => {
    expect(slideDurationMs(10)).toBe(90); // interval 100 -> 90
  });
  it("keeps up at high speed without exceeding the interval", () => {
    expect(slideDurationMs(100)).toBe(9); // interval 10 -> 9
  });
  it("floors to the 8ms minimum at extreme speed", () => {
    expect(slideDurationMs(1000)).toBe(8); // interval 1 -> 0.9 -> clamped to 8
  });
  it("treats invalid speeds as 1 step/sec (900ms)", () => {
    expect(slideDurationMs(0)).toBe(900);
    expect(slideDurationMs(-3)).toBe(900);
    expect(slideDurationMs(NaN)).toBe(900);
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
