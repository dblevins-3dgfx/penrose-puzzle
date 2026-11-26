// Floating board zoom & fit pill in the bottom-left corner of the jigsaw (spec 9).
import { ZoomIn, ZoomOut } from 'lucide-react';
import { isCameraAtFit, MAX_ZOOM, MIN_ZOOM, type Camera } from '../jigsaw';

interface Props {
  camera: Camera;
  isPortrait: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  minZoom?: number;
  isDefault?: boolean;
  resetLabel?: string;
}

const btn =
  'p-2.5 sm:p-1.5 rounded hover:bg-slate-700/80 active:bg-slate-600/80 disabled:opacity-40 disabled:hover:bg-transparent text-white';

export const ZoomControls = ({
  camera,
  isPortrait,
  onZoomIn,
  onZoomOut,
  onReset,
  minZoom = MIN_ZOOM,
  isDefault,
  resetLabel = 'Fit'
}: Props) => {
  const atDefault = isDefault ?? isCameraAtFit(camera);
  const pct = Math.round(camera.zoom * 100);

  return (
    <div
      style={{
        left: 'max(0.625rem, env(safe-area-inset-left))',
        bottom: isPortrait ? '0.625rem' : 'max(0.625rem, env(safe-area-inset-bottom))'
      }}
      className="absolute z-10 flex items-center gap-0.5 bg-slate-900/80 backdrop-blur-sm border border-slate-700/70 rounded-lg p-1 shadow-lg"
      role="group"
      aria-label="Board zoom"
    >
      <button
        type="button"
        onClick={onZoomOut}
        disabled={camera.zoom <= minZoom + 1e-3}
        aria-label="Zoom out"
        title="Zoom out (-)"
        className={btn}
      >
        <ZoomOut size={16} />
      </button>

      <button
        type="button"
        onClick={onReset}
        disabled={atDefault}
        aria-label={resetLabel === 'Fit' ? 'Fit to screen' : 'Reset view'}
        title={resetLabel === 'Fit' ? 'Fit to screen (0)' : 'Reset view (0)'}
        className="px-2 py-2 sm:py-1 rounded text-xs font-semibold text-white hover:bg-slate-700/80 active:bg-slate-600/80 disabled:text-slate-400 disabled:hover:bg-transparent min-w-12 text-center"
      >
        {atDefault ? resetLabel : `${pct}%`}
      </button>

      <button
        type="button"
        onClick={onZoomIn}
        disabled={camera.zoom >= MAX_ZOOM - 1e-3}
        aria-label="Zoom in"
        title="Zoom in (+)"
        className={btn}
      >
        <ZoomIn size={16} />
      </button>
    </div>
  );
};
