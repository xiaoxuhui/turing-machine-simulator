import { expect, it } from "vitest";
import { parseTransitions } from "../src/core";
import { collectProjectStates, renameProjectState } from "../src/project-states";

it("lists states and renames only state references, including initial and terminal fields", () => {
  const project = {
    rules: "# q0\nq0,q0#(tag, ->)->q1,q0,R\nq1->HALT",
    initialState: "q0", acceptStates: "ACCEPT", rejectStates: "REJECT", haltStates: "HALT",
  };
  const parsed = parseTransitions(project.rules);
  expect(parsed.errors).toEqual([]);
  expect(collectProjectStates(project, parsed)).toContainEqual({
    value: "q1", incoming: 1, outgoing: 1, roles: [],
  });
  const renamed = renameProjectState(project, parsed, "q0", "扫描");
  expect(renamed.initialState).toBe("扫描");
  expect(renamed.rules).toBe("# q0\n扫描,q0#(tag, ->)->q1,q0,R\nq1->HALT");
  const halted = renameProjectState(renamed, parseTransitions(renamed.rules), "HALT", "完成");
  expect(halted.rules).toContain("q1->完成");
  expect(halted.haltStates).toBe("完成");
  expect(() => renameProjectState(project, parsed, "q0", "q1")).toThrow("已存在");
});
