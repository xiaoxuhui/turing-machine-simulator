import type { ExampleProject } from "./examples";
import source from "./register-adder.tm?raw";

export const registerAdderExample: ExampleProject = {
  category: "一进制运算",
  name: "寄存器加法器（原稿）",
  description: "用户编写的寄存器加法器，完整保留原稿与所有 L/R/N。输入一进制 m+n，默认 1+11 表示 1+2，输出 111；空白符 0、入口 go、默认 Max。o 定位边界，| 分隔寄存器，X、C1、C| 为工作标记。原稿实测 11+ 输出 1，保留 2,1->3,1,L 的左移行为供继续调试。",
  input: "1+11", initialState: "go", blankSymbol: "0",
  acceptStates: "", rejectStates: "", haltStates: "HALT", maxSteps: null,
  rules: source.trimEnd(),
};
