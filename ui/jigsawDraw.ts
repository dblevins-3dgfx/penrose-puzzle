// Canvas drawing for the jigsaw (spec 11). Where everything goes comes
// from jigsaw.ts; this only paints it.
import { BOARD_H, BOARD_W, getVertices, type Point, type Tile } from '../rules';
import { boundsOf, coverRect, pieceTile, pieceTransform, type Piece } from '../jigsaw';

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

// The outline of the solved puzzle: where the pieces go.
const drawFrame = (ctx: CanvasRenderingContext2D, homes: Tile[]) => {
  ctx.save();
  ctx.fillStyle = '#e2e8f0';
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1;
  homes.forEach(t => {
    ctx.beginPath();
    tracePolygon(ctx, getVertices(t));
    ctx.fill();
    ctx.stroke();
  });
  ctx.restore();
};

// A piece: its part of the picture, moved and turned to where it is now,
// with an outline (blue while it is the selected piece).
const drawPiece = (ctx: CanvasRenderingContext2D, piece: Piece, picture: Picture, rect: ReturnType<typeof coverRect>, selected: boolean) => {
  const { angle, to, from } = pieceTransform(piece);
  ctx.save();
  ctx.translate(to.x, to.y);
  ctx.rotate(angle);
  ctx.translate(-from.x, -from.y);
  ctx.beginPath();
  tracePolygon(ctx, getVertices(piece.home));
  ctx.clip();
  ctx.drawImage(picture.image, rect.x, rect.y, rect.w, rect.h);
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  tracePolygon(ctx, getVertices(pieceTile(piece)));
  if (piece.locked) {
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.25)';
    ctx.lineWidth = 0.75;
  } else {
    if (!selected) {
      ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
      ctx.shadowBlur = 4;
    }
    ctx.strokeStyle = selected ? '#2563eb' : '#0f172a';
    ctx.lineWidth = selected ? 3 : 1.25;
  }
  ctx.stroke();
  ctx.restore();
};

export interface JigsawView {
  pieces: Piece[];
  picture: Picture;
  showPicture: boolean;
  selectedId: number | null;
}

export const drawJigsaw = (ctx: CanvasRenderingContext2D, { pieces, picture, showPicture, selectedId }: JigsawView) => {
  ctx.clearRect(0, 0, BOARD_W, BOARD_H);
  if (pieces.length === 0) return;
  const homes = pieces.map(p => p.home);
  const box = boundsOf(homes);
  const rect = coverRect(picture.width, picture.height, box);

  drawFrame(ctx, homes);
  if (showPicture) {
    ctx.save();
    ctx.globalAlpha = 0.3;
    drawPictureIn(ctx, picture, homes, rect);
    ctx.restore();
  }
  // Locked pieces first, so loose ones are always drawn over them
  pieces.filter(p => p.locked).forEach(p => drawPiece(ctx, p, picture, rect, false));
  // The selected piece's whole group is outlined in blue
  const selectedGroup = pieces.find(p => p.id === selectedId)?.group;
  pieces.filter(p => !p.locked).forEach(p => drawPiece(ctx, p, picture, rect, p.group === selectedGroup));
};
