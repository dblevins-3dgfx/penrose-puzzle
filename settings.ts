// Shared settings schema, persisted settings (Jigsaw + Sandbox), and sound cue
// type (spec 6, 7, 8, and 9). Segregates SharedSettings, JigsawSettings, and
// SandboxSettings so neither mode depends on the other mode's internals.

export type SoundCue = 'snap' | 'lock' | 'border' | 'solve';

export interface SharedSettings {
  // Celebratory canvas visual effects (sparks, glows, shimmer, confetti)
  effects: boolean;
  // Synthesized Web Audio feedback on snap, lock, border complete, and solve
  sound: boolean;
}

export interface SandboxTileIndicators {
  // Black/white corner dots showing Penrose vertex 2-coloring in Sandbox
  vertexDots: boolean;
  // Conway's two-family circular matching arcs on Sandbox kites and darts
  matchingArcs: boolean;
}

export interface SandboxSettings extends SharedSettings, SandboxTileIndicators {}

export interface SandboxTileDecorations {
  edgeTicks: boolean;
  vertexDots: boolean;
  matchingArcs: boolean;
}

export const DEFAULT_SANDBOX_INDICATORS: SandboxTileIndicators = {
  vertexDots: true,
  matchingArcs: false
};

// Decides which tile markings to draw in Sandbox (spec 7): midpoint edge ticks
// hide whenever Conway matching arcs are enabled for a cleaner look.
export const sandboxTileDecorations = (indicators: SandboxTileIndicators): SandboxTileDecorations => ({
  edgeTicks: !indicators.matchingArcs,
  vertexDots: indicators.vertexDots,
  matchingArcs: indicators.matchingArcs
});

export type PictureStyle = 'subdivided' | 'matching' | 'independent' | 'topographic' | 'sunset';
export const PICTURE_STYLES: readonly PictureStyle[] = [
  'subdivided',
  'matching',
  'independent',
  'topographic',
  'sunset'
];

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

export interface AppSettings extends JigsawSettings, SandboxSettings {}

export const DEFAULT_SETTINGS: AppSettings = {
  showPicture: false,
  showOutlines: true,
  picture: 'subdivided',
  size: 'medium',
  symmetric: true,
  effects: true,
  sound: false,
  vertexDots: DEFAULT_SANDBOX_INDICATORS.vertexDots,
  matchingArcs: DEFAULT_SANDBOX_INDICATORS.matchingArcs
};

// Where the settings are kept in the browser's local storage. Kept identical
// so existing saved settings persist seamlessly across modes and updates.
export const SETTINGS_KEY = 'penrose-puzzle.jigsaw-settings';

export const serializeSettings = (settings: AppSettings): string => JSON.stringify(settings);

const isPictureStyle = (value: unknown): value is PictureStyle =>
  typeof value === 'string' && (PICTURE_STYLES as readonly string[]).includes(value);

const isPuzzleSize = (value: unknown): value is PuzzleSize =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(PIECE_COUNTS, value);

type BooleanSettingKey =
  'showPicture' | 'showOutlines' | 'symmetric' | 'effects' | 'sound' | 'vertexDots' | 'matchingArcs';

// Settings read back from storage. Anything missing, unreadable or of the
// wrong type falls back to its default, field by field, and unknown fields
// are dropped, so an old or damaged saved value never breaks the page.
export const parseSettings = (raw: string | null): AppSettings => {
  let saved: unknown = null;
  try {
    saved = raw === null ? null : JSON.parse(raw);
  } catch {
    saved = null;
  }
  const fields = saved !== null && typeof saved === 'object' ? (saved as Record<string, unknown>) : {};
  const flag = (key: BooleanSettingKey) =>
    typeof fields[key] === 'boolean' ? (fields[key] as boolean) : DEFAULT_SETTINGS[key];
  return {
    showPicture: flag('showPicture'),
    showOutlines: flag('showOutlines'),
    picture: isPictureStyle(fields.picture) ? fields.picture : DEFAULT_SETTINGS.picture,
    size: isPuzzleSize(fields.size) ? fields.size : DEFAULT_SETTINGS.size,
    symmetric: flag('symmetric'),
    effects: flag('effects'),
    sound: flag('sound'),
    vertexDots: flag('vertexDots'),
    matchingArcs: flag('matchingArcs')
  };
};
