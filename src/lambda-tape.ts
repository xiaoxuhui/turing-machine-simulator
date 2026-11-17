import { stackTapeBlank, TapeStackProgram } from "./tape-stack-program";

export type { TapeStack as LambdaStack } from "./tape-stack-program";

export const lambdaBlank = stackTapeBlank;
export const lambdaStart = "lambda.start";
export const lambdaAccept = "lambda.accept";
export const lambdaReject = "lambda.reject";
export const lambdaHalt = "lambda.halt";

const shortTokens: Record<string, string> = {
  app: "@", abs: "λ", close: ")", bound: "V", index: "1", end: ".", frame: "|",
  root: "Z", paren: "(", lambda: "λ", left: "L", right: "R",
};

export class LambdaTapeProgram extends TapeStackProgram {
  constructor() {
    super("lambda", "λ", lambdaAccept, lambdaReject, value =>
      value.startsWith("free.") ? value.slice(5) : shortTokens[value] ?? value);
  }
}
