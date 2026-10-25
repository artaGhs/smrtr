import { z } from "zod";
import { ActivitySpecSchema, ConceptSchema, LessonModuleSchema, RelationSchema, TeachingPlanSchema } from "../contracts";

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
const short = z.string().trim().min(1).max(240);
export const CanvasOutlineSchema = z.object({
  title: short,
  summary: z.string().trim().min(12).max(1000),
  centralQuestion: z.string().trim().min(12).max(500),
  scenario: z.object({ description: z.string().trim().min(20).max(1000), activityConceptId: id.nullable(), activity: ActivitySpecSchema.nullable() }),
  concepts: z.array(ConceptSchema.extend({ id, title: short, summary: z.string().min(12).max(600), objective: z.string().min(12).max(600), parentId: id.nullable(), connection: z.string().min(12).max(240) })).min(1).max(6),
  relations: z.array(RelationSchema.extend({ id, meaning: z.string().min(12).max(500) })).max(18),
  path: z.array(id).min(1).max(6),
  teachingPlan: TeachingPlanSchema,
});
export const CanvasUnitSchema = z.object({
  module: LessonModuleSchema,
  details: z.array(z.object({ id, title: short, summary: z.string().min(12).max(500), explanation: z.string().min(12).max(1800) })).min(1).max(3),
  // Only curated simulated runs may supply this renderer until generated sorting
  // has its own domain validation. Other topics never inherit a sorting example.
  demonstration: z.object({ kind: z.literal("sorting"), values: z.array(z.number().int().min(1).max(99)).min(3).max(8) }).nullable(),
});
export const CanvasRunRequestSchema = z.object({
  requestId: z.string().trim().min(1).max(200),
  text: z.string().min(2).max(40000).refine((text) => text.trim().length >= 2, "Add a topic or lecture."),
  mode: z.enum(["provider", "simulated"]),
  fixture: z.enum(["sorting", "photosynthesis"]).default("sorting"),
  fault: z.enum(["none", "partial"]).default("none"),
});
export const CanvasStageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("outline"), outline: CanvasOutlineSchema }),
  z.object({ type: z.literal("unit"), unit: CanvasUnitSchema }),
  z.object({ type: z.literal("unit-failed"), conceptId: id, error: z.string().min(1).max(1000), retryable: z.boolean() }),
  z.object({ type: z.literal("finished"), outcome: z.enum(["complete", "partial", "cancelled"]), missing: z.array(id).max(6) }),
]);
const envelope = { v: z.literal(2), requestId: z.string().min(1).max(200), runId: z.string().min(1).max(200), sourceRevision: z.string().min(1).max(200), seq: z.number().int().positive() };
export const CanvasEventSchema = z.discriminatedUnion("type", [
  z.object({ ...envelope, type: z.literal("started"), mode: z.enum(["provider", "simulated", "chat"]), text: z.string().max(40000) }),
  z.object({ ...envelope, type: z.literal("outline"), outline: CanvasOutlineSchema }),
  z.object({ ...envelope, type: z.literal("unit"), unit: CanvasUnitSchema }),
  z.object({ ...envelope, type: z.literal("unit-failed"), conceptId: id, error: z.string().min(1).max(1000), retryable: z.boolean() }),
  z.object({ ...envelope, type: z.literal("finished"), outcome: z.enum(["complete", "partial", "cancelled"]), missing: z.array(id).max(6) }),
  z.object({ ...envelope, type: z.literal("failed"), error: z.string().min(1).max(1000) }),
]);
export type CanvasOutline = z.infer<typeof CanvasOutlineSchema>;
export type CanvasUnit = z.infer<typeof CanvasUnitSchema>;
export type CanvasEvent = z.infer<typeof CanvasEventSchema>;
export type CanvasRunRequest = z.infer<typeof CanvasRunRequestSchema>;
export type CanvasEventPayload = CanvasEvent extends infer E ? E extends CanvasEvent ? Omit<E, keyof typeof envelope> : never : never;
