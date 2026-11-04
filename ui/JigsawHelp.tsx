// The jigsaw's How to Play text (spec 11).
import { Overlay } from './HelpOverlay';

export const JigsawHelp = ({ isTouchDevice, onClose }: { isTouchDevice: boolean; onClose: () => void }) => (
  <Overlay onClose={onClose}>
    <p className="mb-3">Put the picture back together. Every piece is a kite or dart from a Penrose tiling.</p>
    <ul className="list-disc list-inside space-y-2">
      <li>The gray outline on the left shows where the pieces go</li>
      <li>Drag a piece to move it; it locks in when you drop it in its own place at the right angle</li>
      <li>Drop a piece next to one it borders in the picture, at the same angle, and they snap together and move as one</li>
      <li>
        {isTouchDevice
          ? 'Tap a piece to select it, then turn it with the rotate buttons (36° steps)'
          : 'Turn the selected piece with the scroll wheel or Left/Right arrow keys, or right-click a piece to turn it (Shift + right-click for the other way)'}
      </li>
      <li>Settings: Show picture faintly shows the whole picture in the outline; Show tile outlines draws the edges of the pieces</li>
      <li>Your picture swaps in a photo from your device (it stays on your device)</li>
      <li>New puzzle starts over with a different part of the tiling</li>
    </ul>
  </Overlay>
);
