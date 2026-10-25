# Editable canvas and progressive generation

The reviewable implementation is at `http://127.0.0.1:3001/canvas-lab` in the connected sorting worktree. The original checkout and its port 3000 server remain separate.

## Try it

1. The canvas opens in **View** mode. Unfold ideas, play examples and visit deeper canvases without selection boxes. Choose **Edit** in the top toolbar to reveal editing tools; selecting an idea then choosing **Edit**, or pressing Enter, opens its text panel. Change its title, summary or explanation, drag it, resize it, then Undo and Redo. Switching back to View clears the selection without moving the camera.
2. Use the bottom toolbar to add an idea, text, rounded rectangle, ellipse or freehand stroke. Select several objects to group them. Connect ideas with labeled relationships; a hierarchy connection creates a foldable branch. The connection editor also changes endpoints without requiring a precise handle drag.
3. Fold a branch, reopen it, and enter a deeper canvas. Returning restores the camera and sorting frame. Editing and drawing work in the deeper canvases too.
4. Open **New topic** and try the explicitly labeled simulated Sorting or Photosynthesis build. Each connection draws before its next section opens; explanations become available independently. Pause freezes the current reveal as well as incoming visual updates. Edit a ready idea, then show updates: your text and placement remain yours. Undo changes your edit without removing the new lesson content.
5. Stop a run to retain a partial map. The interrupted-result example demonstrates a failed branch without discarding successful siblings.
6. Use the folder to reopen a saved canvas. Download an editable JSON backup and import it as a separate canvas.

## How real generation works

The compact server path publishes a validated outline before independent teaching units finish. It uses the provider configured for this SMRTR server. The original full-plan stream remains available for compatibility and does not claim to publish its outline earlier than that older plan stage permits.

The connected-chat option creates a local request. An SMRTR-connected chat can retrieve its schemas and submit the outline, each teaching unit, and completion through the staged MCP tool. The browser displays committed stages as they arrive. Creating a request does not automatically invoke a chat subscription. Simulated builds use curated fixtures and make no model calls.

Generated content, personal changes and view state are stored separately. Stable source identities permit rebasing without overwriting learner text, manual bounds, deleted objects, folds, cameras or simulation frames. Undo contains learner changes. Source conflicts retain the personal version and expose a review notice. Source and imported documents are validated before rendering.

Competing saves from another tab cannot silently overwrite its newer version. When switching documents after a conflict, the current tab's edits are saved under a separate recoverable identity before opening the requested map. If that recovery save fails, the current document remains available for download.

## Scope

This is a local single-user editor with device-local autosave and portable JSON backups. It does not implement multiplayer collaboration, cloud synchronization, arbitrary executable widgets or the full Figma toolset. Provider calls require server configuration; verification uses deterministic provider doubles and the labeled simulation rather than spending on a live model request.

## Verification

151 application tests and seven MCP protocol tests pass. They cover document rebasing and history, hierarchy validation, import bounds, save conflict recovery, persistence failure reporting, both fixture topics, early outline publication, out-of-order units, split UTF-8 streams, duplicate/stale/gapped events, cancellation, partial failure, and staged chat submissions. Browser checks cover View/Edit separation, unchanged camera on mode switching, editing during paused generation, resuming and Undo, interruption, desktop composition and phone controls. The production webpack build and TypeScript checks pass.
