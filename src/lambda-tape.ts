import { stackTapeBlank, TapeStackProgram } from "./tape-stack-program";

export type { TapeStack as LambdaStack } from "./tape-stack-program";

export const lambdaBlank = stackTapeBlank;
export const lambdaStart = "lambda.start";
export const lambdaAccept = "lambda.accept";
export const lambdaReject = "lambda.reject";
export const lambdaHalt = "lambda.halt";

export class LambdaTapeProgram extends TapeStackProgram {
  constructor() { super("lambda", "λ", lambdaAccept, lambdaReject); }
}
