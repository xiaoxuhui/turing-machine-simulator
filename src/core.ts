export type Direction = "L" | "R" | "N";

export interface Transition {
  fromState: string;
  readSymbol: string;
  toState: string;
  writeSymbol: string;
  direction: Direction;
}

export interface MachineDefinition {
  blankSymbol: string;
  initialState: string;
  acceptStates: string[];
  rejectStates: string[];
  haltStates: string[];
  transitions: Transition[];
}

export interface StepRecord extends Transition {
  step: number;
  headBefore: number;
  headAfter: number;
}

export type StopReason = "accept" | "reject" | "halt" | "missing-transition";

export interface StepResult {
  record?: StepRecord;
  stopped: boolean;
  reason?: StopReason;
}

export class Tape {
  private readonly cells = new Map<number, string>();

  constructor(readonly blankSymbol: string, initial: Array<[number, string]> = []) {
    for (const [position, symbol] of initial) this.write(position, symbol);
  }

  read(position: number): string {
    return this.cells.get(position) ?? this.blankSymbol;
  }

  write(position: number, symbol: string): void {
    if (symbol === this.blankSymbol) this.cells.delete(position);
    else this.cells.set(position, symbol);
  }

  entries(): Array<[number, string]> {
    return [...this.cells.entries()].sort((a, b) => a[0] - b[0]);
  }

  reset(initial: Array<[number, string]> = []): void {
    this.cells.clear();
    for (const [position, symbol] of initial) this.write(position, symbol);
  }

  clone(): Tape {
    return new Tape(this.blankSymbol, this.entries());
  }
}

export class TuringMachine {
  readonly tape: Tape;
  currentState: string;
  headPosition: number;
  stepCount = 0;
  private readonly index = new Map<string, Map<string, Transition>>();
  private readonly initialTape: Array<[number, string]>;
  private readonly initialHeadPosition: number;

  constructor(
    readonly definition: MachineDefinition,
    initialTape: Array<[number, string]>,
    headPosition = 0,
  ) {
    this.initialTape = initialTape.map(([position, symbol]) => [position, symbol]);
    this.initialHeadPosition = headPosition;
    this.tape = new Tape(definition.blankSymbol, this.initialTape);
    this.currentState = definition.initialState;
    this.headPosition = headPosition;
    for (const transition of definition.transitions) {
      let row = this.index.get(transition.fromState);
      if (!row) {
        row = new Map();
        this.index.set(transition.fromState, row);
      }
      if (row.has(transition.readSymbol)) {
        throw new Error(`重复规则：${transition.fromState}, ${transition.readSymbol}`);
      }
      row.set(transition.readSymbol, transition);
    }
  }

  reset(): void {
    this.tape.reset(this.initialTape);
    this.currentState = this.definition.initialState;
    this.headPosition = this.initialHeadPosition;
    this.stepCount = 0;
  }

  private terminalReason(): StopReason | undefined {
    if (this.definition.acceptStates.includes(this.currentState)) return "accept";
    if (this.definition.rejectStates.includes(this.currentState)) return "reject";
    if (this.definition.haltStates.includes(this.currentState)) return "halt";
    return undefined;
  }

  step(): StepResult {
    const terminal = this.terminalReason();
    if (terminal) return { stopped: true, reason: terminal };

    const readSymbol = this.tape.read(this.headPosition);
    const transition = this.index.get(this.currentState)?.get(readSymbol);
    if (!transition) return { stopped: true, reason: "missing-transition" };

    const headBefore = this.headPosition;
    this.tape.write(this.headPosition, transition.writeSymbol);
    if (transition.direction === "L") this.headPosition -= 1;
    if (transition.direction === "R") this.headPosition += 1;
    this.currentState = transition.toState;
    this.stepCount += 1;

    const record: StepRecord = {
      ...transition,
      step: this.stepCount,
      headBefore,
      headAfter: this.headPosition,
    };
    return { record, stopped: Boolean(this.terminalReason()), reason: this.terminalReason() };
  }
}

export interface ParseResult {
  transitions: Transition[];
  errors: string[];
}

export function parseTransitions(source: string): ParseResult {
  const transitions: Transition[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  source.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const match = line.match(/^([^,]+),(.+?)\s*->\s*([^,]+),(.+?),([LRNlrn])$/);
    if (!match) {
      errors.push(`第 ${index + 1} 行格式错误`);
      return;
    }
    const [, fromState, readSymbol, toState, writeSymbol, direction] = match.map((value) => value.trim());
    const transition: Transition = {
      fromState,
      readSymbol,
      toState,
      writeSymbol,
      direction: direction.toUpperCase() as Direction,
    };
    const key = JSON.stringify([fromState, readSymbol]);
    if (seen.has(key)) errors.push(`第 ${index + 1} 行与已有规则重复`);
    else {
      seen.add(key);
      transitions.push(transition);
    }
  });
  return { transitions, errors };
}

export function inputToTape(input: string, blankSymbol: string): Array<[number, string]> {
  return Array.from(input).flatMap((symbol, position) =>
    symbol === blankSymbol ? [] : ([[position, symbol]] as Array<[number, string]>),
  );
}

export type TapeViewMode = "follow-head" | "fixed-zero";

export function tapeWindowCenter(mode: TapeViewMode, headPosition: number): number {
  return mode === "fixed-zero" ? 0 : headPosition;
}
