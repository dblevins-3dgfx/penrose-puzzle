// Switches between the jigsaw and the free-building sandbox (spec 11).
export type Mode = 'jigsaw' | 'sandbox';

const LABELS: Record<Mode, string> = { jigsaw: 'Jigsaw', sandbox: 'Sandbox' };

export const ModeSwitch = ({ mode, onChange }: { mode: Mode; onChange: (mode: Mode) => void }) => (
  <div className="flex rounded-lg bg-slate-800 p-0.5 text-sm" role="tablist">
    {(['jigsaw', 'sandbox'] as const).map(m => (
      <button
        key={m}
        role="tab"
        aria-selected={mode === m}
        onClick={() => onChange(m)}
        className={`px-3 py-1 rounded-md font-semibold ${mode === m ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white'}`}
      >
        {LABELS[m]}
      </button>
    ))}
  </div>
);
