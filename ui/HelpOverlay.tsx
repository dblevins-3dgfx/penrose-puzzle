// The How to Play screen: a full-screen overlay closed with its X button,
// a tap outside it, or Escape (spec 8).
import { useEffect } from 'react';
import { X } from 'lucide-react';

interface Props {
  isTouchDevice: boolean;
  onClose: () => void;
}

export const HelpOverlay = ({ isTouchDevice, onClose }: Props) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-10 bg-slate-900/95 overflow-y-auto p-4" onClick={onClose}>
      <div
        className="max-w-2xl mx-auto bg-slate-800 rounded-lg p-4 sm:p-6 text-slate-300 text-sm sm:text-base"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xl sm:text-2xl font-bold text-white">How to Play</h2>
          <button onClick={onClose} aria-label="Close" className="text-slate-300 hover:text-white p-1">
            <X size={24} />
          </button>
        </div>
        <p className="mb-3">Build a Penrose tiling from kites and darts.</p>
        <ul className="list-disc list-inside space-y-2">
          <li>Place the first tile anywhere on the board</li>
          <li>Each tile after that must share a full edge with the tiles already down</li>
          <li>Where tiles meet, the corner dots must match: black on black, white on white</li>
          <li>
            {isTouchDevice
              ? 'Drag on the board to position the tile, rotate with the buttons (36° steps), then tap Place'
              : 'Click to place. Rotate with the scroll wheel over the board, right-click (Shift + right-click for the other way), or Left/Right arrow keys (36° steps)'}
          </li>
          <li>Green preview outline = the tile fits; red dashed = it doesn't</li>
          <li>
            Auto-rotate turns the tile to fit the free edge nearest the pointer; rotating then steps through the
            other ways it fits nearby
          </li>
          <li>{isTouchDevice ? 'Undo' : 'Undo (or Ctrl/Cmd+Z)'} removes the last tile; Clear empties the board</li>
        </ul>
      </div>
    </div>
  );
};
