"use client";
import { useMemo, useState } from "react";
import {
  DEFAULT_LEARNER_PROFILE,
  type Lesson,
  type LearningNavigationProps,
} from "../contracts";
import {
  coreRoute,
  normalizeLearningDesign,
  pageBreadcrumbs,
  pageSceneIndex,
} from "./design";
import {
  backLearningPage,
  initialNavigation,
  openLearningPage,
  setLearningSimulation,
} from "./navigation";

export function useLearningNavigation(lesson: Lesson): LearningNavigationProps {
  const normalized = useMemo(() => normalizeLearningDesign(lesson), [lesson]);
  const { design, provenance } = normalized;
  const baseRoute = useMemo(
    () => coreRoute(design, lesson.learnerProfile ?? DEFAULT_LEARNER_PROFILE),
    [design, lesson.learnerProfile],
  );
  const key = `${lesson.id}:${lesson.revision}`;
  const [saved, setSaved] = useState(() => ({
    key,
    state: initialNavigation(
      lesson,
      design,
      baseRoute[0]?.id ?? design.pages[0].id,
    ),
  }));
  const state =
    saved.key === key
      ? saved.state
      : initialNavigation(
          lesson,
          design,
          baseRoute[0]?.id ?? design.pages[0].id,
        );
  const route = coreRoute(design, {
    ...(lesson.learnerProfile ?? DEFAULT_LEARNER_PROFILE),
    overall:
      state.location.routeLevel ?? lesson.learnerProfile?.overall ?? "new",
  });
  const update = (reduce: (current: typeof state) => typeof state) =>
    setSaved((previous) => ({
      key,
      state: reduce(previous.key === key ? previous.state : state),
    }));
  const page =
    design.pages.find((page) => page.id === state.location.pageId) ??
    design.pages[0];
  return {
    design,
    provenance,
    page,
    route,
    coreIndex: Math.max(
      0,
      route.findIndex((page) => page.id === state.location.mainPageId),
    ),
    breadcrumbs: pageBreadcrumbs(design, page.id),
    canGoBack: state.history.length > 0,
    location: state.location,
    simulations: state.location.simulations,
    onOpenPage: (id, scroll) =>
      update((current) =>
        openLearningPage(current, lesson, design, id, scroll),
      ),
    onBack: () => update(backLearningPage),
    onGoToCore: (index) => {
      const next = route[Math.max(0, Math.min(index, route.length - 1))];
      if (next)
        update((current) => ({
          location: {
            ...current.location,
            pageId: next.id,
            mainPageId: next.id,
            sceneIndex: pageSceneIndex(lesson, next.id, design),
            scrollTop: 0,
          },
          history: [],
        }));
    },
    onScroll: (scrollTop) =>
      update((current) => ({
        ...current,
        location: { ...current.location, scrollTop },
      })),
    onStartSimpler: () =>
      update((current) => {
        const next = openLearningPage(
          current,
          lesson,
          design,
          design.routes.new[0],
        );
        return {
          ...next,
          location: {
            ...next.location,
            mainPageId: design.routes.new[0],
            routeLevel: "new",
          },
        };
      }),
    onSimulationChange: (activityId, value) =>
      update((current) => setLearningSimulation(current, activityId, value)),
  };
}
