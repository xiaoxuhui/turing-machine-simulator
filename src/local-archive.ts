export type ArchiveKind = "project" | "draft" | "campaign";
export interface ArchiveSnapshot { kind: ArchiveKind; title: string; content: string }
export interface ArchiveEntry extends ArchiveSnapshot { id: string; savedAt: string; source: string }
export type ArchiveSummary = Omit<ArchiveEntry, "content">;
const DATABASE = "turing-machine-local-archive";
const STORE = "snapshots";
let database: Promise<IDBDatabase> | undefined;
let lastError = "";
const pending = new Map<ArchiveKind, ReturnType<typeof setTimeout>>();

function openDatabase(): Promise<IDBDatabase> {
  if (!database) database = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => { request.result.createObjectStore(STORE, { keyPath: "id" }); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("无法打开本地存档。"));
  }).catch(error => { database = undefined; throw error; });
  return database;
}
function report(error: unknown): void { lastError = error instanceof Error ? error.message : "本地历史存档未能保存，请下载备份。"; }
export const archiveError = () => lastError;

export async function saveArchive(snapshot: ArchiveSnapshot, source = "手动保存"): Promise<ArchiveEntry> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(snapshot.content));
  const id = snapshot.kind + ":" + [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
  const entry: ArchiveEntry = { ...snapshot, id, savedAt: new Date().toISOString(), source };
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, "readwrite"), store = transaction.objectStore(STORE);
    let saved = entry;
    const existing = store.get(id);
    existing.onsuccess = () => {
      if (existing.result) saved = existing.result as ArchiveEntry;
      else store.add(entry);
    };
    transaction.oncomplete = () => { lastError = ""; resolve(saved); };
    transaction.onerror = transaction.onabort = () => reject(new Error("本地历史存档未能保存，请下载备份。"));
  });
}

export function queueArchive(snapshot: ArchiveSnapshot): void {
  if (typeof indexedDB === "undefined") return;
  clearTimeout(pending.get(snapshot.kind));
  pending.set(snapshot.kind, setTimeout(() => {
    pending.delete(snapshot.kind); void saveArchive(snapshot, "自动备份").catch(report);
  }, 1000));
}

export async function archiveList(): Promise<ArchiveSummary[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE), request = transaction.objectStore(STORE).openCursor();
    const summaries: ArchiveSummary[] = [];
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      const { content: _content, ...summary } = cursor.value as ArchiveEntry;
      summaries.push(summary); cursor.continue();
    };
    transaction.oncomplete = () => resolve(summaries.sort((a, b) => b.savedAt.localeCompare(a.savedAt)));
    transaction.onerror = () => reject(new Error("读取本地存档失败。"));
  });
}
export async function readArchive(id: string): Promise<ArchiveEntry | undefined> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE).objectStore(STORE).get(id);
    request.onsuccess = () => resolve(request.result as ArchiveEntry | undefined);
    request.onerror = () => reject(new Error("读取存档内容失败。"));
  });
}

export function parseArchiveFile(raw: string): ArchiveSnapshot[] {
  const data: unknown = JSON.parse(raw);
  if (!data || typeof data !== "object") throw new Error("不是有效的存档文件。");
  const file = data as Record<string, unknown>;
  if (file.format === "turing-machine-simulator" && file.version === 1 && typeof file.rules === "string") return [{ kind: "project", title: typeof file.name === "string" ? file.name : "导入的实验台项目", content: JSON.stringify(file) }];
  if (file.format === "turing-machine-campaign" && file.version === 1 && file.progress && typeof file.progress === "object") return [{ kind: "campaign", title: "导入的关卡备份", content: JSON.stringify(file.progress) }];
  if (file.format !== "turing-machine-local-archive" || file.version !== 1 || !Array.isArray(file.entries)) throw new Error("不支持的本地存档格式。");
  return file.entries.map((item: unknown) => {
    if (!item || typeof item !== "object") throw new Error("存档条目无效。");
    const entry = item as Record<string, unknown>;
    if (!["project", "draft", "campaign"].includes(String(entry.kind)) || typeof entry.title !== "string" || typeof entry.content !== "string") throw new Error("存档条目缺少名称或内容。");
    const content: unknown = JSON.parse(entry.content);
    if (!content || typeof content !== "object" || Array.isArray(content)) throw new Error("存档内容不是有效数据。");
    return { kind: entry.kind as ArchiveKind, title: entry.title, content: entry.content };
  });
}

/** Read the raw values before migrations can remove retired levels or unfinished source. */
export async function captureExistingLocalSaves(): Promise<void> {
  const snapshots: ArchiveSnapshot[] = [];
  for (const [kind, title, key] of [
    ["project", "原有实验台项目", "turing-machine-simulator.project.v1"],
    ["draft", "原有编辑器草稿", "turing-machine-simulator.editor-draft.v1"],
    ["campaign", "原有关卡进度与解法", "turing-machine-simulator.campaign.v1"],
  ] as const) {
    try { const content = localStorage.getItem(key); if (content) snapshots.push({ kind, title, content }); } catch { /* Keep other recoverable records. */ }
  }
  try {
    for (const snapshot of snapshots) await saveArchive(snapshot, "迁移前备份");
    if (import.meta.env.DEV) {
      const response = await fetch(`${import.meta.env.BASE_URL}__local-archive-seed`);
      if (response.ok) for (const snapshot of parseArchiveFile(await response.text())) await saveArchive(snapshot, "本机原稿备份");
    }
  } catch (error) { report(error); }
}
