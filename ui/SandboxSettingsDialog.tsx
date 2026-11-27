// The sandbox's Settings dialog (spec 6 & 8): Visual effects and Sound effects
// switches, persisted alongside Jigsaw settings.
import type { SharedSettings } from '../settings';
import { DebugInfoSection } from './DebugInfoSection';
import { Overlay } from './HelpOverlay';
import { playSound } from './sound';

interface Props {
  settings: SharedSettings;
  onChange: (patch: Partial<SharedSettings>) => void;
  getDebugInfo: () => string;
  onClose: () => void;
}

const SWITCHES: { key: keyof SharedSettings; label: string; detail: string }[] = [
  {
    key: 'effects',
    label: 'Visual effects',
    detail: 'Show placement glow and edge sparks when a tile locks into place'
  },
  { key: 'sound', label: 'Sound effects', detail: 'Play a subtle synthesized chime when a tile locks into place' }
];

export const SandboxSettingsDialog = ({ settings, onChange, getDebugInfo, onClose }: Props) => (
  <Overlay onClose={onClose} title="Settings">
    <div className="space-y-4">
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
              onChange({ [key]: checked });
              if (key === 'sound' && checked) playSound('lock');
            }}
            className="h-6 w-11 shrink-0 appearance-none rounded-full bg-slate-600 checked:bg-sky-500 relative cursor-pointer transition-colors
              before:absolute before:top-0.5 before:left-0.5 before:h-5 before:w-5 before:rounded-full before:bg-white before:transition-transform
              checked:before:translate-x-5"
          />
        </label>
      ))}

      <DebugInfoSection getDebugInfo={getDebugInfo} />
    </div>
  </Overlay>
);
