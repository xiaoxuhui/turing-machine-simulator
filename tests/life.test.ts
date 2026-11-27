import { describe, expect, it } from "vitest";
import { emptyLife, LifeWorld, LIFE_SHAPES, lifeBounds, type LifePoint } from "../src/life";
import { lifePresets } from "../src/life-presets";
import { lifeJSON, lifeRLE, parseLife, validateLife } from "../src/life-format";

const sorted = (points: LifePoint[]) => points.map(p => p.join(",")).sort();
const advance = (world: LifeWorld, count: number) => { for (let n = 0; n < count; n++) world.step(); };

describe("pure B3/S23 evolution", () => {
  it("obeys all 512 center/neighborhood combinations synchronously", () => {
    const neighborhood: LifePoint[] = [];
    for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) neighborhood.push([x, y]);
    for (let mask = 0; mask < 512; mask++) {
      const cells = neighborhood.filter((_, i) => mask & 1 << i), world = new LifeWorld({ cells, generation: 0 });
      const neighbors = cells.filter(([x, y]) => x !== 0 || y !== 0).length;
      const expected = neighbors === 3 || !!(mask & 16) && neighbors === 2;
      world.step();
      expect(world.get(0, 0), `neighborhood ${mask}`).toBe(expected);
    }
  });
  it("retains a still life and evolves a blinker with period two", () => {
    const block = parseLife("OO\nOO"), world = new LifeWorld(block);
    advance(world, 10); expect(sorted(world.points())).toEqual(sorted(block.cells));
    const blinker = new LifeWorld(lifePresets.blinker.make());
    blinker.step(); expect(sorted(blinker.points())).toEqual(["1,-1", "1,0", "1,1"]);
    blinker.step(); expect(sorted(blinker.points())).toEqual(["0,0", "1,0", "2,0"]);
  });
  it("moves a glider diagonally with no wrapping or viewport clipping", () => {
    const cells = lifePresets.glider.make().cells.map(([x, y]) => [x - 1_000_000, y + 1_000_000] as LifePoint);
    const world = new LifeWorld({ cells, generation: 0 }); advance(world, 80);
    expect(sorted(world.points())).toEqual(sorted(cells.map(([x, y]) => [x + 20, y + 20])));
    expect(world.generation).toBe(80);
  });
  it("keeps the advertised pulsar and beacon periods", () => {
    for (const [id, period] of [["pulsar", 3], ["beacon", 2]] as const) {
      const pattern = lifePresets[id].make(), world = new LifeWorld(pattern);
      world.step(); expect(sorted(world.points())).not.toEqual(sorted(pattern.cells));
      advance(world, period - 1); expect(sorted(world.points())).toEqual(sorted(pattern.cells));
    }
  });
  it("propagates the signal demonstration through real cells, gated by an eater", () => {
    for (const value of [0, 1]) {
      const pattern = lifePresets.ports.make(), world = new LifeWorld(pattern), input = pattern.ports[0], output = pattern.ports[1];
      if (value) world.toggle(input);
      advance(world, 231); expect(world.read(output)).toBe(value);
      advance(world, 60); expect(world.read(output)).toBe(value);
    }
  });
  it("toggles only the seven eater cells and refuses to erase an in-flight signal", () => {
    const pattern = lifePresets.ports.make(), world = new LifeWorld(pattern), input = pattern.ports[0], before = sorted(world.points());
    world.toggle(input); expect(input.value).toBe(1); expect(world.population).toBe(pattern.cells.length - 7);
    expect(world.generation).toBe(0);
    world.toggle(input); expect(sorted(world.points())).toEqual(before);
    world.set(input.x + 3, input.y, true);
    expect(() => world.toggle(input)).toThrow("有信号经过");
    expect(world.get(input.x + 3, input.y)).toBe(true);
  });
  it("reads the actual specified output shape and handles an empty universe", () => {
    const pattern = emptyLife(), world = new LifeWorld(pattern);
    world.step(); expect(world.population).toBe(0); expect(world.generation).toBe(1);
    expect(lifeBounds([])).toBeNull();
    for (const shape of ["cell", "glider", "lwss"] as const) {
      const world = new LifeWorld({ cells: LIFE_SHAPES[shape].map(([x, y]) => [x - 100, y - 200]), generation: 0 });
      const port = { id: "probe", kind: "output" as const, label: "Y", x: -100, y: -200, shape, value: 0 as const };
      expect(world.read(port)).toBe(1); world.set(-100 + LIFE_SHAPES[shape][0][0], -200 + LIFE_SHAPES[shape][0][1], false);
      expect(world.read(port)).toBe(0);
    }
  });
});

describe("Golly and Logic Workshop interchange", () => {
  it.each(Object.keys(lifePresets))("round-trips every cell, coordinate, port and generation of %s", id => {
    const pattern = lifePresets[id].make(); pattern.generation = 234;
    pattern.cells = pattern.cells.map(([x, y]) => [x - 120, y - 250]);
    pattern.comments = ["#C Original pattern and attribution retained."];
    const encoded = lifeRLE(pattern), decoded = parseLife(encoded);
    expect(encoded).toContain("rule = B3/S23");
    expect(sorted(decoded.cells)).toEqual(sorted(pattern.cells));
    expect(decoded.ports).toEqual(pattern.ports); expect(decoded.generation).toBe(234);
    expect(decoded.comments).toEqual(pattern.comments); expect(decoded.sampling).toEqual(pattern.sampling);
    expect(parseLife(lifeJSON(pattern))).toEqual(pattern);
  });
  it("retains sparse empty rows without expanding the empty area", () => {
    const pattern = { ...emptyLife(), cells: [[-500_000, -1], [500_000, 1_000_000]] as LifePoint[] };
    const encoded = lifeRLE(pattern);
    expect(encoded.length).toBeLessThan(300);
    expect(sorted(parseLife(encoded).cells)).toEqual(sorted(pattern.cells));
  });
  it("recognizes Logic Workshop input switches, output phases and sample intervals", () => {
    const text = `#CXRLE Pos=-100,-200 Gen=0
#C Logic Workshop - Conway Life circuit
#C Input A = 0 at (-10, -20) (switch eater: 2o$obo$2bo$2b2o!)
#C Sample the output probes at generation 0 and every 3600 generations thereafter.
#C An eastbound lightweight spaceship at the marked output is 1.
#C Y at (-1000, 210)
#C NAND root/g gate at (1, 2)
x = 3, y = 3, rule = B3/S23
bo$2bo$3o!`;
    const pattern = parseLife(text);
    expect(pattern.ports).toHaveLength(2);
    expect(pattern.ports[0]).toMatchObject({ kind: "input", label: "A", x: -10, y: -20, shape: "eater", value: 0 });
    expect(pattern.ports[1]).toMatchObject({ kind: "output", label: "Y", x: -1000, y: 210, shape: "lwss" });
    expect(pattern.sampling).toEqual({ start: 0, period: 3600 });
    expect(pattern.cells[0]).toEqual([-99, -200]);
    expect(parseLife(lifeRLE(pattern)).ports).toEqual(pattern.ports);
  });
  it("recognizes glider circuits' settling delay and preserves the reset seed in JSON", () => {
    const pattern = parseLife("#C After about 10800 generations, look for moving gliders in each marked 40x40 output area (present=1).\n#C Y at (1, 2)\nx=1,y=1\no!");
    expect(pattern.sampling).toEqual({ start: 10800, period: 60 });
    expect(pattern.ports[0].shape).toBe("glider");
    const seed = lifePresets.glider.make(), encoded = lifeJSON(pattern, seed);
    expect(validateLife(JSON.parse(encoded).seed)).toEqual(seed);
  });
  it("uses the rotated eater footprint exported by timed Logic Workshop circuits", () => {
    const pattern = parseLife("#C Input A = 0 at (0, 0) (switch eater: 2b2o$2bo$obo$2o!)\nx=4,y=4,rule=B3/S23\n2b2o$2bo$obo$2o!");
    const world = new LifeWorld(pattern);
    expect(pattern.ports[0].switchCells).toHaveLength(7);
    world.toggle(pattern.ports[0]); expect(world.population).toBe(0);
    world.toggle(pattern.ports[0]); expect(world.population).toBe(7);
  });
  it.each(["x=3,y=3\nbo$2bo$3o", "!Name\n.O.\n..O\nOOO", "010\n001\n111"])("accepts standard fragments and plain patterns", text => {
    expect(sorted(parseLife(text).cells)).toEqual(sorted(lifePresets.glider.make().cells));
  });
  it.each([
    "x=1,y=1,rule=W110\no!", "x=1,y=1,rule=B36/S23\no!", "x=1,y=1\n0o!", "x=1,y=1\n-2o!", "x=1,y=1\n4000001o!", "x=1,y=1\no!o", "x=1,y=1\nA2B!", "not a pattern",
  ])("rejects incompatible rules or malformed data without changing a universe", text => {
    expect(() => parseLife(text)).toThrow();
  });
});
