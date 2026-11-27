// Pointer interaction hooks for the jigsaw board and piece tray (spec 9):
// piece dragging, background panning, two-finger pinch-to-zoom/pan, tray
// drag-out and tap-to-pop, and dropping single loose pieces back into the tray.
import { useCallback, useRef, type MouseEvent, type PointerEvent, type RefObject } from 'react';
import type { BoardSize, Point } from '../rules';
import { panCamera, screenToWorld, zoomCameraAt, type Camera } from '../camera';
import { isTrayTap, TAP_MAX_MOVE, trayDragAction } from '../gestures';
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
import { isInElement, pairMetrics, stepPinch, type PinchMetrics } from './pointerUtils';

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
      let lifted = false,
        scrolled = false;

      const onMove = (e: globalThis.PointerEvent) => {
        const canvas = canvasRef.current;
        if (!canvas || scrolled) return;
        const dx = e.clientX - startX,
          dy = e.clientY - startY;
        if (!lifted) {
          const action = trayDragAction(isTouch, isPortrait, dx, dy);
          if (action === 'scroll') {
            scrolled = true;
            return;
          }
          if (action === 'wait') return;
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

      const finish = (e: globalThis.PointerEvent, cancelled: boolean) => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onCancel);
        if (lifted) {
          if (!cancelled && isInElement(trayRef.current, e.clientX, e.clientY)) {
            onSelect(null);
            updatePieces(ps => returnToTray(ps, id));
          } else {
            updatePieces(ps => settleGroup(ps, id));
          }
          return;
        }
        if (isTrayTap(lifted, scrolled, cancelled, Math.hypot(e.clientX - startX, e.clientY - startY))) {
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
  const drag = useRef<{
    id: number;
    dx: number;
    dy: number;
    startX: number;
    startY: number;
    maxMove: number;
    wasSelected: boolean;
  } | null>(null);
  const pan = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    x: number;
    y: number;
    maxMove: number;
  } | null>(null);
  const touches = useRef<Map<number, Point>>(new Map());
  const pinch = useRef<PinchMetrics | null>(null);

  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.currentTarget.setPointerCapture?.(e.pointerId);

    if (e.pointerType === 'touch') {
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.current.size === 2) {
        if (drag.current) {
          const { id, maxMove } = drag.current;
          drag.current = null;
          onDropHighlight(false);
          if (maxMove > TAP_MAX_MOVE) updatePieces(ps => settleGroup(ps, id));
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
      pan.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        x: e.clientX,
        y: e.clientY,
        maxMove: 0
      };
      return;
    }
    const piece = pieces[i];
    drag.current = {
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
      if (touches.current.size === 2 && pinch.current) {
        const { next, dx, dy, factor, focus } = stepPinch(
          pinch.current,
          [...touches.current.values()],
          e.currentTarget
        );
        pinch.current = next;
        setCamera(c => zoomCameraAt(panCamera(c, dx, dy, viewport), factor, focus, viewport));
        return;
      }
    }

    if (pan.current && pan.current.pointerId === e.pointerId) {
      const dx = e.clientX - pan.current.x,
        dy = e.clientY - pan.current.y;
      const moved = Math.hypot(e.clientX - pan.current.startX, e.clientY - pan.current.startY);
      pan.current = { ...pan.current, x: e.clientX, y: e.clientY, maxMove: Math.max(pan.current.maxMove, moved) };
      setCamera(c => panCamera(c, dx, dy, viewport));
      return;
    }

    const d = drag.current;
    if (!d) return;
    d.maxMove = Math.max(d.maxMove, Math.hypot(e.clientX - d.startX, e.clientY - d.startY));
    if (d.maxMove <= TAP_MAX_MOVE) return;
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
      const tappedEmpty = pan.current.maxMove <= TAP_MAX_MOVE;
      pan.current = null;
      if (tappedEmpty) onSelect(null);
    }
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    onDropHighlight(false);
    if (shouldTapRotate(d.wasSelected, d.maxMove)) {
      updatePieces(ps => rotateGroup(ps, d.id, e.shiftKey ? -1 : 1));
      return;
    }
    if (d.maxMove <= TAP_MAX_MOVE) return;
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
