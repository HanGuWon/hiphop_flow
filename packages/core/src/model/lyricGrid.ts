import { createId } from "@hipflow/shared";

export const PPQ = 960;
export const DEFAULT_BEATS_PER_BAR = 4;
export const DEFAULT_STEPS_PER_BAR = 16;
export const BAR_TICKS_4_4 = PPQ * DEFAULT_BEATS_PER_BAR;
export const STEP_TICKS_16 = BAR_TICKS_4_4 / DEFAULT_STEPS_PER_BAR;

export type Tick = number;
export type BarIndex = number;

export interface LyricCell {
  id: string;
  barId: string;
  startTick: Tick;
  durationTicks: Tick;
  text: string;
  note?: string;
  rhymeTag?: string;
  emphasis?: "none" | "light" | "strong";
}

export interface Bar {
  id: string;
  index: BarIndex;
  lyricCells: LyricCell[];
}

export const getBarTicks = (): Tick => BAR_TICKS_4_4;

export const createDefaultLyricCells = (barId: string): LyricCell[] =>
  Array.from({ length: DEFAULT_STEPS_PER_BAR }, (_, index) => ({
    id: createId("cell"),
    barId,
    startTick: index * STEP_TICKS_16,
    durationTicks: STEP_TICKS_16,
    text: ""
  }));

export const createDefaultBar = (index: BarIndex): Bar => {
  const id = createId("bar");

  return {
    id,
    index,
    lyricCells: createDefaultLyricCells(id)
  };
};
