import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SETTINGS,
  PICTURE_STYLES,
  PUZZLE_SIZES,
  parseSettings,
  sandboxTileDecorations,
  serializeSettings,
  stepPuzzleSize
} from './settings';

test('by default the picture is hidden, tile outlines, symmetric layout, effects, and vertex dots are on, picture is subdivided, size is medium, and sound and matching arcs are off', () => {
  assert.deepEqual(DEFAULT_SETTINGS, {
    showPicture: false,
    showOutlines: true,
    picture: 'subdivided',
    size: 'medium',
    symmetric: true,
    effects: true,
    sound: false,
    vertexDots: true,
    matchingArcs: false
  });
});

test('saved settings are read back as they were saved', () => {
  const cases = [
    DEFAULT_SETTINGS,
    {
      showPicture: true,
      showOutlines: false,
      picture: 'matching' as const,
      size: 'small' as const,
      symmetric: true,
      effects: false,
      sound: true,
      vertexDots: false,
      matchingArcs: true
    },
    {
      showPicture: false,
      showOutlines: true,
      picture: 'independent' as const,
      size: 'large' as const,
      symmetric: false,
      effects: true,
      sound: false,
      vertexDots: true,
      matchingArcs: true
    },
    {
      showPicture: true,
      showOutlines: true,
      picture: 'sunset' as const,
      size: 'xl' as const,
      symmetric: true,
      effects: false,
      sound: false,
      vertexDots: false,
      matchingArcs: false
    },
    ...PICTURE_STYLES.map((picture, i) => ({
      ...DEFAULT_SETTINGS,
      picture,
      size: PUZZLE_SIZES[i % PUZZLE_SIZES.length]
    }))
  ];
  for (const settings of cases) {
    assert.deepEqual(parseSettings(serializeSettings(settings)), settings);
  }
});

test('stepPuzzleSize cycles through Small, Medium, Large, XL, Giant in both directions', () => {
  assert.deepEqual(PUZZLE_SIZES, ['small', 'medium', 'large', 'xl', 'giant']);
  assert.equal(stepPuzzleSize('small', 1), 'medium');
  assert.equal(stepPuzzleSize('medium', 1), 'large');
  assert.equal(stepPuzzleSize('large', 1), 'xl');
  assert.equal(stepPuzzleSize('xl', 1), 'giant');
  assert.equal(stepPuzzleSize('giant', 1), 'small', 'wraps forward from Giant to Small');
  assert.equal(stepPuzzleSize('small', -1), 'giant', 'wraps backward from Small to Giant');
  assert.equal(stepPuzzleSize('giant', -1), 'xl');
});

test('nothing saved, or something unreadable, gives the defaults', () => {
  assert.deepEqual(parseSettings(null), DEFAULT_SETTINGS);
  assert.deepEqual(parseSettings(''), DEFAULT_SETTINGS);
  assert.deepEqual(parseSettings('{not json'), DEFAULT_SETTINGS);
  assert.deepEqual(parseSettings('"a string"'), DEFAULT_SETTINGS);
  assert.deepEqual(parseSettings('null'), DEFAULT_SETTINGS);
  assert.deepEqual(parseSettings('[true, false]'), DEFAULT_SETTINGS);
});

test('a missing or wrongly typed setting falls back to its default; unknown ones are dropped', () => {
  assert.deepEqual(parseSettings('{"showPicture": true}'), {
    showPicture: true,
    showOutlines: true,
    picture: 'subdivided',
    size: 'medium',
    symmetric: true,
    effects: true,
    sound: false,
    vertexDots: true,
    matchingArcs: false
  });
  assert.deepEqual(
    parseSettings(
      '{"showPicture": "yes", "showOutlines": false, "picture": "sunset", "size": "large", "symmetric": false, "effects": false, "sound": true, "vertexDots": false, "matchingArcs": true}'
    ),
    {
      showPicture: false,
      showOutlines: false,
      picture: 'sunset',
      size: 'large',
      symmetric: false,
      effects: false,
      sound: true,
      vertexDots: false,
      matchingArcs: true
    }
  );
  assert.deepEqual(
    parseSettings(
      '{"showOutlines": 0, "picture": "bogus", "size": "huge", "symmetric": "yes", "effects": "none", "sound": "loud", "vertexDots": "off", "matchingArcs": 1, "volume": 11}'
    ),
    DEFAULT_SETTINGS
  );
});

test('sandboxTileDecorations hides edge ticks when matching arcs are enabled and keeps vertex dots independent', () => {
  assert.deepEqual(sandboxTileDecorations({ vertexDots: true, matchingArcs: false }), {
    edgeTicks: true,
    vertexDots: true,
    matchingArcs: false
  });
  assert.deepEqual(sandboxTileDecorations({ vertexDots: true, matchingArcs: true }), {
    edgeTicks: false,
    vertexDots: true,
    matchingArcs: true
  });
  assert.deepEqual(sandboxTileDecorations({ vertexDots: false, matchingArcs: true }), {
    edgeTicks: false,
    vertexDots: false,
    matchingArcs: true
  });
  assert.deepEqual(sandboxTileDecorations({ vertexDots: false, matchingArcs: false }), {
    edgeTicks: true,
    vertexDots: false,
    matchingArcs: false
  });
});
