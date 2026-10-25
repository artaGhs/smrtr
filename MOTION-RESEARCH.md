# Unfolding without losing your place

The user's feedback was specific: unfolding moves the screen too much, too quickly. The primary defect was the interaction policy, not simply the duration. The previous implementation applied a new layout immediately, waited 120 ms, then animated a zoom-to-fit over 400 ms. On phones it automatically selected and focused the first child. A small disclosure therefore caused several unrelated movements.

## References and limits

- [Miro: expanding and collapsing mind maps](https://help.miro.com/hc/en-us/articles/360017730753-Mind-map). Read the official instructions and observed the published animated demonstration. The parent and surrounding canvas remain recognizable as branch content changes. Its hidden-item count makes reopening understandable. This was a public demonstration, not a test inside an authenticated Miro board; no timing values are attributed to Miro.
- [tldraw: camera system](https://tldraw.dev/sdk-features/camera). The documented camera separates pan, zoom, fit and focus operations, supports easing, and gives user gestures priority over camera animation. Its example uses a 500 ms eased camera move. The lesson here is to make navigation intentional and interruptible, not to copy one universal duration.
- [React Flow: node position animation](https://reactflow.dev/examples/nodes/node-position-animation). The public description demonstrates interpolating graph coordinates between layouts. Moving graph coordinates keeps connectors attached, whereas transitioning only the card's CSS transform can leave the logical graph behind. No licensed example source was downloaded or copied.

The implementation choices below are a synthesis for this learning canvas, informed by those references and the user's preference for calmer movement. They are not claims that all three products use the same animation.

## Applied changes

| Before | After | Why |
| --- | --- | --- |
| A branch toggle schedules a camera fit | Toggle changes no camera coordinates or zoom | Preserve the user's frame of reference |
| Layout snaps before the camera moves | Pin the clicked element in world space; settle neighboring coordinates with a critically damped response | Explain the reorganization without a jump or bounce |
| Conditional content appears/disappears immediately | Local 440 ms disclosure plus node/connector fades | Show where details belong |
| Explanation inserts above its own toggle | Explanation unfolds below its toggle | The control remains under the pointer |
| New animation replaces the current trajectory | Retarget current positions and velocities | Reverse smoothly when interrupted |
| Growing text can outrun a moving neighbor | Maintain separation in the anchored column during the reveal | Prevent transient overlap, not just a correct final layout |
| Double-click can activate canvas zoom | Disable double-click zoom on this map | Repeated control clicks cannot magnify the canvas |
| Position updates discard card measurements | Preserve measured dimensions in controlled graph nodes | Prevent hiding and remeasuring cards during every movement frame |
| Ordinary body clicks also focus the camera | Select in place; use Read, View branch, Fit map, or navigation explicitly | Separate selection, disclosure and travel |

Neighbor movement uses an exact critically damped step at frequency 13.5. From rest it completes most travel in roughly half a second, with the tail settling afterward. Opacity uses a faster response; new elements get a short reveal delay. Exiting nodes stop taking input before removal. Coordinates and edges are updated together. The response is refresh-rate independent and can be retargeted in flight.

Explicit Read and View branch navigation use 600–650 ms cubic easing and direct viewport interpolation, avoiding an extra zoom-out arc. Zoom buttons remain short. Reduced-motion preferences remove layout travel and disclosure animation; keyboard disclosures update immediately. Initial layout remains immediate.

## Verification

- Pure tests cover an invariant interaction origin, unchanged relative target spacing, convergence without oscillation, reversal continuity, equal behavior at 60/120 Hz, and clearance while content grows.
- Desktop browser samples kept the camera transform exactly unchanged during fold/unfold. The clicked branch's top coordinate also stayed exactly unchanged while neighboring positions changed continuously.
- The inline explanation's button kept its top coordinate while its surrounding element grew. An initial intermediate overlap was reproduced and corrected; subsequent samples retained positive separation during the reveal.
- Pointer disclosures, keyboard folding, branch visibility restoration and repeated clicks were exercised. The drawing library's implicit double-click zoom was found during this check and disabled.
- Phone checks also kept the camera transform and clicked-branch position exactly unchanged. View branch navigated only when explicitly requested. Intermediate visibility samples found no hidden cards after the measurement fix.
- Final desktop samples recorded zero camera change, zero displacement of the clicked branch, and zero hidden cards while a neighboring branch moved through intermediate positions. Evidence is saved in `output/playwright/motion-pass/samples.json`.
- The full test suite passes 104 tests. TypeScript and the production webpack build pass, including a fresh build after the measurement correction. A fresh final browser session had no console errors or warnings.

The final judgment of feel still belongs to the user. This pass specifically removes unsolicited camera travel and improves continuity; it does not claim usability testing with learners or physical-device performance measurements.

## Arrow-first presentation and overlap correction

The next review identified a different issue: fading an entire committed outline did not feel like a developing map. The presentation now keeps future cards measured but hidden, draws the connection over 820 ms, then opens its destination with a 560 ms opacity and 720 ms local easing transition. A presentation clock sequences the destinations independently of backend events and learner history. The simulated server stages are more widely spaced; receiving the final result does not prematurely label an unfinished visual sequence ready. Pause freezes both the visual queue and the arrow's current stroke offset. Reduced motion shows the available result directly.

Newly unfolded children resolve to a queued state in the render that introduces them. A shared reveal context updates existing React Flow renderers before its internal controlled-node reconciliation. Hiding a queued card is immediate; easing is applied only when opening it. This prevents both the first-unfold flash and a fold/reopen flash. A new generation run does not inherit the previous run's reveal states even if its node IDs match.

Connector descriptions now have allocated, wrapped lanes beside the incoming connection. Cross-links route around unrelated cards; repeated text already shown on a hierarchy connection is not painted twice. Full descriptions remain in the source, accessible edge titles and connection editor. Rounded orthogonal routes replace the crowded automatic Bézier loops. The layout reserves a wider connection column, and actual animated positions are constrained during card growth rather than checking only final destinations.

The canvas paints to every edge of the viewport, without header/footer cutout masks. Explicit Fit leaves reading space around the floating controls, while manual panning and zooming remain unrestricted. Save and import errors share a compact opaque status panel instead of overlapping graph text or creating a full-width footer. Mode changes and disclosures do not move the camera.

Pinch gestures are captured at the canvas boundary before card controls' nopan/nowheel filters can reject them. Trackpad Ctrl-wheel and two-touch gestures share cursor/midpoint-anchored, bounded zoom. Ordinary scrolling and single-touch interactions retain their normal handling. Controller tests cover registration, cancellation, touch cleanup, limits and anchoring; physical trackpad/touch hardware behavior remains a manual review item.

Browser samples cover sequential arrow/card phases, pause/resume with an identical frozen stroke offset, unchanged camera transforms, label/card separation, phone inline growth, connection editing with Undo, and repeated unfolds with zero sampled premature visibility. Screenshots are under `output/playwright/implementation-pass/`.
