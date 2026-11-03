import React, { useState, useRef, useEffect, useMemo } from 'react';
import { RotateCw, Trash2, Undo2, CircleHelp, X } from 'lucide-react';

const PHI = (1 + Math.sqrt(5)) / 2;
const TILE_SIZE = 60;
const VERTEX_EPS = 4;

// Edge length labels walking the perimeter from vertex i to vertex i+1.
// Both kite and dart share this long/short/short/long pattern.
const EDGE_LENGTHS = ['long', 'short', 'short', 'long'];

// Penrose's actual matching rule (vertex 2-coloring): whenever a point is
// a vertex of more than one tile, it must be the same color on every tile
// touching it. Colors follow vertex order [O,B,C,D] for the kite and
// [M,N,A',N'] for the dart:
// Kite: axis vertices (O at 72°, C at 144°) = black; off-axis (B,D) = white.
// Dart: axis vertices (M at 72°, A' at 216°) = white; off-axis (N,N') = black.
const KITE_VERTEX_COLORS = ['black', 'white', 'black', 'white'];
const DART_VERTEX_COLORS = ['white', 'black', 'white', 'black'];

const normalize = (dx, dy) => {
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  return { x: dx / len, y: dy / len };
};

const samePoint = (p, q) =>
  Math.abs(p.x - q.x) < VERTEX_EPS && Math.abs(p.y - q.y) < VERTEX_EPS;

// Kite: verified via law-of-cosines closure check.
// Vertices O(72°) -> B(72°) -> C(144°) -> D(72°), edges: long,short,short,long
// Axis of symmetry passes through O and C. Centered on centroid so the
// shape is anchored under the cursor/placement point, not by vertex O.
const getKiteVertices = (x, y, rotation) => {
  const r = rotation * Math.PI / 180;
  const long = TILE_SIZE;
  const deg36 = 36 * Math.PI / 180;

  const local = [
    { x: 0, y: 0 },
    { x: long * Math.cos(r + deg36), y: long * Math.sin(r + deg36) },
    { x: long * Math.cos(r), y: long * Math.sin(r) },
    { x: long * Math.cos(r - deg36), y: long * Math.sin(r - deg36) }
  ];

  const cx = local.reduce((s, v) => s + v.x, 0) / local.length;
  const cy = local.reduce((s, v) => s + v.y, 0) / local.length;

  return local.map(v => ({ x: x + v.x - cx, y: y + v.y - cy }));
};

// Dart: verified via law-of-cosines closure check.
// Vertices M(72°) -> N(36°) -> A'(216°, reflex) -> N'(36°), edges: long,short,short,long
// Axis of symmetry passes through M and A'. Centered on centroid so the
// shape is anchored under the cursor/placement point, not by vertex M.
const getDartVertices = (x, y, rotation) => {
  const r = rotation * Math.PI / 180;
  const long = TILE_SIZE;
  const deg36 = 36 * Math.PI / 180;

  const local = [
    { x: 0, y: 0 },
    { x: long * Math.cos(r + deg36), y: long * Math.sin(r + deg36) },
    { x: (long / PHI) * Math.cos(r), y: (long / PHI) * Math.sin(r) },
    { x: long * Math.cos(r - deg36), y: long * Math.sin(r - deg36) }
  ];

  const cx = local.reduce((s, v) => s + v.x, 0) / local.length;
  const cy = local.reduce((s, v) => s + v.y, 0) / local.length;

  return local.map(v => ({ x: x + v.x - cx, y: y + v.y - cy }));
};

// Returns this tile's polygon vertices, dispatching on its type.
const getVertices = (tile) => tile.type === 'kite'
  ? getKiteVertices(tile.x, tile.y, tile.rotation)
  : getDartVertices(tile.x, tile.y, tile.rotation);

const getVertexColors = (tile) =>
  tile.type === 'kite' ? KITE_VERTEX_COLORS : DART_VERTEX_COLORS;

// Checks a candidate tile against all placed tiles: does it touch the
// existing structure at all, and does every coincident vertex agree in
// Penrose color with every tile it touches there? (Edge-length mismatches
// are already ruled out by checkEdgeContact's T-junction test.)
const checkVertexMatching = (candidate, allTiles) => {
  const cVerts = getVertices(candidate);
  const cColors = getVertexColors(candidate);
  let touches = false;
  let colorsMatch = true;

  for (const tile of allTiles) {
    const tVerts = getVertices(tile);
    const tColors = getVertexColors(tile);
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        if (samePoint(cVerts[i], tVerts[j])) {
          touches = true;
          if (cColors[i] !== tColors[j]) colorsMatch = false;
        }
      }
    }
  }
  return { touches, colorsMatch };
};

// Finds every edge shared between two placed tiles (both endpoints
// coincide) where the Penrose vertex colors also agree at both ends -
// i.e. genuinely valid connections, not just geometric proximity.
const findConnectedEdges = (allTiles) => {
  const connected = [];

  for (let i = 0; i < allTiles.length; i++) {
    const vi = getVertices(allTiles[i]);
    const ci = getVertexColors(allTiles[i]);
    for (let j = i + 1; j < allTiles.length; j++) {
      const vj = getVertices(allTiles[j]);
      const cj = getVertexColors(allTiles[j]);
      for (let a = 0; a < 4; a++) {
        const a1 = vi[a], a2 = vi[(a + 1) % 4];
        const ca1 = ci[a], ca2 = ci[(a + 1) % 4];
        for (let b = 0; b < 4; b++) {
          const b1 = vj[b], b2 = vj[(b + 1) % 4];
          const cb1 = cj[b], cb2 = cj[(b + 1) % 4];
          const forward = samePoint(a1, b1) && samePoint(a2, b2) && ca1 === cb1 && ca2 === cb2;
          const reverse = samePoint(a1, b2) && samePoint(a2, b1) && ca1 === cb2 && ca2 === cb1;
          if (forward || reverse) {
            connected.push({ x1: a1.x, y1: a1.y, x2: a2.x, y2: a2.y });
          }
        }
      }
    }
  }
  return connected;
};

// True if point p lies on the interior of segment a-b (not at an endpoint).
const pointOnEdgeInterior = (p, a, b) => {
  const abx = b.x - a.x, aby = b.y - a.y;
  const len2 = abx * abx + aby * aby || 1;
  const t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2;
  if (t <= 0 || t >= 1) return false;
  const px = a.x + t * abx, py = a.y + t * aby;
  if (Math.hypot(p.x - px, p.y - py) > VERTEX_EPS) return false;
  return !samePoint(p, a) && !samePoint(p, b);
};

// Penrose kite/dart tilings are edge-to-edge. A candidate must share at
// least one full edge with an existing tile (a single-vertex contact is not
// enough), and no corner may land in the middle of another tile's edge
// (a T-junction), in either direction.
const checkEdgeContact = (candidate, allTiles) => {
  const cv = getVertices(candidate);
  let sharesEdge = false;
  let tJunction = false;

  for (const tile of allTiles) {
    const tv = getVertices(tile);

    for (let a = 0; a < 4; a++) {
      const a1 = cv[a], a2 = cv[(a + 1) % 4];
      for (let b = 0; b < 4; b++) {
        const b1 = tv[b], b2 = tv[(b + 1) % 4];
        if ((samePoint(a1, b1) && samePoint(a2, b2)) ||
            (samePoint(a1, b2) && samePoint(a2, b1))) {
          sharesEdge = true;
        }
      }
    }

    for (const p of cv) {
      for (let b = 0; b < 4; b++) {
        if (pointOnEdgeInterior(p, tv[b], tv[(b + 1) % 4])) tJunction = true;
      }
    }
    for (const p of tv) {
      for (let a = 0; a < 4; a++) {
        if (pointOnEdgeInterior(p, cv[a], cv[(a + 1) % 4])) tJunction = true;
      }
    }
  }
  return { sharesEdge, tJunction };
};

const centroidOf = (verts) => ({
  x: verts.reduce((s, v) => s + v.x, 0) / verts.length,
  y: verts.reduce((s, v) => s + v.y, 0) / verts.length
});

// Separating-axis test for two triangles. Shapes that merely touch (or
// overlap by less than `tol` pixels) are NOT considered overlapping, so
// tiles sharing an edge or vertex are fine.
const trianglesOverlap = (t1, t2, tol) => {
  for (const tri of [t1, t2]) {
    for (let i = 0; i < 3; i++) {
      const p = tri[i], q = tri[(i + 1) % 3];
      const n = normalize(-(q.y - p.y), q.x - p.x);
      let min1 = Infinity, max1 = -Infinity, min2 = Infinity, max2 = -Infinity;
      for (const v of t1) {
        const d = v.x * n.x + v.y * n.y;
        min1 = Math.min(min1, d); max1 = Math.max(max1, d);
      }
      for (const v of t2) {
        const d = v.x * n.x + v.y * n.y;
        min2 = Math.min(min2, d); max2 = Math.max(max2, d);
      }
      if (max1 <= min2 + tol || max2 <= min1 + tol) return false;
    }
  }
  return true;
};

// Both the kite and the dart split cleanly into two triangles along the
// diagonal from vertex 0 to vertex 2 (their axis of symmetry), which also
// handles the dart's concave notch correctly.
const toTriangles = (v) => [[v[0], v[1], v[2]], [v[0], v[2], v[3]]];

const tilesOverlap = (vertsA, vertsB) => {
  for (const ta of toTriangles(vertsA)) {
    for (const tb of toTriangles(vertsB)) {
      if (trianglesOverlap(ta, tb, 1.5)) return true;
    }
  }
  return false;
};

// ---------------------------------------------------------------------
// Placement rules
// ---------------------------------------------------------------------

// Playfield size (matches the canvas). Every tile vertex must stay inside it.
const BOARD_W = 800;
const BOARD_H = 600;

// True if any vertex lies outside the playfield (small rounding tolerance).
const isOutsidePlayfield = (verts) => {
  const EDGE_TOL = 0.5;
  return verts.some(v =>
    v.x < -EDGE_TOL || v.x > BOARD_W + EDGE_TOL ||
    v.y < -EDGE_TOL || v.y > BOARD_H + EDGE_TOL
  );
};

// Is `candidate` ({type, x, y, rotation}) a legal placement?
// `ignoreBounds` skips only the playfield test; it lets the preview show a
// snapped position that is blocked solely for being out of bounds.
const isLegalPlacement = (allTiles, candidate, ignoreBounds = false) => {
  const candVerts = getVertices(candidate);

  // Keep every vertex inside the playfield
  if (!ignoreBounds && isOutsidePlayfield(candVerts)) return false;

  if (allTiles.length === 0) return true;

  // Reject real overlaps (positive-area intersection with any tile)
  for (const tile of allTiles) {
    if (tilesOverlap(candVerts, getVertices(tile))) return false;
  }

  // Must touch the existing structure, and every point where tiles meet
  // must agree in Penrose vertex color - the real matching rule.
  const { touches, colorsMatch } = checkVertexMatching(candidate, allTiles);
  if (!touches || !colorsMatch) return false;

  // Must be edge-to-edge: share a full edge, and no T-junctions.
  const { sharesEdge, tJunction } = checkEdgeContact(candidate, allTiles);
  if (!sharesEdge || tJunction) return false;

  return true;
};

// Tile fills: kites and darts get their own colors so the pattern reads.
const TILE_STYLE = {
  kite: { fill: 'rgba(245, 158, 11, 0.65)', stroke: '#92400e' },
  dart: { fill: 'rgba(99, 102, 241, 0.65)', stroke: '#3730a3' }
};

const PenrosePuzzle = () => {
  const canvasRef = useRef(null);
  const [tiles, setTiles] = useState([]);
  const [selectedTileType, setSelectedTileType] = useState('kite');
  const [rotation, setRotation] = useState(0);
  const [hoveredPos, setHoveredPos] = useState(null);
  const [showHelp, setShowHelp] = useState(false);

  // Escape closes the How to Play screen
  useEffect(() => {
    if (!showHelp) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setShowHelp(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showHelp]);

  const counts = useMemo(() => ({
    kite: tiles.filter(t => t.type === 'kite').length,
    dart: tiles.filter(t => t.type === 'dart').length
  }), [tiles]);

  const undo = () => setTiles(prev => prev.slice(0, -1));
  const clearBoard = () => {
    setTiles([]);
    setRotation(0);
    setHoveredPos(null);
  };

  const drawTile = (ctx, tile) => {
    const vertices = getVertices(tile);
    const style = TILE_STYLE[tile.type];

    ctx.beginPath();
    ctx.moveTo(vertices[0].x, vertices[0].y);
    vertices.forEach(v => ctx.lineTo(v.x, v.y));
    ctx.closePath();

    ctx.fillStyle = style.fill;
    ctx.fill();

    ctx.strokeStyle = style.stroke;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Small tick marks along each edge (visual texture only)
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    for (let i = 0; i < vertices.length; i++) {
      const v1 = vertices[i];
      const v2 = vertices[(i + 1) % vertices.length];
      const midX = (v1.x + v2.x) / 2;
      const midY = (v1.y + v2.y) / 2;
      const dx = v2.y - v1.y;
      const dy = v1.x - v2.x;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      ctx.beginPath();
      ctx.moveTo(midX - dx / len * 3, midY - dy / len * 3);
      ctx.lineTo(midX + dx / len * 3, midY + dy / len * 3);
      ctx.stroke();
    }

    // Vertex colors (the Penrose matching labels): filled dots with a
    // contrasting ring so both black and white read on any tile fill.
    const colors = getVertexColors(tile);
    vertices.forEach((v, i) => {
      const isBlack = colors[i] === 'black';
      ctx.beginPath();
      ctx.arc(v.x, v.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = isBlack ? '#000' : '#fff';
      ctx.fill();
      ctx.strokeStyle = isBlack ? '#fff' : '#000';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });
  };

  // Legality of placing the currently selected tile at (x, y).
  const isValidPlacement = (x, y) =>
    isLegalPlacement(tiles, { type: selectedTileType, x, y, rotation });

  // Snaps the tile so one of its edges lands exactly on an existing tile's
  // edge (no gaps). Tries every equal-length edge pairing, keeps only those
  // that put the tile on the opposite side of the shared edge and pass the
  // full placement rules, and picks the smallest movement.
  const SNAP_RADIUS = 45;
  const getSnappedPosition = (x, y) => {
    if (tiles.length === 0) return { x, y, snapped: false };

    const cv = getVertices({ type: selectedTileType, x, y, rotation });
    const cc = centroidOf(cv);
    let best = null;

    for (const tile of tiles) {
      const tv = getVertices(tile);
      const tc = centroidOf(tv);

      for (let a = 0; a < 4; a++) {
        const a1 = tv[a], a2 = tv[(a + 1) % 4];

        for (let k = 0; k < 4; k++) {
          if (EDGE_LENGTHS[k] !== EDGE_LENGTHS[a]) continue;
          const c1 = cv[k], c2 = cv[(k + 1) % 4];

          // The edges can coincide in either direction
          for (const [t1, t2] of [[a1, a2], [a2, a1]]) {
            const tx = t1.x - c1.x, ty = t1.y - c1.y;

            // Both endpoints must land on the target edge (edge is parallel)
            if (Math.hypot(c2.x + tx - t2.x, c2.y + ty - t2.y) > 2) continue;

            const dist = Math.hypot(tx, ty);
            if (dist > SNAP_RADIUS) continue;
            if (best && dist >= best.dist) continue;

            // Tiles must sit on opposite sides of the shared edge
            const ex = a2.x - a1.x, ey = a2.y - a1.y;
            const sideExisting = ex * (tc.y - a1.y) - ey * (tc.x - a1.x);
            const sideCandidate = ex * (cc.y + ty - a1.y) - ey * (cc.x + tx - a1.x);
            if (sideExisting * sideCandidate >= 0) continue;

            // A snap position that fails only the playfield test is still
            // shown (so the red border warning can appear), but any
            // in-bounds legal snap always wins over it.
            const nx = x + tx, ny = y + ty;
            const oob = isOutsidePlayfield(cv.map(v => ({ x: v.x + tx, y: v.y + ty })));
            const legal = isLegalPlacement(
              tiles,
              { type: selectedTileType, x: nx, y: ny, rotation },
              oob
            );
            if (!legal) continue;

            const rank = dist + (oob ? 1000 : 0);
            if (best && rank >= best.dist) continue;

            best = { x: nx, y: ny, dist: rank, snapped: true };
          }
        }
      }
    }

    return best || { x, y, snapped: false };
  };

  const drawPreview = (ctx, rawX, rawY) => {
    const { x, y } = getSnappedPosition(rawX, rawY);
    const previewTile = { type: selectedTileType, x, y, rotation };

    ctx.save();
    ctx.globalAlpha = 0.55;
    drawTile(ctx, previewTile);
    ctx.restore();

    const valid = isValidPlacement(x, y);
    const vertices = getVertices(previewTile);

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(vertices[0].x, vertices[0].y);
    vertices.forEach(v => ctx.lineTo(v.x, v.y));
    ctx.closePath();
    ctx.strokeStyle = valid ? '#16a34a' : '#dc2626';
    ctx.lineWidth = 3;
    ctx.setLineDash(valid ? [] : [6, 4]);
    ctx.stroke();
    ctx.restore();

    // Red border around the whole playfield while the previewed tile has a
    // vertex outside it.
    if (isOutsidePlayfield(vertices)) {
      ctx.save();
      ctx.strokeStyle = '#dc2626';
      ctx.lineWidth = 8;
      ctx.strokeRect(4, 4, BOARD_W - 8, BOARD_H - 8);
      ctx.restore();
    }
  };

  const placeTile = (x, y) => {
    if (!isValidPlacement(x, y)) return;
    setTiles(prev => [...prev, { type: selectedTileType, x, y, rotation }]);
  };

  // Keyboard: arrows rotate; Ctrl/Cmd+Z undoes the last tile.
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setRotation(prev => (prev - 36 + 360) % 360);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setRotation(prev => (prev + 36) % 360);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        setTiles(prev => prev.slice(0, -1));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Mouse wheel over the board rotates the tile: up = clockwise. A mouse
  // wheel notch arrives as one large delta and turns one step. A trackpad
  // swipe arrives as a stream of small deltas; it turns one step for every
  // TRACKPAD_STEP pixels scrolled, so a longer swipe turns further. Any
  // leftover partial step is dropped after a short pause in the stream.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const WHEEL_NOTCH = 50;
    const TRACKPAD_STEP = 50; // lower = faster trackpad rotation
    const SWIPE_END_MS = 150;
    const swipe = { total: 0, timer: null };

    const rotateBy = (dy) => setRotation(prev => (prev + (dy < 0 ? 36 : -36) + 360) % 360);

    const handleWheel = (e) => {
      e.preventDefault();
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
      if (Math.abs(dy) >= WHEEL_NOTCH) {
        rotateBy(dy);
        return;
      }

      clearTimeout(swipe.timer);
      swipe.timer = setTimeout(() => { swipe.total = 0; }, SWIPE_END_MS);
      swipe.total += dy;
      while (Math.abs(swipe.total) >= TRACKPAD_STEP) {
        rotateBy(swipe.total);
        swipe.total -= Math.sign(swipe.total) * TRACKPAD_STEP;
      }
    };

    // Non-passive so preventDefault can stop the page from scrolling
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      canvas.removeEventListener('wheel', handleWheel);
      clearTimeout(swipe.timer);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Grid background
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 0.5;
    for (let i = 0; i < canvas.width; i += 40) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, canvas.height);
      ctx.stroke();
    }
    for (let i = 0; i < canvas.height; i += 40) {
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(canvas.width, i);
      ctx.stroke();
    }

    tiles.forEach(tile => drawTile(ctx, tile));

    // Highlight edges shared between two tiles (valid connections) in green
    const connectedEdges = findConnectedEdges(tiles);
    ctx.save();
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    connectedEdges.forEach(seg => {
      ctx.beginPath();
      ctx.moveTo(seg.x1, seg.y1);
      ctx.lineTo(seg.x2, seg.y2);
      ctx.stroke();
    });
    ctx.restore();

    if (hoveredPos) {
      drawPreview(ctx, hoveredPos.x, hoveredPos.y);
    }
  }, [tiles, hoveredPos, rotation, selectedTileType]);

  // Touch devices have no hover, so the preview follows a finger drag and
  // is lifted above the fingertip so it isn't hidden under it.
  const TOUCH_OFFSET_Y = 60;
  const isTouchDevice = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;

  // Convert a pointer event's CSS pixel position into the canvas's internal
  // drawing coordinate space, since the canvas is scaled to fit the window
  // relative to its 800x600 drawing buffer.
  const getCanvasCoords = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const touch = e.pointerType === 'touch';
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY - (touch ? TOUCH_OFFSET_Y : 0),
      touch
    };
  };

  const handlePointerDown = (e) => {
    if (e.pointerType === 'touch') e.currentTarget.setPointerCapture?.(e.pointerId);
    setHoveredPos(getCanvasCoords(e));
  };

  const handlePointerMove = (e) => {
    setHoveredPos(getCanvasCoords(e));
  };

  // Mouse: click places immediately. Touch: lifting the finger leaves the
  // preview in place so it can be adjusted, and the Place button confirms.
  const handlePointerUp = (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    const { x, y } = getCanvasCoords(e);
    const pos = getSnappedPosition(x, y);
    placeTile(pos.x, pos.y);
  };

  // Right-click rotates clockwise (Shift + right-click counter-clockwise)
  // instead of opening the browser menu.
  const handleContextMenu = (e) => {
    e.preventDefault();
    setRotation(prev => (prev + (e.shiftKey ? -36 : 36) + 360) % 360);
  };

  const handlePointerLeave = (e) => {
    if (e.pointerType === 'mouse') setHoveredPos(null);
  };

  const snappedPreview = hoveredPos ? getSnappedPosition(hoveredPos.x, hoveredPos.y) : null;
  const previewValid = snappedPreview ? isValidPlacement(snappedPreview.x, snappedPreview.y) : false;

  const placeAtPreview = () => {
    if (!snappedPreview || !previewValid) return;
    placeTile(snappedPreview.x, snappedPreview.y);
    setHoveredPos(null);
  };

  const tileButton = (type, label) => (
    <button
      onClick={() => setSelectedTileType(type)}
      className={`px-4 py-2 rounded-lg font-semibold ${
        selectedTileType === type
          ? (type === 'kite' ? 'bg-amber-500 text-slate-900' : 'bg-indigo-500 text-white')
          : 'bg-slate-700 text-slate-300'
      }`}
    >
      {label}
    </button>
  );

  // The layout fills exactly the visible window (dvh tracks mobile browser
  // toolbars): header and controls take their natural height and the board
  // scales to the largest 4:3 size that fits in the rest.
  return (
    <div className="w-full h-dvh overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center p-2 sm:p-3">
      <div className="max-w-6xl w-full h-full flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h1 className="text-xl sm:text-2xl font-bold text-white">Penrose Puzzle</h1>
          <div className="flex items-center gap-4">
            <div className="text-slate-300 text-sm">
              <span className="text-amber-400 font-semibold">{counts.kite}</span> kites ·{' '}
              <span className="text-indigo-400 font-semibold">{counts.dart}</span> darts
            </div>
            <button
              onClick={() => setShowHelp(true)}
              className="text-slate-300 hover:text-white flex items-center gap-1 text-sm"
            >
              <CircleHelp size={20} />
              How to Play
            </button>
          </div>
        </div>

        <div className="bg-slate-800 rounded-lg p-2 flex gap-2 sm:gap-3 items-center justify-center flex-wrap">
          <div className="flex gap-2">
            {tileButton('kite', 'Kite')}
            {tileButton('dart', 'Dart')}
          </div>

          {isTouchDevice ? (
            <>
              <button
                onClick={() => setRotation((rotation - 36 + 360) % 360)}
                aria-label="Rotate counter-clockwise"
                className="bg-slate-700 active:bg-slate-600 text-white px-5 py-3 rounded-lg flex items-center gap-2"
              >
                <RotateCw size={22} style={{ transform: 'scaleX(-1)' }} />
              </button>

              <button
                onClick={() => setRotation((rotation + 36) % 360)}
                aria-label="Rotate clockwise"
                className="bg-slate-700 active:bg-slate-600 text-white px-5 py-3 rounded-lg flex items-center gap-2"
              >
                <RotateCw size={22} />
                <span className="text-sm">{rotation}°</span>
              </button>

              <button
                onClick={placeAtPreview}
                disabled={!previewValid}
                className={`px-6 py-3 rounded-lg font-semibold text-white ${
                  previewValid ? 'bg-green-600 active:bg-green-700' : 'bg-slate-600 opacity-50'
                }`}
              >
                Place
              </button>
            </>
          ) : (
            <div className="text-slate-300 text-sm flex items-center gap-2">
              <RotateCw size={18} />
              <span>Rotate: scroll wheel, right-click, or ←/→</span>
              <span className="text-white font-semibold w-10">{rotation}°</span>
            </div>
          )}

          <button
            onClick={undo}
            disabled={tiles.length === 0}
            className={`bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 ${
              tiles.length === 0 ? 'opacity-50' : ''
            }`}
          >
            <Undo2 size={18} />
            Undo
          </button>

          <button
            onClick={clearBoard}
            disabled={tiles.length === 0}
            className={`bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 ${
              tiles.length === 0 ? 'opacity-50' : ''
            }`}
          >
            <Trash2 size={18} />
            Clear
          </button>
        </div>

        {/* Size container: the canvas width is the smaller of the full
            width and the width a 4:3 board would have at the full height. */}
        <div className="flex-1 min-h-0 flex items-start justify-center" style={{ containerType: 'size' }}>
          <canvas
            ref={canvasRef}
            width={800}
            height={600}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerLeave}
            onContextMenu={handleContextMenu}
            style={{ touchAction: 'none', width: 'min(100cqw, 100cqh * 4 / 3)' }}
            className="h-auto bg-white rounded shadow-2xl cursor-crosshair"
          />
        </div>
      </div>

      {showHelp && (
        <div
          className="fixed inset-0 z-10 bg-slate-900/95 overflow-y-auto p-4"
          onClick={() => setShowHelp(false)}
        >
          <div
            className="max-w-2xl mx-auto bg-slate-800 rounded-lg p-4 sm:p-6 text-slate-300 text-sm sm:text-base"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xl sm:text-2xl font-bold text-white">How to Play</h2>
              <button
                onClick={() => setShowHelp(false)}
                aria-label="Close"
                className="text-slate-300 hover:text-white p-1"
              >
                <X size={24} />
              </button>
            </div>
            <p className="mb-3">Build a Penrose tiling from kites and darts.</p>
            <ul className="list-disc list-inside space-y-2">
              <li>Place the first tile anywhere on the board</li>
              <li>Each tile after that must share a full edge with the tiles already down</li>
              <li>Where tiles meet, the corner dots must match: black on black, white on white</li>
              <li>
                {isTouchDevice
                  ? 'Drag on the board to position the tile, rotate with the buttons (36° steps), then tap Place'
                  : 'Click to place. Rotate with the scroll wheel over the board, right-click (Shift + right-click for the other way), or Left/Right arrow keys (36° steps)'}
              </li>
              <li>Green preview outline = the tile fits; red dashed = it doesn't</li>
              <li>{isTouchDevice ? 'Undo' : 'Undo (or Ctrl/Cmd+Z)'} removes the last tile; Clear empties the board</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

export default PenrosePuzzle;
