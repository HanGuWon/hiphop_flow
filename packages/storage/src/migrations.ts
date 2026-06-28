import { PROJECT_VERSION, validateProject, type Project } from "@hipflow/core";
import { err, ok, type Result } from "@hipflow/shared";

export interface ImportError {
  code: "INVALID_JSON" | "INVALID_PROJECT" | "UNSUPPORTED_VERSION";
  message: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasProjectEnvelope = (value: unknown): value is Project => {
  if (!isRecord(value)) {
    return false;
  }

  const timeSignature = value.timeSignature;
  const transport = value.transport;
  const drumRack = value.drumRack;

  return (
    typeof value.id === "string" &&
    typeof value.version === "number" &&
    typeof value.title === "string" &&
    typeof value.bpm === "number" &&
    isRecord(timeSignature) &&
    isRecord(transport) &&
    Array.isArray(value.bars) &&
    isRecord(drumRack) &&
    Array.isArray(drumRack.channels) &&
    Array.isArray(value.patterns) &&
    typeof value.selectedPatternId === "string" &&
    Array.isArray(value.selectedCellIds)
  );
};

export const CURRENT_PROJECT_VERSION = PROJECT_VERSION;

export const migrateProject = (value: unknown): Result<Project, ImportError> => {
  if (!isRecord(value)) {
    return err({ code: "INVALID_PROJECT", message: "Imported value must be a project object." });
  }

  const version = value.version;

  if (typeof version !== "number" || version > CURRENT_PROJECT_VERSION) {
    return err({ code: "UNSUPPORTED_VERSION", message: "Project version is not supported." });
  }

  if (!hasProjectEnvelope(value)) {
    return err({ code: "INVALID_PROJECT", message: "Imported project is missing required fields." });
  }

  const validation = validateProject(value);

  if (!validation.ok) {
    return err({
      code: "INVALID_PROJECT",
      message: validation.error.map((error) => `${error.path}: ${error.message}`).join("; ")
    });
  }

  return ok(value);
};
