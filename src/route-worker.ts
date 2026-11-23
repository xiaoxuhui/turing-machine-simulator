import { TuringMachine, type StopReason } from "./core";
import { expandPositionBounds } from "./route-bounds";
import type { RouteRequest } from "./route-controller";

interface Frame { step: number; state: string; head: number; cells: Array<[number, string]> }

self.onmessage = (event: MessageEvent<RouteRequest>) => {
  try {
    const { definition, initialTape, maxSteps, full = false } = event.data;
    const machine = new TuringMachine(definition, initialTape);
    const symbols = new Set(initialTape.filter(([, symbol]) => symbol !== definition.blankSymbol).map(([, symbol]) => symbol));
    const frames: Frame[] = [];
    const sampleEvery = Math.max(1, Math.ceil((maxSteps + 1) / 2400));
    const states: string[] = [], stateMap = new Map<string, number>();
    const symbolsById = [definition.blankSymbol], symbolMap = new Map([[definition.blankSymbol, 0]]);
    const intern = (value: string, values: string[], ids: Map<string, number>) => {
      if (!ids.has(value)) { ids.set(value, values.length); values.push(value); }
      return ids.get(value)!;
    };
    const heads = full ? [machine.headPosition] : [], stateIds = full ? [intern(machine.currentState, states, stateMap)] : [];
    const columns = new Map<number, { steps: number[]; values: number[] }>();
    if (full) for (const [position, symbol] of machine.tape.entries()) columns.set(position, { steps: [0], values: [intern(symbol, symbolsById, symbolMap)] });
    let reason: StopReason | "step-limit" = "step-limit";
    let bounds = expandPositionBounds({ min: machine.headPosition, max: machine.headPosition }, initialTape.map(([position]) => position));
    for (let step = 0; step <= maxSteps; step += 1) {
      if ((!full && step % sampleEvery === 0) || step === 0 || step === maxSteps) {
        frames.push({ step, state: machine.currentState, head: machine.headPosition, cells: machine.tape.entries() });
      }
      bounds = expandPositionBounds(bounds, [machine.headPosition]);
      if (step === maxSteps) break;
      const result = machine.step();
      if (full && result.record) {
        heads.push(machine.headPosition);
        stateIds.push(intern(machine.currentState, states, stateMap));
        if (result.record.writeSymbol !== result.record.readSymbol) {
          const position = result.record.headBefore;
          const column = columns.get(position) ?? { steps: [], values: [] };
          column.steps.push(machine.stepCount);
          column.values.push(intern(result.record.writeSymbol, symbolsById, symbolMap));
          columns.set(position, column);
        }
      }
      if (result.record && result.record.writeSymbol !== definition.blankSymbol) symbols.add(result.record.writeSymbol);
      if (step % 250 === 0) self.postMessage({ type: "progress", step, maxSteps });
      if (result.stopped) {
        reason = result.reason!;
        const finalCells = machine.tape.entries();
        if (frames.at(-1)?.step !== machine.stepCount) frames.push({ step: machine.stepCount, state: machine.currentState, head: machine.headPosition, cells: finalCells });
        bounds = expandPositionBounds(bounds, [machine.headPosition]);
        break;
      }
    }
    const trace = full ? { heads: new Float64Array(heads), stateIds: new Uint32Array(stateIds), states, symbols: symbolsById,
      columns: [...columns].map(([position, history]) => ({ position, steps: new Float64Array(history.steps), values: new Uint32Array(history.values) })),
    } : undefined;
    self.postMessage({ type: "complete", frames, min: bounds.min, max: bounds.max, reason, symbols: [...symbols], trace });
  } catch (error) {
    self.postMessage({ type: "error", message: error instanceof Error ? error.message : "未知后台错误" });
  }
};
