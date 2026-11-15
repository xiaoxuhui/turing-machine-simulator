type Term =
  | { kind: "free"; name: string }
  | { kind: "bound"; index: number }
  | { kind: "abs"; body: Term }
  | { kind: "app"; left: Term; right: Term };

export type LambdaReduction =
  | { status: "done" | "stepped"; output: string; steps: number }
  | { status: "invalid" | "limited"; message: string; steps: number };

type LambdaReductionOptions = { singleStep?: boolean; continuation?: boolean };

class LambdaLimit extends Error {}

const maxDepth = 512;
const maxInputLength = 16_384;
const maxWork = 1_000_000;
const maxOutputLength = 200_000;

function parse(input: string, depthLimit: number): Term {
  const binders: string[] = [];
  let position = 0;
  const fail = (message: string): never => { throw new SyntaxError("第 " + (position + 1) + " 个字符：" + message); };
  const skipSpaces = () => {
    while (/[ \t\u00a0\u3000]/.test(input[position] ?? "")) position++;
  };
  const readName = () => {
    const start = position;
    const letter = input[position] ?? "";
    if (!/^[a-z]$/i.test(letter)) fail("这里需要变量名。");
    position++;
    if (letter === "V") {
      if (input[position] !== "0") fail("生成的变量名应写作 V0、V00 等。");
      while (input[position] === "0") position++;
    }
    return input.slice(start, position);
  };

  function atom(depth: number): Term {
    if (depth > depthLimit) throw new LambdaLimit("表达式嵌套太深。");
    if (input[position] === "(") {
      position++;
      const term = expression(depth + 1);
      if (input[position] !== ")") fail("缺少右括号。");
      position++;
      return term;
    }
    if (input[position] === "λ" || input[position] === "\\") {
      position++;
      skipSpaces();
      const name = readName();
      if (name.startsWith("V") && name.length !== binders.length + 2) fail("生成的变量名与绑定深度不符。");
      skipSpaces();
      if (input[position] !== ".") fail("λ 的参数后应有点号。");
      position++;
      binders.push(name);
      const body = expression(depth + 1);
      binders.pop();
      return { kind: "abs", body };
    }
    const name = readName();
    const binder = binders.lastIndexOf(name);
    if (binder >= 0) return { kind: "bound", index: binders.length - binder - 1 };
    if (name.startsWith("V")) fail("没有找到这个变量的绑定声明。");
    return { kind: "free", name };
  }

  function expression(depth: number): Term {
    skipSpaces();
    let term = atom(depth);
    skipSpaces();
    while (position < input.length && input[position] !== ")") {
      term = { kind: "app", left: term, right: atom(depth) };
      skipSpaces();
    }
    return term;
  }

  const term = expression(0);
  if (position !== input.length) fail("多了一个右括号。");
  return term;
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
      case "abs": return { kind: "abs", body: shift(term.body, amount, cutoff + 1, depth + 1) };
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
      case "abs": return { kind: "abs", body: substitute(term.body, argument, binders + 1, depth + 1) };
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
      return body && { kind: "abs", body };
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

  function format(term: Term): string {
    const parts: string[] = [];
    let length = 0;
    const append = (text: string) => {
      length += text.length;
      if (length > maxOutputLength) throw new LambdaLimit("表达式太长，超过直接计算的输出上限。");
      parts.push(text);
    };
    function write(value: Term, binders: number, depth: number): void {
      visit(depth);
      switch (value.kind) {
        case "free": append(value.name); break;
        case "bound": append("V" + "0".repeat(binders - value.index)); break;
        case "abs":
          append("(λV" + "0".repeat(binders + 1) + ".");
          write(value.body, binders + 1, depth + 1);
          append(")");
          break;
        case "app":
          append("(");
          write(value.left, binders, depth + 1);
          write(value.right, binders, depth + 1);
          append(")");
          break;
      }
    }
    write(term, 0, 0);
    return parts.join("");
  }

  try {
    if (input.length > (continuation ? maxOutputLength : maxInputLength)) throw new LambdaLimit("输入太长，超过直接计算的长度上限。");
    // Formatted intermediate results add parentheses around each application and abstraction.
    let term = parse(input, continuation ? 2 * maxDepth + 1 : maxDepth);
    for (;;) {
      const reduced = reduceOnce(term, 0);
      if (!reduced) return { status: "done", output: format(term), steps };
      term = reduced;
      steps++;
      if (singleStep) {
        return { status: hasRedex(term, 0) ? "stepped" : "done", output: format(term), steps };
      }
    }
  } catch (error) {
    if (error instanceof SyntaxError) return { status: "invalid", message: error.message, steps };
    if (error instanceof LambdaLimit) return { status: "limited", message: error.message, steps };
    throw error;
  }
}
