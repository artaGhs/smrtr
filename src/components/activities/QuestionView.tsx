"use client";

import { useId, useState } from "react";
import type { Evaluation, QuestionViewProps } from "@/lib/contracts";
import { evaluateQuestion } from "@/lib/simulation/assessment";
import styles from "./activities.module.css";

export function QuestionView(props: QuestionViewProps) {
  return <QuestionForm key={JSON.stringify(props.question)} {...props} />;
}
function QuestionForm({ question, onAnswer }: QuestionViewProps) {
  const groupId = useId();
  const [selected, setSelected] = useState<string[]>([]);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const multiple = question.correctOptionIds.length > 1;
  return <form className={styles.question} data-question-id={question.id} onSubmit={event => {
    event.preventDefault();
    if (!selected.length || evaluation) return;
    const result = evaluateQuestion(question, selected);
    setEvaluation(result);
    onAnswer([...selected], result);
  }}>
    <span className={styles.eyebrow}>CHECK YOUR UNDERSTANDING</span>
    <fieldset className={styles.questionFieldset} disabled={evaluation !== null}><legend>{question.prompt}</legend>
      <p className={styles.note}>{multiple ? "Select all correct answers, then check." : "Choose one answer, then check."}</p>
      <div className={styles.answers}>{question.options.map((option, index) => <label key={option.id} className={`${styles.answer} ${selected.includes(option.id) ? styles.answerSelected : ""}`}>
        <input type={multiple ? "checkbox" : "radio"} name={groupId} value={option.id} checked={selected.includes(option.id)} onChange={() => setSelected(previous => multiple ? previous.includes(option.id) ? previous.filter(id => id !== option.id) : [...previous, option.id] : [option.id])} />
        <span className={styles.optionLetter} aria-hidden="true">{String.fromCharCode(65 + index)}</span><span>{option.text}</span>
        {evaluation && question.correctOptionIds.includes(option.id) && <span className={styles.correctMark}>✓ Correct</span>}
      </label>)}</div>
    </fieldset>
    <button type="submit" className={styles.checkButton} disabled={!selected.length || evaluation !== null}>Check answer</button>
    {evaluation && <div className={styles.feedback} role="status"><strong>{evaluation.correct ? "That's right." : "Worth another look."}</strong><p>{evaluation.feedback}</p>{!evaluation.correct && <p>Review the linked concepts, then try the idea in the lab.</p>}</div>}
  </form>;
}
