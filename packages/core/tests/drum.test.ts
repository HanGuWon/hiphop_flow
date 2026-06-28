import { describe, expect, it } from "vitest";
import {
  applyCommand,
  createDefaultProject,
  getActiveDrumHitsAtStep,
  muteChannel,
  soloChannel,
  toggleDrumStep
} from "../src";

describe("drum sequencing", () => {
  it("toggles a kick step on and off", () => {
    const project = createDefaultProject();

    const on = toggleDrumStep(project, "kick", 0);
    expect(on.ok).toBe(true);
    if (!on.ok) {
      return;
    }

    expect(on.value.drumRack.channels[0].steps[0].active).toBe(true);

    const off = toggleDrumStep(on.value, "kick", 0);
    expect(off.ok).toBe(true);
    if (!off.ok) {
      return;
    }

    expect(off.value.drumRack.channels[0].steps[0].active).toBe(false);
  });

  it("applies mute and solo rules when calculating hits", () => {
    const project = createDefaultProject();
    const kickOn = toggleDrumStep(project, "kick", 0);
    expect(kickOn.ok).toBe(true);
    if (!kickOn.ok) {
      return;
    }

    const snareOn = toggleDrumStep(kickOn.value, "snare", 0);
    expect(snareOn.ok).toBe(true);
    if (!snareOn.ok) {
      return;
    }

    const mutedKick = muteChannel(snareOn.value, "kick", true);
    expect(mutedKick.ok).toBe(true);
    if (!mutedKick.ok) {
      return;
    }

    const mutedHits = getActiveDrumHitsAtStep(mutedKick.value, 0);
    expect(mutedHits.ok).toBe(true);
    if (mutedHits.ok) {
      expect(mutedHits.value.map((hit) => hit.channelId)).toEqual(["snare"]);
    }

    const soloSnare = soloChannel(snareOn.value, "snare", true);
    expect(soloSnare.ok).toBe(true);
    if (!soloSnare.ok) {
      return;
    }

    const soloHits = getActiveDrumHitsAtStep(soloSnare.value, 0);
    expect(soloHits.ok).toBe(true);
    if (soloHits.ok) {
      expect(soloHits.value.map((hit) => hit.channelId)).toEqual(["snare"]);
    }
  });

  it("rejects invalid step indexes and velocities", () => {
    const project = createDefaultProject();

    const invalidStep = applyCommand(project, {
      type: "drum/toggleStep",
      channelId: "kick",
      stepIndex: 16
    });
    expect(invalidStep.ok).toBe(false);
    if (!invalidStep.ok) {
      expect(invalidStep.error.code).toBe("INVALID_STEP_INDEX");
    }

    const invalidVelocity = applyCommand(project, {
      type: "drum/setVelocity",
      channelId: "kick",
      stepIndex: 0,
      velocity: 1.2
    });
    expect(invalidVelocity.ok).toBe(false);
    if (!invalidVelocity.ok) {
      expect(invalidVelocity.error.code).toBe("INVALID_VELOCITY");
    }
  });
});
