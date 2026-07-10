import {
  AudioLines,
  Check,
  Download,
  FolderOpen,
  Pause,
  Play,
  Redo2,
  RefreshCw,
  Save,
  Square,
  Undo2,
  Upload,
  type LucideIcon
} from "lucide-react";
import { useEffect, useState, type FormEvent, type KeyboardEvent } from "react";
import { DEFAULT_STEPS_PER_BAR, STEP_TICKS_DEFAULT } from "@hipflow/core";
import type { AppSnapshot } from "@hipflow/ui-contract";

export type SampleLoadState = "loading" | "ready" | "error";
export type StorageState = "idle" | "loading" | "dirty" | "saving" | "saved" | "error";

interface TransportBarProps {
  snapshot: AppSnapshot;
  onTitleChange: (title: string) => void;
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
  onRetrySamples: () => void;
  samplesReady: boolean;
  sampleLoadState: SampleLoadState;
  storageState: StorageState;
  canUndo: boolean;
  canRedo: boolean;
}

interface IconButtonProps {
  Icon: LucideIcon;
  label: string;
  className?: string;
  disabled?: boolean;
  pressed?: boolean;
  onClick: () => void;
}

const IconButton = ({
  Icon,
  label,
  className = "",
  disabled = false,
  pressed,
  onClick
}: IconButtonProps) => (
  <button
    aria-label={label}
    aria-pressed={pressed}
    className={["icon-button", className].filter(Boolean).join(" ")}
    disabled={disabled}
    title={label}
    type="button"
    onClick={onClick}
  >
    <Icon aria-hidden="true" size={17} strokeWidth={2.2} />
  </button>
);

const getDefaultGridStepIndex = (tickInBar: number): number =>
  Math.min(DEFAULT_STEPS_PER_BAR - 1, Math.floor(tickInBar / STEP_TICKS_DEFAULT));

export const getStorageLabel = (state: StorageState): string => {
  switch (state) {
    case "loading":
      return "Loading";
    case "dirty":
      return "Unsaved";
    case "saving":
      return "Saving";
    case "saved":
      return "Saved";
    case "error":
      return "Save error";
    case "idle":
      return "Local draft";
  }
};

export const getSampleLabel = (state: SampleLoadState): string => {
  switch (state) {
    case "ready":
      return "Audio ready";
    case "error":
      return "Audio error";
    case "loading":
      return "Loading audio";
  }
};

export const TransportBar = ({
  snapshot,
  onTitleChange,
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
  onRetrySamples,
  samplesReady,
  sampleLoadState,
  storageState,
  canUndo,
  canRedo
}: TransportBarProps) => {
  const [titleDraft, setTitleDraft] = useState(snapshot.project.title);
  const [bpmDraft, setBpmDraft] = useState(String(snapshot.project.bpm));
  const parsedBpm = Number(bpmDraft);
  const canCommitBpm =
    bpmDraft.trim().length > 0 &&
    Number.isFinite(parsedBpm) &&
    parsedBpm >= 20 &&
    parsedBpm <= 300;

  useEffect(() => {
    setTitleDraft(snapshot.project.title);
  }, [snapshot.project.title]);

  useEffect(() => {
    setBpmDraft(String(snapshot.project.bpm));
  }, [snapshot.project.bpm]);

  const commitTitle = () => {
    const title = titleDraft.trim();

    if (title.length > 0 && title !== snapshot.project.title) {
      onTitleChange(title);
      return;
    }

    setTitleDraft(snapshot.project.title);
  };

  const handleTitleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.blur();
    }

    if (event.key === "Escape") {
      setTitleDraft(snapshot.project.title);
      event.currentTarget.blur();
    }
  };

  const commitBpm = () => {
    if (canCommitBpm) {
      if (parsedBpm !== snapshot.project.bpm) {
        onBpmChange(parsedBpm);
      }
      return;
    }

    setBpmDraft(String(snapshot.project.bpm));
  };

  const handleBpmSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    commitBpm();
  };

  const isPlaying = snapshot.transport.isPlaying;

  return (
    <header className="transport-bar">
      <div className="project-identity">
        <div className="brand-mark" aria-hidden="true">
          <AudioLines size={21} strokeWidth={2.4} />
        </div>
        <div className="identity-copy">
          <span className="brand">HipFlow Studio</span>
          <label className="project-title-field">
            <span className="sr-only">Project title</span>
            <input
              aria-label="Project title"
              maxLength={80}
              spellCheck={false}
              value={titleDraft}
              onBlur={commitTitle}
              onChange={(event) => setTitleDraft(event.currentTarget.value)}
              onKeyDown={handleTitleKeyDown}
            />
          </label>
        </div>
      </div>

      <div className="playback-cluster">
        <form className="bpm-control" onSubmit={handleBpmSubmit}>
          <label className="bpm-field">
            <span>BPM</span>
            <input
              aria-label="BPM"
              inputMode="decimal"
              max={300}
              min={20}
              step={1}
              type="number"
              value={bpmDraft}
              onBlur={commitBpm}
              onChange={(event) => setBpmDraft(event.currentTarget.value)}
            />
          </label>
          <button
            aria-label="Apply BPM"
            className="bpm-apply-button"
            disabled={!canCommitBpm}
            title="Apply BPM"
            type="submit"
            onMouseDown={(event) => event.preventDefault()}
          >
            <Check aria-hidden="true" size={16} strokeWidth={2.4} />
          </button>
        </form>
        <div className="button-group transport-actions" aria-label="Transport controls">
          <IconButton
            Icon={Play}
            className="play-button"
            disabled={!samplesReady || isPlaying}
            label={samplesReady ? "Play" : "Audio is loading"}
            onClick={onPlay}
          />
          <IconButton
            Icon={Pause}
            className="pause-button"
            disabled={!isPlaying}
            label="Pause"
            pressed={isPlaying}
            onClick={onPause}
          />
          <IconButton Icon={Square} label="Stop" onClick={onStop} />
        </div>
      </div>

      <div className="command-cluster">
        <div className="button-group" aria-label="Edit history controls">
          <IconButton Icon={Undo2} disabled={!canUndo} label="Undo" onClick={onUndo} />
          <IconButton Icon={Redo2} disabled={!canRedo} label="Redo" onClick={onRedo} />
        </div>
        <span className="toolbar-divider" aria-hidden="true" />
        <div className="button-group" aria-label="Project file controls">
          <IconButton Icon={Save} label="Save project" onClick={onSaveProject} />
          <IconButton Icon={FolderOpen} label="Load latest project" onClick={onLoadLatestProject} />
          <IconButton Icon={Download} label="Export project JSON" onClick={onExportJson} />
          <IconButton Icon={Upload} label="Import project JSON" onClick={onChooseImportJson} />
        </div>
      </div>

      <div className="transport-readout" aria-live="polite">
        <span className="position-readout">
          Bar {snapshot.currentBarIndex + 1}
          <span aria-hidden="true"> / </span>
          Step {getDefaultGridStepIndex(snapshot.currentTickInBar) + 1}
        </span>
        <span className={`state-pill is-${sampleLoadState}`}>
          <span className="state-dot" aria-hidden="true" />
          {getSampleLabel(sampleLoadState)}
        </span>
        {sampleLoadState === "error" ? (
          <IconButton Icon={RefreshCw} label="Retry audio samples" onClick={onRetrySamples} />
        ) : null}
        <span className={`state-pill is-${storageState}`}>
          <span className="state-dot" aria-hidden="true" />
          {getStorageLabel(storageState)}
        </span>
      </div>
    </header>
  );
};
