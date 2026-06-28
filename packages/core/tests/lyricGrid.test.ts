import { describe, expect, it } from "vitest";
import {
  DEFAULT_STEPS_PER_BAR,
  STEP_TICKS_16,
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
  it("creates a default bar with 16 cells of 240 ticks", () => {
    const project = createDefaultProject();
    const firstBar = project.bars[0];

    expect(firstBar.lyricCells).toHaveLength(DEFAULT_STEPS_PER_BAR);
    expect(firstBar.lyricCells.every((cell) => cell.durationTicks === STEP_TICKS_16)).toBe(true);
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

    expect(split.value.bars[0].lyricCells.slice(0, 3).map((cell) => cell.durationTicks)).toEqual([80, 80, 80]);
    expectValid(split.value);

    const merge = applyCommand(split.value, {
      type: "lyrics/mergeCells",
      cellIds: split.value.bars[0].lyricCells.slice(0, 3).map((cell) => cell.id)
    });

    expect(merge.ok).toBe(true);
    if (!merge.ok) {
      return;
    }

    expect(merge.value.bars[0].lyricCells[0].durationTicks).toBe(STEP_TICKS_16);
    expect(merge.value.bars[0].lyricCells).toHaveLength(DEFAULT_STEPS_PER_BAR);
    expectValid(merge.value);
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
