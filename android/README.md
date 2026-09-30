# 图灵机实验台 · 安卓外壳

把「图灵机实验台」（Vite 构建的纯前端网页应用）打包成可离线安装的安卓 APK。
外壳是一个极简 WebView 容器，不含任何业务逻辑，网页改动会自动跟随。

- 包名：`com.xiaoxuhui.turing`
- 应用名：图灵机实验台
- 版本：0.5.0（versionCode 2）
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

推送 `main`、`android-apk` 或 `feat/**` 且改动涉及 `android/**`、`scripts/**`、网页源或 workflow 时自动触发，
也可在 Actions 页面手动运行 `Android APK` workflow。
产物在 workflow 的 Artifacts 中下载（含 apk-sha256.txt）；打 `v*` tag 时自动挂到 Release。

## 发版：版本号与固定签名

### 版本号清单

发布新版本时，这几处必须一起改：

| 位置 | 内容 |
|---|---|
| `package.json` | `"version"` —— **唯一真源**，其余各处向它对齐 |
| `android/app/build.gradle.kts` | `versionCode`（**只增不减**）、`versionName` |
| `CHANGELOG.md` | 新增对应版本节 |
| `android/README.md` | 下方的「版本与 versionCode 对照」 |

`versionName` 有测试守着自动对齐（`tests/android-shell.test.js` 比对 `package.json`），
**不会静默漂移**。唯独 `versionCode` 没有「本次该写几」的真源，只能在发版时人工确认递增 ——
这是本清单里唯一需要靠人的一项。测试守住下限：**必须 ≥ 2**
（v0.3.1 已占用 1，且是随机签名包），当前 `versionCode = 2`。

### 版本与 versionCode 对照

| 版本 | versionCode | 签名 |
|---|---|---|
| `0.3.1`（2026-09-11） | 1 | **随机** —— CI 现场生成，私钥未保存 |
| `0.5.0`（2026-09-29） | 2 | 固定 —— 用仓库内 `android/app/debug.keystore` |

### 固定 debug 签名

`android/app/debug.keystore` **随仓库提交，且永不替换**。

不配 `signingConfigs` 时，AGP 会给每台构建机随机生成一把 debug key；
CI 每次都是全新 runner —— 于是每个发布包的签名都不同，用户覆盖安装新包会被系统拒绝
（`INSTALL_FAILED_UPDATE_INCOMPATIBLE`），现象是「明明有新版本，却一直更新不了」。
这类问题**首个包完全看不出**，要等发下一个版本才炸。

**注意**：v0.3.1 用的临时私钥已经丢失，无法与其连续，
所以**从 v0.3.1 升级到 v0.5.0 需要先卸载重装一次**；此后签名固定，不再需要。
核对方法（无需 JDK / Android SDK）见 [doc/测试报告-安卓签名修复.md](../doc/测试报告-安卓签名修复.md)。

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
