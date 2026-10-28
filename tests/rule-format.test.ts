import { expect, it } from "vitest";
import { compactRuleArrows } from "../src/rule-format";
import { normalizeCampaignProgress } from "../src/campaign";

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
