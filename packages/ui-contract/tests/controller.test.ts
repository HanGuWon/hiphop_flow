import { describe, expect, it } from "vitest";
import { FlowStudioController, selectCanSplitSelectedCell, selectDrumChannels } from "../src";

describe("@hipflow/ui-contract", () => {
  it("dispatches commands and notifies subscribers", () => {
    const controller = new FlowStudioController();
    const snapshots: ReturnType<FlowStudioController["getSnapshot"]>[] = [];
    const unsubscribe = controller.subscribe((snapshot) => snapshots.push(snapshot));
    const cellId = controller.getSnapshot().project.bars[0].lyricCells[0].id;

    const result = controller.dispatch({
      type: "lyrics/updateCellText",
      cellId,
      text: "wait"
    });

    expect(result.ok).toBe(true);
    expect(snapshots).toHaveLength(1);
    expect(controller.getSnapshot().project.bars[0].lyricCells[0].text).toBe("wait");

    unsubscribe();
  });

  it("returns invalid command errors without mutating state", () => {
    const controller = new FlowStudioController();
    const before = controller.getSnapshot();

    const result = controller.dispatch({
      type: "drum/toggleStep",
      channelId: "kick",
      stepIndex: 99
    });

    expect(result.ok).toBe(false);
    expect(controller.getSnapshot()).toEqual(before);
  });

  it("selects default drum channels and split capability", () => {
    const controller = new FlowStudioController();
    const cellId = controller.getSnapshot().project.bars[0].lyricCells[0].id;

    controller.dispatch({ type: "lyrics/selectCells", cellIds: [cellId] });
    const snapshot = controller.getSnapshot();

    expect(selectDrumChannels(snapshot).map((channel) => channel.id)).toEqual([
      "kick",
      "snare",
      "clap",
      "hihat"
    ]);
    expect(selectCanSplitSelectedCell(snapshot, 3)).toBe(true);
  });
});
