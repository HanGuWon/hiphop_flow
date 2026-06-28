import { describe, expect, it } from "vitest";
import {
  DEFAULT_STEPS_PER_BAR,
  LYRIC_RESIZE_STEP_TICKS,
  STEP_TICKS_DEFAULT,
  applyCommand,
  createDefaultProject,
  validateProject,
  type Command
} from "../src";

const expectValid = (project: ReturnType<typeof createDefaultProject>): void => {
  const validation = validateProject(project);

  expect(validation.ok).toBe(true);
};

describe("lyric grid commands", () => {
  it("creates a default bar with 32 cells of 120 ticks", () => {
    const project = createDefaultProject();
    const firstBar = project.bars[0];

    expect(firstBar.lyricCells).toHaveLength(DEFAULT_STEPS_PER_BAR);
    expect(firstBar.lyricCells.every((cell) => cell.durationTicks === STEP_TICKS_DEFAULT)).toBe(true);
    expectValid(project);
  });

  it("splits one default cell into triplet cells and merges them back", () => {
    const project = createDefaultProject();
    const firstCellId = project.bars[0].lyricCells[0].id;

    const split = applyCommand(project, {
      type: "lyrics/splitCell",
      cellId: firstCellId,
      parts: 3
    });

    expect(split.ok).toBe(true);
    if (!split.ok) {
      return;
    }

    expect(split.value.bars[0].lyricCells.slice(0, 3).map((cell) => cell.durationTicks)).toEqual([40, 40, 40]);
    expectValid(split.value);

    const merge = applyCommand(split.value, {
      type: "lyrics/mergeCells",
      cellIds: split.value.bars[0].lyricCells.slice(0, 3).map((cell) => cell.id)
    });

    expect(merge.ok).toBe(true);
    if (!merge.ok) {
      return;
    }

    expect(merge.value.bars[0].lyricCells[0].durationTicks).toBe(STEP_TICKS_DEFAULT);
    expect(merge.value.bars[0].lyricCells).toHaveLength(DEFAULT_STEPS_PER_BAR);
    expectValid(merge.value);
  });

  it("resizes a lyric cell by nudge steps while keeping the bar gapless", () => {
    const project = createDefaultProject();
    const firstCellId = project.bars[0].lyricCells[0].id;

    const grown = applyCommand(project, {
      type: "lyrics/resizeCellBySteps",
      cellId: firstCellId,
      deltaSteps: 1
    });

    expect(grown.ok).toBe(true);
    if (!grown.ok) {
      return;
    }

    expect(grown.value.bars[0].lyricCells[0].durationTicks).toBe(
      STEP_TICKS_DEFAULT + LYRIC_RESIZE_STEP_TICKS
    );
    expect(grown.value.bars[0].lyricCells[1].startTick).toBe(
      STEP_TICKS_DEFAULT + LYRIC_RESIZE_STEP_TICKS
    );
    expect(grown.value.bars[0].lyricCells[1].durationTicks).toBe(
      STEP_TICKS_DEFAULT - LYRIC_RESIZE_STEP_TICKS
    );
    expectValid(grown.value);

    const restored = applyCommand(grown.value, {
      type: "lyrics/resizeCellBySteps",
      cellId: firstCellId,
      deltaSteps: -1
    });

    expect(restored.ok).toBe(true);
    if (!restored.ok) {
      return;
    }

    expect(restored.value.bars[0].lyricCells[0].durationTicks).toBe(STEP_TICKS_DEFAULT);
    expect(restored.value.bars[0].lyricCells[1].startTick).toBe(STEP_TICKS_DEFAULT);
    expectValid(restored.value);
  });

  it("adds bars with the same 32-cell lyric grid", () => {
    let project = createDefaultProject();

    for (let index = 1; index < 8; index += 1) {
      const added = applyCommand(project, { type: "project/addBar" });

      expect(added.ok).toBe(true);
      if (added.ok) {
        project = added.value;
      }
    }

    expect(project.bars).toHaveLength(8);
    expect(project.bars.every((bar) => bar.lyricCells.length === DEFAULT_STEPS_PER_BAR)).toBe(true);
    expectValid(project);
  });

  it("rejects non-adjacent merge and invalid split divisors", () => {
    const project = createDefaultProject();
    const firstBar = project.bars[0];

    const merge = applyCommand(project, {
      type: "lyrics/mergeCells",
      cellIds: [firstBar.lyricCells[0].id, firstBar.lyricCells[2].id]
    });

    expect(merge.ok).toBe(false);
    if (!merge.ok) {
      expect(merge.error.code).toBe("INVALID_MERGE");
    }

    const split = applyCommand(project, {
      type: "lyrics/splitCell",
      cellId: firstBar.lyricCells[0].id,
      parts: 5
    });

    expect(split.ok).toBe(false);
    if (!split.ok) {
      expect(split.error.code).toBe("INVALID_SPLIT");
    }
  });

  it("keeps project validation passing after successful commands", () => {
    let project = createDefaultProject();
    const firstCellId = project.bars[0].lyricCells[0].id;
    const commands: Command[] = [
      { type: "transport/setBpm", bpm: 88 },
      { type: "lyrics/updateCellText", cellId: firstCellId, text: "I" },
      { type: "lyrics/splitCell", cellId: firstCellId, parts: 2 }
    ];

    for (const command of commands) {
      const result = applyCommand(project, command);

      expect(result.ok).toBe(true);
      if (result.ok) {
        project = result.value;
        expectValid(project);
      }
    }
  });
});
