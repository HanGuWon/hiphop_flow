import {
  STEP_TICKS_16,
  applyCommand,
  createDefaultProject,
  type Command,
  type CommandError,
  type Project
} from "@hipflow/core";
import type { AudioEngine, TransportSnapshot } from "@hipflow/audio";
import { err, ok, type Result } from "@hipflow/shared";
import type { AppSnapshot, AppSnapshotListener } from "./events";

const cloneSerializable = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const defaultTransportSnapshot = (project: Project): TransportSnapshot => ({
  isPlaying: project.transport.isPlaying,
  bpm: project.bpm,
  absoluteTick: 0,
  barIndex: 0,
  stepIndex16: 0,
  tickInBar: 0
});

export class FlowStudioController {
  private project: Project;
  private transport: TransportSnapshot;
  private audioEngine: AudioEngine | undefined;
  private unsubscribeAudio: (() => void) | undefined;
  private readonly listeners = new Set<AppSnapshotListener>();

  constructor(initialProject: Project = createDefaultProject()) {
    this.project = cloneSerializable(initialProject);
    this.transport = defaultTransportSnapshot(this.project);
  }

  getSnapshot(): AppSnapshot {
    return cloneSerializable({
      project: this.project,
      selectedCellIds: this.project.selectedCellIds,
      transport: this.transport,
      currentBarIndex: this.transport.barIndex,
      currentStepIndex16: this.transport.stepIndex16,
      currentTickInBar: this.transport.tickInBar
    });
  }

  dispatch(command: Command): Result<AppSnapshot, CommandError> {
    const result = applyCommand(this.project, command);

    if (!result.ok) {
      return err(result.error);
    }

    this.project = result.value;
    this.syncAudioAfterCommand(command);
    this.transport = {
      ...this.transport,
      bpm: this.project.bpm,
      isPlaying: this.project.transport.isPlaying
    };

    const snapshot = this.getSnapshot();
    this.notify(snapshot);

    return ok(snapshot);
  }

  subscribe(listener: AppSnapshotListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  async start(): Promise<void> {
    const playResult = this.dispatch({ type: "transport/play" });

    if (!playResult.ok) {
      return;
    }

    await this.audioEngine?.play();
  }

  stop(): void {
    this.audioEngine?.stop();
    this.dispatch({ type: "transport/stop" });
    this.transport = {
      ...this.transport,
      isPlaying: false,
      absoluteTick: 0,
      barIndex: 0,
      stepIndex16: 0,
      tickInBar: 0
    };
    this.notify(this.getSnapshot());
  }

  setAudioEngine(engine: AudioEngine): void {
    this.unsubscribeAudio?.();
    this.audioEngine = engine;
    this.syncAudioProject();
    this.unsubscribeAudio = engine.subscribeToTransport((snapshot) => {
      this.transport = snapshot;
      this.notify(this.getSnapshot());
    });
  }

  private notify(snapshot: AppSnapshot): void {
    this.listeners.forEach((listener) => {
      listener(snapshot);
    });
  }

  private syncAudioAfterCommand(command: Command): void {
    if (!this.audioEngine) {
      return;
    }

    if (command.type === "transport/setBpm") {
      this.audioEngine.setBpm(command.bpm);
    }

    if (command.type.startsWith("drum/")) {
      this.syncAudioProject();
    }
  }

  private syncAudioProject(): void {
    if (!this.audioEngine) {
      return;
    }

    const pattern =
      this.project.patterns.find((candidate) => candidate.id === this.project.selectedPatternId) ??
      this.project.patterns[0];

    this.audioEngine.setBpm(this.project.bpm);
    this.audioEngine.setPattern(pattern, this.project.drumRack);
    this.transport = {
      ...this.transport,
      bpm: this.project.bpm,
      tickInBar: this.transport.stepIndex16 * STEP_TICKS_16
    };
  }
}
