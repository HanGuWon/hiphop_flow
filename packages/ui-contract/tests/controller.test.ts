import { describe, expect, it } from "vitest";
import type { AudioEngine, TransportSnapshot } from "@hipflow/audio";
import { createDefaultProject, type DrumRack, type Pattern } from "@hipflow/core";
import { FlowStudioController, selectCanSplitSelectedCell, selectDrumChannels } from "../src";

class MockAudioEngine implements AudioEngine {
  readonly patterns: Pattern[] = [];
  readonly bpms: number[] = [];

  async loadSample(): Promise<void> {
    return Promise.resolve();
  }

  setBpm(bpm: number): void {
    this.bpms.push(bpm);
  }

  setPattern(pattern: Pattern, _drumRack: DrumRack): void {
    this.patterns.push(pattern);
  }

  async play(): Promise<void> {
    return Promise.resolve();
  }

  pause(): void {}

  stop(): void {}

  subscribeToTransport(_listener: (snapshot: TransportSnapshot) => void): () => void {
    return () => {};
  }
}

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

  it("syncs audio pattern length after adding bars", () => {
    const controller = new FlowStudioController();
    const audioEngine = new MockAudioEngine();

    controller.setAudioEngine(audioEngine);
    const result = controller.dispatch({ type: "project/addBar" });

    expect(result.ok).toBe(true);
    expect(audioEngine.patterns.at(-1)?.barCount).toBe(2);
  });

  it("undoes and redoes lyric and drum edits", () => {
    const controller = new FlowStudioController();
    const cellId = controller.getSnapshot().project.bars[0].lyricCells[0].id;

    controller.dispatch({
      type: "lyrics/updateCellText",
      cellId,
      text: "wait"
    });
    expect(controller.canUndo()).toBe(true);
    expect(controller.canRedo()).toBe(false);

    controller.undo();
    expect(controller.getSnapshot().project.bars[0].lyricCells[0].text).toBe("");
    expect(controller.canRedo()).toBe(true);

    controller.redo();
    expect(controller.getSnapshot().project.bars[0].lyricCells[0].text).toBe("wait");

    controller.dispatch({ type: "drum/toggleStep", channelId: "kick", stepIndex: 0 });
    expect(controller.getSnapshot().project.drumRack.channels[0].steps[0].active).toBe(true);

    controller.undo();
    expect(controller.getSnapshot().project.drumRack.channels[0].steps[0].active).toBe(false);

    controller.redo();
    expect(controller.getSnapshot().project.drumRack.channels[0].steps[0].active).toBe(true);
  });

  it("undoes split, merge, add bar, and remove bar edits", () => {
    const controller = new FlowStudioController();
    const cellId = controller.getSnapshot().project.bars[0].lyricCells[0].id;

    controller.dispatch({ type: "lyrics/splitCell", cellId, parts: 2 });
    const splitCellIds = controller.getSnapshot().selectedCellIds;
    expect(splitCellIds).toHaveLength(2);

    controller.dispatch({ type: "lyrics/mergeCells", cellIds: splitCellIds });
    expect(controller.getSnapshot().project.bars[0].lyricCells).toHaveLength(32);

    controller.undo();
    expect(controller.getSnapshot().project.bars[0].lyricCells).toHaveLength(33);

    controller.redo();
    expect(controller.getSnapshot().project.bars[0].lyricCells).toHaveLength(32);

    controller.dispatch({ type: "project/addBar" });
    const addedBar = controller.getSnapshot().project.bars.at(-1);
    expect(controller.getSnapshot().project.bars).toHaveLength(2);
    expect(addedBar).toBeDefined();

    if (!addedBar) {
      throw new Error("Expected added bar.");
    }

    controller.dispatch({ type: "project/removeBar", barId: addedBar.id });
    expect(controller.getSnapshot().project.bars).toHaveLength(1);

    controller.undo();
    expect(controller.getSnapshot().project.bars).toHaveLength(2);

    controller.redo();
    expect(controller.getSnapshot().project.bars).toHaveLength(1);
  });

  it("loads projects, clears history, and syncs audio", () => {
    const controller = new FlowStudioController();
    const audioEngine = new MockAudioEngine();
    const loadedProject = {
      ...createDefaultProject(),
      bpm: 128,
      title: "Loaded Flow"
    };

    controller.dispatch({ type: "transport/setBpm", bpm: 110 });
    expect(controller.canUndo()).toBe(true);

    controller.setAudioEngine(audioEngine);
    controller.loadProject(loadedProject);

    expect(controller.getSnapshot().project.title).toBe("Loaded Flow");
    expect(controller.getSnapshot().project.bpm).toBe(128);
    expect(controller.canUndo()).toBe(false);
    expect(controller.canRedo()).toBe(false);
    expect(audioEngine.bpms.at(-1)).toBe(128);
  });
});
