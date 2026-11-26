// Pointer interaction hooks for Sandbox mode (spec 6 & 8), mirroring Jigsaw's
// tile mechanics: drag Kite/Dart from the tray and drop on a legal spot to
// lock, tap a tray tile to spawn it, drag loose tiles on the board, tap to
// rotate, drop back on the tray to discard, drag empty space to pan, and
// two-finger touch pinch-to-zoom/pan.
import { useCallback, useEffect, useRef, type MouseEvent, type PointerEvent, type RefObject } from 'react';
import {
  clampTileCenter,
  panSandboxCamera,
  resolveSandboxTile,
  SANDBOX_WORLD,
  sandboxScreenToWorld,
  zoomSandboxCameraAt,
  type BoardSize,
  type Point,
  type SandboxCamera,
  type Tile,
  type TileType
} from '../rules';
import { isTrayTap, pointInTile, TAP_MAX_MOVE, trayDragAction } from '../jigsaw';
import type { Preview } from './draw';

const clientToWorld = (canvas: HTMLCanvasElement, clientX: number, clientY: number, camera: SandboxCamera): Point => {
  const rect = canvas.getBoundingClientRect();
  return sandboxScreenToWorld({ x: clientX - rect.left, y: clientY - rect.top }, camera);
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
  camera: SandboxCamera,
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
      const startX = startEvent.clientX, startY = startEvent.clientY;
      const isTouch = startEvent.pointerType === 'touch';
      let lifted = false, scrolled = false;
      let latest: Tile | null = null;

      const onMove = (e: globalThis.PointerEvent) => {
        const canvas = canvasRef.current;
        if (!canvas || scrolled) return;
        const dx = e.clientX - startX, dy = e.clientY - startY;
        if (!lifted) {
          const action = trayDragAction(isTouch, isPortrait, dx, dy);
          if (action === 'scroll') { scrolled = true; return; }
          if (action === 'wait') return;
          lifted = true;
        }
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
        if (lifted && latest) {
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
        if (isTrayTap(lifted, scrolled, cancelled, Math.hypot(e.clientX - startX, e.clientY - startY))) {
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
    [canvasRef, trayRef, viewport.width, viewport.height, camera, isPortrait, onSetLoose, onSpawnTap, onPlace, onDropHighlight]
  );
};

export const useSandboxBoardPointers = (
  trayRef: RefObject<HTMLDivElement | null>,
  tiles: Tile[],
  loose: Tile | null,
  preview: Preview | null,
  autoRotate: boolean,
  autoChoice: number,
  viewport: BoardSize,
  camera: SandboxCamera,
  setCamera: (fn: (c: SandboxCamera) => SandboxCamera) => void,
  onSetLoose: (tile: Tile | null) => void,
  onPlace: (tile: Tile) => void,
  onRotate: (steps: number) => void,
  onDropHighlight: (active: boolean) => void
) => {
  const drag = useRef<{
    dx: number;
    dy: number;
    startX: number;
    startY: number;
    maxMove: number;
    latest: Tile;
  } | null>(null);
  const pan = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const touches = useRef<Map<number, Point>>(new Map());
  const pinch = useRef<{ dist: number; mid: Point } | null>(null);

  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.currentTarget.setPointerCapture?.(e.pointerId);

    if (e.pointerType === 'touch') {
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.current.size === 2) {
        drag.current = null;
        onDropHighlight(false);
        pan.current = null;
        pinch.current = pairMetrics([...touches.current.values()] as [Point, Point]);
        return;
      }
      if (touches.current.size > 2) return;
    }

    const p = clientToWorld(e.currentTarget, e.clientX, e.clientY, camera);
    if (loose && preview && pointInTile(p, preview.tile)) {
      drag.current = {
        dx: p.x - preview.tile.x,
        dy: p.y - preview.tile.y,
        startX: e.clientX,
        startY: e.clientY,
        maxMove: 0,
        latest: { ...loose, x: preview.tile.x, y: preview.tile.y }
      };
      return;
    }
    pan.current = { pointerId: e.pointerId, x: e.clientX, y: e.clientY };
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
        setCamera(c => zoomSandboxCameraAt(panSandboxCamera(c, dx, dy, viewport), factor, focus, viewport));
        return;
      }
    }

    if (pan.current && pan.current.pointerId === e.pointerId) {
      const dx = e.clientX - pan.current.x, dy = e.clientY - pan.current.y;
      pan.current = { ...pan.current, x: e.clientX, y: e.clientY };
      setCamera(c => panSandboxCamera(c, dx, dy, viewport));
      return;
    }

    const d = drag.current;
    if (!d) return;
    d.maxMove = Math.max(d.maxMove, Math.hypot(e.clientX - d.startX, e.clientY - d.startY));
    if (d.maxMove <= TAP_MAX_MOVE) return;
    onDropHighlight(isInElement(trayRef.current, e.clientX, e.clientY));
    const p = clientToWorld(e.currentTarget, e.clientX, e.clientY, camera);
    const pos = clampTileCenter({ x: p.x - d.dx, y: p.y - d.dy });
    d.latest = { ...d.latest, x: pos.x, y: pos.y };
    onSetLoose(d.latest);
  };

  const onPointerUp = (e: PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'touch') {
      touches.current.delete(e.pointerId);
      if (touches.current.size < 2) pinch.current = null;
    }
    if (pan.current && pan.current.pointerId === e.pointerId) pan.current = null;

    const d = drag.current;
    if (!d) return;
    drag.current = null;
    onDropHighlight(false);
    if (d.maxMove <= TAP_MAX_MOVE) {
      onRotate(e.shiftKey ? -1 : 1);
      return;
    }
    if (isInElement(trayRef.current, e.clientX, e.clientY)) {
      onSetLoose(null);
      return;
    }
    const resolved = resolveSandboxTile(tiles, d.latest, autoRotate, autoChoice, SANDBOX_WORLD);
    if (resolved.valid) onPlace(resolved.tile);
  };

  const onContextMenu = (e: MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (loose) onRotate(e.shiftKey ? -1 : 1);
  };

  return { onPointerDown, onPointerMove, onPointerUp, onContextMenu };
};
