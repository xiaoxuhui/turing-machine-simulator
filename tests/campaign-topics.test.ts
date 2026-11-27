import { expect, it } from "vitest";
import { campaignLevels, coreCampaignLevels, completeLevel, emptyCampaignProgress, isLevelUnlocked, nextCampaignLevel } from "../src/campaign";
import { campaignTopics, campaignTopicFor, orderCampaignLevels } from "../src/campaign-topics";
import { originalCampaignLevelIds } from "../src/campaign-order";

it("preserves every historical lesson's order and inserts only the new sequence lesson", () => {
  const ids = campaignLevels.map(level => level.id);
  expect(originalCampaignLevelIds).toHaveLength(78);
  expect(ids.filter(id => id !== "example-fibonacciDecimal")).toEqual(originalCampaignLevelIds);
  expect(ids[ids.indexOf("example-gijswijt") + 1]).toBe("example-fibonacciDecimal");
  expect(ids.slice(0, 8)).toEqual(["write-one", "move-right-write", "unary-increment", "erase-one", "erase-unary", "unary-decrement", "zeros-to-ones", "binary-complement"]);
  expect(ids.indexOf("twos-complement")).toBeGreaterThan(ids.indexOf("binary-increment"));
  expect(coreCampaignLevels.map(level => level.id)).toEqual(ids.filter(id => !id.startsWith("example-")));
});

it("labels contiguous ranges without changing the original route", () => {
  const assignments = campaignTopics.flatMap(topic => topic.levelIds);
  expect(assignments).toEqual(campaignLevels.map(level => level.id));
  expect(new Set(assignments).size).toBe(assignments.length);
  for (const topic of campaignTopics) {
    expect(topic.levelIds.length).toBeGreaterThan(0);
    for (const id of topic.levelIds) expect(campaignTopicFor({ id })).toBe(topic);
  }
});

it("uses the same historical order for data, numbers and next-lesson navigation", () => {
  expect(orderCampaignLevels([...campaignLevels].reverse()).map(level => level.id)).toEqual(campaignLevels.map(level => level.id));
  const stages = { tutorial: 0, challenge: 1, hard: 2 };
  campaignLevels.forEach((level, index) => {
    expect(level.title.startsWith(`第 ${index + 1} 关 · `)).toBe(true);
    expect(nextCampaignLevel(level.id)?.id).toBe(campaignLevels[index + 1]?.id);
    if (index) expect(stages[level.section]).toBeGreaterThanOrEqual(stages[campaignLevels[index - 1].section]);
  });
  expect(nextCampaignLevel("move-right-write")?.id).toBe("unary-increment");
  expect(nextCampaignLevel("binary-subtraction")?.id).toBe("binary-multiplication");
});

it("can finish the full visible route sequentially with historical progress intact", () => {
  let progress = emptyCampaignProgress();
  for (const level of campaignLevels) {
    expect(isLevelUnlocked(progress, level.id), level.id).toBe(true);
    progress = completeLevel(progress, level.id);
  }
  expect(progress.completedLevelIds).toEqual(campaignLevels.map(level => level.id));
  expect(nextCampaignLevel(campaignLevels.at(-1)!.id)).toBeUndefined();
  expect(nextCampaignLevel("unknown")).toBeUndefined();
});

it("rejects duplicate or unscheduled lessons instead of silently losing them", () => {
  expect(() => orderCampaignLevels([{ id: "write-one" }, { id: "write-one" }])).toThrow("重复");
  expect(() => orderCampaignLevels([{ id: "unknown" }])).toThrow("尚未安排");
});
