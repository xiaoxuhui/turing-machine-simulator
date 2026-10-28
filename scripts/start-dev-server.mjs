import { spawn } from "node:child_process";
import { existsSync, mkdirSync, openSync, closeSync, writeFileSync } from "node:fs";
import { createConnection } from "node:net";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const port = Number(process.argv[2] ?? 5173);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Port must be an integer from 1024 to 65535.");
const root = fileURLToPath(new URL("../", import.meta.url));
const url = `http://127.0.0.1:${port}/turing-machine-simulator/`;
async function ready() {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
    return response.ok && (await response.text()).includes("/src/main.ts");
  } catch { return false; }
}
if (await ready()) {
  console.log(`Already running: ${url}`);
  process.exit(0);
}
const occupied = await new Promise(resolve => {
  const socket = createConnection({ host: "127.0.0.1", port });
  socket.setTimeout(1000);
  socket.once("connect", () => { socket.destroy(); resolve(true); });
  socket.once("error", () => resolve(false));
  socket.once("timeout", () => { socket.destroy(); resolve(true); });
});
if (occupied) throw new Error(`Port ${port} is occupied by another service. No process was stopped.`);
const vite = join(root, "node_modules", "vite", "bin", "vite.js");
if (!existsSync(vite)) throw new Error("Vite is missing. Install project dependencies first.");
const runtime = join(root, ".vite", "dev-service");
mkdirSync(runtime, { recursive: true });
const stdout = openSync(join(runtime, `${port}.stdout.log`), "a");
const stderr = openSync(join(runtime, `${port}.stderr.log`), "a");
const child = spawn(process.execPath, [vite, "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
  cwd: root, detached: true, windowsHide: true, stdio: ["ignore", stdout, stderr],
});
closeSync(stdout);
closeSync(stderr);
let startupError;
child.once("error", error => { startupError = error; });
child.unref();
if (child.pid) writeFileSync(join(runtime, `${port}.pid`), String(child.pid) + "\n");
for (let attempt = 0; attempt < 30; attempt++) {
  if (startupError) throw startupError;
  if (await ready()) {
    console.log(`Started independent background process ${child.pid}: ${url}`);
    console.log(`Logs: ${runtime}`);
    process.exit(0);
  }
  if (child.exitCode !== null) throw new Error(`Vite exited. See ${runtime}`);
  await new Promise(resolve => setTimeout(resolve, 250));
}
throw new Error(`Service did not become ready. See ${runtime}`);
