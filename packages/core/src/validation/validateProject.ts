import { err, ok, type Result } from "@hipflow/shared";
import { DEFAULT_STEPS_PER_BAR, getBarTicks } from "../model/lyricGrid";
import type { Project } from "../model/project";

export interface ValidationError {
  code: string;
  message: string;
  path: string;
}

const pushError = (
  errors: ValidationError[],
  path: string,
  code: string,
  message: string
): void => {
  errors.push({ path, code, message });
};

export const validateProject = (project: Project): Result<void, ValidationError[]> => {
  const errors: ValidationError[] = [];
  const barTicks = getBarTicks();

  if (!Number.isFinite(project.bpm) || project.bpm <= 0) {
    pushError(errors, "project.bpm", "invalid_bpm", "BPM must be positive.");
  }

  if (project.timeSignature.numerator !== 4 || project.timeSignature.denominator !== 4) {
    pushError(errors, "project.timeSignature", "unsupported_time_signature", "Only 4/4 is supported in the MVP.");
  }

  if (project.bars.length === 0) {
    pushError(errors, "project.bars", "no_bars", "Project must contain at least one bar.");
  }

  project.bars.forEach((bar, barIndex) => {
    if (bar.index !== barIndex) {
      pushError(errors, `bars.${barIndex}.index`, "bar_index_mismatch", "Bar index must match array order.");
    }

    let expectedStartTick = 0;
    bar.lyricCells.forEach((cell, cellIndex) => {
      const path = `bars.${barIndex}.lyricCells.${cellIndex}`;

      if (cell.barId !== bar.id) {
        pushError(errors, `${path}.barId`, "cell_bar_mismatch", "Lyric cell must belong to its bar.");
      }

      if (!Number.isInteger(cell.startTick) || cell.startTick !== expectedStartTick) {
        pushError(errors, `${path}.startTick`, "cell_gap_or_overlap", "Lyric cells must be sorted and gapless.");
      }

      if (!Number.isInteger(cell.durationTicks) || cell.durationTicks <= 0) {
        pushError(errors, `${path}.durationTicks`, "invalid_duration", "Lyric cell duration must be positive.");
      }

      expectedStartTick = cell.startTick + cell.durationTicks;
    });

    if (expectedStartTick !== barTicks) {
      pushError(errors, `bars.${barIndex}.lyricCells`, "bar_not_filled", "Lyric cells must cover the full bar.");
    }
  });

  project.drumRack.channels.forEach((channel, channelIndex) => {
    if (channel.steps.length !== DEFAULT_STEPS_PER_BAR) {
      pushError(errors, `drumRack.channels.${channelIndex}.steps`, "invalid_step_count", "Drum channels must have 16 steps.");
    }

    channel.steps.forEach((step, stepIndex) => {
      const path = `drumRack.channels.${channelIndex}.steps.${stepIndex}`;

      if (step.stepIndex !== stepIndex) {
        pushError(errors, `${path}.stepIndex`, "step_index_mismatch", "Step index must match array order.");
      }

      if (!Number.isFinite(step.velocity) || step.velocity < 0 || step.velocity > 1) {
        pushError(errors, `${path}.velocity`, "invalid_velocity", "Step velocity must be between 0 and 1.");
      }
    });
  });

  const selectedPatternExists = project.patterns.some((pattern) => pattern.id === project.selectedPatternId);
  if (!selectedPatternExists) {
    pushError(errors, "project.selectedPatternId", "missing_pattern", "Selected pattern must exist.");
  }

  const cellIds = new Set(project.bars.flatMap((bar) => bar.lyricCells.map((cell) => cell.id)));
  project.selectedCellIds.forEach((cellId, index) => {
    if (!cellIds.has(cellId)) {
      pushError(errors, `selectedCellIds.${index}`, "missing_selected_cell", "Selected cell must exist.");
    }
  });

  return errors.length > 0 ? err(errors) : ok(undefined);
};
