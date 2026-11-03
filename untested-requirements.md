# Spec rules without unit tests

Every rule in `penrose-puzzle-spec.md` should have a unit test (`*.test.ts` beside the module, run with `npm test`) that fails if the rule breaks. This file lists the rules that don't, and why. Keep it current: a pull request that adds or changes a spec rule either tests it or adds a row here, and one that adds a test for a rule listed here removes its row.

The tests only reach plain modules without React, today just `rules.ts`. The React code (`penrose-puzzle.tsx` and `ui/`) needs a browser to run, so a rule that lives there is untested. The fix is usually to move the decision into a plain function and have the component call it.

## Untested rules

| Spec section | Rule | Where it lives | Why it isn't tested |
| --- | --- | --- | --- |
| 5. Snapping | An in-bounds snap wins over a closer one that is blocked only by the board edge | `snapPosition` in `rules.ts` | Testable, but no small arrangement found yet puts both kinds of snap within reach of one pointer position. Showing an out-of-bounds snap when it is the only one is tested. |
| 5. Snapping | Reject a snap on the same side of the shared edge as the existing tile | `snapPosition` in `rules.ts` | Every such position also overlaps the existing tile, so the overlap rule (tested) already rejects it; removing the side test changes no result a test can see. It saves work. |
| 6. Play | Clear removes every tile and resets the rotation to 0; Undo and Clear are disabled on an empty board | `clearBoard` in `penrose-puzzle.tsx`, buttons in `ui/Toolbar.tsx` | React state and buttons. |
| 6. Play | Nothing is saved; reloading starts empty | `penrose-puzzle.tsx` | Page behavior, nothing to call. |
| 7. Visual Feedback | Tile colors, edge ticks, vertex dots, preview opacity and outline, connected-edge strokes, grid, red board border | `ui/draw.ts` | Drawing. Which edges are connected (`findConnectedEdges`) and when the border shows (`isOutsidePlayfield`) are tested. |
| 8. Controls | Mouse, touch, keyboard and right-click handling: click places at the snapped position, arrows and right-click rotate, Ctrl/Cmd+Z undoes, Escape closes How to Play | pointer handlers in `penrose-puzzle.tsx`, `useKeyboardControls` in `ui/useControls.ts`, `ui/HelpOverlay.tsx` | Page events. The rotation step (`rotateBy`) and undo (`removeLastTile`) they call are tested. |
| 8. Controls | A trackpad swipe's leftover partial step is dropped after a 150 ms pause; the page does not scroll over the board | `useWheelRotation` in `ui/useControls.ts` | A timer and a page event. How deltas turn into steps (`wheelSteps`, `wheelDeltaPixels`) is tested. |
| 8. Controls | Touch: the preview is lifted 60 units above the finger; the Place button is disabled while the preview is illegal; rotate buttons only on touch devices | `canvasCoords` in `penrose-puzzle.tsx`, `ui/Toolbar.tsx` | Page events and device detection. |
| 8. Controls | The page fills the window without scrolling and the board is the largest 4:3 rectangle that fits | the layout in `penrose-puzzle.tsx` | Layout. |
