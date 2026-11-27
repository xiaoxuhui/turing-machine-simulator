import { expect, it } from "vitest";
import { campaignLevels, normalizeCampaignProgress, normalizeCampaignSource, normalizeCampaignDraft, verifyLevel } from "../src/campaign";
import { solutionRules } from "../src/campaign-solutions";
import { campaignKeyboardNames, keyboardCampaignProject } from "../src/campaign-keyboard";
import { examples } from "../src/examples";
import { exampleSource } from "../src/example-source";
import { exampleVariant } from "../src/example-variants";
import { parseTransitions, resolveInitialState } from "../src/core";

it("uses keyboard characters for blanks and ASCII names for every prescribed function", () => {
  for (const level of campaignLevels) {
    expect(level.starter.blankSymbol, level.id).toMatch(/^[!-~]$/);
    expect(level.starter.initialState, level.id).not.toMatch(/\p{Script=Han}/u);
    const parsed = parseTransitions(solutionRules[level.id], { haltStates: ["H"], acceptStates: ["T"], rejectStates: ["F"] });
    const chineseStates = [...new Set(parsed.transitions.flatMap(rule => [rule.fromState, rule.toState]))].filter(name => /\p{Script=Han}/u.test(name));
    expect(chineseStates, level.id).toEqual([]);
  }
});

it("migrates old blank symbols and Chinese function names without losing unfinished text", () => {
  const progress = normalizeCampaignProgress({ version: 1, completedLevelIds: ["function-wrap"], drafts: {
    "function-wrap": "追加(q0,done):\n    q0,□ -> done,1,R\n    q0,1->\n\n追加",
  } });
  expect(progress.drafts["function-wrap"]).toBe("追加(q0,done):\n    q0,□ -> done,1,R\n    q0,1->\n\n追加");
  expect(normalizeCampaignDraft("function-wrap", progress.drafts["function-wrap"])).toBe("f1(q0,done):\n    q0,_->done,1,R\n    q0,1->\n\nf1");
  expect(progress.completedLevelIds).toEqual(["function-wrap"]);
  expect(normalizeCampaignProgress(progress)).toEqual(progress);
});

it("preserves underscore data by choosing another keyboard blank", () => {
  const project = { ...examples.unary, blankSymbol: "□", input: "_", rules: "q0,_->q1,_,R\nq1,□->H,□,N" };
  const result = keyboardCampaignProject(project);
  expect(result.blankSymbol).toBe("~");
  expect(result.input).toBe("_");
  expect(result.rules).toBe("q0,_->q1,_,R\nq1,~->H,~,N");
});

it("avoids existing short names and retains keyboard blanks already in use", () => {
  const project = { ...examples.unary, blankSymbol: "0", rules: "写一(q0,end):\n    q0,0->end,1,R\nf1(q0,end):\n    q0,0->end,2,R\n写一" };
  const names = campaignKeyboardNames(project);
  expect(names.identifiers.get("写一")).toBe("f2");
  expect(keyboardCampaignProject(project, names).blankSymbol).toBe("0");
});

it.each(["example-functionExportEntry", "example-functionExportRepeat", "example-functionTypedParameters", "example-functionComposition"])("keeps %s runnable after numeric names, flattening and shared functions", id => {
  const level = campaignLevels.find(level => level.id === id)!;
  for (const structure of ["original", "flat", "functions"] as const) {
    const project = exampleVariant(examples[`campaign-${id}`], "numeric", structure);
    const options = { haltStates: ["H"], acceptStates: ["T"], rejectStates: ["F"] };
    const parsed = parseTransitions(exampleSource(project, "plain"), options);
    expect(parsed.errors).toEqual([]);
    expect(verifyLevel(level, { ...options, blankSymbol: project.blankSymbol, initialState: resolveInitialState(parsed, project.initialState), transitions: parsed.transitions }).passed).toBe(true);
  }
});

it("keeps old explicit R/L writes and stars while rewriting the blank", () => {
  expect(normalizeCampaignSource("write-one", "q0,□->q1,R,*\nq1,R->HALT,**,*")).toBe("q0,_->q1,R,*\nq1,R->H,**,*");
});
