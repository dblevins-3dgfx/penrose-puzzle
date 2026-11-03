import { useState, useRef, useEffect, useMemo } from 'react';
import { RotateCw, Trash2, Undo2, CircleHelp, X } from 'lucide-react';
import {
  getVertices,
  getVertexColors,
  isLegalPlacement,
  isOutsidePlayfield,
  snapPosition,
  findConnectedEdges,
  countTiles,
  removeLastTile,
  rotateBy,
  wheelDeltaPixels,
  wheelSteps,
  WHEEL_NOTCH,
  BOARD_W,
  BOARD_H,
  type Tile,
  type TileType
} from './rules';

// Tile fills: kites and darts get their own colors so the pattern reads.
const TILE_STYLE = {
  kite: { fill: 'rgba(245, 158, 11, 0.65)', stroke: '#92400e' },
  dart: { fill: 'rgba(99, 102, 241, 0.65)', stroke: '#3730a3' }
};

const PenrosePuzzle = () => {
  const canvasRef = useRef(null);
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [selectedTileType, setSelectedTileType] = useState<TileType>('kite');
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

  const counts = useMemo(() => countTiles(tiles), [tiles]);

  const undo = () => setTiles(removeLastTile);
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

  // Where the selected tile goes with the pointer at (x, y) (spec 5).
  const getSnappedPosition = (x, y) =>
    snapPosition(tiles, { type: selectedTileType, x, y, rotation });

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
        setRotation(prev => rotateBy(prev, -1));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setRotation(prev => rotateBy(prev, 1));
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        setTiles(removeLastTile);
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

    const SWIPE_END_MS = 150;
    const swipe = { total: 0, timer: null };

    const handleWheel = (e) => {
      e.preventDefault();
      const dy = wheelDeltaPixels(e.deltaY, e.deltaMode);
      const { steps, total } = wheelSteps(swipe.total, dy);
      if (Math.abs(dy) < WHEEL_NOTCH) {
        // Part of a trackpad swipe: forget the leftover after a pause
        clearTimeout(swipe.timer);
        swipe.timer = setTimeout(() => { swipe.total = 0; }, SWIPE_END_MS);
      }
      swipe.total = total;
      if (steps) setRotation(prev => rotateBy(prev, steps));
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
    setRotation(prev => rotateBy(prev, e.shiftKey ? -1 : 1));
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

  const tileButton = (type: TileType, label: string) => (
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
                onClick={() => setRotation(rotateBy(rotation, -1))}
                aria-label="Rotate counter-clockwise"
                className="bg-slate-700 active:bg-slate-600 text-white px-5 py-3 rounded-lg flex items-center gap-2"
              >
                <RotateCw size={22} style={{ transform: 'scaleX(-1)' }} />
              </button>

              <button
                onClick={() => setRotation(rotateBy(rotation, 1))}
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
