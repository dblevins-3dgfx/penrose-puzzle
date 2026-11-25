// Floating board zoom & fit pill in the bottom-left corner of the jigsaw (spec 9).
import { ZoomIn, ZoomOut } from 'lucide-react';
import { MAX_ZOOM, MIN_ZOOM, type Camera } from '../jigsaw';

interface Props {
  camera: Camera;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
}

const btn = 'p-1.5 rounded hover:bg-slate-700/80 disabled:opacity-40 disabled:hover:bg-transparent text-white';

export const ZoomControls = ({ camera, onZoomIn, onZoomOut, onReset }: Props) => {
  const isDefault = Math.abs(camera.zoom - 1) < 1e-3 && Math.abs(camera.panX) < 0.5 && Math.abs(camera.panY) < 0.5;
  const pct = Math.round(camera.zoom * 100);

  return (
    <div
      className="absolute bottom-2.5 left-2.5 z-10 flex items-center gap-0.5 bg-slate-900/80 backdrop-blur-sm border border-slate-700/70 rounded-lg p-1 shadow-lg"
      role="group"
      aria-label="Board zoom"
    >
      <button
        type="button"
        onClick={onZoomOut}
        disabled={camera.zoom <= MIN_ZOOM + 1e-3}
        aria-label="Zoom out"
        title="Zoom out (-)"
        className={btn}
      >
        <ZoomOut size={16} />
      </button>

      <button
        type="button"
        onClick={onReset}
        disabled={isDefault}
        aria-label="Fit to screen"
        title="Fit to screen (0)"
        className="px-2 py-1 rounded text-xs font-semibold text-white hover:bg-slate-700/80 disabled:text-slate-400 disabled:hover:bg-transparent min-w-12 text-center"
      >
        {isDefault ? 'Fit' : `${pct}%`}
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
