// Deterministic performance benchmark runner & CLI (issue #86).
// Usage:
//   npm run bench                                       # run and print summary
//   npm run bench -- --json [out.json]                  # output JSON snapshot
//   npm run bench -- --compare base.json head.json ...  # emit Markdown delta
//   npm run bench -- --append-history hist.json snap.json
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { autoRotatePlacement, findConnectedEdges, isLegalPlacement, snapPosition, type Tile } from '../rules';
import { detectCelebrations, moveGroup, newPuzzle, pieceAt, settleGroup } from '../jigsaw';
import { pictureTiles } from '../pictures/penrose';
import { renderTopographicPixels, TOPO_CANVAS_SIZE } from '../pictures/topographic';
import { STAR_CHART_SIZE, starChartLayoutForSeed } from '../pictures/starChart';
import { PUZZLE_SIZES } from '../settings';
import {
  appendHistory,
  compareBenchmarks,
  formatMarkdownReport,
  measureBundleDir,
  summarizeSamples,
  type BenchEntry,
  type BenchGroup,
  type BenchSnapshot,
  type HistoryPoint
} from './report';

const runCase = (
  id: string,
  group: BenchGroup,
  label: string,
  fn: () => unknown,
  warmup: number,
  runs: number
): BenchEntry => {
  for (let i = 0; i < warmup; i++) fn();
  const samples: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    fn();
    samples.push(performance.now() - t0);
  }
  const { medianMs, p95Ms } = summarizeSamples(samples);
  return { id, group, label, runs, medianMs, p95Ms };
};

const currentSha = (): string => {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
};

const runJigsawBenchmarks = (giantPieces: ReturnType<typeof newPuzzle>): BenchEntry[] => {
  const entries: BenchEntry[] = PUZZLE_SIZES.map(size =>
    runCase(`jigsaw.newPuzzle.${size}`, 'jigsaw', `newPuzzle(${size}, sym)`, () => newPuzzle(size, 42, true), 2, 9)
  );
  const midGame = giantPieces.map((p, i) =>
    i < 20
      ? { ...p, x: p.home.x, y: p.home.y, rotation: p.home.rotation, locked: true, inTray: false }
      : i < 40
        ? { ...p, x: p.home.x + 40, y: p.home.y + 30, inTray: false }
        : p
  );
  const looseId = midGame[25].id;
  const hitPt = { x: midGame[25].x, y: midGame[25].y };
  const board = { width: 1200, height: 800 };
  const moved = moveGroup(midGame, looseId, 5, 5, board);

  entries.push(
    runCase('jigsaw.pieceAt.giant', 'jigsaw', 'pieceAt (giant)', () => pieceAt(midGame, hitPt), 5, 150),
    runCase(
      'jigsaw.moveGroup.giant',
      'jigsaw',
      'moveGroup (giant)',
      () => moveGroup(midGame, looseId, 4, -3, board),
      5,
      150
    ),
    runCase('jigsaw.settleGroup.giant', 'jigsaw', 'settleGroup (giant)', () => settleGroup(moved, looseId), 5, 150),
    runCase(
      'jigsaw.celebrations.giant',
      'jigsaw',
      'detectCelebrations (giant)',
      () => detectCelebrations(midGame, moved),
      5,
      150
    )
  );
  return entries;
};

const runPictureBenchmarks = (largeHomes: Tile[], giantHomes: Tile[]): BenchEntry[] => [
  runCase(
    'pictures.matching.large',
    'pictures',
    'Penrose Matching (large-40)',
    () => pictureTiles('matching', largeHomes, 42),
    3,
    40
  ),
  runCase(
    'pictures.subdivided.giant',
    'pictures',
    'Penrose Subdivided (giant-100)',
    () => pictureTiles('subdivided', giantHomes, 42),
    2,
    9
  ),
  runCase(
    'pictures.independent.giant',
    'pictures',
    'Penrose Independent (giant-100)',
    () => pictureTiles('independent', giantHomes, 42),
    2,
    7
  ),
  runCase(
    'pictures.topographic',
    'pictures',
    `Topographic (${TOPO_CANVAS_SIZE}×${TOPO_CANVAS_SIZE})`,
    () => renderTopographicPixels(TOPO_CANVAS_SIZE, 42),
    1,
    3
  ),
  runCase(
    'pictures.starchart',
    'pictures',
    `Star Chart layout (${STAR_CHART_SIZE})`,
    () => starChartLayoutForSeed(STAR_CHART_SIZE, 42),
    5,
    80
  )
];

const runSandboxBenchmarks = (giantHomes: Tile[]): BenchEntry[] => {
  const allTiles: Tile[] = giantHomes.map(t => ({ ...t, x: t.x + 500, y: t.y + 300 }));
  const board = { width: 1600, height: 1200 };
  const entries: BenchEntry[] = [];
  for (const n of [30, 100]) {
    const tiles = allTiles.slice(0, n);
    const probe = allTiles[Math.min(n, allTiles.length - 1)] ?? { type: 'kite' as const, x: 800, y: 600, rotation: 0 };
    const near: Tile = { ...probe, x: probe.x + 12, y: probe.y - 8 };
    const runs = n >= 100 ? 15 : 30;
    entries.push(
      runCase(
        `sandbox.connected.${n}`,
        'sandbox',
        `findConnectedEdges (n=${n})`,
        () => findConnectedEdges(tiles),
        2,
        runs
      ),
      runCase(
        `sandbox.legal.${n}`,
        'sandbox',
        `isLegalPlacement (n=${n})`,
        () => isLegalPlacement(tiles, probe, false, board),
        2,
        runs
      ),
      runCase(`sandbox.snap.${n}`, 'sandbox', `snapPosition (n=${n})`, () => snapPosition(tiles, near, board), 2, runs),
      runCase(
        `sandbox.autorotate.${n}`,
        'sandbox',
        `autoRotatePlacement (n=${n})`,
        () => autoRotatePlacement(tiles, 'kite', { x: near.x, y: near.y }, 0, board),
        2,
        11
      )
    );
  }
  return entries;
};

export const collectSnapshot = (distDir = path.resolve('dist')): BenchSnapshot => {
  const largeHomes = newPuzzle('large', 42, true).map(p => p.home);
  const giantPieces = newPuzzle('giant', 42, true);
  const giantHomes = giantPieces.map(p => p.home);
  return {
    sha: currentSha(),
    timestamp: new Date().toISOString(),
    node: process.version,
    bundle: measureBundleDir(distDir),
    benchmarks: [
      ...runJigsawBenchmarks(giantPieces),
      ...runPictureBenchmarks(largeHomes, giantHomes),
      ...runSandboxBenchmarks(giantHomes)
    ]
  };
};

const flagValue = (args: string[], flag: string): string | undefined => {
  const idx = args.indexOf(flag);
  return idx >= 0 && idx + 1 < args.length && !args[idx + 1].startsWith('--') ? args[idx + 1] : undefined;
};

const readJson = <T>(file: string): T => JSON.parse(fs.readFileSync(file, 'utf8')) as T;

const handleCompare = (args: string[]) => {
  const idx = args.indexOf('--compare');
  const basePath = args[idx + 1];
  const headPath = args[idx + 2];
  if (!headPath) throw new Error('Usage: --compare <base.json|none> <head.json> [--md out.md]');
  const base = basePath !== 'none' && fs.existsSync(basePath) ? readJson<BenchSnapshot>(basePath) : null;
  const head = readJson<BenchSnapshot>(headPath);
  const md = formatMarkdownReport(compareBenchmarks(base, head), {
    marker: flagValue(args, '--marker'),
    trendUrl: flagValue(args, '--trend-url')
  });
  const mdOut = flagValue(args, '--md');
  if (mdOut) fs.writeFileSync(mdOut, md);
  else process.stdout.write(md);
};

const handleAppendHistory = (args: string[]) => {
  const idx = args.indexOf('--append-history');
  const histPath = args[idx + 1];
  const snapPath = args[idx + 2];
  if (!histPath || !snapPath) throw new Error('Usage: --append-history <history.json> <snapshot.json>');
  const existing = fs.existsSync(histPath) ? readJson<HistoryPoint[]>(histPath) : [];
  const next = appendHistory(existing, readJson<BenchSnapshot>(snapPath));
  fs.mkdirSync(path.dirname(path.resolve(histPath)), { recursive: true });
  fs.writeFileSync(histPath, JSON.stringify(next, null, 2) + '\n');
};

const main = () => {
  const args = process.argv.slice(2);
  if (args.includes('--compare')) {
    handleCompare(args);
    return;
  }
  if (args.includes('--append-history')) {
    handleAppendHistory(args);
    return;
  }

  const snapshot = collectSnapshot();
  if (args.includes('--json')) {
    const outPath = flagValue(args, '--json');
    const serialized = JSON.stringify(snapshot, null, 2) + '\n';
    if (outPath) fs.writeFileSync(outPath, serialized);
    else process.stdout.write(serialized);
    return;
  }

  const md = formatMarkdownReport(compareBenchmarks(null, snapshot));
  process.stdout.write(md);
};

main();
