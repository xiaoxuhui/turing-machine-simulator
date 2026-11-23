import { makeLambdaProject } from "./lambda-local";

export const lambdaExample = makeLambdaProject("(λx.λy.x) y");
