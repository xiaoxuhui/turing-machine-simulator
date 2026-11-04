export function transitionFormatError(line: string): string {
  if (/->[^,]+,[^,]+\.[LRNlrn]$/.test(line.trim())) return "写入符号和移动方向之间要用逗号，例如 l,L；不能写成 l.L";
  return "格式错误；使用 状态,读取->下一状态,写入,L/R/N/*，或 状态->目标 无条件简写；当前状态或读取留空/* 表示任意，写入 * 保持符号，移动 * 不移动，字面星号写 **；单字段 R/L 优先为移动，下一状态必须填写";
}
