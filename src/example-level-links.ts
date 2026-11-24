export const existingExampleLevels: Record<string, string> = {
  unary: "unary-increment", binary: "binary-increment", unaryAdd: "unary-addition", unarySubtract: "unary-subtraction",
  unaryMultiply: "unary-product", unaryPower: "unary-power", unaryTetration: "unary-tetration", unaryPentation: "unary-pentation",
  binaryAdd: "binary-addition", binarySubtract: "binary-subtraction", binaryMultiply: "binary-multiplication",
  binaryDivide: "binary-division", binaryPower: "binary-power", binaryLog: "binary-logarithm",
  unaryRoot: "unary-integer-root", unaryLog: "unary-integer-log",
};

export const exampleLevelId = (id: string): string => existingExampleLevels[id] ?? `example-${id}`;
