import { describe, expect, it } from "vitest";
import { campaignLevels, campaignSections, completeLevel, emptyCampaignProgress, isLevelUnlocked, normalizeCampaignProgress, resetDraft, tapeOutput, uncompleteLevel, verifyLevel, type CampaignProgress } from "../src/campaign";
import { parseTransitions, Tape, type MachineDefinition } from "../src/core";

const solutionRules: Record<string, string> = {
  "write-one": "q0,□ -> HALT,1,N",
  "move-right-write": "q0,1 -> write,1,R\nwrite,□ -> HALT,1,N",
  "unary-increment": "q0,1 -> q0,1,R\nq0,□ -> HALT,1,N",
  "erase-one": "q0,1 -> HALT,□,N",
  "erase-unary": "q0,1 -> q0,□,R\nq0,□ -> HALT,□,N",
  "unary-decrement": "scan,1 -> scan,1,R\nscan,□ -> erase,□,L\nerase,1 -> HALT,□,N",
  "zeros-to-ones": "q0,0 -> q0,1,R\nq0,1 -> q0,1,R\nq0,□ -> HALT,□,N",
  "binary-complement": "q0,0 -> q0,1,R\nq0,1 -> q0,0,R\nq0,□ -> HALT,□,N",
  "turn-back": "scan,0 -> scan,0,R\nscan,1 -> scan,1,R\nscan,□ -> last,□,L\nlast,0 -> HALT,1,N\nlast,1 -> HALT,1,N",
  "binary-increment": "scan,0 -> scan,0,R\nscan,1 -> scan,1,R\nscan,□ -> carry,□,L\ncarry,0 -> HALT,1,N\ncarry,1 -> carry,0,L\ncarry,□ -> HALT,1,N",
  "copy-first-bit": "start,0 -> remember0,0,R\nstart,1 -> remember1,1,R\nremember0,0 -> remember0,0,R\nremember0,1 -> remember0,1,R\nremember0,□ -> HALT,0,N\nremember1,0 -> remember1,0,R\nremember1,1 -> remember1,1,R\nremember1,□ -> HALT,1,N",
  "alternating-unary": "write1,1 -> write0,1,R\nwrite0,1 -> write1,0,R\nwrite1,□ -> HALT,□,N\nwrite0,□ -> HALT,□,N",
  "binary-decrement": "scan,0 -> scan,0,R\nscan,1 -> scan,1,R\nscan,□ -> borrow,□,L\nborrow,0 -> borrow,1,L\nborrow,1 -> HALT,0,N",
  "unary-parity": "even,1 -> odd,□,R\nodd,1 -> even,□,R\neven,□ -> HALT,0,N\nodd,□ -> HALT,1,N",
  "twos-complement": "scan,0 -> scan,0,R\nscan,1 -> scan,1,R\nscan,□ -> seek,□,L\nseek,0 -> seek,0,L\nseek,1 -> flip,1,L\nseek,□ -> HALT,□,N\nflip,0 -> flip,1,L\nflip,1 -> flip,0,L\nflip,□ -> HALT,□,N",
  "unary-double": "seek,X -> seek,X,R\nseek,1 -> toEnd,X,R\nseek,Y -> restoreLeft,Y,L\ntoEnd,X -> toEnd,X,R\ntoEnd,1 -> toEnd,1,R\ntoEnd,Y -> toEnd,Y,R\ntoEnd,□ -> return,Y,L\nreturn,X -> return,X,L\nreturn,1 -> return,1,L\nreturn,Y -> return,Y,L\nreturn,□ -> seek,□,R\nrestoreLeft,X -> restoreLeft,1,L\nrestoreLeft,1 -> restoreLeft,1,L\nrestoreLeft,□ -> restoreRight,□,R\nrestoreRight,1 -> restoreRight,1,R\nrestoreRight,Y -> restoreRight,1,R\nrestoreRight,□ -> HALT,□,N",
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
  it("provides a 10/4/2 three-part curriculum", () => {
    expect(campaignSections.map((section) => section.id)).toEqual(["tutorial", "challenge", "hard"]);
    expect(campaignLevels).toHaveLength(16);
    expect(campaignSections.map((section) => campaignLevels.filter((level) => level.section === section.id).length)).toEqual([10, 4, 2]);
    expect(campaignLevels.map((level) => level.id).every((id, index, ids) => ids.indexOf(id) === index)).toBe(true);
  });

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

describe("campaign reset and undo", () => {
  it("resets one draft back to its starter hint without touching progress", () => {
    const progress: CampaignProgress = {
      version: 1,
      completedLevelIds: ["write-one"],
      drafts: { "write-one": "q0,□ -> HALT,1,N" },
    };
    const after = resetDraft(progress, "write-one");
    expect(after.drafts).toEqual({});
    expect(after.drafts["write-one"] ?? campaignLevels[0].starter.rules).toBe(campaignLevels[0].starter.rules);
    expect(after.completedLevelIds).toEqual(["write-one"]);
  });

  it("keeps other levels untouched when resetting one draft", () => {
    const progress: CampaignProgress = {
      version: 1,
      completedLevelIds: [],
      drafts: { "write-one": "a", "erase-one": "b" },
    };
    expect(resetDraft(progress, "write-one").drafts).toEqual({ "erase-one": "b" });
  });

  it("is a no-op when resetting a level without a draft", () => {
    const progress = emptyCampaignProgress();
    expect(resetDraft(progress, "write-one")).toBe(progress);
    expect(resetDraft(progress, "unknown")).toBe(progress);
  });

  it("removes a completed level when undoing it", () => {
    const progress: CampaignProgress = {
      version: 1,
      completedLevelIds: ["write-one", "move-right-write"],
      drafts: {},
    };
    expect(uncompleteLevel(progress, "write-one").completedLevelIds).toEqual(["move-right-write"]);
  });

  it("is a no-op when undoing a level that is not completed", () => {
    const progress = emptyCampaignProgress();
    expect(uncompleteLevel(progress, "write-one")).toBe(progress);
    expect(uncompleteLevel(progress, "unknown")).toBe(progress);
  });

  it("keeps already reached levels unlocked after undoing a middle level", () => {
    const progress: CampaignProgress = {
      version: 1,
      completedLevelIds: campaignLevels.slice(0, 5).map((level) => level.id),
      drafts: {},
    };
    const after = uncompleteLevel(progress, campaignLevels[2].id);
    expect(after.completedLevelIds).not.toContain(campaignLevels[2].id);
    for (const index of [2, 3, 4, 5]) {
      expect(isLevelUnlocked(after, campaignLevels[index].id)).toBe(true);
    }
  });

  it("still unlocks one level at a time", () => {
    const initial = emptyCampaignProgress();
    expect(isLevelUnlocked(initial, campaignLevels[0].id)).toBe(true);
    expect(isLevelUnlocked(initial, campaignLevels[1].id)).toBe(false);
    const afterFirst = completeLevel(initial, campaignLevels[0].id);
    expect(isLevelUnlocked(afterFirst, campaignLevels[1].id)).toBe(true);
    expect(isLevelUnlocked(afterFirst, campaignLevels[2].id)).toBe(false);
  });

  it("can complete a level again after undoing it", () => {
    const progress: CampaignProgress = { version: 1, completedLevelIds: ["write-one"], drafts: {} };
    const again = completeLevel(uncompleteLevel(progress, "write-one"), "write-one");
    expect(again.completedLevelIds).toContain("write-one");
  });

  it("tolerates saved progress with gaps", () => {
    const progress = normalizeCampaignProgress({
      version: 1,
      completedLevelIds: ["write-one", "erase-one"],
      drafts: {},
    });
    expect(progress.completedLevelIds).toEqual(["write-one", "erase-one"]);
    expect(isLevelUnlocked(progress, campaignLevels[4].id)).toBe(true);
    expect(isLevelUnlocked(progress, "unknown")).toBe(false);
  });
});
