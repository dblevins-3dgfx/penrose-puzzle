# Penrose Puzzle: Specification

Status: reflects the app as currently implemented. The rules (sections 3 to 6, including auto-rotate in 5b, the connected edges in section 7 and the rotation steps in section 8) are plain functions in `rules.ts`, unit-tested in `rules.test.ts`; the jigsaw's (section 9) are in `jigsaw.ts` and `penrosePicture.ts`, tested in `jigsaw.test.ts` and `penrosePicture.test.ts`. The React root `PenrosePuzzle` in `penrose-puzzle.tsx` and the files in `ui/` draw the board and handle input. Rules without tests are listed in `untested-requirements.md`.

## 1. Overview

A single-player puzzle app played with Penrose kite and dart tiles. It has two modes, switched with the **Jigsaw / Sandbox** tabs in the header (the page opens on Jigsaw; the active tab isn't saved on reload, and switching between Jigsaw and Sandbox preserves each mode's full board state, camera, and settings for the session):

- **Jigsaw** (section 9): a picture is laid over a patch of a real Penrose tiling and broken up into its kites and darts; the player puts it back together.
- **Sandbox** (sections 4 to 8): the player builds a structure one tile at a time. Every placement must obey Penrose's matching rules, so the structure stays a valid (locally) Penrose arrangement. There is no goal, score or end.

The project began as a copy of the original version of Penrogo, a two-player territory game; capture, territory, scoring, turns and the computer opponent were removed.

## 2. Technology

| Item | Choice |
|---|---|
| Framework | React 19 (functional component, hooks) |
| Build | Vite, TypeScript (`rules.ts` is fully typed, the component only loosely; `npm run typecheck` runs separately from the build) |
| Tests | Node's test runner through `tsx` (`npm test`) |
| Rendering | HTML5 Canvas 2D, sized to fill the available viewport below the slim top bar (scaled by `devicePixelRatio` for HiDPI crispness) |
| Styling | Tailwind CSS v4 utility classes |
| Icons | lucide-react (`RotateCw`, `Undo2`, `Trash2`, `Magnet`, `CircleHelp`, `X`; jigsaw: `Shuffle`, `ImagePlus`, `Settings`, `ZoomIn`, `ZoomOut`) |
| Persistence | The jigsaw's settings in the browser's local storage (section 9); everything else in memory only. A picture the player chooses is read in the browser and never uploaded |

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

4. **Inside the playfield.** Every vertex of the candidate must lie within the playfield world canvas (0.5 px tolerance; Sandbox uses a generous `1600 x 1200` world canvas centered at 100% zoom with pan and zoom; pure rules default to 800 x 600). This applies to the opening tile as well. While the loose tile has a vertex outside the playfield, a red border is drawn around the playfield (the tile is also shown in the blocked red dashed style and cannot be locked there).

Source for the coloring rule: arXiv 1104.3811 (kite: 144 deg vertex and its opposite black, other two white; dart: 216 deg vertex and its opposite white, other two black).

## 5. Snapping

While placing, the tile snaps so one of its edges lies exactly on an existing edge (no gaps).

- Consider every pairing of a candidate edge and an existing edge with the same length label, in both directions.
- A pairing is a candidate snap if translating the tile puts both endpoints on the target edge (tolerance 2 px).
- Reject if the translation exceeds the snap radius (45 px).
- Reject if the candidate would sit on the same side of the shared edge as the existing tile (centroid side test).
- Reject if the snapped position fails any of rules 1 to 3 in section 4 (edge contact, vertex colors, no overlap).
- Among remaining candidates that are inside the playfield (section 4, rule 4), choose the one with the smallest translation.
- If none are inside the playfield, choose the smallest translation among candidates blocked only by the board edge (so the preview snaps to that edge and shows the blocked style and red playfield border, while remaining unplaceable).
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

1. The board starts empty, centered on the generous `1600 x 1200` world canvas at 100% zoom (1 world unit = 1 CSS pixel). The first tile can be a kite or dart, at any rotation, anywhere inside the world canvas.
2. **Loose tile workflow (matching Jigsaw).** A **Kite / Dart tile tray** sits on the right side in landscape or along the bottom in portrait:
   - Dragging a Kite or Dart directly off the tray lifts a loose tile onto the board (snapping live to legal edges, or to auto-rotate fits when **Auto-rotate** is on); dropping it on a legal spot locks it into place in one motion.
   - Dropping it on an illegal spot leaves the tile loose and selected on the board so the player can drag or rotate it into place (and dropping it back over the tray, tapping `×`, or pressing `Escape` puts it away).
   - Tapping a Kite or Dart card in the tray spawns a loose tile at the center of the current view (or switches the active loose tile's type).
   - Once placed, tiles stay locked on the board; the placed rotation is remembered as the default angle for the next tile.
3. **Undo** removes the most recently placed tile (repeatable back to an empty board). **Clear** removes every placed tile and any loose tile, and resets the default rotation to 0. Both are disabled while no tiles are placed.
4. The header shows how many kites and darts are on the board, plus **Settings** (Visual effects and Sound effects, shared with Jigsaw in `localStorage`) and **How to Play**.

Placed tiles are not saved: reloading the page starts with an empty board (only the shared Visual effects / Sound effects settings persist).

## 7. Visual Feedback

| Element | Behavior |
|---|---|
| World sheet & grid | White `1600 x 1200` playfield sheet with a light 40 px grid and subtle slate border, set against a soft slate backdrop when zoomed out |
| Tile fill | Kites amber, darts indigo, semi-transparent, each with a darker outline of its own color |
| Edge ticks | Small tick marks at each edge midpoint (decorative only; not part of the rules) |
| Vertex colors | Each vertex is drawn as a 5 px dot: black dot with white ring, or white dot with black ring, showing the matching color. Shown on placed tiles, loose tiles, and tray thumbnails |
| Loose tile | Casts a soft drop shadow, drawn semi-transparent at its snapped position or auto-rotate fit (section 5b), with a solid green outline when legal or a dashed red outline when blocked |
| Connected edges | Edges shared by two placed tiles, with colors agreeing at both endpoints, are stroked green (4 px, round caps) |
| Placement effects & sound | When **Visual effects** is on (default), locking a tile plays a brief warm golden outline glow and outward corner sparkles (600 ms) plus a crisp aqua-white seam spark along each newly connected edge (420 ms; calm glows under `prefers-reduced-motion`). When **Sound effects** is on (off by default), locking a tile plays a warm synthesized chime |

## 8. Controls

Sandbox and Jigsaw share the same unified pointer, touch, and keyboard interaction model:

| Input | Action |
|---|---|
| Drag from Kite / Dart tray | Lift a loose tile onto the board; drop on a legal spot to lock in one motion, drop on an illegal spot to keep adjusting, or drop back on the tray to put away |
| Tap Kite / Dart in tray | Spawn a loose tile at the center of the current view (or switch the active loose tile's type) |
| Drag loose tile on board | Move the loose tile (snaps live to legal edges / auto-rotate fits); drop legal to lock, drop illegal to keep loose, or drop on the tray to put away |
| Tap loose tile | Rotate 36 deg clockwise (`Shift + click`: counter-clockwise), or step through nearby fits while Auto-rotate is on |
| Floating bottom-right pill | Shown whenever a loose tile is on the board: discard (`×`), rotate CCW / CW, and confirm/place (`✓`, highlighted green when legal) |
| Drag empty space / placed tiles | Pan across the `1600 x 1200` world canvas (mouse drag or 1-finger touch) |
| Zoom (`-`, `100%`/`%`, `+`, `+`/`-`/`0`, `Ctrl/Cmd + wheel`, 2-finger pinch) | Zoom from full-world fit (`0.2x`–`0.75x`) up to `4x` around the focal point, or reset to centered `100%` |
| Scroll wheel / right-click / `R`, `Shift+R`, `←`, `→` | Rotate the active loose tile 36 deg (or step Auto-rotate fits). Trackpad wheel steps per 50 px (`TRACKPAD_STEP`), dropping leftover partial steps after 150 ms; browser context menu and page scroll are suppressed over the board |
| `Enter` / `Space` / `Escape` | Place a legal loose tile (`Enter` / `Space`) or put away a loose tile (`Escape`, when no overlay is open) |
| Auto-rotate button | Switch auto-rotate (section 5b) on or off; shown green while on |
| `Ctrl/Cmd + Z`, Undo / Clear | See section 6 |
| Settings button | Opens Sandbox Settings (**Visual effects** and **Sound effects**, shared with Jigsaw and persisted in `localStorage`, plus a local-only **Copy debug info** diagnostics section with a Show/Hide preview and selectable fallback if clipboard access is blocked) |

Implementation notes: pointer events (`pointerdown/move/up/leave`), `touch-action: none` (plus iOS `gesturestart`/`gesturechange` prevention) on the gameplay canvas, `touch-action: manipulation` on buttons and form controls, `overscroll-behavior: none` on the page root, `-webkit-touch-callout: none` / `user-select: none` on the game chrome (while keeping overlay text selectable), and a backing store scaled by `devicePixelRatio`. The page uses `viewport-fit=cover`, fills the dynamic visible window (`h-dvh`, synced with `ResizeObserver`, `visualViewport`, and `orientationchange` as mobile browser toolbars expand or collapse), and applies `env(safe-area-inset-*)` padding on the top bar, piece tray, floating controls, and overlays so no control is obscured by iPhone notches, Dynamic Island, or the Home Indicator. On small screens (`< 640px`), the title hides to keep the top bar compact and touch targets stay generous (`min-h-9` / `p-2`+). The app provides a web app manifest (`public/manifest.webmanifest`), `apple-mobile-web-app-capable` metadata, and Penrose sun icons (`public/apple-touch-icon.png`, `public/icon-192.png`, `public/icon-512.png`, `public/icon.svg`) for standalone launch from the iPhone Home Screen. The rules are on a separate **How to Play** screen, a full-screen overlay (`z-50`) closed with its X button, a tap outside it, or Escape; the board keeps its state underneath.

## 9. Jigsaw

### Building the puzzle

1. **The tiling.** A patch of the kite and dart tiling is generated by deflation: a sun of five kites is split into Robinson half-tiles, each subdivided six times (each half-kite into two half-kites and a half-dart, each half-dart into a half-kite and a half-dart, all shrinking by phi), and mirror halves are joined into whole tiles with long edges of 60 units. The result is a correct Penrose tiling by construction: no overlaps, matching vertex colors, every tile at one of the ten 36° angles.
2. **The pieces.** A random point within 360 units of the patch center is chosen (so puzzles don't all show the sun at the center). Starting from the tile nearest it, the tile nearest it that shares a full edge with those already chosen is added until the puzzle has its size: **Small** 12, **Medium** 24 (the default) or **Large** 40 pieces. The pieces are always one edge-connected group, and could be built under the sandbox's rules (section 4).
3. **Placement and auto-fit scale.** The whole group is turned to a random one of the ten orientations and centered on the board. Because unplaced pieces live in a separate scrollable tray, a uniform world-to-screen scale (clamped to `[0.45, 3.0]`) is chosen so the solved puzzle fills up to 88% of both the width and height of the board canvas (leaving a 20-unit margin around its bounding box).
4. **Breaking it up (piece tray).** Every piece starts in the scrollable piece tray at a random one of the ten angles, in a shuffled order. The tray sits on the right side in landscape (`width >= height`, 2-column vertical scroll) or along the bottom in portrait (`height > width`, horizontal scroll strip), with an **All / Edges** filter showing counts (when **Edges** reaches 0, the filter automatically switches back to **All** and the **Edges** button is disabled until an edge piece is returned). Each piece renders as a uniform 64 x 64 thumbnail showing its picture crop, current rotation, and gold border edges.
5. **Resizing mid-puzzle.** If the window resizes while a puzzle is in progress, the layout recomputes for the new board size, shifts the puzzle and all on-board pieces together to the new center, keeps tray pieces in the tray (with updated homes), and clamps every loose on-board group rigidly so no loose piece's center falls outside the new board (leaving locked pieces in place).
6. **Border.** A tile edge that no other tile of the puzzle shares lies on the puzzle's outer border (or the border of a hole in it). Each piece records which of its edges these are; a piece with any is an **edge piece**, the rest are **interior pieces**.
7. **Seeds.** Every random choice comes from one seeded generator (mulberry32), so a seed always gives the same puzzle. A new puzzle uses a random seed; the first puzzle on the page uses `?seed=<n>` from the address if it is a whole number from 0 to 2^31 - 1.

### The picture

- The toolbar's **Picture** selector chooses among four built-in pictures drawn by the app (saved in the browser; see Saved settings below):
  - **Penrose (Subdivided)** (default): the puzzle's own Penrose tiling deflated 2 levels (sub-tile long edge `60 / phi^2`), with boundary half-tiles reflected across their axes so tiles straddling the puzzle border are whole.
  - **Penrose (Matching)**: aligns 1:1 with the puzzle's own tiles (long edge 60).
  - **Penrose (Independent)**: a separate Penrose tiling generated from a derived seed (changing on **New puzzle**, deterministic for `?seed=`), at long edge 38 and an independent rotation and offset, covering the puzzle's bounding box.
  - **Sunset**: a landscape at sunset (`ui/defaultPicture.ts`, 600 x 600).
- All three Penrose tiling pictures are painted in a stained-glass gradient across the solved puzzle's bounding box (kites slightly brighter/warmer, darts deeper/cooler, subtle dark lead lines) so pieces from different regions stay distinguishable, overlaid with Conway's two-family circular matching arcs:
  - **Primary** (warm gold): centered at kite `O` (radius `L / phi`) and dart `M` (radius `L / phi^2`), joining smoothly across every long edge.
  - **Secondary** (aqua cyan): centered at kite `C` (radius `L / phi^2`) and dart `A'` (radius `L / phi^3`), joining smoothly across every short edge.
- **Your picture** opens the device's file picker for an image; it replaces the picture for the current and later puzzles until a built-in picture is chosen from the **Picture** selector or the page is reloaded. It is read in the browser and never uploaded.
- The picture is scaled to cover the solved puzzle's bounding box, keeping its proportions and centered, with any overhang cut off evenly. Each piece shows the part of the picture over its home, moved and turned with the piece.

### Play

- **Pan and zoom.** The jigsaw board supports zooming (`0.75x` to `4x`) and panning:
  - Floating bottom-left zoom controls (`-`, `Fit` / percentage reset, `+`), keyboard shortcuts (`+`/`=`, `-`, `0` to fit), trackpad pinch (`Ctrl/Cmd + wheel`), and two-finger pinch-to-zoom on touch devices. Zooming keeps the world point under the focal point stationary.
  - Dragging empty board space (or over locked pieces) pans when zoomed in; two-finger drag pans on touch devices. At `zoom <= 1` the board stays centered; when zoomed in, panning is clamped with an edge margin so the board can't be lost off-screen.
  - Tapping a tray piece while zoomed in pops it near the center of the current visible view. Starting a new puzzle or changing size resets zoom and pan to Fit; resizing the window clamps the camera to the new viewport without cancelling an in-progress solve Fit transition. Solving the puzzle while zoomed or panned smoothly eases the camera back to Fit (cancelled only if the player manually pans or zooms, or starts a new puzzle; snaps directly to Fit when **Visual effects** is off or under `prefers-reduced-motion`).
- **Piece tray.** Dragging a piece out of the tray lifts it seamlessly onto the board under the pointer (on touch, swiping along the tray's scroll axis scrolls natively via `touch-action: pan-x` in portrait / `pan-y` in landscape, while dragging perpendicular toward the board lifts the piece out; a cancelled pointer never accidentally pops a piece). Dropping it directly onto its home locks it in one motion; dropping it back over the tray puts it away. Clicking or tapping a tray piece (within 8 CSS px of travel, un-cancelled) pops it onto the board near the center of the current view (staggered so repeated taps fan out) and selects it. Dropping a **single ungrouped** loose on-board piece back over the tray returns it to the top of the tray; multi-piece snapped groups stay on the board. Tray pieces cannot be hit-tested, rotated, or snapped against on the board while in the tray.
- **Groups.** Every piece starts in a group of its own. Pieces that have snapped together (below) form one group, which moves, turns, snaps and locks as a whole.
- **Picking up and tapping.** Pressing on a loose piece selects it and brings its whole group to the top of the stack (keeping the group's own stacking order); the topmost loose piece under the pointer is taken. Locked pieces can't be picked up. A quick tap/click on empty board space (within 6 CSS px of travel) clears the selection.
- **Dragging** moves the group once pointer travel exceeds 6 CSS px (`TAP_MAX_MOVE`). The move stops short where needed so that no piece's center leaves the board.
- **Turning.** The selected piece's group turns in 36° steps about the selected piece's center:
  - **Tap-to-rotate:** the first quick tap/click on an unselected loose piece selects it without rotating; subsequent quick taps/clicks (travel within 6 CSS px) on any piece in the already-selected group rotate the group 36° clockwise (`Shift+click` counter-clockwise).
  - **Floating rotate buttons:** whenever a loose piece is selected, a compact CCW / CW pill appears in the bottom-right corner of the board (mirroring the bottom-left zoom pill), away from the top bar.
  - **Keyboard & pointer:** `R` / `Shift+R`, Left / Right arrows, scroll wheel (as in section 8), or right-click on any loose piece (`Shift + right-click` the other way, also selecting that piece).
- **Locking in.** When a group is dropped, or turned, at its home angle with a piece's center within 20 units of its home, every piece in the group snaps exactly into place and locks. A piece only locks into its own home, even where another piece of the same shape and angle would fit.
- **Snapping together.** Otherwise, when a group is dropped or turned, each of its pieces is compared with every piece outside the group that borders it in the solved puzzle (shares a full edge) and is turned the same amount from its home angle. If the piece is within 20 units of where it would sit against that neighbor (the neighbor's position plus the difference of their homes, turned by the neighbor's turn), the group moves by that difference, so the two touch exactly as in the solved puzzle, and the two groups become one. The closest such match is used, and this repeats until no more pieces snap, since one snap can bring another neighbor into reach. Snapping against a locked piece is the same as locking in: a locked piece is at home, so a group within reach of it is within reach of its own home.
- **Progress.** The header shows "*placed* / *total* placed", and "Solved! All *n* pieces in place" in a highlighted green badge with a sparkle icon once every piece is locked.
- **Celebratory effects.** Tiered visual feedback celebrates progress on the board canvas when **Visual effects** is on in **Settings** (on by default; toggling it off clears any active canvas animations and toast immediately, while keeping sound effects independent). All animations reset cleanly when starting a new puzzle or changing size, and honor `prefers-reduced-motion` by replacing moving particles/sweeps with calm glows:
  - **Loose-piece snap:** when loose pieces or groups snap together (without locking into home), a crisp, brief aqua-white flash and small midpoint micro-sparks appear along each newly joined shared seam (tracking the merged pieces if moved immediately; subtler than and distinct from the warm golden lock glow).
  - **Piece locked:** a brief warm golden fill flash, glowing perimeter pulse, and small corner glints on the newly locked piece(s).
  - **Border completed:** once every edge piece (`isEdgePiece`) is locked (provided that move did not also solve the entire puzzle), twin golden-and-aqua comets race around the puzzle's ordered outer border loop(s) alongside a warm border glow and a brief non-blocking **"Border complete!"** toast pill.
  - **Puzzle finished:** once every piece is locked, if the board is zoomed or panned the camera smoothly eases back to Fit (snapping directly to Fit under `prefers-reduced-motion`, or cancelling if the player pans or zooms manually); a diagonal glossy sheen sweeps across the completed artwork, the outer border glows, and a burst of miniature **Penrose kite-and-dart confetti** in the stained-glass palette arcs across the board.
  - **Optional sound effects:** when **Sound effects** is turned on in **Settings** (off by default), synthesized Web Audio tones accompany each tier using the highest-priority cue per move (`solve` > `border` > `lock` > `snap`): a soft click on loose snap, a warm two-note chime on piece lock, an ascending pentatonic shimmer on border completion, and a gentle celebratory chord on solve.
- **New puzzle** starts a new puzzle of the chosen size with a new seed.
- **Settings** (gear button in the header, next to How to Play) opens a dialog in the same kind of overlay as How to Play (closed with its X button, a tap outside it, or Escape; titled "Settings"). Changes apply at once, carry over to new puzzles, and are saved in the browser (see Saved settings below).
  - **Puzzle size** (**Small** 12, **Medium** 24 default, **Large** 40): moved out of the top bar to avoid accidental resets while playing; choosing a different size starts a new puzzle of that size.
  - **Show picture** (off by default): the whole picture shown faintly (30% opacity) inside the outline, like the picture on a puzzle box.
  - **Show tile outlines** (on by default): the edges of every piece and of every tile in the gray outline. Off, the outline is one plain gray shape and pieces have no edges, so placed pieces read as one seamless picture; the selected group's blue outline is still drawn.
  - **Visual effects** (on by default): toggles celebratory canvas animations (seam sparks, lock glow, border shimmer and toast, solved sheen sweep, confetti, and smooth solve camera easing; when off, solving while zoomed snaps cleanly to Fit).
  - **Sound effects** (off by default): toggles synthesized Web Audio feedback on snap, lock, border completion, and solve (turning it on plays a soft confirmation chime and unlocks browser audio).
  - **Diagnostics (Copy debug info):** local-only button (also in Sandbox Settings) that copies a plain-text snapshot of device/viewport/display mode, camera, settings, and active puzzle/sandbox state (including Jigsaw's seed) to the clipboard, with a **Show / Hide** toggle and selectable text fallback if clipboard access is blocked.
- **How to Play** shows the jigsaw's instructions in the same kind of overlay as the sandbox's (section 8).

### Saved settings

- The jigsaw's settings are saved in the browser's local storage under the key `penrose-puzzle.jigsaw-settings`, as JSON (`{"showPicture": false, "showOutlines": true, "picture": "subdivided", "size": "medium", "effects": true, "sound": false}`), every time one changes, and read when the jigsaw opens. They are kept per browser and per site address: the live site and each pull-request preview share one origin (`dblevins-3dgfx.github.io`), so they share the saved settings.
- Reading is forgiving: if nothing is saved, the value isn't valid JSON or isn't an object, the defaults are used; a missing or invalid setting (non-boolean toggle, unknown `picture`, or unknown `size`) takes its default; unknown fields are ignored.
- If the browser blocks storage (for example some private-browsing modes), settings still work but are not saved.

### Drawing

| Element | Behavior |
|---|---|
| Outline | The solved puzzle's tiles, filled light gray, with slightly darker tile edges when Show tile outlines is on: where the pieces go |
| Loose pieces | Their part of the picture with a soft shadow, and a dark outline when Show tile outlines is on; every piece in the selected piece's group has a thick blue outline instead, whatever the setting |
| Locked pieces | Their part of the picture, with a faint outline when Show tile outlines is on, drawn under all loose pieces |
| Border | The puzzle's outer border, so edge pieces can be told from interior ones: each piece's border edges are drawn as a thick dark line (5 units) with a gold stripe (2 units), with round ends, on the piece wherever it is, loose or locked. Shown whatever Show tile outlines is set to. Around the gray outline, the border is a 3-unit slate line, drawn under the pieces |
| Layers | Locked pieces are drawn as one layer, then each loose group as one layer, in stacking order (by each group's topmost piece). A layer's picture is clipped to all its pieces at once, so no hairline seams show between pieces that fit together |
| Board | White, fills the full viewport below the slim top bar, drawn at the auto-fit scale and `devicePixelRatio` |

## 10. Known Limitations and Not Yet Implemented

- **No goal in the sandbox.** The sandbox has no score, win condition or end; the jigsaw (section 9) is the only goal so far.
- **Jigsaw.** No timer, move count or saved progress; reloading starts a new puzzle (or the `?seed=` one). Pieces only lock into their own home, not into a spot where an identical piece would fit, and a piece only snaps to its own neighbors from the solved puzzle.
- **Rule completeness.** The rules combine vertex coloring with an edge-direction/length check. They have not been proven to prevent every dead-end configuration, and vertex-only contacts are not snapped (only edge-to-edge snapping exists).
- **Performance.** Connected-edge detection and placement checks are O(n^2) over placed tiles per render; fine for dozens of tiles, not for hundreds.
- **No save/load.** The board is lost on reload.
- **Mobile.** Touch support has not been tested on a physical device; the 60-unit finger offset may need tuning.

## 11. Possible Next Steps

1. Decide which puzzle to keep: the jigsaw, or others (for example, fill a target outline, or reach a shape with a limited set of tiles).
2. "Show valid placements" hint mode.
3. Save the board in the browser.
