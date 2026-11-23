import type { ExampleProject } from "./examples";
import { stackTapeBlank, TapeStackProgram, type TapeStack } from "./tape-stack-program";

const bits = ["0", "1"] as const;
const reject = "REJECT";

// Each arithmetic stack has its least significant bit on top unless explicitly reversed.
class BinaryProgram extends TapeStackProgram {
  constructor() { super("binary", "B", "HALT", reject); }

  readonly numericStateSections: Record<string, string> = {
    "binary.start": "1.1", "B.i": "1.1", "B.e": "3.2", "B.c": "3.2",
  };
  private numericSection = "2";

  override label(): string {
    const name = super.label();
    this.numericStateSections[name] = this.numericSection;
    return name;
  }

  inSection<T>(section: string, build: () => T): T {
    const previous = this.numericSection;
    this.numericSection = section;
    try { return build(); }
    finally { this.numericSection = previous; }
  }

  digits(name = this.label(), meaning = "临时二进制数位"): TapeStack {
    const stack = { name, values: bits };
    this.describeStack(stack, meaning);
    return stack;
  }

  copy(source: TapeStack, target: TapeStack, next: string): string {
    const reverse = this.digits(undefined, `复制 ${source.name} 时的反转暂存；随后恢复源并生成 ${target.name} 副本`);
    const loop = this.label();
    this.take(reverse, bit => this.push(source, bit, this.push(target, bit, loop)), next, loop);
    return this.describe(this.move(source, reverse, loop), `复制 ${source.name} 到 ${target.name}：先暂存再双写，源数最终恢复，不会被消耗。`);
  }

  transfer(source: TapeStack, target: TapeStack, next: string): string {
    const reverse = this.digits(undefined, `从 ${source.name} 搬到 ${target.name} 时的顺序恢复区`);
    return this.describe(this.move(source, reverse, this.move(reverse, target, next)), `搬运 ${source.name} 到 ${target.name}：反转两次，数位顺序保持不变；源区被消耗。`);
  }

  hasOne(source: TapeStack, yes: string, no: string, skipLowBit = false): string {
    const saved = this.digits(), check = this.label();
    const found = this.move(saved, source, yes);
    this.take(source, bit => this.push(saved, bit, bit === "1" ? found : check), this.move(saved, source, no), check);
    return skipLowBit ? this.take(source, bit => this.push(saved, bit, check), no) : check;
  }

  // Consume both operands. The finite control holds only one carry or borrow bit.
  combine(left: TapeStack, right: TapeStack, output: TapeStack, subtract: boolean, next: string, negative = reject, section?: string): string {
    const reversed = this.digits(undefined, `${subtract ? "减法" : "加法"}本轮结果位；按低位到高位生成，稍后反转成可继续运算的顺序`);
    const build = <T>(part: number, action: () => T) => section ? this.inSection(`${section}.${part}`, action) : action();
    const plain = build(1, () => this.label()), carried = build(2, () => this.label());
    this.describe(plain, `本轮没有${subtract ? "借位" : "进位"}（c=0），先取 ${left.name} 的最低位。`);
    this.describe(carried, `本轮带着上一低位的${subtract ? "借位" : "进位"}（c=1），先取 ${left.name} 的最低位。`);
    const done = build(3, () => this.move(reversed, output, next));
    const overflow = build(3, () => subtract ? this.clear(reversed, negative) : this.push(reversed, "1", done));
    for (const [carry, from] of [plain, carried].entries()) {
      const digit = (a: number, b: number) => {
        const value = subtract ? a - b - carry : a + b + carry;
        const bit = value & 1, carriedNext = value < 0 || value > 1;
        return this.describe(this.push(reversed, String(bit), carriedNext ? carried : plain),
          subtract ? `本轮已知左位 ${a}、右位 ${b}、借位 ${carry}：${a}−${b}−${carry}=${value}。${value < 0 ? "不足，借 2" : "不必借位"}，本位写 ${bit}，下一高位借位 ${Number(carriedNext)}。`
            : `本轮已知左位 ${a}、右位 ${b}、进位 ${carry}：${a}+${b}+${carry}=${value}。本位写 ${bit}，下一高位进位 ${Number(carriedNext)}。`);
      };
      build(carry + 1, () => {
        const missingLeft = this.take(right, bit => digit(0, Number(bit)), carry ? overflow : done);
        this.describe(missingLeft, `左操作数 ${left.name} 已读完，高位补 0；${subtract ? "借位" : "进位"}仍为 ${carry}，继续检查右操作数 ${right.name}。`);
        this.take(left, bit => this.describe(
          this.take(right, other => digit(Number(bit), Number(other)), digit(Number(bit), 0)),
          `本轮左位已经读到 ${bit}，${subtract ? "借位" : "进位"}为 ${carry}；现在取右操作数 ${right.name} 的对应位，右边读完则当 0。`,
        ), missingLeft, from);
      });
    }
    return plain;
  }

  multiply(left: TapeStack, right: TapeStack, result: TapeStack, next: string): string {
    const copy = this.digits(), sum = this.digits(), loop = this.label();
    const shift = this.push(left, "0", loop);
    const add = this.combine(result, copy, sum, false, this.transfer(sum, result, shift));
    return this.take(right, bit => bit === "1" ? this.copy(left, copy, add) : shift, next, loop);
  }

  power(base: TapeStack, exponent: TapeStack, result: TapeStack, next: string): string {
    const incoming = this.digits(), currentBit = this.digits(), product = this.digits();
    const loop = this.label();
    const multiplyResult = (factor: TapeStack, resume: string) => {
      const copy = this.digits();
      const replace = this.clear(result, this.transfer(product, result, resume));
      return this.copy(factor, copy, this.multiply(result, copy, product, replace));
    };
    // Reading the exponent from left to right doubles the accumulated exponent,
    // then adds the incoming bit. Squaring and multiplying implement those operations.
    const multiplyByBase = multiplyResult(base, loop);
    const finishBit = this.take(currentBit, bit => bit === "1" ? multiplyByBase : loop, next);
    const square = multiplyResult(result, finishBit);
    return this.push(result, "1", this.move(exponent, incoming,
      this.take(incoming, bit => this.push(currentBit, bit, square), next, loop)));
  }

  // Binary long division. Consume the dividend from the most significant end.
  // Try remainder - divisor after appending each bit. Its sign gives the next quotient bit.
  divide(dividend: TapeStack, divisor: TapeStack, quotient: TapeStack, next: string): string {
    const incoming = this.digits(), remainder = this.digits();
    const remainderCopy = this.digits(), divisorCopy = this.digits(), difference = this.digits();
    const loop = this.label();
    const success = this.clear(remainder, this.transfer(difference, remainder, this.push(quotient, "1", loop)));
    const failure = this.push(quotient, "0", loop);
    const subtract = this.combine(remainderCopy, divisorCopy, difference, true, success, failure);
    const test = this.copy(remainder, remainderCopy, this.copy(divisor, divisorCopy, subtract));
    this.take(incoming, bit => this.push(remainder, bit, test), this.clear(remainder, next), loop);
    return this.move(dividend, incoming, loop);
  }

  logarithm(base: TapeStack, value: TapeStack, result: TapeStack, next: string): string {
    const quotient = this.digits(), one = this.digits(), sum = this.digits();
    const loop = this.label();
    const increment = this.push(one, "1", this.combine(result, one, sum, false, this.transfer(sum, result, loop)));
    const test = this.hasOne(quotient, this.transfer(quotient, value, increment), next);
    this.jump(loop, this.divide(value, base, quotient, test));
    return this.hasOne(base, this.hasOne(value, loop, reject), reject, true);
  }

  print(result: TapeStack): string {
    const reversed = this.digits(), write = this.label(), first = this.label();
    this.take(reversed, bit => this.emit(bit, write), this.end, write);
    this.take(reversed, bit => bit === "0" ? first : this.emit(bit, write), this.emit("0", this.end), first);
    this.describe(first, "输出的第一位尚未确定：跳过前导 0，首次遇到 1 才开始输出；若全为 0，输出单个 0。");
    this.describe(write, "已输出第一个有效位，后面的 0 也必须保留，不能再当成前导零略过。");
    return this.move(result, reversed, first);
  }

  readOperands(operator: string, left: TapeStack, right: TapeStack, next: string): void {
    const raw = { name: "I", values: [...bits, operator] };
    const input = { ...raw, name: "S" };
    this.describeStack(raw, "原始输入字符，含运算符；刚搬入时顺序与输入相反");
    this.describeStack(input, "恢复从高位到低位顺序后的输入流，等待按运算符分开");
    const startRight = this.label(), readRight = this.label();
    this.take(input, bit => bit === operator ? reject : this.push(right, bit, readRight), next, readRight);
    this.take(input, bit => bit === operator ? reject : this.push(right, bit, readRight), reject, startRight);
    const startLeft = this.label(), readLeft = this.label();
    this.take(input, bit => bit === operator ? startRight : this.push(left, bit, readLeft), reject, readLeft);
    this.take(input, bit => bit === operator ? reject : this.push(left, bit, readLeft), reject, startLeft);
    this.readInput(raw, this.move(raw, input, startLeft), operator !== "/");
  }
}

type Operator = "+" | "-" | "*" | "/" | "^" | "@";

function binaryExample(operator: Operator, name: string, description: string, input: string): ExampleProject {
  const program = new BinaryProgram();
  const left = program.digits("L", "左操作数，栈顶为最低位"), right = program.digits("R", "右操作数，栈顶为最低位"), result = program.digits("O", "运算结果，供最后输出");
  program.note(description);
  program.note("每个操作数只写 0 和 1，零写作 0。接受前导零。停机后从位置 0 开始留下二进制结果。");
  if (operator === "+" || operator === "-") {
    const carry = operator === "+" ? "进位" : "借位";
    program.note(`数字状态名：1.1 读入，1.2 分离操作数；2.1 无${carry}，2.2 有${carry}，2.3 收尾；3.1 输出，3.2 清理。`);
  }
  const print = program.inSection("3.1", () => program.print(result));
  let calculate: string;
  switch (operator) {
    case "+": calculate = program.combine(left, right, result, false, print, reject, "2"); break;
    case "-": calculate = program.combine(left, right, result, true, print, reject, "2"); break;
    case "*": calculate = program.multiply(left, right, result, print); break;
    case "/": calculate = program.hasOne(right, program.divide(left, right, result, print), reject); break;
    case "^": calculate = program.power(left, right, result, print); break;
    case "@": calculate = program.logarithm(left, right, result, print); break;
  }
  program.inSection("1.2", () => program.readOperands(operator, left, right, calculate));
  return {
    category: "二进制运算", name, input, initialState: program.start, blankSymbol: stackTapeBlank,
    acceptStates: "", rejectStates: reject, haltStates: "HALT", maxSteps: null,
    description: description + " 两边都填二进制数，零写 0。停机时纸带只留下二进制结果。",
    rules: program.finish(), numericStateSections: program.numericStateSections, ruleGuide: program.ruleGuide,
  };
}

export const binaryExamples = {
  binaryAdd: binaryExample("+", "二进制加法", "从低位逐位相加并进位。例如 101+11 得到 1000（5 加 3）。", "101+11"),
  binarySubtract: binaryExample("-", "二进制减法", "从低位逐位相减并借位。例如 1000-11 得到 101（8 减 3）。负结果进入 REJECT。", "1000-11"),
  binaryMultiply: binaryExample("*", "二进制乘法", "乘数每遇到一位 1，就加上移位后的被乘数。例如 101*11 得到 1111（5 乘 3）。", "101*11"),
  binaryDivide: binaryExample("/", "二进制除法（取商）", "用逐位长除法求整数商。例如 1101/11 得到 100（13 除以 3，余数舍去）。除数为 0 时进入 REJECT。", "1101/11"),
  binaryPower: binaryExample("^", "二进制乘方", "从高位读取指数，每位先平方，读到 1 再乘底数。例如 11^11 得到 11011（3 的三次方）。指数为 0 输出 1。", "11^11"),
  binaryLog: binaryExample("@", "二进制对数（取整）", "左边填底数，右边填真数。反复做整数除法，数能除出非零商的次数。例如 10@1101 得到 11（以 2 为底的 13 的对数取整为 3）。底数须至少为 2，真数须至少为 1。", "10@1101"),
};
