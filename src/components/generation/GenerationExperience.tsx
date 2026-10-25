"use client";

import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowUpRight, Check, Pause, Play } from "lucide-react";
import type { Lesson } from "@/lib/contracts";
import { sourcePreview, type GenerationPreview } from "@/lib/session/generation-preview";
import styles from "./generation-experience.module.css";

export type GenerationExperienceProps = {
  input: string;
  preview?: GenerationPreview | null;
  lesson?: Lesson | null;
  onCancel: () => void;
};

const stages = [
  { word: "Researching", label: "READING INTO YOUR TOPIC" },
  { word: "Connecting", label: "FINDING HOW THE IDEAS RELATE" },
  { word: "Visualizing", label: "SKETCHING YOUR LESSON" },
];
// Line drawings that sketch themselves as they drift past: network, wave, bars, tree, curve, vector.
const sketches = [
  "M8 31 24 9 41 25 57 7M24 9 41 25M8 31 41 25",
  "M3 20C11 2 18 2 26 20S41 38 49 20 57 4 61 8",
  "M3 36H61M11 36V23M23 36V11M35 36V27M47 36V6M57 36V17",
  "M32 4V14M32 14 16 25M32 14 48 25M16 25 10 36M16 25 22 36M48 25 42 36M48 25 54 36",
  "M6 3V36H61M9 33C27 33 42 27 58 5",
  "M9 35 55 35 41 6ZM41 6V35M9 35 41 21",
];
// Golden-angle spread keeps fragments off the centre of the tunnel.
const fragments = Array.from({ length: 12 }, (_, index) => {
  const angle = index * 2.4, reach = 34 + (index % 3) * 8;
  return { x: 50 + Math.cos(angle) * reach, y: 47 + Math.sin(angle) * reach * .82, delay: -index * 2.25 };
});
const glyphs = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const exitMs = 700;

/** Decodes text letter by letter whenever it changes. */
function useScramble(text: string) {
  const [shown, setShown] = useState(text);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { setShown(text); return; }
    let frame = 0;
    const timer = setInterval(() => {
      frame += 1;
      setShown(Array.from(text, (char, index) => char === " " || frame > 5 + index * .8 ? char : glyphs[Math.floor(Math.random() * glyphs.length)]).join(""));
      if (frame > 5 + text.length * .8) clearInterval(timer);
    }, 34);
    return () => clearInterval(timer);
  }, [text]);
  return shown;
}

/** Keeps removed items rendered for a moment, flagged as leaving, so they can animate out instead of vanishing. */
function usePresence<T extends { id: string }>(items: T[]) {
  const [gone, setGone] = useState<T[]>([]);
  const previous = useRef(items);
  useEffect(() => {
    const removed = previous.current.filter((item) => !items.some((next) => next.id === item.id));
    previous.current = items;
    if (!removed.length) return;
    setGone((list) => [...list, ...removed]);
    setTimeout(() => setGone((list) => list.filter((item) => !removed.includes(item))), exitMs);
  });
  return [...items.map((item) => ({ item, leaving: false })), ...gone.filter((item) => !items.some((next) => next.id === item.id)).map((item) => ({ item, leaving: true }))];
}

/** Cross-fades content whenever its id changes. */
function Swap({ id, children }: { id: string; children: ReactNode }) {
  return <span className={styles.swap}>{usePresence([{ id, children }]).map(({ item, leaving }) => <span key={item.id} data-leaving={leaving || undefined} aria-hidden={leaving || undefined}>{item.children}</span>)}</span>;
}

/** A card in the background field; new content only lands when it respawns out of sight. */
function Fragment({ label, note, sketch, style }: { label: string; note?: string; sketch: string; style: CSSProperties }) {
  const next = { label, note, sketch };
  const [shown, setShown] = useState(next);
  return <div className={styles.fragment} style={style} onAnimationIteration={(event) => { if (event.target === event.currentTarget) setShown(next); }}>
    <small>{shown.label}</small>
    {shown.note ? <span>{shown.note}</span> : <svg viewBox="0 0 64 40"><path d={shown.sketch} pathLength="1" /></svg>}
  </div>;
}

const pad = (value: number) => String(value).padStart(2, "0");
const clip = (text: string) => text.length > 46 ? `${text.slice(0, 44).replace(/\s+\S*$/, "")}…` : text;

export function GenerationExperience({ input, preview, lesson, onCancel }: GenerationExperienceProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [paused, setPaused] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [longWait, setLongWait] = useState(false);
  const fallback = useMemo(() => sourcePreview(input), [input]);
  const terms = lesson ? lesson.concepts.slice(0, 8).map((concept) => ({ label: concept.title, detail: concept.summary, id: concept.id })) : (preview ?? fallback).terms.map((term) => ({ ...term, id: term.label }));
  const topic = lesson?.title ?? preview?.topic ?? fallback.topic;
  const completed = new Set(lesson?.modules.map((module) => module.conceptId));
  const stage = lesson ? (lesson.modules.length ? 2 : 1) : 0;
  const label = useScramble(stages[stage].label);
  const words = usePresence([{ id: stages[stage].word }]);
  const angle = (index: number) => (index + .5) / terms.length * Math.PI * 2;
  const ring = usePresence(terms.map((term, index) => ({ ...term, index, angle: angle(index) })));
  const activeTerm = terms.find((term) => term.id === selected);
  const ready = terms.filter((term) => completed.has(term.id)).length;
  const status = lesson ? `${lesson.modules.length} of ${lesson.concepts.length} explanations ready` : preview ? "Exploring the ideas behind your topic" : "Finding a way into your material";
  const hint = longWait ? "Still working through the details. Your notes are safe here." : terms.some((term) => term.detail) ? "Curious already? Tap an idea as it drifts past." : "A little thinking. A few connections. A clearer picture.";
  // Fragments quote the learner's own material, so the field reads as research rather than decoration.
  const quotes = useMemo(() => input.replace(/^Attached lecture:.*$/gim, "").split(/[.?!;:\n]+/).map((part) => part.trim().replace(/\s+/g, " ")).filter((part) => part.length > 14).map(clip).slice(0, 6), [input]);
  const notes = [...quotes, ...terms.filter((term) => term.detail).map((term) => clip(term.detail))];
  const chords = lesson?.relations.flatMap((relation, index) => {
    const a = terms.findIndex((term) => term.id === relation.source), b = terms.findIndex((term) => term.id === relation.target);
    if (a < 0 || b < 0) return [];
    const [ax, az, bx, bz] = [Math.sin(angle(a)), Math.cos(angle(a)), Math.sin(angle(b)), Math.cos(angle(b))];
    return [{ id: relation.id, style: { "--cx": (ax + bx) / 2, "--cz": (az + bz) / 2, "--len": Math.hypot(bx - ax, bz - az), "--yaw": `${Math.atan2(az - bz, bx - ax)}rad`, "--i": index } as CSSProperties }];
  }) ?? [];

  useEffect(() => {
    const element = dialog.current;
    const previousFocus = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element?.showModal();
    element?.focus({ preventScroll: true });
    const timer = setTimeout(() => setLongWait(true), 30_000);
    return () => {
      clearTimeout(timer);
      element?.close();
      document.body.style.overflow = overflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  return createPortal(<dialog ref={dialog} tabIndex={-1} className={styles.dialog} aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); onCancel(); }}>
    <div className={styles.experience} data-paused={paused} data-stage={stage} onPointerMove={(event) => {
      if (event.pointerType !== "mouse") return;
      const { style } = event.currentTarget;
      style.setProperty("--px", (event.clientX / innerWidth * 2 - 1).toFixed(3));
      style.setProperty("--py", (event.clientY / innerHeight * 2 - 1).toFixed(3));
    }}>
      <div className={styles.space} aria-hidden="true">
        <div className={styles.camera}>
          {fragments.map((fragment, index) => {
            const note = index % 2 ? notes[(index - 1) / 2 % Math.max(notes.length, 1)] : undefined;
            const label = note ? (index - 1) / 2 < quotes.length ? "YOUR NOTES" : "FOUND" : `FIG. ${pad(Math.floor(index / 2) + 1)}`;
            return <Fragment key={index} label={label} note={note} sketch={sketches[Math.floor(index / 2) % sketches.length]} style={{ "--x": `${fragment.x}%`, "--y": `${fragment.y}%`, "--delay": `${fragment.delay}s` } as CSSProperties} />;
          })}
        </div>
      </div>
      <header className={styles.header}>
        <span className={styles.brand}>smrtr<ArrowUpRight size={22} strokeWidth={1.8} /></span>
        <span className={styles.headerNote}>A little curiosity goes a long way.</span>
        <button type="button" onClick={onCancel} className={styles.back}><ArrowLeft size={14} />Back to your notes</button>
      </header>
      <main className={styles.main}>
        <div className={styles.topic}><span>YOUR NEXT LIGHTBULB MOMENT</span><h1 id={titleId}><Swap id={topic}>{topic}</Swap></h1></div>
        <div className={styles.stage}>
          <div className={styles.glow} aria-hidden="true" />
          <div className={styles.orbitCamera}>
            <div className={styles.thought} aria-hidden="true">
              <span className={styles.thoughtLabel}>{label}</span>
              <div className={styles.words}>{words.map(({ item, leaving }) => <div key={item.id} className={styles.word} data-leaving={leaving || undefined}>{Array.from(item.id, (letter, index) => <span key={index} style={{ "--letter": index } as CSSProperties}>{letter}</span>)}<span className={styles.period}>.</span></div>)}</div>
            </div>
            <div className={styles.orbit}>
              <div className={styles.ring}>
                {chords.map((chord) => <i key={chord.id} className={styles.chord} style={chord.style} />)}
                {ring.map(({ item: term, leaving }) => <div key={term.id} className={styles.slot} data-leaving={leaving || undefined} inert={leaving} style={{ "--angle": `${term.angle}rad`, "--i": term.index } as CSSProperties}>
                  <button type="button" className={styles.term} data-ready={completed.has(term.id)} data-selected={selected === term.id} aria-pressed={selected === term.id} disabled={!term.detail} onClick={() => setSelected(selected === term.id ? null : term.id)} title={term.detail || undefined}>
                    <span className={styles.face}><span className={styles.termMarker}>{completed.has(term.id) ? <Check size={10} strokeWidth={2.4} /> : pad(term.index + 1)}</span><span>{term.label}</span></span>
                  </button>
                </div>)}
              </div>
            </div>
          </div>
        </div>
        <div className={styles.readout}>
          <div className={styles.meter} data-known={!!lesson} aria-hidden="true">
            <Swap id={pad(ready)}>{pad(ready)}</Swap><i style={{ "--progress": lesson ? ready / Math.max(terms.length, 1) : 0 } as CSSProperties} /><Swap id={lesson ? pad(terms.length) : "––"}>{lesson ? pad(terms.length) : "––"}</Swap>
          </div>
          <div className={styles.status} role="status"><span className={styles.statusLight} /><Swap id={status}>{status}</Swap></div>
          <div className={styles.insight} aria-live="polite">
            <Swap id={activeTerm?.detail ? activeTerm.id : hint}>{activeTerm?.detail ? <span className={styles.definition}><strong>{activeTerm.label}</strong><span>{activeTerm.detail}</span></span> : <span className={styles.hint}>{hint}</span>}</Swap>
          </div>
        </div>
      </main>
      <footer className={styles.footer}>
        <ol className={styles.steps} aria-label="Lesson preparation">
          {["Explore your topic", "Map the connections", "Build your lesson"].map((step, index) => <li key={step} data-active={index === stage} data-done={index < stage} aria-current={index === stage ? "step" : undefined}><span>{index < stage ? <Check size={10} /> : pad(index + 1)}</span>{step}</li>)}
        </ol>
        <button type="button" onClick={() => setPaused(!paused)} aria-pressed={paused}>{paused ? <Play size={13} /> : <Pause size={13} />}{paused ? "Resume motion" : "Pause motion"}</button>
      </footer>
    </div>
  </dialog>, document.body);
}
