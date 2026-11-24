import "./styles.css";
import { compactRuleArrows, decodeRuleSymbol, encodeRuleSymbol, formatTransition } from "./rule-format";
import { exampleSource, type ExampleSourceStyle } from "./example-source";
import { effectiveTapeScroll, headFollowShift, inputToTape, parseTransitions, resolveInitialState, slideDurationMs, tapeWindowCenter, TuringMachine, type MachineDefinition, type StepRecord, type TapeViewMode } from "./core";
import { examples, type ExampleProject } from "./examples";
import { machineProjectKey, shouldApplyCurrentDraft } from "./project-state";
import { buildTilePuzzle, isSolved, tileFits, type TilePuzzle } from "./tile-puzzle";
import { attachTapeDrag } from "./tape-drag";
import { normalizeRouteSteps, routeCanvasSize, routeSampleIndex } from "./route-view";
import { applySpeed, attachSpeedSync, type SpeedSyncElements } from "./speed-input";
import { ExecutionScheduler } from "./execution-scheduler";
import { RouteController, type RouteComplete, type RouteRequest } from "./route-controller";
import { RouteTraceView } from "./route-trace-view";
import { renderExecutionLog } from "./execution-log";
import { loadProject, parseProjectJson, saveProject, type ProjectData } from "./project-codec";
import { shuffled } from "./shuffle";
import { compileGijswijtMachine, readGijswijtOutput } from "./gijswijt-tm";
import { editRuleSource } from "./rule-source";
import { renderRuleRows } from "./rule-table";
import { collectProjectSymbols, renameProjectSymbol } from "./project-symbols";
import { attachNameTable } from "./name-table";
import { collectProjectStates, renameProjectState } from "./project-states";
import { visibleTapeSymbol } from "./symbol-annotations";
import { attachDirectGijswijt } from "./gijswijt-direct";
import { attachLambdaCalculator } from "./lambda-direct";
import { loadSpeedPreference, saveSpeedPreference } from "./speed-preference";
import { editorFields, loadEditorDraft, saveEditorDraft } from "./editor-draft";
import { attachSpaceIndentation } from "./text-insertion";
import { attachRuleDiagnostics } from "./rule-diagnostics";
import { createRoutePalette, routeHeadColor, ROUTE_BLANK_COLOR } from "./route-colors";
import { exampleVariant, type ExampleNames, type ExampleStructure } from "./example-variants";
import { migrateUnaryExample } from "./unary-example-migration";
import { requestDownload } from "./download";
import { captureExistingLocalSaves, saveArchive } from "./local-archive";
import { attachLocalArchive } from "./local-archive-view";
import { makeUniversalProject, readUniversalAlphabet, readUniversalResult, splitUniversalSource, universalDefault, universalMaxBudget } from "./universal-machine";
import { universalHalt, universalReject, universalStart } from "./universal-tape";
import { bfBlank, bfPresets, bfStart, makeBrainfuckProject, readBrainfuckOutput, readBrainfuckSource } from "./brainfuck";
import { lambdaBeta, lambdaLimit, makeLambdaProject, migrateLambdaInput, readLambdaOutput, readLambdaSource } from "./lambda-local";
import { fullTapeDisplay, tapeDisplayPositions } from "./tape-display";

const STORAGE_KEY = "turing-machine-simulator.project.v1";
const localArchiveReady = captureExistingLocalSaves();
let machine: TuringMachine | null = null;
let records: StepRecord[] = [];
let status = "就绪";
let stopMessage = "";
let appliedMachineKey: string | null = null;
let tilePuzzle: TilePuzzle | null = null;
let placedTiles: Array<string | null> = [];
let selectedTileId: string | null = null;
let solutionVisible = false;
let tileOrder: string[] = [];
let tapeScroll = 0;
let appliedGijswijtThreshold: number | null = null;
let appliedUniversalAlphabet: ReturnType<typeof readUniversalAlphabet>;
let appliedBrainfuck: ReturnType<typeof readBrainfuckSource>;
let bfProjectSource: { source: string; input: string; rules: string; tape: string } | undefined;
let lambdaProjectSource: { source: string; capacity: number; betaState?: string; rules: string; tape: string } | undefined;
let appliedLambda: { source: string; capacity: number; betaState?: string } | undefined;
let lambdaHasReduced = false;
let lambdaView: ReturnType<typeof readLambdaOutput>;
let lambdaDisplay: Map<number, string> | undefined;
let universalTimer: number | undefined;
// 上次渲染时纸带窗口中心；用于「跟随读写头」模式下判断中心是否变化，从而触发平滑滑动。null 表示下一次渲染直接定位、不滑入。
let tapeRenderCenter: number | null = null;
let tapeMotion: "continuous" | "manual" = "manual";

const defaultProject: ProjectData = {
  format: "turing-machine-simulator",
  version: 1,
  maxSteps: 10000,
  speed: 5,
  ...examples.unary,
};

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <div class="app">
    <header class="topbar">
      <div class="brand"><div class="brand-mark">TM</div><div><h1>图灵机实验台</h1><p>单纸带 · 确定性 · 可编程</p></div></div>
      <div class="toolbar">
        <a class="campaign-link" href="./campaign.html">进入关卡</a>
        <a class="campaign-link" href="./principles.html">示例原理</a>
        <button id="exportProject">导出项目</button>
        <button data-local-saves>本地存档</button>
        <button id="importProject">导入项目</button>
        <input id="fileInput" type="file" accept="application/json,.json" hidden />
        <button id="exportLog">导出记录</button>
      </div>
    </header>
    <main class="workspace">
      <section class="panel machine-panel">
        <div class="status-row">
          <div class="metric"><span>运行状态</span><strong id="status" class="status-pill">就绪</strong></div>
          <div class="metric"><span>当前状态</span><strong id="currentState">—</strong></div>
          <div class="metric"><span>读取符号</span><strong id="readSymbol">—</strong></div>
          <div class="metric"><span>读写头位置</span><strong id="headPosition">0</strong></div>
          <div class="metric"><span>已执行步数</span><strong id="stepCount">0</strong></div>
        </div>
        <div class="tape-shell"><div class="tape-viewport"><div id="tape" class="tape"></div></div><div id="headState" class="head-state"></div></div>
      </section>
        <div class="controls simulation-controls" role="toolbar" aria-label="图灵机运行控制">
          <button id="step" class="btn">单步</button>
          <button id="run" class="btn primary">运行</button>
          <button id="pause" class="btn">暂停</button>
          <button id="reset" class="btn">重置</button>
          <label class="view-mode">纸带视角<select id="tapeViewMode"><option value="follow-head">跟随读写头</option><option value="fixed-zero">固定在 0</option><option value="free-drag">随意拖动</option><option value="show-all">显示全部</option></select></label>
          <div class="speed"><span>目标速度</span><input id="speed" type="range" min="1" max="1000" value="5" /><input id="speedNumber" type="number" min="1" max="1000" step="1" value="5" title="手动输入目标速度（步/秒）" /><span id="speedText">5 步/秒</span><strong id="actualSpeed">实际 0 步/秒</strong></div>
        </div>
      <div class="lower">
        <section class="panel editor">
          <div class="panel-title"><h2>机器定义</h2><small>每行一条规则：状态,符号 → 状态,符号,方向</small></div>
          <div class="form-grid">
            <label>初始输入<textarea id="input" rows="1" spellcheck="false"></textarea></label>
            <label>空白符<input id="blankSymbol" maxlength="2" /></label>
            <label>初始状态<input id="initialState" /></label>
            <div class="step-limit-field"><label for="maxSteps">最大步数</label><div class="step-limit-control"><input id="maxSteps" type="number" min="1" max="1000000" /><label class="max-steps-option"><input id="unlimitedSteps" type="checkbox" /> Max</label></div></div>
            <label>接受状态<input id="acceptStates" placeholder="逗号分隔" /></label>
            <label>拒绝状态<input id="rejectStates" placeholder="逗号分隔" /></label>
            <label>普通停机状态<input id="haltStates" placeholder="逗号分隔" /></label>
          </div>
          <label>转移规则 / 函数源码<textarea id="rules" spellcheck="false"></textarea></label>
          <div id="draftStatus" class="hint" role="status"></div>
          <details class="function-help"><summary>函数定义与调用写法</summary>
            <p>定义：函数名(初始状态, 退出状态, 可选子函数...):。正常完成后继续调用位置下面，函数内用 ret 指定跳到外部的返回状态。单独调用只写函数名，不写括号。Tab 插入四个空格。</p>
            <pre>追加(q0, 结束):
    q0,1 -&gt; q0,1,R
    q0,□ -&gt; 结束,1,R

追加
追加</pre>
            <p>初始输入填 111，普通停机状态填 HALT，结果是 11111。初始状态框可指定状态、函数或公开入口，留空才默认从首个顶格调用开始。原来的单状态定义仍兼容，默认走到普通停机态就退出；指定退出状态后，其它普通停机态会终止整个程序。此版本不支持递归。</p>
            <p>q1 后可列子函数名，或写“局部名=函数名”，如 主函数(q0,q1,写=写一):。普通子函数完成后续行，声明 ret 才返回父函数或外部对应状态。</p>
            <p>前两个位置固定为初始状态、退出状态，后面才是参数：组合(q0,done,移动=右移,函数,完成=finish,状态,1,符号):。类型放在对应参数后面，用逗号分隔。函数或外部状态写 内部名=外部名；符号直接填 1,符号，不用另起内部符号名。移动 是函数调用，完成 则直接跳到外部 finish。仍只写 组合 调用，不带括号。未标类型的等号绑定先查函数，否则按外部状态处理；明确标了类型则核对该类型。函数、状态类型也支持 function/fn、state，符号类型支持 symbol/char。外部状态别名也可用于规则来源；合并后的实际规则不能重复。</p>
            <p>写入处用 * 保留读取符号，移动处用 * 表示不移动，函数里也一样。目标后只剩一项时，R/L 优先表示移动，其它值表示写入：q0,1-&gt;目标,R 保留 1 并右移；q0,1-&gt;目标,R,* 才写入字母 R、不移动。q0,1-&gt;目标,*,* 保留符号且不移动。写入与移动可分别留空。</p>
            <p>字面星号多写一个：** 表示字符 *，*** 表示两个星号组成的符号，依此类推。在读取、写入或符号参数中，用 \\s 表示一个普通空格，例如 q0,\\s-&gt;q1,1,R。N 在单字段简写中是写入字符，不是方向，明确不移动可写 *,N 或 *,*。</p>
            <p>符号可写成 <code>1#(标记)</code>。纸带显示 <code>1</code>，规则按完整符号匹配。写 <code>/#(文字)</code> 或 <code>\\#(文字)</code> 可以显示字面的 <code>#(文字)</code>。在规则里也可以用 <code>/-</code> 或 <code>\\-</code> 写减号，用 <code>//</code> 写斜杠，用 <code>\\\\</code> 写反斜杠。</p>
            <p>读取项留空或 * 表示任意符号，如 q0,-&gt;q1,*,*；当前状态留空或 * 表示任意状态，如 ,1-&gt;q1,*,*；两项都留空可写 ,-&gt;q1,*,*。来源状态也省略时需保留分隔逗号。明确状态/符号规则优先，然后是明确状态/任意符号，再是任意状态/明确符号，最后两者任意。函数内任意状态只匹配本次调用的局部状态，展开规则里的内部名称前缀.* 表示这个范围。</p>
            <p>只有状态和目标时可直接写 0.2-&gt;succ，等价于 0.2,*-&gt;succ,*,*：任意读取、保持符号、不移动。succ 是函数则调用，否则切换到普通状态。函数内部也支持，第 13 课有示例。</p>
            <p>顶层表达式跳到函数时，先找后面最近的同名裸调用：有就跳到那一行，执行后继续它下面；没有则在当前表达式处调用，完成后继续下一行。同状态、不同读取符号的分支可以分开写，仍共用状态入口；相同状态和读取符号再次出现，才开始下一个独立表达式。</p>
            <p>函数体也可混写规则和裸调用：状态跳到子函数时，先找当前函数体下面最近的同名或同一绑定函数的调用；没有则就地调用后续行。裸调用完成后执行下面的表达式或调用。函数头指定初始状态，普通局部状态仍可循环。</p>
            <p>复用公共规则块时可在顶层写“入口状态: 公共函数 -&gt; 续接状态”。它直接把入口连接到函数，完成后转到指定状态，不增加额外读写或移动步骤。多个入口可复用一个函数并分别续接。</p>
            <p>正常执行完函数就继续下一行。函数内写“ret q1”，执行到 q1 才跳到外面对应的状态；兼容中文“返回状态 q1”。写“导出状态 inside”则公开为“主函数.inside”，用于补写规则或选择入口。示例菜单的“函数教程”分组提供 16 课，含参数、所有省略字段、R/L 简写、星号转义和任意状态/符号；“返回外部状态”可比较保留和删除 ret 的不同结果。</p>
            <p>外部状态转换后保留原名，例如 q1 仍叫 q1，不加内部前缀。同名独立表达式再次出现时使用 q1_2 等后缀区分，避开已有名称；函数内部状态仍按调用实例隔离。</p>
            <p>子函数的实际名称按父路径.FN.编号.子函数.状态排列，例如 COPY.FN.1.SUCC.q0。父函数在前，编号居中。COPY 在不同位置调用两次 SUCC 合法，两处编号不同；映射注明各自调用行。OTHER 调用同一 SUCC 则显示 OTHER.FN.编号.SUCC.状态，多层调用保留所有父函数。独立函数使用 函数.FN.编号.状态。第 16 课“重复子调用与所属路径”可直接运行验证，空输入 5 步输出 111。</p>
          </details>
          <div id="functionStatus" class="hint" role="status"></div>
          <details id="compiledProgram" class="compiled-program">
            <summary>实际内部名称与规则</summary>
            <p id="compiledEntry" class="hint" role="status"></p>
            <label>原名称 → 实际内部名称<textarea id="internalNameMap" readonly rows="7" spellcheck="false"></textarea></label>
            <label>转换后的实际转移规则<textarea id="compiledRuleSource" readonly rows="10" spellcheck="false"></textarea></label>
          </details>
          <details id="symbolTable" class="compiled-program">
            <summary>符号表</summary>
            <p class="hint">在「改为」栏输入新符号，停顿片刻后自动保存。规则、初始输入和空白符会同步更新，运行会重置。普通空格写作 <code>\\s</code>。</p>
            <div class="rule-table name-table" role="table" aria-label="符号表"></div>
            <p class="name-table-status hint" role="status"></p>
          </details>
          <details id="stateTable" class="compiled-program">
            <summary>状态表</summary>
            <p class="hint">在「改为」栏输入新名称，停顿片刻后自动同步规则和状态设置。函数展开的状态由源码管理。</p>
            <div class="rule-table name-table" role="table" aria-label="状态表"></div>
            <p class="name-table-status hint" role="status"></p>
          </details>
          <details id="nameTranslation" class="compiled-program name-translation">
            <summary>名称转译</summary>
            <p class="hint">每行填一个名称。输出会解开转义，并按纸带的显示方式隐藏 <code>#(...)</code> 标记。</p>
            <label for="nameTranslationInput">规则里的写法<textarea id="nameTranslationInput" rows="2" spellcheck="false"></textarea></label>
            <label for="nameTranslationOutput">标准文本<textarea id="nameTranslationOutput" rows="2" readonly spellcheck="false"></textarea></label>
          </details>
          <div class="table-heading"><strong>结构化规则表</strong><button id="addRule" class="btn">＋ 新增规则</button></div>
          <div id="ruleTable" class="rule-table"></div>
          <div id="ruleCount" class="hint" role="status"></div>
          <div class="editor-actions"><button id="apply" class="btn primary">应用并重置</button><button data-save-local class="btn">保存存档</button><button id="clear" class="btn danger">清空规则</button><span id="errors" class="error"></span></div>
          <div class="hint">快捷键：空格运行/暂停，Alt + → 单步，Ctrl + R 重置（输入框聚焦时不触发）。</div>
        </section>
        <aside class="side">
          <section class="panel">
            <div class="panel-title"><h2>示例程序</h2><small>${Object.keys(examples).length} 个</small></div>
            <select id="example" style="width:100%">
              ${["一进制运算", "二进制运算", "函数教程", "基础示例", "猜想验证", "关卡示例"].map((category) => `<optgroup label="${category}">${Object.entries(examples).filter(([, item]) => item.category === category).map(([key, item]) => `<option value="${key}">${item.name}</option>`).join("")}</optgroup>`).join("")}
            </select>
            <label style="margin-top:10px">示例源码<select id="exampleSourceStyle"><option value="plain">无注释</option><option value="commented">有注释</option></select></label>
            <div id="exampleProgramOptions">
              <label style="margin-top:10px">状态名称<select id="exampleStateNames"><option value="descriptive">示例原名</option><option value="numeric">数字状态名</option></select></label>
              <label style="margin-top:10px">程序结构<select id="exampleStructure"><option value="original">保留示例结构</option><option value="flat">无函数（展开规则）</option><option value="functions">公共函数（提取重复代码）</option></select></label>
              <p class="hint">适用于所有示例。公共函数只定义一次，各入口指定自己的续接状态；无重复块时保留原规则。选择后点击“加载此示例”。</p>
            </div>
            <p id="exampleNote" class="example-note"></p>
            <p><a id="examplePrinciple" href="./principles.html">查看此示例的原理</a> · <a id="exampleCampaign" href="./campaign.html">练习此示例关卡</a></p>
            <button id="loadExample" class="btn" style="width:100%">加载此示例</button>
          </section>
          <section class="panel">
            <div class="panel-title"><h2 id="logTitle">执行记录</h2></div>
            <p id="stopMessage" class="hint" role="status"></p>
            <div id="log" class="log"></div>
          </section>
        </aside>
      </div>
      <section class="panel route-panel">
        <div class="route-heading">
          <div><h2>全路线总览</h2><p>后台计算运行轨迹。压缩总览查看整体，显示全部逐步逐格查看；生成时仍可继续使用模拟器。</p></div>
          <div class="route-actions"><label>显示方式<select id="routeViewMode"><option value="overview">压缩总览</option><option value="all">显示全部</option></select></label><label>运行步数<input id="routeSteps" type="number" min="1" step="1" value="10000" /></label><button id="generateRoute" class="btn primary">后台生成</button><button id="cancelRoute" class="btn" disabled>取消</button></div>
        </div>
        <div class="route-progress"><progress id="routeProgress" max="100" value="0"></progress><span id="routeStatus">等待生成</span></div>
        <div id="routeLegend" class="route-legend"><span class="legend-head"></span>读写头（略带当前符号颜色） <span class="legend-empty"></span>空白；生成后显示各符号颜色。纵向为时间，横向为纸带位置</div>
        <div id="routeFullControls" class="route-full-controls" hidden><label>定位到第几步<input id="routeGoStep" type="number" min="0" step="1" value="0" /></label><button id="routeGo" class="btn">定位</button></div>
        <p id="routeWindow" class="route-window"></p>
        <div id="routeViewport" class="route-canvas-shell"><div id="routeSurface"><canvas id="routeCanvas" width="900" height="260"></canvas></div><div id="routeEmpty">输入步数后点击“后台生成”</div></div>
      </section>
      <section class="panel puzzle-panel">
        <div class="puzzle-heading">
          <div><h2>计算瓷砖拼图</h2><p>每一行是一个时刻；相邻边必须同色。点击或拖动瓷砖，把它放入上方空格。</p></div>
          <div class="puzzle-actions"><label>生成步数<input id="puzzleSteps" type="number" min="1" max="30" value="10" /></label><button id="generatePuzzle" class="btn primary">生成瓷砖</button><button id="checkPuzzle" class="btn">检查拼法</button><button id="showSolution" class="btn">查看正确拼法</button></div>
        </div>
        <div id="cycleInfo" class="cycle-info">应用一台图灵机后生成瓷砖。</div>
        <div class="puzzle-scroll"><div id="puzzleBoard" class="puzzle-board"></div></div>
        <h3 class="tray-title">待拼瓷砖 <small>点击一块，再点击空格；也支持拖放</small></h3>
        <div id="tileTray" class="tile-tray"></div>
        <div id="puzzleMessage" class="puzzle-message" aria-live="polite"></div>
      </section>
      <section class="panel gijswijt-converter" aria-labelledby="gijswijtTitle">
        <div class="sequence-mode-bar"><h2 id="gijswijtTitle">吉斯维杰特数列</h2><label for="sequenceMode">计算模式<select id="sequenceMode"><option value="tm">图灵机计算 · 规则与单步</option><option value="direct">直接计算 · 快速生成</option></select></label></div>
        <div id="tmSequenceMode">
        <div class="converter-heading">
          <div><p>输入阈值，转换后的规则会显示在下方。点击上方“运行”开始计算；新项严格超过阈值时写出并停机，等于时继续。</p></div>
          <div class="converter-actions"><label for="gijswijtThreshold">整数阈值（0–16）<input id="gijswijtThreshold" type="number" min="0" max="16" step="1" value="2" /></label><button id="compileGijswijt" class="btn primary">开始转换</button></div>
        </div>
        <p class="hint">0 表示未写入；数字表示数列项。计算时 |O、S、A、B 为比较标记，#数字记录本轮最大重复次数，停机时会清除。建议先试 2；阈值越大，运行可能极长。</p>
        <p id="gijswijtCompileStatus" class="converter-status" role="status"></p>
        <div id="gijswijtResult" hidden><label for="gijswijtOutput">已写入的数列（直接读取纸带）</label><textarea id="gijswijtOutput" readonly rows="3" spellcheck="false"></textarea><p id="gijswijtOutputStatus" class="hint" aria-live="polite"></p></div>
        </div>
        <div id="directSequenceMode" hidden>
          <div class="converter-heading"><p>按最大重复后缀的定义快速生成数列。切换模式会保留当前页中两种模式各自的进度。</p></div>
          <div class="direct-actions"><button id="directNext" class="btn">写入下一项</button><label for="directTarget">生成到第几项<input id="directTarget" type="number" min="1" step="1" value="30" /></label><button id="directGenerate" class="btn primary">批量生成</button><button id="directCancel" class="btn" disabled>取消</button><button id="directReset" class="btn">重置数列</button></div>
          <p id="directStatus" class="converter-status" role="status"></p>
          <div id="directTape" class="sequence-tape" aria-label="直接计算的数列纸带"></div>
          <p class="hint">0 = 尚未写入；正整数 = 数列项。纸带显示最新 40 项，完整数列见下方。</p>
          <label for="directOutput">完整数列</label><textarea id="directOutput" readonly rows="3" spellcheck="false"></textarea>
        </div>
      </section>
      <section id="lambdaCalculator" class="panel gijswijt-converter" aria-labelledby="lambdaTitle">
        <div class="sequence-mode-bar"><h2 id="lambdaTitle">λ 表达式归约</h2><label for="lambdaMode">计算模式<select id="lambdaMode"><option value="direct">直接计算</option><option value="tm">图灵机计算</option></select></label></div>
        <form id="lambdaForm">
          <label for="lambdaInput">λ 表达式<textarea id="lambdaInput" rows="2" spellcheck="false" autocomplete="off"></textarea></label>
          <p class="hint">名称字符：A–Z、a–z、0–9、_、.。AB_12 和 A.B 都是完整变量，A B 是应用。带点参数写 <code>λA.B . A.B</code>，旧写法 <code>λx.x</code> 也支持。重名时加数字后缀。</p>
          <div id="lambdaDirectMode">
            <div class="direct-actions"><button id="lambdaCalculate" class="btn primary" type="submit">直接归约</button><button id="lambdaStep" class="btn" type="button">单步归约</button><button id="lambdaCancel" class="btn" type="button" disabled>取消</button></div>
            <p id="lambdaStatus" class="converter-status" role="status"></p>
            <label for="lambdaOutput">归约结果<textarea id="lambdaOutput" class="lambda-output" readonly rows="2" spellcheck="false"></textarea></label>
          </div>
          <div id="lambdaTapeMode" hidden>
            <div class="direct-actions"><button class="btn primary" type="submit">载入图灵机</button></div>
            <p id="lambdaTapeStatus" class="converter-status" role="status"></p>
            <div class="direct-actions"><button id="runLambdaTape" class="btn" type="button" disabled>快速归约（纸带规则）</button><button id="pauseLambdaTape" class="btn" type="button" disabled>暂停</button></div>
            <label class="lambda-aux-option"><input id="lambdaAuxCells" type="checkbox" /> 显示辅助格</label>
            <label for="lambdaTapeOutput">当前表达式<textarea id="lambdaTapeOutput" rows="3" readonly spellcheck="false"></textarea></label>
          </div>
        </form>
      </section>
      <section class="panel gijswijt-converter" aria-labelledby="bfTitle">
        <div class="sequence-mode-bar"><h2 id="bfTitle">BF</h2><label for="bfPreset">BF 示例<select id="bfPreset">${Object.entries(bfPresets).map(([key, preset]) => `<option value="${key}">${preset.name}</option>`).join("")}</select></label></div>
        <form id="bfForm">
          <label for="bfSource">BF 源码<textarea id="bfSource" rows="3" spellcheck="false"></textarea></label>
          <p class="hint"><code>&gt; &lt;</code> 移动单元，<code>+ -</code> 加减一，<code>. ,</code> 输出和输入字节，<code>[ ]</code> 循环。其它字符忽略。单元为 0～255，溢出回绕；左右均可延伸，输入结束读 0。空白符固定为 <code>|</code>。</p>
          <label for="bfInput">程序输入（UTF-8）<textarea id="bfInput" rows="2" spellcheck="false"></textarea></label>
          <div class="direct-actions"><button class="btn primary" type="submit">转换并载入图灵机</button><button id="runBf" class="btn" type="button" disabled>快速运行 BF</button><button id="pauseBf" class="btn" type="button" disabled>暂停</button></div>
        </form>
        <p id="bfCompileStatus" class="converter-status" role="status"></p>
        <p class="hint">转换只生成规则和编码输入，运行时由读写头逐格计算。可用上方“单步”“运行”或“暂停”；快速运行会连续执行相同规则并定时让出界面。</p>
        <div id="bfResult" hidden>
          <label for="bfOutput">字符输出<textarea id="bfOutput" rows="2" readonly spellcheck="false"></textarea></label>
          <label for="bfBytes">字节输出（纸带每格显示一个字节）<textarea id="bfBytes" rows="2" readonly spellcheck="false"></textarea></label>
          <p id="bfStatus" class="hint" role="status"></p>
        </div>
      </section>
      <section class="panel gijswijt-converter" aria-labelledby="universalTitle">
        <div class="sequence-mode-bar"><h2 id="universalTitle">通用图灵机</h2></div>
        <form id="universalForm">
          <label for="universalSource">被模拟机器的转移规则<textarea id="universalSource" class="universal-source" rows="5" spellcheck="false"></textarea></label>
          <p class="hint">每行一条规则，可以直接粘贴机器源码。初始纸带和状态在下方分别填写；纸带里的斜杠、反斜杠、逗号和换行都按原样读入。</p>
          <div class="form-grid">
            <label for="universalInput">初始纸带<textarea id="universalInput" rows="2" spellcheck="false"></textarea></label>
            <label for="universalInitial">初始状态<input id="universalInitial" value="q0" /></label>
            <label for="universalHalt">停止状态<input id="universalHalt" value="HALT" /></label>
            <label for="universalAccept">接受状态<input id="universalAccept" placeholder="可留空" /></label>
            <label for="universalReject">拒绝状态<input id="universalReject" placeholder="可留空" /></label>
          </div>
          <p class="hint">多个终态用 <code>|</code> 分隔。最多模拟步数可不填，留空则一直运行到目标机器停止，也可随时暂停。</p>
          <div class="direct-actions">
            <label for="universalBlank">空白符<input id="universalBlank" value="□" maxlength="2" required /></label>
            <label for="universalBudget">最多模拟步数（可省略）<input id="universalBudget" type="number" min="0" max="${universalMaxBudget}" step="1" placeholder="不限" /></label>
            <button class="btn primary" type="submit">转换并载入</button>
            <button id="runUniversal" class="btn" type="button" disabled>快速运行模拟</button>
          </div>
        </form>
        <p id="universalCompileStatus" class="converter-status" role="status"></p>
        <p id="universalAlphabet" class="hint"></p>
        <div id="universalResult" hidden>
          <label for="universalOutput">纸带结果,运行状态<textarea id="universalOutput" class="universal-source" rows="2" readonly spellcheck="false"></textarea></label>
          <p id="universalStatus" class="hint" role="status"></p>
        </div>
      </section>
    </main>
  </div>`;

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const value = (id: string) => byId<HTMLInputElement | HTMLTextAreaElement>(id).value;
const splitStates = (raw: string) => raw.split(",").map((item) => item.trim()).filter(Boolean);
const ruleDiagnosticView = attachRuleDiagnostics(byId<HTMLTextAreaElement>("rules"));

const nameTranslationInput = byId<HTMLTextAreaElement>("nameTranslationInput");
const nameTranslationOutput = byId<HTMLTextAreaElement>("nameTranslationOutput");
nameTranslationInput.addEventListener("input", () => {
  nameTranslationOutput.value = nameTranslationInput.value.split("\n")
    .map(line => visibleTapeSymbol(decodeRuleSymbol(line))).join("\n");
});

attachDirectGijswijt(byId("directSequenceMode"));
byId("sequenceMode").addEventListener("change", () => {
  const direct = value("sequenceMode") === "direct";
  byId("tmSequenceMode").hidden = direct;
  byId("directSequenceMode").hidden = !direct;
});

function collectProject(): ProjectData {
  return {
    format: "turing-machine-simulator",
    version: 1,
    name: "自定义图灵机",
    description: "用户编辑的图灵机项目",
    input: value("input"),
    blankSymbol: value("blankSymbol") || "□",
    initialState: value("initialState"),
    acceptStates: value("acceptStates"),
    rejectStates: value("rejectStates"),
    haltStates: value("haltStates"),
    rules: value("rules"),
    maxSteps: byId<HTMLInputElement>("unlimitedSteps").checked ? null : Number(value("maxSteps")) || 10000,
    speed: Number(value("speed")) || 5,
    ...(bfProjectSource && bfProjectSource.rules === value("rules") && bfProjectSource.tape === value("input")
      ? { brainfuckSource: { source: bfProjectSource.source, input: bfProjectSource.input } } : {}),
    ...(lambdaProjectSource && lambdaProjectSource.rules === value("rules") && lambdaProjectSource.tape === value("input")
      ? { lambdaSource: { source: lambdaProjectSource.source, capacity: lambdaProjectSource.capacity, betaState: lambdaProjectSource.betaState } } : {}),
  };
}

function fillProject(project: ProjectData | ExampleProject): void {
  if (value("rules")) void saveArchive({ kind: "project", title: "切换前的实验台草稿", content: JSON.stringify(collectProject()) }, "切换前备份").catch(() => {});
  const bfSource = project.brainfuckSource ?? readBrainfuckSource(project.rules);
  bfProjectSource = bfSource && typeof bfSource.source === "string" && typeof bfSource.input === "string"
    ? { ...bfSource, rules: compactRuleArrows(project.rules), tape: project.input } : undefined;
  const lambdaSource = project.lambdaSource ?? readLambdaSource(project.rules);
  lambdaProjectSource = lambdaSource && typeof lambdaSource.source === "string" && Number.isInteger(lambdaSource.capacity)
    ? { ...lambdaSource, rules: compactRuleArrows(project.rules), tape: project.input } : undefined;
  const fields = ["input", "blankSymbol", "initialState", "acceptStates", "rejectStates", "haltStates", "rules"] as const;
  for (const field of fields) byId<HTMLInputElement | HTMLTextAreaElement>(field).value = field === "rules" ? compactRuleArrows(project[field]) : project[field];
  const stepLimit = project.maxSteps === undefined ? 10000 : project.maxSteps;
  const unlimited = stepLimit === null;
  byId<HTMLInputElement>("unlimitedSteps").checked = unlimited;
  byId<HTMLInputElement>("maxSteps").value = stepLimit === null ? "10000" : String(stepLimit);
  byId<HTMLInputElement>("maxSteps").disabled = unlimited;
  if ("speed" in project) byId<HTMLInputElement>("speed").value = String(project.speed);
  updateSpeedText();
  persistTargetSpeed(Number(value("speed")));
  persistEditorDraft();
}

function persistEditorDraft(): void {
  const error = saveEditorDraft(localStorage, collectProject());
  byId("draftStatus").textContent = error ?? "草稿已自动保存，刷新后保留（无需先应用）。";
  byId("draftStatus").classList.toggle("error", error !== null);
}

function createMachine(preparedRules?: ReturnType<typeof parseTransitions>): boolean {
  pause();
  const project = collectProject();
  persistEditorDraft();
  const terminalStates = { acceptStates: splitStates(project.acceptStates), rejectStates: splitStates(project.rejectStates), haltStates: splitStates(project.haltStates) };
  const parsed = preparedRules ?? parseTransitions(project.rules, terminalStates);
  ruleDiagnosticView.update(parsed.errors);
  const errors = [...parsed.errors];
  const initialState = resolveInitialState(parsed, project.initialState);
  if (!initialState) errors.unshift("初始状态不能为空");
  if (!project.blankSymbol) errors.unshift("空白符不能为空");
  if (Array.from(project.blankSymbol).length !== 1) errors.unshift("空白符必须是一个字符");
  byId("errors").textContent = errors.slice(0, 4).join("；");
  if (errors.length) return false;
  const definition: MachineDefinition = {
    blankSymbol: project.blankSymbol,
    initialState,
    ...terminalStates,
    transitions: parsed.transitions,
  };
  try {
    machine = new TuringMachine(definition, inputToTape(project.input, project.blankSymbol));
  } catch (error) {
    byId("errors").textContent = error instanceof Error ? error.message : "无法创建机器";
    return false;
  }
  records = [];
  const thresholdMatch = project.initialState === "G.seed" && project.blankSymbol === "0"
    ? project.rules.slice(0, 100).match(/^# Gijswijt threshold=(\d+)$/m) : null;
  appliedGijswijtThreshold = thresholdMatch ? Number(thresholdMatch[1]) : null;
  appliedUniversalAlphabet = initialState === universalStart ? readUniversalAlphabet(project.rules) : undefined;
  const bfSource = project.blankSymbol === bfBlank && (initialState === bfStart || project.rules.includes("#(F.o)#"))
    ? project.brainfuckSource ?? readBrainfuckSource(project.rules) : undefined;
  appliedBrainfuck = bfSource;
  if (bfSource) {
    byId<HTMLTextAreaElement>("bfSource").value = bfSource.source;
    byId<HTMLTextAreaElement>("bfInput").value = bfSource.input;
  }
  appliedLambda = project.lambdaSource ?? readLambdaSource(project.rules);
  lambdaView = undefined;
  lambdaDisplay = undefined;
  lambdaHasReduced = false;
  if (appliedLambda) byId<HTMLTextAreaElement>("lambdaInput").value = appliedLambda.source;
  if (appliedGijswijtThreshold !== null) byId<HTMLInputElement>("gijswijtThreshold").value = String(appliedGijswijtThreshold);
  tapeScroll = 0;
  tapeRenderCenter = null;
  appliedMachineKey = machineProjectKey(project);
  status = "就绪";
  stopMessage = "";
  const storageError = saveProject(localStorage, STORAGE_KEY, project);
  if (storageError) byId("errors").textContent = storageError;
  render();
  renderRuleTable(parsed);
  generatePuzzle();
  return true;
}

function edgeColor(edge: string): string {
  let hash = 0;
  for (const char of edge) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return `hsl(${hash % 360} 62% 48%)`;
}

function tileMarkup(tileId: string): string {
  const tile = tilePuzzle?.tiles.find((item) => item.id === tileId);
  if (!tile) return "";
  const label = tile.state ? `${tile.state} · ${tile.symbol}` : tile.symbol;
  return `<div class="wang-tile${tile.state ? " head-tile" : ""}" draggable="true" data-tile-id="${tile.id}" title="${escapeAttribute(label)}">
    <i class="edge edge-top" style="background:${edgeColor(tile.top)}"></i><i class="edge edge-right" style="background:${edgeColor(tile.right)}"></i>
    <i class="edge edge-bottom" style="background:${edgeColor(tile.bottom)}"></i><i class="edge edge-left" style="background:${edgeColor(tile.left)}"></i>
    <span>${tile.state ? `<b>${escapeAttribute(tile.state)}</b>` : ""}${escapeAttribute(tile.symbol)}</span></div>`;
}

function renderPuzzle(): void {
  const board = byId("puzzleBoard");
  const tray = byId("tileTray");
  if (!tilePuzzle) { board.innerHTML = ""; tray.innerHTML = ""; return; }
  board.style.gridTemplateColumns = `repeat(${tilePuzzle.columns}, 62px)`;
  board.innerHTML = placedTiles.map((tileId, slot) => `<button class="tile-slot${solutionVisible ? " solution-slot" : ""}" data-slot="${slot}" aria-label="第 ${Math.floor(slot / tilePuzzle!.columns) + 1} 行第 ${slot % tilePuzzle!.columns + 1} 列">${tileId ? tileMarkup(tileId) : `<span>${slot % tilePuzzle!.columns + tilePuzzle!.minPosition}</span>`}</button>`).join("");
  const remaining = tileOrder.map((id) => tilePuzzle!.tiles.find((tile) => tile.id === id)!).filter((tile) => !placedTiles.includes(tile.id));
  tray.innerHTML = remaining.map((tile) => `<button class="tray-tile${selectedTileId === tile.id ? " selected" : ""}" data-select-tile="${tile.id}">${tileMarkup(tile.id)}</button>`).join("") || `<div class="empty">所有瓷砖都已放到棋盘</div>`;
}

function placeTile(slot: number, tileId: string): void {
  if (!tilePuzzle || solutionVisible) return;
  const old = placedTiles[slot];
  if (!tileFits(tilePuzzle, placedTiles, slot, tileId)) {
    byId("puzzleMessage").textContent = "这块瓷砖与已放置的相邻边不匹配，或已经使用过。";
    return;
  }
  if (old) placedTiles[slot] = null;
  placedTiles[slot] = tileId;
  selectedTileId = null;
  byId("puzzleMessage").textContent = isSolved(tilePuzzle, placedTiles) ? "完成！这张铺法逐行复现了图灵机的计算历史。" : "已放置。";
  renderPuzzle();
}

function generatePuzzle(): void {
  if (!machine) return;
  const steps = Math.min(30, Math.max(1, Number(value("puzzleSteps")) || 10));
  tilePuzzle = buildTilePuzzle(machine.definition, inputToTape(value("input"), machine.definition.blankSymbol), steps, 1);
  placedTiles = Array(tilePuzzle.solution.length).fill(null);
  selectedTileId = null;
  solutionVisible = false;
  tileOrder = shuffled(tilePuzzle.solution);
  const loopText = tilePuzzle.loop ? `发现循环：从第 ${tilePuzzle.loop.start} 步开始，周期 ${tilePuzzle.loop.length} 步。` : `未发现循环；计算结果：${reasonText[tilePuzzle.stopReason as keyof typeof reasonText] ?? `到达 ${steps} 步上限`}。`;
  byId("cycleInfo").textContent = `${loopText} 棋盘 ${tilePuzzle.rows} × ${tilePuzzle.columns}，共 ${tilePuzzle.tiles.length} 块。`;
  byId("showSolution").textContent = "查看正确拼法";
  byId("puzzleMessage").textContent = "瓷砖已打乱。先找带状态名的读写头瓷砖。";
  renderPuzzle();
}

let routeBlankSymbol = "□";
let routeTraceView: RouteTraceView | undefined;
let lastRouteRequest: RouteRequest | undefined;
let lastRouteResult: RouteComplete | undefined;
function drawRoute({ frames, min, max, symbols, trace }: RouteComplete): void {
  routeTraceView?.destroy(); routeTraceView = undefined;
  byId("routeFullControls").hidden = true;
  const canvas = byId<HTMLCanvasElement>("routeCanvas");
  const colors = createRoutePalette(symbols, routeBlankSymbol);
  if (trace) {
    routeTraceView = new RouteTraceView(byId("routeViewport"), byId("routeSurface"), canvas, trace, min, max, colors,
      message => { byId("routeWindow").textContent = message; });
    const full = value("routeViewMode") === "all";
    routeTraceView.setFull(full);
    byId("routeFullControls").hidden = !full;
    byId<HTMLInputElement>("routeGoStep").max = String(trace.heads.length - 1);
  } else {
    byId("routeWindow").textContent = "压缩总览会抽样；切换显示全部将重新在后台生成完整轨迹。";
    const positions = max - min + 1;
    const size = routeCanvasSize(frames.length, positions);
    canvas.width = size.width; canvas.height = size.height;
    const context = canvas.getContext("2d")!;
    context.fillStyle = ROUTE_BLANK_COLOR; context.fillRect(0, 0, canvas.width, canvas.height);
    const headColors = new Map([...colors].map(([symbol, color]) => [symbol, routeHeadColor(color)]));
    headColors.set(routeBlankSymbol, routeHeadColor());
    for (let y = 0; y < canvas.height; y += 1) {
      const frame = frames[routeSampleIndex(y, canvas.height, frames.length)];
      const cells = new Map(frame.cells);
      for (let x = 0; x < canvas.width; x += 1) {
        const position = min + routeSampleIndex(x, canvas.width, positions);
        const symbol = cells.get(position) ?? routeBlankSymbol;
        if (position === frame.head) context.fillStyle = headColors.get(symbol)!;
        else if (symbol !== routeBlankSymbol) context.fillStyle = colors.get(symbol)!;
        else continue;
        context.fillRect(x, y, 1, 1);
      }
    }
  }
  const legend = byId("routeLegend");
  legend.replaceChildren();
  const key = (label: string, color: string, symbol?: string) => {
    const item = document.createElement("label"), swatch = document.createElement("i");
    swatch.style.backgroundColor = color;
    if (symbol !== undefined) { item.dataset.symbol = symbol; item.dataset.color = color; }
    item.append(swatch, document.createTextNode(label));
    legend.append(item);
  };
  key("读写头（略带当前符号颜色）", "#ef476f");
  key(`空白背景（${routeBlankSymbol}）`, ROUTE_BLANK_COLOR);
  for (const [symbol, color] of colors) key(symbol, color, symbol);
  const note = document.createElement("small");
  note.textContent = `本次实际出现 ${colors.size} 种非空符号，按数量等分黄→绿→蓝→黄；红色系仅表示读写头。纵向为时间，横向为纸带位置`;
  legend.append(note);
  byId("routeEmpty").hidden = true;
}

const routeController = new RouteController(
  () => new Worker(new URL("./route-worker.ts", import.meta.url), { type: "module" }),
  {
    onStart: (maxSteps) => {
      byId<HTMLButtonElement>("generateRoute").disabled = true;
      byId<HTMLButtonElement>("cancelRoute").disabled = false;
      byId<HTMLProgressElement>("routeProgress").value = 0;
      byId("routeStatus").textContent = `后台计算中：0 / ${maxSteps} 步`;
    },
    onProgress: (step, maxSteps) => {
      byId<HTMLProgressElement>("routeProgress").value = step / maxSteps * 100;
      byId("routeStatus").textContent = `后台计算中：${step} / ${maxSteps} 步（你可以继续玩）`;
    },
    onComplete: (result) => {
      lastRouteResult = result;
      drawRoute(result);
      const { frames, min, max, reason, trace } = result;
      byId<HTMLProgressElement>("routeProgress").value = 100;
      byId("routeStatus").textContent = `已${trace ? "完整记录" : "抽样显示"} ${trace?.heads.length ?? frames.length} 个时刻，纸带位置 ${min}…${max}，结束原因：${reasonText[reason as keyof typeof reasonText] ?? "达到步数上限"}`;
      byId<HTMLButtonElement>("generateRoute").disabled = false;
      byId<HTMLButtonElement>("cancelRoute").disabled = true;
    },
    onError: (message) => {
      byId("routeStatus").textContent = `后台生成失败：${message}`;
      byId<HTMLButtonElement>("generateRoute").disabled = false;
      byId<HTMLButtonElement>("cancelRoute").disabled = true;
    },
    onCancel: () => {
      byId<HTMLButtonElement>("generateRoute").disabled = false;
      byId<HTMLButtonElement>("cancelRoute").disabled = true;
      byId("routeStatus").textContent = "后台生成已取消；当前模拟器状态不受影响。";
    },
  },
);

function generateRoute(): void {
  if (!machine) return;
  const maxSteps = normalizeRouteSteps(Number(value("routeSteps")));
  byId<HTMLInputElement>("routeSteps").value = String(maxSteps);
  routeBlankSymbol = machine.definition.blankSymbol;
  const initialTape = inputToTape(value("input"), machine.definition.blankSymbol);
  lastRouteRequest = { definition: machine.definition, initialTape, maxSteps, full: value("routeViewMode") === "all" };
  lastRouteResult = undefined;
  routeController.start(lastRouteRequest);
}

function tapeLabel(position: number): string {
  return lambdaDisplay?.get(position) ?? visibleTapeSymbol(machine?.tape.read(position) ?? value("blankSymbol") ?? "□");
}

function tapePositions(): number[] {
  const head = machine?.headPosition ?? 0, mode = value("tapeViewMode") as TapeViewMode;
  const center = tapeWindowCenter(mode, head) + effectiveTapeScroll(mode, tapeScroll);
  if (mode === "show-all") return fullTapeDisplay(machine?.tape.entries() ?? [], head, tapeLabel, Boolean(appliedLambda) && !byId<HTMLInputElement>("lambdaAuxCells").checked)
    .flatMap(item => "position" in item ? [item.position] : []);
  return tapeDisplayPositions(center, tapeLabel, Boolean(appliedLambda) && !byId<HTMLInputElement>("lambdaAuxCells").checked, head);
}

function renderTape(): void {
  const tape = byId("tape");
  tape.replaceChildren();
  const head = machine?.headPosition ?? 0;
  const mode = value("tapeViewMode") as TapeViewMode;
  // 仅「随意拖动」模式下拖动平移才生效；其它模式 tapeScroll 视为 0（删除原跨模式拖动）。
  const center = tapeWindowCenter(mode, head) + effectiveTapeScroll(mode, tapeScroll);
  // 抓手光标只在「随意拖动」模式下出现。
  tape.classList.toggle("can-drag", mode === "free-drag");
  tape.classList.toggle("show-all", mode === "show-all");
  tape.parentElement!.classList.toggle("show-all", mode === "show-all");
  const items = mode === "show-all"
    ? fullTapeDisplay(machine?.tape.entries() ?? [], head, tapeLabel, Boolean(appliedLambda) && !byId<HTMLInputElement>("lambdaAuxCells").checked)
    : tapePositions().map(position => ({ position }));
  const positions = items.flatMap(item => "position" in item ? [item.position] : []);
  for (const item of items) {
    if (!("position" in item)) {
      const gap = document.createElement("span"); gap.className = "tape-gap";
      gap.textContent = `… ${item.to - item.from + 1} 格空白 …`; gap.title = `${item.from}…${item.to}`;
      tape.append(gap); continue;
    }
    const position = item.position;
    const cell = document.createElement("div");
    cell.className = `cell${position === head ? " head" : ""}`;
    cell.innerHTML = `<span class="cell-index">${position}</span>`;
    const symbol = document.createElement("span");
    const label = tapeLabel(position);
    symbol.textContent = label === "" && appliedLambda ? "◇" : label;
    if (label === "" && appliedLambda) { cell.classList.add("auxiliary-cell"); cell.title = "辅助标记；格号仍是实际纸带位置"; }
    cell.append(symbol);
    tape.append(cell);
  }
  // 读写头移出可视窗口时，在边缘显示指示箭头，避免“拖远了就找不到光标”。
  if (!positions.includes(head)) {
    const hint = document.createElement("div");
    const onLeft = head < center;
    hint.className = `head-offscreen ${onLeft ? "left" : "right"}`;
    hint.textContent = onLeft ? `← 读写头在 ${head}` : `读写头在 ${head} →`;
    tape.append(hint);
  }
  // 平滑跟随：仅「跟随读写头」模式、且中心相对上次渲染发生变化时，
  // 先把新渲染的纸带瞬时移回旧中心位置，再用过渡滑回新中心，得到连续滑动而非逐格跳变。
  if (mode === "follow-head") {
    if (tapeRenderCenter !== null && center !== tapeRenderCenter) {
      const pitch = tapeCellPitch();
      // 一帧可执行多次转移，但显示最多滑一格，避免高速时整排格子和读写头飞出窗口。
      const shift = Math.max(-pitch, Math.min(pitch, headFollowShift(tapeRenderCenter, center, pitch)));
      const slideMs = slideDurationMs(Number(value("speed")), tapeMotion);
      tape.style.transition = "none";
      tape.style.transform = `translateX(${shift}px)`;
      void tape.offsetWidth; // 强制重排，确保上面的瞬时位移先生效，再开始过渡
      tape.style.transition = `transform ${slideMs}ms ease-out`;
      tape.style.transform = "translateX(0)";
    }
    tapeRenderCenter = center;
  } else {
    // 非跟随模式（固定 0 / 随意拖动）不累积跟随偏移；并清除过渡，保证随意拖动时即时跟手。
    tapeRenderCenter = center;
    tape.style.transition = "none";
  }
}

function tapeCellPitch(): number {
  const cells = byId("tape").querySelectorAll<HTMLElement>(".cell");
  if (cells.length >= 2) {
    const pitch = Math.abs(cells[1].getBoundingClientRect().left - cells[0].getBoundingClientRect().left);
    if (pitch > 0) return pitch;
  }
  return 58;
}

function renderLog(): void {
  byId("logTitle").textContent = status === "定义已修改，待应用" ? "上次运行记录（旧定义）" : "执行记录";
  renderExecutionLog(byId("log"), records);
}

function renderCompiledProgram(parsed: ReturnType<typeof parseTransitions>): void {
  const entry = resolveInitialState(parsed, value("initialState"));
  const pending = shouldApplyCurrentDraft(Boolean(machine), appliedMachineKey, machineProjectKey(collectProject()));
  byId("compiledEntry").textContent = parsed.errors.length ? `无法转换：${parsed.errors[0]}` : `${pending ? "草稿预览（尚未应用），初始入口" : "实际初始入口"}：${entry || "未指定"} · ${parsed.transitions.length} 条实际规则`;
  if (!byId<HTMLDetailsElement>("compiledProgram").open) return;
  const mapping = byId<HTMLTextAreaElement>("internalNameMap");
  const source = byId<HTMLTextAreaElement>("compiledRuleSource");
  if (parsed.errors.length) { mapping.value = ""; source.value = ""; return; }
  mapping.value = parsed.internalNames?.length
    ? parsed.internalNames.map(item => `${item.source} → ${item.actual}  [${item.context}]`).join("\n")
    : [...new Set(parsed.transitions.flatMap(rule => [rule.fromState, rule.toState]))].map(state => `${state || "*（任意状态）"} → ${state || "*（任意状态）"}`).join("\n");
  source.value = parsed.transitions.map(formatTransition).join("\n");
}

let stopRuleRows: (() => void) | undefined;
let tableRules: ReturnType<typeof parseTransitions>;
const editorParseOptions = () => ({ acceptStates: splitStates(value("acceptStates")), rejectStates: splitStates(value("rejectStates")), haltStates: splitStates(value("haltStates")) });
const renderSymbolTable = attachNameTable(byId("symbolTable"), () => {
  const project = collectProject();
  const invalid = Boolean(tableRules.errors.length);
  const rows = invalid ? [] : collectProjectSymbols(project, tableRules).map(symbol => ({
    value: symbol.value,
    details: [String(symbol.reads), String(symbol.writes),
      [symbol.blank && "空白符", symbol.input && "初始输入", symbol.parameter && "函数参数"].filter(Boolean).join("、") || "—"],
  }));
  return { rows, invalid, revision: machineProjectKey(project) };
}, (from, to) => {
  if (from === to) return;
  const renamed = renameProjectSymbol(collectProject(), tableRules, from, to);
  const parsed = parseTransitions(renamed.rules, editorParseOptions());
  if (parsed.errors.length) throw new Error(parsed.errors[0]);
  if (!resolveInitialState(parsed, value("initialState"))) throw new Error("请先填写初始状态。");
  if ([...renamed.blankSymbol].length !== 1) throw new Error("空白符必须是一个字符。");
  byId<HTMLTextAreaElement>("rules").value = renamed.rules;
  byId<HTMLInputElement>("input").value = renamed.input;
  byId<HTMLInputElement>("blankSymbol").value = renamed.blankSymbol;
  createMachine(parsed);
}, { title: "符号表", field: "符号", columns: ["符号", "读取", "写入", "其它用途", "改为"], encode: encodeRuleSymbol, decode: decodeRuleSymbol });

const renderStateTable = attachNameTable(byId("stateTable"), () => {
  const project = collectProject();
  const invalid = Boolean(tableRules.errors.length);
  const rows = invalid ? [] : collectProjectStates(project, tableRules).map(state => ({
    value: state.value, editable: !tableRules.hasFunctions,
    details: [String(state.incoming), String(state.outgoing), state.roles.join("、") || "—"],
  }));
  return { rows, invalid, revision: machineProjectKey(project) };
}, (from, to) => {
  const project = collectProject();
  const renamed = renameProjectState(project, tableRules, from, to);
  const parsed = parseTransitions(renamed.rules);
  if (parsed.errors.length) throw new Error(parsed.errors[0]);
  if (!resolveInitialState(parsed, renamed.initialState)) throw new Error("请先填写初始状态。");
  if ([...project.blankSymbol].length !== 1) throw new Error("空白符必须是一个字符。");
  for (const [id, text] of Object.entries(renamed)) byId<HTMLInputElement | HTMLTextAreaElement>(id).value = text;
  createMachine(parsed);
}, { title: "状态表", field: "状态", columns: ["状态", "进入", "出发", "用途", "改为"] });

function renderRuleTable(parsed = parseTransitions(value("rules"), editorParseOptions())): void {
  const host = byId("ruleTable");
  stopRuleRows?.();
  tableRules = parsed;
  renderSymbolTable();
  renderStateTable();
  ruleDiagnosticView.update(parsed.errors);
  byId("errors").textContent = parsed.errors.slice(0, 4).join("；");
  renderCompiledProgram(parsed);
  byId<HTMLButtonElement>("addRule").disabled = Boolean(parsed.hasFunctions);
  byId("functionStatus").textContent = parsed.hasFunctions
    ? parsed.errors.length ? parsed.errors[0]
      : `已识别 ${parsed.functionEntries?.length ?? 0} 个函数，展开为 ${parsed.transitions.length} 条普通规则。${value("initialState").trim() ? "从填写的初始状态或函数开始。" : parsed.initialState ? "初始状态留空，从第一个调用开始。" : "请填写初始状态、函数名或公开状态。"} 函数结束后续行，ret 才跳到对应外部状态。${parsed.stateExports?.length ? ` 已导出：${parsed.stateExports.slice(0, 10).map(item => item.name).join("、")}（共 ${parsed.stateExports.length} 个）。` : ""} 下方展开表只读，请在上方文本编辑函数。`
    : "";
  if (parsed.errors.length) {
    host.innerHTML = `<div class="empty">修正文本规则后即可同步结构化表格</div>`;
    byId("ruleCount").textContent = "规则格式待修正";
    return;
  }
  byId("ruleCount").textContent = `共 ${parsed.transitions.length} 条 · 向下滚动查看全部规则`;
  const header = `<div class="rule-row rule-head"><span>当前状态</span><span>读取</span><span>下一状态</span><span>写入</span><span>移动</span><span></span></div>`;
  const disabled = parsed.hasFunctions ? " disabled" : "";
  stopRuleRows = renderRuleRows(host, header, parsed.transitions.length, index => {
    const rule = parsed.transitions[index];
    return `<div class="rule-row rule-data-row" data-index="${index}">
      <input${disabled} aria-label="规则 ${index + 1} 当前状态" placeholder="* 任意状态" title="留空或 *：任意状态" value="${escapeAttribute(rule.fromState || "*")}" />
      <input${disabled} aria-label="规则 ${index + 1} 读取符号" placeholder="* 任意符号" title="留空或 *：任意符号；**：字面星号，***：两个星号" value="${escapeAttribute(rule.readSymbol ? encodeRuleSymbol(rule.readSymbol) : "*")}" />
      <input${disabled} aria-label="规则 ${index + 1} 下一状态" value="${escapeAttribute(rule.toState)}" />
      <input${disabled} aria-label="规则 ${index + 1} 写入符号" placeholder="* 保持读取符号" title="* 保持符号；** 写入字面星号，*** 写入两个星号" value="${escapeAttribute(rule.writeSymbol ? encodeRuleSymbol(rule.writeSymbol) : "*")}" />
      <select${disabled} aria-label="规则 ${index + 1} 移动方向"><option value="">默认：不移动</option><option value="*">*：不移动</option><option${rule.direction === "L" ? " selected" : ""}>L</option><option${rule.direction === "R" ? " selected" : ""}>R</option><option${rule.direction === "N" ? " selected" : ""}>N</option></select>
      <button${disabled} class="delete-rule" aria-label="删除规则 ${index + 1}">×</button>
    </div>`;
  });
}

function attachRuleTableEditing(): void {
  const host = byId("ruleTable");
  host.addEventListener("change", event => {
    const field = event.target;
    if (!(field instanceof HTMLInputElement || field instanceof HTMLSelectElement) || field.disabled) return;
    const row = field.closest<HTMLElement>(".rule-data-row");
    if (!row) return;
    const fields = [...row.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input,select")].map((item) => item.value.trim());
    const replacement = `${fields[0]},${fields[1]} -> ${fields[2]},${fields[3]},${fields[4]}`;
    byId<HTMLTextAreaElement>("rules").value = editRuleSource(value("rules"), Number(row.dataset.index), replacement);
    createMachine();
  });
  host.addEventListener("click", event => {
    const button = (event.target as Element).closest<HTMLButtonElement>(".delete-rule");
    const row = button?.closest<HTMLElement>(".rule-data-row");
    if (!row || button?.disabled) return;
    byId<HTMLTextAreaElement>("rules").value = editRuleSource(value("rules"), Number(row.dataset.index), null);
    createMachine();
  });
}

function escapeAttribute(raw: string): string {
  return raw.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

function render(): void {
  if (appliedLambda && machine) {
    const current = readLambdaOutput(machine.tape);
    lambdaDisplay = current && lambdaHasReduced ? new Map([...current.display, ...current.parentheses]) : undefined;
    if (current) lambdaView = current;
  }
  byId("status").textContent = status;
  byId("currentState").textContent = machine?.currentState ?? "—";
  byId("readSymbol").textContent = machine?.tape.read(machine.headPosition) ?? "—";
  byId("headPosition").textContent = String(machine?.headPosition ?? 0);
  byId("stepCount").textContent = String(machine?.stepCount ?? 0);
  const viewMode = value("tapeViewMode") as TapeViewMode;
  const headOutside = viewMode === "fixed-zero" && machine && !tapePositions().includes(machine.headPosition);
  const headDirection = machine && machine.headPosition < -8 ? "←" : "→";
  byId("headState").textContent = machine ? (headOutside ? `${headDirection} 读写头在 ${machine.headPosition} · ${machine.currentState}` : `读写头 · ${machine.currentState}`) : "";
  byId("stopMessage").textContent = stopMessage;
  renderTape();
  renderLog();
  renderGijswijtOutput();
  renderUniversalOutput();
  renderBrainfuckOutput();
  renderLambdaOutput();
}

function renderLambdaOutput(): void {
  const ready = Boolean(machine && appliedLambda);
  byId<HTMLButtonElement>("runLambdaTape").disabled = !ready || simulationRunning() || status === "定义已修改，待应用" || machine?.currentState === "lambda.accept" || machine?.currentState === lambdaLimit;
  byId<HTMLButtonElement>("pauseLambdaTape").disabled = !ready || !simulationRunning();
  if (!machine || !appliedLambda) return;
  const output = byId<HTMLTextAreaElement>("lambdaTapeOutput");
  output.value = lambdaHasReduced ? lambdaView?.output ?? appliedLambda.source : appliedLambda.source;
  const message = byId("lambdaTapeStatus");
  message.classList.toggle("error", machine.currentState === lambdaLimit);
  message.textContent = machine.currentState === lambdaLimit
    ? `本次纸带规则的绑定索引或嵌套超过 ${appliedLambda.capacity}，尚未得到正规形；可切换直接归约。`
    : machine.currentState === "lambda.accept" ? `已得到正规形 · ${machine.stepCount} 个图灵机步。`
      : `原位置局部归约 · ${status} · ${machine.stepCount} 个图灵机步。`;
}

function renderBrainfuckOutput(): void {
  const hidden = !machine || !appliedBrainfuck;
  byId("bfResult").hidden = hidden;
  const changed = appliedBrainfuck && (value("bfSource") !== appliedBrainfuck.source || value("bfInput") !== appliedBrainfuck.input);
  byId<HTMLButtonElement>("runBf").disabled = hidden || Boolean(changed) || simulationRunning() || status === "定义已修改，待应用" || machine?.currentState === "H" || machine?.currentState === "R";
  byId<HTMLButtonElement>("pauseBf").disabled = hidden || !simulationRunning();
  if (!machine || !appliedBrainfuck) return;
  const result = readBrainfuckOutput(machine.tape);
  byId<HTMLTextAreaElement>("bfOutput").value = result.text;
  byId<HTMLTextAreaElement>("bfBytes").value = result.bytes.join(", ");
  byId("bfStatus").textContent = changed ? "源码或输入已修改，请先转换并载入。"
    : `已输出 ${result.bytes.length} 字节 · ${machine.currentState === "H" ? "BF 程序已结束" : machine.currentState === "R" ? "纸带数据无效" : status} · ${machine.stepCount} 个图灵机步`;
}

const universalReasons: Record<string, string> = { H: "停止", A: "接受", J: "拒绝", M: "缺少转移规则", B: "达到步数上限" };

function renderUniversalOutput(): void {
  const panel = byId("universalResult");
  panel.hidden = !machine || !appliedUniversalAlphabet;
  byId<HTMLButtonElement>("runUniversal").disabled = panel.hidden || universalTimer !== undefined || status === "定义已修改，待应用";
  if (!machine || !appliedUniversalAlphabet) return;
  const output = byId<HTMLTextAreaElement>("universalOutput");
  const message = byId("universalStatus");
  const result = machine.currentState === universalHalt ? readUniversalResult(machine.tape, appliedUniversalAlphabet) : undefined;
  if (result) {
    const reason = universalReasons[result.reason];
    output.value = `${result.output},${reason}`;
    message.textContent = `模拟了 ${result.steps} 步 · 当前状态 ${result.state} · 读取 ${JSON.stringify(result.read)}`;
  } else {
    output.value = "";
    message.textContent = machine.currentState === universalReject ? "纸带编码无效。" : status === "运行中" ? "正在用纸带上的规则模拟…" : "运行完成后显示被模拟机器的纸带和状态。";
  }
}

function renderGijswijtOutput(): void {
  byId("gijswijtResult").hidden = appliedGijswijtThreshold === null;
  if (appliedGijswijtThreshold === null || !machine) return;
  const terms = readGijswijtOutput(machine.tape);
  const output = byId<HTMLTextAreaElement>("gijswijtOutput");
  const text = terms.join(", ");
  if (output.value !== text) output.value = text;
  const last = terms.at(-1);
  byId("gijswijtOutputStatus").textContent = machine.currentState === "G.HALT"
    ? `已停机：第 ${terms.length} 项为 ${last}${last !== undefined && last > appliedGijswijtThreshold ? `，严格大于阈值 ${appliedGijswijtThreshold}` : ""}。`
    : `已写入 ${terms.length} 项${last === undefined ? "；点击运行或单步写入首项。" : `，最新项 ${last}；超过 ${appliedGijswijtThreshold} 才停机。`}`;
}

const reasonText = { accept: "接受", reject: "拒绝", halt: "已停机", "missing-transition": "缺少转移规则" } as const;

function ensureCurrentDraftApplied(): boolean {
  const currentProject = collectProject();
  if (shouldApplyCurrentDraft(Boolean(machine), appliedMachineKey, machineProjectKey(currentProject))) {
    return createMachine();
  }
  return true;
}

function singleStep(applyDraft = true, renderAfter = true): boolean {
  if (applyDraft && !ensureCurrentDraftApplied()) return false;
  if (!machine) return false;
  const maxSteps = byId<HTMLInputElement>("unlimitedSteps").checked ? null : Number(value("maxSteps")) || 10000;
  if (maxSteps !== null && machine!.stepCount >= maxSteps) {
    status = "达到步数限制";
    stopMessage = `已暂停在 ${maxSteps} 步`;
    pause(false);
    render();
    return false;
  }
  const result = machine!.step();
  if (result.record) {
    if (appliedLambda && result.record.fromState === (appliedLambda.betaState ?? lambdaBeta)) lambdaHasReduced = true;
    records.push(result.record);
    if (records.length > 5000) records.shift();
  }
  if (result.stopped) {
    status = reasonText[result.reason!];
    stopMessage = result.reason === "missing-transition" ? `状态 ${machine!.currentState} 读取 ${machine!.tape.read(machine!.headPosition)} 时无规则` : reasonText[result.reason!];
    pause(false);
  } else status = simulationRunning() ? "运行中" : "已暂停";
  if (renderAfter || result.stopped) render();
  return !result.stopped;
}

const scheduler = new ExecutionScheduler({
  getTargetSpeed: () => Number(value("speed")),
  executeBatch: (maxSteps) => {
    const before = machine?.stepCount ?? 0;
    let remaining = maxSteps;
    let keepRunning = true;
    while (remaining-- > 0 && keepRunning) keepRunning = singleStep(false, false);
    return { executed: (machine?.stepCount ?? before) - before, keepRunning };
  },
  onTick: (actual) => {
    byId("actualSpeed").textContent = `实际 ${actual.toFixed(actual < 10 ? 1 : 0)} 步/秒`;
    render();
  },
});

function simulationRunning(): boolean {
  return scheduler.running || universalTimer !== undefined;
}

function runTapeFast(): void {
  if (!ensureCurrentDraftApplied()) return;
  if (!machine || (!appliedUniversalAlphabet && !appliedBrainfuck && !appliedLambda) || universalTimer !== undefined) return;
  scheduler.stop();
  const start = performance.now(), initialSteps = machine.stepCount;
  status = "运行中";
  stopMessage = "";
  tapeMotion = "continuous";
  const tick = () => {
    const deadline = performance.now() + 8;
    for (let steps = 0; steps < 2_000 && performance.now() < deadline; steps++) {
      if (!singleStep(false, false)) break;
    }
    const actual = ((machine!.stepCount - initialSteps) * 1000 / Math.max(1, performance.now() - start)).toFixed(0);
    byId("actualSpeed").textContent = `实际 ${actual} 步/秒`;
    if (universalTimer !== undefined) universalTimer = window.setTimeout(tick, 0);
    render();
  };
  universalTimer = window.setTimeout(tick, 0);
  render();
}

function run(): void {
  if (simulationRunning()) return;
  if (!ensureCurrentDraftApplied()) return;
  status = "运行中";
  stopMessage = "";
  tapeMotion = "continuous";
  scheduler.start();
  render();
}

function pause(changeStatus = true): void {
  scheduler.stop();
  window.clearTimeout(universalTimer);
  universalTimer = undefined;
  if (changeStatus && machine && status === "运行中") status = "已暂停";
  render();
}

function resetMachine(): void {
  pause(false);
  if (shouldApplyCurrentDraft(Boolean(machine), appliedMachineKey, machineProjectKey(collectProject()))) {
    createMachine();
    return;
  }
  machine!.reset();
  lambdaHasReduced = false;
  lambdaView = undefined;
  lambdaDisplay = undefined;
  records = [];
  tapeScroll = 0;
  tapeRenderCenter = null;
  status = "就绪";
  stopMessage = "";
  byId("errors").textContent = "";
  render();
}

function handleEditorInput(): void {
  persistEditorDraft();
  const pending = shouldApplyCurrentDraft(Boolean(machine), appliedMachineKey, machineProjectKey(collectProject()));
  if (pending) {
    if (simulationRunning()) pause(false);
    status = "定义已修改，待应用";
    stopMessage = "旧程序已暂停。单步、运行或重置会应用当前定义，并从初始输入开始。";
    render();
  } else if (status === "定义已修改，待应用") {
    status = machine?.stepCount ? "已暂停" : "就绪";
    stopMessage = "";
    render();
  }
  renderRuleTable();
}

const speedEls: SpeedSyncElements = {
  slider: byId<HTMLInputElement>("speed"),
  number: byId<HTMLInputElement>("speedNumber"),
  text: byId("speedText"),
};

function updateSpeedText(): void {
  applySpeed(speedEls, Number(speedEls.slider.value));
}

function persistTargetSpeed(speed: number): void {
  const error = saveSpeedPreference(localStorage, speed);
  if (error) byId("errors").textContent = error;
}

byId("apply").addEventListener("click", () => createMachine());
byId("compileGijswijt").addEventListener("click", () => {
  try {
    const raw = value("gijswijtThreshold").trim();
    if (!raw) throw new Error("请输入整数阈值。");
    const project = compileGijswijtMachine(Number(raw));
    fillProject({ ...project, speed: Number(value("speed")) });
    createMachine();
    const runtimeNote = Number(raw) === 3 ? " 此机器超过 3 需约 1514 万步，在 1000 步/秒下约 4.2 小时。" : "";
    byId("gijswijtCompileStatus").textContent = `转换完成，共 ${project.rules.split("\n").length - 3} 条规则。已开启 Max 步数；点击上方“运行”开始。${runtimeNote}`;
  } catch (error) {
    byId("gijswijtCompileStatus").textContent = error instanceof Error ? error.message : "转换失败";
  }
});
byId("step").addEventListener("click", () => { tapeMotion = "manual"; pause(false); singleStep(); });
byId("run").addEventListener("click", run);
byId("pause").addEventListener("click", () => pause());
byId("reset").addEventListener("click", resetMachine);
attachSpeedSync(speedEls, persistTargetSpeed);
byId("tapeViewMode").addEventListener("change", () => {
  tapeScroll = 0; // 切换视角归零，避免跨模式串扰
  tapeRenderCenter = null; // 下次渲染直接定位，不从上一个视角滑入
  const tape = byId("tape");
  tape.style.transform = ""; // 清除可能的亚格 transform 残留
  tape.style.transition = "none";
  render();
});
attachTapeDrag(byId("tape"), {
  getScroll: () => tapeScroll,
  setScroll: (newValue) => {
    // 仅「随意拖动」模式下允许拖动；其它视角忽略（删除原跨模式拖动）。
    if (value("tapeViewMode") !== "free-drag") return;
    if (newValue === tapeScroll) return; // 同值不重渲染，减少亚格拖动时的闪烁
    tapeScroll = newValue;
    renderTape();
  },
  getPitch: tapeCellPitch,
  // 平滑跟手：把亚格余数作为 transform 施加到纸带，松手时传 0 吸附回整格。
  applyShift: (pixelOffset) => {
    byId("tape").style.transform = pixelOffset === 0 ? "" : `translateX(${pixelOffset}px)`;
  },
  isEnabled: () => value("tapeViewMode") === "free-drag",
});
byId("clear").addEventListener("click", async () => {
  try { await saveArchive({ kind: "project", title: "清空前的实验台草稿", content: JSON.stringify(collectProject()) }, "清空前备份"); }
  catch { byId("errors").textContent = "未能备份当前草稿，尚未清空。请先导出项目。"; return; }
  pause();
  byId<HTMLTextAreaElement>("rules").value = "";
  handleEditorInput();
});
byId("addRule").addEventListener("click", () => {
  const source = value("rules").trim();
  byId<HTMLTextAreaElement>("rules").value = `${source}${source ? "\n" : ""}q0,□->HALT,□,N`;
  handleEditorInput();
});
for (const field of editorFields) byId(field).addEventListener("input", handleEditorInput);
byId("compiledProgram").addEventListener("toggle", () => renderRuleTable());
attachRuleTableEditing();
attachSpaceIndentation(byId<HTMLTextAreaElement>("rules"));
byId("unlimitedSteps").addEventListener("change", () => {
  byId<HTMLInputElement>("maxSteps").disabled = byId<HTMLInputElement>("unlimitedSteps").checked;
  const storageError = saveProject(localStorage, STORAGE_KEY, collectProject());
  if (storageError) byId("errors").textContent = storageError;
});
byId("maxSteps").addEventListener("change", () => {
  const storageError = saveProject(localStorage, STORAGE_KEY, collectProject());
  if (storageError) byId("errors").textContent = storageError;
});
function selectedExample(): ExampleProject {
  return exampleVariant(examples[value("example")], value("exampleStateNames") as ExampleNames, value("exampleStructure") as ExampleStructure);
}
function previewExample(): void {
  byId("exampleNote").textContent = selectedExample().description;
  byId<HTMLAnchorElement>("examplePrinciple").href = `./principles.html?example=${encodeURIComponent(value("example"))}`;
  byId<HTMLAnchorElement>("exampleCampaign").href = `./campaign.html?level=${encodeURIComponent(examples[value("example")].campaignLevelId!)}`;
}
byId("example").addEventListener("change", previewExample);
byId("exampleStateNames").addEventListener("change", previewExample);
byId("exampleStructure").addEventListener("change", previewExample);
byId("loadExample").addEventListener("click", () => {
  const example = selectedExample();
  fillProject({ ...example, rules: exampleSource(example, value("exampleSourceStyle") as ExampleSourceStyle) });
  createMachine();
  byId("exampleNote").textContent = example.description;
});
byId("exportProject").addEventListener("click", () => requestDownload("turing-machine-project.json", JSON.stringify(collectProject(), null, 2), "application/json"));
byId("importProject").addEventListener("click", () => byId<HTMLInputElement>("fileInput").click());
byId("fileInput").addEventListener("change", async () => {
  const file = byId<HTMLInputElement>("fileInput").files?.[0];
  if (!file) return;
  if (file.size > 20_000_000) { byId("errors").textContent = "项目文件超过 20 MB，请缩小规则表后重试。"; return; }
  try {
    const project = parseProjectJson(await file.text());
    fillProject(project);
    createMachine();
  } catch (error) {
    byId("errors").textContent = error instanceof Error ? `项目文件无效：${error.message}` : "项目文件无效或版本不兼容";
  }
});
byId("exportLog").addEventListener("click", () => {
  const header = "step,from,read,to,write,direction,headBefore,headAfter";
  const rows = records.map((r) => [r.step,r.fromState,r.readSymbol,r.toState,r.writeSymbol,r.direction,r.headBefore,r.headAfter].map((x) => JSON.stringify(x)).join(","));
  requestDownload("turing-machine-log.csv", [header, ...rows].join("\n"), "text/csv");
});
byId("generatePuzzle").addEventListener("click", generatePuzzle);
byId("generateRoute").addEventListener("click", generateRoute);
byId("routeViewMode").addEventListener("change", () => {
  const full = value("routeViewMode") === "all";
  if (lastRouteRequest && (routeController.running || (full && !lastRouteResult?.trace))) {
    lastRouteRequest = { ...lastRouteRequest, full };
    routeController.start(lastRouteRequest);
  } else if (routeTraceView) {
    routeTraceView.setFull(full);
    byId("routeFullControls").hidden = !full;
  }
});
byId("routeGo").addEventListener("click", () => {
  const input = byId<HTMLInputElement>("routeGoStep");
  const step = Math.max(0, Math.min(Number(input.max), Math.floor(Number(input.value) || 0)));
  input.value = String(step);
  routeTraceView?.goToStep(step);
});
byId("cancelRoute").addEventListener("click", () => {
  routeController.cancel();
});
byId("checkPuzzle").addEventListener("click", () => {
  if (!tilePuzzle) return;
  const filled = placedTiles.filter(Boolean).length;
  byId("puzzleMessage").textContent = isSolved(tilePuzzle, placedTiles)
    ? "完全正确！每一行都对应图灵机的一步计算。"
    : `已放 ${filled}/${placedTiles.length} 块；${filled === placedTiles.length ? "铺法不正确，请调整。" : "继续把剩余瓷砖拼入棋盘。"}`;
});
byId("showSolution").addEventListener("click", () => {
  if (!tilePuzzle) return;
  solutionVisible = !solutionVisible;
  placedTiles = solutionVisible ? [...tilePuzzle.solution] : Array(tilePuzzle.solution.length).fill(null);
  selectedTileId = null;
  byId("showSolution").textContent = solutionVisible ? "返回自己拼" : "查看正确拼法";
  byId("puzzleMessage").textContent = solutionVisible ? "正确拼法已显示：从上到下是计算时间，从左到右是纸带位置。" : "答案已收起，棋盘已清空。";
  renderPuzzle();
});
byId("tileTray").addEventListener("click", (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>("[data-select-tile]");
  if (!target || solutionVisible) return;
  selectedTileId = target.dataset.selectTile!;
  byId("puzzleMessage").textContent = "已选中瓷砖，请点击棋盘中的空格。";
  renderPuzzle();
});
byId("puzzleBoard").addEventListener("click", (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>("[data-slot]");
  if (!target || solutionVisible) return;
  const slot = Number(target.dataset.slot);
  if (selectedTileId) placeTile(slot, selectedTileId);
  else if (placedTiles[slot]) { placedTiles[slot] = null; renderPuzzle(); }
});
document.addEventListener("dragstart", (event) => {
  const tile = (event.target as HTMLElement).closest<HTMLElement>("[data-tile-id]");
  if (tile && event.dataTransfer) event.dataTransfer.setData("text/plain", tile.dataset.tileId!);
});
byId("puzzleBoard").addEventListener("dragover", (event) => event.preventDefault());
byId("puzzleBoard").addEventListener("drop", (event) => {
  event.preventDefault();
  const slot = (event.target as HTMLElement).closest<HTMLElement>("[data-slot]");
  const tileId = event.dataTransfer?.getData("text/plain");
  if (slot && tileId) placeTile(Number(slot.dataset.slot), tileId);
});
document.addEventListener("keydown", (event) => {
  const editing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLButtonElement;
  if (editing) return;
  if (event.code === "Space") { event.preventDefault(); simulationRunning() ? pause() : run(); }
  if (event.altKey && event.code === "ArrowRight") { event.preventDefault(); pause(false); singleStep(); }
  if (event.ctrlKey && event.code === "KeyR") { event.preventDefault(); resetMachine(); }
});

const savedProject = loadProject(localStorage, STORAGE_KEY) ?? defaultProject;
const editorDraft = loadEditorDraft(localStorage);
const restoredProject = { ...savedProject, ...editorDraft, speed: loadSpeedPreference(localStorage) ?? savedProject.speed };
fillProject(migrateLambdaInput(migrateUnaryExample(restoredProject)));
byId<HTMLTextAreaElement>("lambdaInput").value = lambdaProjectSource?.source
  ?? (value("acceptStates") === examples.lambda.acceptStates && !value("input").includes("#(λ.token.")
    ? value("input") : examples.lambda.lambdaSource!.source);
attachLambdaCalculator(byId("lambdaCalculator"), input => {
  const example = makeLambdaProject(input);
  fillProject({ ...example, rules: exampleSource(example, value("exampleSourceStyle") as ExampleSourceStyle) });
  byId("lambdaTapeStatus").textContent = createMachine() ? "已载入。点击纸带下方的「运行」或「单步」。" : "载入失败，请检查机器定义。";
});
byId("runLambdaTape").addEventListener("click", runTapeFast);
byId("pauseLambdaTape").addEventListener("click", () => pause());
byId("lambdaAuxCells").addEventListener("change", () => { tapeRenderCenter = null; render(); });
function fillBfPreset(): void {
  const preset = bfPresets[value("bfPreset") as keyof typeof bfPresets];
  byId<HTMLTextAreaElement>("bfSource").value = preset.source;
  byId<HTMLTextAreaElement>("bfInput").value = preset.input;
}
fillBfPreset();
byId("bfPreset").addEventListener("change", () => { fillBfPreset(); renderBrainfuckOutput(); });
byId("bfSource").addEventListener("input", renderBrainfuckOutput);
byId("bfInput").addEventListener("input", renderBrainfuckOutput);
byId("bfForm").addEventListener("submit", event => {
  event.preventDefault();
  const message = byId("bfCompileStatus");
  try {
    const project = makeBrainfuckProject(value("bfSource"), value("bfInput"));
    fillProject(project);
    if (!createMachine()) throw new Error("BF 规则载入失败，请检查机器定义。");
    message.classList.remove("error");
    message.textContent = "已转换并载入，空白符为 |。点击“快速运行 BF”，或使用上方的运行和单步。";
  } catch (error) {
    message.classList.add("error");
    message.textContent = error instanceof Error ? error.message : "BF 转换失败。";
  }
});
byId("runBf").addEventListener("click", runTapeFast);
byId("pauseBf").addEventListener("click", () => pause());
byId<HTMLTextAreaElement>("universalSource").value = splitUniversalSource(universalDefault).rules;
byId<HTMLTextAreaElement>("universalInput").value = "/";
byId("universalForm").addEventListener("submit", event => {
  event.preventDefault();
  const message = byId("universalCompileStatus"), alphabet = byId("universalAlphabet");
  try {
    const compiled = makeUniversalProject({ rules: value("universalSource"), input: value("universalInput"),
      initialState: value("universalInitial"), haltStates: value("universalHalt"), acceptStates: value("universalAccept"), rejectStates: value("universalReject"),
    }, value("universalBlank"), value("universalBudget").trim() ? Number(value("universalBudget")) : null);
    fillProject(compiled.project);
    if (!createMachine()) throw new Error("无法载入通用图灵机。");
    message.classList.remove("error");
    message.textContent = `已编码 ${compiled.sourceRules} 条规则（纸带上 ${compiled.encodedRules} 条）。可快速运行，也可在上方单步观察。`;
    const print = (symbols: string[]) => symbols.map(symbol => JSON.stringify(symbol)).join("、") || "空纸带";
    alphabet.textContent = `初始输入字符：${print(compiled.inputSymbols)}。纸带符号：${print(compiled.alphabet.symbols)}。`;
  } catch (error) {
    message.classList.add("error");
    message.textContent = error instanceof Error ? error.message : "转换失败。";
    alphabet.textContent = "";
  }
});
byId("runUniversal").addEventListener("click", runTapeFast);
const requestedExample = new URLSearchParams(location.search).get("example");
if (requestedExample && Object.hasOwn(examples, requestedExample)) {
  byId<HTMLSelectElement>("example").value = requestedExample;
  // A link selects the example. Loading remains an explicit click to protect the current draft.
  byId("exampleNote").scrollIntoView({ block: "center" });
}
previewExample();
if (!createMachine()) renderRuleTable();
attachLocalArchive({
  page: "project", ready: localArchiveReady,
  current: () => ({ kind: "project", title: "我的实验台存档", content: JSON.stringify(collectProject()) }),
  restore: entry => {
    const data = JSON.parse(entry.content) as Record<string, unknown>;
    if (editorFields.some(field => typeof data[field] !== "string")) throw new Error("存档缺少实验台字段，仍可查看或下载原内容。");
    pause();
    const previous = collectProject();
    fillProject({ ...previous, ...data, format: "turing-machine-simulator", version: 1 } as ProjectData);
    saveEditorDraft(localStorage, Object.fromEntries(editorFields.map(field => [field, value(field)])) as ReturnType<typeof loadEditorDraft> & object);
    createMachine();
  },
});
