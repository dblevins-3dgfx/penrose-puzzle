// The jigsaw's How to Play text (spec 9).
import { Overlay } from './HelpOverlay';

export const JigsawHelp = ({ isTouchDevice, onClose }: { isTouchDevice: boolean; onClose: () => void }) => (
  <Overlay onClose={onClose}>
    <p className="mb-3">Put the picture back together. Every piece is a kite or dart from a Penrose tiling.</p>
    <ul className="list-disc list-inside space-y-2">
      <li>The gray outline in the center shows where the pieces go; unplaced pieces start in the scrollable tray</li>
      <li>
        Drag a piece out of the tray onto the board (or tap it to place it on the board); use All / Edges to filter
        border pieces
      </li>
      <li>Pieces with a dark-and-gold edge are edge pieces: that edge is part of the puzzle's outer border</li>
      <li>
        Drag a piece to move it; it locks in when you drop it in its own place at the right angle, or drop a single
        loose piece back on the tray to put it away
      </li>
      <li>
        Drop a piece next to one it borders in the picture, at the same angle, and they snap together and move as one
      </li>
      <li>
        {isTouchDevice
          ? 'Tap a piece to select it, then tap it again to rotate 36°—or use the bottom-right rotate buttons'
          : 'Click a piece to select it and click it again to rotate 36° (Shift+click the other way), use the bottom-right rotate buttons, press R/Shift+R or Left/Right arrows, or right-click / scroll wheel'}
      </li>
      <li>
        {isTouchDevice
          ? 'Pinch with two fingers to zoom (or use the bottom-left zoom buttons); drag empty board space to pan'
          : 'Zoom with the bottom-left buttons, +/-/0 keys, or pinch on a trackpad; drag empty board space to pan'}
      </li>
      <li>
        Settings: change Puzzle size (12, 24, or 40 pieces), toggle Show picture (faint guide in the outline), or toggle
        Show tile outlines
      </li>
      <li>Your picture swaps in a photo from your device (it stays on your device)</li>
      <li>New puzzle starts over with a different part of the tiling</li>
    </ul>
  </Overlay>
);
