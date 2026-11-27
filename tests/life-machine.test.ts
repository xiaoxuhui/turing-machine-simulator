import { describe, expect, it } from "vitest";
import { LifeWorld, type LifeReading } from "../src/life";
import { FastLifeWorld } from "../src/life-fast";
import { lifePresets } from "../src/life-presets";
import { compileMachineLife, machineLifeCircuit, readLifeMachine } from "../src/life-machine";
import { lifeJSON, lifeRLE, parseLife } from "../src/life-format";
import type { MachineProjectFields } from "../src/project-state";
import type { LifeExpression } from "../src/vendor/life-circuit.js";

const source = (rules: string, input = ""): MachineProjectFields => ({ rules, input, blankSymbol: "_", initialState: "q0", haltStates: "H", acceptStates: "T", rejectStates: "F" });
const points = (world: LifeWorld) => world.points().map(p => p.join(",")).sort();

describe("HashLife remains pure B3/S23", () => {
  it("matches the independent sparse engine across fast jumps and edits outside the original universe", () => {
    const pattern = lifePresets.rpento.make(), fast = new FastLifeWorld(pattern), sparse = new LifeWorld(pattern);
    for (const n of [1, 13, 48, 99]) {
      for (let i = 0; i < n; i++) sparse.step(); fast.advance(n);
      expect(points(fast)).toEqual(points(sparse));
      fast.set(-1000, 1200, true); sparse.set(-1000, 1200, true);
    }
    expect(fast.generation).toBe(sparse.generation);
  });
});

describe("Turing machine to physical Life circuits", () => {
  it("builds logic for writes and both movement directions without executing the input program", () => {
    const { circuit, machine } = machineLifeCircuit(source("q0,_->q0,1,R\nq0,1->H,_,L"), -1, 1);
    let values = new Map(circuit.registers.map(r => [r.delayId!, r.defaultValue!]));
    const clock = () => {
      const cache = new Map<number, number>();
      const evaluate = (node: LifeExpression): number => {
        if (cache.has(node.id)) return cache.get(node.id)!;
        const args = node.args?.map(evaluate) ?? [];
        const value = node.delayId ? values.get(node.delayId)! : node.value ?? (node.op === "AND" ? Number(args.every(Boolean)) : node.op === "OR" ? Number(args.some(Boolean)) : Number(!args[0]));
        cache.set(node.id, value); return value;
      };
      values = new Map(circuit.outputs.map(o => [o.delayId!, evaluate(o.expression)]));
    };
    const decode = () => readLifeMachine({ ...machine, period: 100 }, { generation: 0, values: Object.fromEntries(values) as LifeReading["values"] })!;
    expect(decode()).toMatchObject({ state: "q0", head: 0, tape: ["_", "_", "_"], status: "运行中" });
    clock(); expect(decode()).toMatchObject({ state: "q0", head: 1, tape: ["_", "1", "_"], status: "运行中" });
    clock(); expect(decode()).toMatchObject({ head: 1, tape: ["_", "1", "_"], status: "空间不足" });
  });
  it("performs a complete write-and-halt through actual B3/S23 generations and freezes the machine registers", () => {
    const pattern = compileMachineLife(source("q0,_->H,1,N"), 0, 0), world = new FastLifeWorld(pattern);
    const read = () => readLifeMachine(pattern.machine!, { generation: world.generation, values: Object.fromEntries(pattern.ports.map(p => [p.id, world.read(p)])) })!;
    expect(read()).toMatchObject({ state: "q0", head: 0, tape: ["_"], status: "运行中", step: 0 });
    world.advance(pattern.machine!.period);
    expect(read()).toMatchObject({ state: "H", head: 0, tape: ["1"], status: "停机", step: 1 });
    world.advance(pattern.machine!.period);
    expect(read()).toMatchObject({ state: "H", head: 0, tape: ["1"], status: "停机", step: 2 });
    expect(pattern.cells.length).toBeGreaterThan(1000);
  }, 60_000);
  it("physically reports out-of-space independently from halt and preserves the tape", () => {
    const pattern = compileMachineLife(source("q0,_->q0,1,L"), 0, 0), world = new FastLifeWorld(pattern);
    world.advance(pattern.machine!.period);
    const reading = { generation: world.generation, values: Object.fromEntries(pattern.ports.map(p => [p.id, world.read(p)])) };
    expect(readLifeMachine(pattern.machine!, reading)).toMatchObject({ state: "q0", tape: ["_"], status: "空间不足" });
  }, 60_000);
  it("retains physical register coordinates and machine decoding through JSON and Golly RLE", () => {
    const pattern = compileMachineLife(source("q0,_->T,1,N"), 0, 0);
    for (const encoded of [lifeJSON(pattern), lifeRLE(pattern)]) {
      const decoded = parseLife(encoded);
      expect(decoded.machine).toEqual(pattern.machine); expect(decoded.ports).toEqual(pattern.ports);
      expect(decoded.cells.length).toBe(pattern.cells.length);
    }
  });
  it("supports function expansion, wildcards, missing rules and terminal priorities", () => {
    const { machine } = machineLifeCircuit({ ...source("write(s,done):\n    s,->done,1,*\nwrite->T"), initialState: "" }, 0, 0);
    expect(machine.states).toContain("T");
    expect(machine.terminal[machine.states.indexOf("T")]).toBe("accept");
    expect(machine.rules[0].every(Boolean)).toBe(true);
    expect(() => machineLifeCircuit(source("q0,_->H,1,N", "111"), 0, 1)).toThrow("初始输入超出");
    expect(() => machineLifeCircuit(source("bad"), 0, 0)).toThrow();
    expect(() => machineLifeCircuit(source("q0,_->H,1,N"), 1, 3)).toThrow("包含位置 0");
  });
  it.each(["T", "F"])("physically moves right, writes, moves left and enters %s", terminal => {
    const pattern = compileMachineLife(source(`q0,1->q1,1,R\nq1,_->${terminal},1,L`, "1"), 0, 1), world = new FastLifeWorld(pattern);
    const read = () => readLifeMachine(pattern.machine!, { generation: world.generation, values: Object.fromEntries(pattern.ports.map(p => [p.id, world.read(p)])) })!;
    world.advance(pattern.machine!.period); expect(read()).toMatchObject({ state: "q1", head: 1, tape: ["1", "_"] });
    world.advance(pattern.machine!.period); expect(read()).toMatchObject({ state: terminal, head: 0, tape: ["1", "1"], status: terminal === "T" ? "接受" : "拒绝" });
  }, 60_000);
});
