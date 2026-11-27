import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS } from './settings';
import { formatDebugInfo, sanitizeUrl, type DebugEnvironment } from './debugInfo';

const sampleEnv: DebugEnvironment = {
  url: 'https://dblevins-3dgfx.github.io/penrose-puzzle/?seed=42#section',
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
  displayMode: 'standalone',
  windowSize: { width: 390, height: 844 },
  visualViewport: { width: 390, height: 760 },
  boardSize: { width: 390, height: 592 },
  dpr: 3,
  orientation: 'portrait',
  maxTouchPoints: 5,
  reducedMotion: false
};

test('sanitizeUrl keeps origin, path, and query while stripping fragments and tolerating bad URLs', () => {
  assert.equal(
    sanitizeUrl('https://dblevins-3dgfx.github.io/penrose-puzzle/?seed=42#top'),
    'https://dblevins-3dgfx.github.io/penrose-puzzle/?seed=42'
  );
  assert.equal(sanitizeUrl('not a url'), 'not a url');
});

test('formatDebugInfo formats Jigsaw state with rounded camera, seed, progress, tray, and settings', () => {
  const out = formatDebugInfo({
    mode: 'jigsaw',
    env: sampleEnv,
    settings: { ...DEFAULT_SETTINGS, sound: true },
    camera: { zoom: 2.3456, panX: -120.44, panY: 18.76 },
    layoutScale: 1.23456,
    size: 'small',
    seed: 42,
    picture: 'subdivided',
    placed: 11,
    total: 12,
    solved: false,
    trayAll: 1,
    trayEdges: 0,
    trayFilter: 'all'
  });

  assert.match(out, /^Penrose Puzzle debug info\n/);
  assert.match(out, /mode: jigsaw/);
  assert.match(out, /url: https:\/\/dblevins-3dgfx\.github\.io\/penrose-puzzle\/\?seed=42$/m);
  assert.match(out, /display: standalone, portrait, dpr=3, touch=5, reducedMotion=false/);
  assert.match(out, /viewport: window=390x844, visual=390x760, board=390x592/);
  assert.match(out, /camera: zoom=2\.35, pan=\(-120\.4, 18\.8\), layoutScale=1\.235/);
  assert.match(out, /puzzle: size=small, seed=42, picture=subdivided/);
  assert.match(out, /progress: 11\/12 \(solved=false\), tray=1 all \/ 0 edges \(filter=all\)/);
  assert.match(out, /settings: showPicture=false, showOutlines=true, symmetric=true, effects=true, sound=true/);
  assert.match(out, /ua: Mozilla\/5\.0 \(iPhone/);
});

test('formatDebugInfo formats Sandbox state and handles missing visualViewport cleanly', () => {
  const out = formatDebugInfo({
    mode: 'sandbox',
    env: { ...sampleEnv, displayMode: 'browser', orientation: 'landscape', visualViewport: null },
    settings: DEFAULT_SETTINGS,
    camera: { zoom: 0.5, panX: 120, panY: 40 },
    kites: 6,
    darts: 4,
    autoRotate: true,
    hasLooseTile: true
  });

  assert.match(out, /mode: sandbox/);
  assert.match(out, /display: browser, landscape/);
  assert.match(out, /visual=n\/a/);
  assert.match(out, /camera: zoom=0\.5, pan=\(120, 40\)/);
  assert.match(out, /sandbox: kites=6, darts=4, autoRotate=true, looseTile=true/);
  assert.match(out, /settings: vertexDots=true, matchingArcs=false, effects=true, sound=false/);
});
