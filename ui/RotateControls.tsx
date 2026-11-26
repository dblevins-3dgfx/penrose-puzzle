// Floating rotate pill in the bottom-right corner of the board (spec 8 & 9),
// mirroring the bottom-left zoom pill so rotate (and optional Sandbox place /
// discard) buttons stay far from top-bar controls and easy to reach by thumb.
import { Check, RotateCw, X } from 'lucide-react';

interface Props {
  isPortrait: boolean;
  onRotate: (steps: number) => void;
  onConfirm?: () => void;
  canConfirm?: boolean;
  onDiscard?: () => void;
}

const btn = 'p-2.5 sm:p-2 rounded hover:bg-slate-700/80 active:bg-slate-600/80 text-white';

export const RotateControls = ({ isPortrait, onRotate, onConfirm, canConfirm = false, onDiscard }: Props) => (
  <div
    style={{
      right: isPortrait ? 'max(0.625rem, env(safe-area-inset-right))' : '0.625rem',
      bottom: isPortrait ? '0.625rem' : 'max(0.625rem, env(safe-area-inset-bottom))'
    }}
    className="absolute z-10 flex items-center gap-1 bg-slate-900/80 backdrop-blur-sm border border-slate-700/70 rounded-lg p-1 shadow-lg"
    role="group"
    aria-label="Rotate selected piece"
  >
    {onDiscard && (
      <button
        type="button"
        onClick={onDiscard}
        aria-label="Discard tile"
        title="Put tile away (Esc)"
        className="p-2.5 sm:p-2 rounded hover:bg-slate-700/80 active:bg-slate-600/80 text-slate-300 hover:text-white"
      >
        <X size={18} />
      </button>
    )}

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

    {onConfirm && (
      <button
        type="button"
        onClick={onConfirm}
        disabled={!canConfirm}
        aria-label="Place tile"
        title="Place tile (Enter)"
        className={`p-2.5 sm:p-2 rounded font-semibold transition-colors ${
          canConfirm
            ? 'bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-slate-950'
            : 'text-slate-500 opacity-50'
        }`}
      >
        <Check size={18} />
      </button>
    )}
  </div>
);
