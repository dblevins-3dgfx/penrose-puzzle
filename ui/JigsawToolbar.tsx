// The jigsaw's single slim top bar: brand, mode switch, New puzzle, Picture,
// Your picture, progress, Settings (which holds Puzzle size) and How to Play (spec 9).
import { useRef, type ChangeEvent, type ReactNode } from 'react';
import { CircleHelp, ImagePlus, Settings, Shuffle, Sparkles } from 'lucide-react';
import type { PictureStyle } from '../settings';
import { PICTURE_PROVIDERS } from './pictureRegistry';

interface Props {
  modeSwitch: ReactNode;
  onNewPuzzle: () => void;
  picture: PictureStyle | 'custom';
  onPicture: (style: PictureStyle) => void;
  onChoosePicture: (file: File) => void;
  placed: number;
  total: number;
  solved: boolean;
  onOpenSettings: () => void;
  onOpenHelp: () => void;
}

const control =
  'bg-slate-700 hover:bg-slate-600 active:bg-slate-600 text-white px-2.5 py-2 sm:py-1.5 min-h-9 sm:min-h-0 rounded-md text-sm flex items-center justify-center gap-1.5';
const selectClass =
  'bg-slate-700 text-white px-2 py-2 sm:py-1.5 min-h-9 sm:min-h-0 rounded-md text-sm max-w-32 sm:max-w-none min-w-0';

export const JigsawToolbar = (props: Props) => {
  const fileInput = useRef<HTMLInputElement>(null);
  const choose = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) props.onChoosePicture(file);
    e.target.value = '';
  };

  return (
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
        <button onClick={props.onNewPuzzle} className={control} title="Start a new puzzle" aria-label="New puzzle">
          <Shuffle size={16} />
          <span className="hidden sm:inline">New puzzle</span>
        </button>

        <select
          value={props.picture}
          onChange={e => {
            const val = e.target.value;
            if (val !== 'custom') props.onPicture(val as PictureStyle);
          }}
          aria-label="Puzzle picture"
          className={selectClass}
        >
          {PICTURE_PROVIDERS.map(p => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
          {props.picture === 'custom' && <option value="custom">Custom picture</option>}
        </select>

        <button
          onClick={() => fileInput.current?.click()}
          className={control}
          title="Use your own image"
          aria-label="Your picture"
        >
          <ImagePlus size={16} />
          <span className="hidden md:inline">Your picture</span>
        </button>
        <input ref={fileInput} type="file" accept="image/*" onChange={choose} className="hidden" />
      </div>

      <div className="flex items-center gap-1 sm:gap-2.5">
        <div
          className={`text-xs sm:text-sm font-semibold whitespace-nowrap flex items-center gap-1 sm:gap-1.5 ${
            props.solved
              ? 'text-emerald-300 bg-emerald-500/15 border border-emerald-400/40 px-2 sm:px-2.5 py-0.5 rounded-full'
              : 'text-slate-300'
          }`}
          aria-live="polite"
        >
          {props.solved && <Sparkles size={14} className="text-amber-300 shrink-0" />}
          {props.solved ? (
            <>
              <span className="hidden sm:inline">Solved! All {props.total} pieces in place</span>
              <span className="sm:hidden">Solved!</span>
            </>
          ) : (
            <>
              <span className="hidden sm:inline">
                {props.placed} / {props.total} placed
              </span>
              <span className="sm:hidden">
                {props.placed}/{props.total}
              </span>
            </>
          )}
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
};
