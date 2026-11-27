// The free-building Sandbox screen (spec 4–8), sharing Jigsaw's tile
// manipulation mechanics: drag or tap Kite/Dart tiles from the tray, drop on a
// legal edge to lock with visual/audio feedback, tap to rotate or use floating
// bottom-right controls, and pan/zoom across the generous 1600x1200 world.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  countTiles,
  isLegalPlacement,
  removeLastTile,
  resolveSandboxTile,
  rotateBy,
  SANDBOX_WORLD,
  type Point,
  type Tile,
  type TileType
} from '../rules';
import {
  clampSandboxCamera,
  defaultSandboxCamera,
  isSandboxCameraDefault,
  SANDBOX_MAX_ZOOM,
  sandboxMinZoom,
  ZOOM_STEP,
  zoomSandboxCameraAt,
  type Camera
} from '../camera';
import type { SharedSettings } from '../settings';
import { formatDebugInfo } from '../debugInfo';
import { collectDebugEnvironment } from './collectDebugEnv';
import { HelpOverlay } from './HelpOverlay';
import { RotateControls } from './RotateControls';
import { SandboxSettingsDialog } from './SandboxSettingsDialog';
import { SandboxTray } from './SandboxTray';
import { Toolbar } from './Toolbar';
import { ZoomControls } from './ZoomControls';
import { useBoardSize, useIsPortrait, usePreventSafariGesture } from './useBoardSize';
import { useKeyboardControls, useWheelRotation, useZoomKeys } from './useControls';
import { useSandboxRenderAndEffects } from './useSandboxEffects';
import { useSandboxBoardPointers, useSandboxTrayInteraction } from './useSandboxPointers';

const isTouchDevice = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;

const useSandboxCamera = (viewport: { width: number; height: number }, measured: boolean) => {
  const [camera, setCamera] = useState<Camera>(() => defaultSandboxCamera(viewport));
  const initialized = useRef(false);

  useEffect(() => {
    if (!measured) return;
    if (!initialized.current) {
      initialized.current = true;
      setCamera(defaultSandboxCamera(viewport));
      return;
    }
    setCamera(c => clampSandboxCamera(c, viewport));
  }, [measured, viewport]);

  const zoomAt = useCallback(
    (factor: number, focus: Point) => setCamera(c => zoomSandboxCameraAt(c, factor, focus, viewport)),
    [viewport]
  );
  const zoomIn = useCallback(
    () => zoomAt(ZOOM_STEP, { x: viewport.width / 2, y: viewport.height / 2 }),
    [zoomAt, viewport.width, viewport.height]
  );
  const zoomOut = useCallback(
    () => zoomAt(1 / ZOOM_STEP, { x: viewport.width / 2, y: viewport.height / 2 }),
    [zoomAt, viewport.width, viewport.height]
  );
  const resetZoom = useCallback(() => setCamera(defaultSandboxCamera(viewport)), [viewport]);

  return { camera, setCamera, zoomAt, zoomIn, zoomOut, resetZoom };
};

const useLooseTileKeys = (
  enabled: boolean,
  canConfirm: boolean,
  onConfirm: () => void,
  onDiscard: () => void
) => {
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onDiscard();
      } else if ((e.key === 'Enter' || e.key === ' ') && canConfirm) {
        e.preventDefault();
        onConfirm();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled, canConfirm, onConfirm, onDiscard]);
};

const buildSandboxDebugInfo = (
  counts: { kite: number; dart: number },
  autoRotate: boolean,
  hasLooseTile: boolean,
  settings: SharedSettings,
  camera: Camera,
  viewport: { width: number; height: number },
  isPortrait: boolean,
  dpr: number
): string =>
  formatDebugInfo({
    mode: 'sandbox',
    env: collectDebugEnvironment(viewport, isPortrait, dpr),
    settings,
    camera,
    kites: counts.kite,
    darts: counts.dart,
    autoRotate,
    hasLooseTile
  });

interface SandboxProps {
  modeSwitch: ReactNode;
  active: boolean;
  settings: SharedSettings;
  onChangeSettings: (patch: Partial<SharedSettings>) => void;
}

export const Sandbox = ({ modeSwitch, active, settings, onChangeSettings: setSettings }: SandboxProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const trayRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isPortrait = useIsPortrait();
  const { width: vpWidth, height: vpHeight, dpr, measured } = useBoardSize(containerRef);
  const viewport = useMemo(() => ({ width: vpWidth, height: vpHeight }), [vpWidth, vpHeight]);

  const { camera, setCamera, zoomAt, zoomIn, zoomOut, resetZoom } = useSandboxCamera(viewport, measured);

  const [tiles, setTiles] = useState<Tile[]>([]);
  const [loose, setLoose] = useState<Tile | null>(null);
  const [defaultRotation, setDefaultRotation] = useState(0);
  const [autoRotate, setAutoRotate] = useState(false);
  const [autoChoice, setAutoChoice] = useState(0);
  const [dropHighlight, setDropHighlight] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const counts = useMemo(() => countTiles(tiles), [tiles]);
  const preview = useMemo(
    () => (loose ? resolveSandboxTile(tiles, loose, autoRotate, autoChoice, SANDBOX_WORLD) : null),
    [loose, tiles, autoRotate, autoChoice]
  );

  const place = useCallback(
    (tile: Tile) => {
      setTiles(prev => (isLegalPlacement(prev, tile, false, SANDBOX_WORLD) ? [...prev, tile] : prev));
      setLoose(null);
      setDefaultRotation(tile.rotation);
      setAutoChoice(0);
    },
    []
  );

  const confirmLoose = useCallback(() => {
    if (preview?.valid) place(preview.tile);
  }, [preview, place]);

  const discardLoose = useCallback(() => setLoose(null), []);

  const rotate = useCallback(
    (steps: number) => {
      if (!loose) return;
      if (autoRotate) {
        setAutoChoice(c => c + steps);
        return;
      }
      setLoose(prev => (prev ? { ...prev, rotation: rotateBy(prev.rotation, steps) } : null));
    },
    [loose, autoRotate]
  );

  const spawnTap = useCallback(
    (type: TileType, at: Point) => {
      setAutoChoice(0);
      setLoose(prev => (prev ? { ...prev, type } : { type, x: at.x, y: at.y, rotation: defaultRotation }));
    },
    [defaultRotation]
  );

  const undo = useCallback(() => setTiles(removeLastTile), []);
  const clearBoard = useCallback(() => {
    setTiles([]);
    setLoose(null);
    setDefaultRotation(0);
    setAutoChoice(0);
  }, []);
  const toggleAutoRotate = useCallback(() => {
    setAutoRotate(a => !a);
    setAutoChoice(0);
  }, []);
  const closeHelp = useCallback(() => setShowHelp(false), []);
  const closeSettings = useCallback(() => setShowSettings(false), []);

  useLooseTileKeys(active && !!loose && !showHelp && !showSettings, !!preview?.valid, confirmLoose, discardLoose);
  useKeyboardControls(rotate, undo, active);
  useZoomKeys(zoomIn, zoomOut, resetZoom, active);
  useWheelRotation(canvasRef, rotate, zoomAt);
  usePreventSafariGesture(canvasRef);

  const trayState = useMemo(
    () => ({ tiles, autoRotate, autoChoice, defaultRotation }),
    [tiles, autoRotate, autoChoice, defaultRotation]
  );
  const handleStartFromTray = useSandboxTrayInteraction(
    canvasRef, trayRef, viewport, camera, isPortrait, trayState, setLoose, spawnTap, place, setDropHighlight
  );
  const boardHandlers = useSandboxBoardPointers(
    trayRef, tiles, loose, preview, autoRotate, autoChoice, viewport, camera, setCamera, setLoose, place, rotate, setDropHighlight
  );

  useSandboxRenderAndEffects(
    canvasRef, tiles, preview, vpWidth, vpHeight, dpr, camera, settings.effects, settings.sound
  );

  return (
    <div className="w-full h-dvh overflow-hidden bg-slate-900 flex flex-col game-shell">
      <Toolbar
        modeSwitch={modeSwitch}
        autoRotate={autoRotate}
        onToggleAutoRotate={toggleAutoRotate}
        boardEmpty={tiles.length === 0}
        onUndo={undo}
        onClear={clearBoard}
        kiteCount={counts.kite}
        dartCount={counts.dart}
        onOpenSettings={() => setShowSettings(true)}
        onOpenHelp={() => setShowHelp(true)}
      />

      <div className={`flex-1 min-h-0 flex ${isPortrait ? 'flex-col' : 'flex-row'}`}>
        <div ref={containerRef} className="flex-1 min-h-0 min-w-0 relative overflow-hidden bg-slate-200">
          <canvas
            ref={canvasRef}
            onPointerDown={boardHandlers.onPointerDown}
            onPointerMove={boardHandlers.onPointerMove}
            onPointerUp={boardHandlers.onPointerUp}
            onPointerCancel={boardHandlers.onPointerUp}
            onContextMenu={boardHandlers.onContextMenu}
            style={{ touchAction: 'none' }}
            className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing"
          />
          <ZoomControls
            camera={camera}
            isPortrait={isPortrait}
            minZoom={sandboxMinZoom(viewport)}
            maxZoom={SANDBOX_MAX_ZOOM}
            isDefault={isSandboxCameraDefault(camera, viewport)}
            resetLabel="100%"
            onZoomIn={zoomIn}
            onZoomOut={zoomOut}
            onReset={resetZoom}
          />
          {loose && (
            <RotateControls isPortrait={isPortrait} onRotate={rotate} onConfirm={confirmLoose} canConfirm={!!preview?.valid} onDiscard={discardLoose} />
          )}
        </div>

        <SandboxTray trayRef={trayRef} activeType={loose?.type ?? null} isPortrait={isPortrait} dropHighlight={dropHighlight} onStartFromTray={handleStartFromTray} />
      </div>

      {showSettings && (
        <SandboxSettingsDialog
          settings={settings}
          onChange={setSettings}
          getDebugInfo={() => buildSandboxDebugInfo(counts, autoRotate, loose !== null, settings, camera, viewport, isPortrait, dpr)}
          onClose={closeSettings}
        />
      )}

      {showHelp && <HelpOverlay isTouchDevice={isTouchDevice} onClose={closeHelp} />}
    </div>
  );
};
