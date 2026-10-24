import { z } from "zod";

export const SourceRecordSchema = z.object({
  id: z.string(),
  text: z.string(),
  title: z.string(),
  locator: z.string().optional(),
});
export const ConceptSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  objective: z.string(),
  sourceIds: z.array(z.string()),
});
export const RelationSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  type: z.enum(["prerequisite", "related", "contrast", "example"]),
});
export const BfsActivitySchema = z.object({
  kind: z.literal("bfs"),
  nodes: z.array(z.string()).min(1),
  edges: z.array(z.object({ source: z.string(), target: z.string() })),
  start: z.string(),
  directed: z.boolean(),
  neighborOrder: z.literal("alphabetical"),
  visitedOn: z.literal("enqueue"),
});
export const ActivitySpecSchema = z.discriminatedUnion("kind", [
  BfsActivitySchema,
  z.object({
    kind: z.literal("concept"),
    prompt: z.string(),
    steps: z.array(z.object({ title: z.string(), body: z.string() })).min(1),
  }),
]);
export const QuestionSchema = z.object({
  id: z.string(),
  conceptIds: z.array(z.string()).min(1),
  prompt: z.string(),
  options: z.array(z.object({ id: z.string(), text: z.string() })).min(2),
  correctOptionIds: z.array(z.string()).min(1),
  explanation: z.string(),
});
export const LessonModuleSchema = z.object({
  id: z.string(),
  conceptId: z.string(),
  explanation: z.string(),
  example: z.string(),
  sourceIds: z.array(z.string()),
  activity: ActivitySpecSchema,
  questions: z.array(QuestionSchema),
});
export const TeachingStepSchema = z.object({
  conceptId: z.string(),
  approach: z.enum(["example", "visual", "explanation", "practice"]),
  purpose: z.string(),
});
export const TeachingPlanSchema = z.object({
  openingQuestion: z.string(),
  bigPicture: z.string(),
  sequence: z.array(TeachingStepSchema).min(1),
});
export type TeachingStep = z.infer<typeof TeachingStepSchema>;
export type TeachingPlan = z.infer<typeof TeachingPlanSchema>;
export const LessonSchema = z.object({
  id: z.string(),
  revision: z.string(),
  title: z.string(),
  summary: z.string(),
  mode: z.enum(["sample", "generated"]),
  origin: z.enum(["chat", "provider"]).optional(),
  sources: z.array(SourceRecordSchema),
  concepts: z.array(ConceptSchema).min(1),
  relations: z.array(RelationSchema),
  path: z.array(z.string()),
  modules: z.array(LessonModuleSchema),
  teachingPlan: TeachingPlanSchema.optional(),
  finalQuestions: z.array(QuestionSchema),
});
export const GenerationRequestSchema = z.object({
  requestId: z.string(),
  text: z.string().trim().min(10).max(40000),
});
export const GenerationResponseSchema = z.object({
  requestId: z.string(),
  lesson: LessonSchema,
});
export const GenerationEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("plan"),
    requestId: z.string(),
    lesson: LessonSchema,
  }),
  z.object({
    type: z.literal("module"),
    requestId: z.string(),
    module: LessonModuleSchema,
  }),
  z.object({
    type: z.literal("complete"),
    requestId: z.string(),
    lesson: LessonSchema,
  }),
  z.object({
    type: z.literal("error"),
    requestId: z.string(),
    error: z.string(),
  }),
]);
export type GenerationEvent = z.infer<typeof GenerationEventSchema>;
export const ChatRequestSchema = z.object({
  id: z.string(),
  status: z.enum(["waiting", "completed", "error"]),
  createdAt: z.string(),
  lesson: LessonSchema.optional(),
  error: z.string().optional(),
});
export type ChatRequest = z.infer<typeof ChatRequestSchema>;
export type GenerationMode = "chat" | "provider";
export type SourceRecord = z.infer<typeof SourceRecordSchema>;
export type Concept = z.infer<typeof ConceptSchema>;
export type Relation = z.infer<typeof RelationSchema>;
export type BfsActivity = z.infer<typeof BfsActivitySchema>;
export type ActivitySpec = z.infer<typeof ActivitySpecSchema>;
export type Question = z.infer<typeof QuestionSchema>;
export type LessonModule = z.infer<typeof LessonModuleSchema>;
export type Lesson = z.infer<typeof LessonSchema>;
export type GenerationRequest = z.infer<typeof GenerationRequestSchema>;
export type GenerationResponse = z.infer<typeof GenerationResponseSchema>;
export type GenerationStatus = "idle" | "generating" | "ready" | "error";
export type Attempt = {
  id: string;
  lessonId: string;
  revision: string;
  questionId: string;
  conceptIds: string[];
  selectedOptionIds: string[];
  correct: boolean;
  createdAt: string;
};
export type Evaluation = {
  correct: boolean;
  feedback: string;
  reviewConceptIds: string[];
};
export type ActivityViewProps = { activity: ActivitySpec; conceptId: string };
export type QuestionViewProps = {
  question: Question;
  onAnswer: (selectedOptionIds: string[], evaluation: Evaluation) => void;
};
export type StudyWorkspaceProps = {
  generationMode: GenerationMode;
  onGenerationModeChange: (mode: GenerationMode) => void;
  chatRequest: ChatRequest | null;
  onCopyChatRequest: () => Promise<void>;
  onImportChatLesson: (json: string) => Promise<void>;

  lesson: Lesson;
  selectedConceptId: string;
  onSelectConcept: (id: string) => void;
  input: string;
  onInputChange: (value: string) => void;
  onGenerate: () => void;
  onCancel: () => void;
  status: GenerationStatus;
  error: string | null;
  attempts: Attempt[];
  onAnswer: (
    question: Question,
    selectedOptionIds: string[],
    evaluation: Evaluation,
  ) => void;
  onLoadSample: () => void;
};

export type LearningCanvasProps = {
  lesson: Lesson;
  selectedConceptId: string;
  onSelectConcept: (id: string) => void;
  onOpenConcept: (id: string) => void;
  activeSceneIndex: number;
  onSceneChange: (index: number) => void;
};
