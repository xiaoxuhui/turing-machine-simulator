import { campaignLevels, type CampaignProgress } from "./campaign";
import { MAX_CAMPAIGN_DRAFT_LENGTH, retiredCampaignLevelIds } from "./campaign-limits";

export const MAX_CAMPAIGN_BACKUP_BYTES = 32 * 1_048_576;
const FORMAT = "turing-machine-campaign";

interface CampaignBackup {
  format: typeof FORMAT;
  version: 1;
  exportedAt: string;
  progress: CampaignProgress;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateProgress(value: unknown): CampaignProgress {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.completedLevelIds) || !isRecord(value.drafts)) {
    throw new Error("存档缺少有效的关卡进度或规则草稿。");
  }
  const knownIds = new Set(campaignLevels.map((level) => level.id));
  const recognized = (id: string) => knownIds.has(id) || retiredCampaignLevelIds.has(id);
  const completed = value.completedLevelIds;
  if (completed.length > knownIds.size + retiredCampaignLevelIds.size || completed.some((id) => typeof id !== "string" || !recognized(id)) || new Set(completed).size !== completed.length) {
    throw new Error("存档包含未知或重复的已通关关卡。");
  }
  const drafts = Object.entries(value.drafts);
  if (drafts.length > knownIds.size + retiredCampaignLevelIds.size || drafts.some(([id, rules]) => !recognized(id) || typeof rules !== "string" || rules.length > MAX_CAMPAIGN_DRAFT_LENGTH)) {
    throw new Error("存档包含无效的规则草稿。");
  }
  return {
    version: 1,
    completedLevelIds: completed.filter((id): id is string => typeof id === "string" && knownIds.has(id)),
    drafts: Object.fromEntries(drafts.filter(([id]) => knownIds.has(id))) as Record<string, string>,
  };
}

export function encodeCampaignBackup(progress: CampaignProgress, exportedAt = new Date()): string {
  const backup: CampaignBackup = {
    format: FORMAT,
    version: 1,
    exportedAt: exportedAt.toISOString(),
    progress: validateProgress(progress),
  };
  const encoded = `${JSON.stringify(backup, null, 2)}\n`;
  if (new TextEncoder().encode(encoded).byteLength > MAX_CAMPAIGN_BACKUP_BYTES) throw new Error("存档超过 32 MiB，无法导出。");
  return encoded;
}

export function parseCampaignBackup(source: string): CampaignProgress {
  if (new TextEncoder().encode(source).byteLength > MAX_CAMPAIGN_BACKUP_BYTES) {
    throw new Error("存档文件超过 32 MiB。");
  }
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new Error("存档不是有效的 JSON 文件。");
  }
  if (!isRecord(value) || value.format !== FORMAT || value.version !== 1 || typeof value.exportedAt !== "string" || !Number.isFinite(Date.parse(value.exportedAt))) {
    throw new Error("存档格式或版本不受支持。");
  }
  return validateProgress(value.progress);
}
