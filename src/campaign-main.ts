import "./campaign-styles.css";
import { campaignLevels, completeLevel, emptyCampaignProgress, isLevelUnlocked, normalizeCampaignProgress, verifyLevel, type CampaignLevel, type CampaignProgress } from "./campaign";
import { parseTransitions, type MachineDefinition } from "./core";

const STORAGE_KEY = "turing-machine-simulator.campaign.v1";
let progress = loadProgress();
let activeLevelId = firstAvailableLevel().id;

document.querySelector<HTMLDivElement>("#campaign-app")!.innerHTML = `
  <div class="course-app">
    <header class="course-topbar">
      <a class="back-link" href="./">← 返回实验台</a>
      <div><span>TM LEARNING PATH</span><h1>图灵机教学关卡</h1></div>
      <div class="course-progress"><strong id="progressText"></strong><progress id="progressBar" max="${campaignLevels.length}"></progress></div>
    </header>
    <main class="course-layout">
      <nav class="level-sidebar" aria-label="教学关卡">
        <div class="sidebar-heading"><strong>学习路线</strong><small>一次只学一个概念</small></div>
        <div id="levelList"></div>
      </nav>
      <section class="lesson-workspace">
        <article class="lesson-card">
          <div class="lesson-heading"><div><span id="levelBadge"></span><h2 id="levelTitle"></h2></div><span id="levelState" class="level-state"></span></div>
          <p id="levelObjective" class="objective"></p>
          <div class="concept-box"><strong id="levelConcept"></strong><p id="levelExplanation"></p></div>
          <div class="lesson-grid">
            <section><h3>跟着做</h3><ol id="lessonSteps"></ol></section>
            <section><h3>本关语法</h3><ul id="lessonSyntax" class="syntax-list"></ul></section>
          </div>
        </article>

        <div class="practice-grid">
          <section class="editor-card">
            <div class="section-heading"><div><span>STEP 1</span><h3>编写规则</h3></div><small>草稿会自动保存</small></div>
            <div class="fixed-config">
              <div><span>示例输入</span><code id="starterInput"></code></div>
              <div><span>初始状态</span><code id="starterState"></code></div>
              <div><span>空白符</span><code id="starterBlank"></code></div>
              <div><span>停机状态</span><code>HALT</code></div>
            </div>
            <label for="rulesEditor">转移规则</label>
            <textarea id="rulesEditor" spellcheck="false" aria-describedby="editorHelp"></textarea>
            <p id="editorHelp" class="editor-help">格式：当前状态,读取符号 -&gt; 下一状态,写入符号,方向</p>
            <div id="editorError" class="editor-error" aria-live="polite"></div>
          </section>

          <aside class="test-card">
            <div class="section-heading"><div><span>STEP 2</span><h3>试跑与验证</h3></div></div>
            <div class="public-tests"><strong>本关会检查</strong><div id="publicCases"></div></div>
            <button id="tryExample" class="button secondary">用示例输入试跑</button>
            <div id="tryResult" class="try-result">试跑结果会显示在这里。</div>
            <div id="tapePreview" class="tape-preview" aria-label="试跑纸带"></div>
            <button id="verifyLevel" class="button primary">提交本关答案</button>
            <div id="verifyResult" class="verify-result" aria-live="polite">完成规则后再提交。</div>
          </aside>
        </div>
      </section>
    </main>
  </div>`;

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function loadProgress(): CampaignProgress {
  try {
    const source = localStorage.getItem(STORAGE_KEY);
    return source ? normalizeCampaignProgress(JSON.parse(source)) : emptyCampaignProgress();
  } catch {
    return emptyCampaignProgress();
  }
}

function saveProgress(): string | null {
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

function definitionFromEditor(): MachineDefinition | null {
  const level = activeLevel();
  const parsed = parseTransitions(byId<HTMLTextAreaElement>("rulesEditor").value);
  if (parsed.errors.length) {
    byId("editorError").textContent = parsed.errors.slice(0, 4).join("；");
    return null;
  }
  byId("editorError").textContent = "";
  return {
    blankSymbol: level.starter.blankSymbol,
    initialState: level.starter.initialState,
    acceptStates: [],
    rejectStates: [],
    haltStates: ["HALT"],
    transitions: parsed.transitions,
  };
}

function render(): void {
  const level = activeLevel();
  const index = campaignLevels.indexOf(level);
  const list = byId("levelList");
  list.replaceChildren();
  campaignLevels.forEach((item, itemIndex) => {
    const unlocked = isLevelUnlocked(progress, item.id);
    const completed = progress.completedLevelIds.includes(item.id);
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.levelId = item.id;
    button.className = `level-button${item.id === level.id ? " active" : ""}${completed ? " completed" : ""}${unlocked ? "" : " locked"}`;
    button.setAttribute("aria-disabled", String(!unlocked));
    const number = document.createElement("span");
    const text = document.createElement("div");
    number.textContent = completed ? "✓" : unlocked ? String(itemIndex + 1) : "锁";
    const title = document.createElement("strong");
    const concept = document.createElement("small");
    title.textContent = item.title.replace(/^第 \d+ 关 · /, "");
    concept.textContent = item.concept;
    text.append(title, concept);
    button.append(number, text);
    list.append(button);
  });
  byId("levelBadge").textContent = `第 ${index + 1} / ${campaignLevels.length} 关`;
  byId("levelTitle").textContent = level.title.replace(/^第 \d+ 关 · /, "");
  byId("levelState").textContent = progress.completedLevelIds.includes(level.id) ? "已完成" : "学习中";
  byId("levelState").classList.toggle("done", progress.completedLevelIds.includes(level.id));
  byId("levelObjective").textContent = level.objective;
  byId("levelConcept").textContent = level.concept;
  byId("levelExplanation").textContent = level.lesson.explanation;
  renderTextList("lessonSteps", level.lesson.steps, "li");
  renderTextList("lessonSyntax", level.lesson.syntax, "li");
  byId("starterInput").textContent = level.starter.input || "（空纸带）";
  byId("starterState").textContent = level.starter.initialState;
  byId("starterBlank").textContent = level.starter.blankSymbol;
  byId<HTMLTextAreaElement>("rulesEditor").value = progress.drafts[level.id] ?? level.starter.rules;
  const cases = byId("publicCases");
  cases.replaceChildren();
  level.cases.forEach((testCase) => {
    const row = document.createElement("code");
    row.textContent = `${testCase.input || "空纸带"} → ${testCase.expectedOutput || "空纸带"}`;
    cases.append(row);
  });
  const completeCount = progress.completedLevelIds.length;
  byId("progressText").textContent = `${completeCount} / ${campaignLevels.length} 完成`;
  byId<HTMLProgressElement>("progressBar").value = completeCount;
  byId("tryResult").textContent = "试跑结果会显示在这里。";
  byId("verifyResult").textContent = "完成规则后再提交。";
  renderTape("");
}

function renderTextList(id: string, values: string[], tag: "li"): void {
  const host = byId(id);
  host.replaceChildren(...values.map((value) => {
    const element = document.createElement(tag);
    element.textContent = value;
    return element;
  }));
}

function renderTape(output: string): void {
  const host = byId("tapePreview");
  host.replaceChildren();
  if (!output) {
    const empty = document.createElement("span");
    empty.className = "empty-tape";
    empty.textContent = "空纸带";
    host.append(empty);
    return;
  }
  for (const symbol of Array.from(output)) {
    const cell = document.createElement("span");
    cell.textContent = symbol;
    host.append(cell);
  }
}

byId("levelList").addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLElement>("[data-level-id]");
  const levelId = button?.dataset.levelId;
  if (!levelId) return;
  if (!isLevelUnlocked(progress, levelId)) {
    byId("verifyResult").textContent = "先完成前面的关卡，教程会一步步带你到这里。";
    return;
  }
  activeLevelId = levelId;
  render();
});

byId("rulesEditor").addEventListener("input", () => {
  progress = { ...progress, drafts: { ...progress.drafts, [activeLevelId]: byId<HTMLTextAreaElement>("rulesEditor").value } };
  const warning = saveProgress();
  byId("editorError").textContent = warning ?? "";
});

byId("tryExample").addEventListener("click", () => {
  const definition = definitionFromEditor();
  if (!definition) return;
  const level = activeLevel();
  try {
    const result = verifyLevel({ ...level, cases: [{ input: level.starter.input, expectedOutput: "" }] }, definition).cases[0];
    byId("tryResult").textContent = `运行 ${result.steps} 步，${result.reason === "step-limit" ? "达到步数上限" : "机器已停止"}；纸带输出：${result.actualOutput || "空纸带"}`;
    renderTape(result.actualOutput);
  } catch (error) {
    byId("editorError").textContent = error instanceof Error ? error.message : "无法试跑当前规则";
  }
});

byId("verifyLevel").addEventListener("click", () => {
  const definition = definitionFromEditor();
  if (!definition) return;
  const level = activeLevel();
  try {
    const result = verifyLevel(level, definition);
    const failed = result.cases.find((testCase) => !testCase.passed);
    if (failed) {
      byId("verifyResult").textContent = `还差一点：输入 ${failed.input || "空纸带"} 时，期望 ${failed.expectedOutput || "空纸带"}，实际 ${failed.actualOutput || "空纸带"}${failed.reason === "step-limit" ? `，且超过 ${level.maxSteps} 步` : ""}。`;
      return;
    }
    progress = completeLevel(progress, level.id);
    const warning = saveProgress();
    const next = campaignLevels[campaignLevels.indexOf(level) + 1];
    byId("verifyResult").textContent = `通过！${result.totalCount} 组测试全部正确。${next ? `已解锁“${next.title}”。` : "八关全部完成！"}${warning ? ` ${warning}` : ""}`;
    render();
    byId("verifyResult").textContent = `通过！${result.totalCount} 组测试全部正确。${next ? `已解锁“${next.title}”。` : "八关全部完成！"}${warning ? ` ${warning}` : ""}`;
  } catch (error) {
    byId("editorError").textContent = error instanceof Error ? error.message : "无法验证当前规则";
  }
});

render();
