import { z } from "zod";

export const GenerationPreviewSchema = z.object({
  topic: z.string().trim().min(1).max(90),
  terms: z.array(z.object({
    label: z.string().trim().min(1).max(36),
    detail: z.string().trim().min(1).max(180),
  })).min(3).max(8),
});
export type GenerationPreview = z.infer<typeof GenerationPreviewSchema>;

const stopWords = new Set("a an and are as at be been being but by can could did do does for from had has have how i if in into is it its just like me my of on or our please should so some than that the their them then there these they this those through to understand us was we were what when where which why will with would you your help explain lecture notes following attached want about also each very more most much such using use".split(" "));

/** Immediate, source-only material while the semantic preview is in flight. */
export function sourcePreview(text: string): Pick<GenerationPreview, "topic" | "terms"> {
  const clean = text.replace(/^Attached lecture:.*$/gim, "").replace(/^Help me understand the following lecture notes\./i, "").trim();
  const words = clean.match(/[\p{L}][\p{L}\p{N}’'-]*/gu) ?? [];
  const counts = new Map<string, { label: string; count: number }>();
  for (const word of words) {
    const key = word.toLocaleLowerCase();
    if (key.length < 3 || word.length > 30 || stopWords.has(key)) continue;
    const entry = counts.get(key);
    counts.set(key, { label: entry?.label ?? word, count: (entry?.count ?? 0) + 1 });
  }
  const terms = [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 8).map(({ label }) => ({ label, detail: "" }));
  const firstLine = clean.split(/\n/)[0].replace(/^Help me understand\s+/i, "").trim();
  return { topic: firstLine.length > 90 ? `${firstLine.slice(0, 87)}…` : firstLine || "Your lecture notes", terms };
}
