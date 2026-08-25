import { describe, expect, it } from "vitest";
import { inputToTape, parseTransitions, Tape, tapeWindowCenter, TuringMachine, type MachineDefinition } from "../src/core";

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
