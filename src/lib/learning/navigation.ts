import type {
  LearningDesign,
  Lesson,
  PageLocation,
  SimulationStates,
} from "../contracts";
import { pageSceneIndex } from "./design";
export type PageNavigationState = {
  location: PageLocation;
  history: PageLocation[];
};
export function initialNavigation(
  lesson: Lesson,
  design: LearningDesign,
  pageId: string,
): PageNavigationState {
  return {
    location: {
      pageId,
      mainPageId: pageId,
      sceneIndex: pageSceneIndex(lesson, pageId, design),
      scrollTop: 0,
      simulations: {},
    },
    history: [],
  };
}
export function openLearningPage(
  state: PageNavigationState,
  lesson: Lesson,
  design: LearningDesign,
  pageId: string,
  scrollTop?: number,
): PageNavigationState {
  const target = design.pages.find((page) => page.id === pageId);
  if (!target || pageId === state.location.pageId) return state;
  const previous = state.history.findLastIndex(
    (location) => location.pageId === pageId,
  );
  if (previous >= 0)
    return {
      location: structuredClone(state.history[previous]),
      history: state.history.slice(0, previous),
    };
  const entry = {
    ...state.location,
    scrollTop: scrollTop ?? state.location.scrollTop,
  };
  return {
    location: {
      ...structuredClone(entry),
      pageId,
      mainPageId: target.kind === "support" ? entry.mainPageId : pageId,
      routeLevel: target.kind === "overview" ? "new" : entry.routeLevel,
      sceneIndex: pageSceneIndex(lesson, pageId, design),
      scrollTop: 0,
    },
    history: [...state.history, structuredClone(entry)],
  };
}
export function backLearningPage(
  state: PageNavigationState,
): PageNavigationState {
  const entry = state.history.at(-1);
  return entry
    ? { location: structuredClone(entry), history: state.history.slice(0, -1) }
    : state;
}
export function setLearningSimulation(
  state: PageNavigationState,
  key: string,
  value: SimulationStates[string],
): PageNavigationState {
  return {
    ...state,
    location: {
      ...state.location,
      simulations: { ...state.location.simulations, [key]: { ...value } },
    },
  };
}
