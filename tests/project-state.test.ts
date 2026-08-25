import { describe, expect, it } from "vitest";
import { machineProjectKey, shouldApplyCurrentDraft } from "../src/project-state";

describe("current rule draft", () => {
  const example = {
    input: "111",
    blankSymbol: "□",
    initialState: "q0",
    acceptStates: "",
    rejectStates: "",
    haltStates: "HALT",
    rules: "q0,1 -> q0,1,R",
  };

  it("requires a new machine when the current rules differ from the applied rules", () => {
    const appliedKey = machineProjectKey(example);
    const editedKey = machineProjectKey({ ...example, rules: "q0,1 -> HALT,0,N" });

    expect(shouldApplyCurrentDraft(true, appliedKey, editedKey)).toBe(true);
    expect(shouldApplyCurrentDraft(true, appliedKey, appliedKey)).toBe(false);
  });
});
