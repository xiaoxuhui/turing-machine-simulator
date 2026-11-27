import { builtinExplanations, type Explanation } from "./example-learning";
import { exampleLevelId } from "./example-level-links";
import { examples } from "./examples";
import { campaignLevels, type CampaignLevel } from "./campaign";

export interface ExamplePrinciple {
  id: string; name: string; category: string; input: string; summary: string;
  steps: string[]; walkthrough: string[]; notes: string[]; levelId?: string; laboratoryUrl: string;
}

const fromLevel = (level: CampaignLevel): Explanation => ({
  summary: level.lesson.explanation, steps: level.lesson.steps,
  walkthrough: level.lesson.workedExample?.stages ?? level.cases.map(item => `${item.input || "空纸带"} → ${item.expectedOutput || "空纸带"}`),
  notes: [...level.lesson.syntax, ...(level.lesson.implementationGuide ? [level.lesson.implementationGuide.tape, ...level.lesson.implementationGuide.steps, ...level.lesson.implementationGuide.checkpoints] : [])],
});
export const examplePrinciples: ExamplePrinciple[] = Object.entries(examples).filter(([, project]) => project.category !== "忙碌海狸").map(([id, project]) => {
  const levelId = project.campaignLevelId ?? exampleLevelId(id);
  const level = campaignLevels.find(item => item.id === levelId);
  const explanation = level ? fromLevel(level) : builtinExplanations[id];
  if (!explanation) throw new Error(`缺少示例原理：${id}`);
  return { id, name: project.name, category: project.category ?? "基础示例", input: project.input,
    ...explanation, notes: explanation.notes ?? [], levelId,
    laboratoryUrl: `./?example=${encodeURIComponent(id)}` };
});
