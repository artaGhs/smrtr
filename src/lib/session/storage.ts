import { z } from "zod";
import { LessonSchema } from "../contracts";
export const SESSION_KEY = "smrtr.study-session.v1";
export const SavedSessionSchema = z.object({
  lesson: LessonSchema,
  generationMode: z.enum(["chat", "provider"]).optional(),
  chatRequestId: z.string().optional(),
  input: z.string().max(40000),
  selectedConceptId: z.string(),
  attempts: z
    .array(
      z.object({
        id: z.string(),
        lessonId: z.string(),
        revision: z.string(),
        questionId: z.string(),
        conceptIds: z.array(z.string()),
        selectedOptionIds: z.array(z.string()),
        correct: z.boolean(),
        createdAt: z.string(),
      }),
    )
    .max(1000),
});
export type SavedSession = z.infer<typeof SavedSessionSchema>;
export function readSession(
  storage: Pick<Storage, "getItem">,
): SavedSession | null {
  try {
    const text = storage.getItem(SESSION_KEY);
    if (!text) return null;
    const parsed = SavedSessionSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
export function saveSession(
  storage: Pick<Storage, "setItem">,
  session: SavedSession,
) {
  try {
    storage.setItem(
      SESSION_KEY,
      JSON.stringify({ ...session, attempts: session.attempts.slice(-1000) }),
    );
  } catch {
    /* A full or disabled browser store should not interrupt studying. */
  }
}
