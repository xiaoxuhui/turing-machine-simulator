import { formatTransition } from "./rule-format";
import type { Direction, Tape, Transition } from "./core";
import type { ExampleProject } from "./examples";
import { formatLambdaTerm, lambdaNameAlphabet, parseLambdaTerm, type LambdaLocation, type LambdaTerm } from "./lambda-reduce";
import { visibleTapeSymbol } from "./symbol-annotations";
import { lambdaAccept, lambdaBlank, lambdaHalt, lambdaReject, lambdaStart } from "./lambda-tape";

export const lambdaLimit = "lambda.limit";
export const lambdaBeta = "lambda.beta";
const app = "#(λ.app)", appSep = "#(λ.app.sep)", appEnd = "#(λ.app.end)", absEnd = "#(λ.abs.end)";
const origin = "#(λ.origin)", bodyEnd = "#(λ.body.end)", argEnd = "#(λ.arg.end)", nop = "#(λ.skip)";
const drop = "#(λ.drop)", deleted = "#(λ.deleted)";
const modes = ["new", "copy", "copyReady", "arg", "body", "drop", "redex"] as const;
const redex = (mode: typeof modes[number]) => `#(λ.redex.${mode})`;
const indexToken = (i: number) => `#(λ.index.${i})`;
const absOpen = "#(λ.abs.open)", lambdaGlyph = "λ#(λ.glyph)", slashGlyph = "#(λ.glyph)\\", dot = ".#(λ.dot)";
const trivia = (char: string) => char === "(" || char === ")" ? `${char}#(λ.literal)` : char;
const nameEnd = "#(λ.name.end)", namePad = "#(λ.name.pad)";
const nameChar = (char: string) => `${char}#(λ.char)`;
const freeStart = (char: string) => `${char}#(λ.free.first)`;
const boundStart = (char: string) => `${char}#(λ.bound.first)`;

class LocalRules {
  private readonly rules: Transition[] = [];
  private count = 0;
  label() { return `λ.${this.count++}`; }
  add(from: string, read: string, to: string, write = read, direction: Direction = "N") {
    this.rules.push({ fromState: from, readSymbol: read, toState: to, writeSymbol: write, direction });
  }
  source() {
    if (this.rules.length > 100_000) throw new Error("表达式名称种类或嵌套过多，生成的纸带规则超过上限，请使用直接归约。");
    return this.rules.map(formatTransition).join("\n");
  }
}

/** Only syntax is compiled here. Beta substitution and index shifts execute on the paper tape. */
export function makeLambdaProject(source: string): ExampleProject {
  const locations = new WeakMap<LambdaTerm, LambdaLocation>();
  const term = parseLambdaTerm(source, undefined, locations);
  const names = new Set<string>();
  let deepest = 0;
  const inspect = (value: LambdaTerm, depth: number) => {
    deepest = Math.max(deepest, depth);
    if (value.kind === "free") names.add(value.name);
    if (value.kind === "abs") { names.add(value.name); inspect(value.body, depth + 1); }
    if (value.kind === "app") { inspect(value.left, depth); inspect(value.right, depth); }
  };
  inspect(term, 0);
  if (deepest > 60) throw new Error("纸带模式暂支持 60 层以内的初始绑定，请使用直接归约处理更深的表达式。");
  const capacity = Math.max(32, deepest + 4);
  const indices = Array.from({ length: capacity + 1 }, (_, i) => indexToken(i));
  const charactersInNames = [...lambdaNameAlphabet];
  const abstractions = [absOpen], bound = charactersInNames.map(boundStart), free = charactersInNames.map(freeStart);
  const triviaSymbols = [...new Set([...source].filter(char => /\s/.test(char) || char === "(" || char === ")").map(trivia))];
  const base = [app, appSep, appEnd, absOpen, lambdaGlyph, slashGlyph, dot, absEnd, nameEnd, namePad, ...triviaSymbols,
    ...charactersInNames.map(nameChar), ...bound, ...free, ...indices];
  // Reserve separate character cells for a numeric suffix chosen during alpha-renaming.
  const suffixWidth = String(names.size + capacity + 1).length;
  const placeholders = Array.from({ length: capacity + 1 }, (_, i) => `#(λ.place.${i})`);
  const cursor = (symbol: number, depth: number) => {
    const glyph = visibleTapeSymbol(base[symbol]), tag = `#(λ.cursor.${symbol}.${depth})`;
    return glyph === "\\" ? tag + glyph : glyph + tag;
  };
  const cursors = base.flatMap((_, symbol) => indices.map((_, depth) => cursor(symbol, depth)));
  const alphabet = [...base, ...placeholders, ...cursors, ...modes.map(redex), origin, bodyEnd, argEnd, nop, drop, deleted];
  const p = new LocalRules();
  const scan = "lambda.scan", check = p.label(), mark = p.label(), bodyStart = p.label();
  const rewind = (next: string) => {
    const state = p.label();
    p.add(state, "", state, "", "L"); p.add(state, origin, next, origin, "R");
    return state;
  };
  const seek = (symbol: string, next: string, direction: "L" | "R") => {
    const state = p.label();
    p.add(state, "", state, "", direction); p.add(state, symbol, next);
    return state;
  };
  const beginBody = seek(redex("new"), bodyStart, "L");
  p.add(bodyStart, redex("new"), bodyStart + ".drop", redex("new"), "R");
  p.add(bodyStart + ".drop", "", bodyStart + ".drop", "", "R");
  p.add(bodyStart + ".drop", drop, "λ.body.0", drop, "R");

  // Annotate the original characters in place. Structural boundaries have no
  // printed glyph, and the user's parentheses, dots and whitespace stay intact.
  const initial: string[] = [];
  let sourceOffset = 0;
  const literalUntil = (end: number) => { while (sourceOffset < end) initial.push(trivia(source[sourceOffset++])); };
  const encodeName = (start: number, end: number, first = nameChar) => {
    literalUntil(start);
    while (sourceOffset < end) {
      initial.push((sourceOffset === start ? first : nameChar)(source[sourceOffset]));
      sourceOffset++;
    }
    initial.push(...Array<string>(Math.max(0, suffixWidth - 1)).fill(namePad), nameEnd);
  };
  const encode = (value: LambdaTerm, scope: string[]) => {
    const location = locations.get(value)!;
    literalUntil(location.coreStart);
    if (value.kind === "free") encodeName(location.coreStart, location.coreEnd, freeStart);
    if (value.kind === "bound") { encodeName(location.coreStart, location.coreEnd, boundStart); initial.push(indexToken(value.index)); }
    if (value.kind === "abs") {
      initial.push(absOpen, source[sourceOffset++] === "\\" ? slashGlyph : lambdaGlyph);
      encodeName(location.nameStart!, location.nameEnd!);
      literalUntil(location.dot!); initial.push(dot); sourceOffset++;
      encode(value.body, [...scope, value.name]); literalUntil(location.coreEnd); initial.push(absEnd);
    }
    if (value.kind === "app") {
      initial.push(app); encode(value.left, scope); initial.push(appSep);
      encode(value.right, scope); literalUntil(location.coreEnd); initial.push(appEnd);
    }
    literalUntil(location.end);
  };
  encode(term, []);
  literalUntil(source.length);
  const initBack = p.label();
  const entry = (i: number) => i === 0 ? lambdaStart : `lambda.input.${i}`;
  const inputEnd = "lambda.input.end", shift = "lambda.input.shift", nextShift = "lambda.input.next";
  p.add(inputEnd, "", inputEnd, "", "R"); p.add(inputEnd, lambdaBlank, shift, lambdaBlank, "L");
  p.add(nextShift, lambdaBlank, shift, lambdaBlank, "L");
  const rawCharacters = [...new Set([...source])];
  for (const [i, char] of rawCharacters.entries()) {
    p.add(shift, char, `lambda.input.carry.${i}`, lambdaBlank, "R");
    p.add(`lambda.input.carry.${i}`, lambdaBlank, nextShift, char, "L");
  }
  let rawOffset = 0;
  for (const [i, token] of initial.entries()) {
    const glyph = visibleTapeSymbol(token);
    p.add(entry(i), "", lambdaReject);
    if (glyph) {
      if (glyph !== source[rawOffset]) throw new Error("原文字符与语法位置不一致");
      p.add(entry(i), glyph, entry(i + 1), token, "R"); rawOffset++;
    } else if (rawOffset === source.length) {
      p.add(entry(i), lambdaBlank, entry(i + 1), token, "R");
    } else {
      const char = source[rawOffset], anchor = char === "\\" ? `#(λ.input.anchor.${i})\\` : `${char}#(λ.input.anchor.${i})`;
      p.add(entry(i), char, inputEnd, anchor, "R");
      p.add(shift, anchor, `lambda.input.restore.${i}`, lambdaBlank, "R");
      p.add(`lambda.input.restore.${i}`, lambdaBlank, `lambda.input.insert.${i}`, char, "L");
      p.add(`lambda.input.insert.${i}`, lambdaBlank, entry(i + 1), token, "R");
    }
  }
  p.add(entry(initial.length), "", lambdaReject);
  p.add(entry(initial.length), lambdaBlank, initBack, lambdaBlank, "L");
  p.add(initBack, "", initBack, "", "L"); p.add(initBack, lambdaBlank, scan, origin, "R");

  const accept = p.label();
  p.add(scan, "", scan, "", "R"); p.add(scan, app, check, app, "R");
  p.add(scan, lambdaBlank, rewind(accept), lambdaBlank, "L");
  p.add(accept, "", accept, "", "L"); p.add(accept, origin, lambdaAccept, lambdaBlank, "R");
  p.add(check, "", scan);
  for (const symbol of triviaSymbols) p.add(check, symbol, check, symbol, "R");
  for (const symbol of abstractions) p.add(check, symbol, mark, drop, "L");
  p.add(mark, "", mark, "", "L");
  p.add(mark, app, "λ.endbody.0", redex("new"), "R");
  p.add("λ.endbody.0", drop, "λ.endbody.0", drop, "R");

  // Find the body and argument boundaries without lifting either subtree off the tape.
  const readArg = p.label(), endArg = p.label();
  for (const symbol of [...triviaSymbols, appSep]) p.add(readArg, symbol, readArg, symbol, "R");
  for (const symbol of triviaSymbols) p.add(endArg, symbol, endArg, symbol, "R");
  for (let depth = 0; depth <= capacity; depth++) {
    const body = `λ.endbody.${depth}`, arg = `λ.endarg.${depth}`;
    p.add(body, "", body, "", "R"); p.add(arg, "", arg, "", "R");
    for (const open of [app, ...abstractions]) {
      p.add(body, open, depth === capacity ? lambdaLimit : `λ.endbody.${depth + 1}`, open, "R");
      p.add(arg, open, depth === capacity ? lambdaLimit : `λ.endarg.${depth + 1}`, open, "R");
    }
    p.add(body, absEnd, depth ? `λ.endbody.${depth - 1}` : readArg, depth ? absEnd : bodyEnd, "R");
    p.add(body, appEnd, depth ? `λ.endbody.${depth - 1}` : lambdaHalt, appEnd, "R");
    for (const close of [appEnd, absEnd]) p.add(arg, close, depth === 1 ? endArg : depth ? `λ.endarg.${depth - 1}` : lambdaHalt, close, "R");
  }
  const freeTail = p.label(), boundTail = p.label();
  for (const symbol of free) p.add(readArg, symbol, freeTail, symbol, "R");
  for (const symbol of bound) p.add(readArg, symbol, boundTail, symbol, "R");
  p.add(freeTail, "", freeTail, "", "R"); p.add(freeTail, nameEnd, endArg, nameEnd, "R");
  p.add(boundTail, "", boundTail, "", "R"); p.add(boundTail, nameEnd, readArg + ".index", nameEnd, "R");
  for (const symbol of indices) p.add(readArg + ".index", symbol, endArg, symbol, "R");
  for (const symbol of [app, ...abstractions]) p.add(readArg, symbol, "λ.endarg.1", symbol, "R");
  p.add(endArg, appEnd, beginBody, argEnd, "L");

  // A shared local deletion closes exactly one hole by shifting its suffix left.
  const deleteCell = p.label(), readNext = p.label(), stepRight = p.label(), afterDelete = p.label();
  const afterDeleteStart = rewind(afterDelete);
  p.add(deleteCell, "", readNext, lambdaBlank, "R");
  p.add(stepRight, lambdaBlank, readNext, lambdaBlank, "R");
  p.add(readNext, lambdaBlank, afterDeleteStart, lambdaBlank, "L");
  for (const [i, symbol] of alphabet.entries()) {
    const put = `λ.del.${i}`;
    p.add(readNext, symbol, put, lambdaBlank, "L"); p.add(put, lambdaBlank, stepRight, symbol, "R");
  }
  p.add(afterDelete, "", afterDelete, "", "R");
  const cleanNops = p.label(), startCleanNops = rewind(cleanNops);
  p.add(afterDelete, lambdaBlank, startCleanNops, lambdaBlank, "L");
  p.add(cleanNops, "", cleanNops, "", "R"); p.add(cleanNops, nop, deleteCell);
  p.add(cleanNops, lambdaBlank, rewind(lambdaBeta), lambdaBlank, "L");
  p.add(lambdaBeta, "", scan);

  const findPlaceholder = p.label(), readyPlaceholder = p.label(), deleteNameTail = p.label(), copyStart = p.label(), startInsert = p.label(), copyDone = p.label();
  p.add(findPlaceholder, "", findPlaceholder, "", "R");
  p.add(copyStart, "", copyStart, "", "R");
  p.add(copyStart, bodyEnd, copyStart + ".separator", bodyEnd, "R");
  p.add(copyStart + ".separator", "", copyStart + ".separator", "", "R");
  p.add(copyStart + ".separator", appSep, copyStart + ".first", appSep, "R");
  for (const [i, symbol] of base.entries()) if (!/^\s$/.test(symbol)) p.add(copyStart + ".first", symbol, startInsert, cursor(i, 0), "L");
  for (const symbol of triviaSymbols.filter(symbol => /^\s$/.test(symbol))) p.add(copyStart + ".first", symbol, copyStart + ".first", symbol, "R");
  p.add(afterDelete, redex("copy"), findPlaceholder, redex("copy"), "R");
  p.add(afterDelete, redex("copyReady"), readyPlaceholder, redex("copyReady"), "R");
  p.add(readyPlaceholder, "", readyPlaceholder, "", "R");
  for (const placeholder of placeholders) {
    p.add(findPlaceholder, placeholder, deleteNameTail, placeholder, "R");
    p.add(readyPlaceholder, placeholder, copyStart, placeholder, "R");
  }
  p.add(deleteNameTail, "", deleteCell);
  const readyCopy = p.label(), deleteIndex = seek(deleted, deleteCell, "R");
  p.add(deleteNameTail, deleted, readyCopy, deleted, "L");
  p.add(readyCopy, "", readyCopy, "", "L"); p.add(readyCopy, redex("copy"), deleteIndex, redex("copyReady"), "R");

  // Copy one argument token into the current substitution site. Right shifts
  // start at that site, so the expression's prefix and origin never relocate.
  const seekEnd = p.label(), shiftRead = p.label(), shiftLeft = p.label(), findCursor = p.label(), advance = p.label();
  p.add(startInsert, "", startInsert, "", "L");
  p.add(seekEnd, "", seekEnd, "", "R"); p.add(seekEnd, lambdaBlank, shiftRead, lambdaBlank, "L");
  p.add(shiftLeft, lambdaBlank, shiftRead, lambdaBlank, "L");
  p.add(findCursor, "", findCursor, "", "R"); p.add(advance, "", advance, "", "R");
  for (const [i, symbol] of alphabet.entries()) {
    if (placeholders.includes(symbol)) continue;
    const put = `λ.ins.${i}`;
    p.add(shiftRead, symbol, put, lambdaBlank, "R"); p.add(put, lambdaBlank, shiftLeft, symbol, "L");
  }
  for (let depth = 0; depth <= capacity; depth++) {
    const placeholder = placeholders[depth], put = `λ.place.${depth}`;
    p.add(startInsert, placeholder, seekEnd, placeholder, "R");
    p.add(shiftRead, placeholder, put, lambdaBlank, "R");
    p.add(put, lambdaBlank, findCursor, placeholder, "L");
    p.add(copyDone, placeholder, `λ.body.${depth}`, nop, "R");
  }
  p.add(copyDone, "", copyDone, "", "L");
  for (const [i, symbol] of base.entries()) {
    const index = indices.indexOf(symbol), fetch = index >= 0 ? `λ.fetch.index.${index}` : `λ.fetch.${i}`;
    if (index < 0) {
      p.add(fetch, "", fetch, "", "L"); p.add(fetch, lambdaBlank, advance, symbol, "R");
    }
    for (let local = 0; local <= capacity; local++) {
      const tagged = cursor(i, local);
      const chosen = index >= local ? fetch : `λ.fetch.fixed.${index}`;
      p.add(findCursor, tagged, index >= 0 ? chosen : fetch, tagged, "L");
      const nextDepth = local + (abstractions.includes(symbol) ? 1 : symbol === absEnd ? -1 : 0);
      const markNext = `λ.next.${nextDepth}`;
      p.add(advance, tagged, nextDepth < 0 || nextDepth > capacity ? lambdaLimit : markNext, symbol, "R");
    }
  }
  for (let i = 0; i <= capacity; i++) {
    const shifted = `λ.fetch.index.${i}`, fixed = `λ.fetch.fixed.${i}`, depthRead = `λ.shift.${i}`;
    p.add(shifted, "", shifted, "", "L"); p.add(shifted, lambdaBlank, depthRead, lambdaBlank, "R");
    p.add(fixed, "", fixed, "", "L"); p.add(fixed, lambdaBlank, advance, indices[i], "R");
    const write = `λ.write.${i}`;
    p.add(write, lambdaBlank, advance, indices[i], "R");
    for (let depth = 0; depth <= capacity; depth++) p.add(depthRead, placeholders[depth], i + depth > capacity ? lambdaLimit : `λ.write.${i + depth}`, placeholders[depth], "L");
    const next = `λ.next.${i}`;
    p.add(next, argEnd, copyDone, argEnd, "L");
    for (const [value, symbol] of base.entries()) p.add(next, symbol, startInsert, cursor(value, i), "L");
  }

  // Substitute in the body, skipping the newly inserted argument until the
  // next normal-order pass. The argument itself stays at its original site.
  const setCopy = p.label();
  p.add(setCopy, "", setCopy, "", "L");
  for (const mode of modes) p.add(setCopy, redex(mode), findPlaceholder, redex("copy"), "R");
  const setCleanup = p.label(), eraseArgument = p.label(), seekBody = seek(bodyEnd, eraseArgument, "R");
  p.add(setCleanup, "", setCleanup, "", "L");
  for (const mode of modes) p.add(setCleanup, redex(mode), seekBody, redex("arg"), "R");
  p.add(eraseArgument, bodyEnd, eraseArgument + ".next", bodyEnd, "R");
  p.add(eraseArgument + ".next", "", deleteCell);
  const setBodyCleanup = p.label(), seekArgEnd = seek(argEnd, deleteCell, "R");
  p.add(eraseArgument + ".next", argEnd, setBodyCleanup, argEnd, "L");
  p.add(setBodyCleanup, "", setBodyCleanup, "", "L"); p.add(setBodyCleanup, redex("arg"), seekArgEnd, redex("body"), "R");
  p.add(afterDelete, redex("arg"), seekBody, redex("arg"), "R");
  const removeBodyEnd = p.label(), setDropCleanup = p.label();
  p.add(afterDelete, redex("body"), removeBodyEnd, redex("drop"), "R");
  p.add(removeBodyEnd, "", removeBodyEnd, "", "R"); p.add(removeBodyEnd, bodyEnd, deleteCell);
  p.add(afterDelete, redex("drop"), setDropCleanup, redex("drop"), "R");
  p.add(setDropCleanup, "", deleteCell);
  const setRedexCleanup = p.label(), deleteDot = seek(dot, deleteCell, "R");
  p.add(setDropCleanup, dot, setRedexCleanup, dot, "L");
  p.add(setRedexCleanup, "", setRedexCleanup, "", "L");
  p.add(setRedexCleanup, redex("drop"), deleteDot, redex("redex"), "R");
  p.add(afterDelete, redex("redex"), deleteCell);
  for (let depth = 0; depth <= capacity; depth++) {
    const body = `λ.body.${depth}`, testIndex = `λ.body.index.${depth}`;
    p.add(body, "", body, "", "R"); p.add(body, bodyEnd, setCleanup, bodyEnd, "L");
    for (const symbol of abstractions) p.add(body, symbol, depth === capacity ? lambdaLimit : `λ.body.${depth + 1}`, symbol, "R");
    p.add(body, absEnd, depth ? `λ.body.${depth - 1}` : lambdaHalt, absEnd, "R");
    const nameScan = `λ.body.name.${depth}`;
    for (const symbol of bound) p.add(body, symbol, nameScan, symbol, "R");
    p.add(nameScan, "", nameScan, "", "R"); p.add(nameScan, nameEnd, testIndex, nameEnd, "R");
    for (let i = 0; i <= capacity; i++) {
      if (i !== depth) p.add(testIndex, indices[i], body, indices[i > depth ? i - 1 : i], "R");
      else {
        const replace = `λ.body.replace.${depth}`;
        p.add(testIndex, indices[i], replace, deleted, "L");
        p.add(replace, "", replace, "", "L");
        for (const symbol of bound) p.add(replace, symbol, setCopy, placeholders[depth], "L");
      }
    }
  }
  return {
    category: "基础示例", name: "λ 表达式归约", description: "完整变量名支持 A–Z、a–z、数字、下划线和点号；应用用空格分隔，带点的参数写作 λA.B . A.B。按最左最外 β 归约，保留变量名，冲突时加数字后缀。纸带表达式保留在原处，仅替换当前子式并就近挪格。",
    input: source,
    initialState: lambdaStart, blankSymbol: lambdaBlank, acceptStates: lambdaAccept, rejectStates: lambdaReject,
    haltStates: `${lambdaHalt},${lambdaLimit}`, maxSteps: null,
    lambdaSource: { source, capacity, betaState: lambdaBeta },
    rules: `# lambda-local ${JSON.stringify({ source, capacity, betaState: lambdaBeta })}\n` + p.source(),
  };
}

/** Upgrade unchanged generated projects from the earlier encoded-input version. */
export function migrateLambdaInput<T extends ExampleProject>(project: T): T {
  if (project.initialState !== lambdaStart || !/^t#\(λ\.token\.\d+\)/.test(project.input)) return project;
  const metadata = project.lambdaSource ?? readLambdaSource(project.rules);
  if (!metadata) return project;
  const body = (rules: string) => rules.split(/\r?\n/).map(line => line.trim())
    .filter(line => line && !line.startsWith("#") && !line.startsWith(lambdaStart + ",") && !line.startsWith("lambda.input."))
    .map(line => line.replace(/\s*->\s*/g, "->")).join("\n");
  try {
    const replacement = makeLambdaProject(metadata.source);
    if (body(project.rules) === body(replacement.rules)) return { ...project, input: replacement.input, rules: replacement.rules, lambdaSource: replacement.lambdaSource };
  } catch { /* Keep edited or incomplete projects intact. */ }
  return project;
}

export function readLambdaSource(rules: string): { source: string; capacity: number; betaState?: string } | undefined {
  const match = /^# lambda-local (.+)$/m.exec(rules);
  if (!match) return undefined;
  try { const value = JSON.parse(match[1]); if (typeof value.source === "string" && Number.isInteger(value.capacity)) return value; } catch { /* Edited source has no metadata. */ }
}

/** Decode only; no beta reduction is performed outside the tape machine. */
export function readLambdaOutput(tape: Tape): { output: string; literal: string; display: Map<number, string>; parentheses: Map<number, string> } | undefined {
  const cells = tape.entries().filter(([position]) => position >= 0);
  let offset = 0;
  const positions = new WeakMap<LambdaTerm, { position: number; end?: number; wrapped: boolean; slots?: number[] }>();
  const isTrivia = (token: string) => /^\s$/.test(token) || token.endsWith("#(λ.literal)");
  const skipTrivia = () => {
    let wrapped = false;
    while (offset < cells.length && isTrivia(cells[offset][1])) {
      if (visibleTapeSymbol(cells[offset][1]) === "(") wrapped = true;
      offset++;
    }
    return wrapped;
  };
  const character = (token: string) => /^([A-Za-z0-9_.])#\(λ\.(?:char|free\.first|bound\.first)\)$/.exec(token)?.[1];
  const readName = (first?: [number, string]) => {
    let name = "";
    const slots: number[] = [];
    const consume = ([position, token]: [number, string]) => {
      const char = character(token);
      if (!char && token !== namePad) throw new Error("Incomplete name");
      slots.push(position);
      name += char ?? "";
    };
    if (first) consume(first);
    while (offset < cells.length && cells[offset][1] !== nameEnd) consume(cells[offset++]);
    const end = cells[offset++];
    if (end?.[1] !== nameEnd || !name) throw new Error("Incomplete name");
    slots.push(end[0]);
    return { name, slots };
  };
  const read = (depth: number): LambdaTerm => {
    if (depth > 1024) throw new Error("Too deep");
    const wrapped = skipTrivia();
    const [position, token] = cells[offset++] ?? [];
    let value: LambdaTerm;
    let slots: number[] | undefined;
    let end: number | undefined;
    if (token === app) {
      const left = read(depth + 1);
      if (cells[offset++]?.[1] !== appSep) throw new Error("Incomplete application");
      value = { kind: "app", left, right: read(depth + 1) };
      const close = cells[offset++];
      if (close?.[1] !== appEnd) throw new Error("Incomplete application");
      end = close[0];
    } else if (token === absOpen) {
      if (![lambdaGlyph, slashGlyph].includes(cells[offset++]?.[1])) throw new Error("Incomplete lambda");
      skipTrivia();
      const name = readName();
      slots = name.slots;
      skipTrivia();
      if (cells[offset++]?.[1] !== dot) throw new Error("Incomplete lambda");
      value = { kind: "abs", name: name.name, body: read(depth + 1) };
      const close = cells[offset++];
      if (close?.[1] !== absEnd) throw new Error("Incomplete abstraction");
      end = close[0];
    } else if (token?.endsWith("#(λ.free.first)") || token?.endsWith("#(λ.bound.first)")) {
      const name = readName([position, token]);
      slots = name.slots;
      if (token.endsWith("#(λ.free.first)")) value = { kind: "free", name: name.name };
      else {
        const index = /^#\(λ.index.(\d+)\)$/.exec(cells[offset++]?.[1] ?? "");
        if (!index) throw new Error("Incomplete variable");
        value = { kind: "bound", index: Number(index[1]) };
      }
    } else if (token?.endsWith("#(λ.abs)")) {
      value = { kind: "abs", name: token.slice(token.startsWith("(λ") ? 2 : 1, -".#(λ.abs)".length), body: read(depth + 1) };
      if (cells[offset++]?.[1] !== absEnd) throw new Error("Incomplete abstraction");
    } else if (token?.endsWith("#(λ.free)")) value = { kind: "free", name: token.slice(0, -"#(λ.free)".length) };
    else if (token?.endsWith("#(λ.bound)")) {
      const index = /^#\(λ.index.(\d+)\)$/.exec(cells[offset++]?.[1] ?? "");
      if (!index) throw new Error("Incomplete variable");
      value = { kind: "bound", index: Number(index[1]) };
    } else throw new Error("Reduction in progress");
    skipTrivia();
    positions.set(value, { position, end, wrapped, slots });
    return value;
  };
  try {
    const term = read(0);
    if (offset !== cells.length) return undefined;
    const display = new Map<number, string>();
    const parentheses = new Map<number, string>();
    const output = formatLambdaTerm(term, undefined, (value, name) => {
      const cell = positions.get(value);
      if (!cell) return;
      if (cell.slots) {
        const chars = [...name];
        if (chars.length > cell.slots.length) throw new Error("Name exceeds allocated character cells");
        for (const [i, position] of cell.slots.entries()) display.set(position, chars[i] ?? "");
      } else display.set(cell.position, value.kind === "abs" ? `(λ${name}.` : name);
    }, (value, required) => {
      const cell = positions.get(value);
      if (required && cell && !cell.wrapped && cell.end !== undefined) {
        parentheses.set(cell.position, "("); parentheses.set(cell.end, ")");
      }
    });
    return { output, literal: cells.map(([, token]) => visibleTapeSymbol(token)).join(""), display, parentheses };
  } catch { return undefined; }
}
