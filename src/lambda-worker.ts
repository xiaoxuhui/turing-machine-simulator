import { reduceLambda } from "./lambda-reduce";

self.onmessage = (event: MessageEvent<{ input: string; singleStep: boolean; continuation: boolean }>) => {
  const { input, singleStep, continuation } = event.data;
  self.postMessage(reduceLambda(input, undefined, { singleStep, continuation }));
};
