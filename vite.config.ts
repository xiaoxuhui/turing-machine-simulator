import { defineConfig } from "vite";

export default defineConfig({
  // Subpath so the built SPA works when published to GitHub Pages
  // at https://xiaoxuhui.github.io/turing-machine-simulator/
  base: "/turing-machine-simulator/",
  test: {
    environment: "node",
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
