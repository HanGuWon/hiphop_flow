import { Combine, Minus, Plus, Scissors, Trash2 } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent
} from "react";
import {
  STEP_TICKS_DEFAULT,
  getBarTicks,
  type Bar,
  type Command,
  type LyricCell
} from "@hipflow/core";
import {
  selectCanMergeSelectedCells,
  selectCanResizeSelectedCell,
  selectCanSplitSelectedCell,
  selectLyricCellNavigationTarget,
  selectLyricCellRange,
  type AppSnapshot,
  type LyricNavigationDirection
} from "@hipflow/ui-contract";

type DispatchCommand = (command: Command) => void;

interface LyricsGridProps {
  bars: readonly Bar[];
  snapshot: AppSnapshot;
  dispatch: DispatchCommand;
  onAddBar: () => void;
  onRemoveBar: (barId: string) => void;
  onSetEightBars: () => void;
}

interface LyricCellViewProps {
  bar: Bar;
  cell: LyricCell;
  activeCellId: string | undefined;
  snapshot: AppSnapshot;
  dispatch: DispatchCommand;
  registerCellRef: (cellId: string, element: HTMLInputElement | null) => void;
  onCellClick: (event: MouseEvent<HTMLInputElement>, cellId: string) => void;
  onCellFocus: (cellId: string) => void;
  onCellKeyDown: (event: KeyboardEvent<HTMLInputElement>, cellId: string) => void;
}

const TARGET_LYRIC_BAR_COUNT = 8;
const BEATS_PER_BAR = 4;

const findSelectedCells = (
  bars: readonly Bar[],
  selectedCellIds: readonly string[]
): LyricCell[] => {
  const selectedIds = new Set(selectedCellIds);

  return bars.flatMap((bar) => bar.lyricCells).filter((cell) => selectedIds.has(cell.id));
};

const formatCellUnits = (ticks: number): string => {
  const units = ticks / STEP_TICKS_DEFAULT;

  return Number.isInteger(units) ? String(units) : units.toFixed(2).replace(/0+$/, "");
};

const describeSelection = (
  bars: readonly Bar[],
  selectedCellIds: readonly string[]
): string => {
  const selectedCells = findSelectedCells(bars, selectedCellIds);

  if (selectedCells.length === 0) {
    return "No cell selected";
  }

  const totalTicks = selectedCells.reduce((sum, cell) => sum + cell.durationTicks, 0);

  if (selectedCells.length === 1) {
    return `${formatCellUnits(totalTicks)} slot / ${totalTicks} ticks`;
  }

  return `${selectedCells.length} cells / ${formatCellUnits(totalTicks)} slots`;
};

const formatBarCount = (count: number): string => `${count} bar${count === 1 ? "" : "s"}`;

const getNavigationDirection = (
  event: KeyboardEvent<HTMLInputElement>
): LyricNavigationDirection | undefined => {
  if (event.key === "Tab" || event.key === "Enter") {
    return event.shiftKey ? "previous" : "next";
  }

  switch (event.key) {
    case "ArrowLeft":
      return "previous";
    case "ArrowRight":
      return "next";
    case "ArrowUp":
      return "up";
    case "ArrowDown":
      return "down";
    default:
      return undefined;
  }
};

const shouldNavigateFromInput = (
  event: KeyboardEvent<HTMLInputElement>,
  direction: LyricNavigationDirection
): boolean => {
  if (event.key === "Tab" || event.key === "Enter" || direction === "up" || direction === "down") {
    return true;
  }

  if (event.shiftKey || event.altKey || event.currentTarget.value.length === 0) {
    return true;
  }

  const selectionStart = event.currentTarget.selectionStart;
  const selectionEnd = event.currentTarget.selectionEnd;

  if (selectionStart === null || selectionEnd === null || selectionStart !== selectionEnd) {
    return false;
  }

  return direction === "previous"
    ? selectionStart === 0
    : selectionEnd === event.currentTarget.value.length;
};

export const LyricsGrid = ({
  bars,
  snapshot,
  dispatch,
  onAddBar,
  onRemoveBar,
  onSetEightBars
}: LyricsGridProps) => {
  const cellRefs = useRef(new Map<string, HTMLInputElement>());
  const previousBarCountRef = useRef(bars.length);
  const pendingNewBarFocusRef = useRef(false);
  const allCellIds = useMemo(
    () => bars.flatMap((bar) => bar.lyricCells.map((cell) => cell.id)),
    [bars]
  );
  const allCellIdSet = useMemo(() => new Set(allCellIds), [allCellIds]);
  const initialCellId = snapshot.selectedCellIds.at(-1) ?? allCellIds[0];
  const [activeCellId, setActiveCellId] = useState<string | undefined>(initialCellId);
  const [selectionAnchorCellId, setSelectionAnchorCellId] = useState<string | undefined>(
    initialCellId
  );

  const focusCell = useCallback((cellId: string, selectText = false) => {
    window.requestAnimationFrame(() => {
      const input = cellRefs.current.get(cellId);

      if (!input) {
        return;
      }

      input.focus({ preventScroll: true });
      input.scrollIntoView({ block: "nearest", inline: "nearest" });

      if (selectText) {
        input.select();
      }
    });
  }, []);

  useEffect(() => {
    if (activeCellId && allCellIdSet.has(activeCellId)) {
      return;
    }

    const fallbackCellId = snapshot.selectedCellIds.at(-1) ?? allCellIds[0];
    setActiveCellId(fallbackCellId);
    setSelectionAnchorCellId(fallbackCellId);
  }, [activeCellId, allCellIds, allCellIdSet, snapshot.selectedCellIds]);

  useEffect(() => {
    const barWasAdded = bars.length > previousBarCountRef.current;

    if (pendingNewBarFocusRef.current && barWasAdded) {
      const firstNewCellId = bars.at(-1)?.lyricCells[0]?.id;
      pendingNewBarFocusRef.current = false;

      if (firstNewCellId) {
        dispatch({ type: "lyrics/selectCells", cellIds: [firstNewCellId] });
        setActiveCellId(firstNewCellId);
        setSelectionAnchorCellId(firstNewCellId);
        focusCell(firstNewCellId, true);
      }
    }

    previousBarCountRef.current = bars.length;
  }, [bars, dispatch, focusCell]);

  const registerCellRef = useCallback((cellId: string, element: HTMLInputElement | null) => {
    if (element) {
      cellRefs.current.set(cellId, element);
      return;
    }

    cellRefs.current.delete(cellId);
  }, []);

  const selectAndFocusCell = useCallback(
    (cellId: string, options: { extend?: boolean; toggle?: boolean; selectText?: boolean } = {}) => {
      let nextSelection = [cellId];

      if (options.extend) {
        const anchorCellId = selectionAnchorCellId ?? activeCellId ?? cellId;
        const range = selectLyricCellRange(snapshot, anchorCellId, cellId);
        nextSelection = range.length > 0 ? range : [cellId];

        if (nextSelection.length === 1 && nextSelection[0] === cellId && anchorCellId !== cellId) {
          setSelectionAnchorCellId(cellId);
        }
      } else if (options.toggle) {
        const selectedIds = new Set(snapshot.selectedCellIds);

        if (selectedIds.has(cellId) && selectedIds.size > 1) {
          selectedIds.delete(cellId);
        } else {
          selectedIds.add(cellId);
        }

        nextSelection = [...selectedIds];
        setSelectionAnchorCellId((currentAnchor) => currentAnchor ?? cellId);
      } else {
        setSelectionAnchorCellId(cellId);
      }

      dispatch({ type: "lyrics/selectCells", cellIds: nextSelection });
      setActiveCellId(cellId);
      focusCell(cellId, options.selectText);
    },
    [activeCellId, dispatch, focusCell, selectionAnchorCellId, snapshot]
  );

  const navigateFromCell = useCallback(
    (cellId: string, direction: LyricNavigationDirection, extend: boolean): boolean => {
      const targetCellId = selectLyricCellNavigationTarget(snapshot, cellId, direction);

      if (!targetCellId) {
        return false;
      }

      selectAndFocusCell(targetCellId, { extend, selectText: !extend });
      return true;
    },
    [selectAndFocusCell, snapshot]
  );

  const handleCellClick = useCallback(
    (event: MouseEvent<HTMLInputElement>, cellId: string) => {
      selectAndFocusCell(cellId, {
        extend: event.shiftKey,
        toggle: event.ctrlKey || event.metaKey
      });
    },
    [selectAndFocusCell]
  );

  const handleCellFocus = useCallback(
    (cellId: string) => {
      setActiveCellId(cellId);

      if (snapshot.selectedCellIds.length === 0) {
        dispatch({ type: "lyrics/selectCells", cellIds: [cellId] });
        setSelectionAnchorCellId(cellId);
      }
    },
    [dispatch, snapshot.selectedCellIds]
  );

  const handleCellKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>, cellId: string) => {
      if (event.nativeEvent.isComposing || event.ctrlKey || event.metaKey) {
        return;
      }

      const direction = getNavigationDirection(event);

      if (!direction || !shouldNavigateFromInput(event, direction)) {
        return;
      }

      const extendSelection = event.shiftKey && event.key.startsWith("Arrow");
      const moved = navigateFromCell(cellId, direction, extendSelection);

      if (!moved && direction === "next" && (event.key === "Tab" || event.key === "Enter")) {
        pendingNewBarFocusRef.current = true;
        onAddBar();
      }

      event.preventDefault();
      event.stopPropagation();
    },
    [navigateFromCell, onAddBar]
  );

  const selectedCellId =
    snapshot.selectedCellIds.length === 1 ? snapshot.selectedCellIds[0] : undefined;
  const canMergeSelectedCells = selectCanMergeSelectedCells(snapshot);
  const canShrinkSelectedCell = selectCanResizeSelectedCell(snapshot, -1);
  const canGrowSelectedCell = selectCanResizeSelectedCell(snapshot, 1);
  const selectionDescription = describeSelection(bars, snapshot.selectedCellIds);
  const selectedIds = new Set(snapshot.selectedCellIds);
  const mergeTargetCellId = bars
    .flatMap((bar) => bar.lyricCells)
    .find((cell) => selectedIds.has(cell.id))?.id;

  const splitSelectedCell = (parts: number) => {
    if (!selectedCellId || !selectCanSplitSelectedCell(snapshot, parts)) {
      return;
    }

    const firstPartId = `${selectedCellId}_part_1`;
    dispatch({ type: "lyrics/splitCell", cellId: selectedCellId, parts });
    setActiveCellId(firstPartId);
    setSelectionAnchorCellId(firstPartId);
    focusCell(firstPartId, true);
  };

  const mergeSelectedCells = () => {
    if (!canMergeSelectedCells || !mergeTargetCellId) {
      return;
    }

    dispatch({ type: "lyrics/mergeCells", cellIds: snapshot.selectedCellIds });
    setActiveCellId(mergeTargetCellId);
    setSelectionAnchorCellId(mergeTargetCellId);
    focusCell(mergeTargetCellId, true);
  };

  const resizeSelectedCell = (deltaSteps: number) => {
    if (!selectedCellId) {
      return;
    }

    dispatch({ type: "lyrics/resizeCellBySteps", cellId: selectedCellId, deltaSteps });
    focusCell(selectedCellId);
  };

  return (
    <section className="lyrics-section" aria-label="Lyrics grid">
      <div className="section-heading lyrics-heading">
        <div>
          <span className="section-kicker">Flow</span>
          <h2>Lyric grid</h2>
        </div>
        <span className="section-meter">{formatBarCount(bars.length)}</span>
      </div>

      <div className="lyrics-toolbar">
        <div className="toolbar-group" aria-label="Bar controls">
          <button className="tool-button has-label" type="button" onClick={onAddBar}>
            <Plus aria-hidden="true" size={15} />
            Bar
          </button>
          <button
            className="tool-button has-label"
            disabled={bars.length >= TARGET_LYRIC_BAR_COUNT}
            type="button"
            onClick={onSetEightBars}
          >
            8 bars
          </button>
        </div>

        <div className="cell-edit-toolbar">
          <span className="selection-meter">{selectionDescription}</span>
          <div className="segmented-control" aria-label="Split selected lyric cell">
            <span className="segmented-icon" title="Split cell">
              <Scissors aria-hidden="true" size={15} />
            </span>
            {[2, 3, 4].map((parts) => (
              <button
                aria-label={`Split selected cell into ${parts}`}
                disabled={!selectCanSplitSelectedCell(snapshot, parts)}
                key={parts}
                title={`Split into ${parts}`}
                type="button"
                onClick={() => splitSelectedCell(parts)}
              >
                {parts}
              </button>
            ))}
          </div>
          <button
            aria-label="Merge selected lyric cells"
            className="tool-button"
            disabled={!canMergeSelectedCells}
            title="Merge selected cells"
            type="button"
            onClick={mergeSelectedCells}
          >
            <Combine aria-hidden="true" size={17} />
          </button>
          <div className="segmented-control" aria-label="Resize selected lyric cell">
            <button
              aria-label="Shorten selected lyric cell"
              disabled={!selectedCellId || !canShrinkSelectedCell}
              title="Shorten cell"
              type="button"
              onClick={() => resizeSelectedCell(-1)}
            >
              <Minus aria-hidden="true" size={16} />
            </button>
            <button
              aria-label="Lengthen selected lyric cell"
              disabled={!selectedCellId || !canGrowSelectedCell}
              title="Lengthen cell"
              type="button"
              onClick={() => resizeSelectedCell(1)}
            >
              <Plus aria-hidden="true" size={16} />
            </button>
          </div>
        </div>
      </div>

      <div className="lyrics-workspace">
        <div className="lyric-canvas" role="grid" aria-label="Song lyric grid">
          <div className="lyric-ruler-row" aria-hidden="true">
            <span />
            <div className="beat-ruler">
              {Array.from({ length: BEATS_PER_BAR }, (_, beatIndex) => (
                <span key={beatIndex}>Beat {beatIndex + 1}</span>
              ))}
            </div>
          </div>

          {bars.map((bar) => (
            <div className="bar-row" key={bar.id} role="row">
              <div className="bar-label" role="rowheader">
                <span>Bar {bar.index + 1}</span>
                <button
                  aria-label={`Remove bar ${bar.index + 1}`}
                  disabled={bars.length <= 1}
                  title={`Remove bar ${bar.index + 1}`}
                  type="button"
                  onClick={() => onRemoveBar(bar.id)}
                >
                  <Trash2 aria-hidden="true" size={14} />
                </button>
              </div>
              <div className="lyric-cells" role="presentation">
                {bar.lyricCells.map((cell) => (
                  <LyricCellView
                    activeCellId={activeCellId}
                    bar={bar}
                    cell={cell}
                    dispatch={dispatch}
                    key={cell.id}
                    registerCellRef={registerCellRef}
                    snapshot={snapshot}
                    onCellClick={handleCellClick}
                    onCellFocus={handleCellFocus}
                    onCellKeyDown={handleCellKeyDown}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

const LyricCellView = ({
  bar,
  cell,
  activeCellId,
  snapshot,
  dispatch,
  registerCellRef,
  onCellClick,
  onCellFocus,
  onCellKeyDown
}: LyricCellViewProps) => {
  const isSelected = snapshot.selectedCellIds.includes(cell.id);
  const isCurrent =
    bar.index === snapshot.currentBarIndex &&
    snapshot.currentTickInBar >= cell.startTick &&
    snapshot.currentTickInBar < cell.startTick + cell.durationTicks;
  const isBeatStart = cell.startTick % (getBarTicks() / BEATS_PER_BAR) === 0;
  const widthWeight = cell.durationTicks / getBarTicks();

  return (
    <input
      aria-label={`Bar ${bar.index + 1}, lyric cell at tick ${cell.startTick}`}
      className={[
        "lyric-cell",
        cell.text.trim().length > 0 ? "has-text" : "",
        isSelected ? "is-selected" : "",
        isCurrent ? "is-current" : "",
        isBeatStart ? "is-beat-start" : ""
      ]
        .filter(Boolean)
        .join(" ")}
      data-cell-id={cell.id}
      ref={(element) => registerCellRef(cell.id, element)}
      role="gridcell"
      spellCheck
      style={{ flexGrow: widthWeight, flexBasis: 0 }}
      tabIndex={activeCellId === cell.id ? 0 : -1}
      value={cell.text}
      onChange={(event) =>
        dispatch({
          type: "lyrics/updateCellText",
          cellId: cell.id,
          text: event.currentTarget.value
        })
      }
      onClick={(event) => onCellClick(event, cell.id)}
      onDoubleClick={(event) => event.currentTarget.select()}
      onFocus={() => onCellFocus(cell.id)}
      onKeyDown={(event) => onCellKeyDown(event, cell.id)}
    />
  );
};
