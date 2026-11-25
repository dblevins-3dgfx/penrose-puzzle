// The jigsaw's single slim top bar: brand, mode switch, puzzle controls,
// progress, Settings and How to Play (spec 9).
import { useRef, type ChangeEvent, type ReactNode } from 'react';
import { CircleHelp, ImagePlus, RotateCw, Settings, Shuffle } from 'lucide-react';
import { PIECE_COUNTS, PICTURE_STYLES, type PictureStyle, type PuzzleSize } from '../jigsaw';

interface Props {
  modeSwitch: ReactNode;
  isTouchDevice: boolean;
  size: PuzzleSize;
  onSize: (size: PuzzleSize) => void;
  onNewPuzzle: () => void;
  picture: PictureStyle | 'custom';
  onPicture: (style: PictureStyle) => void;
  onChoosePicture: (file: File) => void;
  canRotate: boolean;
  onRotate: (steps: number) => void;
  placed: number;
  total: number;
  solved: boolean;
  onOpenSettings: () => void;
  onOpenHelp: () => void;
}

const SIZE_LABELS: Record<PuzzleSize, string> = { small: 'Small', medium: 'Medium', large: 'Large' };
const PICTURE_LABELS: Record<PictureStyle, string> = {
  subdivided: 'Penrose (Subdivided)',
  matching: 'Penrose (Matching)',
  independent: 'Penrose (Independent)',
  sunset: 'Sunset'
};

const control = 'bg-slate-700 hover:bg-slate-600 text-white px-2.5 py-1.5 rounded-md text-sm flex items-center gap-1.5';
const selectClass = 'bg-slate-700 text-white px-2 py-1.5 rounded-md text-sm';

export const JigsawToolbar = (props: Props) => {
  const fileInput = useRef<HTMLInputElement>(null);
  const choose = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) props.onChoosePicture(file);
    e.target.value = '';
  };

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
        <select
          value={props.size}
          onChange={e => props.onSize(e.target.value as PuzzleSize)}
          aria-label="Puzzle size"
          className={selectClass}
        >
          {(Object.keys(PIECE_COUNTS) as PuzzleSize[]).map(s => (
            <option key={s} value={s}>{SIZE_LABELS[s]} ({PIECE_COUNTS[s]})</option>
          ))}
        </select>

        <button onClick={props.onNewPuzzle} className={control} title="Start a new puzzle">
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
          {PICTURE_STYLES.map(p => (
            <option key={p} value={p}>{PICTURE_LABELS[p]}</option>
          ))}
          {props.picture === 'custom' && <option value="custom">Custom picture</option>}
        </select>

        <button onClick={() => fileInput.current?.click()} className={control} title="Use your own image">
          <ImagePlus size={16} />
          <span className="hidden md:inline">Your picture</span>
        </button>
        <input ref={fileInput} type="file" accept="image/*" onChange={choose} className="hidden" />

        {props.isTouchDevice && (
          <>
            <button
              onClick={() => props.onRotate(-1)}
              disabled={!props.canRotate}
              aria-label="Rotate piece counter-clockwise"
              className={`${control} px-3.5 py-2 ${props.canRotate ? '' : 'opacity-50'}`}
            >
              <RotateCw size={18} style={{ transform: 'scaleX(-1)' }} />
            </button>
            <button
              onClick={() => props.onRotate(1)}
              disabled={!props.canRotate}
              aria-label="Rotate piece clockwise"
              className={`${control} px-3.5 py-2 ${props.canRotate ? '' : 'opacity-50'}`}
            >
              <RotateCw size={18} />
            </button>
          </>
        )}
      </div>

      <div className="flex items-center gap-2.5 sm:gap-3">
        <div
          className={`text-xs sm:text-sm font-semibold whitespace-nowrap ${props.solved ? 'text-emerald-400' : 'text-slate-300'}`}
          aria-live="polite"
        >
          {props.solved ? `Solved! All ${props.total} pieces in place` : `${props.placed} / ${props.total} placed`}
        </div>
        <button
          onClick={props.onOpenSettings}
          aria-label="Settings"
          title="Settings"
          className="text-slate-300 hover:text-white p-1"
        >
          <Settings size={18} />
        </button>
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
