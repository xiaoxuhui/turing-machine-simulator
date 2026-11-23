export type LambdaTerm =
  | { kind: "free"; name: string }
  | { kind: "bound"; index: number }
  | { kind: "abs"; name: string; body: LambdaTerm }
  | { kind: "app"; left: LambdaTerm; right: LambdaTerm };
type Term = LambdaTerm;
export const lambdaNameAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_0123456789.";
const isNameCharacter = (char: string | undefined) => char?.length === 1 && lambdaNameAlphabet.includes(char);

export interface LambdaLocation {
  start: number;
  end: number;
  coreStart: number;
  coreEnd: number;
  nameStart?: number;
  nameEnd?: number;
  dot?: number;
}

export type LambdaReduction =
  | { status: "done" | "stepped"; output: string; steps: number }
  | { status: "invalid" | "limited"; message: string; steps: number };

type LambdaReductionOptions = { singleStep?: boolean; continuation?: boolean };

class LambdaLimit extends Error {}

const maxDepth = 512;
const maxInputLength = 16_384;
const maxWork = 1_000_000;
const maxOutputLength = 200_000;

export function parseLambdaTerm(input: string, depthLimit = maxDepth, locations?: WeakMap<Term, LambdaLocation>): Term {
  const binders: string[] = [];
  let position = 0;
  const fail = (message: string): never => { throw new SyntaxError("第 " + (position + 1) + " 个字符：" + message); };
  const skipSpaces = () => {
    while (/\s/.test(input[position] ?? "")) position++;
  };
  const readName = (dots = true) => {
    const start = position;
    if (!isNameCharacter(input[position]) || (!dots && input[position] === ".")) fail("这里需要变量名，可使用大小写字母、数字、下划线和点号。");
    while (isNameCharacter(input[position]) && (dots || input[position] !== ".")) position++;
    return input.slice(start, position);
  };

  function atom(depth: number): Term {
    if (depth > depthLimit) throw new LambdaLimit("表达式嵌套太深。");
    if (input[position] === "(") {
      const start = position;
      position++;
      const term = expression(depth + 1);
      if (input[position] !== ")") fail("缺少右括号。");
      position++;
      const location = locations?.get(term);
      if (location) locations!.set(term, { ...location, start, end: position });
      return term;
    }
    if (input[position] === "λ" || input[position] === "\\") {
      const start = position;
      position++;
      skipSpaces();
      const nameStart = position;
      let candidateEnd = position;
      while (isNameCharacter(input[candidateEnd])) candidateEnd++;
      let separator = candidateEnd;
      while (/\s/.test(input[separator] ?? "")) separator++;
      // A spaced separator makes dotted parameter names unambiguous. The
      // compact legacy notation keeps the first dot as its separator.
      const dottedParameter = separator > candidateEnd && input[separator] === ".";
      const name = readName(dottedParameter);
      const nameEnd = position;
      skipSpaces();
      if (input[position] !== ".") fail("λ 的参数后应有点号。");
      const dot = position;
      position++;
      binders.push(name);
      const body = expression(depth + 1);
      binders.pop();
      const term: Term = { kind: "abs", name, body };
      const end = locations?.get(body)?.end ?? position;
      locations?.set(term, { start, end, coreStart: start, coreEnd: end, nameStart, nameEnd, dot });
      return term;
    }
    const start = position;
    const name = readName();
    const binder = binders.lastIndexOf(name);
    const term: Term = binder >= 0 ? { kind: "bound", index: binders.length - binder - 1 } : { kind: "free", name };
    locations?.set(term, { start, end: position, coreStart: start, coreEnd: position });
    return term;
  }

  function expression(depth: number): Term {
    skipSpaces();
    let term = atom(depth);
    skipSpaces();
    while (position < input.length && input[position] !== ")") {
      const left = term, right = atom(depth);
      term = { kind: "app", left, right };
      const start = locations?.get(left)?.start ?? 0, end = locations?.get(right)?.end ?? position;
      locations?.set(term, { start, end, coreStart: start, coreEnd: end });
      skipSpaces();
    }
    return term;
  }

  const term = expression(0);
  if (position !== input.length) fail("多了一个右括号。");
  return term;
}

export function formatLambdaTerm(term: Term, visit: (depth: number) => void = () => {}, named?: (value: Term, name: string) => void, grouped?: (value: Term, parentheses: boolean) => void): string {
  const parts: string[] = [];
  let length = 0;
  const append = (text: string) => {
    length += text.length;
    if (length > maxOutputLength) throw new LambdaLimit("表达式太长，超过直接计算的输出上限。");
    parts.push(text);
  };
  const free = (value: Term, result = new Set<string>(), depth = 0): Set<string> => {
    visit(depth);
    if (value.kind === "free") result.add(value.name);
    else if (value.kind === "abs") free(value.body, result, depth + 1);
    else if (value.kind === "app") { free(value.left, result, depth + 1); free(value.right, result, depth + 1); }
    return result;
  };
  function write(value: Term, binders: string[], depth: number, context = 0): void {
    visit(depth);
    const parentheses = value.kind === "abs" ? context > 0 : value.kind === "app" && context === 2;
    grouped?.(value, parentheses);
    if (parentheses) append("(");
    switch (value.kind) {
      case "free": named?.(value, value.name); append(value.name); break;
      case "bound": {
        const name = binders[binders.length - value.index - 1];
        if (name === undefined) throw new Error("绑定变量超出当前作用域");
        named?.(value, name); append(name); break;
      }
      case "abs": {
        const used = free(value.body);
        for (const name of binders) used.add(name);
        let name = value.name;
        if (used.has(name)) {
          const base = name.replace(/\d+$/, "") || name;
          let suffix = 0;
          while (used.has(name = base + suffix++)) { /* Choose the first available numeric suffix. */ }
        }
        named?.(value, name); append("λ" + name + (name.includes(".") ? " . " : "."));
        write(value.body, [...binders, name], depth + 1);
        break;
      }
      case "app":
        write(value.left, binders, depth + 1, 1); append(" ");
        write(value.right, binders, depth + 1, 2); break;
    }
    if (parentheses) append(")");
  }
  write(term, [], 0);
  return parts.join("");
}

export function reduceLambda(input: string, maxSteps = 10_000, { singleStep = false, continuation = false }: LambdaReductionOptions = {}): LambdaReduction {
  let steps = 0;
  let work = 0;
  const visit = (depth: number) => {
    if (depth > maxDepth || ++work > maxWork) throw new LambdaLimit("表达式过大或计算量达到上限。");
  };

  // Bound variables use their distance to the binder. Moving a term under more
  // abstractions only shifts indices whose binder is outside the moved term.
  function shift(term: Term, amount: number, cutoff: number, depth: number): Term {
    if (amount === 0) return term;
    visit(depth);
    switch (term.kind) {
      case "free": return term;
      case "bound": return term.index < cutoff ? term : { kind: "bound", index: term.index + amount };
      case "abs": return { ...term, body: shift(term.body, amount, cutoff + 1, depth + 1) };
      case "app": return {
        kind: "app",
        left: shift(term.left, amount, cutoff, depth + 1),
        right: shift(term.right, amount, cutoff, depth + 1),
      };
    }
  }

  function substitute(term: Term, argument: Term, binders: number, depth: number): Term {
    visit(depth);
    switch (term.kind) {
      case "free": return term;
      case "bound":
        if (term.index === binders) return shift(argument, binders, 0, depth);
        // Removing this binder moves any reference to an outer binder one slot closer.
        return term.index < binders ? term : { kind: "bound", index: term.index - 1 };
      case "abs": return { ...term, body: substitute(term.body, argument, binders + 1, depth + 1) };
      case "app": return {
        kind: "app",
        left: substitute(term.left, argument, binders, depth + 1),
        right: substitute(term.right, argument, binders, depth + 1),
      };
    }
  }

  function reduceOnce(term: Term, depth: number): Term | undefined {
    visit(depth);
    if (term.kind === "abs") {
      const body = reduceOnce(term.body, depth + 1);
      return body && { ...term, body };
    }
    if (term.kind !== "app") return undefined;
    if (term.left.kind === "abs") {
      if (steps >= maxSteps) throw new LambdaLimit("达到 β 归约次数上限，尚未得到正规形。");
      return substitute(term.left.body, term.right, 0, depth);
    }
    const left = reduceOnce(term.left, depth + 1);
    if (left) return { ...term, left };
    const right = reduceOnce(term.right, depth + 1);
    return right && { ...term, right };
  }

  function hasRedex(term: Term, depth: number): boolean {
    visit(depth);
    if (term.kind === "abs") return hasRedex(term.body, depth + 1);
    return term.kind === "app" &&
      (term.left.kind === "abs" || hasRedex(term.left, depth + 1) || hasRedex(term.right, depth + 1));
  }

  try {
    if (input.length > (continuation ? maxOutputLength : maxInputLength)) throw new LambdaLimit("输入太长，超过直接计算的长度上限。");
    // Formatted intermediate results add parentheses around each application and abstraction.
    let term = parseLambdaTerm(input, continuation ? 2 * maxDepth + 1 : maxDepth);
    for (;;) {
      const reduced = reduceOnce(term, 0);
      if (!reduced) return { status: "done", output: steps ? formatLambdaTerm(term, visit) : input, steps };
      term = reduced;
      steps++;
      if (singleStep) {
        return { status: hasRedex(term, 0) ? "stepped" : "done", output: formatLambdaTerm(term, visit), steps };
      }
    }
  } catch (error) {
    if (error instanceof SyntaxError) return { status: "invalid", message: error.message, steps };
    if (error instanceof LambdaLimit) return { status: "limited", message: error.message, steps };
    throw error;
  }
}
