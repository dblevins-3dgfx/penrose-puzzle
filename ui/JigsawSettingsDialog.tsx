// The jigsaw's Settings dialog (spec 9): puzzle size and display switches.
// Opened from the header; closed like How to Play.
import { PIECE_COUNTS, type JigsawSettings, type PuzzleSize } from '../jigsaw';
import { Overlay } from './HelpOverlay';

interface Props {
  settings: JigsawSettings;
  onChange: (settings: JigsawSettings) => void;
  onChangeSize: (size: PuzzleSize) => void;
  onClose: () => void;
}

const SIZE_LABELS: Record<PuzzleSize, string> = { small: 'Small', medium: 'Medium', large: 'Large' };

const SWITCHES: { key: 'showPicture' | 'showOutlines'; label: string; detail: string }[] = [
  { key: 'showPicture', label: 'Show picture', detail: 'Show the whole picture faintly inside the outline, like the picture on the box' },
  { key: 'showOutlines', label: 'Show tile outlines', detail: 'Draw the edges of every piece and of the tiles in the outline' }
];

export const JigsawSettingsDialog = ({ settings, onChange, onChangeSize, onClose }: Props) => (
  <Overlay onClose={onClose} title="Settings">
    <div className="space-y-4">
      <div className="space-y-2 pb-3 border-b border-slate-700/80">
        <div>
          <span className="block text-white font-semibold">Puzzle size</span>
          <span className="block text-slate-400 text-sm">Starts a new puzzle with the chosen number of pieces</span>
        </div>
        <div className="grid grid-cols-3 gap-2" role="group" aria-label="Puzzle size">
          {(Object.keys(PIECE_COUNTS) as PuzzleSize[]).map(s => (
            <button
              key={s}
              type="button"
              aria-pressed={settings.size === s}
              onClick={() => onChangeSize(s)}
              className={`px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                settings.size === s ? 'bg-sky-500 text-slate-950' : 'bg-slate-700 hover:bg-slate-600 text-white'
              }`}
            >
              {SIZE_LABELS[s]} ({PIECE_COUNTS[s]})
            </button>
          ))}
        </div>
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
            onChange={e => onChange({ ...settings, [key]: e.target.checked })}
            className="h-6 w-11 shrink-0 appearance-none rounded-full bg-slate-600 checked:bg-sky-500 relative cursor-pointer transition-colors
              before:absolute before:top-0.5 before:left-0.5 before:h-5 before:w-5 before:rounded-full before:bg-white before:transition-transform
              checked:before:translate-x-5"
          />
        </label>
      ))}
    </div>
  </Overlay>
);
