// The jigsaw's controls: puzzle size, New puzzle, Your picture, and
// rotating the selected piece (spec 11).
import { useRef, type ChangeEvent } from 'react';
import { ImagePlus, RotateCw, Shuffle } from 'lucide-react';
import { PIECE_COUNTS, type PuzzleSize } from '../jigsaw';

interface Props {
  isTouchDevice: boolean;
  size: PuzzleSize;
  onSize: (size: PuzzleSize) => void;
  onNewPuzzle: () => void;
  onChoosePicture: (file: File) => void;
  canRotate: boolean;
  onRotate: (steps: number) => void;
}

const SIZE_LABELS: Record<PuzzleSize, string> = { small: 'Small', medium: 'Medium', large: 'Large' };

const button = 'bg-slate-700 hover:bg-slate-600 text-white px-3 py-2 rounded-lg flex items-center gap-2';

export const JigsawToolbar = (props: Props) => {
  const fileInput = useRef<HTMLInputElement>(null);
  const choose = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) props.onChoosePicture(file);
    e.target.value = '';
  };

  return (
    <div className="bg-slate-800 rounded-lg p-2 flex gap-2 sm:gap-3 items-center justify-center flex-wrap">
      <select
        value={props.size}
        onChange={e => props.onSize(e.target.value as PuzzleSize)}
        aria-label="Puzzle size"
        className="bg-slate-700 text-white px-3 py-2 rounded-lg"
      >
        {(Object.keys(PIECE_COUNTS) as PuzzleSize[]).map(s => (
          <option key={s} value={s}>{SIZE_LABELS[s]} ({PIECE_COUNTS[s]} pieces)</option>
        ))}
      </select>

      <button onClick={props.onNewPuzzle} className={button}>
        <Shuffle size={18} />
        New puzzle
      </button>

      <button onClick={() => fileInput.current?.click()} className={button}>
        <ImagePlus size={18} />
        Your picture
      </button>
      <input ref={fileInput} type="file" accept="image/*" onChange={choose} className="hidden" />

      {props.isTouchDevice ? (
        <>
          <button
            onClick={() => props.onRotate(-1)}
            disabled={!props.canRotate}
            aria-label="Rotate piece counter-clockwise"
            className={`${button} px-5 py-3 ${props.canRotate ? '' : 'opacity-50'}`}
          >
            <RotateCw size={22} style={{ transform: 'scaleX(-1)' }} />
          </button>
          <button
            onClick={() => props.onRotate(1)}
            disabled={!props.canRotate}
            aria-label="Rotate piece clockwise"
            className={`${button} px-5 py-3 ${props.canRotate ? '' : 'opacity-50'}`}
          >
            <RotateCw size={22} />
          </button>
        </>
      ) : (
        <div className="text-slate-300 text-sm flex items-center gap-2">
          <RotateCw size={18} />
          <span>Turn a piece: scroll wheel, right-click, or ←/→</span>
        </div>
      )}
    </div>
  );
};
