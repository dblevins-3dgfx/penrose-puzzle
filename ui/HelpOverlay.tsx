// The How to Play screen: a full-screen overlay closed with its X button,
// a tap outside it, or Escape (spec 8).
import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface Props {
  isTouchDevice: boolean;
  onClose: () => void;
}

// The overlay frame: a title (How to Play unless given), a close button and
// the content.
export const Overlay = ({
  onClose,
  children,
  title = 'How to Play'
}: {
  onClose: () => void;
  children: ReactNode;
  title?: string;
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      style={{
        paddingTop: 'max(1rem, env(safe-area-inset-top))',
        paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
        paddingLeft: 'max(1rem, env(safe-area-inset-left))',
        paddingRight: 'max(1rem, env(safe-area-inset-right))'
      }}
      className="fixed inset-0 z-50 bg-slate-900/95 overflow-y-auto overscroll-contain select-text"
      onClick={onClose}
    >
      <div
        className="max-w-2xl mx-auto bg-slate-800 rounded-lg p-4 sm:p-6 text-slate-300 text-sm sm:text-base"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xl sm:text-2xl font-bold text-white">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-slate-300 hover:text-white active:text-white p-2 -mr-1 rounded-md"
          >
            <X size={24} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};

// The sandbox's How to Play text.
export const HelpOverlay = ({ isTouchDevice, onClose }: Props) => (
  <Overlay onClose={onClose}>
    <p className="mb-3">Build a Penrose tiling from kites and darts on a spacious pan-and-zoom canvas.</p>
    <ul className="list-disc list-inside space-y-2">
      <li>
        <strong>Place tiles:</strong> drag a Kite or Dart from the tray and drop it on a legal spot to lock it in place,
        or tap a tray tile to spawn it on the board
      </li>
      <li>
        Place the first tile anywhere on the board; each tile after that must share a full edge with tiles already down
      </li>
      <li>
        Where tiles meet, the matching labels must agree: black dot on black dot, white on white (or matching gold/aqua
        circular arcs when enabled in Settings)
      </li>
      <li>
        <strong>Rotate &amp; adjust:</strong> dropping on an invalid spot leaves the tile loose so you can adjust it.{' '}
        {isTouchDevice
          ? 'Tap the loose tile or use the bottom-right rotate buttons (36° steps), then drag-drop or tap ✓ to place'
          : 'Tap the loose tile, use the bottom-right rotate buttons, scroll wheel, right-click (Shift for CCW), or R / Left / Right keys (36° steps); drop or tap ✓ / Enter to place'}
      </li>
      <li>Drop a loose tile back onto the tray (or tap ×{isTouchDevice ? '' : ' / Escape'}) to put it away</li>
      <li>Green outline = legal fit; dashed red = illegal</li>
      <li>
        <strong>Pan &amp; zoom:</strong> drag empty space to pan across the board;{' '}
        {isTouchDevice
          ? 'pinch with two fingers or use the bottom-left zoom controls'
          : 'use Ctrl/Cmd + scroll, +/-/0 keys, or the bottom-left zoom controls'}
      </li>
      <li>
        <strong>Auto-rotate</strong> turns the loose tile to fit the nearest free edge; rotating steps through nearby
        fits
      </li>
      <li>
        {isTouchDevice ? 'Undo' : 'Undo (or Ctrl/Cmd+Z)'} removes the last placed tile; Clear empties the board. Toggle
        vertex dots, matching arcs, visual effects, and sound effects in Settings.
      </li>
    </ul>
  </Overlay>
);
