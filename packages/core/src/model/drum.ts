import { getBarTicks } from "./lyricGrid";

export type StepIndex = number;
export type DrumChannelName = "KICK" | "SNARE" | "CLAP" | "HIHAT" | string;

export interface DrumStep {
  stepIndex: StepIndex;
  active: boolean;
  velocity: number;
  probability?: number;
  microShiftTicks?: number;
}

export interface DrumChannel {
  id: string;
  name: DrumChannelName;
  sampleId?: string;
  muted: boolean;
  solo: boolean;
  steps: DrumStep[];
}

export interface DrumRack {
  channels: DrumChannel[];
}

export interface DrumHit {
  channelId: string;
  channelName: DrumChannelName;
  stepIndex: StepIndex;
  velocity: number;
  sampleId?: string;
  microShiftTicks?: number;
}

export const DEFAULT_DRUM_CHANNELS = [
  { id: "kick", name: "KICK" },
  { id: "snare", name: "SNARE" },
  { id: "clap", name: "CLAP" },
  { id: "hihat", name: "HIHAT" }
] as const;

export const DEFAULT_DRUM_STEPS_PER_BAR = 16;
export const MAX_DRUM_STEPS_PER_BAR = 96;
export const DRUM_STEP_COUNT_OPTIONS = [16, 24, 32, 48] as const;

export const isSupportedDrumStepCount = (stepCount: number): boolean =>
  Number.isInteger(stepCount) &&
  stepCount > 0 &&
  stepCount <= MAX_DRUM_STEPS_PER_BAR &&
  getBarTicks() % stepCount === 0;

export const createDefaultDrumSteps = (stepCount: number): DrumStep[] =>
  Array.from({ length: stepCount }, (_, stepIndex) => ({
    stepIndex,
    active: false,
    velocity: 1
  }));

export const createDefaultDrumRack = (stepCount = DEFAULT_DRUM_STEPS_PER_BAR): DrumRack => ({
  channels: DEFAULT_DRUM_CHANNELS.map((channel) => ({
    id: channel.id,
    name: channel.name,
    muted: false,
    solo: false,
    steps: createDefaultDrumSteps(stepCount)
  }))
});
