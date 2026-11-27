// The jigsaw's Settings dialog (spec 9): stepped/cyclic puzzle size selector,
// display/audio switches, and diagnostics copy. Opened from the header; closed
// like How to Play.
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PUZZLE_SIZES, stepPuzzleSize, type JigsawSettings, type PuzzleSize } from '../settings';
import { DebugInfoSection } from './DebugInfoSection';
import { Overlay } from './HelpOverlay';
import { playSound } from './sound';

interface Props {
  settings: JigsawSettings;
  onChange: (settings: JigsawSettings) => void;
  onChangeSize: (size: PuzzleSize) => void;
  onChangeSymmetric: (symmetric: boolean) => void;
  getDebugInfo: () => string;
  onClose: () => void;
}

const SIZE_LABELS: Record<PuzzleSize, string> = {
  small: 'Small',
  medium: 'Medium',
  large: 'Large',
  xl: 'XL',
  giant: 'Giant'
};

const SWITCHES: { key: 'showPicture' | 'showOutlines' | 'effects' | 'sound'; label: string; detail: string }[] = [
  {
    key: 'showPicture',
    label: 'Show picture',
    detail: 'Show the whole picture faintly inside the outline, like the picture on the box'
  },
  {
    key: 'showOutlines',
    label: 'Show tile outlines',
    detail: 'Draw the edges of every piece and of the tiles in the outline'
  },
  {
    key: 'effects',
    label: 'Visual effects',
    detail: 'Show sparks, glows, border shimmer, and confetti when pieces snap, lock, or finish'
  },
  {
    key: 'sound',
    label: 'Sound effects',
    detail: 'Play subtle synthesized chimes when pieces snap, lock, complete the border, or finish the puzzle'
  }
];

const toggleClass =
  'h-6 w-11 shrink-0 appearance-none rounded-full bg-slate-600 checked:bg-sky-500 relative cursor-pointer transition-colors before:absolute before:top-0.5 before:left-0.5 before:h-5 before:w-5 before:rounded-full before:bg-white before:transition-transform checked:before:translate-x-5';

export const JigsawSettingsDialog = ({
  settings,
  onChange,
  onChangeSize,
  onChangeSymmetric,
  getDebugInfo,
  onClose
}: Props) => (
  <Overlay onClose={onClose} title="Settings">
    <div className="space-y-4">
      <div className="space-y-4 pb-3 border-b border-slate-700/80">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <span className="block text-white font-semibold">Puzzle size</span>
            <span className="block text-slate-400 text-sm">Starts a new puzzle of the chosen size</span>
          </div>
          <div
            className="flex items-center gap-1 bg-slate-900/70 border border-slate-700/80 rounded-lg p-1"
            role="group"
            aria-label="Puzzle size"
          >
            <button
              type="button"
              onClick={() => onChangeSize(stepPuzzleSize(settings.size, -1))}
              aria-label="Previous puzzle size"
              className="p-2 rounded-md bg-slate-700 hover:bg-slate-600 active:bg-slate-600 text-white"
            >
              <ChevronLeft size={18} />
            </button>

            <button
              type="button"
              onClick={() => onChangeSize(stepPuzzleSize(settings.size, 1))}
              aria-label={`Puzzle size ${SIZE_LABELS[settings.size]}, tap for next size`}
              className="min-w-24 px-3 py-1 rounded-md hover:bg-slate-700/60 active:bg-slate-700 text-center"
            >
              <span className="block text-sm font-semibold text-white leading-tight">{SIZE_LABELS[settings.size]}</span>
              <span className="mt-1 flex items-center justify-center gap-1" aria-hidden="true">
                {PUZZLE_SIZES.map(s => (
                  <span
                    key={s}
                    className={`h-1.5 w-1.5 rounded-full transition-colors ${
                      s === settings.size ? 'bg-sky-400' : 'bg-slate-600'
                    }`}
                  />
                ))}
              </span>
            </button>

            <button
              type="button"
              onClick={() => onChangeSize(stepPuzzleSize(settings.size, 1))}
              aria-label="Next puzzle size"
              className="p-2 rounded-md bg-slate-700 hover:bg-slate-600 active:bg-slate-600 text-white"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        <label className="flex items-center justify-between gap-4 cursor-pointer">
          <span>
            <span className="block text-white font-semibold">Symmetric layout</span>
            <span className="block text-slate-400 text-sm">
              Starts a new puzzle with a symmetric outline (5-fold mandala or mirror-symmetric)
            </span>
          </span>
          <input
            type="checkbox"
            role="switch"
            checked={settings.symmetric}
            onChange={e => onChangeSymmetric(e.target.checked)}
            className={toggleClass}
          />
        </label>
      </div>

      {SWITCHES.map(({ key, label, detail }) => (
        <label key={key} className="flex items-center justify-between gap-4 cursor-pointer">
          <span>
            <span className="block text-white font-semibold">{label}</span>
            <span className="block text-slate-400 text-sm">{detail}</span>
          </span>
          <input
            type="checkbox"
            role="switch"
            checked={settings[key]}
            onChange={e => {
              const checked = e.target.checked;
              onChange({ ...settings, [key]: checked });
              if (key === 'sound' && checked) playSound('lock');
            }}
            className={toggleClass}
          />
        </label>
      ))}

      <DebugInfoSection getDebugInfo={getDebugInfo} />
    </div>
  </Overlay>
);
