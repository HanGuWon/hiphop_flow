import { SlidersHorizontal } from "lucide-react";
import {
  DEFAULT_STEPS_PER_BAR,
  DRUM_STEP_COUNT_OPTIONS,
  type Command,
  type DrumChannel
} from "@hipflow/core";

type DispatchCommand = (command: Command) => void;

export interface SelectedDrumStep {
  channelId: string;
  stepIndex: number;
}

interface DrumRackProps {
  channels: readonly DrumChannel[];
  currentStepsByChannel: Readonly<Record<string, number>>;
  dispatch: DispatchCommand;
  selectedDrumStep: SelectedDrumStep | undefined;
  onSelectDrumStep: (step: SelectedDrumStep) => void;
}

const DRUM_TIMELINE_COLUMNS = 192;
const BEATS_PER_BAR = 4;

const getResolutionLabel = (stepCount: number): string => {
  switch (stepCount) {
    case 16:
      return "16 / 1/16";
    case 24:
      return "24 / triplet";
    case 32:
      return "32 / 1/32";
    case 48:
      return "48 / triplet";
    case 96:
      return "96 / fine";
    default:
      return String(stepCount);
  }
};

export const DrumRack = ({
  channels,
  currentStepsByChannel,
  dispatch,
  selectedDrumStep,
  onSelectDrumStep
}: DrumRackProps) => {
  const selectedChannel = channels.find((channel) => channel.id === selectedDrumStep?.channelId);
  const selectedStep = selectedChannel?.steps.find(
    (step) => step.stepIndex === selectedDrumStep?.stepIndex
  );

  return (
    <section className="rack-section" aria-label="Drum rack">
      <div className="section-heading">
        <div>
          <span className="section-kicker">Pattern</span>
          <h2>Drum rack</h2>
        </div>
        <span className="section-meter">{DEFAULT_STEPS_PER_BAR}-step bar</span>
      </div>

      <div className="rack-scroll">
        <div className="rack-grid-surface">
          <div className="step-header" aria-hidden="true">
            <span />
            <div className="step-beat-grid">
              {Array.from({ length: BEATS_PER_BAR }, (_, beatIndex) => (
                <span
                  key={beatIndex}
                  style={{ gridColumn: `span ${DRUM_TIMELINE_COLUMNS / BEATS_PER_BAR}` }}
                >
                  Beat {beatIndex + 1}
                </span>
              ))}
            </div>
          </div>

          {channels.map((channel) => (
            <div className="drum-row" data-channel={channel.id} key={channel.id}>
              <div className="channel-meta">
                <div className="channel-label-row">
                  <div className="channel-label">{channel.name}</div>
                  <button
                    aria-label={`Mute ${channel.name}`}
                    aria-pressed={channel.muted}
                    className={["mini-toggle", channel.muted ? "is-on" : ""]
                      .filter(Boolean)
                      .join(" ")}
                    title={`Mute ${channel.name}`}
                    type="button"
                    onClick={() =>
                      dispatch({
                        type: "drum/muteChannel",
                        channelId: channel.id,
                        muted: !channel.muted
                      })
                    }
                  >
                    M
                  </button>
                  <button
                    aria-label={`Solo ${channel.name}`}
                    aria-pressed={channel.solo}
                    className={["mini-toggle", channel.solo ? "is-on" : ""]
                      .filter(Boolean)
                      .join(" ")}
                    title={`Solo ${channel.name}`}
                    type="button"
                    onClick={() =>
                      dispatch({
                        type: "drum/soloChannel",
                        channelId: channel.id,
                        solo: !channel.solo
                      })
                    }
                  >
                    S
                  </button>
                </div>
                {channel.id === "hihat" ? (
                  <label className="resolution-control">
                    <span>Grid</span>
                    <select
                      aria-label="Hi-hat grid resolution"
                      value={channel.steps.length}
                      onChange={(event) =>
                        dispatch({
                          type: "drum/setChannelStepCount",
                          channelId: channel.id,
                          stepCount: Number(event.currentTarget.value)
                        })
                      }
                    >
                      {DRUM_STEP_COUNT_OPTIONS.map((stepCount) => (
                        <option key={stepCount} value={stepCount}>
                          {getResolutionLabel(stepCount)}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>

              <div className="step-grid">
                {channel.steps.map((step) => (
                  <button
                    aria-label={`${channel.name} step ${step.stepIndex + 1}`}
                    aria-pressed={step.active}
                    className={[
                      "step-button",
                      step.active ? "is-active" : "",
                      step.stepIndex === currentStepsByChannel[channel.id] ? "is-current" : "",
                      step.stepIndex % (channel.steps.length / BEATS_PER_BAR) === 0
                        ? "is-beat-start"
                        : "",
                      selectedDrumStep?.channelId === channel.id &&
                      selectedDrumStep.stepIndex === step.stepIndex
                        ? "is-selected"
                        : ""
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    key={step.stepIndex}
                    style={{ gridColumn: `span ${DRUM_TIMELINE_COLUMNS / channel.steps.length}` }}
                    title={`${channel.name} ${step.stepIndex + 1}, velocity ${Math.round(step.velocity * 100)}%`}
                    type="button"
                    onClick={() => {
                      onSelectDrumStep({ channelId: channel.id, stepIndex: step.stepIndex });
                      dispatch({
                        type: "drum/toggleStep",
                        channelId: channel.id,
                        stepIndex: step.stepIndex
                      });
                    }}
                  />
                ))}
              </div>
            </div>
          ))}

          <div className="step-editor">
            <div className="step-editor-label">
              <SlidersHorizontal aria-hidden="true" size={15} />
              <span>
                {selectedChannel && selectedStep
                  ? `${selectedChannel.name} / ${selectedStep.stepIndex + 1}`
                  : "Select a step"}
              </span>
            </div>
            <label className="velocity-control">
              <span>Velocity</span>
              <input
                aria-label="Selected step velocity"
                disabled={!selectedChannel || !selectedStep}
                max={1}
                min={0}
                step={0.01}
                type="range"
                value={selectedStep?.velocity ?? 0}
                onInput={(event) => {
                  if (!selectedChannel || !selectedStep) {
                    return;
                  }

                  dispatch({
                    type: "drum/setVelocity",
                    channelId: selectedChannel.id,
                    stepIndex: selectedStep.stepIndex,
                    velocity: Number(event.currentTarget.value)
                  });
                }}
              />
            </label>
            <output className="velocity-readout">
              {selectedStep ? `${Math.round(selectedStep.velocity * 100)}%` : "--"}
            </output>
          </div>
        </div>
      </div>
    </section>
  );
};
