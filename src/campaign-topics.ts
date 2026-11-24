import type { CampaignLevel } from "./campaign";

export const campaignTopics = [
  { id: "tape-basics", title: "基础读写与扫描", description: "入门 · 写入、移动、擦除与寻找边界", levelIds: ["write-one", "move-right-write", "erase-one", "erase-unary", "zeros-to-ones", "turn-back"] },
  { id: "binary-bits", title: "二进制位权与变换", description: "入门到进阶 · 位权、取反、移位、前导零与补码", levelIds: ["binary-complement", "binary-place-zero", "binary-place-one", "binary-shift-right", "binary-trim-zeros", "twos-complement"] },
  { id: "carry-borrow", title: "进位与借位", description: "入门到进阶 · 从单格加减一到连续进借位", levelIds: ["binary-carry-local", "binary-carry-chain", "binary-borrow-local", "binary-borrow-chain", "binary-increment", "binary-decrement"] },
  { id: "state-decisions", title: "状态记忆与条件判断", description: "入门到进阶 · 记住首位、奇偶与两端匹配", levelIds: ["copy-first-bit", "alternating-unary", "unary-parity", "binary-parity-bit", "example-palindrome", "example-unaryEven"] },
  { id: "function-basics", title: "函数定义与顺序调用", description: "入门 · 入口、正常完成、连续调用与组合", levelIds: ["function-wrap", "function-sequence", "example-functionBasics", "example-functions", "example-functionComposition"] },
  { id: "function-flow", title: "函数返回与作用域", description: "进阶 · 条件调用、ret、父子函数与公开状态", levelIds: ["function-conditional", "function-ret", "function-nested-repeat", "example-functionReturn", "example-functionParentReturn", "example-functionExportEntry", "example-functionExportRepeat", "example-functionExports", "example-functionMixed", "example-functionMixedContinue", "example-functionNestedNames"] },
  { id: "symbols-parameters", title: "符号、参数与通配规则", description: "进阶 · 默认值、星号转义、类型与通配分支", levelIds: ["example-functionStarDefaults", "example-functionTypedParameters", "example-functionOmittedFields", "example-functionStarLiterals", "example-functionWildcards"] },
  { id: "copy-registers", title: "复制与标记", description: "进阶 · 原数和副本分区、工作标记与还原计数", levelIds: ["copy-with-divider", "unary-double"] },
  { id: "unary-arithmetic", title: "一进制四则与比较", description: "入门到进阶 · 数量计数、重复相加与重复相减", levelIds: ["unary-increment", "unary-decrement", "unary-addition", "multiply-as-addition", "unary-subtraction", "unary-product", "unary-times-three", "example-unaryDivide", "example-unaryCompare"] },
  { id: "binary-arithmetic", title: "二进制四则运算", description: "进阶 · 逐位加减、移位乘法与长除法", levelIds: ["binary-addition", "binary-subtraction", "binary-multiplication", "binary-division"] },
  { id: "powers", title: "乘方与高阶运算", description: "高阶 · 平方、乘方、超幂与超超幂", levelIds: ["unary-square", "unary-power", "unary-tetration", "unary-pentation", "binary-power"] },
  { id: "inverse-operations", title: "根号、对数与逆运算", description: "高阶 · 取整、试算边界与高阶逆运算", levelIds: ["unary-integer-root", "unary-integer-log", "binary-logarithm", "example-unarySuperRoot", "example-unarySuperLog", "example-unaryPentaRoot", "example-unaryPentaLog"] },
  { id: "sequences", title: "数列生成", description: "综合 · 重复后缀与吉斯维杰特数列", levelIds: ["example-gijswijt"] },
  { id: "language-machines", title: "语言解释与机器模拟", description: "综合 · λ 归约、BF 与通用图灵机", levelIds: ["example-lambda", "example-brainfuck", "example-universal"] },
  { id: "conjectures", title: "猜想的给定输入验证", description: "综合 · 哥德巴赫分解与考拉兹轨迹", levelIds: ["example-goldbach", "example-collatz"] },
] as const;

export type CampaignTopic = typeof campaignTopics[number];
const topicByLevel = new Map<string, CampaignTopic>();
for (const topic of campaignTopics) for (const id of topic.levelIds) {
  if (topicByLevel.has(id)) throw new Error(`关卡重复分类：${id}`);
  topicByLevel.set(id, topic);
}
export function campaignTopicFor(level: Pick<CampaignLevel, "id">): CampaignTopic {
  const topic = topicByLevel.get(level.id);
  if (!topic) throw new Error(`关卡缺少主题分类：${level.id}`);
  return topic;
}
