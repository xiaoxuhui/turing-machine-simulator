import "./principles-styles.css";
import { examplePrinciples } from "./example-principles";
import { examples } from "./examples";
import { attachRuleLessons } from "./rule-lessons-view";

const escape = (value: string) => value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
const requested = new URLSearchParams(location.search).get("example");
let activeId = examplePrinciples.find(item => item.id === requested)?.id ?? "campaign-binary-carry-local";
document.querySelector("#principles-app")!.innerHTML = `
  <header><a href="./">← 返回实验台</a><div><span>TM / LEARN</span><h1>示例原理</h1></div><a href="./campaign.html">进入关卡</a></header>
  <main>
    <aside aria-label="示例目录"><label for="principleSearch">搜索示例与原理</label><input id="principleSearch" type="search" placeholder="进位、复制、函数、对数……" /><p id="principleCount"></p><nav id="principleList"></nav></aside>
    <div class="reading">
      <details class="binary-help"><summary>为什么二进制运算更难？从这里开始</summary>
        <p>一进制用 1 的数量表示大小，合并或划掉计数就能做加减。二进制每一位的位置也有意义：右边是 1，再向左是 2、4、8……，所以要对齐位数、处理进位和借位。</p>
        <p>先学“末尾添 0”，再学“末位 0 加一”，然后才处理连续的 1 进位。多位加法只是把这套小规则重复执行。纸带上的搬运、复制、恢复、清理则是另一层工作，不等于算术本身很复杂。</p>
        <div class="path"><button data-open="campaign-binary-place-zero">① 位权</button><button data-open="campaign-binary-carry-local">② 不进位</button><button data-open="campaign-binary-carry-chain">③ 连续进位</button><button data-open="campaign-binary-addition">④ 多位相加</button></div>
        <table><caption>逐位相加：a+b+c，其中 c 是上一位的进位</caption><thead><tr><th>总和</th><th>当前位</th><th>下一进位</th></tr></thead><tbody><tr><td>0</td><td>0</td><td>0</td></tr><tr><td>1</td><td>1</td><td>0</td></tr><tr><td>2</td><td>0</td><td>1</td></tr><tr><td>3</td><td>1</td><td>1</td></tr></tbody></table>
      </details>
      <article id="principleArticle" aria-live="polite"></article>
    </div>
  </main>`;

const byId = (id: string) => document.getElementById(id)!;
let detachRuleLessons: (() => void) | undefined;
function renderList(): void {
  const search = (byId("principleSearch") as HTMLInputElement).value.trim().toLocaleLowerCase();
  const matches = examplePrinciples.filter(item => `${item.name} ${item.category} ${item.summary} ${item.steps.join(" ")}`.toLocaleLowerCase().includes(search));
  byId("principleCount").textContent = `显示 ${matches.length} / ${examplePrinciples.length} 篇原理`;
  byId("principleList").innerHTML = [...new Set(matches.map(item => item.category))].map(category => `<section><h2>${escape(category)}</h2>${matches.filter(item => item.category === category).map(item => `<button data-open="${escape(item.id)}" ${item.id === activeId ? 'aria-current="page"' : ""}>${escape(item.name)}</button>`).join("")}</section>`).join("") || "<p>没有匹配的示例，试试进位、函数或复制。</p>";
}
function renderArticle(): void {
  detachRuleLessons?.(); detachRuleLessons = undefined;
  const item = examplePrinciples.find(item => item.id === activeId)!;
  const list = (items: string[]) => items.map(value => `<li>${escape(value)}</li>`).join("");
  byId("principleArticle").innerHTML = `<span class="category">${escape(item.category)}</span><h2>${escape(item.name)}</h2><p class="summary">${escape(item.summary)}</p>
    <div class="input"><strong>示例输入</strong><code>${escape(item.input || "空纸带")}</code></div>
    <h3>一步一步怎么做</h3><ol>${list(item.steps)}</ol>
    <section class="walkthrough"><h3>具体推演</h3><ol>${list(item.walkthrough)}</ol></section>
    ${item.notes.length ? `<h3>边界与易错点</h3><ul>${list(item.notes)}</ul>` : ""}
    <section id="ruleLessonHost"></section>
    <footer><a class="primary" href="${escape(item.laboratoryUrl)}">到实验台选择此示例</a>${item.levelId ? `<a href="./campaign.html?level=${encodeURIComponent(item.levelId)}">练习对应关卡</a>` : ""}</footer>
    <p class="note">实验台链接只选择示例；点击“加载此示例”才替换编辑器。阅读原理与试跑示例不会标记关卡通关。</p>`;
  document.title = `${item.name} · 示例原理`;
  if (Object.hasOwn(examples, item.id)) detachRuleLessons = attachRuleLessons(byId("ruleLessonHost"), examples[item.id]);
}
function open(id: string): void {
  if (!examplePrinciples.some(item => item.id === id)) return;
  activeId = id;
  const url = new URL(location.href); url.searchParams.set("example", id); history.replaceState(null, "", url);
  renderList(); renderArticle();
}
document.addEventListener("click", event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-open]");
  if (button) open(button.dataset.open!);
});
byId("principleSearch").addEventListener("input", renderList);
renderList(); renderArticle();
