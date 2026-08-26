import { describe, expect, it, vi } from "vitest";
import { examples } from "./examples";
import { loadProject, parseProjectJson, saveProject, type ProjectData } from "./project-codec";

const validProject: ProjectData = {
  format: "turing-machine-simulator",
  version: 1,
  maxSteps: 10000,
  speed: 1000,
  ...examples.binary,
};

describe("project codec", () => {
  it("accepts and preserves a version 1 project", () => {
    expect(parseProjectJson(JSON.stringify(validProject))).toEqual(validProject);
  });

  it.each([
    ["future version", { ...validProject, version: 2 }],
    ["missing field", { ...validProject, rules: undefined }],
    ["invalid limit", { ...validProject, maxSteps: 0 }],
    ["invalid rules", { ...validProject, rules: "q0,1 -> broken" }],
    ["duplicate rules", { ...validProject, rules: "q0,1 -> q0,1,R\nq0,1 -> q1,1,N" }],
  ])("rejects %s before it reaches the workbench", (_name, project) => {
    expect(() => parseProjectJson(JSON.stringify(project))).toThrow();
  });

  it("keeps storage failures recoverable", () => {
    const storage = { setItem: vi.fn(() => { throw new Error("quota"); }) };
    expect(saveProject(storage, "project", validProject)).toContain("仍可继续使用");
  });

  it("returns null for corrupt saved data", () => {
    expect(loadProject({ getItem: () => "{" }, "project")).toBeNull();
  });
});
