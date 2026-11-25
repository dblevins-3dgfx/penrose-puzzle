// The sandbox's single slim top bar: brand, mode switch, tile controls,
// counts, and How to Play (spec 6 and 8).
import type { ReactNode } from 'react';
import { CircleHelp, Magnet, RotateCw, Trash2, Undo2 } from 'lucide-react';
import type { TileType } from '../rules';

interface Props {
  modeSwitch: ReactNode;
  isTouchDevice: boolean;
  selectedTileType: TileType;
  onSelectTileType: (type: TileType) => void;
  rotation: number;
  onRotate: (steps: number) => void;
  autoRotate: boolean;
  onToggleAutoRotate: () => void;
  canPlace: boolean;
  onPlace: () => void;
  boardEmpty: boolean;
  onUndo: () => void;
  onClear: () => void;
  kiteCount: number;
  dartCount: number;
  onOpenHelp: () => void;
}

const LABEL: Record<TileType, string> = { kite: 'Kite', dart: 'Dart' };
const SELECTED_STYLE: Record<TileType, string> = {
  kite: 'bg-amber-500 text-slate-900',
  dart: 'bg-indigo-500 text-white'
};

const ActionButton = ({ onClick, disabled, children }: { onClick: () => void; disabled: boolean; children: ReactNode }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`bg-slate-700 hover:bg-slate-600 text-white px-2.5 py-1.5 rounded-md text-sm flex items-center gap-1.5 ${
      disabled ? 'opacity-50' : ''
    }`}
  >
    {children}
  </button>
);

const TouchRotation = ({ rotation, onRotate, canPlace, onPlace }: Pick<Props, 'rotation' | 'onRotate' | 'canPlace' | 'onPlace'>) => (
  <>
    <button
      onClick={() => onRotate(-1)}
      aria-label="Rotate counter-clockwise"
      className="bg-slate-700 active:bg-slate-600 text-white px-3.5 py-2 rounded-md flex items-center gap-1"
    >
      <RotateCw size={18} style={{ transform: 'scaleX(-1)' }} />
    </button>
    <button
      onClick={() => onRotate(1)}
      aria-label="Rotate clockwise"
      className="bg-slate-700 active:bg-slate-600 text-white px-3.5 py-2 rounded-md flex items-center gap-1"
    >
      <RotateCw size={18} />
      <span className="text-xs">{rotation}°</span>
    </button>
    <button
      onClick={onPlace}
      disabled={!canPlace}
      className={`px-4 py-2 rounded-md text-sm font-semibold text-white ${
        canPlace ? 'bg-green-600 active:bg-green-700' : 'bg-slate-600 opacity-50'
      }`}
    >
      Place
    </button>
  </>
);

export const Toolbar = (props: Props) => {
  const { isTouchDevice, selectedTileType, onSelectTileType, rotation, boardEmpty } = props;

  return (
    <div className="bg-slate-800/95 border-b border-slate-700/70 px-2 py-1.5 flex items-center justify-between gap-2 flex-wrap">
      <div className="flex items-center gap-2">
        <h1 className="text-base sm:text-lg font-bold text-white whitespace-nowrap">
          <span className="hidden xl:inline">Penrose Puzzle</span>
          <span className="xl:hidden">Penrose</span>
        </h1>
        {props.modeSwitch}
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
        <div className="flex gap-1">
          {(['kite', 'dart'] as const).map(type => (
            <button
              key={type}
              onClick={() => onSelectTileType(type)}
              className={`px-3 py-1.5 rounded-md text-sm font-semibold ${
                selectedTileType === type ? SELECTED_STYLE[type] : 'bg-slate-700 text-slate-300'
              }`}
            >
              {LABEL[type]}
            </button>
          ))}
        </div>

        {isTouchDevice ? (
          <TouchRotation {...props} />
        ) : (
          <span
            className="text-slate-300 text-xs sm:text-sm flex items-center gap-1 px-1.5"
            title={props.autoRotate ? 'Next fit: scroll wheel, right-click, or ←/→' : 'Rotate: scroll wheel, right-click, or ←/→'}
          >
            <RotateCw size={15} />
            <span className="text-white font-semibold w-8">{rotation}°</span>
          </span>
        )}

        <button
          onClick={props.onToggleAutoRotate}
          aria-pressed={props.autoRotate}
          title="Turn the tile to fit the nearest free edge"
          className={`px-2.5 py-1.5 rounded-md text-sm font-semibold flex items-center gap-1.5 ${
            props.autoRotate ? 'bg-emerald-500 text-slate-900' : 'bg-slate-700 text-slate-300'
          }`}
        >
          <Magnet size={16} />
          <span className="hidden sm:inline">Auto-rotate</span>
        </button>

        <ActionButton onClick={props.onUndo} disabled={boardEmpty}>
          <Undo2 size={16} />
          <span className="hidden sm:inline">Undo</span>
        </ActionButton>

        <ActionButton onClick={props.onClear} disabled={boardEmpty}>
          <Trash2 size={16} />
          <span className="hidden sm:inline">Clear</span>
        </ActionButton>
      </div>

      <div className="flex items-center gap-2.5 sm:gap-3">
        <div className="text-slate-300 text-xs sm:text-sm whitespace-nowrap">
          <span className="text-amber-400 font-semibold">{props.kiteCount}</span> kites ·{' '}
          <span className="text-indigo-400 font-semibold">{props.dartCount}</span> darts
        </div>
        <button
          onClick={props.onOpenHelp}
          aria-label="How to Play"
          title="How to Play"
          className="text-slate-300 hover:text-white p-1"
        >
          <CircleHelp size={18} />
        </button>
      </div>
    </div>
  );
};
