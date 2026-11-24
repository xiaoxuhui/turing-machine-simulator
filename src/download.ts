import { downloadFile, suggestedDownloadName } from "./download-file";

/** Ask for a filename before creating a download; cancellation leaves the draft alone. */
export function requestDownload(defaultName: string, content: string, type: string): void {
  const extension = defaultName.slice(defaultName.lastIndexOf("."));
  const dialog = document.createElement("dialog");
  dialog.className = "download-dialog";
  dialog.setAttribute("aria-labelledby", "downloadTitle");
  dialog.innerHTML = `<form novalidate>
    <h2 id="downloadTitle">导出文件</h2>
    <label for="downloadName">文件名</label>
    <input id="downloadName" name="filename" type="text" autocomplete="off" aria-describedby="downloadHint downloadError" autofocus />
    <p id="downloadHint" class="hint"></p>
    <p id="downloadError" class="error" role="alert"></p>
    <div class="download-actions"><button type="button" class="btn" id="cancelDownload">取消</button><button type="submit" class="btn primary">下载</button></div>
  </form>`;
  const input = dialog.querySelector<HTMLInputElement>("input")!;
  const error = dialog.querySelector<HTMLElement>("#downloadError")!;
  input.value = suggestedDownloadName(defaultName);
  dialog.querySelector("#downloadHint")!.textContent = `省略扩展名时会自动补上 ${extension}，同名导出自动加数字。`;
  dialog.querySelector("#cancelDownload")!.addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  input.addEventListener("input", () => { error.textContent = ""; input.removeAttribute("aria-invalid"); });
  dialog.querySelector("form")!.addEventListener("submit", async event => {
    event.preventDefault();
    const raw = input.value.trim();
    const message = !raw ? "请输入文件名。"
      : /[\u0000-\u001f<>:"/\\|?*]/u.test(raw) || /^\.+$/u.test(raw) ? "文件名不能包含路径或以下字符：\\ / : * ? \" < > |。" : "";
    if (message) { error.textContent = message; input.setAttribute("aria-invalid", "true"); input.focus(); return; }
    const name = raw.toLowerCase().endsWith(extension.toLowerCase()) ? raw : `${raw}${extension}`;
    const submit = dialog.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    if (submit.disabled) return;
    submit.disabled = true;
    try { await downloadFile(name, content, type); dialog.close(); }
    catch { error.textContent = "导出失败，请重试。"; submit.disabled = false; }
  });
  document.body.append(dialog);
  dialog.showModal();
  input.select();
}
