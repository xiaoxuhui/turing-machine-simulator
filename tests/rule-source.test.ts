import { expect, it } from "vitest";
import { editRuleSource } from "../src/rule-source";

it("retains comments and off-page rules when editing or deleting a paged row", () => {
  const source = "# machine metadata\n\na,0 -> b,1,R\nb,0 -> c,2,L\n# footer";
  expect(editRuleSource(source, 1, "b,0 -> d,3,N")).toBe("# machine metadata\n\na,0 -> b,1,R\nb,0 -> d,3,N\n# footer");
  expect(editRuleSource(source, 0, null)).toBe("# machine metadata\n\nb,0 -> c,2,L\n# footer");
});
