import type { ExampleProject } from "./examples";
import { LambdaTapeProgram, lambdaAccept, lambdaBlank, lambdaHalt, lambdaReject, lambdaStart, type LambdaStack } from "./lambda-tape";
import { normalizer, writeNormalForm } from "./lambda-normalize";

const letters = [..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"].filter(letter => letter !== "V");
const variable = letters.map(letter => `free.${letter}`);
const tokens = ["app", "abs", "close", "bound", "index", "end", ...variable];
const frame = "frame";
const stack = (name: string, values: readonly string[]): LambdaStack => ({ name, values });

function lambdaRules(): string {
  const p = new LambdaTapeProgram();
  const raw = stack("input", [...letters, "V", "0", "λ", "\\", ".", "(", ")", " "]);
  const input = stack("chars", raw.values);
  const term = stack("term", [...tokens, frame]);
  const scan = stack("scan", tokens);
  const scratch = stack("syntax", tokens);
  const scopes = stack("scopes", ["root", "paren", "lambda"]);
  const names = stack("names", [...letters, "V"]);
  const held = stack("saved", names.values);
  const count = stack("count", ["index"]);
  const index = stack("index", ["index"]);
  const first = p.label(), after = p.label();

  p.note("输入：变量是单个英文字母，大写 V 留给生成的变量名。λ 或反斜杠引入抽象，应用左结合。");
  p.note("输出中的 V0、V00 等是按绑定深度命名的变量，也可作为输入。");
  p.readInput(raw, p.move(raw, input, p.push(scopes, "root", p.push(term, frame, first))));

  // Temporarily lift the current expression off its frame to insert a prefix token.
  const editFrame = (insert: string | undefined, next: string) => {
    const loop = p.label();
    const restore = p.move(scratch, term, next);
    const replace = insert ? p.push(term, frame, p.push(term, insert, restore)) : restore;
    return p.take(term, value => value === frame ? replace : p.push(scratch, value, loop), lambdaHalt, loop);
  };

  const print = writeNormalForm(p, scan, letters);
  const reduce = normalizer(p, scan, tokens, print);
  const close = (eof: boolean) => {
    const loop = p.label();
    const popBinder = p.take(names, () => p.push(term, "close", loop), lambdaHalt);
    const resume = eof ? p.move(term, scan, reduce) : after;
    return p.take(scopes, kind => kind === "lambda"
      ? editFrame(undefined, popBinder)
      : (kind === "root") === eof ? editFrame(undefined, resume) : lambdaReject, lambdaHalt, loop);
  };
  const closeParen = close(false), closeEnd = close(true);

  const emitBound = p.push(term, "bound", p.move(index, term, p.push(term, "end", after)));
  const beginAbs = (name: string) => p.push(names, name, p.push(scopes, "lambda", p.push(term, "abs", p.push(term, frame, first))));
  const expectDot = (name: string) => {
    const loop = p.label();
    const begin = beginAbs(name);
    return p.take(input, value => value === " " ? loop : value === "." ? begin : lambdaReject, lambdaReject, loop);
  };

  // V followed by one or more zeros names an absolute binder depth (one-based).
  // Convert it to the relative index by counting the binder stack, then subtracting
  // the zeros. This also makes the machine's printed output valid input.
  const digits = (definition: boolean) => {
    const read = p.label(), more = p.label();
    const collect = p.label();
    if (definition) {
      // Each existing binder must match one zero; exactly one zero is left
      // for the binder being introduced.
      const check = p.label();
      const dot = p.move(held, names, expectDot("V"));
      const one = p.take(count, () => p.take(count, () => lambdaReject, dot), lambdaReject);
      const checkOne = p.take(count, () => check, lambdaReject);
      p.take(names, name => p.push(held, name, checkOne), one, check);
      p.jump(collect, check);
    } else {
      const locate = p.label();
      const skip = p.take(held, name => p.push(names, name, locate), lambdaReject);
      const keepIndex = p.label();
      const restore = p.move(held, names, emitBound);
      const bound = p.take(held, name => name === "V" ? p.push(names, name, keepIndex) : lambdaReject, lambdaReject);
      p.take(held, name => p.push(names, name, p.push(index, "index", keepIndex)), restore, keepIndex);
      p.take(count, () => skip, bound, locate);
      p.take(names, name => p.push(held, name, collect), p.take(count, () => locate, lambdaReject), collect);
    }
    p.take(input, value => value === "0" ? p.push(count, "index", more) : p.push(input, value, collect), collect, more);
    return p.take(input, value => value === "0" ? p.push(count, "index", more) : lambdaReject, lambdaReject, read);
  };

  const named = new Map(letters.map(letter => {
    const loop = p.label();
    const bound = p.move(held, names, emitBound);
    const free = p.clear(index, p.move(held, names, p.push(term, `free.${letter}`, after)));
    return [letter, p.take(names, name => name === letter
      ? p.push(names, name, bound)
      : p.push(held, name, p.push(index, "index", loop)), free, loop)];
  }));
  const generated = digits(false);
  const generatedBinder = digits(true);
  const binder = p.label();
  const dots = new Map(letters.map(letter => [letter, expectDot(letter)]));
  p.take(input, value => value === " " ? binder : value === "V" ? generatedBinder : dots.get(value) ?? lambdaReject, lambdaReject, binder);
  const paren = p.push(scopes, "paren", p.push(term, frame, first));
  const atom = (value: string) => value === "(" ? paren : value === "λ" || value === "\\" ? binder
    : value === "V" ? generated : named.get(value) ?? lambdaReject;

  p.take(input, value => value === " " ? first : atom(value), lambdaReject, first);
  // Share the insertion operation for every atom character.
  const consume = p.take(input, atom, lambdaReject);
  const prepend = editFrame("app", consume);
  p.take(input, value => value === " " ? after : value === ")" ? closeParen
    : atom(value) === lambdaReject ? lambdaReject : p.push(input, value, prepend), closeEnd, after);
  return p.finish();
}

export const lambdaExample: ExampleProject = {
  category: "基础示例",
  name: "λ 表达式归约",
  description: "输入 (λx.λy.x)y 会得到 (λV0.y)。变量用单个英文字母，大写 V 留给机器按绑定深度生成的变量名 V0、V00 等。这些名字也可重新输入。λ 可写成反斜杠，应用可连写或用空格分开，支持全角空格和网页复制的空格。机器用最左最外 β 归约，直到完整正规形。接受表示归约完成，拒绝表示输入格式错误，普通停机用于工作区异常。没有正规形的表达式可能持续运行，可暂停。",
  input: "(λx.λy.x)y",
  initialState: lambdaStart,
  blankSymbol: lambdaBlank,
  acceptStates: lambdaAccept,
  rejectStates: lambdaReject,
  haltStates: lambdaHalt,
  maxSteps: null,
  rules: lambdaRules(),
};
