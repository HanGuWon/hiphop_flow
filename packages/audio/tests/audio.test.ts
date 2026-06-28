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

  it("collects four kick hits in a 16-step cycle", () => {
    let project = createDefaultProject();

    [0, 4, 8, 12].forEach((stepIndex) => {
      project = mustApply(project, { type: "drum/toggleStep", channelId: "kick", stepIndex });
    });

    const hits = collectHitsForCycle(project.drumRack);

    expect(hits.ok).toBe(true);
    if (hits.ok) {
      expect(hits.value.map((hit) => hit.stepIndex)).toEqual([0, 4, 8, 12]);
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
});
