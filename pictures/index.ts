// Single-source-of-truth manifest for built-in Jigsaw picture plugins (spec 9).
// To add a new built-in picture:
//   1. Create `pictures/<name>.ts` exporting a `PicturePlugin` (plus `pictures/<name>.test.ts`).
//   2. Add it to `PICTURE_PLUGINS` below in the desired dropdown order.
// `PictureStyle`, `PICTURE_STYLES`, settings persistence, and Jigsaw's Picture
// selector all derive automatically from this list.
import { PENROSE_PICTURE_PLUGINS } from './penrose';
import { starChartPlugin } from './starChart';
import { sunsetPlugin } from './sunset';
import { topographicPlugin } from './topographic';
import type { PicturePlugin } from './types';

export type { Box, Picture, PicturePlugin, PictureRenderContext, RGB } from './types';

export const PICTURE_PLUGINS = [...PENROSE_PICTURE_PLUGINS, topographicPlugin, starChartPlugin, sunsetPlugin] as const;

export type PictureStyle = (typeof PICTURE_PLUGINS)[number]['id'];

export const PICTURE_STYLES: readonly PictureStyle[] = PICTURE_PLUGINS.map(p => p.id);

export const DEFAULT_PICTURE_STYLE: PictureStyle = 'subdivided';

const PLUGIN_BY_ID = new Map<PictureStyle, PicturePlugin>(PICTURE_PLUGINS.map(p => [p.id, p]));

export const getPicturePlugin = (id: PictureStyle): PicturePlugin =>
  PLUGIN_BY_ID.get(id) ?? PLUGIN_BY_ID.get(DEFAULT_PICTURE_STYLE)!;
