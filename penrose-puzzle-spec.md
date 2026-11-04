# Penrose Puzzle: Specification

Status: reflects the app as currently implemented. The rules (sections 3 to 6, including auto-rotate in 5b, the connected edges in section 7 and the rotation steps in section 8) are plain functions in `rules.ts`, unit-tested in `rules.test.ts`; the jigsaw's (section 11) are in `jigsaw.ts`, tested in `jigsaw.test.ts`. The React root `PenrosePuzzle` in `penrose-puzzle.tsx` and the files in `ui/` draw the board and handle input. Rules without tests are listed in `untested-requirements.md`.

## 1. Overview

A single-player puzzle app played with Penrose kite and dart tiles. It has two modes, switched with the **Jigsaw / Sandbox** tabs in the header (the page opens on Jigsaw; the choice isn't saved, and each mode keeps its state only while it is shown):

- **Jigsaw** (section 11): a picture is laid over a patch of a real Penrose tiling and broken up into its kites and darts; the player puts it back together.
- **Sandbox** (sections 4 to 8): the player builds a structure one tile at a time. Every placement must obey Penrose's matching rules, so the structure stays a valid (locally) Penrose arrangement. There is no goal, score or end.

The project began as a copy of the original version of Penrogo, a two-player territory game; capture, territory, scoring, turns and the computer opponent were removed.

## 2. Technology

| Item | Choice |
|---|---|
| Framework | React 19 (functional component, hooks) |
| Build | Vite, TypeScript (`rules.ts` is fully typed, the component only loosely; `npm run typecheck` runs separately from the build) |
| Tests | Node's test runner through `tsx` (`npm test`) |
| Rendering | HTML5 Canvas 2D, 800 x 600 internal resolution, scaled to the largest 4:3 size that fits the window |
| Styling | Tailwind CSS v4 utility classes |
| Icons | lucide-react (`RotateCw`, `Undo2`, `Trash2`, `Magnet`, `CircleHelp`, `X`; jigsaw: `Shuffle`, `ImagePlus`, `Settings`) |
| Persistence | The jigsaw's settings in the browser's local storage (section 11); everything else in memory only. A picture the player chooses is read in the browser and never uploaded |

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

## 5b. Auto-rotate

An optional mode, switched on and off with the **Auto-rotate** button (off when the page loads; not saved). While it is on, the player chooses only the tile type and where to point; the app chooses the rotation.

- A **free edge** is an edge of a placed tile that no other tile shares.
- A **fit** is a legal placement (section 4, including staying inside the board) of the selected tile type, at any of the 10 rotations, with one of its edges lying exactly on a free edge.
- The fits considered are those on free edges within 60 canvas units (`AUTO_ROTATE_RADIUS`, one long edge) of the pointer, measured to the nearest point of the edge. They are ordered by that distance, nearest edge first, then by how close the tile's center would be to the pointer. The same placement fitting two free edges is listed once.
- The preview shows the first fit, so the tile turns to fit the nearest free edge it can go on. A nearer free edge the tile can't fit is skipped.
- The rotation controls (section 8) step forward or back through the fits instead of turning the tile, wrapping around at either end.
- Placing a tile keeps its rotation as the current rotation (used if the mode is switched off) and goes back to the first fit for the next tile.
- With no fit near the pointer, or on an empty board, the tile behaves as with the mode off: current rotation, normal snapping (section 5).

## 6. Play

1. The board starts empty. The first tile can be a kite or dart, at any rotation, anywhere inside the board.
2. The player chooses **Kite** or **Dart**, rotates it (or lets auto-rotate turn it, section 5b), positions it, and places it. Each later tile must follow the rules in section 4. The rotation is kept after placing, so several tiles at the same angle can be placed in a row.
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
| Preview tile | Drawn at 55% opacity at the snapped position, or at the auto-rotate fit (section 5b) |
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
| Rotation hint | Replaces the rotate buttons: lists the rotation controls and shows the previewed tile's angle. Reads "Next fit" instead of "Rotate" while auto-rotate is on |
| Kite / Dart buttons | Choose tile type |
| Auto-rotate button | Switch auto-rotate (section 5b) on or off; shown green while on. While on, the scroll wheel, right click and arrow keys step through the fits instead of turning the tile |
| Ctrl+Z / Cmd+Z | Undo the last tile |
| Undo / Clear buttons | See section 6 |

### Touch (iPhone and other touch devices)

| Input | Action |
|---|---|
| Touch and drag on board | Move the preview, lifted 60 canvas units above the fingertip |
| Lift finger | Preview stays in place (adjustable) |
| **Place** button | Confirm placement; disabled while the preview is illegal |
| Undo / Clear buttons | See section 6 |
| Auto-rotate button | As on desktop; while on, the rotate buttons step through the fits |
| Rotate buttons | Large tap targets, clockwise button also shows the previewed tile's angle. Shown only on touch devices (`navigator.maxTouchPoints > 0`); desktop gets the rotation hint instead |

Implementation notes: pointer events (`pointerdown/move/up/leave`), `touch-action: none` on the canvas, and pointer coordinates scaled from CSS pixels to the 800 x 600 canvas space. The page fills exactly the visible window (`h-dvh`, which follows mobile browser toolbars) and never scrolls: header and controls take their natural height, and the board gets the rest, sized with CSS container units to the largest 4:3 rectangle that fits. The rules are on a separate **How to Play** screen (button in the header), a full-screen overlay closed with its X button, a tap outside it, or Escape; the board keeps its state underneath.

## 11. Jigsaw

### Building the puzzle

1. **The tiling.** A patch of the kite and dart tiling is generated by deflation: a sun of five kites is split into Robinson half-tiles, each subdivided six times (each half-kite into two half-kites and a half-dart, each half-dart into a half-kite and a half-dart, all shrinking by phi), and mirror halves are joined into whole tiles with long edges of 60 units. The result is a correct Penrose tiling by construction: no overlaps, matching vertex colors, every tile at one of the ten 36° angles.
2. **The pieces.** A random point within 360 units of the patch center is chosen (so puzzles don't all show the sun at the center). Starting from the tile nearest it, the tile nearest it that shares a full edge with those already chosen is added until the puzzle has its size: **Small** 12, **Medium** 24 (the default) or **Large** 40 pieces. The pieces are always one edge-connected group, and could be built under the sandbox's rules (section 4).
3. **Placement.** The whole group is turned to a random one of the ten orientations and moved so its bounding box is centered at (270, 300), on the left of the board.
4. **Breaking it up.** Loose pieces go to spots on a 72-unit grid over the board (centers at least 42 units from the board edge), leaving out spots within 42 units of the solved puzzle's bounding box. Spots are shuffled and each piece takes one (if there are more pieces than spots, the extra pieces reuse spots, offset by 18 units). Each piece gets a random one of the ten angles, and the stacking order is shuffled.
5. **Seeds.** Every random choice comes from one seeded generator (mulberry32), so a seed always gives the same puzzle. A new puzzle uses a random seed; the first puzzle on the page uses `?seed=<n>` from the address if it is a whole number from 0 to 2^31 - 1.

### The picture

- The default picture is a landscape at sunset drawn by the app (`ui/defaultPicture.ts`, 600 x 600). **Your picture** opens the device's file picker for an image; it replaces the picture for the current and later puzzles until the page is reloaded. It is read in the browser and never uploaded.
- The picture is scaled to cover the solved puzzle's bounding box, keeping its proportions and centered, with any overhang cut off evenly. Each piece shows the part of the picture over its home, moved and turned with the piece.

### Play

- **Groups.** Every piece starts in a group of its own. Pieces that have snapped together (below) form one group, which moves, turns, snaps and locks as a whole.
- **Picking up.** Pressing on a loose piece selects it and brings its whole group to the top of the stack (keeping the group's own stacking order); the topmost loose piece under the pointer is taken. Locked pieces can't be picked up.
- **Dragging** moves the group. The move stops short where needed so that no piece's center leaves the board.
- **Turning.** The selected piece's group turns in 36° steps about the selected piece's center: scroll wheel (as in section 8) or Left / Right arrows; right-click turns the group of the piece under the pointer (Shift + right-click the other way) and selects that piece. On touch devices, two rotate buttons turn the selected group; they are disabled when no loose piece is selected.
- **Locking in.** When a group is dropped, or turned, at its home angle with a piece's center within 20 units of its home, every piece in the group snaps exactly into place and locks. A piece only locks into its own home, even where another piece of the same shape and angle would fit.
- **Snapping together.** Otherwise, when a group is dropped or turned, each of its pieces is compared with every piece outside the group that borders it in the solved puzzle (shares a full edge) and is turned the same amount from its home angle. If the piece is within 20 units of where it would sit against that neighbor (the neighbor's position plus the difference of their homes, turned by the neighbor's turn), the group moves by that difference, so the two touch exactly as in the solved puzzle, and the two groups become one. The closest such match is used, and this repeats until no more pieces snap, since one snap can bring another neighbor into reach. Snapping against a locked piece is the same as locking in: a locked piece is at home, so a group within reach of it is within reach of its own home.
- **Progress.** The header shows "*placed* / *total* placed", and "Solved! All *n* pieces in place" in green once every piece is locked.
- **New puzzle** starts a new puzzle of the chosen size with a new seed; changing the size does too.
- **Settings** (gear button in the header, next to How to Play) opens a dialog of switches, in the same kind of overlay as How to Play (closed with its X button, a tap outside it, or Escape; titled "Settings"). Changes apply at once, carry over to new puzzles, and are saved in the browser (see Saved settings below).
  - **Show picture** (off by default): the whole picture shown faintly (30% opacity) inside the outline, like the picture on a puzzle box.
  - **Show tile outlines** (on by default): the edges of every piece and of every tile in the gray outline. Off, the outline is one plain gray shape and pieces have no edges, so placed pieces read as one seamless picture; the selected group's blue outline is still drawn.
- **How to Play** shows the jigsaw's instructions in the same kind of overlay as the sandbox's (section 8).

### Saved settings

- The jigsaw's settings are saved in the browser's local storage under the key `penrose-puzzle.jigsaw-settings`, as JSON (`{"showPicture": false, "showOutlines": true}`), every time one changes, and read when the jigsaw opens. They are kept per browser and per site address: the live site and each branch preview share one origin (`dblevins-3dgfx.github.io`), so they share the saved settings.
- Reading is forgiving: if nothing is saved, the value isn't valid JSON or isn't an object, the defaults are used; a missing setting, or one that isn't true or false, takes its default; unknown fields are ignored.
- If the browser blocks storage (for example some private-browsing modes), settings still work but are not saved.

### Drawing

| Element | Behavior |
|---|---|
| Outline | The solved puzzle's tiles, filled light gray, with slightly darker tile edges when Show tile outlines is on: where the pieces go |
| Loose pieces | Their part of the picture with a soft shadow, and a dark outline when Show tile outlines is on; every piece in the selected piece's group has a thick blue outline instead, whatever the setting |
| Locked pieces | Their part of the picture, with a faint outline when Show tile outlines is on, drawn under all loose pieces |
| Layers | Locked pieces are drawn as one layer, then each loose group as one layer, in stacking order (by each group's topmost piece). A layer's picture is clipped to all its pieces at once, so no hairline seams show between pieces that fit together |
| Board | White, 800 x 600, scaled to fit the window as in section 8 |

## 9. Known Limitations and Not Yet Implemented

- **No goal in the sandbox.** The sandbox has no score, win condition or end; the jigsaw (section 11) is the only goal so far.
- **Jigsaw.** No timer, move count or saved progress; reloading starts a new puzzle (or the `?seed=` one). Pieces only lock into their own home, not into a spot where an identical piece would fit, and a piece only snaps to its own neighbors from the solved puzzle.
- **Rule completeness.** The rules combine vertex coloring with an edge-direction/length check. They have not been proven to prevent every dead-end configuration, and vertex-only contacts are not snapped (only edge-to-edge snapping exists).
- **Performance.** Connected-edge detection and placement checks are O(n^2) over placed tiles per render; fine for dozens of tiles, not for hundreds.
- **No save/load.** The board is lost on reload.
- **Mobile.** Touch support has not been tested on a physical device; the 60-unit finger offset may need tuning.

## 10. Possible Next Steps

1. Decide which puzzle to keep: the jigsaw, or others (for example, fill a target outline, or reach a shape with a limited set of tiles).
2. "Show valid placements" hint mode.
3. Save the board in the browser.
