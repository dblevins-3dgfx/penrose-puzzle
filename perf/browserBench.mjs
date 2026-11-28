// Optional headless Chrome CDP runtime benchmark (issue #86, Tier 3).
// Connects to a running Chrome DevTools port (default 9222) and `vite preview`
// (default http://localhost:4173) to measure cold load, picture switch latency,
// Giant (100-piece) drag frame times (1x and 4x CPU throttling), and JS heap.
const PORT = process.env.CDP_PORT || '9222';
const URL = process.env.PREVIEW_URL || 'http://localhost:4173/?seed=42';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
const page = targets.find(t => t.type === 'page') ?? targets[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(resolve => ws.addEventListener('open', resolve));

let nextId = 1;
const pending = new Map();
ws.addEventListener('message', ev => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(msg.error.message));
    else resolve(msg.result);
  }
});

const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });

const evalJs = async expr => {
  const res = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (res.exceptionDetails) throw new Error(res.exceptionDetails.text || 'JS error');
  return res.result?.value;
};

const getMetrics = async () => {
  const { metrics } = await send('Performance.getMetrics');
  return Object.fromEntries(metrics.map(m => [m.name, m.value]));
};

await send('Page.enable');
await send('Performance.enable');
await send('HeapProfiler.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 800, deviceScaleFactor: 2, mobile: false });

await send('Page.navigate', { url: URL });
await sleep(900);
await evalJs(`localStorage.clear()`);
await send('Page.reload', { ignoreCache: true });
await sleep(900);

const loadTiming = await evalJs(`(() => {
  const nav = performance.getEntriesByType('navigation')[0];
  const paints = Object.fromEntries(performance.getEntriesByType('paint').map(p => [p.name, p.startTime]));
  return {
    domContentLoadedMs: nav ? Math.round(nav.domContentLoadedEventEnd * 10) / 10 : null,
    loadEventMs: nav ? Math.round(nav.loadEventEnd * 10) / 10 : null,
    firstPaintMs: paints['first-paint'] ? Math.round(paints['first-paint'] * 10) / 10 : null,
    firstContentfulPaintMs: paints['first-contentful-paint'] ? Math.round(paints['first-contentful-paint'] * 10) / 10 : null
  };
})()`);
const heapInitial = await getMetrics();

const measureActionMs = async actionJs =>
  evalJs(`new Promise(resolve => {
    const t0 = performance.now();
    ${actionJs}
    requestAnimationFrame(() => requestAnimationFrame(() => resolve(Math.round((performance.now() - t0) * 10) / 10)));
  })`);

const selectPicture = style => `
  const sel = document.querySelector('select[aria-label="Puzzle picture"]');
  sel.value = ${JSON.stringify(style)};
  sel.dispatchEvent(new Event('change', { bubbles: true }));
`;

const styles = await evalJs(
  `[...document.querySelector('select[aria-label="Puzzle picture"]').options].map(o => o.value)`
);
const pictureSwitchMedium = {};
for (const s of styles) pictureSwitchMedium[s] = await measureActionMs(selectPicture(s));

// Switch to Giant (100 pieces) via Settings
await evalJs(`document.querySelector('button[aria-label="Settings"]').click()`);
await sleep(150);
for (let i = 0; i < 3; i++) {
  await evalJs(`document.querySelector('button[aria-label="Next puzzle size"]').click()`);
  await sleep(150);
}
await evalJs(`document.querySelector('button[aria-label="Close"]').click()`);
await sleep(300);

const pictureSwitchGiant = {};
for (const s of styles) pictureSwitchGiant[s] = await measureActionMs(selectPicture(s));

// Pop one piece and measure drag frames at 1x and 4x CPU throttling
const trayBox = await evalJs(`(() => {
  const btn = document.querySelector('aside[aria-label="Piece tray"] button canvas')?.closest('button');
  if (!btn) return null;
  const r = btn.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
})()`);
if (trayBox) {
  await send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: trayBox.x,
    y: trayBox.y,
    button: 'left',
    clickCount: 1
  });
  await send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: trayBox.x,
    y: trayBox.y,
    button: 'left',
    clickCount: 1
  });
  await sleep(150);
}

const measureDragFrames = async throttleRate => {
  await send('Emulation.setCPUThrottlingRate', { rate: throttleRate });
  await sleep(100);
  const boardBox = await evalJs(`(() => {
    const r = document.querySelector('canvas').getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  })()`);
  await evalJs(`(() => {
    window.__frames = [];
    window.__recording = true;
    let last = performance.now();
    const tick = now => {
      window.__frames.push(now - last);
      last = now;
      if (window.__recording) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  })()`);
  const cx = boardBox.x + boardBox.w / 2;
  const cy = boardBox.y + boardBox.h / 2;
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: cx, y: cy, button: 'left', clickCount: 1 });
  for (let i = 1; i <= 25; i++) {
    await send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: cx + Math.cos(i * 0.28) * 90,
      y: cy + Math.sin(i * 0.28) * 60,
      button: 'left',
      buttons: 1
    });
    await sleep(16);
  }
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cx, y: cy, button: 'left', clickCount: 1 });
  await sleep(100);
  const stats = await evalJs(`(() => {
    window.__recording = false;
    const f = window.__frames.slice(1).sort((a, b) => a - b);
    const mean = f.reduce((a, b) => a + b, 0) / (f.length || 1);
    return {
      frames: f.length,
      medianMs: Math.round((f[Math.floor(f.length / 2)] || 0) * 10) / 10,
      p95Ms: Math.round((f[Math.floor(f.length * 0.95)] || 0) * 10) / 10,
      maxMs: Math.round((f[f.length - 1] || 0) * 10) / 10,
      meanMs: Math.round(mean * 10) / 10
    };
  })()`);
  await send('Emulation.setCPUThrottlingRate', { rate: 1 });
  return stats;
};

const drag1x = await measureDragFrames(1);
const drag4x = await measureDragFrames(4);

for (let i = 0; i < 5; i++) {
  await measureActionMs(`document.querySelector('button[aria-label="New puzzle"]').click();`);
}
await send('HeapProfiler.collectGarbage');
await sleep(150);
const heapAfter = await getMetrics();

const result = {
  loadTiming,
  pictureSwitchMediumMs: pictureSwitchMedium,
  pictureSwitchGiantMs: pictureSwitchGiant,
  dragGiant1x: drag1x,
  dragGiant4x: drag4x,
  heapMb: {
    initialUsed: Math.round((heapInitial.JSHeapUsedSize / 1048576) * 10) / 10,
    afterGiantChurnUsed: Math.round((heapAfter.JSHeapUsedSize / 1048576) * 10) / 10
  }
};

if (process.argv.includes('--markdown')) {
  const lines = [
    '## Browser Runtime Profile (Headless Chrome, 1200×800 @ DPR 2)',
    '',
    `- **Load:** FP ${loadTiming.firstPaintMs} ms · DCL ${loadTiming.domContentLoadedMs} ms · FCP ${loadTiming.firstContentfulPaintMs} ms`,
    `- **JS Heap:** ${result.heapMb.initialUsed} MB initial → ${result.heapMb.afterGiantChurnUsed} MB after 5× Giant New puzzle + GC`,
    `- **Giant (100-piece) drag:** 1× CPU median ${drag1x.medianMs} ms (p95 ${drag1x.p95Ms} ms) · 4× CPU median ${drag4x.medianMs} ms (p95 ${drag4x.p95Ms} ms)`,
    '',
    '| Picture | Medium (24) | Giant (100) |',
    '|---|---:|---:|',
    ...styles.map(s => `| \`${s}\` | ${pictureSwitchMedium[s]} ms | ${pictureSwitchGiant[s]} ms |`),
    ''
  ];
  process.stdout.write(lines.join('\n'));
} else {
  console.log(JSON.stringify(result, null, 2));
}
ws.close();
