// The jigsaw's Settings dialog (spec 11): switches for how the board is
// drawn. Opened from the header; closed like How to Play.
import type { JigsawSettings } from '../jigsaw';
import { Overlay } from './HelpOverlay';

interface Props {
  settings: JigsawSettings;
  onChange: (settings: JigsawSettings) => void;
  onClose: () => void;
}

const SWITCHES: { key: keyof JigsawSettings; label: string; detail: string }[] = [
  { key: 'showPicture', label: 'Show picture', detail: 'Show the whole picture faintly inside the outline, like the picture on the box' },
  { key: 'showOutlines', label: 'Show tile outlines', detail: 'Draw the edges of every piece and of the tiles in the outline' }
];

export const JigsawSettingsDialog = ({ settings, onChange, onClose }: Props) => (
  <Overlay onClose={onClose} title="Settings">
    <div className="space-y-3">
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
