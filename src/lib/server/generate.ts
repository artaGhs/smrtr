import { randomUUID } from "node:crypto";
import { z } from "zod";
import { GenerationRequestSchema, GenerationResponseSchema, type GenerationEvent, type Lesson, type Question } from "../contracts";
import { createBfsQuestions } from "./bfs-questions";
import { GenerationError } from "./errors";
import { createOpenAIProvider, type LessonProvider } from "./provider";
import { ModuleResultSchema, PlanResultSchema, SOURCE_ID, SYSTEM_INSTRUCTIONS, providerJsonSchema } from "./schemas";
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
    async function stage<T>(schema: z.ZodType<T>, schemaName: string, prompt: string, maxOutputTokens: number, validate: (value: T) => void, context: Record<string, unknown> = {}): Promise<T> {
      let repair: string[] = [];
      for (let attempt = 0; attempt < 2; attempt++) {
        controller.signal.throwIfAborted();
        try {
          const raw = await provider.generate({
            schemaName,
            jsonSchema: providerJsonSchema(schema),
            instructions: SYSTEM_INSTRUCTIONS,
            input: JSON.stringify({ source: { id: SOURCE_ID, text: notes }, task: prompt, ...context, ...(repair.length ? { correction: repair, instruction: "Return a fresh corrected result. Retain the topic and obey all ID and reference constraints." } : {}) }),
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
    const modules = new Map<string, Lesson["modules"][number]>();
    const computedFinal = new Map<string, Question>();
    let cursor = 0;
    async function worker() {
      while (cursor < plan.path.length) {
        const conceptId = plan.path[cursor++];
        let validatedModule: Lesson["modules"][number] | undefined;
        await stage(ModuleResultSchema, "study_module", `Teach only targetConceptId from the validated plan. Preserve its concept ID and sourceIds ["source-input"]. Use module ID "module-${conceptId}" and question IDs prefixed "question-${conceptId}-" to avoid collisions with other independent modules. Give 1–3 concise explanatory paragraphs, a clearly labeled generated example, one activity, and 1–2 precise questions. Concept activities should have 3–5 meaningful reveal steps. Use BFS activity only for the concept that directly teaches the BFS algorithm; otherwise use conceptual activities. The server replaces any BFS module example and questions with computed graph practice. All other questions must be conceptual, never calculated BFS trace or path questions.`, 3200, (value) => {
          let module = value.module;
          let distanceQuestion: Question | undefined;
          if (module.conceptId !== conceptId || module.id !== `module-${conceptId}`) throw new LessonValidationError(["module must match targetConceptId and required module ID"]);
          if (module.activity.kind === "bfs") {
            try {
              const computed = createBfsQuestions(module.activity, conceptId, module.id);
              distanceQuestion = computed.finalQuestion;
              module = { ...module, example: computed.example, questions: [computed.moduleQuestion] };
            } catch {
              throw new LessonValidationError(["BFS activity graph must have unique valid node labels, known start/endpoints, and no duplicate edges"]);
            }
          }
          validateLesson({ ...plan, modules: [...modules.values(), module], finalQuestions: [] }, originalText, true);
          validatedModule = module;
          modules.set(conceptId, module);
          if (distanceQuestion) computedFinal.set(conceptId, distanceQuestion);
        }, { targetConceptId: conceptId, plan: result.plan });
        if (!validatedModule) throw new GenerationError("GENERATION_FAILED", "Could not complete a lesson module.");
        publish({ type: "module", requestId, module: validatedModule });
      }
    }
    await Promise.all(Array.from({ length: Math.min(3, plan.path.length) }, () => worker()));
    const orderedModules = plan.path.map((id) => modules.get(id)!);
    // Final practice reuses validated, input-specific retrieval questions. BFS adds
    // a fresh computed distance task rather than trusting a generated answer key.
    const retrieval = orderedModules.flatMap((module) => module.questions.slice(0, 1).map((question) => ({ ...question, id: `final-${question.id}` })));
    const verifiedBfsFinal = plan.path.flatMap((id) => computedFinal.has(id) ? [computedFinal.get(id)!] : []);
    const complete = validateLesson({ ...plan, modules: orderedModules, finalQuestions: [...verifiedBfsFinal, ...retrieval].slice(0, 5) }, originalText);
    publish({ type: "complete", requestId, lesson: complete });
    return GenerationResponseSchema.parse({ requestId, lesson: complete });
  } catch (error) {
    controller.abort();
    if (timedOut) throw new GenerationError("GENERATION_TIMEOUT", "Generation took too long. Try shorter notes or a narrower topic.", 504);
    if (options.signal?.aborted) throw new GenerationError("REQUEST_ABORTED", "Generation was canceled.", 499);
    throw error;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", abort);
  }
}
