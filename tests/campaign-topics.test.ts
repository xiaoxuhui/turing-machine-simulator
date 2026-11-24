import { expect, it } from "vitest";
import { campaignLevels, coreCampaignLevels } from "../src/campaign";
import { campaignTopics, campaignTopicFor } from "../src/campaign-topics";

it("assigns every active level to exactly one of fifteen nonempty content topics", () => {
  expect(campaignTopics).toHaveLength(15);
  const assignments = campaignTopics.flatMap(topic => [...topic.levelIds]);
  expect(assignments).toHaveLength(campaignLevels.length);
  expect(new Set(assignments).size).toBe(assignments.length);
  expect(new Set(assignments)).toEqual(new Set(campaignLevels.map(level => level.id)));
  for (const topic of campaignTopics) expect(campaignLevels.filter(level => campaignTopicFor(level).id === topic.id).length).toBeGreaterThan(0);
});

it("classifies learning content independently of stage and preserves the original curriculum order", () => {
  const complement = campaignLevels.find(level => level.id === "binary-complement")!;
  const twosComplement = campaignLevels.find(level => level.id === "twos-complement")!;
  expect(campaignTopicFor(complement).id).toBe(campaignTopicFor(twosComplement).id);
  expect(complement.section).not.toBe(twosComplement.section);
  expect(campaignTopicFor({ id: "example-functionTypedParameters" }).id).toBe("symbols-parameters");
  expect(campaignTopicFor({ id: "example-lambda" }).id).toBe("language-machines");
  expect(coreCampaignLevels.map(level => level.id).slice(0, 3)).toEqual(["write-one", "move-right-write", "unary-increment"]);
});
