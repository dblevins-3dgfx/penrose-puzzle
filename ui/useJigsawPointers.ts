// Pointer interaction hooks for the jigsaw board and piece tray (spec 9):
// piece dragging, background panning, two-finger pinch-to-zoom/pan, tray
// drag-out and tap-to-pop, and dropping single loose pieces back into the tray.
import { useCallback, useRef, type MouseEvent, type PointerEvent, type RefObject } from 'react';
import type { BoardSize, Point } from '../rules';
import { panCamera, screenToWorld, zoomCameraAt, type Camera } from '../camera';
import { isTrayTap, nextTrayPhase, TAP_MAX_MOVE, type TrayGesturePhase } from '../gestures';
import {
  bringToFront,
  canReturnToTray,
  isGroupSelected,
  moveGroup,
  pieceAt,
  popSpotOnBoard,
  returnToTray,
  rotateGroup,
  settleGroup,
  shouldTapRotate,
  takeFromTray,
  type Piece,
  type ViewportLayout
} from '../jigsaw';
import {
  IDLE_GESTURE,
  isInElement,
  pairMetrics,
  startPanGesture,
  stepPanGesture,
  stepPinch,
  type BoardGesture
} from './pointerUtils';

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
      const startX = startEvent.clientX,
        startY = startEvent.clientY;
      const isTouch = startEvent.pointerType === 'touch';
      let phase: TrayGesturePhase = 'pending';

      const onMove = (e: globalThis.PointerEvent) => {
        const canvas = canvasRef.current;
        if (!canvas || phase === 'scrolling') return;
        const prevPhase = phase;
        phase = nextTrayPhase(phase, isTouch, isPortrait, e.clientX - startX, e.clientY - startY);
        if (phase !== 'lifted') return;
        const pt = clientToBoard(canvas, e.clientX, e.clientY, layout.scale, camera);
        if (prevPhase === 'pending') {
          onSelect(id);
          updatePieces(ps => takeFromTray(ps, id, pt, layout.board));
          return;
        }
        updatePieces(ps => {
          const piece = ps.find(q => q.id === id);
          return piece ? moveGroup(ps, id, pt.x - piece.x, pt.y - piece.y, layout.board) : ps;
        });
      };

      const finish = (e: globalThis.PointerEvent, cancelled: boolean) => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onCancel);
        if (phase === 'lifted') {
          if (!cancelled && isInElement(trayRef.current, e.clientX, e.clientY)) {
            onSelect(null);
            updatePieces(ps => returnToTray(ps, id));
          } else {
            updatePieces(ps => settleGroup(ps, id));
          }
          return;
        }
        if (isTrayTap(phase, cancelled, Math.hypot(e.clientX - startX, e.clientY - startY))) {
          const anchor = screenToWorld({ x: viewport.width / 2, y: viewport.height / 2 }, layout.scale, camera);
          onSelect(id);
          updatePieces(ps => takeFromTray(ps, id, popSpotOnBoard(ps, layout.board, anchor), layout.board));
        }
      };

      const onUp = (e: globalThis.PointerEvent) => finish(e, false);
      const onCancel = (e: globalThis.PointerEvent) => finish(e, true);

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onCancel);
    },
    [
      canvasRef,
      trayRef,
      layout.scale,
      layout.board,
      viewport.width,
      viewport.height,
      camera,
      isPortrait,
      updatePieces,
      onSelect
    ]
  );

interface JigsawDrag {
  id: number;
  dx: number;
  dy: number;
  startX: number;
  startY: number;
  maxMove: number;
  wasSelected: boolean;
}

// Handles board canvas pointer events: loose piece drag, tap-to-rotate (first
// tap selects, subsequent tap rotates 36°), empty-board pan (or deselect on
// quick tap), two-finger touch pinch-to-zoom/pan, and right-click rotation.
export const useBoardPointers = (
  trayRef: RefObject<HTMLDivElement | null>,
  pieces: Piece[],
  selectedId: number | null,
  layout: ViewportLayout,
  viewport: BoardSize,
  camera: Camera,
  setCamera: (fn: (c: Camera) => Camera) => void,
  updatePieces: (fn: (ps: Piece[]) => Piece[]) => void,
  onSelect: (id: number | null) => void,
  onDropHighlight: (active: boolean) => void
) => {
  const gesture = useRef<BoardGesture<JigsawDrag>>(IDLE_GESTURE);
  const touches = useRef<Map<number, Point>>(new Map());

  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.currentTarget.setPointerCapture?.(e.pointerId);

    if (e.pointerType === 'touch') {
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.current.size === 2) {
        const prev = gesture.current;
        gesture.current = { mode: 'pinch', metrics: pairMetrics([...touches.current.values()] as [Point, Point]) };
        if (prev.mode === 'drag') {
          onDropHighlight(false);
          if (prev.maxMove > TAP_MAX_MOVE) updatePieces(ps => settleGroup(ps, prev.id));
        }
        return;
      }
      if (touches.current.size > 2) return;
    }

    const p = clientToBoard(e.currentTarget, e.clientX, e.clientY, layout.scale, camera);
    const i = pieceAt(pieces, p);
    if (i < 0) {
      gesture.current = startPanGesture(e.pointerId, e.clientX, e.clientY);
      return;
    }
    const piece = pieces[i];
    gesture.current = {
      mode: 'drag',
      id: piece.id,
      dx: p.x - piece.x,
      dy: p.y - piece.y,
      startX: e.clientX,
      startY: e.clientY,
      maxMove: 0,
      wasSelected: isGroupSelected(pieces, selectedId, piece.id)
    };
    onSelect(piece.id);
    updatePieces(ps => bringToFront(ps, i));
  };

  const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'touch' && touches.current.has(e.pointerId)) {
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    const g = gesture.current;
    if (g.mode === 'pinch') {
      if (touches.current.size !== 2) return;
      const { next, dx, dy, factor, focus } = stepPinch(g.metrics, [...touches.current.values()], e.currentTarget);
      gesture.current = { mode: 'pinch', metrics: next };
      setCamera(c => zoomCameraAt(panCamera(c, dx, dy, viewport), factor, focus, viewport));
      return;
    }
    if (g.mode === 'pan') {
      if (g.pointerId !== e.pointerId) return;
      const { next, dx, dy } = stepPanGesture(g, e.clientX, e.clientY);
      gesture.current = next;
      setCamera(c => panCamera(c, dx, dy, viewport));
      return;
    }
    if (g.mode !== 'drag') return;

    g.maxMove = Math.max(g.maxMove, Math.hypot(e.clientX - g.startX, e.clientY - g.startY));
    if (g.maxMove <= TAP_MAX_MOVE) return;
    onDropHighlight(isInElement(trayRef.current, e.clientX, e.clientY) && canReturnToTray(pieces, g.id));
    const p = clientToBoard(e.currentTarget, e.clientX, e.clientY, layout.scale, camera);
    updatePieces(ps => {
      const piece = ps.find(q => q.id === g.id);
      return piece ? moveGroup(ps, g.id, p.x - g.dx - piece.x, p.y - g.dy - piece.y, layout.board) : ps;
    });
  };

  const onPointerUp = (e: PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'touch') touches.current.delete(e.pointerId);

    const g = gesture.current;
    if (g.mode === 'pinch') {
      if (touches.current.size < 2) gesture.current = IDLE_GESTURE;
      return;
    }
    if (g.mode === 'pan') {
      if (g.pointerId !== e.pointerId) return;
      gesture.current = IDLE_GESTURE;
      if (g.maxMove <= TAP_MAX_MOVE) onSelect(null);
      return;
    }
    if (g.mode !== 'drag') return;

    gesture.current = IDLE_GESTURE;
    onDropHighlight(false);
    if (shouldTapRotate(g.wasSelected, g.maxMove)) {
      updatePieces(ps => rotateGroup(ps, g.id, e.shiftKey ? -1 : 1));
      return;
    }
    if (g.maxMove <= TAP_MAX_MOVE) return;
    if (isInElement(trayRef.current, e.clientX, e.clientY) && canReturnToTray(pieces, g.id)) {
      onSelect(null);
      updatePieces(ps => returnToTray(ps, g.id));
      return;
    }
    updatePieces(ps => settleGroup(ps, g.id));
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
