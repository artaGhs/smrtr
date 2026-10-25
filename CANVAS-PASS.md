# Connected sorting canvas: design pass

The current `/canvas-lab` implementation now combines the curated prototype below with the editable document and progressive generation described in [EDITABLE-CANVAS.md](EDITABLE-CANVAS.md). It opens in View mode; Edit mode explicitly enables object selection and creation. The sections below record the earlier design passes and their verification at the time.

This experimental route responds to the user's clarified vision on October 24, 2026. It supersedes the earlier research recommendation to make a reading-led guided stage the primary interaction.

The core teaching surface is an open canvas with multiple connected visual stations. A station can open a new canvas explaining its elements in greater depth. Returning restores the earlier camera and simulation context. Short text supports a visual action, rather than becoming a separate lecture beside a diagram.

Sorting is the deliberately narrow domain for this pass. The curated example makes the interaction and animation reviewable; it is not represented as an automatically generated lecture. The existing chat bridge and broader study workspace remain available separately. A later implementation can map chat-authored lesson content onto the station/animation contracts once the user has reacted to the actual interaction.

## What remains useful from research

- Begin with an understandable problem before terminology.
- Keep stable entities and continuing simulation state through supporting explanations.
- Give connectors meaning: why this step follows, what mechanism supports it, or what assumption it depends on.
- Animate causal changes: comparison, exchange, a pass completing, and the resulting invariant.
- Ask for a prediction before revealing an answer.
- Keep controls readable independently of zoom.
- Preserve keyboard access, reduced-motion results, explicit return paths and accurate provenance.

## What this pass deliberately changes

- The graph is the teaching workspace, not only a secondary concept map.
- The hierarchy consists of canvases within canvases, not conventional reading pages.
- Animation is a primary explanatory medium, not later polish.
- Broad topic coverage is deferred to make one compelling interaction work.
- The current visual treatment is provisional. The user's sketches or references can change its style and composition without discarding these interaction principles.

Three parallel workers own the deterministic sorting/content model, the animated visual objects, and the spatial workspace/navigation. The parent agent owns the shared types, route integration and verification.

## Review and verification

Open `/canvas-lab` on the experimental checkout's development server (port 3001). The original checkout's server remains on port 3000.

- 98 tests pass, including eight focused tests for sorting correctness, identity, stability and canvas links. TypeScript and the production webpack build pass.
- Browser checks cover computed swaps, play/pause/reset, two levels of nested navigation, exact camera/frame restoration, whole-canvas overview and the prediction/reveal flow.
- A swap was inspected mid-animation: both books interpolate between their old and new slots. Neither book jumps due to DOM reordering.
- The equal-value canvas uses an explicit separate example; its actual tied comparison keeps the earlier book first. Returning restores the previous scenario.
- Desktop and 390-pixel phone views were inspected. Phone prediction controls sit outside the zoomed canvas and leave the shelf visible. A fresh browser session produced no console errors or warnings.
- Screenshots are saved under `output/playwright/station-pass/` in this checkout.

The next design review should judge the spatial composition, station variety, causal animation and feeling of opening a canvas within a canvas. This pass does not establish learning effectiveness or complete automatic lecture-to-canvas generation.

## Second pass: a topic that unfolds

The user's next clarification replaces the station sequence as the top-level structure. `/canvas-lab` now begins with a compact Sorting concept and three purposeful branches: define the goal, choose a strategy, and compare the work. Definitions, real-world references, algorithm families and a growth comparison sit alongside the working Bubble Sort example.

- The topic definition appears on hover or keyboard focus and can be opened by click/tap in place. Other short explanations expand directly on their element.
- Branches fold recursively through “I know this”; reopening restores child expansion states, explanations and the example frame. This is a visibility preference, not an assessment of mastery. State lasts for the current visit.
- The tree reflows using measured element heights. Hidden descendants leave no reserved gaps. Labels explain the relationships, and visible growth and Bubble Sort branches gain a cross-reference.
- Larger explanations open the existing deeper canvases. Core sorting details receive the map's current frame. Returning restores the exact map camera, open branches and example state.
- Clicking a heading/body or selecting an item in the unscaled map index brings it into readable focus. On phones an opened branch brings its first child into focus instead of shrinking the whole subtree.

Verification: 100 tests, TypeScript and the production webpack build pass. Browser checks confirmed keyboard inline expansion, measured non-overlap, recursive fold/reopen state, matching frame on detail entry, exact camera/frame on return, and phone tap/navigation. A fresh phone session had no console errors or warnings. Runtime descriptions follow the [Princeton Algorithms reference](https://algs4.cs.princeton.edu/cheatsheet/), with best/average/worst distinctions rather than an unconditional speed ranking.

## Motion refinement

The latest feedback supersedes automatic fitting/focusing on branch expansion, including the phone behavior described above. Folding and unfolding now leave the camera alone and pin the clicked idea while surrounding graph coordinates settle. Inline text reveals locally below its toggle. “View branch” offers explicit navigation when newly revealed material lies outside the viewport. Details, references and verification are in [MOTION-RESEARCH.md](MOTION-RESEARCH.md).

## Rounded visual pass

The user's next direction is a simpler, more modern board with pill-like shapes and high-radius corners. The map now uses a compact Sorting capsule, rounded white cards, small contextual chips, curved connections, and floating pill toolbars. Actions share one row and use shorter visible labels; their descriptive accessible names remain intact. The deeper canvases, prediction controls, and visual book objects use the same softer shape language.

The user's direction takes priority over any literal brand reference. Public references consulted were [Miro's toolbars](https://help.miro.com/hc/en-us/articles/360017730553-Toolbars) and [Milanote's visual notes overview](https://milanote.com/product/note-taking). Layout, folding and the existing motion behavior are retained. The root's geometry and initial spacing have been adjusted to suit the capsule.

TypeScript and the production build pass. Six focused layout/motion tests pass. Browser checks confirmed an unchanged camera and clicked-element position on unfolding, no overlapping visible map elements, and consistent styling in the deeper canvas. At a 390-pixel phone width, the floating controls and all three example actions remain visible without clipping. The fresh phone session produced no console warnings or errors. Screenshots are saved in `output/playwright/rounded-pass/`.
