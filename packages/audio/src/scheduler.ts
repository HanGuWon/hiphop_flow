import {
  STEP_TICKS_16,
  getActiveDrumHitsAtTick,
  getBarTicks,
  getStepIndexByChannelAtTick,
  type DrumHit,
  type DrumRack
} from "@hipflow/core";
import { err, ok, type Result } from "@hipflow/shared";
import type { CommandError } from "@hipflow/core";
import type { TransportSnapshot } from "./AudioEngine";

export const TRANSPORT_PULSES_PER_BAR = 192;

export interface StepFrameInput {
  drumRack: DrumRack;
  bpm: number;
  isPlaying: boolean;
  absoluteTick: number;
  barIndex: number;
  pulseIndex: number;
  pulsesPerBar: number;
}

export interface StepFrame {
  snapshot: TransportSnapshot;
  hits: DrumHit[];
}

export interface PlayheadPosition {
  absoluteTick: number;
  barIndex: number;
  pulseIndex: number;
}

export const computeStepFrame = (
  input: StepFrameInput
): Result<StepFrame, CommandError> => {
  const barTicks = getBarTicks();
  const pulseTicks = barTicks / input.pulsesPerBar;
  const tickInBar = input.pulseIndex * pulseTicks;
  const hits = getActiveDrumHitsAtTick(input.drumRack, tickInBar, barTicks);

  if (!hits.ok) {
    return err(hits.error);
  }

  return ok({
    snapshot: {
      isPlaying: input.isPlaying,
      bpm: input.bpm,
      absoluteTick: input.absoluteTick,
      barIndex: input.barIndex,
      stepIndex16: Math.floor(tickInBar / STEP_TICKS_16),
      tickInBar,
      pulseIndex: input.pulseIndex,
      pulsesPerBar: input.pulsesPerBar,
      stepIndexByChannel: getStepIndexByChannelAtTick(input.drumRack, tickInBar, barTicks)
    },
    hits: hits.value
  });
};

export const advancePlayhead = (
  current: PlayheadPosition,
  barCount: number,
  pulsesPerBar = TRANSPORT_PULSES_PER_BAR
): PlayheadPosition => {
  const pulseTicks = getBarTicks() / pulsesPerBar;
  const nextPulse = (current.pulseIndex + 1) % pulsesPerBar;
  const nextBar =
    nextPulse === 0 ? (current.barIndex + 1) % Math.max(1, barCount) : current.barIndex;

  return {
    absoluteTick: current.absoluteTick + pulseTicks,
    barIndex: nextBar,
    pulseIndex: nextPulse
  };
};

export const collectHitsForCycle = (drumRack: DrumRack): Result<DrumHit[], CommandError> => {
  const hits: DrumHit[] = [];

  for (let pulseIndex = 0; pulseIndex < TRANSPORT_PULSES_PER_BAR; pulseIndex += 1) {
    const frame = computeStepFrame({
      drumRack,
      bpm: 92,
      isPlaying: true,
      absoluteTick: pulseIndex * (getBarTicks() / TRANSPORT_PULSES_PER_BAR),
      barIndex: 0,
      pulseIndex,
      pulsesPerBar: TRANSPORT_PULSES_PER_BAR
    });

    if (!frame.ok) {
      return err(frame.error);
    }

    hits.push(...frame.value.hits);
  }

  return ok(hits);
};
