export function transitionFormatError(line: string): string {
  if (/->[^,]+,[^,]+\.[LRNlrn]$/.test(line.trim())) return "写入符号和移动方向之间要用逗号，例如 l,L；不能写成 l.L";
  return "格式错误；使用 状态,读取->下一状态,写入,L/R/N；调用函数可写 状态,读取->函数名";
}
