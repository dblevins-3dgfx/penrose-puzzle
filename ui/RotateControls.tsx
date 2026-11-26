// Floating rotate pill in the bottom-right corner of the jigsaw board (spec 9),
// mirroring the bottom-left zoom pill so rotate buttons stay far away from
// top-bar controls and easy to reach on touch, trackpad, and mouse.
import { RotateCw } from 'lucide-react';

interface Props {
  isPortrait: boolean;
  onRotate: (steps: number) => void;
}

const btn = 'p-2.5 sm:p-2 rounded hover:bg-slate-700/80 active:bg-slate-600/80 text-white';

export const RotateControls = ({ isPortrait, onRotate }: Props) => (
  <div
    style={{
      right: isPortrait ? 'max(0.625rem, env(safe-area-inset-right))' : '0.625rem',
      bottom: isPortrait ? '0.625rem' : 'max(0.625rem, env(safe-area-inset-bottom))'
    }}
    className="absolute z-10 flex items-center gap-1 bg-slate-900/80 backdrop-blur-sm border border-slate-700/70 rounded-lg p-1 shadow-lg"
    role="group"
    aria-label="Rotate selected piece"
  >
    <button
      type="button"
      onClick={() => onRotate(-1)}
      aria-label="Rotate piece counter-clockwise"
      title="Rotate counter-clockwise (Shift+R or ←)"
      className={btn}
    >
      <RotateCw size={18} style={{ transform: 'scaleX(-1)' }} />
    </button>

    <button
      type="button"
      onClick={() => onRotate(1)}
      aria-label="Rotate piece clockwise"
      title="Rotate clockwise (R or →)"
      className={btn}
    >
      <RotateCw size={18} />
    </button>
  </div>
);
