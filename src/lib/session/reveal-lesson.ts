import { flushSync } from "react-dom";

/** Runs the generation loader's exit inside a view transition; the motion lives in globals.css. */
async function exitLoader(update: () => void, kind: "reveal" | "close") {
  if (typeof document === "undefined" || !document.startViewTransition || matchMedia("(prefers-reduced-motion: reduce)").matches) return update();
  const root = document.documentElement;
  root.dataset.loaderExit = kind;
  const transition = document.startViewTransition(async () => {
    flushSync(update);
    // If the study chunk was not prefetched, the workspace mounts through Suspense; open the portal only once it is on screen.
    if (kind === "reveal") for (let tries = 0; tries < 60 && !document.querySelector(".canvas-workspace"); tries++) await new Promise((resolve) => setTimeout(resolve, 25));
  });
  transition.ready.catch(() => {});
  void transition.finished.finally(() => delete root.dataset.loaderExit);
  await transition.updateCallbackDone;
}

/** Flies through the loader into the finished lesson. */
export const revealLesson = (update: () => void) => exitLoader(update, "reveal");
/** Lets the loader recede back to the page it covered. */
export const closeLoader = (update: () => void) => exitLoader(update, "close");
