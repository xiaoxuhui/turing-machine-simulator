import { describe, expect, it } from "vitest";
import { encodeCampaignBackup, parseCampaignBackup, MAX_CAMPAIGN_BACKUP_BYTES } from "../src/campaign-backup";
import { emptyCampaignProgress } from "../src/campaign";

const saved = {
  version: 1 as const,
  completedLevelIds: ["write-one", "move-right-write"],
  drafts: { "write-one": "q0,□ -> HALT,1,N", "move-right-write": "q0,1 -> write,1,R\nwrite,□ -> HALT,1,N" },
};

describe("campaign backup", () => {
  it("round trips completions and the actual saved rule drafts", () => {
    const text = encodeCampaignBackup(saved, new Date("2026-10-04T00:00:00.000Z"));
    expect(JSON.parse(text)).toMatchObject({ format: "turing-machine-campaign", version: 1, exportedAt: "2026-10-04T00:00:00.000Z" });
    expect(parseCampaignBackup(text)).toEqual(saved);
  });

  it("supports an empty save", () => {
    expect(parseCampaignBackup(encodeCampaignBackup(emptyCampaignProgress()))).toEqual(emptyCampaignProgress());
  });

  it.each([
    ["wrong version", { version: 2 }],
    ["unknown completed ID", { progress: { ...saved, completedLevelIds: ["unknown"] } }],
    ["duplicate completion", { progress: { ...saved, completedLevelIds: ["write-one", "write-one"] } }],
    ["unknown draft", { progress: { ...saved, drafts: { unknown: "rule" } } }],
    ["non-string draft", { progress: { ...saved, drafts: { "write-one": 42 } } }],
    ["missing drafts", { progress: { version: 1, completedLevelIds: [] } }],
  ])("rejects %s", (_label, override) => {
    const backup = JSON.parse(encodeCampaignBackup(saved));
    expect(() => parseCampaignBackup(JSON.stringify({ ...backup, ...override }))).toThrow();
  });

  it("rejects invalid JSON and oversized files", () => {
    expect(() => parseCampaignBackup("{")).toThrow("JSON");
    expect(() => parseCampaignBackup(" ".repeat(MAX_CAMPAIGN_BACKUP_BYTES + 1))).toThrow("1 MiB");
  });
});
