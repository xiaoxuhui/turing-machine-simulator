import "./local-archive.css";
import { archiveError, archiveList, parseArchiveFile, readArchive, saveArchive, type ArchiveEntry, type ArchiveSnapshot } from "./local-archive";
import { downloadFile } from "./download-file";

interface ArchiveViewOptions {
  page: "project" | "campaign";
  ready: Promise<void>;
  current(): ArchiveSnapshot;
  restore(entry: ArchiveEntry): void | Promise<void>;
}
const PENDING = "turing-machine-simulator.archive-restore.v1";
const kindNames = { project: "实验台项目", draft: "编辑草稿", campaign: "关卡进度与解法" };

export function attachLocalArchive(options: ArchiveViewOptions): void {
  const dialog = document.createElement("dialog");
  dialog.className = "local-archive-dialog";
  dialog.setAttribute("aria-label", "本地存档");
  dialog.innerHTML = `<div class="archive-heading"><div><h2>本地存档</h2><p>保存在此设备的此浏览器中。可下载备份，也可导入以前下载的存档。</p></div><button type="button" data-action="close">关闭</button></div>
    <div class="archive-actions"><button type="button" data-action="save">保存当前内容</button><button type="button" data-action="export-all">下载全部存档</button><button type="button" data-action="import">导入存档文件</button><input class="archive-import" type="file" accept="application/json,.json" hidden /></div>
    <p class="archive-status" role="status"></p>
    <div class="archive-layout"><div class="archive-list" aria-label="历史存档"></div><section class="archive-detail"><h3>选择一份存档</h3><p class="archive-meta"></p><textarea class="archive-source" readonly spellcheck="false" aria-label="存档内容"></textarea>
      <div class="archive-actions"><button type="button" data-action="restore" disabled>恢复这份存档</button><button type="button" data-action="export-one" disabled>下载这份存档</button></div><p class="archive-note">恢复前会备份当前内容。已移除关卡的解法仍可在这里查看和下载。</p></section></div>`;
  document.body.append(dialog);
  const list = dialog.querySelector<HTMLElement>(".archive-list")!, status = dialog.querySelector<HTMLElement>(".archive-status")!;
  const detail = dialog.querySelector<HTMLElement>(".archive-detail")!, source = dialog.querySelector<HTMLTextAreaElement>(".archive-source")!;
  const file = dialog.querySelector<HTMLInputElement>(".archive-import")!;
  let selected: ArchiveEntry | undefined, busy = false, selectionRevision = 0;
  const date = (value: string) => new Date(value).toLocaleString("zh-CN", { hour12: false });
  function setBusy(value: boolean): void {
    busy = value;
    dialog.querySelectorAll<HTMLButtonElement>("button[data-action]").forEach(button => {
      if (button.dataset.action !== "close") button.disabled = value || ((button.dataset.action === "restore" || button.dataset.action === "export-one") && !selected);
    });
  }
  async function choose(id: string): Promise<void> {
    const ticket = ++selectionRevision;
    selected = undefined; setBusy(busy);
    const entry = await readArchive(id);
    if (!entry || ticket !== selectionRevision) return;
    selected = entry;
    let data: Record<string, unknown> = {};
    try { data = JSON.parse(entry.content) as Record<string, unknown> ?? {}; } catch { /* Raw damaged records can still be viewed and downloaded. */ }
    detail.querySelector("h3")!.textContent = entry.title;
    detail.querySelector(".archive-meta")!.textContent = `${kindNames[entry.kind]} · ${date(entry.savedAt)} · ${entry.source}`;
    source.value = typeof data.rules === "string" ? data.rules : data.drafts && typeof data.drafts === "object"
      ? `已通关：${Array.isArray(data.completedLevelIds) ? data.completedLevelIds.join("、") : ""}\n\n` + Object.entries(data.drafts).map(([id, rules]) => `# ${id}\n${String(rules)}`).join("\n\n")
      : Object.keys(data).length ? JSON.stringify(data, null, 2) : entry.content;
    list.querySelectorAll<HTMLButtonElement>("button").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.id === id)));
    setBusy(busy);
  }
  async function refresh(prefer?: string): Promise<void> {
    const summaries = await archiveList();
    list.replaceChildren();
    for (const item of summaries) {
      const button = document.createElement("button"); button.type = "button"; button.dataset.id = item.id;
      const title = document.createElement("strong"), meta = document.createElement("small");
      title.textContent = item.title; meta.textContent = `${kindNames[item.kind]} · ${date(item.savedAt)}`;
      button.append(title, meta); button.addEventListener("click", () => { void choose(item.id).catch(showError); }); list.append(button);
    }
    if (!summaries.length) list.textContent = "尚无历史存档，可先保存当前内容。";
    const id = summaries.find(item => item.id === prefer)?.id ?? summaries.find(item => item.id === selected?.id)?.id ?? summaries[0]?.id;
    if (id) await choose(id);
  }
  function showError(error: unknown): void { status.textContent = error instanceof Error ? error.message : "操作未完成，请下载备份。"; }
  async function saveCurrent(label = "手动保存"): Promise<ArchiveEntry> { return saveArchive(options.current(), label); }
  async function open(): Promise<void> {
    if (!dialog.open) dialog.showModal();
    setBusy(true);
    status.textContent = "正在读取本地存档……";
    try { await options.ready; await refresh(); status.textContent = archiveError() || "可查看历史版本、恢复或下载。"; } catch (error) { showError(error); }
    finally { setBusy(false); }
  }
  async function restore(entry: ArchiveEntry): Promise<void> {
    await saveCurrent("恢复前备份");
    const target = entry.kind === "campaign" ? "campaign" : "project";
    if (target !== options.page) {
      localStorage.setItem(PENDING, entry.id);
      location.assign(target === "campaign" ? "./campaign.html" : "./");
      return;
    }
    await options.restore(entry);
    dialog.close();
  }
  const packageFile = (entries: ArchiveSnapshot[]) => JSON.stringify({ format: "turing-machine-local-archive", version: 1, entries }, null, 2);
  dialog.addEventListener("click", event => {
    const action = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-action]")?.dataset.action;
    if (!action) return;
    if (action === "close") { dialog.close(); return; }
    if (busy) return;
    if (action === "import") { file.click(); return; }
    setBusy(true);
    void (async () => {
      if (action === "save") { const saved = await saveCurrent(); await refresh(saved.id); status.textContent = "已保存到本地存档。"; }
      else if (action === "restore" && selected) await restore(selected);
      else if (action === "export-one" && selected) { await downloadFile("图灵机存档.json", packageFile([selected]), "application/json"); status.textContent = "已下载所选存档。"; }
      else if (action === "export-all") {
        const entries: ArchiveEntry[] = [];
        for (const summary of await archiveList()) { const entry = await readArchive(summary.id); if (entry) entries.push(entry); }
        await downloadFile("图灵机全部存档.json", packageFile(entries), "application/json"); status.textContent = `已下载 ${entries.length} 份存档。`;
      }
    })().catch(showError).finally(() => setBusy(false));
  });
  file.addEventListener("change", () => {
    const input = file.files?.[0]; file.value = ""; if (!input) return;
    setBusy(true);
    void (async () => {
      const entries = parseArchiveFile(await input.text());
      for (const entry of entries) await saveArchive(entry, "导入备份");
      await refresh(); status.textContent = `已导入 ${entries.length} 份存档。`;
    })().catch(showError).finally(() => setBusy(false));
  });
  document.querySelectorAll<HTMLElement>("[data-local-saves]").forEach(button => button.addEventListener("click", () => { void open(); }));
  document.querySelectorAll<HTMLElement>("[data-save-local]").forEach(button => button.addEventListener("click", () => {
    void (async () => { await open(); setBusy(true); const saved = await saveCurrent(); await refresh(saved.id); status.textContent = "已保存到本地存档。"; })().catch(showError).finally(() => setBusy(false));
  }));
  void options.ready.then(async () => {
    const id = localStorage.getItem(PENDING);
    if (!id) return;
    const entry = await readArchive(id);
    if (!entry || (entry.kind === "campaign" ? "campaign" : "project") !== options.page) return;
    localStorage.removeItem(PENDING); await restore(entry);
  }).catch(error => { if (!dialog.open) dialog.showModal(); showError(error); });
}
