import type { ExampleProject } from "./examples";
import { selectKeyRules } from "./key-rules";
import { formatTransition } from "./rule-format";

const escape = (value: string) => value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);

export function renderKeyRules(host: HTMLElement, project: ExampleProject): void {
  const summary = selectKeyRules(project);
  host.innerHTML = `<h3>主要用到哪些状态</h3><dl class="key-states">${summary.states.map(state => `<dt><code>${escape(state.name)}</code></dt><dd>${escape(state.purpose)}</dd>`).join("")}</dl>
    <h3>几条代表规则</h3><p class="note">只看阶段怎么衔接；完整程序可到实验台查看。</p>
    <ul class="key-rules">${summary.rules.map(item => `<li><code>${escape(formatTransition(item.rule))}</code><p>${escape(item.reason)}</p></li>`).join("")}</ul>`;
}
