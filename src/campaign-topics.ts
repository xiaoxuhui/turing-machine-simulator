import type { CampaignLevel } from "./campaign";
import { campaignLevelOrder } from "./campaign-order";

// Chapters label continuous ranges of the historical route; they never sort it.
const chapterBoundaries = [
  ["tape-basics", "读写、移动与计数入门", "unary-decrement"],
  ["binary-basics", "符号改写、位权与回头扫描", "turn-back"],
  ["carry-borrow", "进位、借位与二进制加一", "binary-increment"],
  ["function-intro", "函数入门与控制流程", "function-ret"],
  ["arithmetic-intro", "加法与乘法入门", "multiply-as-addition"],
  ["function-basics", "函数调用与组合练习", "example-functionComposition"],
  ["function-flow", "函数返回、公开状态与续行", "example-functionMixedContinue"],
  ["symbols-parameters", "默认值、参数、通配与调用路径", "example-functionNestedNames"],
  ["state-decisions", "状态记忆与条件判断", "unary-parity"],
  ["arithmetic-copy", "抵消、重复相加与复制", "unary-times-three"],
  ["binary-arithmetic", "二进制整理与四则运算", "binary-division"],
  ["challenge-integration", "函数、判断与除法综合练习", "example-unaryDivide"],
  ["advanced-counting", "补码与翻倍", "unary-double"],
  ["powers", "乘方、高阶运算与二进制对数", "binary-logarithm"],
  ["inverse-operations", "整数开根与对数", "unary-integer-log"],
  ["language-machines", "λ 归约与 BF 解释", "example-brainfuck"],
  ["advanced-inverses", "高阶整数逆运算", "example-unaryPentaLog"],
  ["conjectures", "猜想的给定输入验证", "example-collatz"],
  ["sequences", "无限十进制数列生成", "example-fibonacciDecimal"],
  ["universal-machine", "通用图灵机", "example-universal"],
] as const;

let chapterStart = 0;
export const campaignTopics = chapterBoundaries.map(([id, title, lastLevel]) => {
  const end = campaignLevelOrder.indexOf(lastLevel) + 1;
  if (end <= chapterStart) throw new Error(`章节边界顺序错误：${id}`);
  const start = chapterStart;
  chapterStart = end;
  return { id, title, description: `第 ${start + 1}～${end} 关 · 按原顺序学习`, levelIds: campaignLevelOrder.slice(start, end) };
});
if (chapterStart !== campaignLevelOrder.length) throw new Error("章节未覆盖完整学习路线。");

export type CampaignTopic = typeof campaignTopics[number];
const topicByLevel = new Map<string, CampaignTopic>();
for (const topic of campaignTopics) for (const id of topic.levelIds) {
  if (topicByLevel.has(id)) throw new Error(`关卡重复分类：${id}`);
  topicByLevel.set(id, topic);
}
export function campaignTopicFor(level: Pick<CampaignLevel, "id">): CampaignTopic {
  const topic = topicByLevel.get(level.id);
  if (!topic) throw new Error(`关卡缺少章节：${level.id}`);
  return topic;
}

/** Order comes from the historical route, independently of chapter labels. */
export function orderCampaignLevels<T extends Pick<CampaignLevel, "id">>(levels: readonly T[]): T[] {
  const byId = new Map(levels.map(level => [level.id, level]));
  if (byId.size !== levels.length) throw new Error("学习路线中存在重复关卡。");
  const known = new Set(campaignLevelOrder);
  for (const level of levels) if (!known.has(level.id)) throw new Error(`关卡尚未安排学习位置：${level.id}`);
  return campaignLevelOrder.map(id => byId.get(id)).filter((level): level is T => level !== undefined);
}
