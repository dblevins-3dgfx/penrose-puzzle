// Extensible registry of built-in Jigsaw pictures (spec section 9).
// Adding a new built-in picture style only requires adding its entry here
// (and its style id in settings.ts) — Jigsaw and JigsawToolbar look up labels
// and renderers dynamically without closed conditionals.
import type { Tile } from '../rules';
import type { PenrosePictureStyle } from '../penrosePicture';
import { PICTURE_STYLES, type PictureStyle } from '../settings';
import { makeDefaultPicture } from './defaultPicture';
import type { Picture } from './jigsawDraw';
import { makePenrosePicture } from './penrosePictureDraw';

export interface PictureRenderContext {
  homes: readonly Tile[];
  seed: number;
  pixelScale: number;
}

export interface PictureProvider {
  id: PictureStyle;
  label: string;
  render: (ctx: PictureRenderContext) => Picture;
}

let cachedSunset: Picture | null = null;
const getSunsetPicture = (): Picture => {
  if (!cachedSunset) {
    const image = makeDefaultPicture();
    cachedSunset = { image, width: image.width, height: image.height };
  }
  return cachedSunset;
};

const penroseProvider = (id: PenrosePictureStyle, label: string): PictureProvider => ({
  id,
  label,
  render: ({ homes, seed, pixelScale }) => makePenrosePicture(id, homes, seed, pixelScale)
});

export const PICTURE_REGISTRY: Record<PictureStyle, PictureProvider> = {
  subdivided: penroseProvider('subdivided', 'Penrose (Subdivided)'),
  matching: penroseProvider('matching', 'Penrose (Matching)'),
  independent: penroseProvider('independent', 'Penrose (Independent)'),
  sunset: {
    id: 'sunset',
    label: 'Sunset',
    render: getSunsetPicture
  }
};

export const PICTURE_PROVIDERS: readonly PictureProvider[] = PICTURE_STYLES.map(id => PICTURE_REGISTRY[id]);
