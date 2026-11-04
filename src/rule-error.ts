export function transitionFormatError(line: string): string {
  if (/->[^,]+,[^,]+\.[LRNlrn]$/.test(line.trim())) return "写入符号和移动方向之间要用逗号，例如 l,L；不能写成 l.L";
  return "格式错误；使用 状态,读取->下一状态,写入,L/R/N；写入留空保留读取符号，移动留空默认 N（不移动），两项可分别省略";
}
