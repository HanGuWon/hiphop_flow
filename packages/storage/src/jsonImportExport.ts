import type { Project } from "@hipflow/core";
import { err, ok, type Result } from "@hipflow/shared";
import { migrateProject, type ImportError } from "./migrations";

export const exportProjectToJson = (project: Project): string => JSON.stringify(project, null, 2);

export const importProjectFromJson = (json: string): Result<Project, ImportError> => {
  try {
    return migrateProject(JSON.parse(json) as unknown);
  } catch (error) {
    const message = error instanceof Error ? error.message : "JSON could not be parsed.";

    return err({ code: "INVALID_JSON", message });
  }
};
