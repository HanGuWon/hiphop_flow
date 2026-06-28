import { err, ok, type Result } from "@hipflow/shared";
import { getBarTicks } from "../model/lyricGrid";
import {
  createDefaultDrumSteps,
  isSupportedDrumStepCount,
  type DrumChannel,
  type DrumHit,
  type DrumRack,
  type DrumStep
} from "../model/drum";
import type { Project } from "../model/project";
import { commandError, type CommandError } from "./commandTypes";

const validateStepCount = (stepCount: number): Result<void, CommandError> => {
  if (!isSupportedDrumStepCount(stepCount)) {
    return err(
      commandError(
        "INVALID_STEP_COUNT",
        "Step count must divide one bar evenly and stay inside the supported range."
      )
    );
  }

  return ok(undefined);
};

const validateStepIndexForChannel = (
  channel: DrumChannel,
  stepIndex: number
): Result<void, CommandError> => {
  if (!Number.isInteger(stepIndex) || stepIndex < 0 || stepIndex >= channel.steps.length) {
    return err(
      commandError(
        "INVALID_STEP_INDEX",
        `Step index must be between 0 and ${channel.steps.length - 1} for ${channel.name}.`
      )
    );
  }

  return ok(undefined);
};

const findChannel = (project: Project, channelId: string): DrumChannel | undefined =>
  project.drumRack.channels.find((channel) => channel.id === channelId);

const updateChannel = (
  project: Project,
  channelId: string,
  updater: (channel: Project["drumRack"]["channels"][number]) => Project["drumRack"]["channels"][number]
): Result<Project, CommandError> => {
  const channelExists = project.drumRack.channels.some((channel) => channel.id === channelId);

  if (!channelExists) {
    return err(commandError("CHANNEL_NOT_FOUND", `Drum channel '${channelId}' was not found.`));
  }

  return ok({
    ...project,
    drumRack: {
      channels: project.drumRack.channels.map((channel) =>
        channel.id === channelId ? updater(channel) : channel
      )
    }
  });
};

export const toggleDrumStep = (
  project: Project,
  channelId: string,
  stepIndex: number
): Result<Project, CommandError> => {
  const channel = findChannel(project, channelId);

  if (!channel) {
    return err(commandError("CHANNEL_NOT_FOUND", `Drum channel '${channelId}' was not found.`));
  }

  const validStep = validateStepIndexForChannel(channel, stepIndex);

  if (!validStep.ok) {
    return validStep;
  }

  return updateChannel(project, channelId, (channel) => ({
    ...channel,
    steps: channel.steps.map((step) =>
      step.stepIndex === stepIndex ? { ...step, active: !step.active } : step
    )
  }));
};

export const setDrumVelocity = (
  project: Project,
  channelId: string,
  stepIndex: number,
  velocity: number
): Result<Project, CommandError> => {
  const channel = findChannel(project, channelId);

  if (!channel) {
    return err(commandError("CHANNEL_NOT_FOUND", `Drum channel '${channelId}' was not found.`));
  }

  const validStep = validateStepIndexForChannel(channel, stepIndex);

  if (!validStep.ok) {
    return validStep;
  }

  if (!Number.isFinite(velocity) || velocity < 0 || velocity > 1) {
    return err(commandError("INVALID_VELOCITY", "Velocity must be between 0 and 1."));
  }

  return updateChannel(project, channelId, (channel) => ({
    ...channel,
    steps: channel.steps.map((step) =>
      step.stepIndex === stepIndex ? { ...step, velocity } : step
    )
  }));
};

const resizeStepsByMusicalPosition = (
  steps: DrumStep[],
  nextStepCount: number
): DrumStep[] => {
  const barTicks = getBarTicks();
  const previousStepTicks = barTicks / steps.length;
  const nextStepTicks = barTicks / nextStepCount;
  const nextSteps = createDefaultDrumSteps(nextStepCount);

  return nextSteps.map((nextStep) => {
    const tick = nextStep.stepIndex * nextStepTicks;
    const previousStepIndex = tick / previousStepTicks;

    if (!Number.isInteger(previousStepIndex)) {
      return nextStep;
    }

    const previousStep = steps[previousStepIndex];

    return previousStep
      ? {
          ...previousStep,
          stepIndex: nextStep.stepIndex
        }
      : nextStep;
  });
};

export const setChannelStepCount = (
  project: Project,
  channelId: string,
  stepCount: number
): Result<Project, CommandError> => {
  const validStepCount = validateStepCount(stepCount);

  if (!validStepCount.ok) {
    return validStepCount;
  }

  return updateChannel(project, channelId, (channel) => ({
    ...channel,
    steps:
      channel.steps.length === stepCount
        ? channel.steps
        : resizeStepsByMusicalPosition(channel.steps, stepCount)
  }));
};

export const muteChannel = (
  project: Project,
  channelId: string,
  muted: boolean
): Result<Project, CommandError> =>
  updateChannel(project, channelId, (channel) => ({
    ...channel,
    muted
  }));

export const soloChannel = (
  project: Project,
  channelId: string,
  solo: boolean
): Result<Project, CommandError> =>
  updateChannel(project, channelId, (channel) => ({
    ...channel,
    solo
  }));

export const getActiveDrumHitsForRack = (
  drumRack: DrumRack,
  stepIndex: number
): Result<DrumHit[], CommandError> => {
  if (!Number.isInteger(stepIndex) || stepIndex < 0) {
    return err(commandError("INVALID_STEP_INDEX", "Step index must be zero or greater."));
  }

  const hasSolo = drumRack.channels.some((channel) => channel.solo);

  return ok(
    drumRack.channels.flatMap((channel) => {
      if (channel.muted || (hasSolo && !channel.solo)) {
        return [];
      }

      const step = channel.steps[stepIndex];

      if (!step?.active) {
        return [];
      }

      return [
        {
          channelId: channel.id,
          channelName: channel.name,
          stepIndex,
          velocity: step.velocity,
          sampleId: channel.sampleId,
          microShiftTicks: step.microShiftTicks
        }
      ];
    })
  );
};

export const getActiveDrumHitsAtStep = (
  project: Project,
  stepIndex: number
): Result<DrumHit[], CommandError> => getActiveDrumHitsForRack(project.drumRack, stepIndex);

export const getStepIndexByChannelAtTick = (
  drumRack: DrumRack,
  tickInBar: number,
  barTicks = getBarTicks()
): Record<string, number> =>
  Object.fromEntries(
    drumRack.channels.map((channel) => {
      const stepTicks = barTicks / channel.steps.length;
      const stepIndex = Math.floor(tickInBar / stepTicks) % channel.steps.length;

      return [channel.id, stepIndex];
    })
  );

export const getActiveDrumHitsAtTick = (
  drumRack: DrumRack,
  tickInBar: number,
  barTicks = getBarTicks()
): Result<DrumHit[], CommandError> => {
  if (!Number.isInteger(tickInBar) || tickInBar < 0 || tickInBar >= barTicks) {
    return err(commandError("INVALID_STEP_INDEX", "Tick must be inside the current bar."));
  }

  const hasSolo = drumRack.channels.some((channel) => channel.solo);

  return ok(
    drumRack.channels.flatMap((channel) => {
      if (channel.muted || (hasSolo && !channel.solo)) {
        return [];
      }

      const stepTicks = barTicks / channel.steps.length;

      if (tickInBar % stepTicks !== 0) {
        return [];
      }

      const stepIndex = tickInBar / stepTicks;
      const step = channel.steps[stepIndex];

      if (!step?.active) {
        return [];
      }

      return [
        {
          channelId: channel.id,
          channelName: channel.name,
          stepIndex,
          velocity: step.velocity,
          sampleId: channel.sampleId,
          microShiftTicks: step.microShiftTicks
        }
      ];
    })
  );
};
