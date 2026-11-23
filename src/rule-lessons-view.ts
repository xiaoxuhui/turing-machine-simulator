import type { ExampleProject } from "./examples";
import { buildRuleLessons, type RuleLessons } from "./rule-lessons";
import { formatTransition } from "./rule-format";

const escape = (value: string) => value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);

export function attachRuleLessons(host: HTMLElement, project: ExampleProject): () => void {
  host.innerHTML = `<details class="rule-guide"><summary>逐条规则讲解：为什么读取、写入、移动和跳转</summary>
    <p>下面使用此示例默认源码展开后的实际规则。先选状态，再展开某一条分支；隐藏标记也会完整显示。目录顺序不是执行顺序；执行到哪里，请点击每条规则的目标状态。</p>
    <div class="rule-guide-controls"><label>状态名称<select class="guide-names"><option value="original">示例原名</option><option value="numeric">数字状态名</option></select></label>
      <label>搜索状态、符号或原因<input class="guide-search" type="search" placeholder="例如 binary.start、进位、#(L)1" /></label></div>
    <p class="guide-count" role="status"></p><label>选择状态<select class="guide-state"></select></label>
    <div class="guide-arrows"><button type="button" data-guide-action="previous">目录上一项</button><button type="button" data-guide-action="next">目录下一项</button></div>
    <div class="guide-state-content"></div>
    <details class="guide-symbols"><summary>查看所有符号的身份与用途</summary><dl></dl></details>
  </details>`;
  const root = host.querySelector<HTMLDetailsElement>(".rule-guide")!;
  const names = host.querySelector<HTMLSelectElement>(".guide-names")!, search = host.querySelector<HTMLInputElement>(".guide-search")!;
  const states = host.querySelector<HTMLSelectElement>(".guide-state")!, count = host.querySelector<HTMLElement>(".guide-count")!;
  const content = host.querySelector<HTMLElement>(".guide-state-content")!, glossary = host.querySelector<HTMLDetailsElement>(".guide-symbols")!;
  const models = new Map<string, RuleLessons>();
  let model: RuleLessons | undefined, selected = "", alive = true, revision = 0;
  let searchIndex = new Map<string, string>();
  const link = (state: string) => model?.states.some(item => item.name === state)
    ? `<button type="button" data-guide-state="${escape(state)}"><code>${escape(state || "*（任意状态）")}</code></button>` : `<code>${escape(state)}</code>`;

  function renderState(): void {
    const state = model?.states.find(item => item.name === selected);
    if (!state) { content.innerHTML = "<p>没有匹配的状态，试试进位、空白或完整符号名称。</p>"; return; }
    content.innerHTML = `<h4>当前状态：<code>${escape(state.name || "*（任意状态）")}</code></h4>
      ${state.original !== state.name ? `<p class="note">原名：<code>${escape(state.original || "*（任意状态）")}</code>。下面的箭头与目标使用所选名称。</p>` : ""}
      <p>这个状态有 ${state.rules.length} 条读取分支。每次只匹配当前头下的符号，不会按表格顺序逐条执行。</p>
      ${state.incoming.length ? `<details class="guide-incoming"><summary>哪些状态可以进入这里（${state.incoming.length} 个）</summary><div class="guide-targets">${state.incoming.map(link).join("")}</div></details>` : ""}
      ${state.rules.map(({ rule, explanation, compilerExplained }, index) => `<details class="guide-rule" ${index === 0 ? "open" : ""}><summary><code>${escape(formatTransition(rule))}</code></summary>
        <p class="guide-purpose">${escape(explanation.purpose)}</p>
        ${explanation.contexts?.length ? `<div class="guide-context"><strong>在算什么／状态记住了什么</strong><ul>${explanation.contexts.map(value => `<li>${escape(value)}</li>`).join("")}</ul>${explanation.contexts.length > 1 ? "<small>相同读写动作合并后可能共用本条规则，因此列出了多个适用情境。</small>" : ""}</div>` : ""}
        <dl><dt>为什么读取 ${escape(rule.readSymbol ? JSON.stringify(rule.readSymbol) : "任意符号")}</dt><dd>${escape(explanation.read)}</dd>
        <dt>为什么写入 ${escape(rule.writeSymbol ? JSON.stringify(rule.writeSymbol) : "保持原符号")}</dt><dd>${escape(explanation.write)}</dd>
        <dt>为什么${rule.direction === "L" ? "左移 L" : rule.direction === "R" ? "右移 R" : "不移动 N"}</dt><dd>${escape(explanation.move)}</dd>
        <dt>为什么进入下一状态</dt><dd>${escape(explanation.next)}<div class="guide-targets">${link(rule.toState)}</div></dd></dl>
        <small class="note">${compilerExplained ? "操作原因来自生成这条实际规则的编译器。" : "按原始规则、源码阶段说明和读写结构解释；具体算法结合上方原理推演阅读。"}</small>
      </details>`).join("")}`;
    const index = model!.states.indexOf(state);
    host.querySelector<HTMLButtonElement>('[data-guide-action="previous"]')!.disabled = index === 0;
    host.querySelector<HTMLButtonElement>('[data-guide-action="next"]')!.disabled = index === model!.states.length - 1;
  }
  function filter(): void {
    if (!model) return;
    const query = search.value.trim().toLocaleLowerCase();
    const matches = model.states.filter(state => {
      if (!query || `${state.name} ${state.original}`.toLocaleLowerCase().includes(query)) return true;
      if (!searchIndex.has(state.name)) searchIndex.set(state.name, [...new Set(state.rules.flatMap(item => [formatTransition(item.rule), ...Object.values(item.explanation).flat()]))].join(" ").toLocaleLowerCase());
      return searchIndex.get(state.name)!.includes(query);
    });
    if (!matches.some(state => state.name === selected)) selected = matches[0]?.name ?? "";
    states.innerHTML = matches.map(state => `<option value="${escape(state.name)}">${escape(state.name || "*（任意状态）")} · ${state.rules.length} 条分支</option>`).join("");
    states.value = selected;
    count.textContent = `${model.states.length} 个实际状态、${model.ruleCount} 条规则，全部可查；当前匹配 ${matches.length} 个状态。${model.compilerRuleCount ? `其中 ${model.compilerRuleCount} 条有生成器提供的操作原因。` : ""}入口：${model.initial}。`;
    if (matches.length) renderState();
    else { content.innerHTML = "<p>没有匹配的状态，试试进位、空白或完整符号名称。</p>";
      host.querySelectorAll<HTMLButtonElement>("[data-guide-action]").forEach(button => { button.disabled = true; }); }
  }
  function renderGlossary(): void {
    if (!glossary.open || !model) return;
    glossary.querySelector("dl")!.innerHTML = model.symbols.map(({ symbol, meaning }) => `<dt><code>${escape(JSON.stringify(symbol))}</code></dt><dd>${escape(meaning)}</dd>`).join("");
  }
  async function load(): Promise<void> {
    if (!root.open) return;
    const ticket = ++revision;
    count.textContent = "正在读取实际规则与讲解……";
    await new Promise(resolve => setTimeout(resolve, 0));
    if (!alive || ticket !== revision) return;
    try {
      const previous = model?.states.find(state => state.name === selected)?.original;
      if (!models.has(names.value)) models.set(names.value, buildRuleLessons(project, names.value === "numeric"));
      model = models.get(names.value)!;
      searchIndex = new Map();
      selected = model.states.find(state => state.original === previous)?.name ?? model.states.find(state => state.name === model!.initial)?.name ?? model.states[0]?.name ?? "";
      filter(); renderGlossary();
    } catch (error) { count.textContent = error instanceof Error ? error.message : "读取规则失败。"; content.replaceChildren(); }
  }
  function click(event: MouseEvent): void {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
    if (!button || !model) return;
    if (button.dataset.guideState !== undefined) selected = button.dataset.guideState;
    else if (button.dataset.guideAction) {
      const index = model.states.findIndex(state => state.name === selected) + (button.dataset.guideAction === "next" ? 1 : -1);
      selected = model.states[index]?.name ?? selected;
    } else return;
    search.value = ""; filter();
  }
  const onToggle = () => { if (root.open && !model) void load(); };
  const onNames = () => { void load(); };
  const onState = () => { selected = states.value; renderState(); };
  root.addEventListener("toggle", onToggle); names.addEventListener("change", onNames); states.addEventListener("change", onState);
  search.addEventListener("input", filter); glossary.addEventListener("toggle", renderGlossary); host.addEventListener("click", click);
  return () => { alive = false; revision++; root.removeEventListener("toggle", onToggle); names.removeEventListener("change", onNames);
    states.removeEventListener("change", onState); search.removeEventListener("input", filter); glossary.removeEventListener("toggle", renderGlossary); host.removeEventListener("click", click); };
}
