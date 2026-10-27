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
  it("round-trips child bindings and exported state source without flattening it", () => {
    const project = { ...validProject, ...examples.functionExports };
    expect(parseProjectJson(JSON.stringify(project))).toEqual(project);
  });
  it("preserves function source and allows the call list to select the entry", () => {
    const project = { ...validProject, ...examples.functions, initialState: "" };
    expect(parseProjectJson(JSON.stringify(project))).toEqual(project);
    const custom = { ...project, haltStates: "完成", rules: project.rules.replaceAll("HALT", "完成") };
    expect(parseProjectJson(JSON.stringify(custom))).toEqual(custom);
  });
  it("accepts and preserves a version 1 project", () => {
    expect(parseProjectJson(JSON.stringify(validProject))).toEqual(validProject);
  });

  it("accepts Max mode and preserves it through storage", () => {
    const project = { ...validProject, maxSteps: null };
    const storage = { setItem: vi.fn(), getItem: vi.fn(() => JSON.stringify(project)) };
    expect(parseProjectJson(JSON.stringify(project))).toEqual(project);
    expect(saveProject(storage, "project", project)).toBeNull();
    expect(loadProject(storage, "project")).toEqual(project);
  });

  it.each([
    ["future version", { ...validProject, version: 2 }],
    ["missing field", { ...validProject, rules: undefined }],
    ["invalid limit", { ...validProject, maxSteps: 0 }],
    ["invalid Max text", { ...validProject, maxSteps: "Max" }],
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
