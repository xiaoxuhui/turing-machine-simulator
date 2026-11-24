const STORAGE_KEY = "turing-machine-simulator.download-names.v1";
const reserved = new Set<string>();
const key = (name: string) => name.normalize("NFC").toLowerCase();

export function uniqueDownloadName(requested: string, used: Iterable<string>): string {
  const names = new Set([...used].map(key));
  if (!names.has(key(requested))) return requested;
  const dot = requested.lastIndexOf(".");
  const extension = dot > 0 ? requested.slice(dot) : "";
  const stem = dot > 0 ? requested.slice(0, dot) : requested;
  const suffix = /^(.*) \((\d+)\)$/.exec(stem);
  const base = suffix ? suffix[1] : stem;
  let number = suffix ? BigInt(suffix[2]) + 1n : 1n;
  while (names.has(key(`${base} (${number})${extension}`))) number++;
  return `${base} (${number})${extension}`;
}

function knownNames(): Set<string> {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (Array.isArray(stored)) for (const name of stored) if (typeof name === "string") reserved.add(name);
  } catch { /* The in-memory reservation still works if storage is unavailable. */ }
  return reserved;
}

export const suggestedDownloadName = (name: string): string => uniqueDownloadName(name, knownNames());

/** Remember names requested by this site; existing files on disk remain the browser's responsibility. */
export async function downloadFile(requested: string, content: string, type: string): Promise<string> {
  const download = () => {
    const name = suggestedDownloadName(requested);
    const url = URL.createObjectURL(new Blob([content], { type }));
    try {
      reserved.add(name);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...reserved])); } catch { /* Keep the current-page reservation. */ }
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = name;
      document.body.append(anchor); anchor.click(); anchor.remove();
    } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
    return name;
  };
  return navigator.locks ? navigator.locks.request(STORAGE_KEY, download) : download();
}
