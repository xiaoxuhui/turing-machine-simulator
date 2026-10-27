import { expect, it } from "vitest";
import { editorFields, loadEditorDraft, saveEditorDraft } from "../src/editor-draft";
import { examples } from "../src/examples";

function memory() {
  const entries = new Map<string, string>();
  return { entries, getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => { entries.set(key, value); } };
}

it("restores incomplete function text and exact indentation without program validation", () => {
  const storage = memory();
  const draft = { ...examples.unary, input: "11", initialState: "", rules: "追加(q0):\n    q0,□ ->\n    " };
  expect(saveEditorDraft(storage, draft)).toBeNull();
  expect(loadEditorDraft(storage)).toEqual(Object.fromEntries(editorFields.map(field => [field, draft[field]])));
});

it("preserves intentional clearing and invalid machine fields", () => {
  const storage = memory();
  const draft = { ...examples.unary, rules: "", blankSymbol: "", haltStates: "" };
  saveEditorDraft(storage, draft);
  expect(loadEditorDraft(storage)?.rules).toBe("");
  expect(loadEditorDraft(storage)?.blankSymbol).toBe("");
  expect(loadEditorDraft(storage)?.haltStates).toBe("");
});

it("replaces a stale invalid draft when the user explicitly loads a new project", () => {
  const storage = memory();
  saveEditorDraft(storage, { ...examples.unary, rules: "unfinished(" });
  saveEditorDraft(storage, examples.binary);
  expect(loadEditorDraft(storage)?.rules).toBe(examples.binary.rules);
});

it("does not overwrite the last applied project or independent speed preference", () => {
  const storage = memory();
  storage.entries.set("turing-machine-simulator.project.v1", "valid project");
  storage.entries.set("turing-machine-simulator.speed.v1", "25");
  saveEditorDraft(storage, examples.unary);
  expect(storage.entries.get("turing-machine-simulator.project.v1")).toBe("valid project");
  expect(storage.entries.get("turing-machine-simulator.speed.v1")).toBe("25");
});

it("ignores absent, corrupt, partial and future draft formats without crashing", () => {
  expect(loadEditorDraft({ getItem: () => null })).toBeNull();
  for (const raw of ["{", "null", "[]", '{"version":1}', JSON.stringify({ version: 2, ...examples.unary })]) {
    expect(loadEditorDraft({ getItem: () => raw })).toBeNull();
  }
  expect(loadEditorDraft({ getItem: () => { throw new Error("blocked"); } })).toBeNull();
});

it("reports storage failure rather than claiming the raw draft was saved", () => {
  expect(saveEditorDraft({ setItem: () => { throw new Error("quota"); } }, examples.unary)).toContain("刷新可能丢失");
});
