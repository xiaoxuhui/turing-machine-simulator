/** A shared DAG of finite words; counts and lengths never lose integer precision. */
export type Word =
  | { kind: "text"; text: string; length: bigint }
  | { kind: "join"; parts: Word[]; length: bigint }
  | { kind: "repeat"; word: Word; count: bigint; length: bigint };
export const textWord = (text: string): Word => ({ kind: "text", text, length: BigInt(text.length) });
export function joinWords(parts: Word[]): Word {
  const nonempty = parts.filter(part => part.length);
  return nonempty.length === 1 ? nonempty[0] : { kind: "join", parts: nonempty, length: nonempty.reduce((n, part) => n + part.length, 0n) };
}
export function repeatWord(word: Word, count: bigint | number): Word {
  const n = BigInt(count);
  if (n < 0n) throw new Error("重复次数不能为负数。");
  return n === 1n ? word : !n || !word.length ? textWord("") : { kind: "repeat", word, count: n, length: word.length * n };
}
export function mapWord(word: Word, map: (char: string) => Word): Word {
  if (word.kind === "text") return joinWords([...word.text].map(map));
  if (word.kind === "join") return joinWords(word.parts.map(part => mapWord(part, map)));
  return repeatWord(mapWord(word.word, map), word.count);
}
export function wordChar(word: Word, index: bigint): string {
  if (index < 0n || index >= word.length) throw new Error("读取位置超出有限字串。");
  if (word.kind === "text") return word.text[Number(index)];
  if (word.kind === "repeat") return wordChar(word.word, index % word.word.length);
  for (const part of word.parts) {
    if (index < part.length) return wordChar(part, index);
    index -= part.length;
  }
  throw new Error("字串长度不一致。");
}
export function sliceWord(word: Word, start: bigint, end = word.length): Word {
  if (start < 0n || end < start || end > word.length) throw new Error("字串截取范围错误。");
  if (start === 0n && end === word.length) return word;
  if (start === end) return textWord("");
  if (word.kind === "text") return textWord(word.text.slice(Number(start), Number(end)));
  if (word.kind === "join") {
    let offset = 0n;
    const pieces: Word[] = [];
    for (const part of word.parts) {
      if (offset >= end) break;
      if (offset + part.length > start) pieces.push(sliceWord(part, start > offset ? start - offset : 0n, end < offset + part.length ? end - offset : part.length));
      offset += part.length;
    }
    return joinWords(pieces);
  }
  const size = word.word.length;
  const first = start / size, last = (end - 1n) / size;
  if (first === last) return sliceWord(word.word, start % size, (end - 1n) % size + 1n);
  return joinWords([sliceWord(word.word, start % size), repeatWord(word.word, last - first - 1n), sliceWord(word.word, 0n, (end - 1n) % size + 1n)]);
}
export function wordCounts(word: Word, memo = new Map<Word, Map<string, bigint>>()): Map<string, bigint> {
  const saved = memo.get(word); if (saved) return saved;
  const counts = new Map<string, bigint>();
  const add = (char: string, count: bigint) => counts.set(char, (counts.get(char) ?? 0n) + count);
  if (word.kind === "text") for (const char of word.text) add(char, 1n);
  else if (word.kind === "repeat") for (const [char, count] of wordCounts(word.word, memo)) add(char, count * word.count);
  else for (const part of word.parts) for (const [char, count] of wordCounts(part, memo)) add(char, count);
  memo.set(word, counts); return counts;
}
export function wordPreview(word: Word, count = 160): string {
  const n = Number(word.length < BigInt(count) ? word.length : BigInt(count));
  return Array.from({ length: n }, (_, index) => wordChar(word, BigInt(index))).join("") + (word.length > BigInt(n) ? "…" : "");
}

export interface PackedWords { nodes: Array<{ kind: string; text?: string; parts?: number[]; word?: number; count?: string; length: string }>; roots: number[] }
export function packWords(roots: Word[]): PackedWords {
  const nodes: PackedWords["nodes"] = [], ids = new Map<Word, number>();
  const visit = (word: Word): number => {
    const known = ids.get(word); if (known !== undefined) return known;
    const id = nodes.length; ids.set(word, id); nodes.push({ kind: word.kind, length: String(word.length) });
    nodes[id] = word.kind === "text" ? { kind: "text", text: word.text, length: String(word.length) }
      : word.kind === "join" ? { kind: "join", parts: word.parts.map(visit), length: String(word.length) }
      : { kind: "repeat", word: visit(word.word), count: String(word.count), length: String(word.length) };
    return id;
  };
  return { nodes, roots: roots.map(visit) };
}
export function unpackWords(data: PackedWords): Word[] {
  if (!data || !Array.isArray(data.nodes) || !Array.isArray(data.roots) || data.nodes.length > 500000) throw new Error("压缩配置无效或过大。");
  const memo = new Map<number, Word>(), visiting = new Set<number>();
  const visit = (id: number): Word => {
    if (!Number.isSafeInteger(id) || id < 0 || id >= data.nodes.length || visiting.has(id)) throw new Error("压缩配置包含无效引用或循环。");
    const saved = memo.get(id); if (saved) return saved;
    visiting.add(id); const node = data.nodes[id];
    const word = node.kind === "text" && typeof node.text === "string" ? textWord(node.text)
      : node.kind === "join" && Array.isArray(node.parts) ? joinWords(node.parts.map(visit))
      : node.kind === "repeat" && typeof node.count === "string" && /^\d+$/.test(node.count) ? repeatWord(visit(node.word!), BigInt(node.count)) : undefined;
    if (!word || String(word.length) !== node.length) throw new Error("压缩配置长度不一致。");
    visiting.delete(id); memo.set(id, word); return word;
  };
  return data.roots.map(visit);
}
