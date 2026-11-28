import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  appendHistory,
  compareBenchmarks,
  formatDeltaBytes,
  formatDeltaPct,
  formatMarkdownReport,
  summarizeSamples,
  type BenchSnapshot,
  type HistoryPoint
} from './report';

const sampleSnapshot = (overrides: Partial<BenchSnapshot> = {}): BenchSnapshot => ({
  sha: '3ce5912',
  timestamp: '2026-11-28T00:00:00Z',
  node: 'v22.23.5',
  bundle: { jsBytes: 330_000, jsGzipBytes: 105_000, cssBytes: 28_000, cssGzipBytes: 5_800 },
  benchmarks: [
    { id: 'jigsaw.newPuzzle.giant', group: 'jigsaw', label: 'newPuzzle(giant)', runs: 11, medianMs: 100, p95Ms: 115 },
    {
      id: 'jigsaw.moveGroup.giant',
      group: 'jigsaw',
      label: 'moveGroup(giant)',
      runs: 200,
      medianMs: 0.02,
      p95Ms: 0.04
    },
    {
      id: 'pictures.topographic',
      group: 'pictures',
      label: 'Topographic (840×840)',
      runs: 5,
      medianMs: 800,
      p95Ms: 850
    },
    { id: 'sandbox.snap.100', group: 'sandbox', label: 'snapPosition (n=100)', runs: 15, medianMs: 2.0, p95Ms: 3.0 }
  ],
  ...overrides
});

test('summarizeSamples computes median and p95 for odd, even, and empty arrays', () => {
  assert.deepEqual(summarizeSamples([]), { medianMs: 0, p95Ms: 0 });
  assert.deepEqual(summarizeSamples([30, 10, 20]), { medianMs: 20, p95Ms: 30 });
  assert.deepEqual(summarizeSamples([40, 10, 20, 30]), { medianMs: 25, p95Ms: 40 });
  const twenty = Array.from({ length: 20 }, (_, i) => i + 1);
  assert.deepEqual(summarizeSamples(twenty), { medianMs: 10.5, p95Ms: 20 });
});

test('formatDeltaBytes and formatDeltaPct format signs and units cleanly', () => {
  assert.equal(formatDeltaBytes(0), '0 B');
  assert.equal(formatDeltaBytes(512), '+512 B');
  assert.equal(formatDeltaBytes(-512), '-512 B');
  assert.equal(formatDeltaBytes(2048), '+2.00 kB');
  assert.equal(formatDeltaBytes(-1536), '-1.50 kB');

  assert.equal(formatDeltaPct(100, 125), '+25.0%');
  assert.equal(formatDeltaPct(100, 80), '-20.0%');
  assert.equal(formatDeltaPct(0, 10), 'n/a');
});

test('compareBenchmarks flags real regressions, detects improvements, and ignores sub-millisecond jitter', () => {
  const base = sampleSnapshot();
  const head = sampleSnapshot({
    sha: 'abc1234',
    bundle: { jsBytes: 360_000, jsGzipBytes: 120_000, cssBytes: 28_000, cssGzipBytes: 5_800 },
    benchmarks: [
      // +30% and +30ms -> regression
      { id: 'jigsaw.newPuzzle.giant', group: 'jigsaw', label: 'newPuzzle(giant)', runs: 11, medianMs: 130, p95Ms: 140 },
      // +100% but only +0.02ms -> below 1.0ms noise floor, NOT a regression
      {
        id: 'jigsaw.moveGroup.giant',
        group: 'jigsaw',
        label: 'moveGroup(giant)',
        runs: 200,
        medianMs: 0.04,
        p95Ms: 0.06
      },
      // -50% and -400ms -> improvement
      {
        id: 'pictures.topographic',
        group: 'pictures',
        label: 'Topographic (840×840)',
        runs: 5,
        medianMs: 400,
        p95Ms: 420
      },
      // +10% -> within 20% tolerance
      { id: 'sandbox.snap.100', group: 'sandbox', label: 'snapPosition (n=100)', runs: 15, medianMs: 2.2, p95Ms: 3.1 }
    ]
  });

  const cmp = compareBenchmarks(base, head);
  assert.equal(cmp.bundle?.jsGzipRegressed, true, '+15 kB gzip exceeds 10 kB threshold');
  assert.equal(cmp.rows[0].regressed, true);
  assert.equal(cmp.rows[1].regressed, false, 'sub-millisecond jitter is ignored');
  assert.equal(cmp.rows[2].improved, true);
  assert.equal(cmp.rows[3].regressed, false);
  assert.equal(cmp.regressionCount, 2);

  const md = formatMarkdownReport(cmp, { marker: '<!-- perf-report -->', trendUrl: 'https://example.com/perf/' });
  assert.match(md, /^<!-- perf-report -->/);
  assert.match(md, /2 potential regression\(s\) flagged/);
  assert.match(md, /newPuzzle\(giant\) \| 100\.00 ms \| 130\.00 ms \| \+30\.0% ⚠️/);
  assert.match(md, /Topographic \(840×840\) \| 800\.00 ms \| 400\.00 ms \| -50\.0% 🚀/);
  assert.match(md, /\[View trend dashboard\]\(https:\/\/example\.com\/perf\/\)/);
});

test('formatMarkdownReport handles standalone baseline snapshots cleanly when base is null', () => {
  const cmp = compareBenchmarks(null, sampleSnapshot());
  assert.equal(cmp.regressionCount, 0);
  const md = formatMarkdownReport(cmp);
  assert.match(md, /baseline snapshot/);
  assert.match(md, /\| Group \| Benchmark \| Median \| p95 \|/);
});

test('appendHistory deduplicates by sha and caps entries at maxEntries', () => {
  const initial: HistoryPoint[] = [
    { sha: 'aaa', timestamp: '2026-11-25T00:00:00Z', bundle: null, medians: { a: 10 } },
    { sha: 'bbb', timestamp: '2026-11-26T00:00:00Z', bundle: null, medians: { a: 12 } }
  ];
  const updated = appendHistory(initial, sampleSnapshot({ sha: 'bbb' }), 3);
  assert.equal(updated.length, 2, 're-running same sha replaces rather than duplicates');
  assert.equal(updated[1].sha, 'bbb');
  assert.equal(updated[1].medians['jigsaw.newPuzzle.giant'], 100);

  const capped = appendHistory(updated, sampleSnapshot({ sha: 'ccc' }), 2);
  assert.deepEqual(
    capped.map(p => p.sha),
    ['bbb', 'ccc'],
    'oldest point is dropped when exceeding maxEntries'
  );
});
