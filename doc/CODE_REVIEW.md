# 代码评审报告 — turing-machine-simulator

- 评审日期：2026-08-25
- 评审人：WorkBuddy AI
- 技术栈：TypeScript + Vite 7 + Vitest 3 + 原生 HTML/CSS + Web Worker
- 源码规模：src 约 980 行（核心 `core.ts` 180 行，UI `main.ts` 575 行，其余模块约 225 行）；tests 约 167 行；doc 约 566 行
- 测试结果：用例 15 / 通过 15 / 失败 0（命令见第三章）

---

## 一、总体评价

可维护性评级：**良好**

核心引擎（`core.ts`）设计干净、与 DOM 完全解耦、可被 Vitest 直接测试；规则解析、稀疏纸带、确定性步进语义均正确，内置示例经实测可得到文档宣称的结果。主要短板在于：UI 层（`main.ts`）全部堆在一个 575 行的单文件中、缺少端到端测试、项目 JSON 格式与设计文档严重不符、以及 route-worker 在极端输入下有可被触发的崩溃。整体作为教学工具已可用，但生产可维护性和健壮性仍有明显提升空间。

---

## 二、核心架构分析

**领域模型**：`MachineDefinition` / `Transition` / `Tape`（稀疏 `Map<number,string>`）/ `TuringMachine` / `StepResult` 划分清晰。`Tape` 用 `Map` 只存非空白单元，写空白符即删除（`core.ts:45-48`），空间效率高。`TuringMachine` 在构造期把规则编译成二级 `Map<StateId, Map<Symbol, Transition>>`（`core.ts:83-93`），O(1) 查表并对重复键抛错，符合设计文档 §4.3 的建议。

**core 与 UI 分离**：做得好。`step()`、`parseTransitions()`、`inputToTape()` 都不触碰 DOM（设计文档 §5、§14 要求），因此单元测试可直接覆盖核心逻辑。UI 状态集中在 `main.ts` 顶层模块变量（`machine / records / timer / status …`），通过 `render()` 家族统一刷新。

**Worker 设计**：`route-worker.ts` 把"全路线总览"放到独立 Worker，主线程模拟与拼图不受影响（设计文档 §6 的精神）。Worker 通过 `progress` / `complete` 两类消息与主线程通信（`route-worker.ts:20,30`），主线程用 `onmessage` 处理（`main.ts:282-295`）。不足之处见第四章——Worker 内部用展开运算符喂 `Math.min/Math.max` 且主线程未挂 `onerror`，存在可达的崩溃路径。

---

## 三、测试结果

实测命令（仓库无 pnpm，改用本地 vitest 入口）：

```bash
cd "D:/soft/turing-machine-simulator" && node node_modules/vitest/vitest.mjs run
```

输出（节选）：

```
 RUN  v3.2.7 D:/soft/turing-machine-simulator

 ✓ tests/tile-puzzle.test.ts (3 tests) 15ms
 ✓ tests/project-state.test.ts (1 test)  7ms
 ✓ tests/core.test.ts (6 tests)         21ms
 ✓ tests/route-view.test.ts (3 tests)   13ms
 ✓ tests/speed.test.ts (2 tests)        11ms

 Test Files  5 passed (5)
      Tests  15 passed (15)
```

**失败项**：无。

**覆盖率评价**：偏低且集中在纯函数。

- 已覆盖：稀疏纸带、解析去重、视图口、一元加一核心执行、缺失转移、reset、瓷砖拼图构建/循环检测/相邻校验、草稿 key 比较、route 画布尺寸/采样/步数归一化、速度归一化与测量。
- 未覆盖（重要缺口）：
  - 内置示例 `binary` / `palindrome` / `beaver` 没有自动化断言（仅 `首版测试报告.md` 声称浏览器人工验证）；我用一次性临时用例临时验证过 `1011→1100`、`1001→ACCEPT` 均正确，但**仓库内无回归保护**。
  - `main.ts` 全部 UI 逻辑（单步/运行/暂停/重置/导入导出/键盘）零测试。
  - `route-worker.ts` 零测试（最易出错的模块反而无覆盖）。
  - 设计文档 §13.3 规划的 Playwright 端到端测试完全缺失。

---

## 四、发现的问题

### 严重（Bug/正确性问题）

**1. route-worker 展开超大数组导致 RangeError 崩溃，且会永久禁用"后台生成"按钮**
- 位置：`route-worker.ts:16-17`
  ```ts
  min = Math.min(min, machine.headPosition, ...cells.map(([position]) => position));
  max = Math.max(max, machine.headPosition, ...cells.map(([position]) => position));
  ```
- 问题：把整条纸带的所有非空白位置通过展开运算符喂给 `Math.min/Math.max`。当非空白单元数超过约 10 万（V8 调用栈参数上限）时抛出 `RangeError: Maximum call stack size exceeded`，Worker 直接崩溃。
- 影响：`normalizeRouteSteps`（`route-view.ts:13-16`）把步数上限放到 `Number.MAX_SAFE_INTEGER`，且 `routeSteps` 输入框无 `max` 属性（`main.ts:110`）——用户若输入大数值（测试本身还断言 `2_500_000` 被接受），极易触发此崩溃。更糟的是主线程只注册了 `onmessage`（`main.ts:282`），**没有 `onerror`**，于是 `generateRoute` 按钮在进入时已被 `disabled`（`main.ts:278`），崩溃后永远不会被重新启用，UI 卡死。
- 建议：用循环累加 `min/max`（或 `for…of` 遍历 `cells`），不要展开数组；并给 Worker 加 `routeWorker.onerror` 以恢复按钮、提示错误。

**2. 大步数下整段运行无实用上限，等价于可构造的卡死**
- 位置：`route-view.ts:13-16`、`main.ts:110`
- 问题：`normalizeRouteSteps` 仅下限 1，上限 `MAX_SAFE_INTEGER`，而 UI 输入框无 `max`。设计文档 §15 明确建议"默认连续运行上限 10,000 步"并给出各项上限，`routeSteps` 却可填任意大整数。
- 影响：配合问题 1，大数值既可能崩溃也可能让 Worker 长时间空转。
- 建议：给 `routeSteps` 设合理 `max`（如 1_000_000）或在归一化处硬性封顶，并在 UI 提示。

### 中等（设计/可维护性）

**3. 初始读写头位置始终为 0，违反需求与设计文档**
- 位置：`main.ts:180`、`main.ts:296`、`route-worker.ts:8`、`src/core.ts:76`（构造器支持但 UI 从不传）
- 问题：需求文档 §3.4 要求"允许用户指定初始读写头位置"，设计文档 §9 的项目 JSON 含 `initialTape.headPosition`。但 `ProjectData`（`main.ts:9-14`）无该字段，`createMachine()` 与 Worker 都使用 `inputToTape(...)` 的默认头位置 0。`TuringMachine` 构造器虽接受 `headPosition` 参数却从未被 UI 使用（死能力）。
- 影响：需要非 0 起点的机器无法正确表达；导出的项目丢失头位置信息。
- 建议：在 `ProjectData` 增加 `headPosition`，UI 增加输入框，并在导入/导出与 Worker 调用处透传。

**4. 项目 JSON 导入校验过松，且与设计文档格式不兼容**
- 位置：`main.ts:501-505`、`main.ts:9-14`
- 问题：导入只判断 `format === "turing-machine-simulator" && version === 1`，随后 `fillProject` 直接读取扁平字段。设计文档 §9 规定的是嵌套结构 `{machine:{}, initialTape:{cells,headPosition}, settings:{speed,maxSteps}}`——按文档格式导出的文件在本实现里会全部读成空值。更糟的是，若文件 `format/version` 正确但缺少某字段，`byId(...).value = project[field]` 会把 `undefined` 直接写成字符串 `"undefined"`（设计文档 §9 要求严格模式/语义校验与"导入失败不得破坏当前项目"）。
- 影响：跨版本/跨实现互操作失败；畸形文件可污染当前工作台。
- 建议：实现设计文档 §9 的嵌套 schema，或同步修订设计文档；导入前做字段存在性与类型校验，失败回滚到原项目。

**5. 空格快捷键在按钮聚焦时会双重触发运行/暂停**
- 位置：`main.ts:561-567`
- 问题：`keydown` 处理 Space 时只排除 `input/textarea/select`（`main.ts:562`），未排除 `button`。当某按钮（如"运行"）获得焦点后按空格，浏览器原生按钮激活与 `run()/pause()` 回调会同时触发，导致运行被立即暂停或重复启动。
- 影响：常规交互下的行为异常，教学演示时易误触。
- 建议：在 `editing` 判定中一并排除 `HTMLButtonElement`，或在处理 Space 时额外 `event.preventDefault()` 并对已聚焦按钮去重。

**6. 瓷砖打乱使用有偏的 `sort(() => Math.random()-0.5)`**
- 位置：`main.ts:243`
  ```ts
  tileOrder = tilePuzzle.solution.slice().sort(() => Math.random() - 0.5);
  ```
- 问题：用 `Array.sort` 加随机比较函数是经典的有偏洗牌（Fisher–Yates 的反模式），各排列出现概率不均，且 `sort` 的比较器违反"一致性"约定在部分引擎下行为不稳定。
- 影响：瓷砖打乱不均匀（某些排列几乎不会出现），但不影响"能否拼对"的正确性。
- 建议：改用 Fisher–Yates 原地随机交换。

**7. UI 全部耦合在单文件 `main.ts`（575 行）**
- 位置：`src/main.ts` 全文
- 问题：纸带渲染、规则表、拼图、路线图、运行调度、导入导出、键盘、生命周期全在一个模块，顶层 30+ 个 `let` 可变状态相互引用，无视图/状态分层。设计文档 §3 规划了 `ui/tape-view.ts`、`ui/rule-editor.ts`、`ui/controls.ts`、`ui/execution-log.ts`、`state/workbench-store.ts` 等分层，实际未落地。
- 影响：难以单元测试（见第三章）、改动牵一发动全身、回归风险高。
- 建议：按设计文档把 `main.ts` 拆分为 `tape-view` / `rule-editor` / `route-view` / `puzzle` / `store` 等子模块，状态收口到一个 `store`。

**8. 路线图绘制与 Worker 采样的性能开销**
- 位置：`main.ts:251-270`、`route-worker.ts:14`
- 问题：`drawRoute` 对画布每个像素（上限 1600×2400 ≈ 384 万）调用一次 `fillRect` 与 `routeSampleIndex`；Worker 每个循环都调用 `machine.tape.entries()`（O(单元数) 排序分配，见 `core.ts:50-52`）再展开。步数大时 CPU/内存占用明显。
- 影响：生成超大路线时主线程卡顿、Worker 分配压力大。
- 建议：`drawRoute` 改为按行/按列批量 `fillRect` 或 `ImageData` 位图写入；Worker 仅在采样帧调用 `entries()`，min/max 用累积变量增量更新而非每次全量展开。

### 轻微（代码味道/小瑕疵）

**9. `step()` 每步重复计算 `terminalReason()`**
- 位置：`core.ts:111` 与 `core.ts:131`
  ```ts
  return { record, stopped: Boolean(this.terminalReason()), reason: this.terminalReason() };
  ```
- 问题：单次 `step()` 至少调用 `terminalReason()` 3 次（进入时 1 次 + 末尾 `Boolean(...)` 与 `reason` 各 1 次）。我已用临时用例验证单次 `step` 该调用计数 ≥ 3。
- 影响：极小（每次 `includes` 数组查询），但属明显重复计算与可读性问题。
- 建议：在 `step()` 开头算一次 `const terminal = this.terminalReason()`，结尾复用局部变量。

**10. `escapeAttribute` 未转义 `>` 与单引号**
- 位置：`main.ts:359`
  ```ts
  return raw.replaceAll("&","&amp;").replaceAll('"',"&quot;").replaceAll("<","&lt;");
  ```
- 问题：缺少 `>` 与 `'` 的转义。当前所有落点都使用双引号属性 + `textContent`，因此暂无 XSS 风险；但若将来模板改用单引号属性会立即泄露。
- 建议：补全 `>` 与 `'` 转义，或统一改用 `textContent` / `setAttribute`。

**11. 规则解析允许逗号与多字素符号，违背设计文档 §8**
- 位置：`core.ts:147`
  ```ts
  const match = line.match(/^([^,]+),(.+?)\s*->\s*([^,]+),(.+?),([LRNlrn])$/);
  ```
- 问题：`readSymbol`/`writeSymbol` 用 `(.+?)`，可匹配逗号与任意长度字符串；设计文档 §8 明确"状态名和符号不允许包含逗号、换行或 `->`"且"符号必须恰好一个 Unicode 字素簇"。
- 影响：非法符号可进入机器（虽不崩溃），与规范不符。
- 建议：收紧为不含逗号/箭头的单字素匹配，并给出行内错误提示。

**12. 本地存储写入未防抖**
- 位置：`main.ts:189`
- 问题：`createMachine()` 每次应用都 `localStorage.setItem`，设计文档 §10 要求"写入采用防抖，避免每次按键同步写盘"。
- 影响：高频应用/编辑时频繁写盘，轻微性能浪费。
- 建议：对持久化做 debounce（如 300ms）。

---

## 五、安全风险

整体**风险低**，符合设计文档 §14 的"不执行用户输入 JavaScript"原则：

- 机器规则仅由受控正则解析器解释，无任何 `eval` / `Function` / `setTimeout(string)` 等动态执行路径。
- 导入文件用 `JSON.parse` 解析（不会执行代码），用户内容经 `textContent` 或已转义属性渲染（见问题 10，当前安全）。
- 无明显 XSS 注入点；`escapeAttribute` 对双引号属性够用。
- 建议加固：① 给 Worker 增加 `onerror`（问题 1）；② 导入做严格 schema 校验（问题 4）；③ 补齐 `escapeAttribute` 转义（问题 10）；④ 导入文件已限制 5MB（`main.ts:499`），符合设计 §15，建议同时限制规则数/状态数/符号长度以防资源耗尽。

---

## 六、性能风险

- **主线程运行循环**：`run()` 用 16ms `setInterval` + 时间片批量（`main.ts:421-433`），每批上限 250 步，后台标签页会被浏览器节流，不会真正失控——符合设计 §6，风险可控。
- **路线图 Worker**：主要风险是问题 1（展开崩溃）与问题 8（逐像素绘制、`entries()` 全量分配）。大步数 + 宽纸带时 CPU/内存压力显著，建议批量绘制与增量 min/max。
- **拼图**：`maxSteps` 上限 30（`main.ts:238`），规模有界，无风险。
- **运行循环速度**：`speed` 上限 1000 步/秒（`speed.ts:3`），且 `due` 批上限 250，安全。

---

## 七、与设计文档的偏差

| 设计文档规划 | 实际实现 | 偏差 |
|---|---|---|
| §3 子目录分层 `core/ parser/ state/ ui/ examples/ persistence/` | 全部扁平于 `src/*.ts` | 未分层，`main.ts` 单文件 575 行（问题 7） |
| §4.1 `MachineDefinition` 含 `states/inputAlphabet/tapeAlphabet` | 无这些字段，引擎不建模字母表 | 缺少字母表校验（需求 §3.3） |
| §8/§3.3 符号=单字素、不含逗号 | 解析允许逗号/多字素（问题 11） | 规范未落地 |
| §9 项目 JSON 嵌套 `machine/initialTape/settings` | 扁平 `ProjectData`（问题 4） | 格式不兼容、导入校验过松 |
| §9/需求 §3.4 可配置初始读写头位置 | 始终为 0（问题 3） | 功能缺失 |
| §10 本地存储防抖写盘 | 立即写（问题 12） | 未实现 |
| §13.3 Playwright 端到端测试 + `tests/e2e` | 无任何 e2e，仅 15 个单元用例 | 测试策略缺口 |
| §6/§17 Web Worker 是否引入"以性能测试决定" | 已实现 Worker（仅用于路线总览） | 属新增特性，方向可接受，但缺 `onerror` |

说明：设计文档本身状态为"待确认"，上述多数偏差属于实现时的简化，需在定稿设计文档时二选一——要么补实现，要么把文档改造成与代码一致。

---

## 八、后续维护建议（按优先级）

1. **修复 route-worker 崩溃路径（问题 1+2）**：去掉 `Math.min/Math.max` 的数组展开、加 `onerror`、给 `routeSteps` 设实用上限——这是唯一可达的崩溃且会卡死 UI，最高优先级。
2. **拆分 `main.ts`（问题 7）**：按设计文档落地 `ui/*` 与 `state/workbench-store.ts` 分层，使 UI 可被测试、降低回归风险。
3. **补齐测试（第三章）**：为 `binary/palindrome/beaver` 示例加断言；为 `route-worker` 与导入导出加单元/集成测试；评估引入 Playwright 覆盖 §13.3 的 e2e 场景。
4. **统一项目 JSON 格式（问题 4）**：让代码与设计文档 §9 对齐，或反向修订文档；导入做严格 schema 校验并失败回滚。
5. **实现初始读写头位置（问题 3）**与字母表/符号合法性校验（问题 11），闭合需求 §3.3/§3.4。
6. **修复交互瑕疵**：空格键双击（问题 5）、Fisher–Yates 洗牌（问题 6）、`escapeAttribute` 补全（问题 10）、`step()` 去重 `terminalReason`（问题 9）、localStorage 防抖（问题 12）。
7. **优化路线图渲染（问题 8）**：`ImageData`/批量 `fillRect`，Worker 内增量 min/max 且仅采样帧调用 `entries()`。
8. **对齐文档状态**：把本文列出的偏差回填进设计文档"待确认/已决定"清单，或补实现，避免文档与代码长期背离。

---

## 九、结论

这是一个**核心引擎正确、UI 与工程化薄弱**的教学型项目：确定性图灵机语义、稀疏纸带、规则索引、解析与瓷砖拼图均实现正确，15 个单测全绿，内置示例经实测结果符合文档宣称。主要风险不在算法正确性，而在（1）`route-worker` 在极端输入下可达的崩溃并卡死按钮；（2）`main.ts` 单文件耦合导致不可测、难维护；（3）项目 JSON 格式与设计文档严重不符且导入校验过松；（4）缺失端到端测试与示例回归保护；（5）若干交互/洗牌/转义小瑕疵。建议在保持核心引擎稳定的前提下，优先处理 Worker 崩溃与分层重构，并把文档与实现对齐。整体评级：**良好**，但距离设计文档承诺的工程化水平仍有明确差距，值得一轮专项治理。
