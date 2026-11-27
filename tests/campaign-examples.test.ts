import { expect, it } from "vitest";
import { examples } from "../src/examples";
import { campaignLevels, isLevelUnlocked, normalizeCampaignProgress, verifyLevel } from "../src/campaign";
import { extraCampaignLevels } from "../src/campaign-extra";
import { exampleSource } from "../src/example-source";
import { parseTransitions, resolveInitialState } from "../src/core";
import { examplePrinciples } from "../src/example-principles";

it.each(campaignLevels)("offers a runnable laboratory solution for $id, in both comment styles", level => {
  const project = examples[`campaign-${level.id}`];
  expect(project.campaignLevelId).toBe(level.id);
  expect(project.category).toBe("关卡示例");
  const options = { haltStates: project.haltStates.split(",").filter(Boolean), acceptStates: project.acceptStates.split(",").filter(Boolean), rejectStates: project.rejectStates.split(",").filter(Boolean) };
  const plain = parseTransitions(exampleSource(project, "plain"), options);
  const commented = parseTransitions(exampleSource(project, "commented"), options);
  expect(plain.errors).toEqual([]);
  expect(commented.errors).toEqual([]);
  expect(commented.transitions).toEqual(plain.transitions);
  const result = verifyLevel(level, { ...options, initialState: resolveInitialState(plain, project.initialState), blankSymbol: project.blankSymbol, transitions: plain.transitions });
  expect(result.passed, JSON.stringify(result.cases.filter(item => !item.passed))).toBe(true);
  expect(level.cases.some(item => item.input === project.input)).toBe(true);
});

it("covers every laboratory example and every level with a principle and a valid link", () => {
  expect(new Set(examplePrinciples.map(item => item.id)).size).toBe(examplePrinciples.length);
  for (const [id, project] of Object.entries(examples).filter(([, item]) => item.category !== "忙碌海狸")) {
    const principle = examplePrinciples.find(item => item.id === id)!;
    expect(principle, id).toBeDefined();
    expect(principle.name).toBe(project.name);
    expect(principle.summary.length).toBeGreaterThan(20);
    expect(principle.steps.length).toBeGreaterThanOrEqual(3);
    expect(principle.walkthrough.length).toBeGreaterThan(0);
    expect(new URL(principle.laboratoryUrl, "https://example.test/turing-machine-simulator/").searchParams.get("example")).toBe(id);
    if (principle.levelId) expect(campaignLevels.some(level => level.id === principle.levelId)).toBe(true);
  }
  expect(examplePrinciples.some(item => item.id === "gijswijt")).toBe(true);
  expect(examplePrinciples.some(item => item.id === "fibonacciDecimal")).toBe(true);
  expect(examplePrinciples.some(item => item.id === "universal")).toBe(true);
});

it("places simple binary drills before combined algorithms and preserves stable level IDs", () => {
  expect(extraCampaignLevels).toHaveLength(20);
  const index = (id: string) => campaignLevels.findIndex(level => level.id === id);
  expect(index("binary-place-zero")).toBeLessThan(index("binary-carry-local"));
  expect(index("binary-carry-local")).toBeLessThan(index("binary-carry-chain"));
  expect(index("binary-carry-chain")).toBeLessThan(index("binary-increment"));
  expect(index("binary-borrow-chain")).toBeLessThan(index("binary-decrement"));
  expect(index("binary-subtraction")).toBeLessThan(index("binary-division"));
  const previous = normalizeCampaignProgress({ version: 1, completedLevelIds: ["binary-increment"], drafts: { "function-wrap": "saved" } });
  expect(isLevelUnlocked(previous, "function-wrap")).toBe(true);
  expect(previous.drafts["function-wrap"]).toBe("saved");
});
