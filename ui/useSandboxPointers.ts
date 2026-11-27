// Pointer interaction hooks for Sandbox mode (spec 6 & 8), mirroring Jigsaw's
// tile mechanics: drag Kite/Dart from the tray and drop on a legal spot to
// lock, tap a tray tile to spawn it, drag loose tiles on the board, tap to
// rotate, drop back on the tray to discard, drag empty space to pan, and
// two-finger touch pinch-to-zoom/pan.
import { useCallback, useEffect, useRef, type MouseEvent, type PointerEvent, type RefObject } from 'react';
import {
  clampTileCenter,
  pointInTile,
  resolveSandboxTile,
  SANDBOX_WORLD,
  type BoardSize,
  type Point,
  type Tile,
  type TileType
} from '../rules';
import { panSandboxCamera, sandboxScreenToWorld, zoomSandboxCameraAt, type Camera } from '../camera';
import { isTrayTap, nextTrayPhase, TAP_MAX_MOVE, type TrayGesturePhase } from '../gestures';
import type { Preview } from './draw';
import {
  IDLE_GESTURE,
  isInElement,
  pairMetrics,
  startPanGesture,
  stepPanGesture,
  stepPinch,
  type BoardGesture
} from './pointerUtils';

const clientToWorld = (canvas: HTMLCanvasElement, clientX: number, clientY: number, camera: Camera): Point => {
  const rect = canvas.getBoundingClientRect();
  return sandboxScreenToWorld({ x: clientX - rect.left, y: clientY - rect.top }, camera);
};

interface SandboxRefs {
  tiles: Tile[];
  autoRotate: boolean;
  autoChoice: number;
  defaultRotation: number;
}

export const useSandboxTrayInteraction = (
  canvasRef: RefObject<HTMLCanvasElement | null>,
  trayRef: RefObject<HTMLDivElement | null>,
  viewport: BoardSize,
  camera: Camera,
  isPortrait: boolean,
  state: SandboxRefs,
  onSetLoose: (tile: Tile | null) => void,
  onSpawnTap: (type: TileType, at: Point) => void,
  onPlace: (tile: Tile) => void,
  onDropHighlight: (active: boolean) => void
) => {
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  return useCallback(
    (type: TileType, startEvent: PointerEvent<HTMLButtonElement>) => {
      if (startEvent.button !== 0) return;
      const startX = startEvent.clientX,
        startY = startEvent.clientY;
      const isTouch = startEvent.pointerType === 'touch';
      let phase: TrayGesturePhase = 'pending';
      let latest: Tile | null = null;

      const onMove = (e: globalThis.PointerEvent) => {
        const canvas = canvasRef.current;
        if (!canvas || phase === 'scrolling') return;
        phase = nextTrayPhase(phase, isTouch, isPortrait, e.clientX - startX, e.clientY - startY);
        if (phase !== 'lifted') return;
        onDropHighlight(isInElement(trayRef.current, e.clientX, e.clientY));
        const pt = clampTileCenter(clientToWorld(canvas, e.clientX, e.clientY, camera));
        latest = { type, x: pt.x, y: pt.y, rotation: stateRef.current.defaultRotation };
        onSetLoose(latest);
      };

      const finish = (e: globalThis.PointerEvent, cancelled: boolean) => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onCancel);
        onDropHighlight(false);
        if (phase === 'lifted' && latest) {
          if (!cancelled && isInElement(trayRef.current, e.clientX, e.clientY)) {
            onSetLoose(null);
            return;
          }
          if (!cancelled) {
            const cur = stateRef.current;
            const resolved = resolveSandboxTile(cur.tiles, latest, cur.autoRotate, cur.autoChoice, SANDBOX_WORLD);
            if (resolved.valid) {
              onPlace(resolved.tile);
              return;
            }
          }
          onSetLoose(latest);
          return;
        }
        if (isTrayTap(phase, cancelled, Math.hypot(e.clientX - startX, e.clientY - startY))) {
          const center = clampTileCenter(
            sandboxScreenToWorld({ x: viewport.width / 2, y: viewport.height / 2 }, camera)
          );
          onSpawnTap(type, center);
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
      viewport.width,
      viewport.height,
      camera,
      isPortrait,
      onSetLoose,
      onSpawnTap,
      onPlace,
      onDropHighlight
    ]
  );
};

interface SandboxDrag {
  dx: number;
  dy: number;
  startX: number;
  startY: number;
  maxMove: number;
  latest: Tile;
}

export const useSandboxBoardPointers = (
  trayRef: RefObject<HTMLDivElement | null>,
  tiles: Tile[],
  loose: Tile | null,
  preview: Preview | null,
  autoRotate: boolean,
  autoChoice: number,
  viewport: BoardSize,
  camera: Camera,
  setCamera: (fn: (c: Camera) => Camera) => void,
  onSetLoose: (tile: Tile | null) => void,
  onPlace: (tile: Tile) => void,
  onRotate: (steps: number) => void,
  onDropHighlight: (active: boolean) => void
) => {
  const gesture = useRef<BoardGesture<SandboxDrag>>(IDLE_GESTURE);
  const touches = useRef<Map<number, Point>>(new Map());

  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.currentTarget.setPointerCapture?.(e.pointerId);

    if (e.pointerType === 'touch') {
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.current.size === 2) {
        gesture.current = { mode: 'pinch', metrics: pairMetrics([...touches.current.values()] as [Point, Point]) };
        onDropHighlight(false);
        return;
      }
      if (touches.current.size > 2) return;
    }

    const p = clientToWorld(e.currentTarget, e.clientX, e.clientY, camera);
    if (loose && preview && pointInTile(p, preview.tile)) {
      gesture.current = {
        mode: 'drag',
        dx: p.x - preview.tile.x,
        dy: p.y - preview.tile.y,
        startX: e.clientX,
        startY: e.clientY,
        maxMove: 0,
        latest: { ...loose, x: preview.tile.x, y: preview.tile.y }
      };
      return;
    }
    gesture.current = startPanGesture(e.pointerId, e.clientX, e.clientY);
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
      setCamera(c => zoomSandboxCameraAt(panSandboxCamera(c, dx, dy, viewport), factor, focus, viewport));
      return;
    }
    if (g.mode === 'pan') {
      if (g.pointerId !== e.pointerId) return;
      const { next, dx, dy } = stepPanGesture(g, e.clientX, e.clientY);
      gesture.current = next;
      setCamera(c => panSandboxCamera(c, dx, dy, viewport));
      return;
    }
    if (g.mode !== 'drag') return;

    g.maxMove = Math.max(g.maxMove, Math.hypot(e.clientX - g.startX, e.clientY - g.startY));
    if (g.maxMove <= TAP_MAX_MOVE) return;
    onDropHighlight(isInElement(trayRef.current, e.clientX, e.clientY));
    const p = clientToWorld(e.currentTarget, e.clientX, e.clientY, camera);
    const pos = clampTileCenter({ x: p.x - g.dx, y: p.y - g.dy });
    g.latest = { ...g.latest, x: pos.x, y: pos.y };
    onSetLoose(g.latest);
  };

  const onPointerUp = (e: PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'touch') touches.current.delete(e.pointerId);

    const g = gesture.current;
    if (g.mode === 'pinch') {
      if (touches.current.size < 2) gesture.current = IDLE_GESTURE;
      return;
    }
    if (g.mode === 'pan') {
      if (g.pointerId === e.pointerId) gesture.current = IDLE_GESTURE;
      return;
    }
    if (g.mode !== 'drag') return;

    gesture.current = IDLE_GESTURE;
    onDropHighlight(false);
    if (g.maxMove <= TAP_MAX_MOVE) {
      onRotate(e.shiftKey ? -1 : 1);
      return;
    }
    if (isInElement(trayRef.current, e.clientX, e.clientY)) {
      onSetLoose(null);
      return;
    }
    const resolved = resolveSandboxTile(tiles, g.latest, autoRotate, autoChoice, SANDBOX_WORLD);
    if (resolved.valid) onPlace(resolved.tile);
  };

  const onContextMenu = (e: MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (loose) onRotate(e.shiftKey ? -1 : 1);
  };

  return { onPointerDown, onPointerMove, onPointerUp, onContextMenu };
};
