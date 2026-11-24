import type { CampaignCase } from "./campaign";
import type { MachineDefinition } from "./core";
import { verifyCampaignCases } from "./campaign-verification";

self.onmessage = (event: MessageEvent<{ cases: CampaignCase[]; maxSteps: number; definition: MachineDefinition }>) => {
  try {
    const { cases, maxSteps, definition } = event.data;
    const result = verifyCampaignCases(cases, maxSteps, definition,
      (caseIndex, step, budget) => self.postMessage({ type: "progress", caseIndex, step, budget }));
    self.postMessage({ type: "complete", result });
  } catch (error) { self.postMessage({ type: "error", message: error instanceof Error ? error.message : "后台验证失败。" }); }
};
