"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { ArrowDown, ArrowRight, Check, Expand, MoveHorizontal } from "lucide-react";
import type { SortDemonstrationProps, SortItem } from "@/lib/station-canvas/types";
import styles from "./sort-demonstration.module.css";

const modeNames = {
  problem: "The starting shelf",
  compare: "Inspect two neighbours",
  swap: "Exchange the two books",
  pass: "Carry the largest book to the end",
  invariant: "The settled end of the shelf",
  transfer: "Try a different shelf",
};

function itemDescription(item: SortItem, index: number, active: boolean, sorted: boolean) {
  return `Position ${index + 1}: book ${item.value}${active ? ", in the current comparison" : ""}${sorted ? ", in its final position" : ""}.`;
}

/** Pure presentation of computed frames. The workspace owns playback and history. */
export function SortDemonstration({
  mode,
  frame,
  previousFrame,
  compact = false,
  onOpenDetail,
}: SortDemonstrationProps) {
  const values = frame.items.map((item) => item.value);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 0;
  const range = Math.max(max - min, 1);
  const n = Math.max(frame.items.length, 1);
  const active = new Set(frame.activeIds);
  const settled = new Set(frame.sortedIds);
  const pair = frame.items.filter((item) => active.has(item.id));
  const earlierPair = (previousFrame?.items ?? frame.items).filter((item) => active.has(item.id));
  const closeUp = mode === "compare" || mode === "swap";
  const shownItems = closeUp ? pair.length === 2 ? pair : frame.items.slice(0, 2) : frame.items;
  // Keep the DOM in identity order. Only the visual position changes on a swap;
  // moving keyed DOM children can cause the browser to skip a transform transition.
  const visualItems = [...shownItems].sort((left, right) => left.id.localeCompare(right.id));
  const shownCount = Math.max(shownItems.length, 1);
  const pairPositions = shownItems.flatMap((item, index) => active.has(item.id) ? [index] : []);
  const startPair = pairPositions.length ? Math.min(...pairPositions) : 0;
  const pairSpan = pairPositions.length ? Math.max(...pairPositions) - startPair + 1 : 2;
  const isSwap = frame.phase === "swap";
  const isDone = frame.phase === "done";
  const isPairPhase = frame.phase === "compare" || frame.phase === "swap" || frame.phase === "keep";
  const showPair = isPairPhase && pair.length === 2;
  const sortedStart = frame.items.findIndex((item) => settled.has(item.id));
  const showBoundary = (mode === "pass" || mode === "invariant") && sortedStart >= 0;
  const shelfStyle = {
    "--book-count": shownCount,
    "--pair-start": startPair,
    "--pair-span": pairSpan,
    "--settled-start": sortedStart,
  } as CSSProperties;
  const visiblePair = isSwap ? pair : earlierPair;
  const figureRef = useRef<HTMLElement>(null);
  const lastRenderedFrame = useRef<string | null>(null);

  useEffect(() => {
    const previousId = lastRenderedFrame.current;
    lastRenderedFrame.current = frame.id;
    // A preview is a still state, not a pretend exchange. Animate trajectories
    // only when an already mounted demonstration receives a new swap frame.
    if (previousId === null || previousId === frame.id || frame.phase !== "swap") return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (media.matches) return;
    const animations: Animation[] = [];
    figureRef.current?.querySelectorAll<HTMLElement>("[data-book-motion]").forEach((element) => {
      const right = element.dataset.bookMotion === "right";
      animations.push(element.animate([
        { transform: "translateY(0) rotate(0)", offset: 0 },
        { transform: right ? "translateY(-26px) rotate(-4deg)" : "translateY(6px) rotate(3deg)", offset: 0.38 },
        { transform: right ? "translateY(-22px) rotate(2deg)" : "translateY(3px) rotate(-2deg)", offset: 0.65 },
        { transform: "translateY(0) rotate(0)", offset: 1 },
      ], { duration: 720, easing: "cubic-bezier(.22,.72,.22,1)" }));
    });
    figureRef.current?.querySelectorAll<SVGPathElement>("[data-exchange-trail]").forEach((element) => {
      animations.push(element.animate([{ strokeDashoffset: 160 }, { strokeDashoffset: 0 }], { duration: 620, easing: "ease-out" }));
    });
    const cancel = () => animations.forEach((animation) => animation.cancel());
    media.addEventListener("change", cancel);
    return () => { cancel(); media.removeEventListener("change", cancel); };
  }, [frame.id, frame.phase]);

  let observation = "Smallest on the left. Tallest on the right.";
  if (mode === "compare") {
    observation = visiblePair.length === 2
      ? `${visiblePair[0].value} ${visiblePair[0].value > visiblePair[1].value ? ">" : "≤"} ${visiblePair[1].value}`
      : "Look at two books beside each other.";
  } else if (mode === "swap") {
    observation = isSwap && visiblePair.length === 2
      ? `${visiblePair[0].value} now comes before ${visiblePair[1].value}`
      : "Only the neighbours trade places.";
  } else if (mode === "pass") {
    observation = settled.size
      ? `${settled.size === 1 ? "One book" : `${settled.size} books`} ${settled.size === 1 ? "has" : "have"} found ${settled.size === 1 ? "its" : "their"} final place.`
      : "The larger book keeps moving right.";
  } else if (mode === "invariant") {
    observation = isDone ? "Every book is in order." : "The settled end never needs another comparison.";
  } else if (mode === "transfer") {
    observation = "Which neighbours would you inspect first?";
  }
  if (frame.phase === "compare" && earlierPair.length === 2) {
    observation = mode === "compare" ? "Which value belongs on the left?" : `Compare ${earlierPair[0].value} and ${earlierPair[1].value}.`;
  } else if (isSwap && pair.length === 2) {
    observation = `${pair[0].value} now comes before ${pair[1].value}.`;
  } else if (frame.phase === "keep" && pair.length === 2) {
    observation = pair[0].value === pair[1].value ? "Equal values. Keep their original order." : "Already in order. Keep this pair.";
  }
  if (isDone) observation = "Every book is in order. The same local rule did the work.";

  const relation = frame.phase === "ready" || !isPairPhase
    ? "?"
    : shownItems.length === 2
      ? shownItems[0].value > shownItems[1].value ? ">" : shownItems[0].value === shownItems[1].value ? "=" : "<"
      : "?";

  const sceneLabel = isDone
    ? "Everything in its place"
    : mode === "problem"
      ? frame.phase === "ready" ? "A shelf, out of order" : "The same shelf, in motion"
      : mode === "transfer" ? "A new shelf" : isSwap ? "Make one small move" : "Follow the same books";

  return (
    <figure
      ref={figureRef}
      className={`${styles.demonstration} ${compact ? styles.compact : styles.expanded}`}
      data-mode={mode}
      data-phase={frame.phase}
      data-frame-id={frame.id}
      data-order={values.join(",")}
      aria-label={modeNames[mode]}
    >
      <div className={styles.scene} style={shelfStyle} aria-hidden="true">
        <div className={styles.sceneHeading}>
          <span className={styles.sceneLabel}>{sceneLabel}</span>
          {closeUp ? <div className={styles.contextShelf} aria-hidden="true">{frame.items.map((item) => <span key={item.id} data-context-item={item.id} className={active.has(item.id) ? styles.contextActive : ""} style={{ "--book-color": item.color } as CSSProperties}>{item.value}</span>)}</div>
            : isDone ? <Check className={styles.finishedIcon} size={16} /> : mode === "pass" ? <span className={styles.passBadge}>PASS {Math.max(frame.pass, 1)}<ArrowRight size={12} /></span> : null}
        </div>

        <div className={styles.bookArea}>
          {mode === "pass" && <div className={styles.passRoute}><span>{frame.phase === "pass" || isDone ? "A whole sweep" : "Move the comparison right"}</span><svg viewBox="0 0 320 16" preserveAspectRatio="none"><path d={`M 5 11 H ${10 + (Math.min(startPair + pairSpan, n) / n) * 300}`} /><path d={`m ${4 + (Math.min(startPair + pairSpan, n) / n) * 300} 6 6 5-6 5`} /></svg></div>}
          {mode === "pass" && showPair && <div className={styles.passWindow} style={{ left: `calc(${startPair} * 100% / ${shownCount})`, width: `calc(${pairSpan} * 100% / ${shownCount})` }}><span><ArrowRight size={17} /></span></div>}
          {mode === "invariant" && (
            <div className={styles.openZone} style={{ width: `calc(${sortedStart < 0 ? n : sortedStart} * 100% / ${n})` }}>
              {sortedStart !== 0 && <span>STILL TO SOLVE</span>}
            </div>
          )}
          {showBoundary && (
            <div className={styles.settledZone} style={{ left: `calc(${sortedStart} * 100% / ${n})`, width: `calc(${n - sortedStart} * 100% / ${n})` }}>
              <span>{isDone ? "ALL IN ORDER" : "IN ITS PLACE"}</span>
            </div>
          )}

          {showPair && mode !== "pass" && mode !== "invariant" && (
            <div
              className={`${styles.comparisonBracket} ${isSwap ? styles.swapBracket : ""}`}
              style={{ left: `calc(${startPair} * 100% / ${shownCount})`, width: `calc(${pairSpan} * 100% / ${shownCount})` }}
            >
              <span>{isSwap ? "exchange" : "compare"}</span>
              {isSwap && <svg className={styles.exchangeArc} viewBox="0 0 160 30" preserveAspectRatio="none"><path data-exchange-trail d="M 14 24 C 38 0, 122 0, 146 24" /><path d="m 137 21 9 3-1-9" /></svg>}
            </div>
          )}

          <ol className={styles.books}>
            {visualItems.map((item) => {
              const index = shownItems.findIndex((shown) => shown.id === item.id);
              const fullIndex = frame.items.findIndex((current) => current.id === item.id);
              const oldIndex = previousFrame?.items.findIndex((old) => old.id === item.id) ?? index;
              const moved = isSwap && oldIndex >= 0 && oldIndex !== fullIndex;
              const movesRight = moved && fullIndex > oldIndex;
              const bookStyle = {
                "--book-height": `${56 + ((item.value - min) / range) * 78}px`,
                "--book-color": item.color,
                "--slot-index": index,
                "--book-count": shownCount,
              } as CSSProperties;
              return (
                <li
                  key={item.id}
                  className={`${styles.bookSlot} ${active.has(item.id) && showPair ? styles.activeSlot : ""} ${settled.has(item.id) ? styles.settledSlot : ""}`}
                  style={bookStyle}
                  data-book-id={item.id}
                  data-sort-item={item.id}
                  data-position={fullIndex}
                >
                  <div key={moved ? `${item.id}:${frame.id}` : item.id} data-book-motion={moved ? movesRight ? "right" : "left" : undefined} className={styles.bookTravel}>
                    <div className={styles.book}>
                      <span className={styles.spineRule} />
                      <span className={styles.bookValue}>{item.value}</span>
                      <span className={styles.bookMark}>{item.id.replace(/[^a-z0-9]/gi, "").slice(-1).toUpperCase()}</span>
                      <span className={styles.bottomRule} />
                    </div>
                  </div>
                  <div className={styles.positionLabel}>
                    {settled.has(item.id) ? <Check size={11} strokeWidth={2.5} /> : active.has(item.id) && showPair ? <ArrowDown size={12} /> : <span>{index + 1}</span>}
                  </div>
                </li>
              );
            })}
          </ol>
          {closeUp && <div className={`${styles.pairRelation} ${isSwap ? styles.repairedRelation : ""}`}>{isSwap ? <MoveHorizontal size={26} /> : relation}</div>}
          <div className={styles.shelf}><span /></div>
        </div>

        <div className={styles.observation} key={`${mode}:${frame.phase}`}>
          <span className={styles.observationMark}>{mode === "compare" ? "?" : isDone ? <Check size={13} /> : mode === "swap" ? <MoveHorizontal size={14} /> : <ArrowRight size={13} />}</span>
          <span>{observation}</span>
        </div>
      </div>

      <figcaption className={styles.accessibleDescription}>
        {modeNames[mode]}. Current order: {values.join(", ")}. {frame.description}
        {frame.items.map((item, index) => itemDescription(item, index, active.has(item.id), settled.has(item.id))).join(" ")}
      </figcaption>

      {!compact && (
        <div className={styles.frameNote} aria-live="polite" aria-atomic="true">
          <span>{frame.description}</span>
          {onOpenDetail && <button type="button" onClick={onOpenDetail} className={`nodrag nopan ${styles.detailLink}`}><Expand size={13} /><span>Look closer</span></button>}
        </div>
      )}
    </figure>
  );
}
