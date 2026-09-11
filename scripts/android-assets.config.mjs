/**
 * 网页资源 → 安卓 assets 的同步配置。
 *
 * 本项目为 Vite 产物（Form C）：同步整个 dist 目录到 assets 根。
 * 入口页需与 MainActivity.kt 的 ASSET_FILE 一致。
 */

/** assets 目标根目录（相对仓库根） */
export const ASSETS_DIR = "android/app/src/main/assets";

/** 需要同步的条目；from 相对仓库根，to 相对 ASSETS_DIR */
export const SYNC_ITEMS = [
  { type: "dir", from: "dist", to: "." },
];

/** WebView 加载的入口页（相对 ASSETS_DIR） */
export const ENTRY_PAGE = "index.html";
