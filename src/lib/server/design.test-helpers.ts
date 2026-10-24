import type { ActivitySpec, LearnerProfile, LearningDesign, TeachingPlan } from "../contracts";

// Test data only. Production generation never imports or substitutes this fixture.
export function testLearningDesign(conceptIds: string[], profile?: LearnerProfile, canonical?: { conceptId: string; activity: ActivitySpec }): LearningDesign {
  const entityIds = canonical?.activity.kind === "bfs" ? canonical.activity.nodes : ["case"];
  const activityConceptId = canonical?.conceptId ?? null;
  const common = { conceptIds, sourceIds: ["source-input"], topicIds: profile?.topics.map((topic) => topic.id) ?? [], scene: "scenario" as const, activityConceptId };
  return {
    centralQuestion: "How can we predict what happens in this concrete case?",
    objective: "Explain the same case through its mechanism and apply the idea to another situation.",
    assumedKnowledge: ["No specialist terminology is assumed."],
    scenario: { id: "continuing-case", title: "One continuing concrete case", description: "Follow the same concrete case from an initial prediction through its underlying mechanism and a transfer challenge.", entities: entityIds.map((id) => ({ id, label: id, role: "An entity in the continuing concrete case" })), activityConceptId, activity: canonical?.activity ?? null },
    pages: [
      { ...common, id: "start", title: "Start with the problem", question: "What do you think happens first?", purpose: "Build intuition from the continuing concrete case.", kind: "overview", parentId: null, recommendedNextPageId: "transfer", blocks: [{ id: "start-context", kind: "paragraph", segments: [{ kind: "text", text: "Make a prediction about the concrete case before naming its underlying mechanism." }, { kind: "page-link", text: "Try a transfer challenge", pageId: "transfer", reason: "Use the pattern to make a prediction in a new situation." }] }] },
      { ...common, id: "transfer", title: "Transfer the idea", question: "How would you apply this pattern in a different case?", purpose: "Check whether the mechanism transfers beyond the opening example.", kind: "transfer", parentId: "start", recommendedNextPageId: null, blocks: [{ id: "transfer-context", kind: "paragraph", segments: [{ kind: "text", text: "Apply the mechanism to a clearly labeled new case and explain the assumptions." }, { kind: "page-link", text: "Return to the opening case", pageId: "start", reason: "Compare your new prediction with the original concrete situation." }] }] },
    ],
    sequence: [{ pageId: "start", purpose: "Make a concrete prediction before naming abstractions.", whyNext: "Now use the observed pattern to reason about another situation." }, { pageId: "transfer", purpose: "Apply the mechanism and explain its assumptions.", whyNext: "Return to the original example if you need to check a mechanism." }],
    routes: { new: ["start", "transfer"], recognize: ["start", "transfer"], explain: ["transfer"], apply: ["transfer"] },
  };
}

export function testTeachingPlan(conceptIds: string[]): TeachingPlan {
  return { openingQuestion: "What would you predict in this concrete situation?", bigPicture: "Build intuition from one continuing example, explain the mechanism and transfer it to a different case.", sequence: conceptIds.map((conceptId) => ({ conceptId, approach: "example", purpose: "Notice a concrete pattern before naming its underlying mechanism." })) };
}
