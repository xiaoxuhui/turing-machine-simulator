import { describe, expect, it } from "vitest";
import { campaignLevels, completeLevel, emptyCampaignProgress, isLevelUnlocked, normalizeCampaignProgress, tapeOutput, verifyLevel } from "../src/campaign";
import { parseTransitions, Tape, type MachineDefinition } from "../src/core";

const solutionRules: Record<string, string> = {
  "write-one": "q0,□ -> HALT,1,N",
  "unary-increment": "q0,1 -> q0,1,R\nq0,□ -> HALT,1,N",
  "erase-one": "q0,1 -> HALT,□,N",
  "erase-unary": "q0,1 -> q0,□,R\nq0,□ -> HALT,□,N",
  "zeros-to-ones": "q0,0 -> q0,1,R\nq0,1 -> q0,1,R\nq0,□ -> HALT,□,N",
  "binary-complement": "q0,0 -> q0,1,R\nq0,1 -> q0,0,R\nq0,□ -> HALT,□,N",
  "turn-back": "scan,0 -> scan,0,R\nscan,1 -> scan,1,R\nscan,□ -> last,□,L\nlast,0 -> HALT,1,N\nlast,1 -> HALT,1,N",
  "binary-increment": "scan,0 -> scan,0,R\nscan,1 -> scan,1,R\nscan,□ -> carry,□,L\ncarry,0 -> HALT,1,N\ncarry,1 -> carry,0,L\ncarry,□ -> HALT,1,N",
};

function definitionFor(levelIndex: number): MachineDefinition {
  const level = campaignLevels[levelIndex];
  const project = level.starter;
  return {
    blankSymbol: project.blankSymbol,
    initialState: project.initialState,
    acceptStates: [],
    rejectStates: [],
    haltStates: project.haltStates.split(",").filter(Boolean),
    transitions: parseTransitions(solutionRules[level.id]).transitions,
  };
}

describe("campaign verification", () => {
  it.each(campaignLevels.map((level, index) => [level.title, index] as const))("accepts the supplied solution for %s", (_title, index) => {
    const result = verifyLevel(campaignLevels[index], definitionFor(index));
    expect(result.passed).toBe(true);
    expect(result.passedCount).toBe(result.totalCount);
  });

  it("does not ship complete solutions in starter drafts", () => {
    for (const level of campaignLevels) {
      expect(level.starter.rules.trim()).not.toBe(solutionRules[level.id]);
      expect(verifyLevel(level, {
        blankSymbol: level.starter.blankSymbol,
        initialState: level.starter.initialState,
        acceptStates: [], rejectStates: [], haltStates: ["HALT"],
        transitions: parseTransitions(level.starter.rules).transitions,
      }).passed).toBe(false);
    }
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

  it("reports the exact state and symbol for a missing transition", () => {
    const definition: MachineDefinition = {
      blankSymbol: "□", initialState: "q0", acceptStates: [], rejectStates: [], haltStates: ["HALT"],
      transitions: parseTransitions("q0,□ -> q1,1,N").transitions,
    };
    expect(verifyLevel(campaignLevels[0], definition).cases[0]).toMatchObject({
      reason: "missing-transition",
      stoppedState: "q1",
      readSymbol: "1",
      steps: 1,
    });
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
      drafts: {},
    });
    expect(normalizeCampaignProgress({ version: 2, completedLevelIds: ["write-one"] })).toEqual(emptyCampaignProgress());
    expect(isLevelUnlocked(emptyCampaignProgress(), "unknown")).toBe(false);
  });

  it("keeps only known string drafts", () => {
    expect(normalizeCampaignProgress({
      version: 1,
      completedLevelIds: [],
      drafts: { "write-one": "q0,□ -> HALT,1,N", unknown: "answer", "erase-one": 42 },
    }).drafts).toEqual({ "write-one": "q0,□ -> HALT,1,N" });
  });
});
