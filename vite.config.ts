import { defineConfig } from "vite";
import { localArchivePlugin } from "./scripts/local-archive-plugin.mjs";

export default defineConfig({
  plugins: [localArchivePlugin()],
  // Subpath so the built SPA works when published to GitHub Pages
  // at https://xiaoxuhui.github.io/turing-machine-simulator/
  base: "/turing-machine-simulator/",
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        campaign: "campaign.html",
        principles: "principles.html",
        rule110: "rule110.html",
        life: "life.html",
      },
    },
  },
  test: {
    environment: "node",
    // λ 示例是 6.4 万条规则的生成机，编译单次就要 2 秒上下；
    // 默认 5 秒在并发跑全量时容易误报超时，统一放宽到 30 秒。
    testTimeout: 30_000,
    // forks 池跑 λ 重型用例时，子进程阻塞会让 worker 的 RPC 心跳超时（测试全过但退出码 1）；
    // 换成线程池后同一批用例稳定通过。
    pool: "threads",
    // 安卓外壳结构性测试（tests/android-shell.test.js）基于 node:test，
    // 由 `pnpm run test:android` 运行，不应被 Vitest 收集。
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.{idea,git,cache,output,temp}/**",
      "**/coverage/**",
      "**/android-shell.test.js",
    ],
  },
});
