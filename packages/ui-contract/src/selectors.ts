import {
  canMergeCells,
  canResizeCellBySteps,
  canSplitCell,
  type Bar,
  type DrumChannel,
  type LyricCell
} from "@hipflow/core";
import type { AppSnapshot } from "./events";

export type LyricNavigationDirection = "previous" | "next" | "up" | "down";

interface LyricCellPosition {
  barIndex: number;
  cellIndex: number;
  cell: LyricCell;
}

const findLyricCellPosition = (
  snapshot: AppSnapshot,
  cellId: string
): LyricCellPosition | undefined => {
  for (const [barIndex, bar] of snapshot.project.bars.entries()) {
    const cellIndex = bar.lyricCells.findIndex((cell) => cell.id === cellId);

    if (cellIndex !== -1) {
      return { barIndex, cellIndex, cell: bar.lyricCells[cellIndex] };
    }
  }

  return undefined;
};

export const selectVisibleBars = (snapshot: AppSnapshot): readonly Bar[] => snapshot.project.bars;

export const selectBarCells = (
  snapshot: AppSnapshot,
  barId: string
): readonly LyricCell[] =>
  snapshot.project.bars.find((bar) => bar.id === barId)?.lyricCells ?? [];

export const selectLyricCellsByBar = (
  snapshot: AppSnapshot
): Readonly<Record<string, readonly LyricCell[]>> =>
  Object.fromEntries(snapshot.project.bars.map((bar) => [bar.id, bar.lyricCells]));

export const selectDrumChannels = (snapshot: AppSnapshot): readonly DrumChannel[] =>
  snapshot.project.drumRack.channels;

export const selectCurrentPlayhead = (
  snapshot: AppSnapshot
): Pick<AppSnapshot, "currentBarIndex" | "currentStepIndex16" | "currentTickInBar"> => ({
  currentBarIndex: snapshot.currentBarIndex,
  currentStepIndex16: snapshot.currentStepIndex16,
  currentTickInBar: snapshot.currentTickInBar
});

export const selectCanMergeSelectedCells = (snapshot: AppSnapshot): boolean =>
  canMergeCells(snapshot.project, snapshot.selectedCellIds);

export const selectCanSplitSelectedCell = (snapshot: AppSnapshot, parts: number): boolean =>
  snapshot.selectedCellIds.length === 1 &&
  canSplitCell(snapshot.project, snapshot.selectedCellIds[0], parts);

export const selectCanResizeSelectedCell = (snapshot: AppSnapshot, deltaSteps: number): boolean =>
  snapshot.selectedCellIds.length === 1 &&
  canResizeCellBySteps(snapshot.project, snapshot.selectedCellIds[0], deltaSteps);

export const selectLyricCellNavigationTarget = (
  snapshot: AppSnapshot,
  cellId: string,
  direction: LyricNavigationDirection
): string | undefined => {
  const position = findLyricCellPosition(snapshot, cellId);

  if (!position) {
    return undefined;
  }

  if (direction === "previous" || direction === "next") {
    const cells = snapshot.project.bars.flatMap((bar) => bar.lyricCells);
    const currentIndex = cells.findIndex((cell) => cell.id === cellId);
    const targetIndex = currentIndex + (direction === "previous" ? -1 : 1);

    return cells[targetIndex]?.id;
  }

  const targetBarIndex = position.barIndex + (direction === "up" ? -1 : 1);
  const targetBar = snapshot.project.bars[targetBarIndex];

  if (!targetBar) {
    return undefined;
  }

  const centerTick = position.cell.startTick + position.cell.durationTicks / 2;
  const targetCell =
    targetBar.lyricCells.find(
      (cell) => centerTick >= cell.startTick && centerTick < cell.startTick + cell.durationTicks
    ) ?? targetBar.lyricCells.at(-1);

  return targetCell?.id;
};

export const selectLyricCellRange = (
  snapshot: AppSnapshot,
  anchorCellId: string,
  targetCellId: string
): string[] => {
  const anchor = findLyricCellPosition(snapshot, anchorCellId);
  const target = findLyricCellPosition(snapshot, targetCellId);

  if (!anchor || !target) {
    return [];
  }

  if (anchor.barIndex !== target.barIndex) {
    return [targetCellId];
  }

  const startIndex = Math.min(anchor.cellIndex, target.cellIndex);
  const endIndex = Math.max(anchor.cellIndex, target.cellIndex);

  return snapshot.project.bars[anchor.barIndex].lyricCells
    .slice(startIndex, endIndex + 1)
    .map((cell) => cell.id);
};
