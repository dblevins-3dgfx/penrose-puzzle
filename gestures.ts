// Shared pointer, tray drag/tap, and scroll-wheel gesture rules used by both
// Jigsaw (spec 9) and Sandbox (spec 8). Plain module without React so it can
// be unit-tested in gestures.test.ts.

// Maximum CSS-pixel pointer travel for a press-and-release on the board to
// count as a tap (select / tap-to-rotate / deselect) rather than a drag or pan.
export const TAP_MAX_MOVE = 6;

// Maximum CSS-pixel pointer travel for a press-and-release on a tray item to
// count as a tap-to-pop onto the board.
export const TRAY_TAP_MAX_MOVE = 8;

export type TrayDragAction = 'wait' | 'scroll' | 'lift';

// Decides whether pointer movement starting on a tray item should keep waiting,
// yield to native tray scrolling (along the tray's scroll axis on touch), or
// lift the tile/piece out onto the board.
export const trayDragAction = (isTouch: boolean, isPortrait: boolean, dx: number, dy: number): TrayDragAction => {
  if (!isTouch) return Math.hypot(dx, dy) > TAP_MAX_MOVE ? 'lift' : 'wait';
  const scrollMoved = isPortrait
    ? Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)
    : Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx);
  if (scrollMoved) return 'scroll';
  const pullOut = isPortrait ? dy < -12 : dx < -12;
  return pullOut ? 'lift' : 'wait';
};

// True when releasing a tray item should pop a tile/piece onto the board.
// Cancelled pointers (e.g. iOS Safari taking over for native tray scrolling)
// never pop accidentally.
export const isTrayTap = (
  lifted: boolean,
  scrolled: boolean,
  cancelled: boolean,
  moveDistPx: number
): boolean => !lifted && !scrolled && !cancelled && moveDistPx <= TRAY_TAP_MAX_MOVE;

// Wheel deltas in pixels: line mode counts 16 px a line, page mode 400 px.
export const wheelDeltaPixels = (deltaY: number, deltaMode: number): number =>
  deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 400 : deltaY;

export const WHEEL_NOTCH = 50;
export const TRACKPAD_STEP = 50; // lower = faster trackpad rotation

// One wheel event. A delta of WHEEL_NOTCH px or more is a mouse wheel notch
// and turns one step by itself (the trackpad total is left alone). Smaller
// deltas are a trackpad swipe: they add up in `total`, and every
// TRACKPAD_STEP px turns one step. Scrolling up (negative) is clockwise.
// Returns the steps to turn and the new running total.
export const wheelSteps = (total: number, dy: number): { steps: number; total: number } => {
  if (Math.abs(dy) >= WHEEL_NOTCH) return { steps: dy < 0 ? 1 : -1, total };

  let t = total + dy;
  let steps = 0;
  while (Math.abs(t) >= TRACKPAD_STEP) {
    steps += t < 0 ? 1 : -1;
    t -= Math.sign(t) * TRACKPAD_STEP;
  }
  return { steps, total: t };
};
