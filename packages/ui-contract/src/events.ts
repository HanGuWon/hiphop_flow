import type { CommandError, Project } from "@hipflow/core";
import type { TransportSnapshot } from "@hipflow/audio";

export interface AppSnapshot {
  project: Project;
  selectedCellIds: string[];
  transport: TransportSnapshot;
  currentBarIndex: number;
  currentStepIndex16: number;
  currentTickInBar: number;
}

export type AppSnapshotListener = (snapshot: AppSnapshot) => void;

export interface ControllerEvent {
  type: "snapshot" | "commandError";
  snapshot?: AppSnapshot;
  error?: CommandError;
}
