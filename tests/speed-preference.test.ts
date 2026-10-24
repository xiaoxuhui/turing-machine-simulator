import { describe, expect, it } from "vitest";
import { loadSpeedPreference, saveSpeedPreference } from "../src/speed-preference";

describe("speed preference", () => {
  it("round-trips only the speed without serializing the machine", () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    expect(saveSpeedPreference(storage, 25)).toBeNull();
    expect([...values.values()]).toEqual(["25"]);
    expect(loadSpeedPreference(storage)).toBe(25);
    saveSpeedPreference(storage, 137);
    expect(loadSpeedPreference(storage)).toBe(137);
  });
  it("ignores absent or invalid preferences instead of forcing the maximum", () => {
    for (const raw of [null, "", " ", "0", "1001", "NaN", "Infinity", "1.5", "{}"]) {
      expect(loadSpeedPreference({ getItem: () => raw })).toBeNull();
    }
  });
  it("keeps storage failures recoverable", () => {
    expect(loadSpeedPreference({ getItem: () => { throw new Error("disabled"); } })).toBeNull();
    expect(saveSpeedPreference({ setItem: () => { throw new Error("quota"); } }, 25)).toContain("当前页调速仍可使用");
  });
});
