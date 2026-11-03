// The controls above the board: tile type, rotation, Place (touch only),
// Undo and Clear (spec 6 and 8).
import type { ReactNode } from 'react';
import { Magnet, RotateCw, Trash2, Undo2 } from 'lucide-react';
import type { TileType } from '../rules';

interface Props {
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
    className={`bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 ${
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
      className="bg-slate-700 active:bg-slate-600 text-white px-5 py-3 rounded-lg flex items-center gap-2"
    >
      <RotateCw size={22} style={{ transform: 'scaleX(-1)' }} />
    </button>

    <button
      onClick={() => onRotate(1)}
      aria-label="Rotate clockwise"
      className="bg-slate-700 active:bg-slate-600 text-white px-5 py-3 rounded-lg flex items-center gap-2"
    >
      <RotateCw size={22} />
      <span className="text-sm">{rotation}°</span>
    </button>

    <button
      onClick={onPlace}
      disabled={!canPlace}
      className={`px-6 py-3 rounded-lg font-semibold text-white ${
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
    <div className="bg-slate-800 rounded-lg p-2 flex gap-2 sm:gap-3 items-center justify-center flex-wrap">
      <div className="flex gap-2">
        {(['kite', 'dart'] as const).map(type => (
          <button
            key={type}
            onClick={() => onSelectTileType(type)}
            className={`px-4 py-2 rounded-lg font-semibold ${
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
        <div className="text-slate-300 text-sm flex items-center gap-2">
          <RotateCw size={18} />
          <span>{props.autoRotate ? 'Next fit' : 'Rotate'}: scroll wheel, right-click, or ←/→</span>
          <span className="text-white font-semibold w-10">{rotation}°</span>
        </div>
      )}

      <button
        onClick={props.onToggleAutoRotate}
        aria-pressed={props.autoRotate}
        title="Turn the tile to fit the nearest free edge"
        className={`px-4 py-2 rounded-lg font-semibold flex items-center gap-2 ${
          props.autoRotate ? 'bg-emerald-500 text-slate-900' : 'bg-slate-700 text-slate-300'
        }`}
      >
        <Magnet size={18} />
        Auto-rotate
      </button>

      <ActionButton onClick={props.onUndo} disabled={boardEmpty}>
        <Undo2 size={18} />
        Undo
      </ActionButton>

      <ActionButton onClick={props.onClear} disabled={boardEmpty}>
        <Trash2 size={18} />
        Clear
      </ActionButton>
    </div>
  );
};
