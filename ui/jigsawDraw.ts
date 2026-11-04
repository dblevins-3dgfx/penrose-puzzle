// Canvas drawing for the jigsaw (spec 11). Where everything goes comes
// from jigsaw.ts; this only paints it.
import { BOARD_H, BOARD_W, getVertices, type Point, type Tile } from '../rules';
import { boundsOf, coverRect, drawLayers, pieceTile, pieceTransform, type JigsawSettings, type Piece } from '../jigsaw';

export interface Picture {
  image: CanvasImageSource;
  width: number;
  height: number;
}

const tracePolygon = (ctx: CanvasRenderingContext2D, vertices: Point[]) => {
  ctx.moveTo(vertices[0].x, vertices[0].y);
  vertices.slice(1).forEach(v => ctx.lineTo(v.x, v.y));
  ctx.closePath();
};

// The picture drawn over the solved puzzle's box, clipped to `tiles`.
const drawPictureIn = (ctx: CanvasRenderingContext2D, picture: Picture, tiles: Tile[], rect: ReturnType<typeof coverRect>) => {
  ctx.save();
  ctx.beginPath();
  tiles.forEach(t => tracePolygon(ctx, getVertices(t)));
  ctx.clip();
  ctx.drawImage(picture.image, rect.x, rect.y, rect.w, rect.h);
  ctx.restore();
};

// The outline of the solved puzzle: where the pieces go. With outlines
// on, each tile's edges are drawn; with them off, it is one gray shape.
const drawFrame = (ctx: CanvasRenderingContext2D, homes: Tile[], showOutlines: boolean) => {
  ctx.save();
  ctx.fillStyle = '#e2e8f0';
  ctx.beginPath();
  homes.forEach(t => tracePolygon(ctx, getVertices(t)));
  ctx.fill();
  if (showOutlines) {
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();
};

// One layer (see drawLayers): the pieces' part of the picture, moved and
// turned to where they are now, clipped to all their outlines at once so
// no seams show between them. Every piece in a layer shares one transform:
// locked pieces are all at home, and a group moves rigidly.
// Loose pieces cast a soft shadow.
const drawLayer = (ctx: CanvasRenderingContext2D, layer: Piece[], picture: Picture, rect: ReturnType<typeof coverRect>) => {
  if (!layer[0].locked) {
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
    ctx.shadowBlur = 4;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    layer.forEach(p => tracePolygon(ctx, getVertices(pieceTile(p))));
    ctx.fill();
    ctx.restore();
  }

  const { angle, to, from } = pieceTransform(layer[0]);
  ctx.save();
  ctx.translate(to.x, to.y);
  ctx.rotate(angle);
  ctx.translate(-from.x, -from.y);
  ctx.beginPath();
  layer.forEach(p => tracePolygon(ctx, getVertices(p.home)));
  ctx.clip();
  ctx.drawImage(picture.image, rect.x, rect.y, rect.w, rect.h);
  ctx.restore();
};

// A piece's outline: dark (faint once locked) when outlines are on; the
// selected group's is always a thick blue.
const drawOutline = (ctx: CanvasRenderingContext2D, piece: Piece, selected: boolean, showOutlines: boolean) => {
  if (!selected && !showOutlines) return;
  ctx.save();
  ctx.beginPath();
  tracePolygon(ctx, getVertices(pieceTile(piece)));
  if (selected) {
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 3;
  } else if (piece.locked) {
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.25)';
    ctx.lineWidth = 0.75;
  } else {
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.25;
  }
  ctx.stroke();
  ctx.restore();
};

export interface JigsawView {
  pieces: Piece[];
  picture: Picture;
  settings: JigsawSettings;
  selectedId: number | null;
}

export const drawJigsaw = (ctx: CanvasRenderingContext2D, { pieces, picture, settings, selectedId }: JigsawView) => {
  ctx.clearRect(0, 0, BOARD_W, BOARD_H);
  if (pieces.length === 0) return;
  const homes = pieces.map(p => p.home);
  const box = boundsOf(homes);
  const rect = coverRect(picture.width, picture.height, box);

  drawFrame(ctx, homes, settings.showOutlines);
  if (settings.showPicture) {
    ctx.save();
    ctx.globalAlpha = 0.3;
    drawPictureIn(ctx, picture, homes, rect);
    ctx.restore();
  }
  // The selected piece's whole group is outlined in blue
  const selectedGroup = pieces.find(p => p.id === selectedId)?.group;
  for (const layer of drawLayers(pieces)) {
    drawLayer(ctx, layer, picture, rect);
    layer.forEach(p => drawOutline(ctx, p, !p.locked && p.group === selectedGroup, settings.showOutlines));
  }
};
