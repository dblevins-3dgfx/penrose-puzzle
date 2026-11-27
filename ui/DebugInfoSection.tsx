// Shared Diagnostics section rendered at the bottom of both Jigsaw and Sandbox
// Settings dialogs: copies a local-only debug snapshot to the clipboard, with
// a fallback selectable text box if clipboard access is unavailable.
import { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';

interface Props {
  getDebugInfo: () => string;
}

type CopyStatus = 'idle' | 'copied' | 'failed';

export const DebugInfoSection = ({ getDebugInfo }: Props) => {
  const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle');
  const [preview, setPreview] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    []
  );

  const handleCopy = async () => {
    const text = getDebugInfo();
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus('copied');
      if (preview !== null) setPreview(text);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        setCopyStatus('idle');
        timerRef.current = null;
      }, 2000);
    } catch {
      setCopyStatus('failed');
      setPreview(text);
    }
  };

  const togglePreview = () => {
    if (copyStatus === 'failed') setCopyStatus('idle');
    setPreview(cur => (cur === null ? getDebugInfo() : null));
  };

  const copied = copyStatus === 'copied';

  return (
    <div className="pt-3 border-t border-slate-700/80 space-y-2">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <span className="block text-white font-semibold">Diagnostics</span>
          <span className="block text-slate-400 text-sm">Copy device, viewport, and board details for bug reports</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={togglePreview}
            className="px-2.5 py-1.5 rounded-md text-xs font-semibold bg-slate-700 hover:bg-slate-600 text-slate-200"
          >
            {preview === null ? 'Show' : 'Hide'}
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className={`px-3 py-1.5 rounded-md text-sm font-semibold flex items-center gap-1.5 transition-colors ${
              copied ? 'bg-emerald-500 text-slate-950' : 'bg-slate-700 hover:bg-slate-600 text-white'
            }`}
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}
            {copied ? 'Copied!' : 'Copy debug info'}
          </button>
        </div>
      </div>

      {copyStatus === 'failed' && (
        <p className="text-xs text-amber-300">Clipboard access is unavailable here — select and copy the text below.</p>
      )}

      {preview !== null && (
        <textarea
          readOnly
          value={preview}
          rows={7}
          aria-label="Debug info"
          onFocus={e => e.currentTarget.select()}
          className="w-full rounded-md bg-slate-900/90 border border-slate-700 p-2 text-xs font-mono text-slate-200 select-all"
        />
      )}
    </div>
  );
};
