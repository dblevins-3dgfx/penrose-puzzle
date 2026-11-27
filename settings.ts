// Shared settings schema, Jigsaw settings persistence, and sound cue type
// (spec 6, 8, and 9). Segregates SharedSettings (effects, sound) from
// Jigsaw-only settings so Sandbox never depends on Jigsaw internals.

export type SoundCue = 'snap' | 'lock' | 'border' | 'solve';

export interface SharedSettings {
  // Celebratory canvas visual effects (sparks, glows, shimmer, confetti)
  effects: boolean;
  // Synthesized Web Audio feedback on snap, lock, border complete, and solve
  sound: boolean;
}

export type PictureStyle = 'subdivided' | 'matching' | 'independent' | 'sunset';
export const PICTURE_STYLES: readonly PictureStyle[] = ['subdivided', 'matching', 'independent', 'sunset'];

export type PuzzleSize = 'small' | 'medium' | 'large' | 'xl' | 'giant';

// Ordered presets for the stepped/cyclic selector in Settings (names only).
export const PUZZLE_SIZES: readonly PuzzleSize[] = ['small', 'medium', 'large', 'xl', 'giant'];

export const PIECE_COUNTS: Record<PuzzleSize, number> = {
  small: 12,
  medium: 24,
  large: 40,
  xl: 60,
  giant: 100
};

export const stepPuzzleSize = (current: PuzzleSize, delta: number): PuzzleSize => {
  const i = PUZZLE_SIZES.indexOf(current);
  const n = PUZZLE_SIZES.length;
  return PUZZLE_SIZES[((((i < 0 ? 0 : i) + delta) % n) + n) % n];
};

export interface JigsawSettings extends SharedSettings {
  // The whole picture shown faintly inside the outline, like a puzzle box
  showPicture: boolean;
  // Edges drawn around each piece and each tile of the outline
  showOutlines: boolean;
  // Which built-in picture is drawn on the puzzle
  picture: PictureStyle;
  // Piece count preset for new puzzles
  size: PuzzleSize;
  // Prefer symmetric (5-fold mandala or bilateral mirror) puzzle layouts
  symmetric: boolean;
}

export const DEFAULT_SETTINGS: JigsawSettings = {
  showPicture: false,
  showOutlines: true,
  picture: 'subdivided',
  size: 'medium',
  symmetric: true,
  effects: true,
  sound: false
};

// Where the settings are kept in the browser's local storage. Kept identical
// so existing saved settings persist seamlessly across modes and updates.
export const SETTINGS_KEY = 'penrose-puzzle.jigsaw-settings';

export const serializeSettings = (settings: JigsawSettings): string => JSON.stringify(settings);

const isPictureStyle = (value: unknown): value is PictureStyle =>
  typeof value === 'string' && (PICTURE_STYLES as readonly string[]).includes(value);

const isPuzzleSize = (value: unknown): value is PuzzleSize =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(PIECE_COUNTS, value);

// Settings read back from storage. Anything missing, unreadable or of the
// wrong type falls back to its default, field by field, and unknown fields
// are dropped, so an old or damaged saved value never breaks the page.
export const parseSettings = (raw: string | null): JigsawSettings => {
  let saved: unknown = null;
  try {
    saved = raw === null ? null : JSON.parse(raw);
  } catch {
    saved = null;
  }
  const fields = saved !== null && typeof saved === 'object' ? (saved as Record<string, unknown>) : {};
  const flag = (key: 'showPicture' | 'showOutlines' | 'symmetric' | 'effects' | 'sound') =>
    typeof fields[key] === 'boolean' ? (fields[key] as boolean) : DEFAULT_SETTINGS[key];
  return {
    showPicture: flag('showPicture'),
    showOutlines: flag('showOutlines'),
    picture: isPictureStyle(fields.picture) ? fields.picture : DEFAULT_SETTINGS.picture,
    size: isPuzzleSize(fields.size) ? fields.size : DEFAULT_SETTINGS.size,
    symmetric: flag('symmetric'),
    effects: flag('effects'),
    sound: flag('sound')
  };
};
