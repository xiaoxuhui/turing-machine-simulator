import { compileToRule110, type Compiled110 } from "./rule110-compiler";
import { packWords, unpackWords, type PackedWords } from "./rule110-word";
import { rule110Rows } from "./rule110";
import type { MachineProjectFields } from "./project-state";
import { exportRule110Macrocell, exportRule110Rle } from "./rule110-golly";

interface Request { id: number; type: "compile" | "preview" | "golly"; mode?: "macrocell" | "rle"; topology?: "unbounded" | "cylinder"; project?: MachineProjectFields; packed?: PackedWords; origin?: string; width?: number; steps?: number }
let current: Pick<Compiled110, "left" | "center" | "right"> | undefined;
self.addEventListener("message", (event: MessageEvent<Request>) => {
  const request = event.data;
  try {
    if (request.type === "compile") {
      const compiled = compileToRule110(request.project!, text => self.postMessage({ id: request.id, type: "progress", text }));
      current = compiled;
      self.postMessage({ id: request.id, type: "compiled", packed: packWords([compiled.left, compiled.center, compiled.right]), stats: compiled.stats, source: compiled.source });
    } else {
      if (request.packed) { const [left, center, right] = unpackWords(request.packed); current = { left, center, right }; }
      if (!current) throw new Error("请先转换或导入规则 110 配置。");
      const width = request.width!, steps = request.steps!, origin = BigInt(request.origin!);
      if (request.type === "golly") {
        self.postMessage({ id: request.id, type: "progress", text: "正在后台生成 Golly W110 图案……" });
        const exported = (request.mode === "rle" ? exportRule110Rle : exportRule110Macrocell)(current, { origin, width, steps, topology: request.topology });
        self.postMessage({ id: request.id, type: "golly", ...exported }); return;
      }
      let time = 0, batch: Uint8Array[] = [];
      for (const row of rule110Rows(current, origin, width, steps)) {
        batch.push(row);
        if (batch.length === 32 || time === steps) {
          const start = time - batch.length + 1, rows = batch; batch = [];
          self.postMessage({ id: request.id, type: "rows", start, rows });
        }
        time++;
      }
      self.postMessage({ id: request.id, type: "previewed", rows: time });
    }
  } catch (error) { self.postMessage({ id: request.id, type: "error", text: error instanceof Error ? error.message : "转换或预览失败。" }); }
});
