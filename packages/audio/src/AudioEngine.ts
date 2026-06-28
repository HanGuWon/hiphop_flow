import type { DrumRack, Pattern } from "@hipflow/core";

export interface TransportSnapshot {
  isPlaying: boolean;
  bpm: number;
  absoluteTick: number;
  barIndex: number;
  stepIndex16: number;
  tickInBar: number;
  pulseIndex: number;
  pulsesPerBar: number;
  stepIndexByChannel: Record<string, number>;
}

export interface AudioEngine {
  loadSample(channelId: string, url: string): Promise<void>;
  setBpm(bpm: number): void;
  setPattern(pattern: Pattern, drumRack: DrumRack): void;
  play(): Promise<void>;
  pause(): void;
  stop(): void;
  subscribeToTransport(listener: (snapshot: TransportSnapshot) => void): () => void;
}

export interface SampleTrigger {
  channelId: string;
  time: number;
  velocity: number;
}

export interface SampleTriggerer {
  loadSample(channelId: string, url: string): Promise<void>;
  hasSample?(channelId: string): boolean;
  trigger(channelId: string, time: number, velocity: number): void;
}
