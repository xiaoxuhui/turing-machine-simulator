interface Annotation {
  start: number;
  end: number;
  escaped: boolean;
}

const unchanged = (value: string) => value;

function annotations(text: string): Annotation[] {
  const result: Annotation[] = [];
  for (let start = text.indexOf("#("); start >= 0; start = text.indexOf("#(", start + 2)) {
    let end = start + 2;
    let depth = 1;
    while (end < text.length && depth > 0) {
      const char = text[end++];
      if (char === "(") depth++;
      if (char === ")") depth--;
    }
    if (depth > 0) break;
    let prefix = start;
    while (prefix > 0 && /[\\/]/.test(text[prefix - 1])) prefix--;
    result.push({ start, end, escaped: (start - prefix) % 2 === 1 });
    start = end - 2;
  }
  return result;
}

/** Hide punctuation inside annotations from the rule and function parsers. */
export function protectSymbolAnnotations(source: string) {
  if (!source.includes("#(")) return { text: source, restore: unchanged };
  const spans = annotations(source);
  if (!spans.length) return { text: source, restore: unchanged };
  let marker = "\uE000";
  while (source.includes(marker)) marker += "\uE000";
  let text = "", end = 0;
  const originals = spans.map((span, index) => {
    text += source.slice(end, span.start) + marker + index + marker;
    end = span.end;
    return source.slice(span.start, span.end);
  });
  text += source.slice(end);
  const restore = (value: string) => value.replace(new RegExp(marker + "(\\d+)" + marker, "g"), (_, index: string) => originals[Number(index)]);
  return { text, restore };
}

/** Only the tape label is shortened. The stored symbol stays intact. */
export function visibleTapeSymbol(symbol: string): string {
  if (!symbol.includes("#(")) return symbol;
  let visible = "", end = 0;
  for (const annotation of annotations(symbol)) {
    visible += symbol.slice(end, annotation.start - Number(annotation.escaped));
    if (annotation.escaped) visible += symbol.slice(annotation.start, annotation.end);
    end = annotation.end;
  }
  return visible + symbol.slice(end);
}

export function normalizeAnnotationEscapes(symbol: string): string {
  if (!symbol.includes("/#(")) return symbol;
  let end = 0, normalized = "";
  for (const annotation of annotations(symbol)) {
    if (!annotation.escaped || symbol[annotation.start - 1] !== "/") continue;
    normalized += symbol.slice(end, annotation.start - 1) + "\\";
    end = annotation.start;
  }
  return normalized + symbol.slice(end);
}

export function splitInputSymbols(input: string): string[] {
  if (!input.includes("#(")) return Array.from(input);
  const result: string[] = [];
  let end = 0;
  for (const annotation of annotations(input)) {
    for (const char of input.slice(end, annotation.start - Number(annotation.escaped))) result.push(char);
    const tag = input.slice(annotation.start, annotation.end);
    if (annotation.escaped) result.push("\\" + tag);
    else if (result.length) result[result.length - 1] += tag;
    else result.push(tag);
    end = annotation.end;
  }
  for (const char of input.slice(end)) result.push(char);
  return result;
}
