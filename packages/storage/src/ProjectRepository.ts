import type { Project } from "@hipflow/core";
import type { Result } from "@hipflow/shared";

export interface StorageError {
  code: "NOT_FOUND" | "INVALID_PROJECT" | "PERSISTENCE_ERROR";
  message: string;
}

export interface ProjectRepository {
  listProjects(): Promise<Project[]>;
  getProject(id: string): Promise<Project | undefined>;
  saveProject(project: Project): Promise<Result<Project, StorageError>>;
  deleteProject(id: string): Promise<Result<void, StorageError>>;
  duplicateProject(id: string): Promise<Result<Project, StorageError>>;
}
