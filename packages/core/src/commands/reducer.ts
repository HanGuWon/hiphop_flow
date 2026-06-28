import { err, ok, type Result } from "@hipflow/shared";
import type { Project } from "../model/project";
import { validateProject } from "../validation/validateProject";
import {
  getActiveDrumHitsAtStep,
  muteChannel,
  setDrumVelocity,
  soloChannel,
  toggleDrumStep
} from "./drumCommands";
import { commandError, type Command, type CommandError } from "./commandTypes";
import {
  addBar,
  mergeCells,
  removeBar,
  selectCells,
  splitCell,
  updateCellText
} from "./lyricGridCommands";

const ensureValid = (projectResult: Result<Project, CommandError>): Result<Project, CommandError> => {
  if (!projectResult.ok) {
    return projectResult;
  }

  const validation = validateProject(projectResult.value);

  if (!validation.ok) {
    return err(
      commandError(
        "INVALID_PROJECT",
        validation.error.map((error) => `${error.path}: ${error.message}`).join("; ")
      )
    );
  }

  return projectResult;
};

export const applyCommand = (
  project: Project,
  command: Command
): Result<Project, CommandError> => {
  switch (command.type) {
    case "transport/setBpm": {
      if (!Number.isFinite(command.bpm) || command.bpm < 20 || command.bpm > 300) {
        return err(commandError("INVALID_BPM", "BPM must be between 20 and 300."));
      }

      return ensureValid(ok({ ...project, bpm: command.bpm }));
    }

    case "transport/play":
      return ensureValid(ok({ ...project, transport: { ...project.transport, isPlaying: true } }));

    case "transport/stop":
      return ensureValid(ok({ ...project, transport: { ...project.transport, isPlaying: false } }));

    case "drum/toggleStep":
      return ensureValid(toggleDrumStep(project, command.channelId, command.stepIndex));

    case "drum/setVelocity":
      return ensureValid(setDrumVelocity(project, command.channelId, command.stepIndex, command.velocity));

    case "drum/muteChannel":
      return ensureValid(muteChannel(project, command.channelId, command.muted));

    case "drum/soloChannel":
      return ensureValid(soloChannel(project, command.channelId, command.solo));

    case "lyrics/updateCellText":
      return ensureValid(updateCellText(project, command.cellId, command.text));

    case "lyrics/splitCell":
      return ensureValid(splitCell(project, command.cellId, command.parts));

    case "lyrics/mergeCells":
      return ensureValid(mergeCells(project, command.cellIds));

    case "lyrics/selectCells":
      return ensureValid(selectCells(project, command.cellIds));

    case "project/addBar":
      return ensureValid(addBar(project));

    case "project/removeBar":
      return ensureValid(removeBar(project, command.barId));

    default:
      return err(commandError("UNKNOWN_COMMAND", "Command type is not supported."));
  }
};

export { getActiveDrumHitsAtStep };
