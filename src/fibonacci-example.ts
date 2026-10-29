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
