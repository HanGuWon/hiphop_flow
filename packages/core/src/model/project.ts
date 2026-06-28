import { createId } from "@hipflow/shared";
import { createDefaultDrumRack, type DrumRack } from "./drum";
import { createDefaultBar, type Bar } from "./lyricGrid";
import { createDefaultTransport, type TransportState } from "./transport";

export interface TimeSignature {
  numerator: 4;
  denominator: 4;
}

export interface Pattern {
  id: string;
  name: string;
  barCount: number;
  loopStartBar: number;
  loopEndBar: number;
}

export interface Project {
  id: string;
  version: number;
  title: string;
  bpm: number;
  timeSignature: TimeSignature;
  transport: TransportState;
  bars: Bar[];
  drumRack: DrumRack;
  patterns: Pattern[];
  selectedPatternId: string;
  selectedCellIds: string[];
}

export const PROJECT_VERSION = 1;
export const DEFAULT_BPM = 92;
export const DEFAULT_TIME_SIGNATURE: TimeSignature = {
  numerator: 4,
  denominator: 4
};

export const createDefaultPattern = (barCount = 1): Pattern => ({
  id: "pattern_default",
  name: "Pattern 1",
  barCount,
  loopStartBar: 0,
  loopEndBar: barCount
});

export const createDefaultProject = (): Project => {
  const bars = [createDefaultBar(0)];
  const pattern = createDefaultPattern(bars.length);

  return {
    id: createId("project"),
    version: PROJECT_VERSION,
    title: "Untitled Flow",
    bpm: DEFAULT_BPM,
    timeSignature: DEFAULT_TIME_SIGNATURE,
    transport: createDefaultTransport(),
    bars,
    drumRack: createDefaultDrumRack(),
    patterns: [pattern],
    selectedPatternId: pattern.id,
    selectedCellIds: []
  };
};
