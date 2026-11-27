import { compileMachineLife } from "./life-machine";
import type { MachineProjectFields } from "./project-state";
self.onmessage = ({ data }: MessageEvent<{ source: MachineProjectFields; left: number; right: number }>) => {
  try { self.postMessage({ pattern: compileMachineLife(data.source, data.left, data.right) }); }
  catch (error) { self.postMessage({ error: error instanceof Error ? error.message : "图灵机转换失败。" }); }
};
