import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, PUZZLE_SIZES, parseSettings, serializeSettings, stepPuzzleSize } from './settings';

test('by default the picture is hidden, tile outlines, symmetric layout, and effects are on, picture is subdivided, size is medium, and sound is off', () => {
  assert.deepEqual(DEFAULT_SETTINGS, {
    showPicture: false,
    showOutlines: true,
    picture: 'subdivided',
    size: 'medium',
    symmetric: true,
    effects: true,
    sound: false
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
      sound: true
    },
    {
      showPicture: false,
      showOutlines: true,
      picture: 'independent' as const,
      size: 'large' as const,
      symmetric: false,
      effects: true,
      sound: false
    },
    {
      showPicture: true,
      showOutlines: true,
      picture: 'sunset' as const,
      size: 'xl' as const,
      symmetric: true,
      effects: false,
      sound: false
    },
    {
      showPicture: false,
      showOutlines: false,
      picture: 'subdivided' as const,
      size: 'giant' as const,
      symmetric: true,
      effects: true,
      sound: true
    }
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
    sound: false
  });
  assert.deepEqual(
    parseSettings(
      '{"showPicture": "yes", "showOutlines": false, "picture": "sunset", "size": "large", "symmetric": false, "effects": false, "sound": true}'
    ),
    {
      showPicture: false,
      showOutlines: false,
      picture: 'sunset',
      size: 'large',
      symmetric: false,
      effects: false,
      sound: true
    }
  );
  assert.deepEqual(
    parseSettings(
      '{"showOutlines": 0, "picture": "bogus", "size": "huge", "symmetric": "yes", "effects": "none", "sound": "loud", "volume": 11}'
    ),
    DEFAULT_SETTINGS
  );
});
