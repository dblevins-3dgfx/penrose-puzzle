import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PICTURE_STYLE, PICTURE_PLUGINS, PICTURE_STYLES, getPicturePlugin } from './index';

test('PICTURE_PLUGINS has unique ids, non-empty labels, and render functions', () => {
  assert.ok(PICTURE_PLUGINS.length > 0);
  const seen = new Set<string>();
  for (const plugin of PICTURE_PLUGINS) {
    assert.ok(plugin.id.length > 0, 'plugin id is non-empty');
    assert.ok(!seen.has(plugin.id), `duplicate plugin id: ${plugin.id}`);
    seen.add(plugin.id);
    assert.ok(plugin.label.trim().length > 0, `${plugin.id} has a label`);
    assert.equal(typeof plugin.render, 'function', `${plugin.id} has a render function`);
  }
});

test('PICTURE_STYLES, DEFAULT_PICTURE_STYLE, and getPicturePlugin stay in sync with PICTURE_PLUGINS', () => {
  assert.deepEqual(
    PICTURE_STYLES,
    PICTURE_PLUGINS.map(p => p.id)
  );
  assert.ok(PICTURE_STYLES.includes(DEFAULT_PICTURE_STYLE));
  for (const plugin of PICTURE_PLUGINS) {
    assert.equal(getPicturePlugin(plugin.id), plugin);
  }
});
