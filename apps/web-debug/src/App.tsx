import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { ToneTransportEngine } from "@hipflow/audio";
import {
  DRUM_STEP_COUNT_OPTIONS,
  DEFAULT_STEPS_PER_BAR,
  STEP_TICKS_DEFAULT,
  getBarTicks,
  type Bar,
  type Command,
  type DrumChannel,
  type LyricCell
} from "@hipflow/core";
import {
  FlowStudioController,
  selectCanMergeSelectedCells,
  selectCanResizeSelectedCell,
  selectCanSplitSelectedCell,
  selectDrumChannels,
  selectVisibleBars,
  type AppSnapshot
} from "@hipflow/ui-contract";
import "./App.css";

type DispatchCommand = (command: Command) => void;

const DRUM_TIMELINE_COLUMNS = 192;
const TARGET_LYRIC_BAR_COUNT = 8;
const SAMPLE_URLS: Record<string, string> = {
  kick: "/samples/kick.mp3",
  snare: "/samples/snare.mp3",
  clap: "/samples/clap.mp3",
  hihat: "/samples/hihat.mp3"
};

interface TransportBarProps {
  snapshot: AppSnapshot;
  onBpmChange: (bpm: number) => void;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  samplesReady: boolean;
}

interface DrumRackProps {
  channels: readonly DrumChannel[];
  currentStepsByChannel: Readonly<Record<string, number>>;
  dispatch: DispatchCommand;
}

interface LyricsGridProps {
  bars: readonly Bar[];
  snapshot: AppSnapshot;
  dispatch: DispatchCommand;
  canGrowSelectedCell: boolean;
  canShrinkSelectedCell: boolean;
  onAddBar: () => void;
  onSetEightBars: () => void;
}

interface LyricCellProps {
  bar: Bar;
  cell: LyricCell;
  snapshot: AppSnapshot;
  dispatch: DispatchCommand;
}

const isTextEntryTarget = (target: EventTarget): boolean =>
  target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;

const getDefaultGridStepIndex = (tickInBar: number): number =>
  Math.min(DEFAULT_STEPS_PER_BAR - 1, Math.floor(tickInBar / STEP_TICKS_DEFAULT));

const TransportBar = ({
  snapshot,
  onBpmChange,
  onPlay,
  onPause,
  onStop,
  samplesReady
}: TransportBarProps) => (
  <header className="transport-bar">
    <div className="brand">HipFlow Studio</div>
    <label className="bpm-control">
      <span>BPM</span>
      <input
        value={snapshot.project.bpm}
        min={20}
        max={300}
        type="number"
        onChange={(event) => onBpmChange(Number(event.currentTarget.value))}
      />
    </label>
    <button
      className="command-button play-button"
      disabled={!samplesReady}
      title={samplesReady ? "Play" : "Samples loading"}
      type="button"
      onClick={onPlay}
    >
      Play
    </button>
    <button className="command-button pause-button" type="button" onClick={onPause}>
      Pause
    </button>
    <button className="command-button" type="button" onClick={onStop}>
      Stop
    </button>
    <div className="transport-readout">
      <span>Bar {snapshot.currentBarIndex + 1}</span>
      <span>Cell {getDefaultGridStepIndex(snapshot.currentTickInBar) + 1}/{DEFAULT_STEPS_PER_BAR}</span>
    </div>
  </header>
);

const DrumRack = ({ channels, currentStepsByChannel, dispatch }: DrumRackProps) => (
  <section className="rack-section" aria-label="Drum rack">
    <div className="step-header" aria-hidden="true">
      <span />
      <div className="step-number-grid">
        {Array.from({ length: DEFAULT_STEPS_PER_BAR }, (_, stepIndex) => (
          <span key={stepIndex} style={{ gridColumn: `span ${DRUM_TIMELINE_COLUMNS / DEFAULT_STEPS_PER_BAR}` }}>
            {stepIndex + 1}
          </span>
        ))}
      </div>
    </div>
    {channels.map((channel) => (
      <div className="drum-row" key={channel.id}>
        <div className="channel-meta">
          <div className="channel-label">{channel.name}</div>
          {channel.id === "hihat" ? (
            <label className="resolution-control">
              <span>Steps</span>
              <select
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
                    {stepCount}
                    {stepCount === 24 || stepCount === 48 ? " triplet" : ""}
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
              className={[
                "step-button",
                step.active ? "is-active" : "",
                step.stepIndex === currentStepsByChannel[channel.id] ? "is-current" : ""
              ]
                .filter(Boolean)
                .join(" ")}
              key={step.stepIndex}
              style={{ gridColumn: `span ${DRUM_TIMELINE_COLUMNS / channel.steps.length}` }}
              type="button"
              onClick={() =>
                dispatch({
                  type: "drum/toggleStep",
                  channelId: channel.id,
                  stepIndex: step.stepIndex
                })
              }
            />
          ))}
        </div>
      </div>
    ))}
  </section>
);

const LyricsGrid = ({
  bars,
  snapshot,
  dispatch,
  canGrowSelectedCell,
  canShrinkSelectedCell,
  onAddBar,
  onSetEightBars
}: LyricsGridProps) => {
  const selectedCellId = snapshot.selectedCellIds.length === 1 ? snapshot.selectedCellIds[0] : undefined;

  return (
    <section className="lyrics-section" aria-label="Lyrics grid">
      <div className="lyrics-toolbar">
        <div className="toolbar-group">
          <button className="tool-button" type="button" onClick={onAddBar}>
            + Bar
          </button>
          <button
            className="tool-button"
            disabled={bars.length >= TARGET_LYRIC_BAR_COUNT}
            type="button"
            onClick={onSetEightBars}
          >
            8 Bars
          </button>
        </div>
        <div className="toolbar-group">
          <button
            aria-label="Shorten selected lyric cell"
            className="tool-button nudge-button"
            disabled={!selectedCellId || !canShrinkSelectedCell}
            title="Shorten cell"
            type="button"
            onClick={() => {
              if (selectedCellId) {
                dispatch({ type: "lyrics/resizeCellBySteps", cellId: selectedCellId, deltaSteps: -1 });
              }
            }}
          >
            -
          </button>
          <button
            aria-label="Lengthen selected lyric cell"
            className="tool-button nudge-button"
            disabled={!selectedCellId || !canGrowSelectedCell}
            title="Lengthen cell"
            type="button"
            onClick={() => {
              if (selectedCellId) {
                dispatch({ type: "lyrics/resizeCellBySteps", cellId: selectedCellId, deltaSteps: 1 });
              }
            }}
          >
            +
          </button>
        </div>
      </div>
      {bars.map((bar) => (
        <div className="bar-row" key={bar.id}>
          <div className="bar-label">Bar {bar.index + 1}</div>
          <div className="lyric-cells" role="grid" aria-label={`Bar ${bar.index + 1} lyric cells`}>
            {bar.lyricCells.map((cell) => (
              <LyricCellView
                bar={bar}
                cell={cell}
                dispatch={dispatch}
                key={cell.id}
                snapshot={snapshot}
              />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
};

const LyricCellView = ({ bar, cell, snapshot, dispatch }: LyricCellProps) => {
  const isSelected = snapshot.selectedCellIds.includes(cell.id);
  const isCurrent =
    bar.index === snapshot.currentBarIndex &&
    snapshot.currentTickInBar >= cell.startTick &&
    snapshot.currentTickInBar < cell.startTick + cell.durationTicks;
  const widthWeight = cell.durationTicks / getBarTicks();

  return (
    <input
      aria-label={`Bar ${bar.index + 1} lyric cell at ${cell.startTick}`}
      className={[
        "lyric-cell",
        isSelected ? "is-selected" : "",
        isCurrent ? "is-current" : ""
      ]
        .filter(Boolean)
        .join(" ")}
      role="gridcell"
      style={{ flexGrow: widthWeight, flexBasis: 0 }}
      value={cell.text}
      onChange={(event) =>
        dispatch({
          type: "lyrics/updateCellText",
          cellId: cell.id,
          text: event.currentTarget.value
        })
      }
      onClick={(event) => {
        const nextSelection = event.ctrlKey
          ? [...snapshot.selectedCellIds, cell.id]
          : [cell.id];

        dispatch({ type: "lyrics/selectCells", cellIds: nextSelection });
      }}
      onFocus={() => {
        if (!isSelected) {
          dispatch({ type: "lyrics/selectCells", cellIds: [cell.id] });
        }
      }}
    />
  );
};

export const App = () => {
  const controller = useMemo(() => new FlowStudioController(), []);
  const [snapshot, setSnapshot] = useState(() => controller.getSnapshot());
  const [error, setError] = useState("");
  const [samplesReady, setSamplesReady] = useState(false);

  useEffect(() => {
    const audioEngine = new ToneTransportEngine(controller.getSnapshot().project);
    controller.setAudioEngine(audioEngine);
    let isMounted = true;

    setSamplesReady(false);
    Promise.all(
      Object.entries(SAMPLE_URLS).map(([channelId, url]) => audioEngine.loadSample(channelId, url))
    )
      .then(() => {
        if (isMounted) {
          setSamplesReady(true);
          setError((currentError) =>
            currentError === "Samples are still loading." ? "" : currentError
          );
        }
      })
      .catch((sampleError: unknown) => {
        if (isMounted) {
          setSamplesReady(false);
          setError(sampleError instanceof Error ? sampleError.message : "Samples could not load.");
        }
      });

    const unsubscribe = controller.subscribe((nextSnapshot) => {
      setSnapshot(nextSnapshot);
    });

    return () => {
      isMounted = false;
      audioEngine.stop();
      unsubscribe();
    };
  }, [controller]);

  const dispatch = useCallback(
    (command: Command) => {
      const result = controller.dispatch(command);

      if (!result.ok) {
        setError(result.error.message);
        return;
      }

      setError("");
      setSnapshot(result.value);
    },
    [controller]
  );

  const handleBpmChange = useCallback(
    (bpm: number) => {
      dispatch({ type: "transport/setBpm", bpm });
    },
    [dispatch]
  );

  const handlePlay = useCallback(() => {
    if (!samplesReady) {
      setError("Samples are still loading.");
      return;
    }

    controller.start().catch((playError: unknown) => {
      setError(playError instanceof Error ? playError.message : "Playback could not start.");
    });
  }, [controller, samplesReady]);

  const handlePause = useCallback(() => {
    controller.pause();
  }, [controller]);

  const handleStop = useCallback(() => {
    controller.stop();
  }, [controller]);

  const handleAddBar = useCallback(() => {
    dispatch({ type: "project/addBar" });
  }, [dispatch]);

  const handleSetEightBars = useCallback(() => {
    for (let barIndex = snapshot.project.bars.length; barIndex < TARGET_LYRIC_BAR_COUNT; barIndex += 1) {
      dispatch({ type: "project/addBar" });
    }
  }, [dispatch, snapshot.project.bars.length]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (event.ctrlKey && event.key.toLowerCase() === "m") {
        event.preventDefault();
        if (selectCanMergeSelectedCells(snapshot)) {
          dispatch({ type: "lyrics/mergeCells", cellIds: snapshot.selectedCellIds });
        }
      }

      if (event.ctrlKey && event.altKey && ["2", "3", "4"].includes(event.key)) {
        event.preventDefault();
        const parts = Number(event.key);

        if (selectCanSplitSelectedCell(snapshot, parts)) {
          dispatch({
            type: "lyrics/splitCell",
            cellId: snapshot.selectedCellIds[0],
            parts
          });
        }
      }

      if (isTextEntryTarget(event.target) && event.key !== "Escape") {
        return;
      }

      if (event.key === " " && !event.ctrlKey && !event.altKey && !event.metaKey) {
        event.preventDefault();
        if (snapshot.transport.isPlaying) {
          handlePause();
        } else {
          handlePlay();
        }
      }
    },
    [dispatch, handlePause, handlePlay, snapshot]
  );

  const channels = selectDrumChannels(snapshot);
  const bars = selectVisibleBars(snapshot);
  const canGrowSelectedCell = selectCanResizeSelectedCell(snapshot, 1);
  const canShrinkSelectedCell = selectCanResizeSelectedCell(snapshot, -1);
  const statusText =
    error ||
    (samplesReady
      ? `${snapshot.project.bars.length} bar / ${snapshot.project.selectedCellIds.length} selected`
      : "Samples loading");

  return (
    <main className="app-shell" onKeyDown={handleKeyDown} tabIndex={-1}>
      <TransportBar
        snapshot={snapshot}
        onBpmChange={handleBpmChange}
        onPlay={handlePlay}
        onPause={handlePause}
        onStop={handleStop}
        samplesReady={samplesReady}
      />
      <DrumRack
        channels={channels}
        currentStepsByChannel={snapshot.transport.stepIndexByChannel}
        dispatch={dispatch}
      />
      <LyricsGrid
        bars={bars}
        canGrowSelectedCell={canGrowSelectedCell}
        canShrinkSelectedCell={canShrinkSelectedCell}
        dispatch={dispatch}
        snapshot={snapshot}
        onAddBar={handleAddBar}
        onSetEightBars={handleSetEightBars}
      />
      <footer className="status-strip" aria-live="polite">
        {statusText}
      </footer>
    </main>
  );
};
