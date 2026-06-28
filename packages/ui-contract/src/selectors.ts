import {
  canMergeCells,
  canResizeCellBySteps,
  canSplitCell,
  type Bar,
  type DrumChannel,
  type LyricCell
} from "@hipflow/core";
import type { AppSnapshot } from "./events";

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
