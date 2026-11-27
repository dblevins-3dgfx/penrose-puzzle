import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TRAY_TAP_MAX_MOVE,
  WHEEL_NOTCH,
  isTrayTap,
  trayDragAction,
  wheelDeltaPixels,
  wheelSteps
} from './gestures';

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-6, `${a} vs ${b}`);

test('trayDragAction distinguishes touch scroll vs drag-out in portrait and landscape, and isTrayTap ignores cancelled pointers', () => {
  // Mouse lifts once movement exceeds 6 px in any direction
  assert.equal(trayDragAction(false, true, 3, 4), 'wait');
  assert.equal(trayDragAction(false, true, 7, 0), 'lift');

  // Touch portrait (bottom strip): horizontal swipes scroll; dragging up lifts onto the board
  assert.equal(trayDragAction(true, true, 14, 2), 'scroll');
  assert.equal(trayDragAction(true, true, -14, -4), 'scroll');
  assert.equal(trayDragAction(true, true, 2, -15), 'lift');
  assert.equal(trayDragAction(true, true, 2, 15), 'wait', 'dragging downward does not lift');
  assert.equal(trayDragAction(true, true, 5, -8), 'wait');

  // Touch landscape (right sidebar): vertical swipes scroll; dragging left lifts onto the board
  assert.equal(trayDragAction(true, false, 2, 14), 'scroll');
  assert.equal(trayDragAction(true, false, -3, -15), 'scroll');
  assert.equal(trayDragAction(true, false, -15, 3), 'lift');
  assert.equal(trayDragAction(true, false, 15, 0), 'wait', 'dragging rightward does not lift');

  // Tap-to-pop fires only on clean un-cancelled, un-scrolled, un-lifted taps within TRAY_TAP_MAX_MOVE
  assert.equal(isTrayTap(false, false, false, 0), true);
  assert.equal(isTrayTap(false, false, false, TRAY_TAP_MAX_MOVE), true);
  assert.equal(isTrayTap(false, false, false, TRAY_TAP_MAX_MOVE + 0.5), false);
  assert.equal(isTrayTap(false, false, true, 2), false, 'pointercancel (e.g. Safari scroll handoff) never pops a piece');
  assert.equal(isTrayTap(false, true, false, 2), false);
  assert.equal(isTrayTap(true, false, false, 2), false);
});

test('wheel deltas in lines and pages convert to pixels', () => {
  assert.equal(wheelDeltaPixels(100, 0), 100);
  assert.equal(wheelDeltaPixels(3, 1), 48);
  assert.equal(wheelDeltaPixels(1, 2), 400);
});

test('a mouse wheel notch turns one step: up clockwise, down counter-clockwise', () => {
  assert.deepEqual(wheelSteps(0, -100), { steps: 1, total: 0 });
  assert.deepEqual(wheelSteps(0, 100), { steps: -1, total: 0 });
  assert.deepEqual(wheelSteps(15, -WHEEL_NOTCH), { steps: 1, total: 15 });
});

test('a trackpad swipe turns one step per 50 px scrolled', () => {
  let total = 0;
  let steps = 0;
  for (let i = 0; i < 13; i++) {
    const r = wheelSteps(total, -10); // 130 px upward in small deltas
    total = r.total;
    steps += r.steps;
  }
  assert.equal(steps, 2);
  near(total, -30);
});

test('a swipe that reverses direction works its total back', () => {
  const a = wheelSteps(0, -40);
  assert.deepEqual(a, { steps: 0, total: -40 });
  const b = wheelSteps(a.total, 30);
  assert.deepEqual(b, { steps: 0, total: -10 });
});
