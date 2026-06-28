import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { createDefaultProject } from "@hipflow/core";
import { DexieProjectRepository, exportProjectToJson, importProjectFromJson } from "../src";

describe("@hipflow/storage", () => {
  it("exports and imports a project without losing timing data", () => {
    const project = createDefaultProject();
    const json = exportProjectToJson(project);
    const imported = importProjectFromJson(json);

    expect(imported.ok).toBe(true);
    if (imported.ok) {
      expect(imported.value.bars[0].lyricCells[0].durationTicks).toBe(240);
      expect(imported.value).toEqual(project);
    }
  });

  it("returns typed errors for invalid JSON", () => {
    const imported = importProjectFromJson("{nope");

    expect(imported.ok).toBe(false);
    if (!imported.ok) {
      expect(imported.error.code).toBe("INVALID_JSON");
    }
  });

  it("saves, lists, duplicates, and deletes projects with Dexie", async () => {
    const repository = new DexieProjectRepository(`hipflow-test-${Date.now()}`);
    const project = createDefaultProject();

    const saved = await repository.saveProject(project);
    expect(saved.ok).toBe(true);

    const listed = await repository.listProjects();
    expect(listed).toHaveLength(1);

    const duplicate = await repository.duplicateProject(project.id);
    expect(duplicate.ok).toBe(true);
    if (duplicate.ok) {
      expect(duplicate.value.id).not.toBe(project.id);
    }

    const removed = await repository.deleteProject(project.id);
    expect(removed.ok).toBe(true);
  });
});
