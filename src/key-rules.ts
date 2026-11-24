import type { Transition } from "./core";
import type { ExampleProject } from "./examples";
import { buildRuleLessons, type ExplainedRule, type ExplainedState } from "./rule-lessons";

export interface KeyRules {
  states: Array<{ name: string; purpose: string }>;
  rules: Array<{ rule: Transition; reason: string }>;
}

/** Select algorithm landmarks rather than exposing the whole state directory. */
export function selectKeyRules(project: ExampleProject): KeyRules {
  const model = buildRuleLessons(project);
  const scan = model.states.find(state => state.name === "scan"), carry = model.states.find(state => state.name === "carry");
  if (scan && carry) {
    const examples: Array<[ExplainedState, string, string]> = [
      [scan, "1", "保持数位，向右寻找输入末尾；读到 0 时也是同样的扫描方式。"],
      [scan, project.blankSymbol, "遇到末尾空白后，左退一格到最低位，开始处理加一。"],
      [carry, "1", "1 加进位等于二进制 10：本位写 0，带着进位继续向左。"],
      [carry, "0", "0 加进位等于 1：写 1 后进位消失，直接停机。"],
      [carry, project.blankSymbol, "越过最高位仍有进位，就在左侧空白补一个 1 后停机。"],
    ];
    return {
      states: [{ name: scan.name, purpose: "向右找末尾，不修改原数。" }, { name: carry.name, purpose: "记住一个待处理的进位，从最低位向左传播。" }, { name: project.haltStates, purpose: "加一完成，停止执行。" }],
      rules: examples.flatMap(([state, read, reason]) => {
        const item = state.rules.find(item => item.rule.readSymbol === read);
        return item ? [{ rule: item.rule, reason }] : [];
      }),
    };
  }
  const chosen: ExplainedState[] = [];
  const add = (state: ExplainedState | undefined) => { if (state && !chosen.includes(state) && chosen.length < 6) chosen.push(state); };
  add(model.states.find(state => state.name === model.initial));
  for (const carry of ["c=0", "c=1"]) add(model.states.find(state => state.rules.some(item => item.explanation.purpose.includes("栈顶") && item.explanation.contexts?.some(context => context.includes(carry)))));
  add(model.states.find(state => state.rules.some(item => item.explanation.contexts?.some(context => /本位写/.test(context)) && item.explanation.purpose.startsWith("向 "))));
  for (const pattern of [/(?:^|\.)(?:carry|borrow|pick|pickA|pa|op|o)$/, /(?:^|\.)(?:scan|s|seek|end|erase|restore)$/, /^(?:lambda\.beta|B\.c|F\.c|clean\.0\.0|c\.0\.0)$/]) add(model.states.find(state => pattern.test(state.name)));
  add(model.states.find(state => state.rules.some(item => item.explanation.purpose.includes("最终输出追加"))));
  add(model.states.find(state => state.rules.some(item => item.rule.toState === project.haltStates || item.rule.toState === project.acceptStates)));
  const representative = (state: ExplainedState): ExplainedRule => state.rules.find(item => item.explanation.contexts?.some(context => /本位写/.test(context)))
    ?? state.rules.find(item => item.rule.writeSymbol !== item.rule.readSymbol)
    ?? state.rules.find(item => item.rule.toState !== item.rule.fromState) ?? state.rules[0];
  return {
    states: chosen.map(state => { const item = representative(state); return { name: state.name, purpose: item.explanation.contexts?.[0] ?? item.explanation.purpose }; }),
    rules: chosen.map(state => { const item = representative(state); return { rule: item.rule, reason: item.explanation.contexts?.find(context => /本位写/.test(context)) ?? item.explanation.purpose }; }),
  };
}
