import type { ExampleProject } from "./examples";

// Standard notation: write / direction / next state; Z is the halting state.
// Tables: https://wiki.bbchallenge.org/wiki/BB(3), /BB(4), /BB(2,3)
// 2x4 original researchers: https://www.sligocki.com/2024/08/27/bb-2-4-proven.html
function beaver(name: string, description: string, table: string, long = false): ExampleProject {
  const rules = table.split("_").flatMap((row, stateIndex) => {
    const state = String.fromCharCode(65 + stateIndex);
    return row.match(/\d[LR][A-Z]/g)!.map((instruction, read) =>
      `${state},${read} -> ${instruction[2] === "Z" ? "HALT" : instruction[2]},${instruction[0]},${instruction[1]}`,
    );
  }).join("\n");
  return {
    name, category: "忙碌海狸", description: `从全 0 空纸带出发，状态数不含停机态，符号数含空白 0。${description}`,
    input: "", initialState: "A", blankSymbol: "0", acceptStates: "", rejectStates: "", haltStates: "HALT", rules,
    ...(long ? { maxSteps: null } : {}),
  };
}

export const busyBeaverExamples: Record<string, ExampleProject> = {
  beaver3Steps: beaver("3 状态 2 符号忙碌海狸（步数冠军）", "运行 21 步，留下 5 个 1。", "1RB1RZ_1LB0RC_1LC1LA"),
  beaver3Ones: beaver("3 状态 2 符号忙碌海狸（写 1 冠军）", "运行 14 步，留下 6 个 1。它与步数冠军不是同一台机器。", "1RB1RZ_0RC1RB_1LC1LA"),
  beaver4: beaver("4 状态 2 符号忙碌海狸", "运行 107 步，留下 13 个 1。", "1RB1LB_1LA0LC_1RZ1LD_1RD0RA"),
  beaver23: beaver("2 状态 3 符号忙碌海狸", "字母表 0、1、2，运行 38 步，留下 9 个非空格。", "1RB2LB1RZ_2LA2RB1LB"),
  beaver24: beaver("2 状态 4 符号忙碌海狸（长运行）", "字母表 0、1、2、3，运行 3,932,964 步，留下 2050 个非空格；自动开启 Max，在 1000 步/秒下约需 66 分钟。", "1RB2LA1RA1RA_1LB1LA3RB1RZ", true),
};
