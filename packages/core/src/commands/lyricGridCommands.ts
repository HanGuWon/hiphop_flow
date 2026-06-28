import { err, ok, type Result } from "@hipflow/shared";
import {
  LYRIC_RESIZE_STEP_TICKS,
  createDefaultBar,
  getBarTicks,
  type Bar,
  type LyricCell
} from "../model/lyricGrid";
import type { Project } from "../model/project";
import { commandError, type CommandError } from "./commandTypes";

interface CellLocation {
  barIndex: number;
  cellIndex: number;
  bar: Bar;
  cell: LyricCell;
}

const findCellLocation = (project: Project, cellId: string): CellLocation | undefined => {
  for (const [barIndex, bar] of project.bars.entries()) {
    const cellIndex = bar.lyricCells.findIndex((cell) => cell.id === cellId);

    if (cellIndex !== -1) {
      return {
        barIndex,
        cellIndex,
        bar,
        cell: bar.lyricCells[cellIndex]
      };
    }
  }

  return undefined;
};

const replaceBar = (project: Project, barIndex: number, bar: Bar): Project => ({
  ...project,
  bars: project.bars.map((candidate, index) => (index === barIndex ? bar : candidate))
});

const canApplyResizeDelta = (location: CellLocation, deltaTicks: number): boolean => {
  const cells = location.bar.lyricCells;
  const currentDuration = location.cell.durationTicks + deltaTicks;

  if (currentDuration < LYRIC_RESIZE_STEP_TICKS) {
    return false;
  }

  if (location.cellIndex < cells.length - 1) {
    const nextCell = cells[location.cellIndex + 1];

    return nextCell.durationTicks - deltaTicks >= LYRIC_RESIZE_STEP_TICKS;
  }

  if (location.cellIndex > 0) {
    const previousCell = cells[location.cellIndex - 1];

    return previousCell.durationTicks - deltaTicks >= LYRIC_RESIZE_STEP_TICKS;
  }

  return false;
};

const resizeCells = (location: CellLocation, deltaTicks: number): LyricCell[] => {
  const cells = location.bar.lyricCells;

  if (location.cellIndex < cells.length - 1) {
    const resizedDuration = location.cell.durationTicks + deltaTicks;

    return cells.map((cell, index) => {
      if (index === location.cellIndex) {
        return { ...cell, durationTicks: resizedDuration };
      }

      if (index === location.cellIndex + 1) {
        return {
          ...cell,
          startTick: location.cell.startTick + resizedDuration,
          durationTicks: cell.durationTicks - deltaTicks
        };
      }

      return cell;
    });
  }

  const previousCell = cells[location.cellIndex - 1];

  return cells.map((cell, index) => {
    if (index === location.cellIndex - 1) {
      return { ...cell, durationTicks: previousCell.durationTicks - deltaTicks };
    }

    if (index === location.cellIndex) {
      return {
        ...cell,
        startTick: cell.startTick - deltaTicks,
        durationTicks: cell.durationTicks + deltaTicks
      };
    }

    return cell;
  });
};

export const updateCellText = (
  project: Project,
  cellId: string,
  text: string
): Result<Project, CommandError> => {
  const location = findCellLocation(project, cellId);

  if (!location) {
    return err(commandError("CELL_NOT_FOUND", `Cell '${cellId}' was not found.`));
  }

  const nextBar: Bar = {
    ...location.bar,
    lyricCells: location.bar.lyricCells.map((cell) =>
      cell.id === cellId ? { ...cell, text } : cell
    )
  };

  return ok(replaceBar(project, location.barIndex, nextBar));
};

export const splitCell = (
  project: Project,
  cellId: string,
  parts: number
): Result<Project, CommandError> => {
  const location = findCellLocation(project, cellId);

  if (!location) {
    return err(commandError("CELL_NOT_FOUND", `Cell '${cellId}' was not found.`));
  }

  if (!Number.isInteger(parts) || parts < 2 || parts > 4 || location.cell.durationTicks % parts !== 0) {
    return err(commandError("INVALID_SPLIT", "Cell duration must divide evenly into 2, 3, or 4 parts."));
  }

  const durationTicks = location.cell.durationTicks / parts;
  const splitCells: LyricCell[] = Array.from({ length: parts }, (_, index) => ({
    ...location.cell,
    id: `${location.cell.id}_part_${index + 1}`,
    startTick: location.cell.startTick + index * durationTicks,
    durationTicks,
    text: index === 0 ? location.cell.text : ""
  }));

  const nextCells = [
    ...location.bar.lyricCells.slice(0, location.cellIndex),
    ...splitCells,
    ...location.bar.lyricCells.slice(location.cellIndex + 1)
  ];

  const nextBar: Bar = {
    ...location.bar,
    lyricCells: nextCells
  };

  return ok({
    ...replaceBar(project, location.barIndex, nextBar),
    selectedCellIds: splitCells.map((cell) => cell.id)
  });
};

export const canSplitCell = (project: Project, cellId: string, parts: number): boolean => {
  const location = findCellLocation(project, cellId);

  return Boolean(
    location &&
      Number.isInteger(parts) &&
      parts >= 2 &&
      parts <= 4 &&
      location.cell.durationTicks % parts === 0
  );
};

export const canResizeCellBySteps = (
  project: Project,
  cellId: string,
  deltaSteps: number
): boolean => {
  const location = findCellLocation(project, cellId);

  if (!location || !Number.isInteger(deltaSteps) || deltaSteps === 0) {
    return false;
  }

  return canApplyResizeDelta(location, deltaSteps * LYRIC_RESIZE_STEP_TICKS);
};

export const canMergeCells = (project: Project, cellIds: string[]): boolean => {
  if (cellIds.length < 2) {
    return false;
  }

  const locations = cellIds.map((cellId) => findCellLocation(project, cellId));

  if (locations.some((location) => !location)) {
    return false;
  }

  const resolved = locations.filter((location): location is CellLocation => Boolean(location));
  const barIndex = resolved[0].barIndex;

  if (resolved.some((location) => location.barIndex !== barIndex)) {
    return false;
  }

  const indexes = resolved.map((location) => location.cellIndex).sort((left, right) => left - right);
  const uniqueIndexes = new Set(indexes);

  if (uniqueIndexes.size !== indexes.length) {
    return false;
  }

  return indexes.every((index, position) => position === 0 || index === indexes[position - 1] + 1);
};

export const mergeCells = (
  project: Project,
  cellIds: string[]
): Result<Project, CommandError> => {
  if (!canMergeCells(project, cellIds)) {
    return err(commandError("INVALID_MERGE", "Only adjacent lyric cells in the same bar can be merged."));
  }

  const locations = cellIds
    .map((cellId) => findCellLocation(project, cellId))
    .filter((location): location is CellLocation => Boolean(location))
    .sort((left, right) => left.cell.startTick - right.cell.startTick);

  const first = locations[0];
  const last = locations[locations.length - 1];
  const text = locations
    .map((location) => location.cell.text.trim())
    .filter((value) => value.length > 0)
    .join(" ");

  const mergedCell: LyricCell = {
    ...first.cell,
    startTick: first.cell.startTick,
    durationTicks: last.cell.startTick + last.cell.durationTicks - first.cell.startTick,
    text
  };

  const selectedIndexes = new Set(locations.map((location) => location.cellIndex));
  const nextCells = first.bar.lyricCells.flatMap((cell, index) => {
    if (index === first.cellIndex) {
      return [mergedCell];
    }

    return selectedIndexes.has(index) ? [] : [cell];
  });

  const nextBar: Bar = {
    ...first.bar,
    lyricCells: nextCells
  };

  return ok({
    ...replaceBar(project, first.barIndex, nextBar),
    selectedCellIds: [mergedCell.id]
  });
};

export const resizeCellBySteps = (
  project: Project,
  cellId: string,
  deltaSteps: number
): Result<Project, CommandError> => {
  const location = findCellLocation(project, cellId);

  if (!location) {
    return err(commandError("CELL_NOT_FOUND", `Cell '${cellId}' was not found.`));
  }

  if (!Number.isInteger(deltaSteps) || deltaSteps === 0) {
    return err(commandError("INVALID_RESIZE", "Resize delta must be a non-zero whole number."));
  }

  const deltaTicks = deltaSteps * LYRIC_RESIZE_STEP_TICKS;

  if (!canApplyResizeDelta(location, deltaTicks)) {
    return err(commandError("INVALID_RESIZE", "Lyric cell cannot be resized past its neighbor."));
  }

  const nextBar: Bar = {
    ...location.bar,
    lyricCells: resizeCells(location, deltaTicks)
  };

  return ok(replaceBar(project, location.barIndex, nextBar));
};

export const selectCells = (
  project: Project,
  cellIds: string[]
): Result<Project, CommandError> => {
  const validCellIds = new Set(project.bars.flatMap((bar) => bar.lyricCells.map((cell) => cell.id)));
  const missingCellId = cellIds.find((cellId) => !validCellIds.has(cellId));

  if (missingCellId) {
    return err(commandError("CELL_NOT_FOUND", `Cell '${missingCellId}' was not found.`));
  }

  return ok({
    ...project,
    selectedCellIds: [...new Set(cellIds)]
  });
};

export const addBar = (project: Project): Result<Project, CommandError> => {
  const nextBars = [...project.bars, createDefaultBar(project.bars.length)];
  const nextPatterns = project.patterns.map((pattern) =>
    pattern.id === project.selectedPatternId
      ? { ...pattern, barCount: nextBars.length, loopEndBar: nextBars.length }
      : pattern
  );

  return ok({
    ...project,
    bars: nextBars,
    patterns: nextPatterns
  });
};

export const removeBar = (
  project: Project,
  barId: string
): Result<Project, CommandError> => {
  if (project.bars.length <= 1) {
    return err(commandError("BAR_NOT_FOUND", "Cannot remove the final bar."));
  }

  if (!project.bars.some((bar) => bar.id === barId)) {
    return err(commandError("BAR_NOT_FOUND", `Bar '${barId}' was not found.`));
  }

  const nextBars = project.bars
    .filter((bar) => bar.id !== barId)
    .map((bar, index) => ({ ...bar, index }));
  const nextPatterns = project.patterns.map((pattern) =>
    pattern.id === project.selectedPatternId
      ? { ...pattern, barCount: nextBars.length, loopEndBar: nextBars.length }
      : pattern
  );
  const validCellIds = new Set(nextBars.flatMap((bar) => bar.lyricCells.map((cell) => cell.id)));

  return ok({
    ...project,
    bars: nextBars,
    patterns: nextPatterns,
    selectedCellIds: project.selectedCellIds.filter((cellId) => validCellIds.has(cellId))
  });
};

export const assertDefaultBarCoverage = (bar: Bar): boolean =>
  bar.lyricCells.reduce((total, cell) => total + cell.durationTicks, 0) === getBarTicks();
