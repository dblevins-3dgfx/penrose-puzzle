// Shared 2D board camera math (pan, zoom, clamp, and smooth Fit easing) used
// by both Jigsaw (spec 9) and Sandbox (spec 6 & 8). Plain module without React
// so it can be unit-tested in camera.test.ts.
import { SANDBOX_WORLD, type BoardSize, type Point } from './rules';

export interface Camera {
  // Zoom multiplier (Jigsaw: on top of layout.scale, 1 = fitted to screen;
  // Sandbox: world units per CSS pixel, 1 = 100%).
  zoom: number;
  // Pan offset in CSS pixels: where world (0, 0) lands on the canvas.
  panX: number;
  panY: number;
}

export const ZOOM_STEP = 1.25;

// Jigsaw camera defaults & zoom bounds
export const DEFAULT_CAMERA: Camera = { zoom: 1, panX: 0, panY: 0 };
export const MIN_ZOOM = 0.75;
export const MAX_ZOOM = 4;

// Sandbox zoom upper bound (lower bound is dynamic from sandboxMinZoom)
export const SANDBOX_MAX_ZOOM = 4;

// ---------------------------------------------------------------------
// Generic camera primitives
// ---------------------------------------------------------------------

export const screenToWorld = (screen: Point, baseScale: number, camera: Camera): Point => {
  const s = baseScale * camera.zoom;
  return { x: (screen.x - camera.panX) / s, y: (screen.y - camera.panY) / s };
};

export const worldToScreen = (world: Point, baseScale: number, camera: Camera): Point => {
  const s = baseScale * camera.zoom;
  return { x: world.x * s + camera.panX, y: world.y * s + camera.panY };
};

const clampAxis = (pan: number, viewportSpan: number, contentSpan: number, zoom: number): number => {
  const rendered = contentSpan * zoom;
  if (rendered <= viewportSpan) return (viewportSpan - rendered) / 2;
  const pad = Math.min(80, viewportSpan * 0.15);
  return Math.max(viewportSpan - rendered - pad, Math.min(pad, pan));
};

export const clampCameraBounds = (
  camera: Camera,
  viewport: BoardSize,
  content: BoardSize,
  minZoom: number,
  maxZoom: number
): Camera => {
  const zoom = Math.max(minZoom, Math.min(maxZoom, camera.zoom));
  return {
    zoom,
    panX: clampAxis(camera.panX, Math.max(1, viewport.width), content.width, zoom),
    panY: clampAxis(camera.panY, Math.max(1, viewport.height), content.height, zoom)
  };
};

export const panCameraBounds = (
  camera: Camera,
  dx: number,
  dy: number,
  viewport: BoardSize,
  content: BoardSize,
  minZoom: number,
  maxZoom: number
): Camera =>
  clampCameraBounds(
    { zoom: camera.zoom, panX: camera.panX + dx, panY: camera.panY + dy },
    viewport,
    content,
    minZoom,
    maxZoom
  );

// Zooms by `factor` while keeping the world point under `focus` (CSS pixels)
// stationary, then clamps the resulting camera to the viewport & content bounds.
export const zoomCameraAtBounds = (
  camera: Camera,
  factor: number,
  focus: Point,
  viewport: BoardSize,
  content: BoardSize,
  minZoom: number,
  maxZoom: number
): Camera => {
  const nextZoom = Math.max(minZoom, Math.min(maxZoom, camera.zoom * factor));
  const ratio = nextZoom / camera.zoom;
  return clampCameraBounds(
    {
      zoom: nextZoom,
      panX: focus.x - (focus.x - camera.panX) * ratio,
      panY: focus.y - (focus.y - camera.panY) * ratio
    },
    viewport,
    content,
    minZoom,
    maxZoom
  );
};

export const isCameraNear = (a: Camera, b: Camera): boolean =>
  Math.abs(a.zoom - b.zoom) < 1e-3 && Math.abs(a.panX - b.panX) < 0.5 && Math.abs(a.panY - b.panY) < 0.5;

// Smoothly eases from one camera pose to another with ease-out cubic timing.
// Interpolating zoom, panX and panY by the same factor moves every world point
// along a straight line on screen.
export const easeCamera = (from: Camera, to: Camera, t: number): Camera => {
  if (t <= 0) return { ...from };
  if (t >= 1) return { ...to };
  const e = 1 - (1 - t) ** 3;
  return {
    zoom: from.zoom + (to.zoom - from.zoom) * e,
    panX: from.panX + (to.panX - from.panX) * e,
    panY: from.panY + (to.panY - from.panY) * e
  };
};

// ---------------------------------------------------------------------
// Jigsaw camera (content spans the fitted viewport at zoom = 1)
// ---------------------------------------------------------------------

const safeViewport = (viewport: BoardSize): BoardSize => ({
  width: Math.max(1, viewport.width),
  height: Math.max(1, viewport.height)
});

export const clampCamera = (camera: Camera, viewport: BoardSize): Camera => {
  const vp = safeViewport(viewport);
  return clampCameraBounds(camera, vp, vp, MIN_ZOOM, MAX_ZOOM);
};

export const panCamera = (camera: Camera, dx: number, dy: number, viewport: BoardSize): Camera => {
  const vp = safeViewport(viewport);
  return panCameraBounds(camera, dx, dy, vp, vp, MIN_ZOOM, MAX_ZOOM);
};

export const zoomCameraAt = (camera: Camera, factor: number, focus: Point, viewport: BoardSize): Camera => {
  const vp = safeViewport(viewport);
  return zoomCameraAtBounds(camera, factor, focus, vp, vp, MIN_ZOOM, MAX_ZOOM);
};

export const isCameraAtFit = (camera: Camera): boolean => isCameraNear(camera, DEFAULT_CAMERA);

// Passive viewport resizes (e.g. mobile Safari address bar shifts or toolbar
// reflow) clamp the camera to the new viewport without cancelling an active
// solve-to-Fit animation; only manual pan/zoom or puzzle resets cancel it.
export const nextCameraOnResize = (
  camera: Camera,
  viewport: BoardSize,
  animatingToFit: boolean
): { camera: Camera; keepAnimation: boolean } => ({
  camera: clampCamera(camera, viewport),
  keepAnimation: animatingToFit
});

// ---------------------------------------------------------------------
// Sandbox camera (generous world canvas, 1 world unit = 1 CSS px at zoom 1)
// ---------------------------------------------------------------------

// Minimum zoom lets the player zoom all the way out to view the entire world
// canvas (with a small margin), while staying bounded for very tiny viewports.
export const sandboxMinZoom = (viewport: BoardSize, world: BoardSize = SANDBOX_WORLD): number => {
  const vw = Math.max(1, viewport.width);
  const vh = Math.max(1, viewport.height);
  const fitAll = Math.min((vw - 24) / world.width, (vh - 24) / world.height);
  return Math.max(0.2, Math.min(0.75, fitAll));
};

export const defaultSandboxCamera = (viewport: BoardSize, world: BoardSize = SANDBOX_WORLD): Camera => ({
  zoom: 1,
  panX: (Math.max(1, viewport.width) - world.width) / 2,
  panY: (Math.max(1, viewport.height) - world.height) / 2
});

export const isSandboxCameraDefault = (
  camera: Camera,
  viewport: BoardSize,
  world: BoardSize = SANDBOX_WORLD
): boolean => isCameraNear(camera, defaultSandboxCamera(viewport, world));

export const sandboxScreenToWorld = (screen: Point, camera: Camera): Point => screenToWorld(screen, 1, camera);

export const sandboxWorldToScreen = (worldPt: Point, camera: Camera): Point => worldToScreen(worldPt, 1, camera);

export const clampSandboxCamera = (camera: Camera, viewport: BoardSize, world: BoardSize = SANDBOX_WORLD): Camera =>
  clampCameraBounds(camera, viewport, world, sandboxMinZoom(viewport, world), SANDBOX_MAX_ZOOM);

export const panSandboxCamera = (
  camera: Camera,
  dx: number,
  dy: number,
  viewport: BoardSize,
  world: BoardSize = SANDBOX_WORLD
): Camera => panCameraBounds(camera, dx, dy, viewport, world, sandboxMinZoom(viewport, world), SANDBOX_MAX_ZOOM);

export const zoomSandboxCameraAt = (
  camera: Camera,
  factor: number,
  focus: Point,
  viewport: BoardSize,
  world: BoardSize = SANDBOX_WORLD
): Camera =>
  zoomCameraAtBounds(camera, factor, focus, viewport, world, sandboxMinZoom(viewport, world), SANDBOX_MAX_ZOOM);
