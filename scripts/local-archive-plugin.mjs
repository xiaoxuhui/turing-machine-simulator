import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// Development-only endpoint for this workspace's private, ignored original-program backup.
export function localArchivePlugin() {
  return {
    name: "local-archive-seed",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url?.split("?")[0] !== "/turing-machine-simulator/__local-archive-seed") { next(); return; }
        if (request.method !== "GET") { response.statusCode = 405; response.end(); return; }
        void readFile(fileURLToPath(new URL("../.local-saves/creator-originals.json", import.meta.url)), "utf8").then(content => {
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.setHeader("Cache-Control", "no-store"); response.end(content);
        }).catch(() => { response.statusCode = 404; response.end(); });
      });
    },
  };
}
