"use client";

import { useState } from "react";
import { ArrowRight, Check, MoveHorizontal } from "lucide-react";
import type { SortFrame } from "@/lib/station-canvas/types";
import styles from "./sorting-prediction.module.css";

type Choice = "keep" | "swap";

export function SortingPrediction({ frame, onReveal }: { frame: SortFrame; onReveal: () => void }) {
  const [attempt, setAttempt] = useState<{ frameId: string; choice: Choice } | null>(null);
  const pair = frame.phase === "compare"
    ? frame.items.filter((item) => frame.activeIds.includes(item.id))
    : frame.items.slice(0, 2);
  const answer = attempt?.frameId === frame.id ? attempt.choice : null;
  const [left, right] = pair;
  if (!left || !right) return <div className={styles.prediction}><p>There is no pair left to compare.</p><button onClick={onReveal}>See the result <ArrowRight size={14} /></button></div>;
  const expected: Choice = left.value > right.value ? "swap" : "keep";
  const correct = answer === expected;
  return <section className={`${styles.prediction} nodrag nopan nowheel`} aria-label="Predict the sorting move">
    <div className={styles.question}><span>BEFORE IT MOVES</span><strong>Look at {left.value} and {right.value}. Keep their order, or swap?</strong></div>
    <div className={styles.choices}>
      <button aria-pressed={answer === "keep"} disabled={!!answer} onClick={() => setAttempt({ frameId: frame.id, choice: "keep" })}><Check size={15} />Keep their order</button>
      <button aria-pressed={answer === "swap"} disabled={!!answer} onClick={() => setAttempt({ frameId: frame.id, choice: "swap" })}><MoveHorizontal size={15} />Swap neighbours</button>
    </div>
    {answer ? <>
      <p className={styles.feedback} role="status"><strong>{correct ? "That follows the rule." : "Here is what the rule decides."}</strong> {expected === "swap" ? `${left.value} is larger than ${right.value}, so the two books trade places.` : left.value === right.value ? "The values are equal, so their original order stays the same." : `${left.value} is smaller than ${right.value}, so this pair stays in place.`}</p>
      <button className={styles.reveal} onClick={onReveal}>Show the move <ArrowRight size={15} /></button>
    </> : <button className={styles.watch} onClick={onReveal}>Watch this one instead <ArrowRight size={13} /></button>}
  </section>;
}
