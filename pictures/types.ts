// Shared types and pure geometry/random helpers for Jigsaw picture plugins
// (spec section 9). Kept React-free and DOM-free so picture modules and their
// unit tests run directly under Node (`npm test`) without circular imports.
import { getVertices, type Tile } from '../rules';

export type RGB = [number, number, number];

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Picture {
  image: CanvasImageSource;
  width: number;
  height: number;
}

export interface PictureRenderContext {
  homes: readonly Tile[];
  seed: number;
  pixelScale: number;
}

export interface PicturePlugin<Id extends string = string> {
  readonly id: Id;
  readonly label: string;
  render: (ctx: PictureRenderContext) => Picture;
}

// mulberry32: a small, fast seeded generator returning numbers in [0, 1)
export const seededRandom = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// The smallest axis-aligned box around some tiles.
export const boundsOf = (tiles: readonly Tile[]): Box => {
  const verts = tiles.flatMap(getVertices);
  const xs = verts.map(v => v.x);
  const ys = verts.map(v => v.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
};

// Where a picture is drawn so it covers the solved puzzle's box: scaled to
// cover it, keeping its proportions, and centered (any overhang cut evenly).
export const coverRect = (imageW: number, imageH: number, box: Box): Box => {
  const scale = Math.max(box.w / imageW, box.h / imageH);
  const w = imageW * scale;
  const h = imageH * scale;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
};
