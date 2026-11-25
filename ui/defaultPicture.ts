// The picture the jigsaw uses until the player chooses one of their own: a
// landscape at sunset, drawn in code so the project needs no image files.
// Plenty of distinct shapes and colors, so pieces can be told apart.

const SIZE = 600;

const mountains = (ctx: CanvasRenderingContext2D, base: number, peaks: number[][], color: string) => {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, SIZE);
  ctx.lineTo(0, base);
  peaks.forEach(([x, y]) => ctx.lineTo(x, y));
  ctx.lineTo(SIZE, base);
  ctx.lineTo(SIZE, SIZE);
  ctx.closePath();
  ctx.fill();
};

const tree = (ctx: CanvasRenderingContext2D, x: number, y: number, h: number) => {
  ctx.fillStyle = '#3f2a1d';
  ctx.fillRect(x - h * 0.04, y - h * 0.25, h * 0.08, h * 0.25);
  ctx.fillStyle = '#14532d';
  for (let i = 0; i < 3; i++) {
    const top = y - h + i * h * 0.22;
    const w = h * (0.22 + i * 0.08);
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x - w, top + h * 0.45);
    ctx.lineTo(x + w, top + h * 0.45);
    ctx.closePath();
    ctx.fill();
  }
};

const drawSky = (ctx: CanvasRenderingContext2D) => {
  const sky = ctx.createLinearGradient(0, 0, 0, SIZE * 0.6);
  sky.addColorStop(0, '#1e1b4b');
  sky.addColorStop(0.45, '#7c3aed');
  sky.addColorStop(0.75, '#f97316');
  sky.addColorStop(1, '#fde047');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Stars in the dark top
  ctx.fillStyle = '#fef9c3';
  for (let i = 0; i < 40; i++) {
    const x = (i * 137) % SIZE, y = (i * 53) % 120;
    ctx.fillRect(x, y, 2, 2);
  }

  // Sun with a glow
  const glow = ctx.createRadialGradient(400, 330, 10, 400, 330, 160);
  glow.addColorStop(0, 'rgba(254, 240, 138, 0.9)');
  glow.addColorStop(1, 'rgba(254, 240, 138, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.fillStyle = '#fef08a';
  ctx.beginPath();
  ctx.arc(400, 330, 55, 0, Math.PI * 2);
  ctx.fill();

  // Clouds
  ctx.fillStyle = 'rgba(253, 186, 116, 0.85)';
  for (const [x, y, r] of [[120, 150, 30], [160, 140, 40], [205, 152, 28], [430, 200, 24], [465, 192, 34], [500, 204, 22]]) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
};

const drawLake = (ctx: CanvasRenderingContext2D) => {
  const water = ctx.createLinearGradient(0, 380, 0, SIZE);
  water.addColorStop(0, '#fb923c');
  water.addColorStop(0.3, '#6d28d9');
  water.addColorStop(1, '#0c4a6e');
  ctx.fillStyle = water;
  ctx.fillRect(0, 380, SIZE, SIZE - 380);
  // The sun's reflection
  ctx.fillStyle = 'rgba(254, 240, 138, 0.8)';
  for (let i = 0; i < 9; i++) {
    const w = 90 - i * 9;
    ctx.fillRect(400 - w / 2, 392 + i * 14, w, 5);
  }
};

const drawShore = (ctx: CanvasRenderingContext2D) => {
  ctx.fillStyle = '#166534';
  ctx.beginPath();
  ctx.moveTo(0, SIZE);
  ctx.lineTo(0, 470);
  ctx.quadraticCurveTo(140, 440, 260, 520);
  ctx.quadraticCurveTo(300, 560, 330, SIZE);
  ctx.closePath();
  ctx.fill();
  [[40, 470, 110], [95, 480, 90], [150, 500, 75], [200, 530, 60]].forEach(([x, y, h]) => tree(ctx, x, y, h));

  // Flowers in the grass
  const colors = ['#f472b6', '#facc15', '#f8fafc', '#fb7185'];
  for (let i = 0; i < 36; i++) {
    const x = 10 + ((i * 47) % 260), y = 530 + ((i * 31) % 65);
    if (x > 300 - (y - 520)) continue;
    ctx.fillStyle = colors[i % colors.length];
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // A sailboat
  ctx.fillStyle = '#1f2937';
  ctx.beginPath();
  ctx.moveTo(470, 470);
  ctx.lineTo(540, 470);
  ctx.lineTo(525, 485);
  ctx.lineTo(485, 485);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#f8fafc';
  ctx.beginPath();
  ctx.moveTo(505, 405);
  ctx.lineTo(505, 466);
  ctx.lineTo(535, 466);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ef4444';
  ctx.beginPath();
  ctx.moveTo(501, 415);
  ctx.lineTo(501, 466);
  ctx.lineTo(478, 466);
  ctx.closePath();
  ctx.fill();
};

export const makeDefaultPicture = (): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  drawSky(ctx);
  mountains(ctx, 360, [[60, 250], [130, 300], [210, 210], [300, 320], [360, 260], [450, 330], [540, 230], [600, 290]], '#4c1d95');
  mountains(ctx, 390, [[80, 320], [170, 350], [250, 300], [330, 370], [420, 340], [520, 360]], '#312e81');
  drawLake(ctx);
  drawShore(ctx);
  return canvas;
};
