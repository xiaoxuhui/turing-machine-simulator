import type { ExampleProject } from "./examples";

export const fibonacciExample: ExampleProject = {
  category: "一进制运算",
  name: "一进制斐波那契数列（持续生成）",
  description: "用户创作的 54 条规则：空纸带起步，0 分隔各项，连续 1 的长度表示 1、1、2、3、5…；X/Y 是计算标记，末尾工作段尚未完成。持续生成，不主动停机。",
  input: "",
  initialState: "fib.seedFirst",
  blankSymbol: "0",
  acceptStates: "",
  rejectStates: "",
  haltStates: "",
  maxSteps: null,
  rules: `# 写入最初两项 1 和 1，中间留下一个空白 0。
fib.seedFirst,0->fib.seedGap,1,R
fib.seedGap,0->fib.seedSecond,0,R
fib.seedSecond,0->fib.backToFirst,1,L
# 回到第一项，把它标成 X；第二项随后标成 Y。
fib.backToFirst,0->fib.backToFirst,0,L
fib.backToFirst,1->fib.markFirst,X,R
fib.markFirst,1->fib.markFirst,X,R
fib.markFirst,X->fib.markFirst,X,R
fib.markFirst,0->fib.markSecond,0,R
fib.markSecond,1->fib.markSecond,Y,R
fib.markSecond,Y->fib.markSecond,Y,R
fib.markSecond,0->fib.findOlderGap,0,L
# 从第二项左移，越过分隔，找到较早一项的左边界。
fib.findOlderGap,Y->fib.findOlderGap,Y,L
fib.findOlderGap,0->fib.findOlderStart,0,L
fib.findOlderStart,1->fib.enterOlder,1,R
fib.findOlderStart,X->fib.findOlderGap,X,L
fib.findOlderStart,0->fib.enterOlder,0,R
fib.enterOlder,0->fib.copyOlder,0,R
# 复制较早一项：每取一个 X 就还原成 1，并去最右端追加一个 Y。
fib.copyOlder,X->fib.crossOlder,1,R
fib.crossOlder,X->fib.crossOlder,X,R
fib.crossOlder,0->fib.scanAppend,0,R
fib.copyOlder,0->fib.copyNewer,0,R
# 越过 Y 段及其中的分隔；连续两个 0 才说明到达可追加的位置。
fib.scanAppend,0->fib.checkAppendGap,0,R
fib.scanAppend,Y->fib.scanAppend,Y,R
fib.checkAppendGap,Y->fib.scanAppend,Y,R
fib.checkAppendGap,0->fib.returnOlder,Y,L
# 向左返回较早一项，继续处理还未复制的 X。
fib.returnOlder,0->fib.returnOlder,0,L
fib.returnOlder,Y->fib.returnOlder,Y,L
fib.returnOlder,1->fib.copyOlder,1,R
fib.returnOlder,X->fib.findRestored,X,L
fib.findRestored,X->fib.findRestored,X,L
fib.findRestored,1->fib.takeOlder,1,R
fib.takeOlder,X->fib.scanTail,1,R
# 已有新结果时，越过剩余 X 和 Y，定位新结果的右端。
fib.scanTail,X->fib.scanTail,X,R
fib.scanTail,Y->fib.scanTail,Y,R
fib.scanTail,0->fib.checkTailGap,0,R
fib.checkTailGap,Y->fib.scanTail,Y,R
fib.checkTailGap,0->fib.appendOlder,0,L
fib.appendOlder,0->fib.returnOlder,Y,L
# 较早一项复制完毕。复制较新一项，把取过的 Y 改成下一轮要用的 X。
fib.copyNewer,Y->fib.scanNewerTail,X,R
fib.copyNewer,X->fib.copyNewer,X,R
fib.copyNewer,0->fib.scanNewerTail,0,R
fib.scanNewerTail,Y->fib.scanNewerTail,Y,R
fib.scanNewerTail,0->fib.checkNewerGap,0,R
fib.checkNewerGap,Y->fib.scanNewerTail,Y,R
fib.checkNewerGap,0->fib.appendNewer,0,L
fib.appendNewer,0->fib.returnNewerGap,Y,L
# 每追加一个 Y，回到较新一项的 X/Y 交界，判断是否还有 Y 尚未复制。
fib.returnNewerGap,Y->fib.returnNewerGap,Y,L
fib.returnNewerGap,0->fib.findNewerMark,0,L
fib.findNewerMark,Y->fib.findNewerMark,Y,L
fib.findNewerMark,X->fib.checkNewerEnd,X,R
fib.checkNewerEnd,0->fib.rewindNewer,0,L
fib.checkNewerEnd,Y->fib.copyNewer,Y,L
# 新项长度等于前两项之和；X 是新的前项，Y 是新项，回到左边开始下一轮。
fib.rewindNewer,X->fib.rewindNewer,X,L
fib.rewindNewer,0->fib.copyOlder,0,R`,
};

const phaseNames = ["初始化", "标记两项", "复制前项", "复制后项"] as const;
const states: Record<string, readonly [string, number]> = {
  "fib.seedFirst": ["0.0", 0], "fib.seedGap": ["0.1", 0], "fib.seedSecond": ["0.2", 0], "fib.backToFirst": ["0.3", 0],
  "fib.markFirst": ["1.1.1", 1], "fib.markSecond": ["1.1.2", 1], "fib.findOlderGap": ["1.2.1.1", 1],
  "fib.findOlderStart": ["1.2.1.1.1", 1], "fib.enterOlder": ["1.2.1.2", 1],
  "fib.copyOlder": ["1.2.1.3", 2], "fib.crossOlder": ["1.2.1.3.1", 2], "fib.scanAppend": ["1.2.1.4", 2],
  "fib.checkAppendGap": ["1.2.1.4.1", 2], "fib.returnOlder": ["1.2.1.5", 2], "fib.findRestored": ["1.2.1.6", 2],
  "fib.takeOlder": ["1.2.1.7", 2], "fib.scanTail": ["1.2.1.8", 2], "fib.checkTailGap": ["1.2.1.8.1", 2], "fib.appendOlder": ["1.2.1.8.2", 2],
  "fib.copyNewer": ["1.2.2.1", 3], "fib.scanNewerTail": ["1.2.2.2", 3], "fib.checkNewerGap": ["1.2.2.2.1", 3],
  "fib.appendNewer": ["1.2.2.2.2", 3], "fib.returnNewerGap": ["1.2.2.3", 3], "fib.findNewerMark": ["1.2.2.4", 3],
  "fib.checkNewerEnd": ["1.2.2.5", 3], "fib.rewindNewer": ["1.2.2.6", 3],
};

export function fibonacciSourceVariant(names: "descriptive" | "numeric", structure: "flat" | "functions"): ExampleProject {
  const local = (state: string) => names === "numeric" ? states[state][0] : state;
  const sections = phaseNames.map(() => [] as string[]);
  const plain: string[] = [];
  let comments: string[] = [];
  for (const line of fibonacciExample.rules.split("\n")) {
    if (line.startsWith("#")) { comments.push(line); continue; }
    const match = line.match(/^([^,]+),(.+?)->([^,]+),(.+?),([LRN])$/)!;
    const [, from, read, to, write, direction] = match;
    const phase = states[from][1];
    const target = states[to][1] === phase ? local(to) : `${phaseNames[states[to][1]]}.${local(to)}`;
    plain.push(...comments, `${local(from)},${read}->${local(to)},${write},${direction}`);
    sections[phase].push(...comments, `${local(from)},${read}->${target},${write},${direction}`);
    comments = [];
  }
  const rules = structure === "flat" ? plain.join("\n") : sections.map((lines, phase) => {
    const locals = Object.keys(states).filter(state => states[state][1] === phase).map(local);
    return `${phaseNames[phase]}(${locals[0]},完成):\n${lines.map(line => `    ${line}`).join("\n")}\n    导出状态 ${locals.join(",")}`;
  }).join("\n\n") + "\n\n初始化";
  return {
    ...fibonacciExample, rules,
    initialState: structure === "functions" ? "初始化" : local("fib.seedFirst"),
    haltStates: structure === "functions" ? "HALT" : "",
    description: `${fibonacciExample.description} 当前为${names === "numeric" ? "原始数字状态" : "用途状态名"}、${structure === "functions" ? "四阶段函数版，阶段间通过公开状态连接" : "无函数版"}。`,
  };
}
