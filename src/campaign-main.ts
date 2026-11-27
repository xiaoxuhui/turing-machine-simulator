import "./campaign-styles.css";
import { campaignLevels, campaignSections, completeLevel, emptyCampaignProgress, isLevelUnlocked, nextCampaignLevel, normalizeCampaignProgress, normalizeCampaignDraft, campaignMigrationConflict, resetDraft, uncompleteLevel, type CampaignLevel, type CampaignProgress, type CampaignVerification } from "./campaign";
import { parseTransitions, resolveInitialState, type MachineDefinition } from "./core";
import { attachSpaceIndentation, insertAtSelection } from "./text-insertion";
import { attachRuleDiagnostics } from "./rule-diagnostics";
import { encodeCampaignBackup, MAX_CAMPAIGN_BACKUP_BYTES, parseCampaignBackup } from "./campaign-backup";
import { solutionRules } from "./campaign-solutions";
import { compactRuleArrows } from "./rule-format";
import { downloadFile } from "./download-file";
import { campaignTopics, campaignTopicFor } from "./campaign-topics";
import { captureExistingLocalSaves, queueArchive, saveArchive } from "./local-archive";
import { attachLocalArchive, openArchivePage } from "./local-archive-view";
import { functionHeader } from "./function-parameters";

const STORAGE_KEY = "turing-machine-simulator.campaign.v1";
const localArchiveReady = captureExistingLocalSaves();
let progress = loadProgress();
const requestedLevelId = new URLSearchParams(location.search).get("level");
let activeLevelId = campaignLevels.some(level => level.id === requestedLevelId) ? requestedLevelId! : firstAvailableLevel().id;
if (requestedLevelId && requestedLevelId !== activeLevelId) {
  const url = new URL(location.href); url.searchParams.set("level", activeLevelId); history.replaceState(null, "", url);
}

document.querySelector<HTMLDivElement>("#campaign-app")!.innerHTML = `
  <div class="course-app">
    <header class="course-topbar">
      <nav class="course-links"><a class="back-link" href="./">← 返回实验台</a><a class="back-link" href="./principles.html">示例原理</a></nav>
      <div><span>TM LEARNING PATH</span><h1>图灵机教学关卡</h1></div>
      <div class="course-progress"><strong id="progressText"></strong><progress id="progressBar" max="${campaignLevels.length}"></progress></div>
    </header>
    <main class="course-layout">
      <nav class="level-sidebar" aria-label="教学关卡">
        <div class="sidebar-heading"><strong>学习路线 · ${campaignLevels.length} 关</strong><small>保留原顺序 · 连续划分 ${campaignTopics.length} 个章节</small></div>
        <div class="level-filters">
          <label>学习章节<select id="levelTopic"><option value="all">全部章节（${campaignTopics.length} 章）</option>${campaignTopics.map(topic => `<option value="${topic.id}">${topic.title}</option>`).join("")}</select></label>
          <label>学习阶段<select id="levelStage"><option value="all">全部阶段</option>${campaignSections.map(section => `<option value="${section.id}">${section.title}</option>`).join("")}</select></label>
        </div>
        <label class="level-search">搜索关卡或示例<input id="levelSearch" type="search" placeholder="函数、运算、数列……" /></label>
        <small id="levelSearchStatus" class="level-search-status"></small>
        <button id="clearLevelFilters" class="clear-level-filters" type="button">重置筛选</button>
        <div id="levelList"></div>
      </nav>
      <section class="lesson-workspace">
        <section class="save-card" aria-label="关卡存档管理">
          <div><strong>关卡存档</strong><p>自动保存在此设备；可下载进度与已保存的规则草稿。旧存档中没有记录的规则无法补回。</p></div>
          <div class="save-actions">
            <button type="button" id="exportCampaign" class="button secondary">保存备份</button>
            <button type="button" data-local-saves class="button secondary">本地存档</button>
            <button type="button" data-save-local class="button secondary">保存到本地</button>
            <button type="button" id="importCampaign" class="button secondary">导入备份</button>
            <button type="button" id="clearCampaign" class="button danger">一键清空</button>
            <input id="importCampaignFile" type="file" accept=".json,application/json" hidden aria-label="选择关卡备份文件" />
          </div>
          <p id="backupStatus" class="backup-status" role="status" aria-live="polite"></p>
        </section>
        <article class="lesson-card">
          <div class="lesson-heading"><div><div class="lesson-badges"><span id="sectionBadge"></span><span id="levelBadge"></span></div><h2 id="levelTitle"></h2></div><div class="lesson-heading-actions"><span id="levelState" class="level-state"></span><button type="button" id="previewAnswer" class="button ghost">查看答案</button><button type="button" id="undoComplete" class="button ghost" hidden>撤销通关</button></div></div>
          <p id="levelObjective" class="objective"></p>
          <p id="lessonLockNote" class="lesson-lock-note" role="status" hidden>当前是原理预览。完成前面的关卡后，即可编写、试跑和提交本关。</p>
          <div class="concept-box"><strong id="levelConcept"></strong><p id="levelExplanation"></p></div>
          <div class="lesson-grid">
            <section><h3>跟着做</h3><ol id="lessonSteps"></ol></section>
            <section><h3>本关语法</h3><ul id="lessonSyntax" class="syntax-list"></ul></section>
          </div>
          <section id="workedExample" class="worked-example" hidden><h3>原理推演</h3><strong id="workedExampleTitle"></strong><ol id="workedExampleStages"></ol></section>
          <section id="implementationGuide" class="worked-example implementation-guide" hidden aria-labelledby="implementationGuideTitle">
            <h3 id="implementationGuideTitle">动手拆解</h3>
            <code id="guideTape" class="guide-tape"></code>
            <ol id="guideSteps"></ol>
            <details class="guide-checkpoints"><summary>卡住时检查这些中间结果</summary><ul id="guideCheckpoints"></ul></details>
          </section>
        </article>

        <div class="practice-grid">
          <section class="editor-card">
            <div class="section-heading"><div><span>STEP 1</span><h3>编写规则</h3></div><div class="section-heading-actions"><small>草稿会自动保存</small><button type="button" id="transferRules" class="button ghost">转到实验台</button><button type="button" id="resetDraft" class="button ghost">重置本关</button></div></div>
            <label for="labEntryMode">转到实验台时使用<select id="labEntryMode"><option value="draft">本关编写的规则</option><option value="previous">上次实验台内容</option><option value="example">当前关卡示例</option></select></label>
            <div class="fixed-config">
              <div><span>示例输入</span><code id="starterInput"></code></div>
              <div><span>初始状态</span><code id="starterState"></code></div>
              <div><span>空白符</span><code id="starterBlank"></code></div>
              <div><span>停止 / 接受 / 拒绝</span><code id="starterTerminals"></code></div>
            </div>
            <label for="rulesEditor">转移规则</label>
            <textarea id="rulesEditor" spellcheck="false" aria-describedby="editorHelp"></textarea>
            <div class="symbol-keyboard" aria-label="规则符号键盘">
              <span>不会输入空白符？点这里</span>
              <button type="button" class="blank-key" data-insert-symbol="□" aria-label="插入空白符方框">□ <small>空白符</small></button>
              ${[["->", "箭头"], ["L", "左"], ["R", "右"], ["N", "不动"]].map(([symbol, label]) => `<button type="button" data-insert-symbol="${symbol}" aria-label="插入${label}">${symbol}</button>`).join("")}
              <div id="terminalStateKeys" class="terminal-state-keys" aria-label="终止状态快捷输入"></div>
              <div id="functionNameKeys" class="function-name-keys" aria-label="函数名快捷输入"></div>
            </div>
            <p id="editorHelp" class="editor-help">格式：当前状态,读取符号-&gt;下一状态,写入符号,方向</p>
            <p id="ruleRecognition" class="rule-recognition" aria-live="polite"></p>
            <p id="rulesTransferStatus" class="editor-help" role="status" hidden></p>
            <div id="editorError" class="editor-error" aria-live="polite"></div>
          </section>

          <aside class="test-card">
            <div class="section-heading"><div><span>STEP 2</span><h3>试跑与验证</h3></div></div>
            <div class="public-tests"><strong>本关会检查</strong><div id="publicCases"></div></div>
            <button id="tryExample" class="button secondary">用示例输入试跑</button>
            <div id="tryResult" class="try-result">试跑结果会显示在这里。</div>
            <div id="tapePreview" class="tape-preview" aria-label="试跑纸带"></div>
            <button id="verifyLevel" class="button primary">提交本关答案</button>
            <button id="cancelVerification" class="button secondary" hidden>取消后台计算</button>
            <button type="button" id="undoCompleteNearSubmit" class="button secondary" hidden>撤销本关通关</button>
            <div id="verifyResult" class="verify-result" aria-live="polite">完成规则后再提交。</div>
            <button type="button" id="nextLevel" class="button secondary">下一关</button>
          </aside>
        </div>
      </section>
    </main>
    <dialog id="answerPreview" class="confirm-dialog answer-preview" aria-labelledby="answerPreviewTitle" aria-describedby="answerPreviewNote">
      <h2 id="answerPreviewTitle">参考答案</h2>
      <p id="answerPreviewNote">仅供查看。练习草稿和通关进度保持原样。</p>
      <pre tabindex="0" aria-label="参考规则"><code id="answerPreviewRules"></code></pre>
      <form method="dialog" class="confirm-actions"><button class="button ghost" autofocus>关闭</button></form>
    </dialog>
    <dialog id="confirmDialog" class="confirm-dialog">
      <form method="dialog">
        <p id="confirmMessage"></p>
        <div class="confirm-actions">
          <button type="submit" value="cancel" class="button ghost">取消</button>
          <button type="submit" value="confirm" id="confirmOk" class="button primary">确认</button>
        </div>
      </form>
    </dialog>
  </div>`;

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const terminalConfig = (level: CampaignLevel) => ({
  haltStates: level.starter.haltStates.split(",").filter(Boolean),
  acceptStates: level.starter.acceptStates.split(",").filter(Boolean),
  rejectStates: level.starter.rejectStates.split(",").filter(Boolean),
});
let verificationWorker: Worker | undefined;
function cancelVerification(message?: string): void {
  verificationWorker?.terminate(); verificationWorker = undefined;
  byId("cancelVerification").hidden = true;
  for (const id of ["tryExample", "verifyLevel"]) byId<HTMLButtonElement>(id).disabled = !isLevelUnlocked(progress, activeLevelId);
  if (message) byId("verifyResult").textContent = message;
}
function runVerification(level: CampaignLevel, definition: MachineDefinition, target: string, done: (result: CampaignVerification) => void): void {
  cancelVerification();
  const worker = new Worker(new URL("./campaign-worker.ts", import.meta.url), { type: "module" });
  verificationWorker = worker;
  for (const id of ["tryExample", "verifyLevel"]) byId<HTMLButtonElement>(id).disabled = true;
  byId("cancelVerification").hidden = false;
  byId(target).textContent = "正在后台计算，可继续编辑或查看其它关卡。";
  worker.onmessage = event => {
    if (verificationWorker !== worker) return;
    if (event.data.type === "progress") {
      byId(target).textContent = `后台计算：第 ${event.data.caseIndex + 1}/${level.cases.length} 组，${event.data.step}/${event.data.budget} 步。`;
    } else if (event.data.type === "error") {
      cancelVerification(); byId("editorError").textContent = event.data.message;
    } else if (event.data.type === "complete") { cancelVerification(); done(event.data.result); }
  };
  worker.onerror = () => { if (verificationWorker === worker) { cancelVerification(); byId("editorError").textContent = "后台计算意外停止，可重新提交。"; } };
  worker.postMessage({ cases: level.cases, maxSteps: level.maxSteps, definition });
}
byId("cancelVerification").addEventListener("click", () => cancelVerification("后台计算已取消，草稿仍保留。"));
const ruleDiagnosticView = attachRuleDiagnostics(byId<HTMLTextAreaElement>("rulesEditor"));

function loadProgress(): CampaignProgress {
  try {
    const source = localStorage.getItem(STORAGE_KEY);
    if (!source) return emptyCampaignProgress();
    const loaded = normalizeCampaignProgress(JSON.parse(source));
    return loaded;
  } catch {
    return emptyCampaignProgress();
  }
}

function saveProgress(): string | null {
  queueArchive({ kind: "campaign", title: "关卡进度与通关解法", content: JSON.stringify(progress) });
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    return null;
  } catch {
    return "浏览器未能保存草稿或进度。";
  }
}

function firstAvailableLevel(): CampaignLevel {
  return campaignLevels.find((level) => isLevelUnlocked(progress, level.id) && !progress.completedLevelIds.includes(level.id))
    ?? [...campaignLevels].reverse().find((level) => isLevelUnlocked(progress, level.id))
    ?? campaignLevels[0];
}

function activeLevel(): CampaignLevel {
  return campaignLevels.find((level) => level.id === activeLevelId) ?? campaignLevels[0];
}

byId("previewAnswer").addEventListener("click", () => {
  const level = activeLevel();
  const answer = solutionRules[level.id];
  if (!answer) return;
  byId("answerPreviewTitle").textContent = level.title + " · 参考答案";
  byId("answerPreviewRules").textContent = compactRuleArrows(answer);
  byId<HTMLDialogElement>("answerPreview").showModal();
});

function definitionFromEditor(): MachineDefinition | null {
  const level = activeLevel();
  if (!isLevelUnlocked(progress, level.id)) {
    byId("editorError").textContent = "当前可预习原理；完成前面的关卡后解锁练习。";
    return null;
  }
  const source = byId<HTMLTextAreaElement>("rulesEditor").value;
  const conflict = campaignMigrationConflict(level.id, source);
  if (conflict) { byId("editorError").textContent = conflict; return null; }
  const parsed = parseTransitions(normalizeCampaignDraft(level.id, source), terminalConfig(level));
  ruleDiagnosticView.update(parsed.errors);
  if (parsed.errors.length) {
    byId("editorError").textContent = parsed.errors.slice(0, 4).join("；");
    return null;
  }
  byId("editorError").textContent = "";
  return {
    blankSymbol: level.starter.blankSymbol,
    initialState: resolveInitialState(parsed, level.starter.initialState),
    ...terminalConfig(level),
    transitions: parsed.transitions,
  };
}

const lessonFunctionNames = new Map<string, string[]>();
function collectFunctionNames(source: string): string[] {
  return source.split(/\r?\n/).flatMap(line => {
    const header = functionHeader(line.trim());
    return header ? [header.name] : [];
  });
}

function renderFunctionNameKeys(level: CampaignLevel, draft: string): void {
  let prescribed = lessonFunctionNames.get(level.id);
  if (!prescribed) {
    prescribed = collectFunctionNames([level.starter.rules, ...level.lesson.syntax, solutionRules[level.id] ?? ""].join("\n"));
    lessonFunctionNames.set(level.id, prescribed);
  }
  const names = [...new Set([...prescribed, ...collectFunctionNames(draft)])];
  const host = byId("functionNameKeys");
  host.replaceChildren();
  if (names.length) {
    const label = document.createElement("span");
    label.textContent = "函数名";
    host.append(label);
  }
  for (const name of names) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.insertSymbol = name;
    button.textContent = name;
    button.setAttribute("aria-label", `插入函数名 ${name}`);
    button.title = `在光标处插入函数名 ${name}`;
    button.disabled = !isLevelUnlocked(progress, level.id);
    host.append(button);
  }
}

function updateRuleRecognition(): void {
  const level = activeLevel();
  const source = byId<HTMLTextAreaElement>("rulesEditor").value;
  renderFunctionNameKeys(level, source);
  const conflict = campaignMigrationConflict(level.id, source);
  if (conflict) { byId("editorError").textContent = conflict; byId("ruleRecognition").textContent = conflict; byId("ruleRecognition").classList.add("warning"); return; }
  const parsed = parseTransitions(normalizeCampaignDraft(level.id, source), terminalConfig(level));
  ruleDiagnosticView.update(parsed.errors);
  byId("editorError").textContent = parsed.errors.slice(0, 4).join("；");
  const blankRules = parsed.transitions.filter((rule) => rule.readSymbol === level.starter.blankSymbol);
  const status = byId("ruleRecognition");
  if (parsed.errors.length) {
    status.textContent = `暂时识别到 ${parsed.transitions.length} 条规则；${parsed.errors[0]}。`;
    status.classList.add("warning");
    return;
  }
  const blankStates = blankRules.slice(0, 8).map(rule => rule.fromState).join("、");
  status.textContent = `已识别 ${parsed.transitions.length} 条规则；${blankRules.length ? `空白符 ${level.starter.blankSymbol} 规则：${blankStates}${blankRules.length > 8 ? "等" : ""} 状态已覆盖` : `尚未写入读取空白符 ${level.starter.blankSymbol} 的规则`}。`;
  status.classList.toggle("warning", blankRules.length === 0);
}

function render(): void {
  cancelVerification();
  const level = activeLevel();
  const index = campaignLevels.indexOf(level);
  const list = byId("levelList");
  list.replaceChildren();
  campaignTopics.forEach((topic) => {
    const sectionLevels = campaignLevels.filter((item) => campaignTopicFor(item).id === topic.id);
    const completedCount = sectionLevels.filter((item) => progress.completedLevelIds.includes(item.id)).length;
    const group = document.createElement("section");
    group.className = "level-group";
    group.dataset.topicId = topic.id;
    const heading = document.createElement("div");
    heading.className = "level-group-heading";
    const headingText = document.createElement("div");
    const title = document.createElement("strong");
    const description = document.createElement("small");
    const count = document.createElement("span");
    title.textContent = topic.title;
    description.textContent = topic.description;
    count.textContent = `${completedCount}/${sectionLevels.length}`;
    headingText.append(title, description);
    heading.append(headingText, count);
    group.append(heading);
    sectionLevels.forEach((item) => {
      const itemIndex = campaignLevels.indexOf(item);
      const unlocked = isLevelUnlocked(progress, item.id);
      const completed = progress.completedLevelIds.includes(item.id);
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.levelId = item.id;
      button.dataset.topic = topic.id;
      button.dataset.stage = item.section;
      const stageTitle = campaignSections.find(section => section.id === item.section)!.title;
      button.dataset.search = `${topic.title} ${item.title} ${item.concept} ${stageTitle} ${item.sourceExampleId ?? ""}`.toLocaleLowerCase();
      button.className = `level-button${item.id === level.id ? " active" : ""}${completed ? " completed" : ""}${unlocked ? "" : " locked"}`;
      button.setAttribute("aria-label", `${item.title.replace(/^第 \d+ 关 · /, "")}，${unlocked ? "进入练习" : "预览原理，练习未解锁"}`);
      const number = document.createElement("span");
      const text = document.createElement("div");
      number.textContent = completed ? "✓" : unlocked ? String(itemIndex + 1) : "锁";
      const itemTitle = document.createElement("strong");
      const concept = document.createElement("small");
      itemTitle.textContent = item.title.replace(/^第 \d+ 关 · /, "");
      concept.textContent = `${stageTitle} · ${"◆".repeat(item.difficulty)} ${item.concept}`;
      text.append(itemTitle, concept);
      button.append(number, text);
      group.append(button);
    });
    list.append(group);
  });
  const section = campaignSections.find((item) => item.id === level.section)!;
  const unlocked = isLevelUnlocked(progress, level.id);
  const next = nextCampaignLevel(level.id);
  const nextButton = byId<HTMLButtonElement>("nextLevel");
  nextButton.hidden = !next;
  nextButton.disabled = !next || !isLevelUnlocked(progress, next.id);
  nextButton.textContent = next ? `下一关 · ${next.title.replace(/^第 \d+ 关 · /, "")}` : "下一关";
  byId("sectionBadge").textContent = `${campaignTopicFor(level).title} · ${section.title}`;
  byId("levelBadge").textContent = `第 ${index + 1} / ${campaignLevels.length} 关`;
  byId("levelTitle").textContent = level.title.replace(/^第 \d+ 关 · /, "");
  byId("levelState").textContent = progress.completedLevelIds.includes(level.id) ? "已完成" : unlocked ? "学习中" : "原理预览";
  byId("lessonLockNote").hidden = unlocked;
  byId("levelState").classList.toggle("done", progress.completedLevelIds.includes(level.id));
  const isComplete = progress.completedLevelIds.includes(level.id);
  byId<HTMLButtonElement>("undoComplete").hidden = !isComplete;
  byId<HTMLButtonElement>("undoCompleteNearSubmit").hidden = !isComplete;
  byId("levelObjective").textContent = level.objective;
  byId("levelConcept").textContent = level.concept;
  byId("levelExplanation").textContent = level.lesson.explanation;
  renderTextList("lessonSteps", level.lesson.steps, "li");
  renderTextList("lessonSyntax", level.lesson.syntax, "li");
  byId("workedExample").hidden = !level.lesson.workedExample;
  byId("workedExampleTitle").textContent = level.lesson.workedExample?.title ?? "";
  renderTextList("workedExampleStages", level.lesson.workedExample?.stages ?? [], "li");
  const guide = level.lesson.implementationGuide;
  byId("implementationGuide").hidden = !guide;
  byId("guideTape").textContent = guide?.tape ?? "";
  renderTextList("guideSteps", guide?.steps ?? [], "li");
  renderTextList("guideCheckpoints", guide?.checkpoints ?? [], "li");
  byId<HTMLDetailsElement>("implementationGuide").querySelector("details")!.open = false;
  byId("starterInput").textContent = level.starter.input || "（空纸带）";
  byId("starterState").textContent = level.starter.initialState;
  byId("starterBlank").textContent = level.starter.blankSymbol;
  byId("starterTerminals").textContent = [level.starter.haltStates || "—", level.starter.acceptStates || "—", level.starter.rejectStates || "—"].join(" / ");
  const blankKey = document.querySelector<HTMLButtonElement>(".blank-key")!;
  blankKey.dataset.insertSymbol = level.starter.blankSymbol;
  blankKey.replaceChildren(document.createTextNode(`${level.starter.blankSymbol} `), Object.assign(document.createElement("small"), { textContent: "空白符" }));
  const terminalKeys = byId("terminalStateKeys");
  terminalKeys.replaceChildren();
  for (const [label, states] of [["停止", level.starter.haltStates], ["接受", level.starter.acceptStates], ["拒绝", level.starter.rejectStates]]) {
    for (const state of states.split(",").map(name => name.trim()).filter(Boolean)) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.insertSymbol = state;
      button.textContent = `${label} ${state}`;
      button.setAttribute("aria-label", `插入${label}状态 ${state}`);
      button.title = `在光标处插入 ${state}`;
      terminalKeys.append(button);
    }
  }
  byId<HTMLTextAreaElement>("rulesEditor").value = progress.drafts[level.id] ?? "";
  byId("rulesTransferStatus").hidden = true;
  byId<HTMLTextAreaElement>("rulesEditor").readOnly = !unlocked;
  for (const id of ["tryExample", "verifyLevel", "resetDraft"]) byId<HTMLButtonElement>(id).disabled = !unlocked;
  document.querySelectorAll<HTMLButtonElement>("[data-insert-symbol]").forEach(button => { button.disabled = !unlocked; });
  updateRuleRecognition();
  const cases = byId("publicCases");
  cases.replaceChildren();
  level.cases.forEach((testCase) => {
    const row = document.createElement("code");
    row.textContent = `${testCase.input || "空纸带"} → ${testCase.expectedOutput || "空纸带"}${testCase.expectedSteps !== undefined ? `；${testCase.expectedSteps} 步` : ""}${testCase.maxSteps !== undefined ? `（观察 ${testCase.maxSteps} 步）` : ""}`;
    cases.append(row);
  });
  const completeCount = progress.completedLevelIds.length;
  byId("progressText").textContent = `${completeCount} / ${campaignLevels.length} 完成`;
  byId<HTMLProgressElement>("progressBar").value = completeCount;
  byId("tryResult").textContent = "试跑结果会显示在这里。";
  byId("verifyResult").textContent = unlocked ? "完成规则后再提交。" : "可先阅读原理，顺序解锁后再练习。";
  renderTape("");
  filterLevelList();
}

function filterLevelList(): void {
  const query = byId<HTMLInputElement>("levelSearch").value.trim().toLocaleLowerCase();
  const topic = byId<HTMLSelectElement>("levelTopic").value;
  const stage = byId<HTMLSelectElement>("levelStage").value;
  let visible = 0;
  document.querySelectorAll<HTMLElement>("[data-level-id]").forEach(button => {
    const match = (!query || button.dataset.search!.includes(query)) && (topic === "all" || button.dataset.topic === topic) && (stage === "all" || button.dataset.stage === stage);
    button.style.display = match ? "" : "none"; if (match) visible++;
  });
  document.querySelectorAll<HTMLElement>(".level-group").forEach(group => {
    group.hidden = ![...group.querySelectorAll<HTMLElement>("[data-level-id]")].some(button => button.style.display !== "none");
  });
  byId("levelSearchStatus").textContent = `显示 ${visible} / ${campaignLevels.length} 关`;
}
byId("levelSearch").addEventListener("input", filterLevelList);
for (const id of ["levelTopic", "levelStage"]) byId(id).addEventListener("change", filterLevelList);
byId("clearLevelFilters").addEventListener("click", () => {
  byId<HTMLInputElement>("levelSearch").value = "";
  byId<HTMLSelectElement>("levelTopic").value = "all";
  byId<HTMLSelectElement>("levelStage").value = "all";
  filterLevelList();
});

function renderTextList(id: string, values: string[], tag: "li"): void {
  const host = byId(id);
  host.replaceChildren(...values.map((value) => {
    const element = document.createElement(tag);
    element.textContent = value;
    return element;
  }));
}

function renderTape(output: string | string[]): void {
  const host = byId("tapePreview");
  host.replaceChildren();
  if (!output.length) {
    const empty = document.createElement("span");
    empty.className = "empty-tape";
    empty.textContent = "空纸带";
    host.append(empty);
    return;
  }
  for (const symbol of Array.isArray(output) ? output : Array.from(output)) {
    const cell = document.createElement("span");
    cell.textContent = symbol;
    host.append(cell);
  }
}

byId("levelList").addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLElement>("[data-level-id]");
  const levelId = button?.dataset.levelId;
  if (!levelId) return;
  goToLevel(levelId);
});

function goToLevel(levelId: string): void {
  activeLevelId = levelId;
  const url = new URL(location.href);
  url.searchParams.set("level", levelId);
  history.replaceState(null, "", url);
  render();
}

byId("nextLevel").addEventListener("click", () => {
  const next = nextCampaignLevel(activeLevelId);
  if (!next || !isLevelUnlocked(progress, next.id)) return;
  const topic = byId<HTMLSelectElement>("levelTopic"), stage = byId<HTMLSelectElement>("levelStage");
  if (topic.value !== "all" && topic.value !== campaignTopicFor(next).id) topic.value = campaignTopicFor(next).id;
  if (stage.value !== "all" && stage.value !== next.section) stage.value = next.section;
  byId<HTMLInputElement>("levelSearch").value = "";
  goToLevel(next.id);
});

attachSpaceIndentation(byId<HTMLTextAreaElement>("rulesEditor"));
byId("rulesEditor").addEventListener("input", () => {
  if (!isLevelUnlocked(progress, activeLevelId)) return;
  if (verificationWorker) cancelVerification("草稿已更改，上一次后台计算已取消，请重新提交。");
  progress = { ...progress, drafts: { ...progress.drafts, [activeLevelId]: byId<HTMLTextAreaElement>("rulesEditor").value } };
  const warning = saveProgress();
  updateRuleRecognition();
  if (warning) byId("editorError").textContent = warning;
});

document.querySelector<HTMLElement>(".symbol-keyboard")!.addEventListener("pointerdown", (event) => {
  if ((event.target as HTMLElement).closest("button")) event.preventDefault();
});

document.querySelector<HTMLElement>(".symbol-keyboard")!.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-insert-symbol]");
  const symbol = button?.dataset.insertSymbol;
  if (!symbol) return;
  const editor = byId<HTMLTextAreaElement>("rulesEditor");
  const result = insertAtSelection(editor, symbol);
  editor.value = result.value;
  editor.focus();
  editor.setSelectionRange(result.caret, result.caret);
  editor.dispatchEvent(new Event("input", { bubbles: true }));
});

byId("tryExample").addEventListener("click", () => {
  const definition = definitionFromEditor();
  if (!definition) return;
  const level = activeLevel();
  try {
    const testCase = level.cases.find(item => item.input === level.starter.input) ?? { input: level.starter.input, expectedOutput: "" };
    runVerification({ ...level, cases: [testCase] }, definition, "tryResult", verification => {
      const result = verification.cases[0];
      const stopText = result.reason === "missing-transition"
        ? `缺少规则：状态 ${result.stoppedState} 读取 ${result.readSymbol}`
        : result.reason === "step-limit" ? "到达观察步数" : "机器已停止";
      byId("tryResult").textContent = `运行 ${result.steps} 步，${stopText}；检查结果：${result.actualOutput || "空纸带"}。下方为纸带预览，最多 120 格。`;
      renderTape(result.tapePreview ?? result.actualOutput);
    });
  } catch (error) {
    byId("editorError").textContent = error instanceof Error ? error.message : "无法试跑当前规则";
  }
});

byId("verifyLevel").addEventListener("click", () => {
  const definition = definitionFromEditor();
  if (!definition) return;
  const level = activeLevel();
  try {
    runVerification(level, definition, "verifyResult", result => {
      const failed = result.cases.find((testCase) => !testCase.passed);
      if (failed) {
        const reason = failed.reason === "missing-transition"
          ? `；缺少“状态 ${failed.stoppedState} 读取 ${failed.readSymbol}”的规则`
          : failed.reason === "step-limit" ? failed.expectedReason === "step-limit" ? "；观察时刻的生成前缀不符合目标" : `，且超过 ${level.maxSteps} 步`
          : failed.expectedSteps !== undefined && failed.steps !== failed.expectedSteps ? `；期望运行 ${failed.expectedSteps} 步，实际 ${failed.steps} 步`
          : failed.reason !== (failed.expectedReason ?? "halt") ? `；期望终止类型 ${failed.expectedReason ?? "halt"}，实际 ${failed.reason}` : "";
        byId("verifyResult").textContent = `还差一点：输入 ${failed.input || "空纸带"} 时，期望 ${failed.expectedOutput || "空纸带"}，实际 ${failed.actualOutput || "空纸带"}${reason}。`;
        return;
      }
      progress = completeLevel(progress, level.id);
      const warning = saveProgress();
      const next = nextCampaignLevel(level.id);
      const completion = progress.completedLevelIds.length === campaignLevels.length ? `全部 ${campaignLevels.length} 关完成！` : next ? isLevelUnlocked(progress, next.id) ? `可继续“${next.title}”。` : `下一关为“${next.title}”，完成前置练习后解锁。` : "已到学习路线末尾，可从列表补做未完成的关卡。";
      render();
      byId("verifyResult").textContent = `通过！${result.totalCount} 组测试全部正确。${completion}${warning ? ` ${warning}` : ""}`;
    });
  } catch (error) {
    byId("editorError").textContent = error instanceof Error ? error.message : "无法验证当前规则";
  }
});

/** 关卡页内的确认框。不依赖 window.confirm：安卓外壳未实现 WebChromeClient.onJsConfirm。 */
const confirmDialog = byId<HTMLDialogElement>("confirmDialog");
let pendingConfirm: (() => void) | null = null;

function askConfirm(message: string, confirmLabel: string, action: () => void): void {
  byId("confirmMessage").textContent = message;
  byId("confirmOk").textContent = confirmLabel;
  pendingConfirm = action;
  if (typeof confirmDialog.showModal === "function") {
    confirmDialog.showModal();
    return;
  }
  // 极旧内核没有 <dialog>，降级为原生确认（不可用则直接取消）。
  pendingConfirm = null;
  if (typeof window.confirm === "function" && window.confirm(message)) action();
}

confirmDialog.addEventListener("click", (event) => {
  if (event.target === confirmDialog) confirmDialog.close("cancel");
});

confirmDialog.addEventListener("close", () => {
  const action = pendingConfirm;
  pendingConfirm = null;
  if (confirmDialog.returnValue === "confirm" && action) action();
});

function shortTitle(level: CampaignLevel): string {
  return level.title.replace(/^第 \d+ 关 · /, "");
}

byId("transferRules").addEventListener("click", async () => {
  const button = byId<HTMLButtonElement>("transferRules");
  if (button.disabled) return;
  const status = byId("rulesTransferStatus");
  const levelId = activeLevelId;
  const level = activeLevel();
  const mode = byId<HTMLSelectElement>("labEntryMode").value;
  if (mode === "previous") {
    const target = new URL("./", location.href);
    target.searchParams.set("fromLevel", levelId);
    target.searchParams.set("example", `campaign-${levelId}`);
    location.assign(target.href);
    return;
  }
  const source = mode === "example" ? solutionRules[levelId] : byId<HTMLTextAreaElement>("rulesEditor").value;
  const conflict = campaignMigrationConflict(levelId, source);
  if (conflict) { status.hidden = false; status.textContent = conflict; return; }
  const rules = normalizeCampaignDraft(levelId, source).split(/\r?\n/)
    .filter(line => line.trim() && !line.trimStart().startsWith("#")).join("\n");
  status.hidden = false;
  if (!rules) { status.textContent = "当前没有可转到实验台的规则。"; return; }
  button.disabled = true;
  status.textContent = "正在转到实验台……";
  try {
    const entry = await saveArchive({ kind: "project", title: `${shortTitle(level)} · ${mode === "example" ? "当前示例" : "我的规则"}`, content: JSON.stringify({
      ...level.starter, rules, campaignLevelId: levelId, format: "turing-machine-simulator", version: 1,
      maxSteps: level.starter.maxSteps === null || level.maxSteps > 1000000 ? null : level.maxSteps, speed: 5,
    }) }, "从关卡转到实验台");
    openArchivePage(entry, levelId);
  } catch (error) {
    if (activeLevelId === levelId) status.textContent = error instanceof Error ? error.message : "转到实验台失败。";
  } finally { button.disabled = false; }
});

byId("resetDraft").addEventListener("click", () => {
  const level = activeLevel();
  askConfirm(`重置本关会清空「${shortTitle(level)}」的草稿，编辑器将留空。`, "确认重置", async () => {
    try { await saveArchive({ kind: "campaign", title: "重置前的关卡进度与解法", content: JSON.stringify(progress) }, "重置前备份"); }
    catch { byId("editorError").textContent = "未能备份草稿，尚未重置，请先下载备份。"; return; }
    progress = resetDraft(progress, level.id);
    const warning = saveProgress();
    render();
    byId("editorError").textContent = warning ?? "";
  });
});

function requestUndoCompletion(): void {
  const level = activeLevel();
  askConfirm(`撤销「${shortTitle(level)}」的通关状态？该关会回到「学习中」，可以重新练习。`, "确认撤销", () => {
    progress = uncompleteLevel(progress, level.id);
    const warning = saveProgress();
    render();
    byId("verifyResult").textContent = `已撤销「${shortTitle(level)}」的通关状态，可以重新挑战。${warning ?? ""}`;
  });
}

byId("undoComplete").addEventListener("click", requestUndoCompletion);
byId("undoCompleteNearSubmit").addEventListener("click", requestUndoCompletion);

byId("exportCampaign").addEventListener("click", async () => {
  const button = byId<HTMLButtonElement>("exportCampaign");
  if (button.disabled) return;
  button.disabled = true;
  try {
    const name = await downloadFile(`turing-campaign-${new Date().toISOString().slice(0, 10)}.json`, encodeCampaignBackup(progress), "application/json");
    byId("backupStatus").textContent = `已下载关卡备份文件：${name}。恢复时可导入此文件。`;
  } catch (error) {
    byId("backupStatus").textContent = error instanceof Error ? error.message : "备份下载失败。";
  } finally { button.disabled = false; }
});

byId("importCampaign").addEventListener("click", () => byId<HTMLInputElement>("importCampaignFile").click());

byId<HTMLInputElement>("importCampaignFile").addEventListener("change", async () => {
  const input = byId<HTMLInputElement>("importCampaignFile");
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  try {
    if (file.size > MAX_CAMPAIGN_BACKUP_BYTES) throw new Error("存档文件超过 32 MiB。");
    const imported = normalizeCampaignProgress(parseCampaignBackup(await file.text()));
    askConfirm(`导入会替换此设备当前的关卡进度和规则草稿。备份包含 ${imported.completedLevelIds.length} 关已通关记录，确认导入吗？`, "确认导入", async () => {
      try {
        await saveArchive({ kind: "campaign", title: "导入前的关卡进度与解法", content: JSON.stringify(progress) }, "导入前备份");
        localStorage.setItem(STORAGE_KEY, JSON.stringify(imported));
        progress = imported;
        activeLevelId = firstAvailableLevel().id;
        render();
        byId("backupStatus").textContent = `已恢复备份：${imported.completedLevelIds.length} / ${campaignLevels.length} 关完成。`;
      } catch {
        byId("backupStatus").textContent = "浏览器未能保存导入的进度；原有进度未更改。";
      }
    });
  } catch (error) {
    byId("backupStatus").textContent = error instanceof Error ? error.message : "无法读取关卡备份。";
  }
});

byId("clearCampaign").addEventListener("click", () => {
  askConfirm("清空此设备上的全部关卡进度和规则草稿？会先保留一份本地历史存档。", "确认清空", async () => {
    try {
      await saveArchive({ kind: "campaign", title: "清空前的关卡进度与解法", content: JSON.stringify(progress) }, "清空前备份");
      localStorage.removeItem(STORAGE_KEY);
      progress = emptyCampaignProgress();
      activeLevelId = campaignLevels[0].id;
      render();
      byId("backupStatus").textContent = "关卡进度与规则草稿已清空。";
    } catch {
      byId("backupStatus").textContent = "浏览器未能清空本地存档；原有进度未更改。";
    }
  });
});

render();
attachLocalArchive({
  page: "campaign", ready: localArchiveReady,
  current: () => ({ kind: "campaign", title: "我的关卡进度与解法", content: JSON.stringify(progress) }),
  restore: entry => {
    const data: unknown = JSON.parse(entry.content);
    if (!data || typeof data !== "object" || !Array.isArray((data as CampaignProgress).completedLevelIds) || !(data as CampaignProgress).drafts) throw new Error("存档缺少关卡进度字段。");
    progress = normalizeCampaignProgress(data);
    const warning = saveProgress();
    activeLevelId = firstAvailableLevel().id;
    render();
    byId("backupStatus").textContent = warning ?? "已恢复关卡进度与保存的解法。";
  },
});
