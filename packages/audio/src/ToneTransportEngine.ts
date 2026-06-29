import {
  DEFAULT_BPM,
  STEP_TICKS_16,
  createDefaultProject,
  getBarTicks,
  getStepIndexByChannelAtTick,
  type DrumRack,
  type Pattern,
  type Project
} from "@hipflow/core";
import type { AudioEngine, SampleTriggerer, TransportSnapshot } from "./AudioEngine";
import { SamplePlayer } from "./SamplePlayer";
import {
  TRANSPORT_PULSES_PER_BAR,
  advancePlayhead,
  computeStepFrame,
  getPulseSecondsForBpm,
  type PlayheadPosition
} from "./scheduler";

export class ToneTransportEngine implements AudioEngine {
  private tone: typeof import("tone") | undefined;
  private audioClockId: ReturnType<typeof setInterval> | undefined;
  private uiHeartbeatId: ReturnType<typeof setInterval> | undefined;
  private lastToneAdvanceAt = 0;
  private bpm = DEFAULT_BPM;
  private pattern: Pattern;
  private drumRack: DrumRack;
  private isPlaying = false;
  private playhead: PlayheadPosition = {
    absoluteTick: 0,
    barIndex: 0,
    pulseIndex: 0
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

    if (this.isPlaying) {
      this.startAudioClock();
      this.startUiHeartbeat();
    }
  }

  setPattern(pattern: Pattern, drumRack: DrumRack): void {
    this.pattern = pattern;
    this.drumRack = drumRack;
  }

  async play(): Promise<void> {
    this.tone = this.tone ?? (await import("tone"));
    this.isPlaying = true;
    this.startUiHeartbeat();
    this.emit(this.currentSnapshot());

    try {
      await this.tone.loaded();
      await this.tone.start();
    } catch (error) {
      this.isPlaying = false;
      this.clearUiHeartbeat();
      this.emit(this.currentSnapshot());
      throw error;
    }

    if (!this.isPlaying) {
      return;
    }

    this.startAudioClock();
  }

  pause(): void {
    this.isPlaying = false;
    this.clearUiHeartbeat();
    this.clearAudioClock();

    this.emit(this.currentSnapshot());
  }

  stop(): void {
    this.isPlaying = false;
    this.clearUiHeartbeat();
    this.clearAudioClock();

    this.playhead = {
      absoluteTick: 0,
      barIndex: 0,
      pulseIndex: 0
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
      pulseIndex: this.playhead.pulseIndex,
      pulsesPerBar: TRANSPORT_PULSES_PER_BAR
    });

    if (!frame.ok) {
      return this.currentSnapshot();
    }

    if (triggerSamples) {
      frame.value.hits.forEach((hit) => {
        if (this.samplePlayer.hasSample?.(hit.channelId) === false) {
          return;
        }

        this.samplePlayer.trigger(hit.channelId, time, hit.velocity);
      });
    }

    this.emit(frame.value.snapshot);
    this.playhead = advancePlayhead(
      this.playhead,
      this.pattern.barCount,
      TRANSPORT_PULSES_PER_BAR
    );

    return frame.value.snapshot;
  }

  private currentSnapshot(): TransportSnapshot {
    const barTicks = getBarTicks();
    const pulseTicks = barTicks / TRANSPORT_PULSES_PER_BAR;
    const tickInBar = this.playhead.pulseIndex * pulseTicks;

    return {
      isPlaying: this.isPlaying,
      bpm: this.bpm,
      absoluteTick: this.playhead.absoluteTick,
      barIndex: this.playhead.barIndex,
      stepIndex16: Math.floor(tickInBar / STEP_TICKS_16),
      tickInBar,
      pulseIndex: this.playhead.pulseIndex,
      pulsesPerBar: TRANSPORT_PULSES_PER_BAR,
      stepIndexByChannel: getStepIndexByChannelAtTick(this.drumRack, tickInBar, barTicks)
    };
  }

  private startUiHeartbeat(): void {
    this.clearUiHeartbeat();

    const stepMs = Math.max(16, this.getPulseSeconds() * 1000);
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

  private startAudioClock(): void {
    if (!this.tone) {
      return;
    }

    this.clearAudioClock();

    const stepMs = Math.max(1, this.getPulseSeconds() * 1000);
    this.audioClockId = setInterval(() => {
      if (!this.isPlaying || !this.tone) {
        return;
      }

      this.lastToneAdvanceAt = Date.now();
      this.advanceOneStep(this.tone.now(), true);
    }, stepMs);
  }

  private clearAudioClock(): void {
    if (this.audioClockId !== undefined) {
      clearInterval(this.audioClockId);
      this.audioClockId = undefined;
    }
  }

  private getPulseSeconds(): number {
    return getPulseSecondsForBpm(this.bpm, TRANSPORT_PULSES_PER_BAR);
  }

  private emit(snapshot: TransportSnapshot): void {
    this.listeners.forEach((listener) => {
      listener(snapshot);
    });
  }
}
