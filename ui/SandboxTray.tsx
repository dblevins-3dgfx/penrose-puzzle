// Kite & Dart dispenser tray for Sandbox mode (spec 6 & 8): mirrors
// JigsawTray's layout (right sidebar in landscape, bottom strip in portrait,
// safe-area aware). Drag a tile directly onto the board or tap to spawn one;
// drop an unplaced loose tile back onto the tray to put it away.
import { memo, useEffect, useRef, type PointerEvent, type RefObject } from 'react';
import type { TileType } from '../rules';
import { drawSandboxTileThumb } from './draw';

interface Props {
  trayRef: RefObject<HTMLDivElement | null>;
  activeType: TileType | null;
  vertexDots: boolean;
  matchingArcs: boolean;
  isPortrait: boolean;
  dropHighlight: boolean;
  onStartFromTray: (type: TileType, e: PointerEvent<HTMLButtonElement>) => void;
}

const THUMB_SIZE = 56;
const LABELS: Record<TileType, string> = { kite: 'Kite', dart: 'Dart' };

const TileCard = memo(
  ({
    type,
    active,
    vertexDots,
    matchingArcs,
    isPortrait,
    onStart
  }: {
    type: TileType;
    active: boolean;
    vertexDots: boolean;
    matchingArcs: boolean;
    isPortrait: boolean;
    onStart: (type: TileType, e: PointerEvent<HTMLButtonElement>) => void;
  }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;
      const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      const px = Math.round(THUMB_SIZE * dpr);
      if (canvas.width !== px || canvas.height !== px) {
        canvas.width = px;
        canvas.height = px;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawSandboxTileThumb(ctx, type, THUMB_SIZE, { vertexDots, matchingArcs });
    }, [type, vertexDots, matchingArcs]);

    return (
      <button
        type="button"
        onPointerDown={e => onStart(type, e)}
        aria-label={LABELS[type]}
        style={{ touchAction: isPortrait ? 'pan-x' : 'pan-y' }}
        className={`shrink-0 rounded-lg bg-slate-100 hover:bg-white shadow-sm flex items-center justify-center gap-1.5 cursor-grab active:cursor-grabbing select-none ${
          isPortrait ? 'px-3 py-1.5 flex-row' : 'w-20 py-2 flex-col'
        } ${active ? 'ring-2 ring-sky-400' : 'hover:ring-2 hover:ring-sky-400/70'}`}
      >
        <canvas ref={canvasRef} style={{ width: THUMB_SIZE, height: THUMB_SIZE }} className="pointer-events-none" />
        <span className="text-xs font-bold text-slate-800">{LABELS[type]}</span>
      </button>
    );
  }
);

export const SandboxTray = ({
  trayRef,
  activeType,
  vertexDots,
  matchingArcs,
  isPortrait,
  dropHighlight,
  onStartFromTray
}: Props) => {
  const containerClass = isPortrait
    ? 'shrink-0 border-t border-slate-700/70 flex flex-col'
    : 'w-[calc(7rem+env(safe-area-inset-right))] lg:w-[calc(7.5rem+env(safe-area-inset-right))] shrink-0 border-l border-slate-700/70 flex flex-col';

  const containerStyle = isPortrait
    ? {
        paddingBottom: 'env(safe-area-inset-bottom)',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)'
      }
    : {
        paddingRight: 'env(safe-area-inset-right)',
        paddingBottom: 'env(safe-area-inset-bottom)'
      };

  const listClass = isPortrait
    ? 'h-[76px] flex flex-row items-center justify-center gap-3 px-3 py-1 overscroll-contain'
    : 'flex-1 min-h-0 flex flex-col items-center justify-center gap-3 p-2 overscroll-contain';

  return (
    <aside
      ref={trayRef}
      aria-label="Tile tray"
      style={containerStyle}
      className={`${containerClass} ${
        dropHighlight ? 'bg-slate-800 ring-2 ring-inset ring-sky-400' : 'bg-slate-800/90'
      }`}
    >
      <div className="px-2 py-1 border-b border-slate-700/60 text-center shrink-0">
        <span className={`text-xs font-semibold ${dropHighlight ? 'text-sky-300' : 'text-slate-300'}`}>
          {dropHighlight ? 'Drop to put away' : 'Drag or tap tile'}
        </span>
      </div>

      <div className={listClass} style={{ touchAction: isPortrait ? 'pan-x' : 'pan-y' }}>
        {(['kite', 'dart'] as const).map(type => (
          <TileCard
            key={type}
            type={type}
            active={activeType === type}
            vertexDots={vertexDots}
            matchingArcs={matchingArcs}
            isPortrait={isPortrait}
            onStart={onStartFromTray}
          />
        ))}
      </div>
    </aside>
  );
};
