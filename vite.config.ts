import { defineConfig } from "vite";

export default defineConfig({
  // Subpath so the built SPA works when published to GitHub Pages
  // at https://xiaoxuhui.github.io/turing-machine-simulator/
  base: "/turing-machine-simulator/",
  test: { environment: "node" },
});
