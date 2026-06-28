import Dexie, { type Table } from "dexie";
import { validateProject, type Project } from "@hipflow/core";
import { createId, err, ok, type Result } from "@hipflow/shared";
import type { ProjectRepository, StorageError } from "./ProjectRepository";

interface ProjectRecord {
  id: string;
  title: string;
  updatedAt: number;
  project: Project;
}

class HipFlowDatabase extends Dexie {
  projects!: Table<ProjectRecord, string>;

  constructor(databaseName: string) {
    super(databaseName);
    this.version(1).stores({
      projects: "id, title, updatedAt"
    });
  }
}

const cloneProject = (project: Project): Project => JSON.parse(JSON.stringify(project)) as Project;

const persistenceError = (error: unknown): StorageError => ({
  code: "PERSISTENCE_ERROR",
  message: error instanceof Error ? error.message : "Storage operation failed."
});

export class DexieProjectRepository implements ProjectRepository {
  private readonly database: HipFlowDatabase;

  constructor(databaseName = "hipflow-studio") {
    this.database = new HipFlowDatabase(databaseName);
  }

  async listProjects(): Promise<Project[]> {
    const records = await this.database.projects.orderBy("updatedAt").reverse().toArray();

    return records.map((record) => cloneProject(record.project));
  }

  async getProject(id: string): Promise<Project | undefined> {
    const record = await this.database.projects.get(id);

    return record ? cloneProject(record.project) : undefined;
  }

  async saveProject(project: Project): Promise<Result<Project, StorageError>> {
    const validation = validateProject(project);

    if (!validation.ok) {
      return err({
        code: "INVALID_PROJECT",
        message: validation.error.map((error) => `${error.path}: ${error.message}`).join("; ")
      });
    }

    try {
      const projectCopy = cloneProject(project);
      await this.database.projects.put({
        id: projectCopy.id,
        title: projectCopy.title,
        updatedAt: Date.now(),
        project: projectCopy
      });

      return ok(projectCopy);
    } catch (error) {
      return err(persistenceError(error));
    }
  }

  async deleteProject(id: string): Promise<Result<void, StorageError>> {
    const existing = await this.database.projects.get(id);

    if (!existing) {
      return err({ code: "NOT_FOUND", message: `Project '${id}' was not found.` });
    }

    try {
      await this.database.projects.delete(id);

      return ok(undefined);
    } catch (error) {
      return err(persistenceError(error));
    }
  }

  async duplicateProject(id: string): Promise<Result<Project, StorageError>> {
    const existing = await this.getProject(id);

    if (!existing) {
      return err({ code: "NOT_FOUND", message: `Project '${id}' was not found.` });
    }

    const duplicate: Project = {
      ...existing,
      id: createId("project"),
      title: `${existing.title} Copy`
    };

    return this.saveProject(duplicate);
  }
}
