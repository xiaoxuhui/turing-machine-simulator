import { TuringMachine, type MachineDefinition, type StopReason } from "./core";
import { expandPositionBounds } from "./route-bounds";

interface Request { definition: MachineDefinition; initialTape: Array<[number, string]>; maxSteps: number }
interface Frame { step: number; state: string; head: number; cells: Array<[number, string]> }

self.onmessage = (event: MessageEvent<Request>) => {
  try {
    const { definition, initialTape, maxSteps } = event.data;
    const machine = new TuringMachine(definition, initialTape);
    const frames: Frame[] = [];
    const sampleEvery = Math.max(1, Math.ceil((maxSteps + 1) / 2400));
    let reason: StopReason | "step-limit" = "step-limit";
    let bounds = expandPositionBounds({ min: machine.headPosition, max: machine.headPosition }, initialTape.map(([position]) => position));
    for (let step = 0; step <= maxSteps; step += 1) {
      if (step % sampleEvery === 0 || step === maxSteps) {
        frames.push({ step, state: machine.currentState, head: machine.headPosition, cells: machine.tape.entries() });
      }
      bounds = expandPositionBounds(bounds, [machine.headPosition]);
      if (step === maxSteps) break;
      const result = machine.step();
      if (step % 250 === 0) self.postMessage({ type: "progress", step, maxSteps });
      if (result.stopped) {
        reason = result.reason!;
        const finalCells = machine.tape.entries();
        if (frames.at(-1)?.step !== step + 1) frames.push({ step: step + 1, state: machine.currentState, head: machine.headPosition, cells: finalCells });
        bounds = expandPositionBounds(bounds, [machine.headPosition]);
        break;
      }
    }
    self.postMessage({ type: "complete", frames, min: bounds.min, max: bounds.max, reason });
  } catch (error) {
    self.postMessage({ type: "error", message: error instanceof Error ? error.message : "未知后台错误" });
  }
};
