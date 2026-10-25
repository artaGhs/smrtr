import { generatePreview } from "./generation-preview";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { GenerationRequestSchema, GenerationResponseSchema, type GenerationEvent, type Lesson, type Question } from "../contracts";
import { createBfsQuestions } from "./bfs-questions";
import { GenerationError } from "./errors";
import { createConfiguredProvider, type LessonProvider } from "./provider";
import { ModuleResultSchema, PlanResultSchema, SOURCE_ID, SYSTEM_INSTRUCTIONS, providerJsonSchema } from "./schemas";
import { LessonValidationError, validateLesson } from "./validation";
import { CONFIDENCE_GUIDANCE, conceptLearnerContext, normalizeLearnerProfile } from "./learner-profile";

type Options = {
  preview?: boolean;
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
  const learnerProfile = normalizeLearnerProfile(parsed.data.learnerProfile);
  if (!requestId.trim() || requestId.length > 200) throw new GenerationError("INVALID_INPUT", "requestId must contain 1–200 characters.", 400);
  // Validation trims for length only. The source record retains the exact original submission.
  const originalText = (input as { text: string }).text;
  const notes = parsed.data.text.replace(/\r\n?/g, "\n");
  if (originalText.length > 40_000) throw new GenerationError("INVALID_INPUT", "Study input must be at most 40,000 characters.", 400);
  if (!/[\p{L}\p{N}]/u.test(notes)) throw new GenerationError("INSUFFICIENT_INPUT", "Add a recognizable study topic or notes to build a useful lesson.", 422);
  const controller = new AbortController();
  const previewController = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  if (options.signal?.aborted) abort();
  else options.signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => { timedOut = true; abort(); }, options.timeoutMs ?? configuredTimeout());
  try {
    if (controller.signal.aborted) throw new GenerationError("REQUEST_ABORTED", "Generation was canceled.", 499);
    const provider = options.provider ?? createConfiguredProvider();
    const base = {
      id: `lesson-${randomUUID()}`, revision: randomUUID(), mode: "generated" as const,
      learnerProfile,
      sources: [{ id: SOURCE_ID, title: "Your submitted notes or topic", text: originalText }],
    };
    const publish = (event: GenerationEvent) => { if (!controller.signal.aborted) options.onEvent?.(event); };
    if (options.preview && options.onEvent) {
      const previewSignal = AbortSignal.any([controller.signal, previewController.signal, AbortSignal.timeout(12_000)]);
      void generatePreview(provider, notes, previewSignal).then((preview) => {
        if (preview && !previewSignal.aborted) publish({ type: "preview", requestId, preview });
      });
    }
    async function stage<T>(schema: z.ZodType<T>, schemaName: string, prompt: string, maxOutputTokens: number, validate: (value: T) => void, context: Record<string, unknown> = {}): Promise<T> {
      let repair: string[] = [];
      for (let attempt = 0; attempt < 2; attempt++) {
        controller.signal.throwIfAborted();
        try {
          const raw = await provider.generate({
            schemaName,
            jsonSchema: providerJsonSchema(schema),
            instructions: SYSTEM_INSTRUCTIONS,
            input: JSON.stringify({ source: { id: SOURCE_ID, text: notes }, learnerProfile, confidenceGuidance: CONFIDENCE_GUIDANCE[learnerProfile.overall], task: prompt, ...context, ...(repair.length ? { correction: repair, instruction: "Return a fresh corrected result. Retain the topic and obey all ID and reference constraints." } : {}) }),
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
    const result = await stage(PlanResultSchema, "study_plan", "Create an authored conceptual, teaching and page design: 3–6 concepts where useful, typed connections with explanatory meaning, a valid prerequisite path, required teachingPlan and required learningDesign. Build one continuing scenario around a central question/objective and stated assumed knowledge. Author bounded prose/linked-support pages, their acyclic hierarchy and a main problem->intuitive layers->questions->mechanisms->why/limits->transfer sequence; these are three different structures from concept relations and concept prerequisite path. Canonical scenario activity inputs must be reused exactly by the matching module and all core/support pages. Only a clearly labeled transfer page may use a different network. Make novice vs experienced routes substantively different; respond to the fixed learnerProfile and stable manual topic overrides, with topicIds only from that profile. Begin teaching with a concrete example or visual big-picture situation before underlying abstractions. No module content yet. If insufficient, plan must be null and reason should tell the learner what material to provide. If ready, plan must be present.", 14000, (value) => {
      if (value.status === "insufficient") {
        if (value.plan !== null) throw new LessonValidationError(["insufficient result must have null plan"]);
        return;
      }
      if (!value.plan) throw new LessonValidationError(["ready result needs a plan"]);
      validateLesson({ ...base, ...value.plan, modules: [], finalQuestions: [] }, originalText, true);
    });
    if (result.status === "insufficient" || !result.plan) throw new GenerationError("INSUFFICIENT_INPUT", "The input did not identify enough study material. Add a concrete educational topic or a paragraph of notes.", 422);
    const plan = validateLesson({ ...base, ...result.plan, modules: [], finalQuestions: [] }, originalText, true);
    previewController.abort();
    publish({ type: "plan", requestId, lesson: plan });
    const teachingSequence = result.plan.teachingPlan.sequence;
    const teachingOrder = teachingSequence.map((step) => step.conceptId);
    const modules = new Map<string, Lesson["modules"][number]>();
    const computedFinal = new Map<string, Question>();
    let cursor = 0;
    async function worker() {
      while (cursor < teachingSequence.length) {
        const teachingPosition = cursor++;
        const teachingStep = teachingSequence[teachingPosition];
        const conceptId = teachingStep.conceptId;
        const learnerContext = conceptLearnerContext(plan, conceptId);
        let validatedModule: Lesson["modules"][number] | undefined;
        await stage(ModuleResultSchema, "study_module", `Teach only targetConceptId using teachingStep.approach and teachingStep.purpose. This is teaching step ${teachingPosition + 1} of ${teachingSequence.length}, independent of the prerequisite path. Adapt substantively to learnerContext.effectiveLevel and guidance (manual topic overrides take priority over overall); this is self-report, not proven mastery. Use the ONE continuing learningDesign.scenario with the same entities and question, and support the target pages and route in learnerContext. If targetConceptId equals scenario.activityConceptId, reuse scenario.activity exactly; core/support must not invent another graph. A separately bound transfer concept may use a clearly labeled different generated network. Connect to the plan's openingQuestion/bigPicture/centralQuestion/objective. If approach is example, begin with a concrete worked situation and prediction before abstractions. If visual, use activity steps to expose changes and relationships. If explanation, derive mechanisms from the scenario. If practice, ask for application and explain feedback. Make approach and learner confidence change the actual content rather than labels. Preserve concept ID and sourceIds ["source-input"]. Use module ID "module-${conceptId}" and question IDs prefixed "question-${conceptId}-". Give a concise explanation, a generated example grounded in the continuing scenario, one activity with 3–5 meaningful steps, and 1–2 questions. Other nonalgorithm concepts use conceptual activities. The server replaces BFS module example/questions with computed graph practice. All other questions must be conceptual, never calculated BFS outcomes.`, 3200, (value) => {
          let module = value.module;
          let distanceQuestion: Question | undefined;
          if (module.conceptId !== conceptId || module.id !== `module-${conceptId}`) throw new LessonValidationError(["module must match targetConceptId and required module ID"]);
          if (module.activity.kind === "bfs") {
            try {
              const transfer = plan.learningDesign?.scenario.activityConceptId !== conceptId && plan.learningDesign?.pages.some((page) => page.kind === "transfer" && page.activityConceptId === conceptId);
              const computed = createBfsQuestions(module.activity, conceptId, module.id, { transfer });
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
        }, { targetConceptId: conceptId, teachingStep, teachingPosition, learnerContext, plan: result.plan });
        if (!validatedModule) throw new GenerationError("GENERATION_FAILED", "Could not complete a lesson module.");
        publish({ type: "module", requestId, module: validatedModule });
      }
    }
    await Promise.all(Array.from({ length: Math.min(3, teachingSequence.length) }, () => worker()));
    const orderedModules = teachingOrder.map((id) => modules.get(id)!);
    // Final practice reuses validated, input-specific retrieval questions. BFS adds
    // a fresh computed distance task rather than trusting a generated answer key.
    const retrieval = orderedModules.flatMap((module) => module.questions.slice(0, 1).map((question) => ({ ...question, id: `final-${question.id}` })));
    const verifiedBfsFinal = teachingOrder.flatMap((id) => computedFinal.has(id) ? [computedFinal.get(id)!] : []);
    const complete = validateLesson({ ...plan, modules: orderedModules, finalQuestions: [...verifiedBfsFinal, ...retrieval].slice(0, 5) }, originalText);
    publish({ type: "complete", requestId, lesson: complete });
    return GenerationResponseSchema.parse({ requestId, lesson: complete });
  } catch (error) {
    controller.abort();
    if (timedOut) throw new GenerationError("GENERATION_TIMEOUT", "Generation took too long. Try shorter notes or a narrower topic.", 504);
    if (options.signal?.aborted) throw new GenerationError("REQUEST_ABORTED", "Generation was canceled.", 499);
    throw error;
  } finally {
    previewController.abort();
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", abort);
  }
}
