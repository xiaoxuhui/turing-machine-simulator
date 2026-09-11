# 图灵机实验台 · 安卓外壳

把「图灵机实验台」（Vite 构建的纯前端网页应用）打包成可离线安装的安卓 APK。
外壳是一个极简 WebView 容器，不含任何业务逻辑，网页改动会自动跟随。

- 包名：`com.xiaoxuhui.turing`
- 应用名：图灵机实验台
- 版本：0.3.1（versionCode 1）
- minSdk 24（Android 7.0）/ targetSdk 34
- 权限：**无**（完全离线，不申请网络权限）

## 目录结构

```
android/
├── app/src/main/
│   ├── assets/                      # 由脚本从 dist/ 同步，不入库（见 .gitignore）
│   ├── java/com/xiaoxuhui/turing/
│   │   └── MainActivity.kt           # WebView 外壳与 JS 桥（TuringAndroid）
│   └── res/                          # 图标、主题、备份规则
├── icon-source/                      # 图标原图与去水印归档
├── tools/make-icons.py               # 图标各密度生成脚本
└── gradle/wrapper/                   # Gradle wrapper
```

## 构建

### 1. 同步网页资源（必需）

网页是 Vite 打包器产物（形态 C），**必须用相对 `base` 构建**，否则 WebView 内绝对路径会 404 白屏：

```bash
npm run build:android   # = vite build --base=./  （相对路径，适配 WebView）
npm run sync:android    # 把 dist/ 同步到 android/app/src/main/assets/
npm run check:android   # 校验 assets 与 dist 一致
```

> 注意：仓库根 `vite.config.ts` 的 `base` 是 `/turing-machine-simulator/`（用于 GitHub Pages）。
> 安卓构建不走该配置，而是用上面的 `--base=./` 覆盖，网页源码无需改动。

### 2. 本地构建

需要 JDK 17：

```bash
cd android
./gradlew assembleDebug        # Linux / macOS（首次需 chmod +x gradlew）
gradlew.bat assembleDebug      # Windows
```

产物：`android/app/build/outputs/apk/debug/app-debug.apk`

直接用 Android Studio 打开 `android/` 目录亦可，但需先完成第 1 步。

### 3. 云构建

推送 `main` 或 `feat/**` 且改动涉及 `android/**`、`scripts/**`、网页源或 workflow 时自动触发，
也可在 Actions 页面手动运行 `Android APK` workflow。
产物在 workflow 的 Artifacts 中下载（含 apk-sha256.txt）；打 `v*` tag 时自动挂到 Release。

## 说明

- **为什么用 WebViewAssetLoader**：以固定域名加载内置页面，
  `localStorage` 的 origin 才稳定，应用重启后数据不会丢。
- **导出功能**：网页用 Blob URL 导出 JSON / CSV，WebView 不支持该下载方式，
  外壳注入脚本拦截点击并通过 JS 桥 `TuringAndroid.saveFile` 写入系统「下载」目录
  （Android 10+ 走 MediaStore，更低版本写应用外部目录）。
- **导入功能**：网页的 `<input type="file">` 由 `onShowFileChooser` 转发到系统文件选择器。
- **旋转与返回键**：Activity 声明 `configChanges`，旋转不重建、状态不丢；
  返回键优先回退网页历史，无历史时退出。
- **图标重新生成**：把新原图放到 `icon-source/`（`icon-full.png`、`icon-foreground.png`），
  再执行 `python tools/make-icons.py`（需要 Pillow）。脚本会先做对称裁剪去掉生成水印。

## 触摸端

本项目纸带拖动基于 Pointer Events（非 HTML5 拖放），触摸端可直接操作。
精细的移动端排版可作为后续独立分支处理，本期只保证可用不崩。
