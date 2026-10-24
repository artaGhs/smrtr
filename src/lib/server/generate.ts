import { randomUUID } from "node:crypto";
import { z } from "zod";
import { GenerationRequestSchema, GenerationResponseSchema, type GenerationEvent, type Lesson, type Question } from "../contracts";
import { createBfsQuestions } from "./bfs-questions";
import { GenerationError } from "./errors";
import { createOpenAIProvider, type LessonProvider } from "./provider";
import { ContentSchema, PlanResultSchema, SOURCE_ID, SYSTEM_INSTRUCTIONS } from "./schemas";
import { LessonValidationError, validateLesson } from "./validation";

type Options = {
  provider?: LessonProvider;
  signal?: AbortSignal;
  timeoutMs?: number;
  onEvent?: (event: GenerationEvent) => void;
};

function configuredTimeout() {
  const configured = Number(process.env.SMRTR_GENERATION_TIMEOUT_MS ?? 120_000);
  return Number.isFinite(configured) ? Math.min(180_000, Math.max(1000, configured)) : 120_000;
}

export async function generateLesson(input: unknown, options: Options = {}) {
  const parsed = GenerationRequestSchema.safeParse(input);
  if (!parsed.success) throw new GenerationError("INVALID_INPUT", "Provide a requestId and 10–40,000 characters of study notes or an educational topic.", 400);
  const { requestId } = parsed.data;
  if (!requestId.trim() || requestId.length > 200) throw new GenerationError("INVALID_INPUT", "requestId must contain 1–200 characters.", 400);
  // Validation trims for length only. The source record retains the exact original submission.
  const originalText = (input as { text: string }).text;
  const notes = parsed.data.text.replace(/\r\n?/g, "\n");
  if (originalText.length > 40_000) throw new GenerationError("INVALID_INPUT", "Study input must be at most 40,000 characters.", 400);
  if (!/[\p{L}\p{N}]/u.test(notes)) throw new GenerationError("INSUFFICIENT_INPUT", "Add a recognizable study topic or notes to build a useful lesson.", 422);
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  if (options.signal?.aborted) abort();
  else options.signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => { timedOut = true; abort(); }, options.timeoutMs ?? configuredTimeout());
  try {
    if (controller.signal.aborted) throw new GenerationError("REQUEST_ABORTED", "Generation was canceled.", 499);
    const provider = options.provider ?? createOpenAIProvider();
    const base = {
      id: `lesson-${randomUUID()}`, revision: randomUUID(), mode: "generated" as const,
      sources: [{ id: SOURCE_ID, title: "Your submitted notes or topic", text: originalText }],
    };
    const publish = (event: GenerationEvent) => { if (!controller.signal.aborted) options.onEvent?.(event); };
    async function stage<T>(schema: z.ZodType<T>, schemaName: string, prompt: string, maxOutputTokens: number, validate: (value: T) => void): Promise<T> {
      let repair: string[] = [];
      for (let attempt = 0; attempt < 2; attempt++) {
        controller.signal.throwIfAborted();
        try {
          const raw = await provider.generate({
            schemaName,
            jsonSchema: z.toJSONSchema(schema) as Record<string, unknown>,
            instructions: SYSTEM_INSTRUCTIONS,
            input: JSON.stringify({ source: { id: SOURCE_ID, text: notes }, task: prompt, ...(repair.length ? { correction: repair, instruction: "Return a fresh corrected result. Retain the topic and obey all ID and reference constraints." } : {}) }),
            signal: controller.signal,
            maxOutputTokens,
          });
          controller.signal.throwIfAborted();
          const result = schema.safeParse(raw);
          if (!result.success) throw new LessonValidationError(result.error.issues.slice(0, 12).map((issue) => `${issue.path.join(".")}: ${issue.code}`));
          validate(result.data);
          return result.data;
        } catch (error) {
          if (controller.signal.aborted) throw error;
          if (error instanceof LessonValidationError) repair = error.issues;
          else if (error instanceof GenerationError && error.code === "PROVIDER_INVALID_OUTPUT") repair = ["Return complete valid JSON matching the requested schema."];
          else throw error;
          if (attempt === 1) throw new GenerationError("INVALID_GENERATED_LESSON", "The generated lesson did not pass consistency checks. Try a narrower topic or clearer notes.");
        }
      }
      throw new GenerationError("GENERATION_FAILED", "Could not create a valid lesson.");
    }
    const result = await stage(PlanResultSchema, "study_plan", "First create a compact conceptual plan only: 3–6 concepts where useful, typed connections and a valid learning path. No module content yet. If insufficient, plan must be null and reason should tell the learner what material to provide. If ready, plan must be present.", 3000, (value) => {
      if (value.status === "insufficient") {
        if (value.plan !== null) throw new LessonValidationError(["insufficient result must have null plan"]);
        return;
      }
      if (!value.plan) throw new LessonValidationError(["ready result needs a plan"]);
      validateLesson({ ...base, ...value.plan, modules: [], finalQuestions: [] }, originalText, true);
    });
    if (result.status === "insufficient" || !result.plan) throw new GenerationError("INSUFFICIENT_INPUT", "The input did not identify enough study material. Add a concrete educational topic or a paragraph of notes.", 422);
    const plan = validateLesson({ ...base, ...result.plan, modules: [], finalQuestions: [] }, originalText, true);
    publish({ type: "plan", requestId, lesson: plan });
    let complete: Lesson | undefined;
    await stage(ContentSchema, "study_content", `Now teach this exact validated plan; preserve all concept IDs and source IDs: ${JSON.stringify(result.plan)}. Create exactly one module per concept in learning-path order, each with 1–3 concise explanatory paragraphs, a clearly labeled generated example, an activity, and 1–2 precise questions. Concept activities should have 3–5 meaningful reveal steps. Include 2–3 final practice questions across the concepts. For any BFS module the graph inputs must be valid; the server will replace that module's example and questions with computed graph practice. All other questions must be conceptual, never calculated BFS trace or path questions.`, 10000, (content) => {
      const computedFinal: Question[] = [];
      const modules = content.modules.map((module) => {
        if (module.activity.kind !== "bfs") return module;
        try {
          const computed = createBfsQuestions(module.activity, module.conceptId, module.id);
          computedFinal.push(computed.finalQuestion);
          return { ...module, example: computed.example, questions: [computed.moduleQuestion] };
        } catch {
          throw new LessonValidationError(["BFS activity graph must have unique valid node labels, known start/endpoints, and no duplicate edges"]);
        }
      });
      complete = validateLesson({ ...plan, modules, finalQuestions: [...computedFinal, ...content.finalQuestions].slice(0, 5) }, originalText);
    });
    if (!complete) throw new GenerationError("GENERATION_FAILED", "Could not complete the lesson.");
    for (const module of complete.modules) publish({ type: "module", requestId, module });
    publish({ type: "complete", requestId, lesson: complete });
    return GenerationResponseSchema.parse({ requestId, lesson: complete });
  } catch (error) {
    if (timedOut) throw new GenerationError("GENERATION_TIMEOUT", "Generation took too long. Try shorter notes or a narrower topic.", 504);
    if (options.signal?.aborted) throw new GenerationError("REQUEST_ABORTED", "Generation was canceled.", 499);
    throw error;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", abort);
  }
}
