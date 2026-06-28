import {
  DEFAULT_BPM,
  DEFAULT_STEPS_PER_BAR,
  STEP_TICKS_16,
  createDefaultProject,
  type DrumRack,
  type Pattern,
  type Project
} from "@hipflow/core";
import type { AudioEngine, SampleTriggerer, TransportSnapshot } from "./AudioEngine";
import { SamplePlayer } from "./SamplePlayer";
import { advancePlayhead, computeStepFrame, type PlayheadPosition } from "./scheduler";

export class ToneTransportEngine implements AudioEngine {
  private tone: typeof import("tone") | undefined;
  private scheduledEventId: number | undefined;
  private uiHeartbeatId: ReturnType<typeof setInterval> | undefined;
  private lastToneAdvanceAt = 0;
  private bpm = DEFAULT_BPM;
  private pattern: Pattern;
  private drumRack: DrumRack;
  private isPlaying = false;
  private playhead: PlayheadPosition = {
    absoluteTick: 0,
    barIndex: 0,
    stepIndex16: 0
  };
  private readonly listeners = new Set<(snapshot: TransportSnapshot) => void>();

  constructor(
    initialProject: Project = createDefaultProject(),
    private readonly samplePlayer: SampleTriggerer = new SamplePlayer()
  ) {
    this.bpm = initialProject.bpm;
    this.pattern =
      initialProject.patterns.find((pattern) => pattern.id === initialProject.selectedPatternId) ??
      initialProject.patterns[0];
    this.drumRack = initialProject.drumRack;
  }

  async loadSample(channelId: string, url: string): Promise<void> {
    await this.samplePlayer.loadSample(channelId, url);
  }

  setBpm(bpm: number): void {
    this.bpm = bpm;

    if (this.tone) {
      this.tone.Transport.bpm.value = bpm;
    }

    if (this.isPlaying) {
      this.startUiHeartbeat();
    }
  }

  setPattern(pattern: Pattern, drumRack: DrumRack): void {
    this.pattern = pattern;
    this.drumRack = drumRack;
  }

  async play(): Promise<void> {
    this.isPlaying = true;
    this.startUiHeartbeat();
    this.tone = this.tone ?? (await import("tone"));
    await this.tone.start();

    if (this.scheduledEventId !== undefined) {
      this.tone.Transport.clear(this.scheduledEventId);
    }

    this.tone.Transport.bpm.value = this.bpm;
    this.scheduledEventId = this.tone.Transport.scheduleRepeat((time) => {
      this.lastToneAdvanceAt = Date.now();
      this.advanceOneStep(time, true);
    }, "16n");
    this.tone.Transport.start();
  }

  stop(): void {
    this.isPlaying = false;
    this.clearUiHeartbeat();

    if (this.tone) {
      if (this.scheduledEventId !== undefined) {
        this.tone.Transport.clear(this.scheduledEventId);
        this.scheduledEventId = undefined;
      }

      this.tone.Transport.stop();
      this.tone.Transport.position = "0:0:0";
    }

    this.playhead = {
      absoluteTick: 0,
      barIndex: 0,
      stepIndex16: 0
    };
    this.emit(this.currentSnapshot());
  }

  subscribeToTransport(listener: (snapshot: TransportSnapshot) => void): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  advanceOneStepForTest(time = 0): TransportSnapshot {
    return this.advanceOneStep(time, true);
  }

  getTransportSnapshot(): TransportSnapshot {
    return this.currentSnapshot();
  }

  private advanceOneStep(time: number, triggerSamples: boolean): TransportSnapshot {
    const frame = computeStepFrame({
      drumRack: this.drumRack,
      bpm: this.bpm,
      isPlaying: this.isPlaying,
      absoluteTick: this.playhead.absoluteTick,
      barIndex: this.playhead.barIndex,
      stepIndex16: this.playhead.stepIndex16
    });

    if (!frame.ok) {
      return this.currentSnapshot();
    }

    if (triggerSamples) {
      frame.value.hits.forEach((hit) => {
        this.samplePlayer.trigger(hit.channelId, time, hit.velocity);
      });
    }

    this.emit(frame.value.snapshot);
    this.playhead = advancePlayhead(this.playhead, this.pattern.barCount);

    return frame.value.snapshot;
  }

  private currentSnapshot(): TransportSnapshot {
    return {
      isPlaying: this.isPlaying,
      bpm: this.bpm,
      absoluteTick: this.playhead.absoluteTick,
      barIndex: this.playhead.barIndex,
      stepIndex16: this.playhead.stepIndex16 % DEFAULT_STEPS_PER_BAR,
      tickInBar: (this.playhead.stepIndex16 % DEFAULT_STEPS_PER_BAR) * STEP_TICKS_16
    };
  }

  private startUiHeartbeat(): void {
    this.clearUiHeartbeat();

    const stepMs = Math.max(40, 60_000 / this.bpm / 4);
    this.lastToneAdvanceAt = Date.now();
    this.uiHeartbeatId = setInterval(() => {
      if (!this.isPlaying) {
        return;
      }

      if (Date.now() - this.lastToneAdvanceAt > stepMs * 1.5) {
        this.advanceOneStep(0, false);
      }
    }, Math.max(30, stepMs / 2));
  }

  private clearUiHeartbeat(): void {
    if (this.uiHeartbeatId !== undefined) {
      clearInterval(this.uiHeartbeatId);
      this.uiHeartbeatId = undefined;
    }
  }

  private emit(snapshot: TransportSnapshot): void {
    this.listeners.forEach((listener) => {
      listener(snapshot);
    });
  }
}
