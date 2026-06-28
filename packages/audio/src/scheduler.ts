import {
  DEFAULT_STEPS_PER_BAR,
  STEP_TICKS_16,
  getActiveDrumHitsForRack,
  type DrumHit,
  type DrumRack
} from "@hipflow/core";
import { err, ok, type Result } from "@hipflow/shared";
import type { CommandError } from "@hipflow/core";
import type { TransportSnapshot } from "./AudioEngine";

export interface StepFrameInput {
  drumRack: DrumRack;
  bpm: number;
  isPlaying: boolean;
  absoluteTick: number;
  barIndex: number;
  stepIndex16: number;
}

export interface StepFrame {
  snapshot: TransportSnapshot;
  hits: DrumHit[];
}

export interface PlayheadPosition {
  absoluteTick: number;
  barIndex: number;
  stepIndex16: number;
}

export const computeStepFrame = (
  input: StepFrameInput
): Result<StepFrame, CommandError> => {
  const hits = getActiveDrumHitsForRack(input.drumRack, input.stepIndex16);

  if (!hits.ok) {
    return err(hits.error);
  }

  return ok({
    snapshot: {
      isPlaying: input.isPlaying,
      bpm: input.bpm,
      absoluteTick: input.absoluteTick,
      barIndex: input.barIndex,
      stepIndex16: input.stepIndex16,
      tickInBar: input.stepIndex16 * STEP_TICKS_16
    },
    hits: hits.value
  });
};

export const advancePlayhead = (
  current: PlayheadPosition,
  barCount: number
): PlayheadPosition => {
  const nextStep = (current.stepIndex16 + 1) % DEFAULT_STEPS_PER_BAR;
  const nextBar =
    nextStep === 0 ? (current.barIndex + 1) % Math.max(1, barCount) : current.barIndex;

  return {
    absoluteTick: current.absoluteTick + STEP_TICKS_16,
    barIndex: nextBar,
    stepIndex16: nextStep
  };
};

export const collectHitsForCycle = (drumRack: DrumRack): Result<DrumHit[], CommandError> => {
  const hits: DrumHit[] = [];

  for (let stepIndex = 0; stepIndex < DEFAULT_STEPS_PER_BAR; stepIndex += 1) {
    const frame = computeStepFrame({
      drumRack,
      bpm: 92,
      isPlaying: true,
      absoluteTick: stepIndex * STEP_TICKS_16,
      barIndex: 0,
      stepIndex16: stepIndex
    });

    if (!frame.ok) {
      return err(frame.error);
    }

    hits.push(...frame.value.hits);
  }

  return ok(hits);
};
