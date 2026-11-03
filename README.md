# Penrose Puzzle

**Play it at https://dblevins-3dgfx.github.io/penrose-puzzle/**

A tile placement puzzle played with Penrose kite and dart tiles.

For now it is a single-player sandbox: place kites and darts edge to edge under Penrose's matching rules. The puzzle itself is still to be designed. See [penrose-puzzle-spec.md](penrose-puzzle-spec.md) for the rules and design.

The project was seeded from the `original-game` branch of [Penrogo](https://github.com/dblevins-3dgfx/penrogo), a two-player territory game, with the two-player and Go-like parts removed.

## Running

Requires Node.js 20.19+ or 22.12+.

```bash
npm install
npm run dev
```

Then open http://localhost:5173. The dev server also listens on your local network, so you can play from a phone or tablet at the network address Vite prints.

## Deployment

Every push to `main` builds the game and publishes it to GitHub Pages at https://dblevins-3dgfx.github.io/penrose-puzzle/ (see `.github/workflows/deploy.yml`). The workflow pushes the build to the `gh-pages` branch. To serve it, set the repository's Settings → Pages → Source to "Deploy from a branch", branch `gh-pages`, folder `/ (root)`.

## Checks

Every pull request runs the type checker, the linter, the unit tests and the production build (`.github/workflows/test.yml`). Deploys from `main` also run the tests first, and don't publish if they fail.

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
- `penrose-puzzle.tsx`: the main React component: game state, pointer input and page layout
- `ui/`: the rest of the React side: `draw.ts` (canvas drawing), `useControls.ts` (keyboard and wheel), `Toolbar.tsx` and `HelpOverlay.tsx`. All of it calls `rules.ts` for decisions
- `untested-requirements.md`: spec rules that have no unit test, and why
- `src/main.tsx`, `src/index.css`, `index.html`: Vite entry point and Tailwind setup
