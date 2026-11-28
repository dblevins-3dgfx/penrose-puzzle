# Development notes

What a newcomer can't learn from the other files. Read [README.md](README.md) (running, scripts, deployment, layout), [AGENTS.md](AGENTS.md) (spec, tests, branch-and-PR rules), [penrose-puzzle-spec.md](penrose-puzzle-spec.md) and [untested-requirements.md](untested-requirements.md) first; this file doesn't repeat them.

## How changes are made

- The owner merges every pull request; nothing else merges. Pull requests have been merged as merge commits ("Merge pull request #N"), not squashed.
- Every change goes on a short-lived branch from `main` and merges by pull request. Any branch name works: every pull request gets a preview at `branch/pr-<number>/` with a sticky PR comment linking to it.
- A pull request description lists the spec sections that changed (or says why none did) and the checks run locally, including what was checked in a browser.
- Commit messages have a short summary line and a body saying what changed and why, ending with the spec sections touched.
- The owner asks for new ideas to be logged as GitHub issues before work starts (#4).
- There are no releases or versions: merging into `main` deploys the live site.
- History: commits before #1 went straight to `main`, and the jigsaw mode was originally developed by pushing directly to a long-lived `jigsaw` feature branch before being merged into `main`. Going forward, all work uses branches and pull requests to `main`.

## Checks

- CI runs the full checks (formatting, typecheck, lint, tests, build) on pull requests (`.github/workflows/test.yml`), while `deploy.yml` runs `npm test` and the build on pushes to `main` and on pull requests. Run `npm run format:check`, `npm run typecheck`, `npm run lint`, `npm test` and `npm run build` yourself before pushing (or `npm run format` to apply Prettier formatting).
- The tests are hand-written and there is no mutation testing. The habit so far is to break each new rule by hand (delete a condition, change a constant) and check that a test fails, then add a test for any break that passes unnoticed.

## Running and testing locally

- `npm run build` then `npx vite preview` serves the production build at http://localhost:4173.
- Chromium and Playwright scripts were used to check every change in a real browser. Tips:
  - Both boards fill the available viewport below the slim top bar (Sandbox is 1:1 with CSS pixels; Jigsaw scales world units to fit the viewport). Convert board coordinates with the canvas's `boundingBox()` (and in Jigsaw, `computeViewportLayout`).
  - To emulate touch, use a Playwright device such as `devices['iPhone 13']`. The app decides whether it is on a touch device once, from `navigator.maxTouchPoints`, when the page loads.
  - Playwright's `text=Dart` matches the header's "darts" count first. Use `button:text-is("Dart")`.
  - In Jigsaw mode, `?seed=<n>` gives a known puzzle. A script can import `newPuzzle(size, seed)` from `jigsaw.ts` with `npx tsx` to get every piece's home and solve the puzzle by dragging.
  - To test blocked storage, add an init script that makes `window.localStorage` throw.
- `pkill -f "vite preview"` can match and kill the shell that runs it. Use a pattern that can't match itself, such as `pkill -f "vite preview --port 417[3]"`.
- There are no accounts, passwords or backends. The only stored data is the jigsaw's settings, under the local-storage key `penrose-puzzle.jigsaw-settings`; delete that key to reset them.

## Gotchas

- `npm test` runs `tsx --test *.test.ts pictures/*.test.ts perf/*.test.ts`. A test file in `ui/` or another folder outside those globs would never run.
- `tsconfig.json` includes `src`, `ui`, `pictures`, `perf` and the root `*.ts` / `*.tsx` files. Add any new folder there, or `npm run typecheck` won't check it.
- Strict TypeScript is off (`"strict": false`), a setting inherited with Penrogo's untyped original component. The rule modules are fully typed anyway; keep new ones that way.
- The lint limits, copied from Penrogo's `.oxlintrc.json`, shape the code: at most 150 lines per function, nesting at most 4 deep, complexity at most 20. That's why the React code is split across `ui/` (components, `draw.ts`, `useControls.ts`) and `rules.ts` uses small helpers such as `edgesOf` and `sameEdge`. When a component outgrows the limit, split it rather than relaxing the rule.
- Deploys (#3, #8, #86):
  - A `main` deploy must keep `gh-pages`'s `branch/` (PR previews) and `perf/` (performance trend history & dashboard) folders. `clean-exclude` in `deploy.yml` preserves both.
  - Deploys of `main` and different PRs can run at once. They push to `gh-pages` without force (`force: false`) and rebase onto each other.
  - If a build is identical to what's already published, the deploy action adds no commit to `gh-pages`, and the job log says `deployment_status: skipped`. Don't wait for a `gh-pages` commit that will never come.
- The live site and every pull-request preview share one origin, `dblevins-3dgfx.github.io`, so they share local storage. A setting saved in one preview applies in all of them.
- The sandbox's matching rules usually let a free edge take a given tile only one way. That's why auto-rotate's rotate controls step through fits on nearby edges rather than on one edge (#2).
- In Jigsaw mode, the solved tiling is generated by deflation, ported from Penrogo's `penrose-board.ts`, so every puzzle is a legal Penrose tiling by construction.

## Decisions

- The owner hasn't decided what the final game is. The app started as a single-player sandbox with everything two-player and Go-like taken out of Penrogo's original game; the jigsaw is one experiment alongside it.
- The owner asked for Penrogo's conventions here (https://github.com/dblevins-3dgfx/penrogo): `AGENTS.md`'s spec-and-tests rules (originally copied from Penrogo's `CLAUDE.md`) and `.oxlintrc.json` come from it, and the deploy workflow is modelled on its own. The owner's sudoku4david repository has the same spec-and-tests rules.
- Kites are amber and darts indigo, chosen when the two-player colors were removed.
- Auto-rotate stays a mode you switch on; turning the tile while it's on steps through the fits instead of switching it off (#2). It isn't saved.
- Jigsaw choices:
  - Built-in pictures live as self-contained plugins under `pictures/` (registered in `pictures/index.ts`) and are drawn in code, so the repository needs no image files or licences.
  - A picture the player chooses stays on their device and is never uploaded.
  - A piece only locks into its own home, and only snaps to pieces it borders in the solved puzzle.
  - The puzzle's outer border is always drawn on edge pieces, whatever the tile-outlines setting.
  - Show picture lives in the Settings dialog, not the toolbar, and settings are saved in the browser.

## Setup outside the repository

- **GitHub Pages:** Settings → Pages → Source is "Deploy from a branch", branch `gh-pages`, folder `/ (root)`. The owner set this by hand after the first deploy. There is no custom domain (no `CNAME` on `gh-pages`).
- **Analytics, search console, scheduled jobs:** none.
- **Branch protection for `main`:** enabled in GitHub repository settings.
- **AI assistant access:** the owner created the repository on GitHub, empty, and the Claude GitHub App then had access to it (exactly how access was granted is unverified). Another assistant will need its own access.

## Things to watch for

- The header is cramped on phones ("How to Play" and "Settings" shrink to icons on narrow screens).

## Open work

- [#4](https://github.com/dblevins-3dgfx/penrose-puzzle/issues/4), a jigsaw timer and move counter. The issue lists open questions for the owner, for example whether turning a piece counts as a move and whether the timer pauses while the tab is hidden.
- What the actual puzzle game is remains open (spec section 11).
