import type { Direction, Transition } from "./core";
import { formatTransition } from "./rule-format";

// Stack entries share one paper tape. Each entry records its stack and value.
// The newest entry is on the left. A pop leaves a reusable hole at the left edge
// once every entry ahead of it has been removed.
export const stackTapeBlank = "□";

export interface TapeStack {
  name: string;
  values: readonly string[];
}

export class TapeStackProgram {
  private readonly source: Array<string | Transition> = [];
  private readonly states = new Map<string, Transition[]>();
  private readonly returns = new Set<string>();
  private count = 0;
  private readonly origin: string;
  private readonly hole: string;
  private readonly consumed: string;

  constructor(private readonly prefix: string, private readonly code: string, private readonly terminal: string, private readonly reject: string, private readonly shortToken = (value: string) => value) {
    this.origin = `#(${code}.o)#`;
    this.hole = `#(${code}.g)·`;
    this.consumed = `#(${code}.r)×`;
  }

  get start(): string { return `${this.prefix}.start`; }
  get end(): string { return `${this.code}.e`; }
  label(): string { return `${this.code}.${this.count++}`; }

  private rule(from: string, read: string, to: string, write = read, direction: Direction = "N"): void {
    const rule = { fromState: from, readSymbol: read, toState: to, writeSymbol: write, direction };
    this.source.push(rule);
    const state = this.states.get(from);
    if (state) state.push(rule);
    else this.states.set(from, [rule]);
  }

  private entry(stack: TapeStack, value: string): string {
    return `#(${stack.name})${value === " " ? "␠" : this.shortToken(value)}`;
  }

  note(message: string): void { this.source.push(`# ${message}`); }

  jump(from: string, next: string): string {
    this.rule(from, stackTapeBlank, next);
    return from;
  }

  push(stack: TapeStack, value: string, next: string, from = this.label()): string {
    this.rule(from, stackTapeBlank, next, this.entry(stack, value), "L");
    return from;
  }

  take(stack: TapeStack, cases: (value: string) => string, empty: string, from = this.label(), keep = false): string {
    const seek = `${from}.s`;
    this.rule(from, stackTapeBlank, seek, stackTapeBlank, "R");
    this.rule(seek, "", seek, "", "R");
    const backTo = (next: string) => {
      const back = `${next}.b`, trim = `${next}.t`;
      if (!this.returns.has(next)) {
        this.returns.add(next);
        this.rule(back, "", back, "", "L");
        this.rule(back, stackTapeBlank, trim, stackTapeBlank, "R");
        this.rule(trim, "", next, "", "L");
        this.rule(trim, this.hole, trim, stackTapeBlank, "R");
      }
      return back;
    };
    this.rule(seek, this.origin, backTo(empty), this.origin, "L");
    for (const value of stack.values) {
      const entry = this.entry(stack, value);
      this.rule(seek, entry, backTo(cases(value)), keep ? entry : this.hole, "L");
    }
    return from;
  }

  peek(stack: TapeStack, cases: (value: string) => string, empty: string): string {
    return this.take(stack, cases, empty, this.label(), true);
  }

  move(from: TapeStack, to: TapeStack, next: string): string {
    const loop = this.label();
    return this.take(from, value => this.push(to, value, loop), next, loop);
  }

  clear(stack: TapeStack, next: string): string {
    const loop = this.label();
    return this.take(stack, () => loop, next, loop);
  }

  readInput(stack: TapeStack, next: string, rejectUnknown = true): void {
    const scan = `${this.code}.i`, rewind = `${scan}.r`, ready = `${scan}.f`;
    const mark = `${scan}.o`, back = `${scan}.b`;
    this.rule(this.start, "", mark, "", "L");
    this.rule(mark, stackTapeBlank, scan, this.origin, "R");
    if (rejectUnknown) this.rule(scan, "", this.reject);
    this.rule(scan, this.consumed, scan, this.consumed, "R");
    this.rule(scan, stackTapeBlank, rewind, stackTapeBlank, "L");
    this.rule(rewind, this.consumed, rewind, stackTapeBlank, "L");
    this.rule(rewind, this.origin, ready, this.origin, "L");
    this.rule(ready, "", ready, "", "L");
    this.rule(ready, stackTapeBlank, next);
    for (const [index, value] of stack.values.entries()) {
      const put = `${scan}.${index}`;
      this.rule(scan, value, put, this.consumed, "L");
      if (value === " ") {
        for (const space of ["\u3000", "\u00a0", "\t"]) this.rule(scan, space, put, this.consumed, "L");
      }
      this.rule(put, "", put, "", "L");
      this.rule(put, stackTapeBlank, back, this.entry(stack, value), "R");
    }
    this.rule(back, "", back, "", "R");
    this.rule(back, this.origin, scan, this.origin, "R");
  }

  // Append a character to the result on the right of the origin, then resume at the left edge.
  emit(value: string, next: string): string {
    const from = this.label(), seek = `${from}.os`, end = `${from}.oe`, back = `${from}.ob`;
    this.rule(from, stackTapeBlank, seek, stackTapeBlank, "R");
    this.rule(seek, "", seek, "", "R");
    this.rule(seek, this.origin, end, this.origin, "R");
    this.rule(end, "", end, "", "R");
    this.rule(end, stackTapeBlank, back, value, "L");
    this.rule(back, "", back, "", "L");
    const resume = `${next}.or`;
    this.rule(back, this.origin, resume, this.origin, "L");
    if (!this.returns.has(resume)) {
      this.returns.add(resume);
      this.rule(resume, "", resume, "", "L");
      this.rule(resume, stackTapeBlank, next);
    }
    return from;
  }

  finish(): string {
    const clean = `${this.code}.c`;
    this.rule(this.end, stackTapeBlank, clean, stackTapeBlank, "R");
    this.rule(clean, "", clean, stackTapeBlank, "R");
    this.rule(clean, this.origin, this.terminal, stackTapeBlank, "R");
    // Merge states only if every read, write, move and destination agrees.
    // Begin with the immediate tape effects, then refine by destination class.
    const reachable = new Set([this.start]);
    for (const state of reachable) for (const rule of this.states.get(state) ?? []) reachable.add(rule.toState);
    const blocks = [...this.states].filter(([state]) => reachable.has(state) && state !== this.start);
    const effects = blocks.map(([, rules]) => JSON.stringify(rules.map(rule => [rule.readSymbol, rule.writeSymbol, rule.direction])));
    let classes = new Map<string, number>();
    let count = 0;
    while (true) {
      const bySignature = new Map<string, number>();
      const refined = new Map<string, number>();
      for (const [index, [state, rules]] of blocks.entries()) {
        const signature = effects[index] + JSON.stringify(rules.map(rule => classes.get(rule.toState) ?? (classes.size ? rule.toState : "")));
        if (!bySignature.has(signature)) bySignature.set(signature, bySignature.size);
        refined.set(state, bySignature.get(signature)!);
      }
      classes = refined;
      if (count === bySignature.size) break;
      count = bySignature.size;
    }
    const representatives = new Map<number, string>();
    for (const [state, group] of classes) if (!representatives.has(group)) representatives.set(group, state);
    const name = (state: string) => representatives.get(classes.get(state)!) ?? state;
    return this.source.flatMap(rule => {
      if (typeof rule === "string") return [rule];
      if (!reachable.has(rule.fromState) || name(rule.fromState) !== rule.fromState) return [];
      return [formatTransition({ ...rule, toState: name(rule.toState) })];
    }).join("\n");
  }
}
