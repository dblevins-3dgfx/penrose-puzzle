// Pure performance measurement, comparison, history, and Markdown reporting
// helpers (issue #86). Kept plain and side-effect free (except optional
// filesystem bundle reading) so formatting, delta math, thresholds, and
// history capping are unit-tested in perf/report.test.ts.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

export interface BundleMetrics {
  jsBytes: number;
  jsGzipBytes: number;
  cssBytes: number;
  cssGzipBytes: number;
}

export type BenchGroup = 'jigsaw' | 'pictures' | 'sandbox';

export interface BenchEntry {
  id: string;
  group: BenchGroup;
  label: string;
  runs: number;
  medianMs: number;
  p95Ms: number;
}

export interface BenchSnapshot {
  sha: string;
  timestamp: string;
  node: string;
  bundle: BundleMetrics | null;
  benchmarks: BenchEntry[];
}

export interface HistoryPoint {
  sha: string;
  timestamp: string;
  bundle: BundleMetrics | null;
  medians: Record<string, number>;
}

export interface ComparisonThresholds {
  bundleGzipWarnBytes: number;
  benchWarnPct: number;
  benchWarnMinDeltaMs: number;
}

export const DEFAULT_THRESHOLDS: ComparisonThresholds = {
  bundleGzipWarnBytes: 10_240, // 10 kB gzip
  benchWarnPct: 20, // +20% slower
  benchWarnMinDeltaMs: 1.0 // ignore sub-millisecond micro-jitter
};

export interface BundleComparison {
  jsDeltaBytes: number;
  jsGzipDeltaBytes: number;
  cssDeltaBytes: number;
  cssGzipDeltaBytes: number;
  jsGzipRegressed: boolean;
}

export interface BenchComparisonRow {
  entry: BenchEntry;
  baseMedianMs: number | null;
  deltaMs: number | null;
  deltaPct: number | null;
  regressed: boolean;
  improved: boolean;
}

export interface ComparisonResult {
  base: BenchSnapshot | null;
  head: BenchSnapshot;
  bundle: BundleComparison | null;
  rows: BenchComparisonRow[];
  regressionCount: number;
}

const round = (n: number, digits = 2): number => Number(n.toFixed(digits));

// Computes median and p95 from a non-empty list of millisecond samples.
export const summarizeSamples = (samples: readonly number[]): { medianMs: number; p95Ms: number } => {
  if (samples.length === 0) return { medianMs: 0, p95Ms: 0 };
  const sorted = [...samples].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const p95Idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
  return { medianMs: round(median, 2), p95Ms: round(sorted[p95Idx], 2) };
};

// Measures total raw & gzipped JS and CSS asset sizes inside `dist/assets`.
export const measureBundleDir = (distDir: string): BundleMetrics | null => {
  const assetsDir = path.join(distDir, 'assets');
  if (!fs.existsSync(assetsDir)) return null;
  let jsBytes = 0;
  let jsGzipBytes = 0;
  let cssBytes = 0;
  let cssGzipBytes = 0;
  for (const name of fs.readdirSync(assetsDir)) {
    const file = path.join(assetsDir, name);
    if (!fs.statSync(file).isFile()) continue;
    if (name.endsWith('.js')) {
      const buf = fs.readFileSync(file);
      jsBytes += buf.length;
      jsGzipBytes += zlib.gzipSync(buf, { level: 9 }).length;
    } else if (name.endsWith('.css')) {
      const buf = fs.readFileSync(file);
      cssBytes += buf.length;
      cssGzipBytes += zlib.gzipSync(buf, { level: 9 }).length;
    }
  }
  return { jsBytes, jsGzipBytes, cssBytes, cssGzipBytes };
};

export const formatKb = (bytes: number): string => `${(bytes / 1024).toFixed(2)} kB`;

export const formatDeltaBytes = (delta: number): string => {
  if (delta === 0) return '0 B';
  const sign = delta > 0 ? '+' : '-';
  const abs = Math.abs(delta);
  return abs >= 1024 ? `${sign}${(abs / 1024).toFixed(2)} kB` : `${sign}${abs} B`;
};

export const formatDeltaPct = (base: number, head: number): string => {
  if (base <= 0) return 'n/a';
  const pct = ((head - base) / base) * 100;
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
};

export const compareBenchmarks = (
  base: BenchSnapshot | null,
  head: BenchSnapshot,
  thresholds: ComparisonThresholds = DEFAULT_THRESHOLDS
): ComparisonResult => {
  let bundle: BundleComparison | null = null;
  if (base?.bundle && head.bundle) {
    const jsGzipDeltaBytes = head.bundle.jsGzipBytes - base.bundle.jsGzipBytes;
    bundle = {
      jsDeltaBytes: head.bundle.jsBytes - base.bundle.jsBytes,
      jsGzipDeltaBytes,
      cssDeltaBytes: head.bundle.cssBytes - base.bundle.cssBytes,
      cssGzipDeltaBytes: head.bundle.cssGzipBytes - base.bundle.cssGzipBytes,
      jsGzipRegressed: jsGzipDeltaBytes > thresholds.bundleGzipWarnBytes
    };
  }

  const baseById = new Map((base?.benchmarks ?? []).map(b => [b.id, b]));
  const rows: BenchComparisonRow[] = head.benchmarks.map(entry => {
    const prev = baseById.get(entry.id);
    if (!prev) {
      return { entry, baseMedianMs: null, deltaMs: null, deltaPct: null, regressed: false, improved: false };
    }
    const deltaMs = round(entry.medianMs - prev.medianMs, 2);
    const deltaPct = prev.medianMs > 0 ? round(((entry.medianMs - prev.medianMs) / prev.medianMs) * 100, 1) : null;
    const regressed =
      deltaPct !== null && deltaPct >= thresholds.benchWarnPct && deltaMs >= thresholds.benchWarnMinDeltaMs;
    const improved =
      deltaPct !== null && deltaPct <= -thresholds.benchWarnPct && -deltaMs >= thresholds.benchWarnMinDeltaMs;
    return { entry, baseMedianMs: prev.medianMs, deltaMs, deltaPct, regressed, improved };
  });

  const regressionCount = (bundle?.jsGzipRegressed ? 1 : 0) + rows.filter(r => r.regressed).length;
  return { base, head, bundle, rows, regressionCount };
};

const GROUP_LABELS: Record<BenchGroup, string> = {
  jigsaw: 'Jigsaw',
  pictures: 'Pictures',
  sandbox: 'Sandbox'
};

const formatBundleSection = (comparison: ComparisonResult): string[] => {
  const { base, head, bundle } = comparison;
  if (!head.bundle) return [];
  const lines = ['### Bundle size', ''];
  if (base?.bundle && bundle) {
    const jsWarn = bundle.jsGzipRegressed ? ' ⚠️' : '';
    lines.push(
      '| Asset | Base | PR | Delta |',
      '|---|---:|---:|---:|',
      `| JS (gzip) | ${formatKb(base.bundle.jsGzipBytes)} | ${formatKb(head.bundle.jsGzipBytes)} | ${formatDeltaBytes(bundle.jsGzipDeltaBytes)}${jsWarn} |`,
      `| JS (raw) | ${formatKb(base.bundle.jsBytes)} | ${formatKb(head.bundle.jsBytes)} | ${formatDeltaBytes(bundle.jsDeltaBytes)} |`,
      `| CSS (gzip) | ${formatKb(base.bundle.cssGzipBytes)} | ${formatKb(head.bundle.cssGzipBytes)} | ${formatDeltaBytes(bundle.cssGzipDeltaBytes)} |`
    );
  } else {
    lines.push(
      '| Asset | Raw | Gzip |',
      '|---|---:|---:|',
      `| JS | ${formatKb(head.bundle.jsBytes)} | ${formatKb(head.bundle.jsGzipBytes)} |`,
      `| CSS | ${formatKb(head.bundle.cssBytes)} | ${formatKb(head.bundle.cssGzipBytes)} |`
    );
  }
  lines.push('');
  return lines;
};

export interface MarkdownReportOptions {
  marker?: string;
  trendUrl?: string;
}

export const formatMarkdownReport = (comparison: ComparisonResult, opts: MarkdownReportOptions = {}): string => {
  const { base, head, rows, regressionCount } = comparison;
  const lines: string[] = [];
  if (opts.marker) lines.push(opts.marker);

  const status =
    regressionCount > 0 ? `⚠️ ${regressionCount} potential regression(s) flagged` : '✅ No regressions flagged';
  const shaNote = base ? `\`${base.sha}\` → \`${head.sha}\` (same-runner A/B)` : `\`${head.sha}\` (baseline snapshot)`;
  lines.push(`## Performance Report`, '', `${status} · ${shaNote} · Node ${head.node}`, '');
  lines.push(...formatBundleSection(comparison));

  lines.push('### Benchmarks (median ms)', '');
  if (base) {
    lines.push('| Group | Benchmark | Base | PR | Delta |', '|---|---|---:|---:|---:|');
    for (const r of rows) {
      const baseCell = r.baseMedianMs !== null ? `${r.baseMedianMs.toFixed(2)} ms` : '—';
      const headCell = `${r.entry.medianMs.toFixed(2)} ms`;
      const flag = r.regressed ? ' ⚠️' : r.improved ? ' 🚀' : '';
      const deltaCell = r.baseMedianMs !== null ? `${formatDeltaPct(r.baseMedianMs, r.entry.medianMs)}${flag}` : 'new';
      lines.push(`| ${GROUP_LABELS[r.entry.group]} | ${r.entry.label} | ${baseCell} | ${headCell} | ${deltaCell} |`);
    }
  } else {
    lines.push('| Group | Benchmark | Median | p95 |', '|---|---|---:|---:|');
    for (const r of rows) {
      lines.push(
        `| ${GROUP_LABELS[r.entry.group]} | ${r.entry.label} | ${r.entry.medianMs.toFixed(2)} ms | ${r.entry.p95Ms.toFixed(2)} ms |`
      );
    }
  }

  lines.push(
    '',
    '<sub>Informational check: flags JS gzip delta > 10 kB or benchmark slowdown ≥ 20% and ≥ 1.0 ms.' +
      (opts.trendUrl ? ` [View trend dashboard](${opts.trendUrl})` : '') +
      '</sub>'
  );
  return lines.join('\n') + '\n';
};

// Appends or updates a commit's summary in the longitudinal trend history,
// capping total points to `maxEntries` so `perf/history.json` stays compact.
export const appendHistory = (
  existing: readonly HistoryPoint[],
  snapshot: BenchSnapshot,
  maxEntries = 200
): HistoryPoint[] => {
  const medians: Record<string, number> = {};
  for (const b of snapshot.benchmarks) medians[b.id] = b.medianMs;
  const point: HistoryPoint = {
    sha: snapshot.sha,
    timestamp: snapshot.timestamp,
    bundle: snapshot.bundle,
    medians
  };
  const filtered = existing.filter(e => e.sha !== snapshot.sha);
  const next = [...filtered, point];
  return next.length > maxEntries ? next.slice(next.length - maxEntries) : next;
};
