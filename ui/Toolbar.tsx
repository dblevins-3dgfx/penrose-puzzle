// The sandbox's single slim top bar (spec 6 & 8): brand, mode switch,
// Auto-rotate, Undo, Clear, tile counts, Settings, and How to Play —
// mirroring JigsawToolbar cleanly.
import type { ReactNode } from 'react';
import { CircleHelp, Magnet, Settings, Trash2, Undo2 } from 'lucide-react';

interface Props {
  modeSwitch: ReactNode;
  autoRotate: boolean;
  onToggleAutoRotate: () => void;
  boardEmpty: boolean;
  onUndo: () => void;
  onClear: () => void;
  kiteCount: number;
  dartCount: number;
  onOpenSettings: () => void;
  onOpenHelp: () => void;
}

const ActionButton = ({
  onClick,
  disabled,
  label,
  children
}: {
  onClick: () => void;
  disabled: boolean;
  label: string;
  children: ReactNode;
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    aria-label={label}
    title={label}
    className={`bg-slate-700 hover:bg-slate-600 active:bg-slate-600 text-white px-2.5 py-2 sm:py-1.5 min-h-9 sm:min-h-0 rounded-md text-sm flex items-center justify-center gap-1.5 ${
      disabled ? 'opacity-50' : ''
    }`}
  >
    {children}
  </button>
);

export const Toolbar = (props: Props) => (
  <div
    style={{
      paddingTop: 'max(0.375rem, env(safe-area-inset-top))',
      paddingLeft: 'max(0.5rem, env(safe-area-inset-left))',
      paddingRight: 'max(0.5rem, env(safe-area-inset-right))'
    }}
    className="bg-slate-800/95 border-b border-slate-700/70 pb-1.5 flex items-center justify-between gap-1.5 sm:gap-2 flex-wrap"
  >
    <div className="flex items-center gap-2">
      <h1 className="hidden sm:block text-base sm:text-lg font-bold text-white whitespace-nowrap">
        <span className="hidden xl:inline">Penrose Puzzle</span>
        <span className="xl:hidden">Penrose</span>
      </h1>
      {props.modeSwitch}
    </div>

    <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
      <button
        onClick={props.onToggleAutoRotate}
        aria-pressed={props.autoRotate}
        aria-label="Auto-rotate"
        title="Turn loose tile to fit the nearest free edge"
        className={`px-2.5 py-2 sm:py-1.5 min-h-9 sm:min-h-0 rounded-md text-sm font-semibold flex items-center gap-1.5 ${
          props.autoRotate ? 'bg-emerald-500 text-slate-900' : 'bg-slate-700 text-slate-300'
        }`}
      >
        <Magnet size={16} />
        <span className="hidden sm:inline">Auto-rotate</span>
      </button>

      <ActionButton onClick={props.onUndo} disabled={props.boardEmpty} label="Undo">
        <Undo2 size={16} />
        <span className="hidden sm:inline">Undo</span>
      </ActionButton>

      <ActionButton onClick={props.onClear} disabled={props.boardEmpty} label="Clear">
        <Trash2 size={16} />
        <span className="hidden sm:inline">Clear</span>
      </ActionButton>
    </div>

    <div className="flex items-center gap-1 sm:gap-2.5">
      <div className="text-slate-300 text-xs sm:text-sm whitespace-nowrap">
        <span className="text-amber-400 font-semibold">{props.kiteCount}</span>
        <span className="hidden sm:inline"> kites</span>
        <span className="sm:hidden">K</span> · <span className="text-indigo-400 font-semibold">{props.dartCount}</span>
        <span className="hidden sm:inline"> darts</span>
        <span className="sm:hidden">D</span>
      </div>
      <button
        onClick={props.onOpenSettings}
        aria-label="Settings"
        title="Settings"
        className="text-slate-300 hover:text-white active:text-white p-2 sm:p-1 rounded-md"
      >
        <Settings size={18} />
      </button>
      <button
        onClick={props.onOpenHelp}
        aria-label="How to Play"
        title="How to Play"
        className="text-slate-300 hover:text-white active:text-white p-2 sm:p-1 rounded-md"
      >
        <CircleHelp size={18} />
      </button>
    </div>
  </div>
);
