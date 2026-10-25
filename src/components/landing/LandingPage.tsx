"use client";

import Link from "next/link";
import { lazy, Suspense, useEffect, useState } from "react";
import { ArrowRight, Pause, Play, Sparkles } from "lucide-react";
import type { Lesson } from "@/lib/contracts";
import { UnderstandingMachine, type Subject } from "./UnderstandingMachine";
import { LearningPrompt } from "./LearningPrompt";
import styles from "./landing.module.css";

// Prefetched once the learner starts on the prompt, so the lesson reveal renders it at once instead of suspending.
let loadedStudy: typeof import("./GeneratedStudy").default | undefined;
const loadStudy = () => import("./GeneratedStudy").then((module) => { loadedStudy = module.default; return module; });
const GeneratedStudy = lazy(loadStudy);
const subjects: { id: Subject; label: string }[] = [
  { id: "physics", label: "Physics" },
  { id: "biology", label: "Biology" },
  { id: "computer-science", label: "Computer science" },
];

function Brand() {
  return <span className={styles.brand}>smrtr<span aria-hidden="true">↗</span></span>;
}

function TypedText({ text, start, interval = 42 }: { text: string; start: number; interval?: number }) {
  return <>{Array.from(text).map((character, index) => <span key={index} className={styles.headlineCharacter} data-entrance style={{ animationDelay: `${start + index * interval}ms` }}>{character === " " ? "\u00a0" : character}</span>)}</>;
}

export function LandingPage() {
  const [subject, setSubject] = useState<Subject>("physics");
  const [playing, setPlaying] = useState(true);
  const [created, setCreated] = useState<{ lesson: Lesson; input: string; Study: NonNullable<typeof loadedStudy> | typeof GeneratedStudy } | null>(null);
  const [introFinished, setIntroFinished] = useState(false);
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const finishForReducedMotion = () => {
      if (preference.matches) setIntroFinished(true);
    };
    finishForReducedMotion();
    preference.addEventListener("change", finishForReducedMotion);
    return () => preference.removeEventListener("change", finishForReducedMotion);
  }, []);
  const finishIntro = () => setIntroFinished(true);
  const openPrompt = () => {
    finishIntro();
    const field = document.getElementById("learning-prompt");
    field?.focus({ preventScroll: true });
    field?.scrollIntoView({ block: "center", behavior: "auto" });
  };

  if (created) return <Suspense fallback={<div className={styles.openingLesson} role="status">Opening your visual lesson…</div>}><created.Study lesson={created.lesson} input={created.input} onNewLesson={() => { finishIntro(); setCreated(null); window.scrollTo(0, 0); }} /></Suspense>;

  return <div className={styles.page} data-intro={introFinished ? "complete" : "playing"} onFocusCapture={finishIntro} onKeyDownCapture={(event) => { if (event.key === "Tab") finishIntro(); }}>
    <a className={styles.skip} href="#learn" onClick={(event) => { event.preventDefault(); openPrompt(); }}>Skip to your question</a>
    <div className={`${styles.announcement} ${styles.introAnnouncement}`} data-entrance><Sparkles size={12} strokeWidth={1.5} /><span>For the moments when it finally clicks.</span></div>
    <header className={`${styles.header} ${styles.introHeader}`} data-entrance>
      <Link href="/" aria-label="SMRTR home"><Brand /></Link>
      <span className={styles.headerNote}>A little curiosity goes a long way.</span>
      <a className={styles.navCta} href="#learn" onClick={(event) => { event.preventDefault(); openPrompt(); }}>Let’s figure it out <ArrowRight size={15} /></a>
    </header>
    <main id="main">
      <section className={styles.hero} aria-labelledby="hero-heading">
        <div className={styles.heroIntro}>
          <span className={`${styles.eyebrow} ${styles.introEyebrow}`} data-entrance><span className={styles.tinyStar}>✳</span> A NEW WAY TO GET IT</span>
          <h1 id="hero-heading" aria-label="Less memorizing. More understanding.">
            <span className={styles.headlineLine} aria-hidden="true"><TypedText text="Less memorizing." start={340} interval={39} /></span>
            <span className={styles.headlineLine} aria-hidden="true"><TypedText text="More " start={1170} /><em className={styles.headlineEmphasis} data-entrance><TypedText text="understanding." start={1440} interval={46} /><svg className={styles.headlineUnderline} viewBox="0 0 440 18" preserveAspectRatio="none" aria-hidden="true"><path d="M3 12C112 1 298 13 436 5" pathLength="1" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" data-entrance /></svg></em></span>
          </h1>
          <p className={styles.introDescription} data-entrance>Tell us what you’re working through. Drop in your notes.<br className={styles.desktopBreak} /> Let’s turn the difficult part into something you can see.</p>
        </div>
        <div className={styles.introPrompt} data-entrance onFocusCapture={() => { finishIntro(); void loadStudy(); }} onPointerDownCapture={finishIntro} onDragEnterCapture={() => { finishIntro(); void loadStudy(); }}>
          <LearningPrompt onLessonReady={(lesson, input) => { finishIntro(); setCreated({ lesson, input, Study: loadedStudy ?? GeneratedStudy }); window.scrollTo(0, 0); }} />
        </div>
        <div id="visual-flow" className={`${styles.machineScene} ${styles.introMachine} ${!playing ? styles.paused : ""}`} data-entrance><UnderstandingMachine subject={subject} /></div>
        <div className={`${styles.sceneControls} ${styles.introControls}`} data-entrance><div className={styles.subjectChoices} role="group" aria-label="Choose an example subject">{subjects.map((item) => <button key={item.id} aria-pressed={subject === item.id} className={subject === item.id ? styles.subjectActive : ""} onClick={() => setSubject(item.id)}>{item.label}</button>)}</div><button className={styles.pauseButton} aria-label={playing ? "Pause illustration" : "Play illustration"} onClick={() => setPlaying(!playing)}>{playing ? <Pause size={13} /> : <Play size={13} />}<span>{playing ? "Pause" : "Play"}</span></button></div>
      </section>
    </main>
    <footer className={`${styles.simpleFooter} ${styles.introFooter}`} data-entrance onAnimationEnd={(event) => { if (event.target === event.currentTarget) finishIntro(); }}><span>For curious minds. And the moments it clicks.</span><span>© {new Date().getFullYear()} SMRTR</span></footer>
  </div>;
}
