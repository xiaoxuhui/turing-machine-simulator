import { LambdaTapeProgram, lambdaHalt, type LambdaStack } from "./lambda-tape";

const stack = (name: string, values: readonly string[]): LambdaStack => ({ name, values });
const counter = (name: string): LambdaStack => stack(name, ["index"]);

// Compare a de Bruijn index with a nesting depth, restoring both counters.
function compareIndex(p: LambdaTapeProgram, index: LambdaStack, depth: LambdaStack, less: string, equal: string, greater: string): string {
  const pairs = counter(`pairs.${p.label()}`);
  const restore = (next: string) => {
    const loop = p.label();
    return p.take(pairs, () => p.push(index, "index", p.push(depth, "index", loop)), next, loop);
  };
  const compare = p.label();
  const pair = p.take(index, () => p.push(pairs, "index", compare), p.push(depth, "index", restore(less)));
  return p.take(depth, () => pair, p.peek(index, () => restore(greater), restore(equal)), compare);
}

export function normalizer(p: LambdaTapeProgram, scan: LambdaStack, tokens: readonly string[], print: string): string {
  const prefix = stack("prefix", tokens);
  const body = stack("body", tokens), arg = stack("argument", tokens);
  const bodyReverse = stack("bodyReverse", tokens), argReverse = stack("argumentReverse", tokens);
  const argSaved = stack("argumentSaved", tokens), result = stack("replacement", tokens);
  const slots = counter("slots"), depth = counter("bodyDepth"), argDepth = counter("argumentDepth");
  const index = counter("boundIndex"), temp = counter("tempDepth");
  const search = p.label(), substitute = p.label(), copyArgument = p.label();
  const restart = p.move(result, scan, p.move(prefix, scan, search));

  const finishIndex = (next: string) => p.move(index, result, p.push(result, "end", next));
  const unchangedArgument = finishIndex(copyArgument);
  const addShift = p.label();
  const shiftedArgument = p.move(temp, depth, unchangedArgument);
  p.take(depth, () => p.push(temp, "index", p.push(result, "index", addShift)), shiftedArgument, addShift);
  const shift = compareIndex(p, index, argDepth, unchangedArgument, addShift, addShift);
  const argumentIndex = p.label();
  p.take(arg, token => token === "index"
    ? p.push(argSaved, token, p.push(index, "index", argumentIndex))
    : token === "end" ? p.push(argSaved, token, shift) : lambdaHalt, lambdaHalt, argumentIndex);
  p.take(arg, token => {
    const append = p.push(result, token, token === "bound" ? argumentIndex : copyArgument);
    const next = token === "abs" ? p.push(argDepth, "index", append)
      : token === "close" ? p.take(argDepth, () => append, lambdaHalt) : append;
    return p.push(argSaved, token, next);
  }, p.move(argSaved, arg, substitute), copyArgument);

  const unchangedBody = p.push(result, "bound", finishIndex(substitute));
  const adjust = compareIndex(p, index, depth, unchangedBody, p.clear(index, copyArgument), p.take(index, () => unchangedBody, lambdaHalt));
  const readIndex = p.label();
  p.take(body, token => token === "index" ? p.push(index, "index", readIndex) : token === "end" ? adjust : lambdaHalt, lambdaHalt, readIndex);
  p.take(body, token => {
    const next = p.push(result, token, substitute);
    if (token === "abs") return p.push(depth, "index", next);
    if (token === "close") return p.take(depth, () => next, lambdaHalt);
    return token === "bound" ? readIndex : next;
  }, p.clear(arg, restart), substitute);

  // Prefix applications have two children. An abstraction is followed by its
  // body and a close token. An index is one leaf ending at its end token.
  const extract = (target: LambdaStack, next: string) => {
    const loop = p.label(), read = p.label(), readIndex = p.label();
    const copied = p.take(slots, () => read, next, loop);
    p.take(scan, token => token === "index" ? p.push(target, token, readIndex)
      : token === "end" ? p.push(target, token, copied) : lambdaHalt, lambdaHalt, readIndex);
    p.take(scan, token => {
      if (token === "app" || token === "abs") {
        return p.push(target, token, p.push(slots, "index", p.push(slots, "index", copied)));
      }
      return p.push(target, token, token === "bound" ? readIndex : copied);
    }, lambdaHalt, read);
    return p.push(slots, "index", loop);
  };
  const extractArg = extract(argReverse, p.move(argReverse, arg, substitute));
  const checkClose = p.take(scan, token => token === "close" ? extractArg : lambdaHalt, lambdaHalt);
  const bodyWithClose = extract(bodyReverse, p.move(bodyReverse, body, checkClose));
  const removeAbs = p.take(scan, token => token === "abs" ? bodyWithClose : lambdaHalt, lambdaHalt);
  const saveApp = p.push(prefix, "app", search);
  const checkApp = p.peek(scan, token => token === "abs" ? removeAbs : saveApp, lambdaHalt);
  p.note("最左最外归约：从前缀表达式找到应用及其左侧 λ，替换后重新从头扫描。");
  p.take(scan, token => token === "app" ? checkApp : p.push(prefix, token, search), p.move(prefix, scan, print), search);
  return search;
}

export function writeNormalForm(p: LambdaTapeProgram, scan: LambdaStack, letters: readonly string[]): string {
  const context = stack("printContext", ["left", "right", "abs", "root"]);
  const depth = counter("printDepth"), held = counter("printSaved");
  const term = p.label(), done = p.label();
  const close = p.emit(")", done);
  const endAbs = p.take(scan, token => token === "close" ? p.take(depth, () => close, lambdaHalt) : lambdaHalt, lambdaHalt);
  p.take(context, value => {
    if (value === "left") return p.push(context, "right", term);
    if (value === "right") return close;
    if (value === "abs") return endAbs;
    return "lambda.finish";
  }, lambdaHalt, done);

  const zeros = (next: string) => {
    const loop = p.label();
    const zero = p.emit("0", loop);
    return p.take(depth, () => p.push(held, "index", zero), p.move(held, depth, next), loop);
  };
  const completeBound = p.move(held, depth, done);
  const index = p.label();
  const drop = p.take(depth, () => p.push(held, "index", index), lambdaHalt);
  const printIndex = p.emit("V", zeros(completeBound));
  p.take(scan, token => token === "index" ? drop : token === "end" ? printIndex : lambdaHalt, lambdaHalt, index);

  const free = new Map(letters.map(letter => [`free.${letter}`, p.emit(letter, done)]));
  const abs = p.emit("(", p.emit("λ", p.emit("V", zeros(p.emit(".", p.push(context, "abs", term))))));
  const app = p.emit("(", p.push(context, "left", term));
  p.note("输出：将绑定索引写成 V0、V00 等，并清理全部工作符。");
  p.take(scan, token => token === "app" ? app : token === "abs" ? p.push(depth, "index", abs)
    : token === "bound" ? index : free.get(token) ?? lambdaHalt, lambdaHalt, term);
  return p.push(context, "root", term);
}
