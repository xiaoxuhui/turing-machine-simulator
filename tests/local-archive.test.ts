import { expect, it } from "vitest";
import { parseArchiveFile } from "../src/local-archive";

it("imports a history package containing unfinished drafts and retired-level solutions without normalizing them away", () => {
  const entries = [
    { kind: "draft", title: "未完成草稿", content: JSON.stringify({ version: 1, rules: "q0,□->" }) },
    { kind: "campaign", title: "旧进度", content: JSON.stringify({ version: 1, completedLevelIds: ["removed-level"], drafts: { "removed-level": "my original rules" } }) },
  ];
  expect(parseArchiveFile(JSON.stringify({ format: "turing-machine-local-archive", version: 1, entries }))).toEqual(entries);
});
it("accepts existing project and campaign exports as archive imports", () => {
  const project = { format: "turing-machine-simulator", version: 1, name: "我的项目", rules: "q0,□->" };
  expect(parseArchiveFile(JSON.stringify(project))).toEqual([{ kind: "project", title: "我的项目", content: JSON.stringify(project) }]);
  const progress = { version: 1, completedLevelIds: ["write-one"], drafts: {} };
  expect(parseArchiveFile(JSON.stringify({ format: "turing-machine-campaign", version: 1, progress }))[0]).toMatchObject({ kind: "campaign", content: JSON.stringify(progress) });
});
it("rejects malformed history entries before any import is written", () => {
  expect(() => parseArchiveFile("null")).toThrow();
  expect(() => parseArchiveFile('{"format":"unknown"}')).toThrow();
  expect(() => parseArchiveFile(JSON.stringify({ format: "turing-machine-local-archive", version: 1, entries: [{ kind: "project", title: "bad", content: "not JSON" }] }))).toThrow();
});
