import { describe, expect, it } from "vitest";
import { applyCommand, createDefaultProject, type Project } from "@hipflow/core";
import { collectHitsForCycle, ToneTransportEngine, type SampleTriggerer } from "../src";

class MockSamplePlayer implements SampleTriggerer {
  readonly triggers: Array<{ channelId: string; time: number; velocity: number }> = [];

  async loadSample(): Promise<void> {
    return Promise.resolve();
  }

  trigger(channelId: string, time: number, velocity: number): void {
    this.triggers.push({ channelId, time, velocity });
  }
}

const mustApply = (project: Project, command: Parameters<typeof applyCommand>[1]): Project => {
  const result = applyCommand(project, command);

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return result.value;
};

describe("@hipflow/audio", () => {
  it("updates BPM in the transport snapshot", () => {
    const engine = new ToneTransportEngine();

    engine.setBpm(104);

    expect(engine.getTransportSnapshot().bpm).toBe(104);
  });

  it("collects four kick hits in a 32-step cycle", () => {
    let project = createDefaultProject();

    [0, 8, 16, 24].forEach((stepIndex) => {
      project = mustApply(project, { type: "drum/toggleStep", channelId: "kick", stepIndex });
    });

    const hits = collectHitsForCycle(project.drumRack);

    expect(hits.ok).toBe(true);
    if (hits.ok) {
      expect(hits.value.map((hit) => hit.stepIndex)).toEqual([0, 8, 16, 24]);
    }
  });

  it("collects triplet hi-hat hits from a 24-step channel", () => {
    let project = createDefaultProject();
    project = mustApply(project, {
      type: "drum/setChannelStepCount",
      channelId: "hihat",
      stepCount: 24
    });
    [0, 3, 6].forEach((stepIndex) => {
      project = mustApply(project, { type: "drum/toggleStep", channelId: "hihat", stepIndex });
    });

    const hits = collectHitsForCycle(project.drumRack);

    expect(hits.ok).toBe(true);
    if (hits.ok) {
      expect(hits.value.map((hit) => `${hit.channelId}:${hit.stepIndex}`)).toEqual([
        "hihat:0",
        "hihat:3",
        "hihat:6"
      ]);
    }
  });

  it("triggers sample hits when manually advancing the transport", () => {
    let project = createDefaultProject();
    project = mustApply(project, { type: "drum/toggleStep", channelId: "kick", stepIndex: 0 });
    const samplePlayer = new MockSamplePlayer();
    const engine = new ToneTransportEngine(project, samplePlayer);

    engine.advanceOneStepForTest(12.5);

    expect(samplePlayer.triggers).toEqual([{ channelId: "kick", time: 12.5, velocity: 1 }]);
  });

  it("advances one 4/4 bar after 96 transport pulses", () => {
    let project = createDefaultProject();
    project = mustApply(project, { type: "project/addBar" });
    const engine = new ToneTransportEngine(project, new MockSamplePlayer());

    for (let index = 0; index < 96; index += 1) {
      engine.advanceOneStepForTest();
    }

    expect(engine.getTransportSnapshot().barIndex).toBe(1);
  });

  it("pauses without resetting the playhead", () => {
    const engine = new ToneTransportEngine();
    engine.advanceOneStepForTest();
    const beforePause = engine.getTransportSnapshot();

    engine.pause();
    const afterPause = engine.getTransportSnapshot();

    expect(afterPause.isPlaying).toBe(false);
    expect(afterPause.pulseIndex).toBe(beforePause.pulseIndex);
  });
});
