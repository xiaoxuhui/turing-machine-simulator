import { expect, it } from "vitest";
import { compactRuleArrows } from "../src/rule-format";
import { normalizeCampaignDraft, normalizeCampaignProgress } from "../src/campaign";

it("migrates arrow padding while preserving CRLF, indentation, comments and unfinished text", () => {
  const source = "f(q0,out):\r\n    q0,□  ->  out,1,R\r\n    q0,1\t→\tout,0,N\r\n# a -> b\r\n    q0,□ ->\r\n";
  expect(compactRuleArrows(source)).toBe("f(q0,out):\r\n    q0,□->out,1,R\r\n    q0,1→out,0,N\r\n# a -> b\r\n    q0,□->\r\n");
  expect(compactRuleArrows(compactRuleArrows(source))).toBe(compactRuleArrows(source));
});

it("compacts every saved campaign draft without changing completion or other source text", () => {
  const progress = normalizeCampaignProgress({ version: 1, completedLevelIds: ["write-one"], drafts: { "write-one": "q0,□ -> HALT,1,N", "function-wrap": "追加(q0,done):\n    q0,1 -> q0,1,R\n    ret done" } });
  expect(progress.completedLevelIds).toEqual(["write-one"]);
  expect(progress.drafts["write-one"]).toBe("q0,□->HALT,1,N");
  expect(progress.drafts["function-wrap"]).toBe("追加(q0,done):\n    q0,1->q0,1,R\n    ret done");
});

it("migrates the old external next/after names to done without touching internal states or conflicting custom code", () => {
  const old = "选择(q0,done):\n    q0,0 -> outside,0,R\n    q0,1 -> done,1,R\n    ret outside\n\nstart,0 -> 选择,0,N\nnext,□ -> HALT,1,N\noutside,□ -> HALT,0,N";
  const migrated = normalizeCampaignDraft("function-ret", old);
  expect(migrated).toContain("\ndone,□->HALT,1,N");
  expect(migrated).not.toContain("\nnext,");
  expect(migrated).toContain("    ret outside");
  expect(normalizeCampaignDraft("function-conditional", "after,□ -> HALT,1,N")).toBe("done,□->HALT,1,N");
  expect(normalizeCampaignDraft("function-ret", "done,0 -> HALT,0,N\nnext,1 -> HALT,1,N")).toContain("next,1->HALT,1,N");
});
