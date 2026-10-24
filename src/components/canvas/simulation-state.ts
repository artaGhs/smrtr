import type { BfsActivity, Lesson, SimulationState } from "../../lib/contracts";
import {
  defaultRouteTarget,
  experimentGraph,
  safeBfsTrace,
} from "./scene-model";

/** Resolve a support page to the scenario's real activity, never a new support-page example. */
export function resolveScenarioActivity(
  lesson: Lesson,
  requestedId?: string | null,
) {
  const scenario = lesson.learningDesign?.scenario;
  const first = lesson.modules.find((module) => module.activity.kind === "bfs");
  const ids = [
    ...new Set(
      [requestedId, scenario?.activityConceptId, first?.conceptId].filter(
        (id): id is string => !!id,
      ),
    ),
  ];
  for (const activityConceptId of ids) {
    if (
      scenario?.activityConceptId === activityConceptId &&
      scenario.activity?.kind === "bfs"
    ) {
      return { activityConceptId, activity: scenario.activity };
    }
    const activity = lesson.modules.find(
      (module) => module.conceptId === activityConceptId,
    )?.activity;
    if (activity?.kind === "bfs") return { activityConceptId, activity };
  }
  return null;
}

export function defaultSimulationState(activity: BfsActivity): SimulationState {
  const trace = safeBfsTrace(activity);
  return {
    start: activity.start,
    directed: activity.directed,
    variant: "original",
    step: 0,
    target: trace ? defaultRouteTarget(trace) : activity.start,
  };
}

export function normalizeSimulationState(
  activity: BfsActivity,
  state?: SimulationState,
): SimulationState {
  const defaults = defaultSimulationState(activity);
  if (!state) return defaults;
  const start = activity.nodes.includes(state.start)
    ? state.start
    : defaults.start;
  const directed =
    typeof state.directed === "boolean" ? state.directed : defaults.directed;
  const variant =
    state.variant === "cycles"
      ? "return"
      : state.variant === "isolated"
        ? "island"
        : ["original", "return", "island"].includes(state.variant)
          ? state.variant
          : "original";
  const trace = safeBfsTrace(
    experimentGraph(activity, start, directed, variant),
  );
  return {
    start,
    directed,
    variant,
    step: Number.isFinite(state.step)
      ? Math.max(
          0,
          Math.min(Math.trunc(state.step), (trace?.frames.length ?? 1) - 1),
        )
      : 0,
    target: activity.nodes.includes(state.target)
      ? state.target
      : trace
        ? defaultRouteTarget(trace)
        : defaults.target,
  };
}

export function simulationTrace(
  activity: BfsActivity,
  state?: SimulationState,
) {
  const normalized = normalizeSimulationState(activity, state);
  return safeBfsTrace(
    experimentGraph(
      activity,
      normalized.start,
      normalized.directed,
      normalized.variant,
    ),
  );
}

/** No effects or hidden resets: a valid externally restored snapshot stays exactly as supplied. */
export function changeSimulationState(
  activity: BfsActivity,
  previous: SimulationState | undefined,
  patch: Partial<SimulationState>,
): SimulationState {
  const current = normalizeSimulationState(activity, previous);
  const candidate = { ...current, ...patch };
  const changedInput =
    candidate.start !== current.start ||
    candidate.directed !== current.directed ||
    candidate.variant !== current.variant;
  if (changedInput) {
    candidate.step = 0;
    const trace = simulationTrace(activity, candidate);
    candidate.target = trace ? defaultRouteTarget(trace) : activity.start;
  }
  return normalizeSimulationState(activity, candidate);
}
