import { useState } from "react";
import { Plus, X } from "lucide-react";
import type { ConfidenceLevel, LearnerProfile } from "@/lib/contracts";

const levels: { value: ConfidenceLevel; label: string }[] = [
  { value: "new", label: "New to this" },
  { value: "recognize", label: "Recognize terms" },
  { value: "explain", label: "Can explain basics" },
  { value: "apply", label: "Can apply" },
];

export function LearnerConfidence({ profile, onChange }: {
  profile: LearnerProfile;
  onChange: (profile: LearnerProfile) => void;
}) {
  const [topicDraft, setTopicDraft] = useState("");
  return <section className="learner-confidence" aria-label="Your starting confidence">
    <fieldset className="confidence-levels"><legend>Where are you starting?</legend><p>Your own estimate helps choose a starting route. It isn’t a mastery score.</p><div>{levels.map((level) => <label key={level.value} className={profile.overall === level.value ? "active" : ""}><input type="radio" name="overall-confidence" value={level.value} checked={profile.overall === level.value} onChange={() => onChange({ ...profile, overall: level.value })} /><span>{level.label}</span></label>)}</div></fieldset>
    <details className="topic-confidence"><summary>Set confidence for specific topics <span>Optional</span></summary><p>These are topics you enter yourself, not topics inferred from your notes.</p>{profile.topics.map((topic) => <div className="topic-confidence-row" key={topic.id}><input aria-label="Topic name" value={topic.label} maxLength={120} onChange={(event) => onChange({ ...profile, topics: profile.topics.map((item) => item.id === topic.id ? { ...item, label: event.target.value } : item) })} /><select aria-label={`Confidence for ${topic.label || "topic"}`} value={topic.level ?? "same"} onChange={(event) => onChange({ ...profile, topics: profile.topics.map((item) => item.id === topic.id ? { ...item, level: event.target.value === "same" ? null : event.target.value as ConfidenceLevel } : item) })}><option value="same">Use same level</option>{levels.map((level) => <option key={level.value} value={level.value}>{level.label}</option>)}</select><button className="icon-button" aria-label={`Remove topic ${topic.label}`} onClick={() => onChange({ ...profile, topics: profile.topics.filter((item) => item.id !== topic.id) })}><X size={13} /></button></div>)}<div className="topic-confidence-add"><input aria-label="New confidence topic" placeholder="Topic you want to set separately" maxLength={120} value={topicDraft} onChange={(event) => setTopicDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }} /><button disabled={!topicDraft.trim() || profile.topics.length >= 12} onClick={() => { onChange({ ...profile, topics: [...profile.topics, { id: crypto.randomUUID(), label: topicDraft.trim(), level: null }] }); setTopicDraft(""); }}><Plus size={12} />Add</button></div>{profile.topics.some((topic) => !topic.label.trim()) && <p className="confidence-validation">Give each topic a name, or remove its row.</p>}</details>
  </section>;
}
