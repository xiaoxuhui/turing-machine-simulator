import type { Direction, Transition } from "./core";
import { formatTransition } from "./rule-format";
import { ruleGuideKey, type RuleExplanation, type RuleGuide } from "./rule-guide";

// Stack entries share one paper tape. Each entry records its stack and value.
// The newest entry is on the left. A pop leaves a reusable hole at the left edge
// once every entry ahead of it has been removed.
export const stackTapeBlank = "□";

export interface TapeStack {
  name: string;
  values: readonly string[];
}

export class TapeStackProgram {
  private readonly source: Array<string | Transition> = [];
  private readonly states = new Map<string, Transition[]>();
  private readonly returns = new Set<string>();
  private count = 0;
  private readonly origin: string;
  private readonly hole: string;
  private readonly consumed: string;
  readonly ruleGuide: RuleGuide = { rules: {}, symbols: {} };
  private readonly explanations = new Map<string, (rule: Transition) => RuleExplanation>();
  private readonly contexts = new Map<string, string>();
  private readonly stackNames = new Map<string, string>();

  constructor(private readonly prefix: string, private readonly code: string, private readonly terminal: string, private readonly reject: string, private readonly shortToken = (value: string) => value, private readonly blank = stackTapeBlank) {
    this.origin = `#(${code}.o)#`;
    this.hole = `#(${code}.g)·`;
    this.consumed = `#(${code}.r)×`;
    this.ruleGuide.symbols[this.origin] = "原点界标：工作区在它左边，输入和最终输出在它右边；不是操作数的一个数字。";
    this.ruleGuide.symbols[this.hole] = "已取走的栈项留下的占位格；继续查找时跳过，返回工作区左端时可回收成空白。";
    this.ruleGuide.symbols[this.consumed] = "已读入的原始输入字符；防止下一轮再次把它读入。";
    this.ruleGuide.symbols[blank] = "真正的未写入格。工作区左边始终保留一个空白格，供追加新栈项；二进制数字 0 与它不同。";
  }

  describe(state: string, context: string): string { this.contexts.set(state, context); return state; }
  describeStack(stack: TapeStack, meaning: string): void { this.stackNames.set(stack.name, meaning); }
  private stackName(stack: TapeStack): string { return `${stack.name}（${this.stackNames.get(stack.name) ?? "临时栈"}）`; }
  private explain(state: string, explanation: (rule: Transition) => RuleExplanation): void { this.explanations.set(state, explanation); }

  get start(): string { return `${this.prefix}.start`; }
  get end(): string { return `${this.code}.e`; }
  label(): string { return `${this.code}.${this.count++}`; }

  private rule(from: string, read: string, to: string, write = read, direction: Direction = "N"): void {
    const rule = { fromState: from, readSymbol: read, toState: to, writeSymbol: write, direction };
    this.source.push(rule);
    const state = this.states.get(from);
    if (state) state.push(rule);
    else this.states.set(from, [rule]);
  }

  private entry(stack: TapeStack, value: string): string {
    const symbol = `#(${stack.name})${value === " " ? "␠" : this.shortToken(value)}`;
    this.ruleGuide.symbols[symbol] = `属于 ${this.stackName(stack)} 的值 ${JSON.stringify(value)}。括号里的栈身份也参与匹配；它与其它栈里显示相同的字符仍是不同符号。`;
    return symbol;
  }

  note(message: string): void { this.source.push(`# ${message}`); }

  jump(from: string, next: string): string {
    this.explain(from, () => ({ purpose: "在工作区左边界衔接两个操作。", read: "当前应位于预留空白格；这里用空白确认工作位置。", write: "原样保留空白，不修改任何数值。", move: "不移动：后续操作也约定从这个位置开始。", next: "进入已编排的下一操作，不额外做一次取数或计算。" }));
    this.rule(from, this.blank, next);
    return from;
  }

  push(stack: TapeStack, value: string, next: string, from = this.label()): string {
    this.explain(from, () => ({ purpose: `向 ${this.stackName(stack)} 压入值 ${JSON.stringify(value)}。`, read: "读到预留空白，说明可以在工作区左端安全增加一项，不会覆盖已有数据。", write: `写入带 ${stack.name} 身份的 ${JSON.stringify(value)}，让以后的取数能找到正确的栈。`, move: "向左一格：新项已经写好，左边空白成为下一操作的起点。", next: "压入完成，进入指定后续阶段。" }));
    this.rule(from, this.blank, next, this.entry(stack, value), "L");
    return from;
  }

  take(stack: TapeStack, cases: (value: string) => string, empty: string, from = this.label(), keep = false): string {
    const seek = `${from}.s`;
    this.explain(from, () => ({ purpose: `${keep ? "查看" : "取出"} ${this.stackName(stack)} 的栈顶。`, read: "空白是当前工作区左边界；还没读取到要取的数字。", write: "保留边界空白，不能把它当成二进制 0。", move: "向右进入工作区；最新写入的栈项在左端，向右找才能先遇到栈顶。", next: "进入扫描状态，寻找这个栈的第一个尚未取走的项。" }));
    this.explain(seek, rule => {
      if (rule.readSymbol === this.origin) return { purpose: `判断 ${this.stackName(stack)} 是否为空。`, read: `一直找到原点仍未遇到 ${stack.name} 的项，说明这个栈已经没有剩余。`, write: "保留原点：其它栈与最终输出仍靠它定位。", move: "向左返回工作区，不能越过原点去读取输出区。", next: "沿返回路径回到工作区左端，再进入“栈空”分支。" };
      if (!rule.readSymbol) return { purpose: `跳过不属于 ${this.stackName(stack)} 的格子。`, read: "这是未命中具体栈项或原点规则时才用的通配分支；其它栈项和占位格都不是本次要取的值。", write: "保持实际读到的符号，保护其它栈和还没处理的数据。", move: "继续向右逐格寻找，不能把其它栈的 0/1 当成本栈数字。", next: "保持扫描状态，直到找到本栈栈顶或原点。" };
      const value = stack.values.find(value => this.entry(stack, value) === rule.readSymbol)!;
      const replaced = !keep && rule.writeSymbol !== this.hole;
      return { purpose: `${keep ? "读取但保留" : replaced ? "原位替换" : "取出"} ${this.stackName(stack)} 的值 ${JSON.stringify(value)}。`, read: `完整符号同时包含栈名 ${stack.name} 和值 ${JSON.stringify(value)}；它是从左向右遇到的首个匹配项。`, write: keep ? "保留该项，因为这是查看操作，不应消耗它。" : replaced ? "紧接着要向同一栈写回新值，因此直接原位替换，省去删除、搬运、重写的往返。" : "写占位标记表示这项已被取走，避免下次重复处理；暂不写成空白，以免被误认成工作区边界。", move: "向左返回工作区左端。读取的值已经由所选分支状态记住，不必带在读写头格子里。", next: "先完成返回与回收，再执行对应这个值的后续操作。" };
    });
    this.rule(from, this.blank, seek, this.blank, "R");
    this.rule(seek, "", seek, "", "R");
    const backTo = (next: string) => {
      const back = `${next}.b`, trim = `${next}.t`;
      this.explain(back, rule => ({ purpose: "取数后返回工作区左边界。", read: rule.readSymbol ? "读到空白，说明已经越过所有现存的工作项。" : "还在经过工作项或占位格；该通配规则只在没有命中空白分支时使用。", write: "保持原内容，返回过程不做算术，也不删除别的栈。", move: rule.readSymbol ? "向右一格重新进入工作区，准备回收左端空洞。" : "继续向左，寻找预留空白格。", next: rule.readSymbol ? "切入回收状态，整理起点后才恢复后续操作。" : "继续同一个返回循环。" }));
      this.explain(trim, rule => ({ purpose: "回收工作区左端已经用完的项。", read: rule.readSymbol === this.hole ? "当前是已取走的占位项；位于左端，所以现在可以安全回收。" : "遇到第一个不能回收的格子，说明左端整理完成。", write: rule.readSymbol === this.hole ? "擦成真正空白，为后面的压入腾出空间。" : "保留这个仍在使用的项，不能一起擦掉。", move: rule.readSymbol === this.hole ? "继续向右，回收连续的已用格。" : "向左回到刚腾出的空白，恢复各操作统一的起点。", next: rule.readSymbol === this.hole ? "继续回收；这不是丢弃后面仍有效的数据。" : "进入已经记住本次取值结果的后续分支。" }));
      if (!this.returns.has(next)) {
        this.returns.add(next);
        this.rule(back, "", back, "", "L");
        this.rule(back, this.blank, trim, this.blank, "R");
        this.rule(trim, "", next, "", "L");
        this.rule(trim, this.hole, trim, this.blank, "R");
      }
      return back;
    };
    this.rule(seek, this.origin, backTo(empty), this.origin, "L");
    const entries = new Set(stack.values.map(value => this.entry(stack, value)));
    for (const value of stack.values) {
      const entry = this.entry(stack, value);
      const next = cases(value);
      const replacement = this.states.get(next);
      // A pop immediately followed by a push to the same stack is an in-place
      // replacement. Preserve its position instead of erasing and carrying it
      // to the far edge of the tape before writing it again.
      const put = !keep && replacement?.length === 1 ? replacement[0] : undefined;
      if (put && put.readSymbol === this.blank && put.direction === "L" && entries.has(put.writeSymbol)) {
        this.rule(seek, entry, backTo(put.toState), put.writeSymbol, "L");
      } else this.rule(seek, entry, backTo(next), keep ? entry : this.hole, "L");
    }
    return from;
  }

  peek(stack: TapeStack, cases: (value: string) => string, empty: string): string {
    return this.take(stack, cases, empty, this.label(), true);
  }

  move(from: TapeStack, to: TapeStack, next: string): string {
    const loop = this.label();
    return this.take(from, value => this.push(to, value, loop), next, loop);
  }

  clear(stack: TapeStack, next: string): string {
    const loop = this.label();
    return this.take(stack, () => loop, next, loop);
  }

  readInput(stack: TapeStack, next: string, rejectUnknown = true): void {
    const scan = `${this.code}.i`, rewind = `${scan}.r`, ready = `${scan}.f`;
    const mark = `${scan}.o`, back = `${scan}.b`;
    this.explain(this.start, () => ({ purpose: "在不破坏输入的情况下，给工作区建立原点。", read: "允许初始读到任意符号，当前格属于用户输入。", write: "保持输入原样；这一条尚未进行算术。", move: "左移到输入前一格，给原点界标留位置。", next: "下一状态只负责在这格空白处写原点。" }));
    this.explain(mark, () => ({ purpose: "标记固定的原点位置。", read: "输入左邻格应为空白，可安全放界标。", write: "写原点标记，分隔左侧工作区和右侧输入/输出。", move: "右移，回到第一个输入字符。", next: "开始扫描并逐个搬入原始输入。" }));
    this.explain(scan, rule => {
      if (!rule.readSymbol) return { purpose: "阻止非法输入进入数位栈。", read: "具体合法字符、已读标记和输入结尾都有专门分支；本条只处理剩下的未知字符。", write: "保留原字符，便于定位错误。", move: "不移动：错误已经确认，无需继续扫描。", next: "进入拒绝状态；这是格式不合法，不是算出一个负结果。" };
      if (rule.readSymbol === this.blank) return { purpose: "结束原始输入的搬入。", read: "右侧第一个空白就是输入结尾；数字 0 有另一条具体规则。", write: "保留空白，不额外插入一个数位。", move: "向左，准备清掉输入中已消费的标记。", next: "进入输入清理阶段，然后才开始分离操作数。" };
      if (rule.readSymbol === this.consumed) return { purpose: "跨过已经搬入过的输入。", read: "标记表示这个字符已经保存到原始输入栈，不能再次搬入。", write: "保留已读标记，让以后回到这里时仍知道它已处理。", move: "继续向右找下一个未读字符。", next: "保持输入扫描状态。" };
      return { purpose: `搬入原始输入字符 ${JSON.stringify(rule.readSymbol)}。`, read: "这是合法输入字符；本阶段只保存它，不马上执行加减。", write: "将原位置写成已读标记，防止重复读取。原字符值由所选分支记住。", move: "向左去工作区，准备把这个值压入输入栈。", next: "进入记住该字符值的搬运状态。" };
    });
    this.explain(rewind, rule => ({ purpose: "清除已经搬入的右侧原始输入。", read: rule.readSymbol === this.origin ? "读到原点，说明右侧输入已经擦完。" : "这格已读输入已经有栈内副本，可以删除原位置。", write: rule.readSymbol === this.origin ? "保留原点，后面输出仍要用到。" : "写空白，释放右侧区域给最后的答案。", move: "向左一格，沿清理方向返回工作区。", next: rule.readSymbol === this.origin ? "进入寻找工作区左端的状态。" : "继续向左擦除已读标记。" }));
    this.explain(ready, rule => ({ purpose: "为后续栈操作对齐读写头起点。", read: rule.readSymbol ? "空白表示已到工作区左端。" : "正在越过搬入的输入栈项。", write: "不改栈项，保持刚读入的数据。", move: rule.readSymbol ? "不移动，下一操作就从这格空白开始。" : "继续向左找工作区边界。", next: rule.readSymbol ? "输入已准备好，进入指定后续阶段。" : "继续定位左边界。" }));
    this.explain(back, rule => ({ purpose: "保存一项输入后回到原输入扫描位置。", read: rule.readSymbol === this.origin ? "原点将工作区和原输入分开，越过它才回到输入区。" : "当前是工作项或已读输入；还没到原点。", write: "保留所有已保存数据与原点。", move: "向右寻找原点或越过原点回到输入。", next: rule.readSymbol === this.origin ? "恢复输入扫描，跳过已读标记后搬下一个字符。" : "继续寻找原点。" }));
    this.rule(this.start, "", mark, "", "L");
    this.rule(mark, this.blank, scan, this.origin, "R");
    if (rejectUnknown) this.rule(scan, "", this.reject);
    this.rule(scan, this.consumed, scan, this.consumed, "R");
    this.rule(scan, this.blank, rewind, this.blank, "L");
    this.rule(rewind, this.consumed, rewind, this.blank, "L");
    this.rule(rewind, this.origin, ready, this.origin, "L");
    this.rule(ready, "", ready, "", "L");
    this.rule(ready, this.blank, next);
    for (const [index, value] of stack.values.entries()) {
      const put = `${scan}.${index}`;
      this.explain(put, rule => ({ purpose: `把已经记住的输入值 ${JSON.stringify(value)} 保存到 ${this.stackName(stack)}。`, read: rule.readSymbol ? "工作区左端的空白可放新栈项。" : "当前还在已有数据上，不能覆盖它。", write: rule.readSymbol ? `写入带 ${stack.name} 身份的 ${JSON.stringify(value)}，原始字符至此得到保存。` : "保持已有数据，继续寻找可写空白。", move: rule.readSymbol ? "右移开始回到原输入区。" : "继续向左找工作区边界。", next: rule.readSymbol ? "进入返回原点的状态，再扫描下一个输入字符。" : "保留记住的字符值，继续寻找写入位置。" }));
      this.rule(scan, value, put, this.consumed, "L");
      if (value === " ") {
        for (const space of ["\u3000", "\u00a0", "\t"]) this.rule(scan, space, put, this.consumed, "L");
      }
      this.rule(put, "", put, "", "L");
      this.rule(put, this.blank, back, this.entry(stack, value), "R");
    }
    this.rule(back, "", back, "", "R");
    this.rule(back, this.origin, scan, this.origin, "R");
  }

  // Append a character to the result on the right of the origin, then resume at the left edge.
  emit(value: string, next: string): string {
    const from = this.label(), seek = `${from}.os`, end = `${from}.oe`, back = `${from}.ob`;
    this.explain(from, () => ({ purpose: `向最终输出追加 ${JSON.stringify(value)}。`, read: "目前位于工作区左边界空白，结果值已由状态确定。", write: "保留边界，输出要写在原点右侧。", move: "向右穿过工作区。", next: "先找原点，再找输出末尾。" }));
    this.explain(seek, rule => ({ purpose: "从工作区定位最终输出区。", read: rule.readSymbol === this.origin ? "原点右边才是最终输出。" : "还在工作区，里面的数字不能当作最终答案末尾。", write: "保留界标与全部工作项。", move: "向右寻找或越过原点。", next: rule.readSymbol === this.origin ? "开始扫描输出末尾。" : "继续寻找原点。" }));
    this.explain(end, rule => ({ purpose: `追加确定的输出值 ${JSON.stringify(value)}。`, read: rule.readSymbol ? "空白表示已有输出的末尾，可写下一字符。" : "当前已有一个输出字符，不能覆盖。", write: rule.readSymbol ? `写 ${JSON.stringify(value)}；这是输出的原始字符，不带工作栈身份。` : "保留已经输出的字符。", move: rule.readSymbol ? "左移返回工作区，准备处理下一输出位。" : "继续向右找输出末尾。", next: rule.readSymbol ? "输出一个字符完成，进入返回阶段。" : "继续扫描已有答案。" }));
    this.explain(back, rule => ({ purpose: "追加输出后返回工作区。", read: rule.readSymbol === this.origin ? "已返回原点，下一格向左进入工作区。" : "当前仍在输出字符或数据上。", write: "保持已输出答案，不在返回时擦除。", move: "持续左移。", next: rule.readSymbol === this.origin ? "继续找到工作区左端，再恢复指定操作。" : "继续返回原点。" }));
    this.rule(from, this.blank, seek, this.blank, "R");
    this.rule(seek, "", seek, "", "R");
    this.rule(seek, this.origin, end, this.origin, "R");
    this.rule(end, "", end, "", "R");
    this.rule(end, this.blank, back, value, "L");
    this.rule(back, "", back, "", "L");
    const resume = `${next}.or`;
    this.explain(resume, rule => ({ purpose: "输出后对齐下一操作的工作区起点。", read: rule.readSymbol ? "空白表示已到左边界。" : "当前仍经过有效工作项。", write: "保留数据和边界。", move: rule.readSymbol ? "不移动，下一操作也从这格空白开始。" : "继续向左定位。", next: rule.readSymbol ? "恢复输出调用者的后续阶段。" : "继续寻找左边界。" }));
    this.rule(back, this.origin, resume, this.origin, "L");
    if (!this.returns.has(resume)) {
      this.returns.add(resume);
      this.rule(resume, "", resume, "", "L");
      this.rule(resume, this.blank, next);
    }
    return from;
  }

  finish(): string {
    const clean = `${this.code}.c`;
    this.explain(this.end, () => ({ purpose: "全部输出已完成，开始清理工作区。", read: "确认目前在工作区左端空白。", write: "保留边界空白。", move: "右移，逐格擦除不再需要的工作项。", next: "进入最后的清理状态。" }));
    this.explain(clean, rule => ({ purpose: "只留下原点右侧的最终答案。", read: rule.readSymbol === this.origin ? "原点是工作区右边界，不能越过去继续擦答案。" : "当前仍是工作区里的临时数据或占位格。", write: "写空白，删除已经不再需要的工作标记。", move: "向右一格；原点规则恰好把头送到答案开头。", next: rule.readSymbol === this.origin ? "原点也已删除，进入普通停机态。" : "继续清理，直到原点。" }));
    this.rule(this.end, this.blank, clean, this.blank, "R");
    this.rule(clean, "", clean, this.blank, "R");
    this.rule(clean, this.origin, this.terminal, this.blank, "R");
    // Merge states only if every read, write, move and destination agrees.
    // Begin with the immediate tape effects, then refine by destination class.
    const reachable = new Set([this.start]);
    for (const state of reachable) for (const rule of this.states.get(state) ?? []) reachable.add(rule.toState);
    const blocks = [...this.states].filter(([state]) => reachable.has(state) && state !== this.start);
    const effects = blocks.map(([, rules]) => JSON.stringify(rules.map(rule => [rule.readSymbol, rule.writeSymbol, rule.direction])));
    let classes = new Map<string, number>();
    let count = 0;
    while (true) {
      const bySignature = new Map<string, number>();
      const refined = new Map<string, number>();
      for (const [index, [state, rules]] of blocks.entries()) {
        const signature = effects[index] + JSON.stringify(rules.map(rule => classes.get(rule.toState) ?? (classes.size ? rule.toState : "")));
        if (!bySignature.has(signature)) bySignature.set(signature, bySignature.size);
        refined.set(state, bySignature.get(signature)!);
      }
      classes = refined;
      if (count === bySignature.size) break;
      count = bySignature.size;
    }
    const representatives = new Map<number, string>();
    for (const [state, group] of classes) if (!representatives.has(group)) representatives.set(group, state);
    const name = (state: string) => representatives.get(classes.get(state)!) ?? state;
    for (const original of this.source) {
      if (typeof original === "string" || !reachable.has(original.fromState)) continue;
      const rule = { ...original, fromState: name(original.fromState), toState: name(original.toState) };
      const explanation = this.explanations.get(original.fromState)?.(original);
      if (!explanation) continue;
      const contexts = [...this.contexts].filter(([state]) => original.fromState === state || original.fromState.startsWith(state + ".")).map(([, context]) => context);
      const key = ruleGuideKey(rule), previous = this.ruleGuide.rules[key];
      if (!previous) this.ruleGuide.rules[key] = { ...explanation, contexts };
      else previous.contexts = [...new Set([...(previous.contexts ?? []), ...contexts])];
    }
    return this.source.flatMap(rule => {
      if (typeof rule === "string") return [rule];
      if (!reachable.has(rule.fromState) || name(rule.fromState) !== rule.fromState) return [];
      return [formatTransition({ ...rule, toState: name(rule.toState) })];
    }).join("\n");
  }
}
