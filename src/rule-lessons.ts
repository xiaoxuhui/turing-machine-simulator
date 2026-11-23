import { parseTransitions, resolveInitialState, type Transition } from "./core";
import type { ExampleProject } from "./examples";
import { exampleVariant } from "./example-variants";
import { visibleTapeSymbol } from "./symbol-annotations";
import { ruleGuideKey, type RuleExplanation } from "./rule-guide";

export interface ExplainedRule { rule: Transition; explanation: RuleExplanation; compilerExplained: boolean }
export interface ExplainedState { name: string; original: string; rules: ExplainedRule[]; incoming: string[] }
export interface RuleLessons {
  states: ExplainedState[]; initial: string; ruleCount: number; compilerRuleCount: number;
  symbols: Array<{ symbol: string; meaning: string }>;
}
const split = (value: string) => value.split(",").map(value => value.trim()).filter(Boolean);
const show = (symbol: string) => symbol ? JSON.stringify(symbol) : "任意符号";

function sourceHints(source: string): Map<string, string> {
  const hints = new Map<string, string>();
  let note = "";
  for (const line of source.split(/\r?\n/)) {
    const text = line.trim();
    if (text.startsWith("# ")) {
      if (!/^# (?:lambda-local\b|bf\s|Gijswijt threshold=|universal\b)/.test(text)) note = text.slice(2);
      continue;
    }
    const state = text.match(/^([^,\s]+),/)?.[1];
    if (state && note && !hints.has(state)) hints.set(state, note);
  }
  return hints;
}

export function explainSymbol(symbol: string, project: ExampleProject): string {
  if (!symbol) return "读取位置的通配符；只有更具体的读取规则未命中时才使用。写入留空则保持实际读到的符号。";
  if (project.ruleGuide?.symbols[symbol]) return project.ruleGuide.symbols[symbol];
  if (symbol === project.blankSymbol) return "本程序的真正空白符：表示没有写入内容。它与其它数字或工作标记不同。";
  const lambda = symbol.match(/#\(λ\.([^)]+)\)/)?.[1];
  if (lambda) {
    const kind: Record<string, string> = {
      "app": "应用结构的起点", "app.sep": "函数与实参之间的结构边界", "app.end": "应用结构的结束边界",
      "abs.open": "λ 绑定结构的起点", "abs.end": "λ 函数体的结束边界", "char": "名称中的单个可见字符",
      "free.first": "自由变量名称的首字符", "bound.first": "受绑定变量名称的首字符", "name.end": "名称的结束位置",
      "name.pad": "名称后备用空位，用来写避开重名的数字后缀", "dot": "λ 绑定名与函数体的分隔点",
      "drop": "本次归约中准备删除的结构", "deleted": "已经删除、等待整理的格子",
    };
    const index = lambda.match(/^index\.(\d+)$/);
    return `${index ? `绑定距离 ${index[1]}；0 指最近一层 λ，用于区分同名但不同绑定的变量` : kind[lambda] ?? `λ 归约中的 ${lambda} 工作身份`}。可见部分为 ${show(visibleTapeSymbol(symbol))}；隐藏标记仍是符号的一部分，不会与同形字符混淆。`;
  }
  if (symbol.includes("#(")) return `完整符号为 ${show(symbol)}，可见部分是 ${show(visibleTapeSymbol(symbol))}。括号里的工作身份参与匹配，所以显示相同也可能是两个不同符号。`;
  if (symbol === "#") return project.campaignLevelId === "copy-with-divider" ? "原数与副本之间的分隔符；只从它左侧挑原始计数，防止重复复制新输出。" : "固定原点/边界标记；依靠它定位工作区，不能把它计入数值。";
  if (symbol === "|") return "寄存器分隔符。寄存器的编号由越过的分隔符数量决定；空寄存器也有自己的边界。";
  if (symbol === "X" || symbol === "Y") return `${symbol} 是已处理/正在处理的计数标记。用它区分原始数据与工作数据，防止重复消费；具体所属操作数见上面的算法步骤。`;
  if (symbol === "0" || symbol === "1") return `${symbol} 是本程序的普通数值字符；只有它恰好等于所设空白符时才表示未写入。`;
  if (["+", "-", "*", "/", "^", "~", "@", "?", "="].includes(symbol)) return `${show(symbol)} 是运算或工作区边界字符，不是一个数字位；扫描到它时应切换阶段或定位下一操作数。`;
  return `${show(symbol)} 是本程序实际读写的一个符号；多字符符号也可能只占一个纸带格。`;
}

function registerExplanation(rule: Transition, hint: string): RuleExplanation | undefined {
  const state = rule.fromState;
  const operation = /^(?:I\.[^.]+|p\.i[ab])\./i.test(state);
  const base = { purpose: hint || "定位并修改指定寄存器。", read: "", write: "", move: "", next: "" };
  if (operation && /\.(?:seek\d+|f\d+)$/.test(state)) return { ...base,
    purpose: "按分隔符计数定位指定寄存器，不能按遇到的第一个非零区猜位置。",
    read: rule.readSymbol === "1" ? "读到某个寄存器里的计数，还没跨到下一寄存器。" : "读到 |，说明跨过了一个寄存器边界。",
    write: "保持计数和分隔符原样；这一步只定位。", move: "向左继续穿过当前区或进入下一个编号的寄存器。",
    next: rule.toState === state ? "还在同一寄存器，继续扫描。" : "已经跨过一个分隔符，进入剩余边界计数少一的状态，或到达目标操作状态。" };
  if (operation && /\.(?:carryOne|carryBar|c1|cb)$/.test(state)) return { ...base,
    purpose: "加一需要扩展目标寄存器：把左侧内容逐格左移，保留原来的寄存器顺序。",
    read: "当前格的旧字符必须先记住，下一格还要用它。", write: "写入状态中携带的上一个字符；不能每格都写 1，否则会破坏分隔符。",
    move: rule.direction === "L" ? "左移，把刚读到的旧字符交给下一格。" : "读到外侧空白，已把最后一个携带字符放好，开始右移返回。",
    next: rule.readSymbol === "1" || rule.readSymbol === "|" ? `下一状态记住本次读到的 ${show(rule.readSymbol)}，继续搬移。` : "搬移完成，按原点返回后续指令。" };
  if (operation && /\.(?:putOne|putBar|p1|pb)$/.test(state)) return { ...base,
    purpose: "减一后将左侧相邻字符搬到刚产生的空洞。", read: "上一条已经把这个目标格清空，所以这里必须读到空白。",
    write: `把上条状态记住的 ${show(rule.writeSymbol)} 写回空洞，保留其它寄存器的内容和边界。`, move: "左移回刚才取走字符的格子。", next: "再越过这个新空洞，继续把剩余左侧内容向右收拢。" };
  if (operation && /\.(?:skipHole|h)$/.test(state)) return { ...base,
    purpose: "减一收拢过程中跳过刚刚腾出的空洞。", read: "当前格是刚取走字符留下的空白，不是整个寄存器区的终点。", write: "保持空白，不能凭空补一个计数。",
    move: "再左移一格，读下一待搬字符。", next: "继续收拢阶段。" };
  if (operation && /\.(?:take|t)$/.test(state)) return { ...base,
    purpose: "目标寄存器已减掉一格，现在收拢左侧纸带以保持分隔结构。", read: rule.readSymbol === "□" || rule.readSymbol === "_" ? "到达所有寄存器最外侧的空白，说明已经没有字符需要搬移。" : "取下一个计数或分隔符；两者都必须保留。",
    write: "将刚取走的格子留为空白，实际字符由下一状态记住。", move: "右移，准备把字符放入右邻空洞，或结束收拢开始返回原点。", next: "若取到 1/|，进入记住这个字符的写回状态；外侧空白则进入返回路径。" };
  if (operation && /\.(?:op|o)$/.test(state)) {
    if (rule.readSymbol === "1" && rule.writeSymbol === "1" && rule.direction === "L") return { ...base,
      purpose: "加一前寻找目标寄存器的左侧插入边界。", read: "1 仍属于这个寄存器的已有计数，还没到可以扩展的分隔符。", write: "保留这一个计数，不能靠覆盖已有的 1 来完成加一。", move: "向左继续找这个寄存器的分隔符。", next: "保持定位插入点的状态，读到 | 才开始扩展。" };
    if (rule.readSymbol === "1" && (rule.writeSymbol === "□" || rule.writeSymbol === "_")) return { ...base,
      read: "目标寄存器还有一个 1，所以非零分支可以执行减一。", write: "擦掉这个 1，数值恰好减少一。", move: "向左进入需要收拢的其余寄存器区。", next: "先修复这次删除产生的空洞，再返回非零分支。" };
    if (rule.readSymbol === "|") return { ...base,
      read: "到达目标操作位置后立即读到分隔符，若是减一/检查指令，说明该寄存器为 0；若是加一指令，这里就是插入点。",
      write: rule.writeSymbol === "|" ? "保留边界；零分支不能继续减。" : "将边界位置写成新增的 1；旧边界必须由后续搬移状态补回。",
      move: rule.direction === "N" ? "不移动，由返回例程负责定位原点。" : "左移腾挪原来的边界与其它计数。",
      next: rule.writeSymbol === "|" ? "进入零分支的返回路径。" : "下一状态携带旧分隔符，避免丢失寄存器边界。" };
  }
  if (/^(?:clean|c)\.\d+\.\d+$/.test(state)) return { ...base,
    purpose: "按编号清理寄存器，只保留结果寄存器，不能因某个寄存器为空就提前结束。",
    read: rule.readSymbol === "|" ? "读到边界，当前编号的寄存器清理完成。" : "读到当前编号寄存器的一个计数。",
    write: rule.writeSymbol === "1" ? "这一格属于结果寄存器，保留它。" : "它属于临时数据或分隔符，擦成空白；保留答案的决定由编号控制。",
    move: "左移遍历所有寄存器。", next: rule.readSymbol === "|" ? "切到下一个寄存器编号，或全部清理后的返回阶段。" : "保持当前寄存器编号，继续处理它的其余计数。" };
  if (/^(?:return|r)\.\d+$/.test(state) || /^(?:clean\.return|c\.r)\./.test(state)) return { ...base,
    purpose: "返回固定原点，零寄存器产生的空白也不能当作终点。", read: rule.readSymbol === "#" ? "# 是唯一可靠的原点标记。" : "当前只是计数、分隔符或空白，尚未到原点。",
    write: rule.writeSymbol === rule.readSymbol ? "原样保留，返回过程不改计数。" : "清理已结束，删除最后的原点界标。", move: rule.direction === "R" ? "向右寻找原点；空白寄存器同样要越过。" : rule.direction === "L" ? "已到原点，转向左侧定位保留下来的答案。" : "已到原点，不再移动。",
    next: rule.toState === state ? "继续寻找 #。" : "原点已找到，进入指定后续指令或答案定位阶段。" };
  return undefined;
}

function structuralExplanation(rule: Transition, project: ExampleProject, hint: string, sameState: boolean): RuleExplanation {
  const preserve = !rule.writeSymbol || rule.writeSymbol === rule.readSymbol;
  const blank = rule.readSymbol === project.blankSymbol;
  const erase = rule.writeSymbol === project.blankSymbol && !blank;
  const terminal = split(project.haltStates).includes(rule.toState) ? "普通停机" : split(project.acceptStates).includes(rule.toState) ? "接受" : split(project.rejectStates).includes(rule.toState) ? "拒绝" : undefined;
  const carry = /(?:^|\.)carry$/.test(rule.fromState), borrow = /(?:^|\.)borrow$/.test(rule.fromState);
  if (carry || borrow) return {
    purpose: carry ? "当前状态记住尚未处理的进位 1，正在从低位向高位传播。" : "当前状态记住尚未还清的借位 1，正在向高位寻找可借的 1。",
    read: carry ? rule.readSymbol === "1" ? "1 加进位 1 等于二进制 10，本位放不下。" : blank ? "已经越过最高位，仍有一个进位要写出。" : "0 加进位 1 等于 1，可以在本位消化进位。" : rule.readSymbol === "0" ? "0 无法直接减 1，需向高位借 2，本位因此成为 1。" : "遇到 1，可以还清当前借位。",
    write: `因此本位写 ${show(rule.writeSymbol)}。`, move: rule.direction === "L" ? "左移到下一高位，继续处理进位/借位。" : "进位/借位已处理完，不需要再走一格。",
    next: terminal ? `该次加一/减一已经完成，进入${terminal}状态。` : "仍有进位或借位，保留当前处理状态继续。",
  };
  return {
    purpose: hint || (sameState && preserve ? "沿同一阶段逐格扫描，寻找需要切换处理的符号或边界。" : `完成当前分支的一次局部修改，然后${terminal ? terminal : "衔接后续状态"}。`),
    read: !rule.readSymbol ? "只有当前状态中更具体的符号分支未命中时，才走这条默认规则；不是要求纸带上有一个星号。" : blank ? "读到真正空白，是这一分支用来识别边界或可写位置的条件；不能拿数字 0 来替代。" : `只有当前状态读到完整符号 ${show(rule.readSymbol)} 才进入此分支。${explainSymbol(rule.readSymbol, project)}`,
    write: preserve ? "保持当前实际读到的内容：此阶段只定位或选择分支，避免破坏后面还要用的数据。" : erase ? "擦成真正空白：这格数据已完成用途，需要删除或消耗；后面的规则必须负责剩余结构。" : `写成 ${show(rule.writeSymbol)}，将这一格变为后续阶段需要的内容或标记。${explainSymbol(rule.writeSymbol, project)}`,
    move: rule.direction === "N" ? "不移动：下一状态仍要从当前这一格接着判断；切换状态本身不会自动跳过一个字符。" : `向${rule.direction === "R" ? "右" : "左"}移动恰好一格，${sameState ? "继续同一方向扫描" : "把下一次读取交给新状态"}；写入发生在移动之前。`,
    next: terminal ? `此分支完成后进入${terminal}态，不再查找普通转移规则。` : sameState ? "仍用当前状态的规则处理下一格；这是循环，不是自动执行源码下一行。" : "切到下方目标状态；下一步按新状态和移动后读到的符号选规则，具体职责可点击目标状态继续查看。",
  };
}

export function buildRuleLessons(project: ExampleProject, numeric = false): RuleLessons {
  const options = { haltStates: split(project.haltStates), acceptStates: split(project.acceptStates), rejectStates: split(project.rejectStates) };
  const parsed = parseTransitions(project.rules, options);
  if (parsed.errors.length) throw new Error(parsed.errors[0]);
  const variant = numeric ? exampleVariant(project, "numeric", "original") : project;
  const viewed = numeric ? parseTransitions(variant.rules, options) : parsed;
  if (viewed.errors.length || viewed.transitions.length !== parsed.transitions.length) throw new Error("规则名称转换不完整，无法对齐讲解。");
  const hints = sourceHints(project.rules), groups = new Map<string, ExplainedState>(), incoming = new Map<string, Set<string>>();
  const functionNames = new Map(parsed.internalNames?.map(item => [item.actual, `${item.source}：${item.context}`]));
  const symbols = new Set<string>([project.blankSymbol]);
  let compilerRuleCount = 0;
  for (const [index, original] of parsed.transitions.entries()) {
    const rule = viewed.transitions[index];
    if (rule.readSymbol !== original.readSymbol || rule.writeSymbol !== original.writeSymbol || rule.direction !== original.direction) throw new Error("规则变体改变了读写顺序，不能直接套用原讲解。");
    const hint = hints.get(original.fromState) ?? [...hints].find(([state]) => original.fromState.startsWith(state + "."))?.[1] ?? "";
    const specific = project.ruleGuide?.rules[ruleGuideKey(original)];
    if (specific) compilerRuleCount++;
    const base = specific ?? registerExplanation(original, hint) ?? structuralExplanation(original, project, hint, original.toState === original.fromState);
    const functionContext = functionNames.get(original.fromState);
    const explanation = functionContext ? { ...base, contexts: [...(base.contexts ?? []), `函数所属与调用位置：${functionContext}`] } : base;
    const state = groups.get(rule.fromState) ?? { name: rule.fromState, original: original.fromState, rules: [], incoming: [] };
    state.rules.push({ rule, explanation, compilerExplained: Boolean(specific) }); groups.set(rule.fromState, state);
    if (!incoming.has(rule.toState)) incoming.set(rule.toState, new Set()); incoming.get(rule.toState)!.add(rule.fromState);
    if (rule.readSymbol) symbols.add(rule.readSymbol); if (rule.writeSymbol) symbols.add(rule.writeSymbol);
  }
  for (const state of groups.values()) state.incoming = [...(incoming.get(state.name) ?? [])];
  return { states: [...groups.values()], initial: resolveInitialState(viewed, variant.initialState), ruleCount: viewed.transitions.length, compilerRuleCount,
    symbols: [...symbols].map(symbol => ({ symbol, meaning: explainSymbol(symbol, project) })) };
}
