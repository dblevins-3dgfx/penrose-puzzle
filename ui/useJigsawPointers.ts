// Pointer interaction hooks for the jigsaw board and piece tray (spec 9):
// piece dragging, background panning, two-finger pinch-to-zoom/pan, tray
// drag-out and tap-to-pop, and dropping single loose pieces back into the tray.
import { useCallback, useRef, type MouseEvent, type PointerEvent, type RefObject } from 'react';
import type { BoardSize, Point } from '../rules';
import {
  bringToFront,
  canReturnToTray,
  moveGroup,
  panCamera,
  pieceAt,
  popSpotOnBoard,
  returnToTray,
  rotateGroup,
  screenToWorld,
  settleGroup,
  takeFromTray,
  zoomCameraAt,
  type Camera,
  type Piece,
  type ViewportLayout
} from '../jigsaw';

const clientToBoard = (
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
  layoutScale: number,
  camera: Camera
): Point => {
  const rect = canvas.getBoundingClientRect();
  return screenToWorld({ x: clientX - rect.left, y: clientY - rect.top }, layoutScale, camera);
};

const isInElement = (el: HTMLElement | null, clientX: number, clientY: number): boolean => {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
};

const pairMetrics = (pts: [Point, Point]) => {
  const [a, b] = pts;
  return {
    dist: Math.hypot(b.x - a.x, b.y - a.y) || 1,
    mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  };
};

// Handles dragging pieces out of the tray onto the board and tapping tray
// pieces to pop them into the visible center of the current camera view.
export const useTrayInteraction = (
  canvasRef: RefObject<HTMLCanvasElement | null>,
  trayRef: RefObject<HTMLDivElement | null>,
  layout: ViewportLayout,
  viewport: BoardSize,
  camera: Camera,
  isPortrait: boolean,
  updatePieces: (fn: (ps: Piece[]) => Piece[]) => void,
  onSelect: (id: number | null) => void
) =>
  useCallback(
    (id: number, startEvent: PointerEvent<HTMLButtonElement>) => {
      if (startEvent.button !== 0) return;
      const startX = startEvent.clientX, startY = startEvent.clientY;
      const isTouch = startEvent.pointerType === 'touch';
      let lifted = false, scrolled = false;

      const onMove = (e: globalThis.PointerEvent) => {
        const canvas = canvasRef.current;
        if (!canvas || scrolled) return;
        const dx = e.clientX - startX, dy = e.clientY - startY;
        if (!lifted) {
          if (isTouch) {
            const scrollMoved = isPortrait
              ? Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)
              : Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx);
            if (scrollMoved) { scrolled = true; return; }
            if (!(isPortrait ? dy < -12 : dx < -12)) return;
          } else if (Math.hypot(dx, dy) <= 6) {
            return;
          }
          lifted = true;
          const pt = clientToBoard(canvas, e.clientX, e.clientY, layout.scale, camera);
          onSelect(id);
          updatePieces(ps => takeFromTray(ps, id, pt, layout.board));
          return;
        }
        const pt = clientToBoard(canvas, e.clientX, e.clientY, layout.scale, camera);
        updatePieces(ps => {
          const piece = ps.find(q => q.id === id);
          return piece ? moveGroup(ps, id, pt.x - piece.x, pt.y - piece.y, layout.board) : ps;
        });
      };

      const onEnd = (e: globalThis.PointerEvent) => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onEnd);
        window.removeEventListener('pointercancel', onEnd);
        if (lifted) {
          if (isInElement(trayRef.current, e.clientX, e.clientY)) {
            onSelect(null);
            updatePieces(ps => returnToTray(ps, id));
          } else {
            updatePieces(ps => settleGroup(ps, id));
          }
          return;
        }
        if (!scrolled && Math.hypot(e.clientX - startX, e.clientY - startY) <= 8) {
          const anchor = screenToWorld({ x: viewport.width / 2, y: viewport.height / 2 }, layout.scale, camera);
          onSelect(id);
          updatePieces(ps => takeFromTray(ps, id, popSpotOnBoard(ps, layout.board, anchor), layout.board));
        }
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onEnd);
      window.addEventListener('pointercancel', onEnd);
    },
    [canvasRef, trayRef, layout.scale, layout.board, viewport.width, viewport.height, camera, isPortrait, updatePieces, onSelect]
  );

// Handles board canvas pointer events: loose piece drag, empty-board pan,
// two-finger touch pinch-to-zoom/pan, and right-click rotation.
export const useBoardPointers = (
  trayRef: RefObject<HTMLDivElement | null>,
  pieces: Piece[],
  layout: ViewportLayout,
  viewport: BoardSize,
  camera: Camera,
  setCamera: (fn: (c: Camera) => Camera) => void,
  updatePieces: (fn: (ps: Piece[]) => Piece[]) => void,
  onSelect: (id: number | null) => void,
  onDropHighlight: (active: boolean) => void
) => {
  const drag = useRef<{ id: number; dx: number; dy: number } | null>(null);
  const pan = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const touches = useRef<Map<number, Point>>(new Map());
  const pinch = useRef<{ dist: number; mid: Point } | null>(null);

  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.currentTarget.setPointerCapture?.(e.pointerId);

    if (e.pointerType === 'touch') {
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.current.size === 2) {
        if (drag.current) {
          const id = drag.current.id;
          drag.current = null;
          onDropHighlight(false);
          updatePieces(ps => settleGroup(ps, id));
        }
        pan.current = null;
        pinch.current = pairMetrics([...touches.current.values()] as [Point, Point]);
        return;
      }
      if (touches.current.size > 2) return;
    }

    const p = clientToBoard(e.currentTarget, e.clientX, e.clientY, layout.scale, camera);
    const i = pieceAt(pieces, p);
    if (i < 0) {
      pan.current = { pointerId: e.pointerId, x: e.clientX, y: e.clientY };
      return;
    }
    const piece = pieces[i];
    drag.current = { id: piece.id, dx: p.x - piece.x, dy: p.y - piece.y };
    onSelect(piece.id);
    updatePieces(ps => bringToFront(ps, i));
  };

  const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'touch' && touches.current.has(e.pointerId)) {
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.current.size === 2 && pinch.current) {
        const next = pairMetrics([...touches.current.values()] as [Point, Point]);
        const rect = e.currentTarget.getBoundingClientRect();
        const focus = { x: next.mid.x - rect.left, y: next.mid.y - rect.top };
        const factor = next.dist / pinch.current.dist;
        const dx = next.mid.x - pinch.current.mid.x;
        const dy = next.mid.y - pinch.current.mid.y;
        pinch.current = next;
        setCamera(c => zoomCameraAt(panCamera(c, dx, dy, viewport), factor, focus, viewport));
        return;
      }
    }

    if (pan.current && pan.current.pointerId === e.pointerId) {
      const dx = e.clientX - pan.current.x, dy = e.clientY - pan.current.y;
      pan.current = { pointerId: e.pointerId, x: e.clientX, y: e.clientY };
      setCamera(c => panCamera(c, dx, dy, viewport));
      return;
    }

    const d = drag.current;
    if (!d) return;
    onDropHighlight(isInElement(trayRef.current, e.clientX, e.clientY) && canReturnToTray(pieces, d.id));
    const p = clientToBoard(e.currentTarget, e.clientX, e.clientY, layout.scale, camera);
    updatePieces(ps => {
      const piece = ps.find(q => q.id === d.id);
      return piece ? moveGroup(ps, d.id, p.x - d.dx - piece.x, p.y - d.dy - piece.y, layout.board) : ps;
    });
  };

  const onPointerUp = (e: PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'touch') {
      touches.current.delete(e.pointerId);
      if (touches.current.size < 2) pinch.current = null;
    }
    if (pan.current && pan.current.pointerId === e.pointerId) {
      pan.current = null;
    }
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    onDropHighlight(false);
    if (isInElement(trayRef.current, e.clientX, e.clientY) && canReturnToTray(pieces, d.id)) {
      onSelect(null);
      updatePieces(ps => returnToTray(ps, d.id));
      return;
    }
    updatePieces(ps => settleGroup(ps, d.id));
  };

  const onContextMenu = (e: MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const i = pieceAt(pieces, clientToBoard(e.currentTarget, e.clientX, e.clientY, layout.scale, camera));
    if (i < 0) return;
    const id = pieces[i].id;
    onSelect(id);
    updatePieces(ps => rotateGroup(bringToFront(ps, i), id, e.shiftKey ? -1 : 1));
  };

  return { onPointerDown, onPointerMove, onPointerUp, onContextMenu };
};
