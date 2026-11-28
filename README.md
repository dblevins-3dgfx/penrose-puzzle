# Penrose Puzzle

**Play it at https://dblevins-3dgfx.github.io/penrose-puzzle/**

A tile placement puzzle played with Penrose kite and dart tiles.

It has two modes: a **jigsaw**, where a picture laid over a patch of a real Penrose tiling is broken into its kites and darts for you to put back together, and a **sandbox** for placing kites and darts edge to edge under Penrose's matching rules. See [penrose-puzzle-spec.md](penrose-puzzle-spec.md) for the rules and design.

The project was seeded from the `original-game` branch of [Penrogo](https://github.com/dblevins-3dgfx/penrogo), a two-player territory game, with the two-player and Go-like parts removed.

## Running

Requires Node.js 20.19+ or 22.12+.

```bash
npm install
npm run dev
```

Then open http://localhost:5173. The dev server also listens on your local network, so you can play from a phone or tablet at the network address Vite prints.

## Deployment

GitHub Actions builds the game, runs the unit tests and publishes it to GitHub Pages (see `.github/workflows/deploy.yml`):

- `main` is the live site: https://dblevins-3dgfx.github.io/penrose-puzzle/
- Every pull request gets a preview at `https://dblevins-3dgfx.github.io/penrose-puzzle/branch/pr-<number>/`, built from the PR's merge commit, with a sticky comment on the pull request linking to it. Closing or merging the pull request removes its preview.

The workflow pushes the builds to the `gh-pages` branch: `main` at its root, previews under `branch/`. To serve it, set the repository's Settings → Pages → Source to "Deploy from a branch", branch `gh-pages`, folder `/ (root)`.

## Checks

Every pull request runs the type checker, the linter, the unit tests and the production build (`.github/workflows/test.yml`). Deploys (`main` and pull-request previews) also run the unit tests first, and don't publish if they fail.

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Start the dev server with hot reload |
| `npm run build` | Build for production into `dist/` |
| `npm run preview` | Serve the production build |
| `npm test` | Run the unit tests for the rules |
| `npm run lint` | Run the linter ([oxlint](https://oxc.rs), configured in `.oxlintrc.json`) |
| `npm run typecheck` | Run the TypeScript checker |

## Layout

- `rules.ts`: the game rules as plain functions (geometry, matching rules, snapping, rotation), tested in `rules.test.ts`
- `jigsaw.ts`: the jigsaw's logic as plain functions (generating the tiling, choosing and scattering pieces, moving and locking them), tested in `jigsaw.test.ts`
- `pictures/`: self-contained built-in Jigsaw picture plugins registered in `pictures/index.ts` (`penrose.ts`, `topographic.ts`, `sunset.ts`, plus shared `types.ts`), tested in `pictures/*.test.ts`
- `debugInfo.ts`: plain-text diagnostics formatter for bug reports, tested in `debugInfo.test.ts`
- `penrose-puzzle.tsx`: the React root, switching between the jigsaw and the sandbox
- `ui/`: the React side. Sandbox: `Sandbox.tsx`, `draw.ts`, `sandboxEffects.ts`, `useSandboxEffects.ts`, `useSandboxPointers.ts`, `SandboxTray.tsx`, `SandboxSettingsDialog.tsx`, `Toolbar.tsx`. Jigsaw: `Jigsaw.tsx`, `jigsawDraw.ts`, `jigsawEffects.ts`, `useJigsawEffects.ts`, `JigsawToolbar.tsx`, `JigsawTray.tsx`, `useJigsawPointers.ts`, `JigsawSettingsDialog.tsx`, `JigsawHelp.tsx`. Shared: `ModeSwitch.tsx`, `ZoomControls.tsx`, `RotateControls.tsx`, `DebugInfoSection.tsx`, `collectDebugEnv.ts`, `useSharedSettings.ts`, `useControls.ts` (keyboard and wheel), `useBoardSize.ts` (responsive canvas sizing), `sound.ts`, `HelpOverlay.tsx`. All of it calls `rules.ts`, `jigsaw.ts`, `pictures/` and `debugInfo.ts` for decisions
- `untested-requirements.md`: spec rules that have no unit test, and why
- `public/`: web app manifest (`manifest.webmanifest`) and Penrose sun Home Screen / favicon icons (`apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `icon.svg`)
- `src/main.tsx`, `src/index.css`, `index.html`: Vite entry point, Tailwind / mobile gesture CSS, and iOS web-app metadata
