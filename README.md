<p align="center">
  <a href="README.en.md">English</a> · 简体中文
</p>

<p align="center">
  <img src="https://img.shields.io/github/actions/workflow/status/xiaoxuhui/turing-machine-simulator/CI.yml?branch=main" alt="CI">
  <img src="https://img.shields.io/badge/license-MIT-green.svg" alt="License">
  <img src="https://img.shields.io/badge/version-0.3.0-blue.svg" alt="Version">
  <img src="https://img.shields.io/badge/node-%3E%3D20.19-brightgreen.svg" alt="Node">
</p>

# 图灵机模拟器

一个可视化、可编程的单纸带确定性图灵机模拟器。

## 在线演示

部署在 GitHub Pages 上：[https://xiaoxuhui.github.io/turing-machine-simulator/](https://xiaoxuhui.github.io/turing-machine-simulator/)

（演示站点在你于仓库 **Settings → Pages** 中启用 GitHub Pages、并选择 `main` 分支的 `/（root）` 或配置部署工作流后生效。）

## 功能

- 可向左右扩展的稀疏纸带和读写头跟随
- 单步、连续运行、暂停、重置、最高 1000 步/秒调速、实际速度显示和步数限制
- 纯文本与结构化规则表双编辑方式
- 一进制加一、二进制加一、回文判断、忙碌海狸示例
- 本地自动保存、项目 JSON 导入导出、执行日志 CSV 导出
- 接受、拒绝、普通停机和缺少规则的明确反馈
- 将当前图灵机的有限计算历史生成为 Wang 瓷砖拼图
- 支持点击/拖放拼砖、相邻边校验、循环节检测和一键查看正确铺法
- 全路线总览以 10,000 步为默认值，可输入更大的正整数，并把整段计算压缩成时空图

## 计算瓷砖拼图

应用机器定义后，页面底部会自动生成一组打乱的瓷砖。棋盘从上到下表示时间，从左到右表示纸带位置；带状态名的瓷砖表示读写头。当前版本生成的是所选步数和纸带视窗内的有限计算历史（tableau），最大 30 步，并用完整机器配置检测循环。

“全路线总览”会在独立后台任务中执行当前机器，红色表示读写头路线，绿色表示非空纸带。超长运行会压缩为最多约 2400 条可视采样行；生成期间仍可继续运行模拟器或拼瓷砖，并可随时取消。

## 截图

> 截图待补充。在本地运行应用后，欢迎把界面截图放入 `doc/screenshots/` 并在此引用。

## 本地运行

需要 Node.js 20.19 或更高版本，以及 pnpm 11。

```bash
pnpm install --frozen-lockfile
pnpm dev
```

构建与测试：

```bash
pnpm test
pnpm run build
pnpm run check
```

浏览器打开终端显示的本地地址即可使用。项目完全在浏览器本地运行，不会上传机器定义或纸带内容。

## 项目结构

- `src/core.ts`：图灵机和稀疏纸带领域逻辑。
- `src/execution-scheduler.ts`：连续运行时间片与实际速度统计。
- `src/route-controller.ts`、`src/route-worker.ts`：可取消的后台全路线计算。
- `src/project-codec.ts`：项目 JSON v1 校验和本地存储边界。
- `src/tile-puzzle.ts`：有限计算历史的 Wang 瓷砖拼图。
- `doc/`：需求、设计、实施计划、测试报告和阶段总结。

## 参与贡献与安全

提交代码前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)，安全问题请按 [SECURITY.md](SECURITY.md) 私密报告，社区互动遵循 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)。版本变化记录在 [CHANGELOG.md](CHANGELOG.md)。

## 许可证

本项目采用 [MIT License](LICENSE)。
