import { TuringMachine, type MachineDefinition, type StopReason } from "./core";

interface Request { definition: MachineDefinition; initialTape: Array<[number, string]>; maxSteps: number }
interface Frame { step: number; state: string; head: number; cells: Array<[number, string]> }

self.onmessage = (event: MessageEvent<Request>) => {
  const { definition, initialTape, maxSteps } = event.data;
  const machine = new TuringMachine(definition, initialTape);
  const frames: Frame[] = [];
  const sampleEvery = Math.max(1, Math.ceil((maxSteps + 1) / 2400));
  let reason: StopReason | "step-limit" = "step-limit";
  let min = Math.min(0, machine.headPosition), max = Math.max(0, machine.headPosition);
  for (let step = 0; step <= maxSteps; step += 1) {
    const cells = machine.tape.entries();
    if (step % sampleEvery === 0 || step === maxSteps) frames.push({ step, state: machine.currentState, head: machine.headPosition, cells });
    min = Math.min(min, machine.headPosition, ...cells.map(([position]) => position));
    max = Math.max(max, machine.headPosition, ...cells.map(([position]) => position));
    if (step === maxSteps) break;
    const result = machine.step();
    if (step % 250 === 0) self.postMessage({ type: "progress", step, maxSteps });
    if (result.stopped) {
      reason = result.reason!;
      const finalCells = machine.tape.entries();
      if (frames.at(-1)?.step !== step + 1) frames.push({ step: step + 1, state: machine.currentState, head: machine.headPosition, cells: finalCells });
      min = Math.min(min, machine.headPosition, ...finalCells.map(([position]) => position));
      max = Math.max(max, machine.headPosition, ...finalCells.map(([position]) => position));
      break;
    }
  }
  self.postMessage({ type: "complete", frames, min, max, reason });
};
