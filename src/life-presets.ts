import { emptyLife, type LifePattern } from "./life";
import { parseLife } from "./life-format";

const rle = (body: string) => parseLife(`x = 100, y = 100, rule = B3/S23\n${body}`);
export const lifePresets: Record<string, { name: string; note: string; make(): LifePattern }> = {
  glider: { name: "滑翔机", note: "每 4 代向右下方移动一格。画布外的细胞仍会演化。", make: () => rle("bo$2bo$3o!") },
  blinker: { name: "闪烁器", note: "横向三格与纵向三格交替，周期为 2。", make: () => rle("3o!") },
  beacon: { name: "信标", note: "两个方块相邻的角交替出现和消失，周期为 2。", make: () => rle("2o$2o$2b2o$2b2o!") },
  pulsar: { name: "脉冲星", note: "对称振荡器，周期为 3。", make: () => rle("2b3o3b3o2$o4bobo4bo$o4bobo4bo$o4bobo4bo$2b3o3b3o2$2b3o3b3o$o4bobo4bo$o4bobo4bo$o4bobo4bo2$2b3o3b3o!") },
  gun: { name: "高斯帕滑翔机枪", note: "每 30 代发射一架滑翔机，不需要程序不断补充细胞。", make: () => rle("24bo$22bobo$12b2o6b2o12b2o$11bo3bo4b2o12b2o$2o8bo5bo3b2o$2o8bo3bob2o4bobo$10bo5bo7bo$11bo3bo$12b2o!") },
  rpento: { name: "R 五连块", note: "从 5 个活细胞开始，经过很长的过渡后留下静物、振荡器和滑翔机。", make: () => rle("b2o$2o$bo!") },
  ports: { name: "输入 / 输出 · 滑翔机信号", note: "A=0 时食者吸收滑翔机；点击切为 1 后，信号继续飞向 Y。第 231 代开始，每 60 代采样一次。修改输入后要等待信号传播；端口读数来自实际细胞。", make: () => {
    const pattern = lifePresets.gun.make();
    pattern.cells.push([42, 28], [43, 28], [42, 29], [44, 29], [44, 30], [44, 31], [45, 31]);
    pattern.ports = [
      { id: "in-A", kind: "input", label: "A", x: 42, y: 28, shape: "eater", value: 0 },
      { id: "out-Y", kind: "output", label: "Y", x: 63, y: 49, shape: "glider", value: 0 },
    ];
    pattern.sampling = { start: 231, period: 60 };
    return pattern;
  } },
  empty: { name: "空白画布", note: "使用绘制工具添加细胞；选择输入或输出工具，可以直接在画布上放置端口。", make: emptyLife },
};
