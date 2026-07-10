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
import type { Command } from "@hipflow/core";
import {
  DexieProjectRepository,
  exportProjectToJson,
  importProjectFromJson
} from "@hipflow/storage";
import {
  FlowStudioController,
  selectCanMergeSelectedCells,
  selectCanSplitSelectedCell,
  selectDrumChannels,
  selectVisibleBars,
  type AppSnapshot
} from "@hipflow/ui-contract";
import { DrumRack, type SelectedDrumStep } from "./components/DrumRack";
import { LyricsGrid } from "./components/LyricsGrid";
import {
  TransportBar,
  getSampleLabel,
  getStorageLabel,
  type SampleLoadState,
  type StorageState
} from "./components/TransportBar";
import "./App.css";

const TARGET_LYRIC_BAR_COUNT = 8;
const AUTOSAVE_DELAY_MS = 600;
const SAMPLE_FILES: Record<string, string> = {
  kick: "kick.mp3",
  snare: "snare.mp3",
  clap: "clap.mp3",
  hihat: "hihat.mp3"
};

const isTextEntryTarget = (target: EventTarget): boolean =>
  target instanceof HTMLInputElement ||
  target instanceof HTMLTextAreaElement ||
  target instanceof HTMLSelectElement ||
  (target instanceof HTMLElement && target.isContentEditable);

const commandAffectsSavedProject = (command: Command): boolean =>
  command.type !== "lyrics/selectCells" &&
  command.type !== "transport/play" &&
  command.type !== "transport/pause" &&
  command.type !== "transport/stop";

const safeDownloadName = (title: string): string => {
  const baseName = title.trim().replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "");

  return `${baseName || "hipflow-project"}.json`;
};

const getSampleUrls = (): Readonly<Record<string, string>> =>
  Object.fromEntries(
    Object.entries(SAMPLE_FILES).map(([channelId, fileName]) => [
      channelId,
      new URL(`./samples/${fileName}`, document.baseURI).toString()
    ])
  );

const formatBarCount = (count: number): string => `${count} bar${count === 1 ? "" : "s"}`;

export const App = () => {
  const controller = useMemo(() => new FlowStudioController(), []);
  const repository = useMemo(() => new DexieProjectRepository(), []);
  const importInputRef = useRef<HTMLInputElement>(null);
  const audioEngineRef = useRef<ToneTransportEngine | undefined>(undefined);
  const saveRequestRef = useRef(0);
  const [snapshot, setSnapshot] = useState<AppSnapshot>(() => controller.getSnapshot());
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

  const loadSamples = useCallback(async (audioEngine: ToneTransportEngine) => {
    setSampleLoadState("loading");

    try {
      await Promise.all(
        Object.entries(getSampleUrls()).map(([channelId, url]) =>
          audioEngine.loadSample(channelId, url)
        )
      );

      if (audioEngineRef.current !== audioEngine) {
        return;
      }

      setSampleLoadState("ready");
      setError((currentError) =>
        currentError === "Audio samples are still loading." ||
        currentError === "Audio samples could not load."
          ? ""
          : currentError
      );
    } catch (sampleError: unknown) {
      if (audioEngineRef.current !== audioEngine) {
        return;
      }

      setSampleLoadState("error");
      setError(
        sampleError instanceof Error ? sampleError.message : "Audio samples could not load."
      );
    }
  }, []);

  useEffect(() => {
    const audioEngine = new ToneTransportEngine(controller.getSnapshot().project);
    audioEngineRef.current = audioEngine;
    controller.setAudioEngine(audioEngine);
    void loadSamples(audioEngine);

    const unsubscribe = controller.subscribe((nextSnapshot) => {
      setSnapshot(nextSnapshot);
    });

    return () => {
      audioEngineRef.current = undefined;
      audioEngine.stop();
      unsubscribe();
    };
  }, [controller, loadSamples]);

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

  const handleTitleChange = useCallback(
    (title: string) => {
      dispatch({ type: "project/setTitle", title });
    },
    [dispatch]
  );

  const handleBpmChange = useCallback(
    (bpm: number) => {
      dispatch({ type: "transport/setBpm", bpm });
    },
    [dispatch]
  );

  const handlePlay = useCallback(() => {
    if (sampleLoadState !== "ready") {
      setError("Audio samples are still loading.");
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

  const handleRetrySamples = useCallback(() => {
    const audioEngine = audioEngineRef.current;

    if (audioEngine) {
      void loadSamples(audioEngine);
    }
  }, [loadSamples]);

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
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
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

  const handleRemoveBar = useCallback(
    (barId: string) => {
      dispatch({ type: "project/removeBar", barId });
    },
    [dispatch]
  );

  const handleSetEightBars = useCallback(() => {
    for (
      let barIndex = snapshot.project.bars.length;
      barIndex < TARGET_LYRIC_BAR_COUNT;
      barIndex += 1
    ) {
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

      if (modifier && key === "s") {
        event.preventDefault();
        handleSaveProject();
        return;
      }

      if (modifier && key === "o") {
        event.preventDefault();
        handleChooseImportJson();
        return;
      }

      if (modifier && key === "m") {
        event.preventDefault();
        if (selectCanMergeSelectedCells(snapshot)) {
          dispatch({ type: "lyrics/mergeCells", cellIds: snapshot.selectedCellIds });
        }
        return;
      }

      if (modifier && event.altKey && ["2", "3", "4"].includes(event.key)) {
        event.preventDefault();
        const parts = Number(event.key);

        if (selectCanSplitSelectedCell(snapshot, parts)) {
          dispatch({
            type: "lyrics/splitCell",
            cellId: snapshot.selectedCellIds[0],
            parts
          });
        }
        return;
      }

      if (isTextEntryTarget(event.target)) {
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
    [
      dispatch,
      handleChooseImportJson,
      handlePause,
      handlePlay,
      handleRedo,
      handleSaveProject,
      handleUndo,
      snapshot
    ]
  );

  const channels = selectDrumChannels(snapshot);
  const bars = selectVisibleBars(snapshot);
  const statusText =
    error ||
    `${getSampleLabel(sampleLoadState)} / ${getStorageLabel(storageState)} / ${formatBarCount(snapshot.project.bars.length)} / ${snapshot.project.selectedCellIds.length} selected`;

  return (
    <main className="app-shell" tabIndex={-1} onKeyDown={handleKeyDown}>
      <input
        ref={importInputRef}
        accept="application/json,.json"
        className="hidden-file-input"
        type="file"
        onChange={handleImportJson}
      />
      <TransportBar
        canRedo={controller.canRedo()}
        canUndo={controller.canUndo()}
        sampleLoadState={sampleLoadState}
        samplesReady={sampleLoadState === "ready"}
        snapshot={snapshot}
        storageState={storageState}
        onBpmChange={handleBpmChange}
        onChooseImportJson={handleChooseImportJson}
        onExportJson={handleExportJson}
        onLoadLatestProject={handleLoadLatestProject}
        onPause={handlePause}
        onPlay={handlePlay}
        onRedo={handleRedo}
        onRetrySamples={handleRetrySamples}
        onSaveProject={handleSaveProject}
        onStop={handleStop}
        onTitleChange={handleTitleChange}
        onUndo={handleUndo}
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
        dispatch={dispatch}
        snapshot={snapshot}
        onAddBar={handleAddBar}
        onRemoveBar={handleRemoveBar}
        onSetEightBars={handleSetEightBars}
      />
      <footer className={["status-strip", error ? "is-error" : ""].filter(Boolean).join(" ")} aria-live="polite">
        {statusText}
      </footer>
    </main>
  );
};
