import { expect, it } from "vitest";
import { binaryWordMacrocell, exportRule110Macrocell, exportRule110Rle, golly110Rule } from "../src/rule110-golly";
import { joinWords, repeatWord, textWord } from "../src/rule110-word";
import { rule110InitialBit } from "../src/rule110";

function readMacrocell(body: string, x: bigint, y: bigint): number {
  const nodes: Array<{ level: number; children?: number[]; rows?: string[] }> = [{ level: 0 }];
  for (const line of body.trim().split("\n")) {
    if (/^[.*$]/.test(line)) nodes.push({ level: 3, rows: line.split("$") });
    else {
      const [level, ...children] = line.split(" ").map(Number);
      expect(children).toHaveLength(4); expect(children.every(id => id < nodes.length)).toBe(true);
      nodes.push({ level, children });
    }
  }
  const root = nodes.at(-1)!, half = 1n << BigInt(root.level - 1);
  let px = x + half, py = y - 1n + half, id = nodes.length - 1;
  while (id) {
    const node = nodes[id];
    if (node.rows) return node.rows[Number(py)]?.[Number(px)] === "*" ? 1 : 0;
    const side = 1n << BigInt(node.level - 1), east = px >= side, south = py >= side;
    id = node.children![(south ? 2 : 0) + (east ? 1 : 0)];
    if (east) px -= side; if (south) py -= side;
  }
  return 0;
}
it("writes native W110 RLE with exactly the selected causal guard cells", () => {
  const initial = { left: textWord("101"), center: textWord("01011"), right: textWord("0011") };
  const options = { origin: -2n, width: 20, steps: 6 };
  const result = exportRule110Rle(initial, options);
  expect(result.text).toContain("x = 32, y = 1, rule = W110");
  expect(result.text).toContain("through generation 6");
  const body = result.text.split("\n").filter(line => !line.startsWith("#") && !line.startsWith("x")).join("");
  const bits = [...body.matchAll(/(\d*)([bo])/g)].map(match => (match[2] === "o" ? "1" : "0").repeat(Number(match[1] || 1))).join("");
  expect(bits.length).toBe(32);
  expect(bits).toBe(Array.from({ length: 32 }, (_, index) => rule110InitialBit(initial, -8n + BigInt(index))).join(""));
});
it("preserves every central bit in Macrocell with both guard regions", () => {
  const initial = { left: textWord("101"), center: repeatWord(textWord("00110"), 19), right: textWord("011") };
  const result = exportRule110Macrocell(initial, { origin: 999n, width: 16, steps: 9 });
  expect(result.text).toContain("#R W110"); expect(result.extension).toBe("mc"); expect(result.cells).toBe("113");
  const body = result.text.split("\n").filter(line => line && !line.startsWith("#") && !line.startsWith("[")).join("\n");
  for (let x = 0; x < 113; x++) expect(readMacrocell(body, BigInt(x), 1n)).toBe(rule110InitialBit(initial, BigInt(x - 9)));
  expect(readMacrocell(body, 4n, 0n)).toBe(0);
});
it("compresses an astronomical repeated word without expanding the cells", () => {
  const word = joinWords([textWord("11"), repeatWord(textWord("001"), 10n ** 60n), textWord("101")]);
  const tree = binaryWordMacrocell(word);
  expect(tree.nodes).toBeLessThan(1500);
  for (const position of [0n, 1n, 2n, 12n, word.length - 4n, word.length - 1n]) {
    const expected = position < 2n ? 1 : position >= word.length - 3n ? Number("101"[Number(position - word.length + 3n)]) : Number("001"[Number((position - 2n) % 3n)]);
    expect(readMacrocell(tree.body, position, 1n)).toBe(expected);
  }
});
it("rejects invalid export horizons rather than emitting misleading Golly data", () => {
  const initial = { left: textWord("1"), center: textWord("1"), right: textWord("0") };
  expect(() => exportRule110Rle(initial, { origin: 0n, width: 20, steps: -1 })).toThrow();
  expect(() => exportRule110Macrocell(initial, { origin: 0n, width: 20, steps: 1.5 })).toThrow();
});
it("writes automatic cylinder dimensions and centers odd and even patterns inside Golly's bounds", () => {
  for (const width of [16, 17]) {
    const initial = { left: textWord("101"), center: textWord("10011".repeat(width)), right: textWord("011") };
    const options = { origin: 0n, width, steps: 7, topology: "cylinder" as const };
    const rle = exportRule110Rle(initial, options);
    expect(rle.rule).toBe(`W110:T${width + 14},0`);
    expect(rle.text).toContain(`#CXRLE Pos=${-Math.floor((width + 14) / 2)},0`);
    const mc = exportRule110Macrocell(initial, options), count = BigInt(mc.cells), start = BigInt(mc.originX);
    expect(mc.rule).toBe(`W110:T${count},0`);
    const body = mc.text.split("\n").filter(line => line && !line.startsWith("#") && !line.startsWith("[")).join("\n");
    for (let index = 0n; index < count; index++) expect(readMacrocell(body, start + index, 1n)).toBe(rule110InitialBit(initial, index - 7n));
  }
  expect(() => golly110Rule(2000000001n, "cylinder")).toThrow("2000000000");
});
