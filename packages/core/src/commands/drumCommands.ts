import { err, ok, type Result } from "@hipflow/shared";
import { DEFAULT_STEPS_PER_BAR } from "../model/lyricGrid";
import type { DrumHit, DrumRack } from "../model/drum";
import type { Project } from "../model/project";
import { commandError, type CommandError } from "./commandTypes";

const validateStepIndex = (stepIndex: number): Result<void, CommandError> => {
  if (!Number.isInteger(stepIndex) || stepIndex < 0 || stepIndex >= DEFAULT_STEPS_PER_BAR) {
    return err(commandError("INVALID_STEP_INDEX", "Step index must be between 0 and 15."));
  }

  return ok(undefined);
};

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
  const validStep = validateStepIndex(stepIndex);

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
  const validStep = validateStepIndex(stepIndex);

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
  const validStep = validateStepIndex(stepIndex);

  if (!validStep.ok) {
    return validStep;
  }

  const hasSolo = drumRack.channels.some((channel) => channel.solo);

  return ok(
    drumRack.channels.flatMap((channel) => {
      if (channel.muted || (hasSolo && !channel.solo)) {
        return [];
      }

      const step = channel.steps[stepIndex];

      if (!step.active) {
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
