import { campaignLevels } from "./campaign";
import { solutionRules } from "./campaign-solutions";
import type { ExampleProject } from "./examples";
import { compactRuleArrows } from "./rule-format";

/** Laboratory examples are separate from campaign drafts and completion records. */
export const campaignExamples: Record<string, ExampleProject> = Object.fromEntries(campaignLevels.map(level => [
  `campaign-${level.id}`,
  { ...level.starter, category: "关卡示例", campaignLevelId: level.id, name: level.title,
    input: level.cases.find(item => item.input === level.starter.input)?.input ?? level.cases.at(-1)!.input,
    description: `${level.concept} ${level.lesson.explanation} 完整参考程序；在实验台运行不会改变关卡进度。`,
    maxSteps: level.maxSteps > 1000000 ? null : level.maxSteps,
    rules: compactRuleArrows([
      `# ${level.title}`, `# ${level.objective}`, `# ${level.lesson.explanation}`,
      ...level.lesson.steps.map((step, index) => `# ${index + 1}. ${step}`),
      solutionRules[level.id],
    ].join("\n")),
  } satisfies ExampleProject,
]));
