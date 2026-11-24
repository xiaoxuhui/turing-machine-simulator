import { expect, it } from "vitest";
import { uniqueDownloadName } from "../src/download-file";

it("keeps a fresh name and adds numbers before the extension on collisions", () => {
  expect(uniqueDownloadName("项目.json", [])).toBe("项目.json");
  expect(uniqueDownloadName("项目.json", ["项目.json"])).toBe("项目 (1).json");
  expect(uniqueDownloadName("项目.json", ["项目.json", "项目 (1).json", "项目 (2).json"])).toBe("项目 (3).json");
  expect(uniqueDownloadName("log.csv", ["log.json"])).toBe("log.csv");
});
it("avoids case-only collisions and continues an existing suffix rather than stacking suffixes", () => {
  expect(uniqueDownloadName("Project.JSON", ["project.json", "PROJECT (1).JSON"])).toBe("Project (2).JSON");
  expect(uniqueDownloadName("项目 (1).json", ["项目 (1).json", "项目 (2).json"])).toBe("项目 (3).json");
  expect(uniqueDownloadName("项目 (4).json", ["项目.json"])).toBe("项目 (4).json");
  expect(uniqueDownloadName("项目2026.json", ["项目2026.json"])).toBe("项目2026 (1).json");
});
it("supports extensionless names and long numeric suffixes without overflowing", () => {
  expect(uniqueDownloadName("备份", ["备份"])).toBe("备份 (1)");
  expect(uniqueDownloadName("备份 (999999999999999999).json", ["备份 (999999999999999999).json"])).toBe("备份 (1000000000000000000).json");
});
