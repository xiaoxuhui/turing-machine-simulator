import { describe, expect, it } from "vitest";
import { campaignLevels, completeLevel, emptyCampaignProgress, isLevelUnlocked, normalizeCampaignProgress, tapeOutput, verifyLevel } from "../src/campaign";
import { parseTransitions, Tape, type MachineDefinition } from "../src/core";

function definitionFor(levelIndex: number): MachineDefinition {
  const project = campaignLevels[levelIndex].template;
  return {
    blankSymbol: project.blankSymbol,
    initialState: project.initialState,
    acceptStates: [],
    rejectStates: [],
    haltStates: project.haltStates.split(",").filter(Boolean),
    transitions: parseTransitions(project.rules).transitions,
  };
}

describe("campaign verification", () => {
  it.each(campaignLevels.map((level, index) => [level.title, index] as const))("accepts the supplied solution for %s", (_title, index) => {
    const result = verifyLevel(campaignLevels[index], definitionFor(index));
    expect(result.passed).toBe(true);
    expect(result.passedCount).toBe(result.totalCount);
  });

  it("reports the first observable wrong output", () => {
    const result = verifyLevel(campaignLevels[1], definitionFor(0));
    expect(result.passed).toBe(false);
    expect(result.cases.find((testCase) => !testCase.passed)).toMatchObject({ input: "1", expectedOutput: "11", actualOutput: "1" });
  });

  it("stops a non-halting solution at the level limit", () => {
    const definition: MachineDefinition = {
      blankSymbol: "□", initialState: "q0", acceptStates: [], rejectStates: [], haltStates: [],
      transitions: parseTransitions("q0,□ -> q0,□,N").transitions,
    };
    const result = verifyLevel(campaignLevels[0], definition);
    expect(result.cases[0]).toMatchObject({ reason: "step-limit", steps: campaignLevels[0].maxSteps, passed: false });
  });

  it("serializes the occupied tape range including internal blanks", () => {
    expect(tapeOutput(new Tape("□", [[-1, "1"], [1, "1"]]))).toBe("1□1");
    expect(tapeOutput(new Tape("□"))).toBe("");
  });
});

describe("campaign progress", () => {
  it("unlocks levels in order", () => {
    const initial = emptyCampaignProgress();
    expect(isLevelUnlocked(initial, campaignLevels[0].id)).toBe(true);
    expect(isLevelUnlocked(initial, campaignLevels[1].id)).toBe(false);
    const afterFirst = completeLevel(initial, campaignLevels[0].id);
    expect(isLevelUnlocked(afterFirst, campaignLevels[1].id)).toBe(true);
    expect(completeLevel(initial, campaignLevels[1].id)).toBe(initial);
  });

  it("filters corrupt, duplicate, and unknown saved entries", () => {
    expect(normalizeCampaignProgress({ version: 1, completedLevelIds: ["write-one", "write-one", "unknown", 42] })).toEqual({
      version: 1,
      completedLevelIds: ["write-one"],
    });
    expect(normalizeCampaignProgress({ version: 2, completedLevelIds: ["write-one"] })).toEqual(emptyCampaignProgress());
    expect(isLevelUnlocked(emptyCampaignProgress(), "unknown")).toBe(false);
  });
});
