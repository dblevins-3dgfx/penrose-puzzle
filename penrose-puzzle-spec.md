# Penrose Puzzle: Specification

Status: reflects the app as currently implemented. The rules (sections 3 to 6, the connected edges in section 7 and the rotation steps in section 8) are plain functions in `rules.ts`, unit-tested in `rules.test.ts`; the React component `PenrosePuzzle` in `penrose-puzzle.tsx` draws the board and handles input. Rules without tests are listed in `untested-requirements.md`.

## 1. Overview

A single-player tile placement app played with Penrose kite and dart tiles. The player builds a structure one tile at a time. Every placement must obey Penrose's matching rules, so the structure stays a valid (locally) Penrose arrangement. There is no goal, score or end yet: it is a sandbox for building tilings, and the starting point for a puzzle game still to be designed.

The project began as a copy of the original version of Penrogo, a two-player territory game; capture, territory, scoring, turns and the computer opponent were removed.

## 2. Technology

| Item | Choice |
|---|---|
| Framework | React 19 (functional component, hooks) |
| Build | Vite, TypeScript (`rules.ts` is fully typed, the component only loosely; `npm run typecheck` runs separately from the build) |
| Tests | Node's test runner through `tsx` (`npm test`) |
| Rendering | HTML5 Canvas 2D, 800 x 600 internal resolution, scaled to the largest 4:3 size that fits the window |
| Styling | Tailwind CSS v4 utility classes |
| Icons | lucide-react (`RotateCw`, `Undo2`, `Trash2`, `CircleHelp`, `X`) |
| Persistence | None (all state in memory) |

## 3. Tile Geometry

Edge lengths: long `L = 60` px (`TILE_SIZE`), short `S = L / phi` (about 37.1 px), where `phi = (1 + sqrt 5) / 2`.

Both tiles are quadrilaterals with vertices listed in perimeter order. Coordinates below are for rotation 0, before centering, with the symmetry axis along +x. Edge order for both tiles is **long, short, short, long**.

### Kite (convex)

| Vertex | Local position | Interior angle | Vertex color |
|---|---|---|---|
| O | (0, 0) | 72 deg | black |
| B | L(cos 36, sin 36) | 72 deg | white |
| C | (L, 0) | 144 deg | black |
| D | L(cos 36, -sin 36) | 72 deg | white |

Edges: O-B long, B-C short, C-D short, D-O long.

### Dart (concave)

| Vertex | Local position | Interior angle | Vertex color |
|---|---|---|---|
| M | (0, 0) | 72 deg | white |
| N | L(cos 36, sin 36) | 36 deg | black |
| A' | (L/phi, 0) | 216 deg (reflex) | white |
| N' | L(cos 36, -sin 36) | 36 deg | black |

Edges: M-N long, N-A' short, A'-N' short, N'-M long.

### Placement transform

- Vertices are rotated by the tile's rotation (multiples of 36 deg).
- The vertex set is then translated so its **centroid** (average of the four vertices) sits at the tile's `(x, y)` position. This keeps the tile centered under the cursor.
- Each tile is split into two triangles along the vertex 0 to vertex 2 diagonal (its symmetry axis) for overlap testing. This handles the dart's concavity.

Both shapes were verified by law-of-cosines closure and angle checks (angles sum to 360 deg; dart reflex angle 216 deg).

## 4. Matching Rules

A candidate placement is legal only if all of the following hold. Checks apply to every existing tile the candidate touches.

1. **Edge-to-edge contact.** The candidate must share at least one full edge (both endpoints coincide, within 4 px) with an existing tile. A single-vertex contact is not enough, and no candidate corner may land in the interior of an existing tile's edge (or vice versa), i.e. no T-junctions. (The very first tile is exempt.)
2. **Vertex color agreement.** Wherever a candidate vertex coincides with an existing vertex, the two colors must match. This is Penrose's vertex-coloring matching rule: any point shared by several tiles must be the same color on each.
3. **No overlap.** The candidate's triangles must not intersect any existing tile's triangles. Separating-axis test with a 1.5 px tolerance, so touching edges and vertices are allowed.

4. **Inside the playfield.** Every vertex of the candidate must lie within the 800 x 600 board (0.5 px tolerance). This applies to the opening tile as well. While the previewed tile has a vertex outside the board, a red border is drawn around the playfield (the preview is also shown in the blocked red dashed style, and clicking does nothing).

Source for the coloring rule: arXiv 1104.3811 (kite: 144 deg vertex and its opposite black, other two white; dart: 216 deg vertex and its opposite white, other two black).

## 5. Snapping

While placing, the tile snaps so one of its edges lies exactly on an existing edge (no gaps).

- Consider every pairing of a candidate edge and an existing edge with the same length label, in both directions.
- A pairing is a candidate snap if translating the tile puts both endpoints on the target edge (tolerance 2 px).
- Reject if the translation exceeds the snap radius (45 px).
- Reject if the candidate would sit on the same side of the shared edge as the existing tile (centroid side test).
- Reject if the snapped position fails any rule in section 4.
- Choose the remaining candidate with the smallest translation.
- If none remain, the tile follows the cursor unsnapped and is (almost always) illegal.

## 6. Play

1. The board starts empty. The first tile can be a kite or dart, at any rotation, anywhere inside the board.
2. The player chooses **Kite** or **Dart**, rotates it, positions it, and places it. Each later tile must follow the rules in section 4. The rotation is kept after placing, so several tiles at the same angle can be placed in a row.
3. Illegal placements are ignored silently (the preview shows why, see section 7).
4. **Undo** removes the most recently placed tile (repeatable back to an empty board). **Clear** removes every tile and resets the rotation to 0. Both are disabled while the board is empty.
5. The header shows how many kites and darts are on the board.

Nothing is saved: reloading the page starts with an empty board.

## 7. Visual Feedback

| Element | Behavior |
|---|---|
| Tile fill | Kites amber, darts indigo, semi-transparent, each with a darker outline of its own color. The selected Kite / Dart button uses the same color |
| Edge ticks | Small tick marks at each edge midpoint (decorative only; not part of the rules) |
| Vertex colors | Each vertex is drawn as a 5 px dot: black dot with white ring, or white dot with black ring, showing the matching color. Shown on placed tiles and the preview |
| Preview tile | Drawn at 55% opacity at the snapped position |
| Preview outline | Solid green if placement is legal, dashed red if blocked |
| Connected edges | Edges shared by two placed tiles, with colors agreeing at both endpoints, are stroked green (4 px, round caps) |
| Grid | Light 40 px background grid |

## 8. Controls

### Desktop

| Input | Action |
|---|---|
| Mouse move | Move the preview (snaps to legal edges) |
| Left click | Place the tile |
| Scroll wheel over the board | Rotate 36 deg: up = clockwise, down = counter-clockwise. One step per wheel notch, or one per 50 px of trackpad scrolling (`TRACKPAD_STEP`), so longer swipes turn further; a partial step left over is dropped after a 150 ms pause. The page does not scroll while the pointer is over the board |
| Right click | Rotate 36 deg clockwise (Shift + right click: counter-clockwise); the browser menu is suppressed on the board |
| Left / Right arrow | Rotate 36 deg counter-clockwise / clockwise |
| Rotation hint | Replaces the rotate buttons: lists the rotation controls and shows the current angle |
| Kite / Dart buttons | Choose tile type |
| Ctrl+Z / Cmd+Z | Undo the last tile |
| Undo / Clear buttons | See section 6 |

### Touch (iPhone and other touch devices)

| Input | Action |
|---|---|
| Touch and drag on board | Move the preview, lifted 60 canvas units above the fingertip |
| Lift finger | Preview stays in place (adjustable) |
| **Place** button | Confirm placement; disabled while the preview is illegal |
| Undo / Clear buttons | See section 6 |
| Rotate buttons | Large tap targets, clockwise button also shows current angle. Shown only on touch devices (`navigator.maxTouchPoints > 0`); desktop gets the rotation hint instead |

Implementation notes: pointer events (`pointerdown/move/up/leave`), `touch-action: none` on the canvas, and pointer coordinates scaled from CSS pixels to the 800 x 600 canvas space. The page fills exactly the visible window (`h-dvh`, which follows mobile browser toolbars) and never scrolls: header and controls take their natural height, and the board gets the rest, sized with CSS container units to the largest 4:3 rectangle that fits. The rules are on a separate **How to Play** screen (button in the header), a full-screen overlay closed with its X button, a tap outside it, or Escape; the board keeps its state underneath.

## 9. Known Limitations and Not Yet Implemented

- **No goal.** There is no puzzle, score, win condition or end yet.
- **Rule completeness.** The rules combine vertex coloring with an edge-direction/length check. They have not been proven to prevent every dead-end configuration, and vertex-only contacts are not snapped (only edge-to-edge snapping exists).
- **Performance.** Connected-edge detection and placement checks are O(n^2) over placed tiles per render; fine for dozens of tiles, not for hundreds.
- **No save/load.** The board is lost on reload.
- **Mobile.** Touch support has not been tested on a physical device; the 60-unit finger offset may need tuning.

## 10. Possible Next Steps

1. Decide what the puzzle is (for example, fill a target outline, or reach a shape with a limited set of tiles).
2. "Show valid placements" hint mode.
3. Save the board in the browser.
