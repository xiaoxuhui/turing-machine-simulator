import type { ExampleProject } from "./examples";
import { Program } from "./hyperoperation-examples";
import { compileRegisterMachine } from "./register-tm";

/** Generates finite control flow; all arithmetic and comparisons execute on tape. */
class InverseProgram extends Program {
  atLeast(register: number, minimum: number, next: string, invalid: string): string {
    // Callers terminate on invalid, so only the successful branch restores.
    let restore = next;
    for (let count = 0; count < minimum; count++) restore = this.inc(register, restore);
    let entry = restore;
    for (let count = 0; count < minimum; count++) {
      const check = this.label();
      this.dec(check, register, entry, invalid);
      entry = check;
    }
    return entry;
  }

  boundedMultiply(a: number, b: number, output: number, next: string, exceeded: string): string {
    const outer = this.register(), inner = this.register(), scratch = this.register(), budget = this.register();
    const loop = this.label(), add = this.label(), spend = this.label();
    this.dec(spend, budget, this.inc(output, add), exceeded);
    this.dec(add, inner, spend, loop);
    this.dec(loop, outer, this.copy(b, inner, scratch, add), next);
    return this.clear(output, this.copy(1, budget, scratch, this.copy(a, outer, scratch, loop)));
  }

  boundedHyper(rank: number, a: number, b: number, output: number, next: string, exceeded: string): string {
    if (rank === 2) return this.boundedMultiply(a, b, output, next, exceeded);
    const count = this.register(), scratch = this.register(), product = this.register();
    const loop = this.label();
    const replace = this.clear(output, this.move(product, output, loop));
    const calculate = this.boundedHyper(rank - 1, a, output, product, replace, exceeded);
    this.dec(loop, count, calculate, next);
    return this.one(output, this.copy(b, count, scratch, loop));
  }
}

function inverse(rank: number, root: boolean, name: string, operator: string, description: string): ExampleProject {
  const p = new InverseProgram();
  const candidate = p.register(), value = p.register(), scratch = p.register();
  const loop = p.label();
  const accepted = p.copy(candidate, 2, scratch, loop);
  const calculate = p.boundedHyper(rank, root ? candidate : 0, root ? 0 : candidate, value, accepted, "done");
  p.instructions.set(loop, { kind: "jump", next: p.inc(candidate, calculate) });
  let entry = p.clear(2, p.clear(candidate, loop));
  entry = p.atLeast(1, 1, entry, root && rank === 3 ? "done" : "reject");
  entry = p.atLeast(0, root ? 1 : 2, entry, "reject");
  const notes = [
    `# ${name}：向下取整，答案为使正向结果不超过输入值的最大整数。`,
    "# R0 保存次数/底数，R1 保存输入值，R2 保存上一个成功候选；候选从1开始试。",
    "# 根号逐个试底数，对数逐个试指数/高度/次数；对数的0次正向结果为1。",
    "# 每次乘积加一先消耗一格输入值预算；预算用完仍需增加时，立即结束试探并保留上个答案。",
    "# 各计数器的复制、恢复、零值检查和最终清理均由下面的读写头规则完成。",
  ];
  return {
    category: "一进制运算", name, input: `11${operator}11111`, initialState: "BOOT", blankSymbol: "□",
    acceptStates: "", rejectStates: "REJECT", haltStates: "HALT", maxSteps: null,
    description: `${description} 向下取整，默认输入两侧为2和5，输出11。全部用1的数量表示数值，~和@可直接键入。工作区位于左侧，停机后只保留答案；实际纸带计算，默认Max。`,
    rules: notes.join("\n") + "\n" + compileRegisterMachine(p.instructions, entry, p.registers, 2, operator),
  };
}

export const inverseOperationExamples: Record<string, ExampleProject> = {
  unaryRoot: inverse(3, true, "一进制 n 次方根（取整）", "~", "n~x求最大整数a使a^n≤x；n≥1、x≥0。例2~5=2，2~9=3；x=0返回0。"),
  unaryLog: inverse(3, false, "一进制对数（取整）", "@", "a@x求最大整数k使a^k≤x；底数a≥2、x≥1。例2@5=2，2@8=3。"),
  unarySuperRoot: inverse(4, true, "一进制超根号（取整）", "~~", "n~~x求最大整数a使a↑↑n≤x；高度n≥1、x≥1。例2~~5=2，2~~27=3。"),
  unarySuperLog: inverse(4, false, "一进制超对数（取整）", "@@", "a@@x求最大整数高度h使a↑↑h≤x；底数a≥2、x≥1。例2@@5=2，2@@16=3。"),
  unaryPentaRoot: inverse(5, true, "一进制超超根号（取整）", "~~~", "n~~~x求最大整数a使a↑↑↑n≤x；次数n≥1、x≥1。例2~~~5=2，因为2↑↑↑2=4，而3↑↑↑2超过5。"),
  unaryPentaLog: inverse(5, false, "一进制超超对数（取整）", "@@@", "a@@@x求最大整数次数k使a↑↑↑k≤x；底数a≥2、x≥1。例2@@@5=2，2@@@3=1。"),
};
