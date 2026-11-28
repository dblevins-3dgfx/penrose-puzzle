// Backfills longitudinal performance history across recent first-parent commits
// (e.g. the previous 10 merged PRs on main) using temporary git worktrees so
// bundle sizes and benchmarks are measured on the same machine as future runs.
//
// Usage:
//   npx tsx perf/backfill.ts --count 10 --out path/to/history.json
//   npx tsx perf/backfill.ts --worktree <dir> --sha <sha> --timestamp <iso> --out <snap.json>
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import type { Tile } from '../rules';
import {
  appendHistory,
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

const importIfExists = async <T>(worktree: string, candidates: readonly string[]): Promise<T | null> => {
  for (const rel of candidates) {
    const full = path.join(worktree, rel);
    if (fs.existsSync(full)) return (await import(pathToFileURL(full).href)) as T;
  }
  return null;
};

interface RulesMod {
  autoRotatePlacement: (
    tiles: readonly Tile[],
    type: 'kite' | 'dart',
    p: { x: number; y: number },
    choice: number,
    board?: { width: number; height: number }
  ) => unknown;
  findConnectedEdges: (tiles: readonly Tile[]) => unknown;
  isLegalPlacement: (
    tiles: readonly Tile[],
    tile: Tile,
    first?: boolean,
    board?: { width: number; height: number }
  ) => unknown;
  snapPosition: (tiles: readonly Tile[], tile: Tile, board?: { width: number; height: number }) => unknown;
}

interface JigsawPiece {
  id: number;
  x: number;
  y: number;
  rotation: number;
  home: Tile;
  locked: boolean;
  inTray: boolean;
}

interface JigsawMod {
  newPuzzle: (size: string, seed: number, symmetric?: boolean) => JigsawPiece[];
  pieceAt: (pieces: readonly JigsawPiece[], p: { x: number; y: number }) => number;
  moveGroup: (
    pieces: readonly JigsawPiece[],
    id: number,
    dx: number,
    dy: number,
    board: { width: number; height: number }
  ) => JigsawPiece[];
  settleGroup: (pieces: readonly JigsawPiece[], id: number) => JigsawPiece[];
  detectCelebrations: (prev: readonly JigsawPiece[], next: readonly JigsawPiece[]) => unknown;
}

interface SettingsMod {
  PUZZLE_SIZES: readonly string[];
}

interface PenroseMod {
  pictureTiles: (style: string, homes: readonly Tile[], seed: number) => unknown;
}

interface TopoMod {
  TOPO_CANVAS_SIZE: number;
  renderTopographicPixels: (size: number, seed: number) => unknown;
}

interface StarMod {
  STAR_CHART_SIZE: number;
  starChartLayoutForSeed: (size: number, seed: number) => unknown;
}

const runJigsawGroup = (jigsaw: JigsawMod, settings: SettingsMod, giantPieces: JigsawPiece[]): BenchEntry[] => {
  const entries: BenchEntry[] = settings.PUZZLE_SIZES.map(size =>
    runCase(
      `jigsaw.newPuzzle.${size}`,
      'jigsaw',
      `newPuzzle(${size}, sym)`,
      () => jigsaw.newPuzzle(size, 42, true),
      2,
      9
    )
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
  const jBoard = { width: 1200, height: 800 };
  const moved = jigsaw.moveGroup(midGame, looseId, 5, 5, jBoard);

  entries.push(
    runCase('jigsaw.pieceAt.giant', 'jigsaw', 'pieceAt (giant)', () => jigsaw.pieceAt(midGame, hitPt), 5, 150),
    runCase(
      'jigsaw.moveGroup.giant',
      'jigsaw',
      'moveGroup (giant)',
      () => jigsaw.moveGroup(midGame, looseId, 4, -3, jBoard),
      5,
      150
    ),
    runCase(
      'jigsaw.settleGroup.giant',
      'jigsaw',
      'settleGroup (giant)',
      () => jigsaw.settleGroup(moved, looseId),
      5,
      150
    ),
    runCase(
      'jigsaw.celebrations.giant',
      'jigsaw',
      'detectCelebrations (giant)',
      () => jigsaw.detectCelebrations(midGame, moved),
      5,
      150
    )
  );
  return entries;
};

const runPictureGroup = (
  penrose: PenroseMod | null,
  topo: TopoMod | null,
  star: StarMod | null,
  largeHomes: Tile[],
  giantHomes: Tile[]
): BenchEntry[] => {
  const entries: BenchEntry[] = [];
  if (penrose) {
    entries.push(
      runCase(
        'pictures.matching.large',
        'pictures',
        'Penrose Matching (large-40)',
        () => penrose.pictureTiles('matching', largeHomes, 42),
        3,
        40
      ),
      runCase(
        'pictures.subdivided.giant',
        'pictures',
        'Penrose Subdivided (giant-100)',
        () => penrose.pictureTiles('subdivided', giantHomes, 42),
        2,
        9
      ),
      runCase(
        'pictures.independent.giant',
        'pictures',
        'Penrose Independent (giant-100)',
        () => penrose.pictureTiles('independent', giantHomes, 42),
        2,
        7
      )
    );
  }
  if (topo) {
    entries.push(
      runCase(
        'pictures.topographic',
        'pictures',
        `Topographic (${topo.TOPO_CANVAS_SIZE}×${topo.TOPO_CANVAS_SIZE})`,
        () => topo.renderTopographicPixels(topo.TOPO_CANVAS_SIZE, 42),
        1,
        3
      )
    );
  }
  if (star) {
    entries.push(
      runCase(
        'pictures.starchart',
        'pictures',
        `Star Chart layout (${star.STAR_CHART_SIZE})`,
        () => star.starChartLayoutForSeed(star.STAR_CHART_SIZE, 42),
        5,
        80
      )
    );
  }
  return entries;
};

const runSandboxGroup = (rules: RulesMod, giantHomes: Tile[]): BenchEntry[] => {
  const allTiles: Tile[] = giantHomes.map(t => ({ ...t, x: t.x + 500, y: t.y + 300 }));
  const sBoard = { width: 1600, height: 1200 };
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
        () => rules.findConnectedEdges(tiles),
        2,
        runs
      ),
      runCase(
        `sandbox.legal.${n}`,
        'sandbox',
        `isLegalPlacement (n=${n})`,
        () => rules.isLegalPlacement(tiles, probe, false, sBoard),
        2,
        runs
      ),
      runCase(
        `sandbox.snap.${n}`,
        'sandbox',
        `snapPosition (n=${n})`,
        () => rules.snapPosition(tiles, near, sBoard),
        2,
        runs
      ),
      runCase(
        `sandbox.autorotate.${n}`,
        'sandbox',
        `autoRotatePlacement (n=${n})`,
        () => rules.autoRotatePlacement(tiles, 'kite', { x: near.x, y: near.y }, 0, sBoard),
        2,
        11
      )
    );
  }
  return entries;
};

const benchmarkWorktree = async (worktree: string, sha: string, timestamp: string): Promise<BenchSnapshot> => {
  const rules = await importIfExists<RulesMod>(worktree, ['rules.ts']);
  const jigsaw = await importIfExists<JigsawMod>(worktree, ['jigsaw.ts']);
  const settings = await importIfExists<SettingsMod>(worktree, ['settings.ts']);
  const penrose = await importIfExists<PenroseMod>(worktree, ['pictures/penrose.ts', 'penrosePicture.ts']);
  const topo = await importIfExists<TopoMod>(worktree, ['pictures/topographic.ts', 'topographicPicture.ts']);
  const star = await importIfExists<StarMod>(worktree, ['pictures/starChart.ts']);
  if (!rules || !jigsaw || !settings) throw new Error(`Missing core modules in ${worktree}`);

  const largeHomes = jigsaw.newPuzzle('large', 42, true).map(p => p.home);
  const giantPieces = jigsaw.newPuzzle('giant', 42, true);
  const giantHomes = giantPieces.map(p => p.home);

  return {
    sha,
    timestamp,
    node: process.version,
    bundle: measureBundleDir(path.join(worktree, 'dist')),
    benchmarks: [
      ...runJigsawGroup(jigsaw, settings, giantPieces),
      ...runPictureGroup(penrose, topo, star, largeHomes, giantHomes),
      ...runSandboxGroup(rules, giantHomes)
    ]
  };
};

const flagValue = (args: string[], flag: string): string | undefined => {
  const idx = args.indexOf(flag);
  return idx >= 0 && idx + 1 < args.length && !args[idx + 1].startsWith('--') ? args[idx + 1] : undefined;
};

const runBackfill = (ref: string, count: number, outPath: string) => {
  const raw = execFileSync('git', ['log', '--first-parent', ref, '-n', String(count), '--format=%h %cI'], {
    encoding: 'utf8'
  }).trim();
  if (!raw) return;
  // Chronological order: oldest -> newest
  const commits = raw
    .split('\n')
    .reverse()
    .map(line => {
      const [sha, timestamp] = line.trim().split(' ');
      return { sha, timestamp };
    });

  let history: HistoryPoint[] = fs.existsSync(outPath)
    ? (JSON.parse(fs.readFileSync(outPath, 'utf8')) as HistoryPoint[])
    : [];
  const rootModules = path.resolve('node_modules');
  const scriptPath = path.resolve('perf/backfill.ts');
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'penrose-perf-backfill-'));

  try {
    for (const { sha, timestamp } of commits) {
      if (history.some(h => h.sha === sha)) {
        process.stderr.write(`Skipping already-recorded ${sha}\n`);
        continue;
      }
      const wt = path.join(tmpRoot, `wt-${sha}`);
      const snapFile = path.join(tmpRoot, `snap-${sha}.json`);
      process.stderr.write(`Backfilling ${sha} (${timestamp.slice(0, 10)})...\n`);
      execFileSync('git', ['worktree', 'add', '--detach', wt, sha], { stdio: 'ignore' });
      try {
        // Reuse current node_modules via symlink so Vite & tsx build rapidly
        fs.symlinkSync(rootModules, path.join(wt, 'node_modules'), 'dir');
        execFileSync('npm', ['run', 'build'], { cwd: wt, stdio: 'ignore' });
        execFileSync(
          'npx',
          ['tsx', scriptPath, '--worktree', wt, '--sha', sha, '--timestamp', timestamp, '--out', snapFile],
          { stdio: 'inherit' }
        );
        const snap = JSON.parse(fs.readFileSync(snapFile, 'utf8')) as BenchSnapshot;
        history = appendHistory(history, snap);
      } finally {
        execFileSync('git', ['worktree', 'remove', '--force', wt], { stdio: 'ignore' });
      }
    }
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }

  fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(history, null, 2) + '\n');
  process.stderr.write(`Wrote ${history.length} snapshots to ${outPath}\n`);
};

const main = async () => {
  const args = process.argv.slice(2);
  const worktree = flagValue(args, '--worktree');
  if (worktree) {
    const sha = flagValue(args, '--sha') ?? 'unknown';
    const timestamp = flagValue(args, '--timestamp') ?? new Date().toISOString();
    const out = flagValue(args, '--out');
    const snap = await benchmarkWorktree(worktree, sha, timestamp);
    const json = JSON.stringify(snap, null, 2) + '\n';
    if (out) fs.writeFileSync(out, json);
    else process.stdout.write(json);
    return;
  }

  const ref = flagValue(args, '--ref') ?? 'HEAD~1';
  const count = Number(flagValue(args, '--count') ?? '10');
  const outPath = flagValue(args, '--out');
  if (!outPath) throw new Error('Usage: backfill.ts --count <N> --out <history.json> [--ref HEAD~1]');
  runBackfill(ref, count, outPath);
};

await main();
