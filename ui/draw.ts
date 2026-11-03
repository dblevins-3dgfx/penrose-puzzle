// Canvas drawing for the board (spec 7). No rules are decided here: what
// to draw comes from rules.ts.
import {
  BOARD_H,
  BOARD_W,
  findConnectedEdges,
  getVertexColors,
  getVertices,
  isOutsidePlayfield,
  type Point,
  type Tile
} from '../rules';

// Tile fills: kites and darts get their own colors so the pattern reads.
const TILE_STYLE = {
  kite: { fill: 'rgba(245, 158, 11, 0.65)', stroke: '#92400e' },
  dart: { fill: 'rgba(99, 102, 241, 0.65)', stroke: '#3730a3' }
};

const GRID_SPACING = 40;

const tracePolygon = (ctx: CanvasRenderingContext2D, vertices: Point[]) => {
  ctx.beginPath();
  ctx.moveTo(vertices[0].x, vertices[0].y);
  vertices.forEach(v => ctx.lineTo(v.x, v.y));
  ctx.closePath();
};

const drawGrid = (ctx: CanvasRenderingContext2D) => {
  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 0.5;
  for (let i = 0; i < BOARD_W; i += GRID_SPACING) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, BOARD_H);
    ctx.stroke();
  }
  for (let i = 0; i < BOARD_H; i += GRID_SPACING) {
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(BOARD_W, i);
    ctx.stroke();
  }
};

// Small tick marks at each edge midpoint (visual texture only)
const drawEdgeTicks = (ctx: CanvasRenderingContext2D, vertices: Point[]) => {
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1;
  vertices.forEach((v1, i) => {
    const v2 = vertices[(i + 1) % vertices.length];
    const midX = (v1.x + v2.x) / 2;
    const midY = (v1.y + v2.y) / 2;
    const dx = v2.y - v1.y;
    const dy = v1.x - v2.x;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    ctx.beginPath();
    ctx.moveTo(midX - dx / len * 3, midY - dy / len * 3);
    ctx.lineTo(midX + dx / len * 3, midY + dy / len * 3);
    ctx.stroke();
  });
};

// Vertex colors (the Penrose matching labels): filled dots with a
// contrasting ring so both black and white read on any tile fill.
const drawVertexDots = (ctx: CanvasRenderingContext2D, tile: Tile, vertices: Point[]) => {
  const colors = getVertexColors(tile);
  vertices.forEach((v, i) => {
    const isBlack = colors[i] === 'black';
    ctx.beginPath();
    ctx.arc(v.x, v.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = isBlack ? '#000' : '#fff';
    ctx.fill();
    ctx.strokeStyle = isBlack ? '#fff' : '#000';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });
};

const drawTile = (ctx: CanvasRenderingContext2D, tile: Tile) => {
  const vertices = getVertices(tile);
  const style = TILE_STYLE[tile.type];

  tracePolygon(ctx, vertices);
  ctx.fillStyle = style.fill;
  ctx.fill();
  ctx.strokeStyle = style.stroke;
  ctx.lineWidth = 2;
  ctx.stroke();

  drawEdgeTicks(ctx, vertices);
  drawVertexDots(ctx, tile, vertices);
};

// Edges shared by two placed tiles with agreeing colors, in green
const drawConnectedEdges = (ctx: CanvasRenderingContext2D, tiles: Tile[]) => {
  ctx.save();
  ctx.strokeStyle = '#22c55e';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  findConnectedEdges(tiles).forEach(seg => {
    ctx.beginPath();
    ctx.moveTo(seg.x1, seg.y1);
    ctx.lineTo(seg.x2, seg.y2);
    ctx.stroke();
  });
  ctx.restore();
};

// The tile about to be placed: translucent, outlined solid green if it can
// go there or dashed red if not, with a red border around the board while
// any of its corners is off the board.
const drawPreview = (ctx: CanvasRenderingContext2D, tile: Tile, valid: boolean) => {
  ctx.save();
  ctx.globalAlpha = 0.55;
  drawTile(ctx, tile);
  ctx.restore();

  const vertices = getVertices(tile);
  ctx.save();
  tracePolygon(ctx, vertices);
  ctx.strokeStyle = valid ? '#16a34a' : '#dc2626';
  ctx.lineWidth = 3;
  ctx.setLineDash(valid ? [] : [6, 4]);
  ctx.stroke();
  ctx.restore();

  if (isOutsidePlayfield(vertices)) {
    ctx.save();
    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, BOARD_W - 8, BOARD_H - 8);
    ctx.restore();
  }
};

export interface Preview {
  tile: Tile;
  valid: boolean;
}

export const drawBoard = (ctx: CanvasRenderingContext2D, tiles: Tile[], preview: Preview | null) => {
  ctx.clearRect(0, 0, BOARD_W, BOARD_H);
  drawGrid(ctx);
  tiles.forEach(tile => drawTile(ctx, tile));
  drawConnectedEdges(ctx, tiles);
  if (preview) drawPreview(ctx, preview.tile, preview.valid);
};
