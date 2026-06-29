import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent
} from "react";
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
  DexieProjectRepository,
  exportProjectToJson,
  importProjectFromJson
} from "@hipflow/storage";
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
type SampleLoadState = "loading" | "ready" | "error";
type StorageState = "idle" | "loading" | "dirty" | "saving" | "saved" | "error";

interface SelectedDrumStep {
  channelId: string;
  stepIndex: number;
}

const DRUM_TIMELINE_COLUMNS = 192;
const TARGET_LYRIC_BAR_COUNT = 8;
const AUTOSAVE_DELAY_MS = 600;
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
  onUndo: () => void;
  onRedo: () => void;
  onSaveProject: () => void;
  onLoadLatestProject: () => void;
  onExportJson: () => void;
  onChooseImportJson: () => void;
  samplesReady: boolean;
  sampleLoadState: SampleLoadState;
  storageState: StorageState;
  canUndo: boolean;
  canRedo: boolean;
}

interface DrumRackProps {
  channels: readonly DrumChannel[];
  currentStepsByChannel: Readonly<Record<string, number>>;
  dispatch: DispatchCommand;
  selectedDrumStep: SelectedDrumStep | undefined;
  onSelectDrumStep: (step: SelectedDrumStep) => void;
}

interface LyricsGridProps {
  bars: readonly Bar[];
  snapshot: AppSnapshot;
  dispatch: DispatchCommand;
  canGrowSelectedCell: boolean;
  canShrinkSelectedCell: boolean;
  canMergeSelectedCells: boolean;
  canSplitSelectedCell: (parts: number) => boolean;
  onAddBar: () => void;
  onRemoveLastBar: () => void;
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

const commandAffectsSavedProject = (command: Command): boolean =>
  command.type !== "lyrics/selectCells" &&
  command.type !== "transport/play" &&
  command.type !== "transport/pause" &&
  command.type !== "transport/stop";

const findSelectedLyricCell = (
  bars: readonly Bar[],
  selectedCellIds: readonly string[]
): LyricCell | undefined => {
  if (selectedCellIds.length !== 1) {
    return undefined;
  }

  return bars
    .flatMap((bar) => bar.lyricCells)
    .find((cell) => cell.id === selectedCellIds[0]);
};

const describeSelectedCell = (
  bars: readonly Bar[],
  selectedCellIds: readonly string[]
): string => {
  const selectedCell = findSelectedLyricCell(bars, selectedCellIds);

  if (!selectedCell) {
    return `${selectedCellIds.length} selected`;
  }

  const cellUnits = selectedCell.durationTicks / STEP_TICKS_DEFAULT;

  return `${cellUnits.toFixed(2)} cells / ${selectedCell.durationTicks} ticks`;
};

const getStorageLabel = (state: StorageState): string => {
  switch (state) {
    case "loading":
      return "Loading project";
    case "dirty":
      return "Unsaved changes";
    case "saving":
      return "Saving";
    case "saved":
      return "Saved";
    case "error":
      return "Storage error";
    case "idle":
      return "No saved project";
  }
};

const getSampleLabel = (state: SampleLoadState): string => {
  switch (state) {
    case "ready":
      return "Samples ready";
    case "error":
      return "Sample error";
    case "loading":
      return "Samples loading";
  }
};

const formatBarCount = (count: number, unit = "Bar"): string =>
  `${count} ${unit}${count === 1 ? "" : "s"}`;

const safeDownloadName = (title: string): string => {
  const baseName = title.trim().replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "");

  return `${baseName || "hipflow-project"}.json`;
};

const TransportBar = ({
  snapshot,
  onBpmChange,
  onPlay,
  onPause,
  onStop,
  onUndo,
  onRedo,
  onSaveProject,
  onLoadLatestProject,
  onExportJson,
  onChooseImportJson,
  samplesReady,
  sampleLoadState,
  storageState,
  canUndo,
  canRedo
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
    <div className="button-group transport-actions" aria-label="Transport controls">
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
    </div>
    <div className="button-group edit-actions" aria-label="Edit history controls">
      <button className="command-button" disabled={!canUndo} type="button" onClick={onUndo}>
        Undo
      </button>
      <button className="command-button" disabled={!canRedo} type="button" onClick={onRedo}>
        Redo
      </button>
    </div>
    <div className="button-group project-actions" aria-label="Project storage controls">
      <button className="command-button" type="button" onClick={onSaveProject}>
        Save
      </button>
      <button className="command-button" type="button" onClick={onLoadLatestProject}>
        Load
      </button>
      <button className="command-button" type="button" onClick={onExportJson}>
        Export
      </button>
      <button className="command-button" type="button" onClick={onChooseImportJson}>
        Import
      </button>
    </div>
    <div className="transport-readout">
      <span>Bar {snapshot.currentBarIndex + 1}</span>
      <span>Cell {getDefaultGridStepIndex(snapshot.currentTickInBar) + 1}/{DEFAULT_STEPS_PER_BAR}</span>
      <span className={`state-pill is-${sampleLoadState}`}>{getSampleLabel(sampleLoadState)}</span>
      <span className={`state-pill is-${storageState}`}>{getStorageLabel(storageState)}</span>
    </div>
  </header>
);

const DrumRack = ({
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
            <div className="channel-label-row">
              <div className="channel-label">{channel.name}</div>
              <button
                aria-pressed={channel.muted}
                className={["mini-toggle", channel.muted ? "is-on" : ""].filter(Boolean).join(" ")}
                title="Mute channel"
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
                aria-pressed={channel.solo}
                className={["mini-toggle", channel.solo ? "is-on" : ""].filter(Boolean).join(" ")}
                title="Solo channel"
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
                aria-pressed={step.active}
                className={[
                  "step-button",
                  step.active ? "is-active" : "",
                  step.stepIndex === currentStepsByChannel[channel.id] ? "is-current" : "",
                  selectedDrumStep?.channelId === channel.id &&
                  selectedDrumStep.stepIndex === step.stepIndex
                    ? "is-selected"
                    : ""
                ]
                  .filter(Boolean)
                  .join(" ")}
                key={step.stepIndex}
                style={{ gridColumn: `span ${DRUM_TIMELINE_COLUMNS / channel.steps.length}` }}
                title={`${channel.name} ${step.stepIndex + 1} velocity ${Math.round(step.velocity * 100)}%`}
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
          {selectedChannel && selectedStep
            ? `${selectedChannel.name} ${selectedStep.stepIndex + 1}`
            : "Select a drum step"}
        </div>
        <label className="velocity-control">
          <span>Velocity</span>
          <input
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
    </section>
  );
};

const LyricsGrid = ({
  bars,
  snapshot,
  dispatch,
  canGrowSelectedCell,
  canShrinkSelectedCell,
  canMergeSelectedCells,
  canSplitSelectedCell,
  onAddBar,
  onRemoveLastBar,
  onSetEightBars
}: LyricsGridProps) => {
  const selectedCellId = snapshot.selectedCellIds.length === 1 ? snapshot.selectedCellIds[0] : undefined;
  const selectedCellDescription = describeSelectedCell(bars, snapshot.selectedCellIds);

  return (
    <section className="lyrics-section" aria-label="Lyrics grid">
      <div className="lyrics-toolbar">
        <div className="toolbar-group">
          <span className="toolbar-meter">{formatBarCount(bars.length)}</span>
          <button className="tool-button" type="button" onClick={onAddBar}>
            + Bar
          </button>
          <button
            className="tool-button"
            disabled={bars.length <= 1}
            type="button"
            onClick={onRemoveLastBar}
          >
            - Bar
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
          <span className="toolbar-meter">{selectedCellDescription}</span>
          {[2, 3, 4].map((parts) => (
            <button
              className="tool-button nudge-button"
              disabled={!canSplitSelectedCell(parts)}
              key={parts}
              title={`Split selected cell into ${parts}`}
              type="button"
              onClick={() => {
                if (selectedCellId) {
                  dispatch({ type: "lyrics/splitCell", cellId: selectedCellId, parts });
                }
              }}
            >
              /{parts}
            </button>
          ))}
          <button
            className="tool-button"
            disabled={!canMergeSelectedCells}
            title="Merge selected lyric cells"
            type="button"
            onClick={() => dispatch({ type: "lyrics/mergeCells", cellIds: snapshot.selectedCellIds })}
          >
            Merge
          </button>
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
  const repository = useMemo(() => new DexieProjectRepository(), []);
  const importInputRef = useRef<HTMLInputElement>(null);
  const saveRequestRef = useRef(0);
  const [snapshot, setSnapshot] = useState(() => controller.getSnapshot());
  const [error, setError] = useState("");
  const [sampleLoadState, setSampleLoadState] = useState<SampleLoadState>("loading");
  const [storageState, setStorageState] = useState<StorageState>("idle");
  const [saveRequest, setSaveRequest] = useState(0);
  const [selectedDrumStep, setSelectedDrumStep] = useState<SelectedDrumStep>();

  const requestSave = useCallback(() => {
    const nextRequest = saveRequestRef.current + 1;

    saveRequestRef.current = nextRequest;
    setSaveRequest(nextRequest);
    setStorageState("dirty");
  }, []);

  const saveCurrentProject = useCallback(
    async (requestVersion = saveRequestRef.current) => {
      setStorageState("saving");
      const result = await repository.saveProject(controller.getSnapshot().project);

      if (saveRequestRef.current !== requestVersion) {
        return;
      }

      if (!result.ok) {
        setStorageState("error");
        setError(result.error.message);
        return;
      }

      setStorageState("saved");
      setError("");
    },
    [controller, repository]
  );

  useEffect(() => {
    const audioEngine = new ToneTransportEngine(controller.getSnapshot().project);
    controller.setAudioEngine(audioEngine);
    let isMounted = true;

    setSampleLoadState("loading");
    Promise.all(
      Object.entries(SAMPLE_URLS).map(([channelId, url]) => audioEngine.loadSample(channelId, url))
    )
      .then(() => {
        if (isMounted) {
          setSampleLoadState("ready");
          setError((currentError) =>
            currentError === "Samples are still loading." ? "" : currentError
          );
        }
      })
      .catch((sampleError: unknown) => {
        if (isMounted) {
          setSampleLoadState("error");
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

  useEffect(() => {
    let isMounted = true;

    setStorageState("loading");
    repository
      .listProjects()
      .then((projects) => {
        if (!isMounted) {
          return;
        }

        const latestProject = projects[0];

        if (!latestProject) {
          setStorageState("idle");
          return;
        }

        controller.loadProject(latestProject);
        setSnapshot(controller.getSnapshot());
        setStorageState("saved");
      })
      .catch((storageError: unknown) => {
        if (isMounted) {
          setStorageState("error");
          setError(storageError instanceof Error ? storageError.message : "Projects could not load.");
        }
      });

    return () => {
      isMounted = false;
    };
  }, [controller, repository]);

  useEffect(() => {
    if (storageState !== "dirty") {
      return undefined;
    }

    const requestVersion = saveRequest;
    const timeoutId = window.setTimeout(() => {
      void saveCurrentProject(requestVersion);
    }, AUTOSAVE_DELAY_MS);

    return () => window.clearTimeout(timeoutId);
  }, [saveCurrentProject, saveRequest, storageState]);

  useEffect(() => {
    if (!selectedDrumStep) {
      return;
    }

    const channel = snapshot.project.drumRack.channels.find(
      (candidate) => candidate.id === selectedDrumStep.channelId
    );

    if (!channel?.steps.some((step) => step.stepIndex === selectedDrumStep.stepIndex)) {
      setSelectedDrumStep(undefined);
    }
  }, [selectedDrumStep, snapshot.project.drumRack.channels]);

  const dispatch = useCallback(
    (command: Command) => {
      const result = controller.dispatch(command);

      if (!result.ok) {
        setError(result.error.message);
        return;
      }

      setError("");
      setSnapshot(result.value);

      if (commandAffectsSavedProject(command)) {
        requestSave();
      }
    },
    [controller, requestSave]
  );

  const handleBpmChange = useCallback(
    (bpm: number) => {
      dispatch({ type: "transport/setBpm", bpm });
    },
    [dispatch]
  );

  const handlePlay = useCallback(() => {
    if (sampleLoadState !== "ready") {
      setError("Samples are still loading.");
      return;
    }

    controller.start().catch((playError: unknown) => {
      setError(playError instanceof Error ? playError.message : "Playback could not start.");
    });
  }, [controller, sampleLoadState]);

  const handlePause = useCallback(() => {
    controller.pause();
  }, [controller]);

  const handleStop = useCallback(() => {
    controller.stop();
  }, [controller]);

  const handleUndo = useCallback(() => {
    if (!controller.canUndo()) {
      return;
    }

    controller.undo();
    setSnapshot(controller.getSnapshot());
    requestSave();
  }, [controller, requestSave]);

  const handleRedo = useCallback(() => {
    if (!controller.canRedo()) {
      return;
    }

    controller.redo();
    setSnapshot(controller.getSnapshot());
    requestSave();
  }, [controller, requestSave]);

  const handleSaveProject = useCallback(() => {
    void saveCurrentProject(saveRequestRef.current);
  }, [saveCurrentProject]);

  const handleLoadLatestProject = useCallback(() => {
    setStorageState("loading");
    repository
      .listProjects()
      .then((projects) => {
        const latestProject = projects[0];

        if (!latestProject) {
          setStorageState("idle");
          setError("No saved project yet.");
          return;
        }

        saveRequestRef.current += 1;
        setSaveRequest(saveRequestRef.current);
        controller.loadProject(latestProject);
        setSelectedDrumStep(undefined);
        setSnapshot(controller.getSnapshot());
        setStorageState("saved");
        setError("");
      })
      .catch((storageError: unknown) => {
        setStorageState("error");
        setError(storageError instanceof Error ? storageError.message : "Project could not load.");
      });
  }, [controller, repository]);

  const handleExportJson = useCallback(() => {
    const project = controller.getSnapshot().project;
    const blob = new Blob([exportProjectToJson(project)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = safeDownloadName(project.title);
    link.click();
    URL.revokeObjectURL(url);
  }, [controller]);

  const handleChooseImportJson = useCallback(() => {
    importInputRef.current?.click();
  }, []);

  const handleImportJson = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.currentTarget.files?.[0];

      event.currentTarget.value = "";

      if (!file) {
        return;
      }

      file
        .text()
        .then((json) => {
          const imported = importProjectFromJson(json);

          if (!imported.ok) {
            setStorageState("error");
            setError(imported.error.message);
            return;
          }

          controller.loadProject(imported.value);
          setSelectedDrumStep(undefined);
          setSnapshot(controller.getSnapshot());
          setError("");
          requestSave();
        })
        .catch((importError: unknown) => {
          setStorageState("error");
          setError(importError instanceof Error ? importError.message : "Project could not import.");
        });
    },
    [controller, requestSave]
  );

  const handleAddBar = useCallback(() => {
    dispatch({ type: "project/addBar" });
  }, [dispatch]);

  const handleRemoveLastBar = useCallback(() => {
    const lastBar = snapshot.project.bars.at(-1);

    if (lastBar) {
      dispatch({ type: "project/removeBar", barId: lastBar.id });
    }
  }, [dispatch, snapshot.project.bars]);

  const handleSetEightBars = useCallback(() => {
    for (let barIndex = snapshot.project.bars.length; barIndex < TARGET_LYRIC_BAR_COUNT; barIndex += 1) {
      dispatch({ type: "project/addBar" });
    }
  }, [dispatch, snapshot.project.bars.length]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      const key = event.key.toLowerCase();
      const modifier = event.ctrlKey || event.metaKey;
      const redoRequested = modifier && (key === "y" || (event.shiftKey && key === "z"));
      const undoRequested = modifier && !event.shiftKey && key === "z";

      if (redoRequested) {
        event.preventDefault();
        handleRedo();
        return;
      }

      if (undoRequested) {
        event.preventDefault();
        handleUndo();
        return;
      }

      if (event.ctrlKey && key === "m") {
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
    [dispatch, handlePause, handlePlay, handleRedo, handleUndo, snapshot]
  );

  const channels = selectDrumChannels(snapshot);
  const bars = selectVisibleBars(snapshot);
  const canGrowSelectedCell = selectCanResizeSelectedCell(snapshot, 1);
  const canShrinkSelectedCell = selectCanResizeSelectedCell(snapshot, -1);
  const canMergeSelectedCells = selectCanMergeSelectedCells(snapshot);
  const statusText =
    error ||
    `${getSampleLabel(sampleLoadState)} / ${getStorageLabel(storageState)} / ${formatBarCount(snapshot.project.bars.length, "bar")} / ${snapshot.project.selectedCellIds.length} selected`;

  return (
    <main className="app-shell" onKeyDown={handleKeyDown} tabIndex={-1}>
      <input
        ref={importInputRef}
        accept="application/json,.json"
        className="hidden-file-input"
        type="file"
        onChange={handleImportJson}
      />
      <TransportBar
        snapshot={snapshot}
        canRedo={controller.canRedo()}
        canUndo={controller.canUndo()}
        onBpmChange={handleBpmChange}
        onChooseImportJson={handleChooseImportJson}
        onExportJson={handleExportJson}
        onLoadLatestProject={handleLoadLatestProject}
        onPause={handlePause}
        onPlay={handlePlay}
        onRedo={handleRedo}
        onSaveProject={handleSaveProject}
        onStop={handleStop}
        onUndo={handleUndo}
        sampleLoadState={sampleLoadState}
        samplesReady={sampleLoadState === "ready"}
        storageState={storageState}
      />
      <DrumRack
        channels={channels}
        currentStepsByChannel={snapshot.transport.stepIndexByChannel}
        dispatch={dispatch}
        selectedDrumStep={selectedDrumStep}
        onSelectDrumStep={setSelectedDrumStep}
      />
      <LyricsGrid
        bars={bars}
        canGrowSelectedCell={canGrowSelectedCell}
        canMergeSelectedCells={canMergeSelectedCells}
        canShrinkSelectedCell={canShrinkSelectedCell}
        canSplitSelectedCell={(parts) => selectCanSplitSelectedCell(snapshot, parts)}
        dispatch={dispatch}
        snapshot={snapshot}
        onAddBar={handleAddBar}
        onRemoveLastBar={handleRemoveLastBar}
        onSetEightBars={handleSetEightBars}
      />
      <footer className="status-strip" aria-live="polite">
        {statusText}
      </footer>
    </main>
  );
};
