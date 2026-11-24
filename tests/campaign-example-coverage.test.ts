import { expect, it } from "vitest";
import { examples } from "../src/examples";
import { builtinExamples } from "../src/example-catalog";
import { campaignLevels, coreCampaignLevels, completeLevel, emptyCampaignProgress, isLevelUnlocked, normalizeCampaignProgress, verifyLevel } from "../src/campaign";
import { exampleLevelId } from "../src/example-level-links";
import { examplePrinciples } from "../src/example-principles";
import { parseTransitions, type MachineDefinition } from "../src/core";
import { solutionRules } from "../src/campaign-solutions";
import { encodeCampaignBackup, parseCampaignBackup } from "../src/campaign-backup";

it("maps every original and campaign example to a real playable level without recursive duplication", () => {
  expect(Object.keys(builtinExamples)).toHaveLength(44);
  expect(coreCampaignLevels).toHaveLength(48);
  expect(campaignLevels).toHaveLength(78);
  expect(Object.keys(examples)).toHaveLength(122);
  for (const [id, project] of Object.entries(examples)) {
    expect(campaignLevels.some(level => level.id === project.campaignLevelId), id).toBe(true);
    expect(examplePrinciples.find(principle => principle.id === id)?.levelId).toBe(project.campaignLevelId);
  }
  for (const id of Object.keys(builtinExamples)) expect(solutionRules[exampleLevelId(id)]).toBeDefined();
  for (const id of ["gijswijt-tool", "universal-tool"]) expect(campaignLevels.some(level => level.id === examplePrinciples.find(item => item.id === id)?.levelId)).toBe(true);
});

it("removes retired busy-beaver content while keeping other progress and old backups usable", () => {
  expect(Object.keys(examples).some(id => /beaver/i.test(id))).toBe(false);
  expect(campaignLevels.some(level => /beaver|海狸/i.test(level.id + level.title))).toBe(false);
  expect(examplePrinciples.some(item => /beaver|海狸/i.test(item.id + item.name))).toBe(false);
  const oldProgress = { version: 1, completedLevelIds: ["write-one", "example-beaver4"], drafts: { "write-one": "saved", "example-beaver4": "retired" } };
  expect(normalizeCampaignProgress(oldProgress)).toEqual({ version: 1, completedLevelIds: ["write-one"], drafts: { "write-one": "saved" } });
  const historicalBackup = JSON.stringify({ format: "turing-machine-campaign", version: 1, exportedAt: "2026-11-24T00:00:00.000Z", progress: oldProgress });
  expect(parseCampaignBackup(historicalBackup)).toEqual({ version: 1, completedLevelIds: ["write-one"], drafts: { "write-one": "saved" } });
});

it("preserves the old learning frontier while opening related example practice", () => {
  const old = normalizeCampaignProgress({ version: 1, completedLevelIds: ["binary-increment"], drafts: { "function-wrap": "saved" } });
  expect(isLevelUnlocked(old, "function-wrap")).toBe(true);
  expect(isLevelUnlocked(old, "example-functionBasics")).toBe(true);
  const after = completeLevel(old, "example-functionBasics");
  expect(isLevelUnlocked(after, "unary-power")).toBe(false);
  expect(after.drafts["function-wrap"]).toBe("saved");
  expect(isLevelUnlocked(emptyCampaignProgress(), "example-functionBasics")).toBe(false);
});

it("requires the correct terminal result rather than accepting a matching tape with no rule", () => {
  const level = campaignLevels.find(level => level.id === "write-one")!;
  const fake: MachineDefinition = { blankSymbol: "□", initialState: "q0", haltStates: ["HALT"], acceptStates: [], rejectStates: [], transitions: parseTransitions("q0,□->missing,1,N").transitions };
  expect(verifyLevel(level, fake).cases[0]).toMatchObject({ actualOutput: "1", reason: "missing-transition", passed: false });
});

it("rejects a fake always-accept decision machine", () => {
  const palindrome = campaignLevels.find(level => level.sourceExampleId === "palindrome")!;
  const yes: MachineDefinition = { blankSymbol: "□", initialState: "ACCEPT", haltStates: [], acceptStates: ["ACCEPT"], rejectStates: ["REJECT"], transitions: [] };
  expect(verifyLevel(palindrome, yes).passed).toBe(false);
});

it("backs up and restores a full large lambda draft rather than silently discarding it", () => {
  const rules = solutionRules["example-lambda"];
  expect(rules.length).toBeGreaterThan(100000);
  const progress = normalizeCampaignProgress({ version: 1, completedLevelIds: [], drafts: { "example-lambda": rules } });
  expect(progress.drafts["example-lambda"]).toBeDefined();
  expect(parseCampaignBackup(encodeCampaignBackup(progress)).drafts["example-lambda"]).toBe(progress.drafts["example-lambda"]);
});
