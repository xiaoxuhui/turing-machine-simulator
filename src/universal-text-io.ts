import { TapeStackProgram, type TapeStack } from "./tape-stack-program";

const one = "1", wordEnd = "wordEnd", idEnd = "idEnd";
const key = (char: string) => `c${char.codePointAt(0)!.toString(16)}`;
const fromKey = (token: string) => String.fromCodePoint(parseInt(token.slice(1), 16));
const kinds = ["state", "symbol"];
const reasonLabels: Record<string, string> = { H: "停机", A: "接受", J: "拒绝", M: "缺少规则", B: "达到步数上限" };
interface EngineStacks { table: TapeStack; state: TapeStack; head: TapeStack; left: TapeStack; right: TapeStack; fuel: TapeStack; unlimited: TapeStack }

/** The character-to-ID dictionaries are built by transitions, not by the host. */
export class UniversalTextIO {
  private readonly chars: string[];
  private readonly words: string[];
  private readonly dict: TapeStack;
  private readonly serial: TapeStack;
  private readonly word: TapeStack;
  private readonly raw: TapeStack;
  private readonly bad: string;
  private outputBody?: string;
  private terminalPrefix?: string;

  constructor(private readonly p: TapeStackProgram, chars: readonly string[], private readonly engine: EngineStacks, reject: string, private readonly budget: number | null) {
    this.chars = [...new Set([...chars, "/", "\\", ",", "-", ">", "→", "|", "L", "R", "N", " ", "\n", "\r", "\t"])];
    this.words = [...this.chars.map(key), ...kinds];
    this.dict = { name: "UT.D", values: [...this.words, wordEnd, idEnd, one] };
    this.serial = { name: "UT.N", values: [one] };
    this.word = { name: "UT.W", values: this.words };
    this.raw = { name: "UT.I", values: this.chars };
    this.bad = reject;
  }

  private stack(values: readonly string[]): TapeStack { return { name: `UT.${this.p.label()}`, values }; }
  private copy(source: TapeStack, destination: TapeStack, next: string): string {
    const backup = this.stack(source.values), loop = this.p.label();
    return this.p.take(source, value => this.p.push(backup, value, this.p.push(destination, value, loop)), this.p.move(backup, source, next), loop);
  }
  private text(text: string, next: string): string {
    for (const char of [...text].reverse()) next = this.p.emit(char, next);
    return next;
  }

  /** Intern one complete name; preserve every earlier dictionary entry. */
  private intern(kind: string, destination: TapeStack, next: string): string {
    const p = this.p, visited = this.stack(this.dict.values), backup = this.stack(this.words), reverse = this.stack(this.words);
    const scan = p.label(), compare = p.label(), skip = p.label(), readId = p.label();
    const add = p.push(this.dict, idEnd, this.copy(this.serial, this.dict,
      p.push(this.dict, wordEnd, p.move(this.word, reverse, p.move(reverse, this.dict,
        this.copy(this.serial, destination, p.push(this.serial, one, next)))))));
    const missing = p.move(visited, this.dict, add);
    const mismatch = p.move(backup, this.word, skip);
    p.take(this.dict, token => p.push(visited, token, token === idEnd ? scan : skip), this.bad, skip);
    p.jump(scan, p.peek(this.dict, () => compare, missing));
    const same = p.clear(this.word, p.move(visited, this.dict, next));
    p.take(this.dict, token => p.push(visited, token, token === idEnd ? same : token === one ? p.push(destination, one, readId) : this.bad), this.bad, readId);
    const ended = p.take(this.dict, token => p.push(visited, token, token === wordEnd ? p.move(backup, this.word, readId) : mismatch), this.bad);
    p.take(this.word, value => p.push(backup, value,
      p.take(this.dict, token => p.push(visited, token, token === value ? compare : mismatch), this.bad)), ended, compare);
    return p.push(this.word, kind, scan);
  }

  /** Unescape only \/ and \\, retaining the distinction between data and separators. */
  private take(select: (char: string | null) => string, empty: string, from?: string): string {
    const targets = new Map(this.chars.map(char => [char, select(char)])), separator = select(null), slash = targets.get("\\")!;
    const escaped = this.p.take(this.raw, char => char === "/" || char === "\\" ? targets.get(char)! : this.p.push(this.raw, char, slash), slash);
    return this.p.take(this.raw, char => char === "\\" ? escaped : char === "/" ? separator : targets.get(char)!, empty, from);
  }
  private expect(expected: string | null, next: string): string {
    const loop = this.p.label();
    return this.take(char => char === expected ? next : char !== null && /[ \t\r\n]/.test(char) ? loop : this.bad, this.bad, loop);
  }

  /** Collect an ordinary source field, excluding whitespace outside escaped symbols. */
  private field(ends: readonly (string | null)[], complete: (end: string | null) => string, from?: string): string {
    const loop = from ?? this.p.label();
    return this.take(char => ends.includes(char) ? complete(char) : char !== null && /[ \t\r\n]/.test(char) ? loop
      : char === null ? this.bad : this.p.push(this.word, key(char), loop), this.bad, loop);
  }

  private normalizeSymbol(next: string): string {
    const p = this.p;
    let entry = next;
    for (const [spelling, value] of [["\\s", " "], ["\\t", "\t"], ["\\n", "\n"], ["\\r", "\r"], ["\\u002c", ","], ["\\u00a0", "\u00a0"], ["\\u3000", "\u3000"], ["//", "/"], ["\\\\", "\\"], ["/-", "-"], ["\\-", "-"], ["/#", "#"], ["\\#", "#"]]) {
      const backup = this.stack(this.words), failed = p.move(backup, this.word, entry);
      let match = p.peek(this.word, () => failed, p.clear(backup, p.push(this.word, key(value), next)));
      for (const char of [...spelling]) {
        const following = match;
        match = p.take(this.word, token => p.push(backup, token, token === key(char) ? following : failed), failed);
      }
      entry = match;
    }
    const backup = this.stack(this.words), loop = p.label();
    const failed = p.move(backup, this.word, entry);
    const stripped = p.move(backup, this.word, p.take(this.word, () => next, this.bad));
    p.take(this.word, token => p.push(backup, token, token === key("*") ? loop : failed), stripped, loop);
    const second = p.take(this.word, token => p.push(backup, token, token === key("*") ? loop : failed), failed);
    return p.take(this.word, token => p.push(backup, token, token === key("*") ? second : failed), entry);
  }

  initialize(scan: string): void {
    const p = this.p, e = this.engine;
    const tokens = [one, ".", "T", "A", "J", "H", "L", "R", "N"];
    const rows = this.stack(tokens), input = this.stack([one, "."]), inputChars = this.stack(this.chars), inputForward = this.stack(this.chars);
    const ruleStart = p.label();
    const readyInput = this.stack([one, "."]), inputReverse = this.stack([one, "."]);
    const headLoop = p.label();
    const ready = p.move(input, readyInput, p.take(readyInput, token => token === "." ? p.move(readyInput, inputReverse, p.move(inputReverse, e.right, scan))
      : p.push(e.head, one, headLoop), scan, headLoop));
    const tableReady = p.move(rows, e.table, ready);
    const direction = p.label(), afterDirection = p.label();
    this.take(char => char === null || char === "\n" || char === "\r" ? ruleStart : char !== null && /[ \t]/.test(char) ? afterDirection : this.bad, tableReady, afterDirection);
    this.take(char => char !== null && /^[LRNlrn]$/.test(char) ? p.push(rows, char.toUpperCase(), afterDirection)
      : char !== null && /[ \t\r\n]/.test(char) ? direction : this.bad, this.bad, direction);
    const symbolField = (end: string | null, next: string) => {
      const encoded = this.intern("symbol", rows, p.push(rows, ".", next));
      const normalized = this.normalizeSymbol(encoded);
      const complete = p.peek(this.word, () => normalized, this.bad);
      return this.field([end], () => complete);
    };
    const write = symbolField(",", direction);
    const targetEncoded = this.intern("state", rows, p.push(rows, ".", write));
    const target = this.field([","], () => p.peek(this.word, () => targetEncoded, this.bad));
    const read = p.label();
    const readEncoded = this.intern("symbol", rows, p.push(rows, ".", target));
    const normalizedRead = this.normalizeSymbol(readEncoded);
    const readEnd = p.peek(this.word, () => normalizedRead, this.bad);
    const readArrow = this.expect(">", readEnd);
    this.field(["-", "→"], end => {
      return p.peek(this.word, () => end === "-" ? readArrow : readEnd, p.push(this.word, key(end!), read));
    }, read);
    const from = p.label();
    const fromEncoded = p.push(rows, "T", this.intern("state", rows, p.push(rows, ".", read)));
    this.field([","], () => p.peek(this.word, () => fromEncoded, this.bad), from);
    const comment = p.label();
    this.take(char => char === null || char === "\n" || char === "\r" ? ruleStart : comment, tableReady, comment);
    this.take(char => char === null || char !== null && /\s/.test(char) ? ruleStart : char === "#" ? comment : p.push(this.word, key(char), from), tableReady, ruleStart);

    const terminalField = (kind: string, next: string): string => {
      const loop = p.label();
      const following = p.push(rows, kind, this.intern("state", rows, p.push(rows, ".", loop)));
      const ended = p.push(rows, kind, this.intern("state", rows, p.push(rows, ".", next)));
      return this.field(["|", null], end => p.peek(this.word, () => end === null ? ended : following, end === null ? next : this.bad), loop);
    };
    const terminals = terminalField("A", terminalField("J", terminalField("H", ruleStart)));
    const initialEncoded = this.intern("state", e.state, terminals);
    const initial = this.field([null], () => p.peek(this.word, () => initialEncoded, this.bad));
    const convertInput = p.label();
    const inputEncoded = this.intern("symbol", input, p.push(input, ".", convertInput));
    p.take(inputForward, char => p.push(this.word, key(char), inputEncoded), initial, convertInput);
    const blankEncoded = this.expect(null, this.intern("symbol", this.stack([one]), p.move(inputChars, inputForward, convertInput)));
    const blank = this.take(char => char === null ? this.bad : p.push(this.word, key(char), blankEncoded), this.bad);
    const inputLoop = p.label();
    this.take(char => char === null ? blank : p.push(inputChars, char, inputLoop), this.bad, inputLoop);
    let start = inputLoop;
    if (this.budget === null) start = p.push(e.unlimited, one, start);
    else for (let i = 0; i < this.budget; i++) start = p.push(e.fuel, one, start);
    const reverse = this.stack(this.chars);
    p.readInput(reverse, p.move(reverse, this.raw, start), true, false);
  }

  /** Look up a symbol's text by its tape-built ID and print it without host decoding. */
  private emitId(code: TapeStack, next: string, escapeSeparator = false): string {
    const p = this.p, visited = this.stack(this.dict.values), word = this.stack(this.words), backup = this.stack([one]);
    const scan = p.label(), id = p.label(), skip = p.label(), print = p.label();
    p.take(word, token => {
      if (!token.startsWith("c")) return print;
      const char = fromKey(token);
      return escapeSeparator && (char === "/" || char === "\\") ? this.text(`\\${char}`, print) : p.emit(char, print);
    }, next, print);
    const found = p.clear(backup, p.move(visited, this.dict, print));
    const mismatch = p.clear(word, p.move(backup, code, skip));
    const mismatchAtEnd = p.clear(word, p.move(backup, code, scan));
    p.take(this.dict, token => p.push(visited, token, token === idEnd ? scan : skip), this.bad, skip);
    p.take(this.dict, token => p.push(visited, token,
      token === idEnd ? p.peek(code, () => mismatchAtEnd, found) : token === one ? p.take(code, () => p.push(backup, one, id), mismatch) : this.bad), this.bad, id);
    p.take(this.dict, token => p.push(visited, token, token === wordEnd ? id : p.push(word, token, scan)), this.bad, scan);
    return scan;
  }

  stopped(reason: string): string {
    if (this.outputBody) return this.outputPrefix(reason);
    const p = this.p, e = this.engine;
    const code = this.stack([one]), pending = this.stack([one]), started = this.stack([one]), leftReverse = this.stack([one, "."]);
    const left = p.label(), right = p.label(), normalId = p.label(), reverseId = p.label();
    const done = p.clear(pending, p.end);
    const flush = (next: string) => {
      const loop = p.label(), zero = this.stack([one]);
      return p.take(pending, () => this.emitId(zero, loop), next, loop);
    };
    const cell = (next: string) => p.peek(code, () => p.peek(started, () => flush(this.emitId(code, next)), p.push(started, one, this.emitId(code, next))),
      p.peek(started, () => p.push(pending, one, next), next));
    p.take(e.right, token => token === "." ? cell(right) : p.push(code, one, normalId), done, right);
    p.take(e.right, token => token === "." ? cell(right) : p.push(code, one, normalId), this.bad, normalId);
    const head = p.move(e.head, code, cell(right));
    p.take(leftReverse, token => token === "." ? reverseId : this.bad, head, left);
    p.jump(reverseId, p.peek(leftReverse, token => token === one ? p.take(leftReverse, () => p.push(code, one, reverseId), this.bad) : cell(left), cell(left)));
    this.outputBody = p.move(e.left, leftReverse, left);
    return this.outputPrefix(reason);
  }

  private outputPrefix(reason: string): string {
    if (reason !== "H" && reason !== "A" && reason !== "J") return this.text(`${reasonLabels[reason]}/`, this.outputBody!);
    if (!this.terminalPrefix) {
      const name: TapeStack = { name: "UT.terminal-name", values: [one] };
      this.terminalPrefix = this.p.move(this.engine.state, name, this.emitId(name, this.text("/", this.outputBody!), true));
    }
    return this.terminalPrefix;
  }
}

/** Make all stack tokens safe as rule fields while retaining their identity. */
export function universalTextToken(value: string): string {
  const word = /^c[0-9a-f]+$/.test(value);
  const char = word ? fromKey(value) : value;
  if ([...char].length !== 1) return value;
  const visible = /[,\\\s]/u.test(char) ? "·" : char;
  return `${visible}#(${word ? "word" : "char"}:${char.codePointAt(0)!.toString(16)})`;
}
