import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SANDBOX_WORLD } from './rules';
import {
  DEFAULT_CAMERA,
  MAX_ZOOM,
  MIN_ZOOM,
  SANDBOX_MAX_ZOOM,
  clampCamera,
  clampSandboxCamera,
  defaultSandboxCamera,
  easeCamera,
  isCameraAtFit,
  isSandboxCameraDefault,
  nextCameraOnResize,
  panCamera,
  panSandboxCamera,
  sandboxMinZoom,
  sandboxScreenToWorld,
  sandboxWorldToScreen,
  screenToWorld,
  worldToScreen,
  zoomCameraAt,
  zoomSandboxCameraAt
} from './camera';

const near = (a: number, b: number, msg?: string) => assert.ok(Math.abs(a - b) < 1e-6, msg ?? `${a} vs ${b}`);

test('screenToWorld and worldToScreen are inverses at any zoom and pan', () => {
  const cam = { zoom: 2.25, panX: -140, panY: 35 };
  const world = { x: 185, y: 112 };
  const screen = worldToScreen(world, 1.5, cam);
  const back = screenToWorld(screen, 1.5, cam);
  near(back.x, world.x);
  near(back.y, world.y);
});

test('clampCamera bounds zoom, centers at zoom <= 1, and prevents panning off-screen when zoomed in', () => {
  const vp = { width: 1000, height: 600 };
  assert.deepEqual(clampCamera({ zoom: 1, panX: 250, panY: -200 }, vp), DEFAULT_CAMERA);

  const zoomedOut = clampCamera({ zoom: 0.2, panX: 999, panY: -999 }, vp);
  near(zoomedOut.zoom, MIN_ZOOM);
  near(zoomedOut.panX, (vp.width - vp.width * MIN_ZOOM) / 2);
  near(zoomedOut.panY, (vp.height - vp.height * MIN_ZOOM) / 2);

  const zoomedIn = clampCamera({ zoom: 10, panX: 5000, panY: -5000 }, vp);
  near(zoomedIn.zoom, MAX_ZOOM);
  assert.ok(zoomedIn.panX <= 80 && zoomedIn.panX >= vp.width - vp.width * MAX_ZOOM - 80);
  assert.ok(zoomedIn.panY <= 80 && zoomedIn.panY >= vp.height - vp.height * MAX_ZOOM - 80);
});

test('zoomCameraAt keeps the world point under the focus stationary and panCamera moves smoothly', () => {
  const vp = { width: 1000, height: 600 };
  const focus = { x: 300, y: 200 };
  const scale = 1.6;
  const worldBefore = screenToWorld(focus, scale, DEFAULT_CAMERA);

  const zoomed = zoomCameraAt(DEFAULT_CAMERA, 2, focus, vp);
  near(zoomed.zoom, 2);
  const worldAfter = screenToWorld(focus, scale, zoomed);
  near(worldAfter.x, worldBefore.x);
  near(worldAfter.y, worldBefore.y);

  const panned = panCamera(zoomed, 50, -30, vp);
  near(panned.panX, zoomed.panX + 50);
  near(panned.panY, zoomed.panY - 30);

  // Zooming back to 1 snaps back to default centered fit
  const fit = zoomCameraAt(panned, 0.5, focus, vp);
  assert.deepEqual(fit, DEFAULT_CAMERA);
});

test('isCameraAtFit detects Fit vs zoomed or panned cameras, and easeCamera moves screen points smoothly', () => {
  assert.equal(isCameraAtFit(DEFAULT_CAMERA), true);
  assert.equal(isCameraAtFit({ zoom: 1.0002, panX: 0.1, panY: -0.1 }), true);
  assert.equal(isCameraAtFit({ zoom: 1.25, panX: 0, panY: 0 }), false);
  assert.equal(isCameraAtFit({ zoom: 0.75, panX: 125, panY: 75 }), false);
  assert.equal(isCameraAtFit({ zoom: 1, panX: 10, panY: 0 }), false);

  const from = { zoom: 2.5, panX: -320, panY: -180 };
  assert.deepEqual(easeCamera(from, DEFAULT_CAMERA, -0.5), from);
  assert.deepEqual(easeCamera(from, DEFAULT_CAMERA, 0), from);
  assert.deepEqual(easeCamera(from, DEFAULT_CAMERA, 1), DEFAULT_CAMERA);
  assert.deepEqual(easeCamera(from, DEFAULT_CAMERA, 1.5), DEFAULT_CAMERA);

  // At t = 0.5, ease-out cubic is 1 - 0.5^3 = 0.875 of the way to Fit
  const mid = easeCamera(from, DEFAULT_CAMERA, 0.5);
  near(mid.zoom, from.zoom + (DEFAULT_CAMERA.zoom - from.zoom) * 0.875);
  near(mid.panX, from.panX + (DEFAULT_CAMERA.panX - from.panX) * 0.875);
  near(mid.panY, from.panY + (DEFAULT_CAMERA.panY - from.panY) * 0.875);

  // Every world point moves along a straight line on screen
  const world = { x: 240, y: 170 };
  const s0 = worldToScreen(world, 1.4, from);
  const s1 = worldToScreen(world, 1.4, DEFAULT_CAMERA);
  const sm = worldToScreen(world, 1.4, mid);
  near(sm.x, s0.x + (s1.x - s0.x) * 0.875);
  near(sm.y, s0.y + (s1.y - s0.y) * 0.875);

  // Passive viewport resizes clamp the camera without cancelling an active Fit animation
  const vp = { width: 390, height: 520 };
  const duringAnim = nextCameraOnResize({ zoom: 2.5, panX: 999, panY: -999 }, vp, true);
  assert.equal(duringAnim.keepAnimation, true, 'resize must not cancel solve-to-Fit animation');
  assert.deepEqual(duringAnim.camera, clampCamera({ zoom: 2.5, panX: 999, panY: -999 }, vp));

  const idle = nextCameraOnResize({ zoom: 2.5, panX: 999, panY: -999 }, vp, false);
  assert.equal(idle.keepAnimation, false);
  assert.deepEqual(idle.camera, clampCamera({ zoom: 2.5, panX: 999, panY: -999 }, vp));
});

test('defaultSandboxCamera centers the generous world at 100% zoom and sandboxMinZoom fits the whole world', () => {
  const phone = { width: 390, height: 580 };
  const cam = defaultSandboxCamera(phone);
  assert.equal(cam.zoom, 1);
  near(cam.panX, (phone.width - SANDBOX_WORLD.width) / 2);
  near(cam.panY, (phone.height - SANDBOX_WORLD.height) / 2);
  assert.equal(isSandboxCameraDefault(cam, phone), true);
  assert.equal(isSandboxCameraDefault({ ...cam, zoom: 1.5 }, phone), false);

  // World center maps to viewport center at default camera
  const center = sandboxWorldToScreen({ x: SANDBOX_WORLD.width / 2, y: SANDBOX_WORLD.height / 2 }, cam);
  near(center.x, phone.width / 2);
  near(center.y, phone.height / 2);

  // Min zoom on a phone lets the entire 1600x1200 world fit inside the screen
  const minZ = sandboxMinZoom(phone);
  assert.ok(minZ >= 0.2 && minZ < 0.3, `phone minZoom ${minZ} fits 1600px wide world`);
  assert.ok(SANDBOX_WORLD.width * minZ <= phone.width);
});

test('sandboxScreenToWorld and sandboxWorldToScreen are inverses, and zoom/pan stay clamped', () => {
  const vp = { width: 1000, height: 600 };
  const start = defaultSandboxCamera(vp);
  const focus = { x: 250, y: 180 };
  const before = sandboxScreenToWorld(focus, start);

  const zoomed = zoomSandboxCameraAt(start, 2, focus, vp);
  near(zoomed.zoom, 2);
  const after = sandboxScreenToWorld(focus, zoomed);
  near(after.x, before.x);
  near(after.y, before.y);

  const back = sandboxWorldToScreen(after, zoomed);
  near(back.x, focus.x);
  near(back.y, focus.y);

  // Panning stays within bounds and extreme zooms clamp cleanly
  const panned = panSandboxCamera(zoomed, 50000, -50000, vp);
  assert.ok(panned.panX <= 80);
  assert.ok(panned.panY >= vp.height - SANDBOX_WORLD.height * zoomed.zoom - 80);

  const tooSmall = clampSandboxCamera({ zoom: 0.01, panX: 999, panY: -999 }, vp);
  near(tooSmall.zoom, sandboxMinZoom(vp));
  near(tooSmall.panX, (vp.width - SANDBOX_WORLD.width * tooSmall.zoom) / 2);

  const tooBig = clampSandboxCamera({ zoom: 20, panX: 0, panY: 0 }, vp);
  near(tooBig.zoom, SANDBOX_MAX_ZOOM);
});
