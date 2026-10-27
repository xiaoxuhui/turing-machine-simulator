import type { MachineProjectFields } from "./project-state";

export const editorFields = ["input", "blankSymbol", "initialState", "acceptStates", "rejectStates", "haltStates", "rules"] as const;
const DRAFT_KEY = "turing-machine-simulator.editor-draft.v1";

/** Drafts are text, not validated programs: unfinished source must survive reload. */
export function loadEditorDraft(storage: Pick<Storage, "getItem">): MachineProjectFields | null {
  try {
    const raw = storage.getItem(DRAFT_KEY);
    if (raw === null) return null;
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== "object" || Array.isArray(data)) return null;
    const draft = data as Record<string, unknown>;
    if (draft.version !== 1 || editorFields.some(field => typeof draft[field] !== "string")) return null;
    return Object.fromEntries(editorFields.map(field => [field, draft[field]])) as unknown as MachineProjectFields;
  } catch {
    return null;
  }
}

export function saveEditorDraft(storage: Pick<Storage, "setItem">, draft: MachineProjectFields): string | null {
  try {
    storage.setItem(DRAFT_KEY, JSON.stringify({ version: 1, ...Object.fromEntries(editorFields.map(field => [field, draft[field]])) }));
    return null;
  } catch {
    return "草稿未能保存；刷新可能丢失，请先复制文本或导出项目。";
  }
}
