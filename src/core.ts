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

export type TapeViewMode = "follow-head" | "fixed-zero" | "free-drag";

export function tapeWindowCenter(mode: TapeViewMode, headPosition: number): number {
  // free-drag 与 fixed-zero 都以 0 为基准（满足“初始位置在零”），follow-head 跟随读写头。
  return mode === "follow-head" ? headPosition : 0;
}

/**
 * 把鼠标横向拖动距离换算成纸带平移格数（tapeScroll）。
 * 向右拖动 deltaX > 0 → 纸带内容右移 → 显示更小（更负）的位置 → tapeScroll 减小。
 * pitch 为相邻单元格的像素间距，<= 0 时回退为原值以避免除零。
 */
export function panFromDragDelta(startScroll: number, deltaX: number, pitch: number): number {
  if (pitch <= 0) return startScroll;
  return startScroll - Math.round(deltaX / pitch);
}

/** 纸带可视窗口固定为 center±8 共 17 格，判断读写头是否落在窗口内。 */
export function isHeadInWindow(center: number, head: number): boolean {
  return head >= center - 8 && head <= center + 8;
}

/**
 * 平滑跟随所需的初始瞬时位移（像素）。
 * 纸带中心从 fromCenter 变为 toCenter、相邻格间距为 pitch 时，
 * 把新渲染的纸带先瞬时移回旧中心所需的位移 = (toCenter - fromCenter) * pitch。
 * pitch <= 0 时回退为 0，避免除零/异常。
 */
export function headFollowShift(fromCenter: number, toCenter: number, pitch: number): number {
  if (pitch <= 0) return 0;
  return (toCenter - fromCenter) * pitch;
}

/**
 * 纸带平移量是否对当前视角生效。
 * 仅「随意拖动」(free-drag) 模式允许拖动平移；其它视角下返回 0，
 * 从而删除原先“所有视角都能拖动”的行为。
 */
export function effectiveTapeScroll(mode: TapeViewMode, scroll: number): number {
  return mode === "free-drag" ? scroll : 0;
}

/**
 * 跟随读写头模式下，纸带滑动的过渡时长（毫秒），跟随目标速度自适应。
 *
 * 步进节奏由速度决定：单步间隔 ≈ 1000 / 速度(步/秒) 毫秒。固定过渡时长会脱节——
 * 慢速时滑完就干等（像“跳一步”），快速时过渡比间隔还长（积压、刷新不过来）。
 * 这里让时长取单步间隔的约 90%，并夹紧在 [8, 900]：
 * - 慢速(如 1) → 接近整段间隔，连续缓行、无明显停顿；
 * - 快速(如 1000) → 远小于间隔、近乎瞬时，能跟上演进、不积压。
 * speed 非法(0/负/NaN/超范围)时夹紧到 [1,1000]，默认当 1 处理。
 */
export function slideDurationMs(stepsPerSecond: number): number {
  const speed = Math.min(1000, Math.max(1, Number.isFinite(stepsPerSecond) ? stepsPerSecond : 1));
  const interval = 1000 / speed;
  return Math.min(900, Math.max(8, interval * 0.9));
}

