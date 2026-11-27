import { expect, it } from "vitest";
import { campaignLevels, normalizeCampaignProgress, normalizeCampaignTerminals } from "../src/campaign";
import { campaignExamples } from "../src/campaign-examples";
import { campaignTerminalNames, renameCampaignTerminalSource } from "../src/campaign-terminals";

it("uses H, T and F in every campaign and laboratory campaign example", () => {
  for (const level of campaignLevels) {
    for (const project of [level.starter, campaignExamples[`campaign-${level.id}`]]) {
      expect([project.haltStates, project.acceptStates, project.rejectStates], level.id).toEqual(["H", "T", "F"]);
    }
  }
});

it("migrates state fields without changing identically named symbols or R movement", () => {
  const names = campaignTerminalNames({ haltStates: "HALT", acceptStates: "A", rejectStates: "R" });
  const source = "q0,HALT->A,HALT,R\nq1,R->R,R,R\nHALT,R->HALT,A,L\nnext->HALT\npartial,1->HALT\n# HALT is a comment";
  expect(renameCampaignTerminalSource(source, names)).toBe("q0,HALT->T,HALT,R\nq1,R->F,R,R\nH,R->H,A,L\nnext->H\npartial,1->H\n# HALT is a comment");
});

it("migrates function exits, state bindings and return names while preserving symbol parameters", () => {
  const names = campaignTerminalNames({ haltStates: "HALT", acceptStates: "ACCEPT", rejectStates: "REJECT" });
  expect(renameCampaignTerminalSource("选择(q0,HALT,出口=ACCEPT,状态,HALT,符号):\n    q0,HALT->出口,HALT,R\n    ret REJECT\n调用: 选择->HALT", names))
    .toBe("选择(q0,H,出口=T,状态,HALT,符号):\n    q0,HALT->出口,HALT,R\n    ret F\n调用: 选择->H");
});

it("retains saved completions and unfinished drafts, and migration is idempotent", () => {
  const migrated = normalizeCampaignProgress({ version: 1, completedLevelIds: ["write-one"], drafts: {
    "write-one": "q0,HALT -> HALT,HALT,R\n    ",
    "example-palindrome": "q0,1->ACCEPT\nq0,0->REJECT",
  } });
  expect(migrated.completedLevelIds).toEqual(["write-one"]);
  expect(migrated.drafts["write-one"]).toBe("q0,HALT -> HALT,HALT,R\n    ");
  expect(migrated.drafts["example-palindrome"]).toBe("q0,1->ACCEPT\nq0,0->REJECT");
  expect(normalizeCampaignProgress(migrated)).toEqual(migrated);
});

it("keeps raw simulated machine input and output terminal names intact", () => {
  const level = campaignLevels.find(level => level.id === "example-universal")!;
  expect(level.starter.input).toContain("HALT");
  expect(level.cases[0].expectedOutput).toBe("HALT/1");
  expect(normalizeCampaignTerminals(level.id, "q0,HALT->universal.halt,HALT,R")).toBe("q0,HALT->H,HALT,R");
});
