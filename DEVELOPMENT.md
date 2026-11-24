# Development notes

What a newcomer can't learn from the other files. Read [README.md](README.md) (running, scripts, deployment, layout), [CLAUDE.md](CLAUDE.md) (spec, tests, branch-and-PR rules), [penrose-puzzle-spec.md](penrose-puzzle-spec.md) and [untested-requirements.md](untested-requirements.md) first; this file doesn't repeat them.

## How changes are made

- The owner merges every pull request; nothing else merges. Pull requests #1 to #3 were all merged as merge commits ("Merge pull request #N"), not squashed.
- Work on `main` goes on a short-lived branch. The AI assistant used one branch name for all of them, `claude/nifty-ptolemy-7mqxwl`, and restarted it from `main` after each merge. Any name works: every pushed branch gets a preview.
- A pull request description lists the spec sections that changed (or says why none did) and the checks run locally, including what was checked in a browser.
- Commit messages have a short summary line and a body saying what changed and why, ending with the spec sections touched.
- The owner asks for new ideas to be logged as GitHub issues before work starts (#4).
- There are no releases or versions: merging into `main` deploys the live site.
- The commits before #1 went straight to `main`. That stopped with #1, which added the branch-and-PR rule to `CLAUDE.md`.

### The `jigsaw` feature branch

- `jigsaw` is a long-lived feature branch for an experimental jigsaw mode. The owner asked for it, and said alternate branches may later be made from it or from `main`.
- Unlike `main`, work so far was committed and pushed straight to `jigsaw`, without pull requests, so its preview updates right away: https://dblevins-3dgfx.github.io/penrose-puzzle/branch/jigsaw/
- Keep `jigsaw` current by merging `main` into it, not by rebasing.
- It reaches `main` through a pull request when the owner decides; that hasn't happened yet.
- Its spec, README and `untested-requirements.md` describe the jigsaw, so they differ from `main`'s.
- On `jigsaw`, the jigsaw logic is in `jigsaw.ts`, tested in `jigsaw.test.ts`.

## Checks

- CI only runs the full checks (typecheck, lint, tests, build) on pull requests (`.github/workflows/test.yml`). A plain push, including every push to `jigsaw`, only runs `npm test` and the build inside the deploy. So run `npm run typecheck`, `npm run lint`, `npm test` and `npm run build` yourself before pushing a branch without a pull request.
- The tests are hand-written and there is no mutation testing. The habit so far is to break each new rule by hand (delete a condition, change a constant) and check that a test fails, then add a test for any break that passes unnoticed.

## Running and testing locally

- `npm run build` then `npx vite preview` serves the production build at http://localhost:4173.
- Chromium and Playwright scripts were used to check every change in a real browser. Tips:
  - The board is a canvas with an 800 x 600 drawing area scaled to the window. Convert board coordinates with the canvas's `boundingBox()`: scale = box width / 800.
  - To emulate touch, use a Playwright device such as `devices['iPhone 13']`. The app decides whether it is on a touch device once, from `navigator.maxTouchPoints`, when the page loads.
  - Playwright's `text=Dart` matches the header's "darts" count first. Use `button:text-is("Dart")`.
  - On `jigsaw`, `?seed=<n>` gives a known puzzle. A script can import `newPuzzle(size, seed)` from `jigsaw.ts` with `npx tsx` to get every piece's home and solve the puzzle by dragging.
  - To test blocked storage, add an init script that makes `window.localStorage` throw.
- `pkill -f "vite preview"` can match and kill the shell that runs it. Use a pattern that can't match itself, such as `pkill -f "vite preview --port 417[3]"`.
- `vite.config.ts` lets the dev server be opened as `raspberrypi.local`. That came over from Penrogo, where the owner ran it on a Raspberry Pi; whether that's still used here is unverified.
- There are no accounts, passwords or backends. The only stored data is the `jigsaw` branch's settings, under the local-storage key `penrose-puzzle.jigsaw-settings`; delete that key to reset them.

## Gotchas

- `npm test` runs `tsx --test *.test.ts`, which only matches test files at the repository root. A test file in `ui/` or another folder would never run.
- `tsconfig.json` only includes `src`, `ui` and the root `*.ts` / `*.tsx` files. Add any new folder there, or `npm run typecheck` won't check it.
- Strict TypeScript is off (`"strict": false`), a setting inherited with Penrogo's untyped original component. The rule modules are fully typed anyway; keep new ones that way.
- The lint limits, copied from Penrogo's `.oxlintrc.json`, shape the code: at most 150 lines per function, nesting at most 4 deep, complexity at most 20. That's why the React code is split across `ui/` (components, `draw.ts`, `useControls.ts`) and `rules.ts` uses small helpers such as `edgesOf` and `sameEdge`. When a component outgrows the limit, split it rather than relaxing the rule.
- Deploys (#3):
  - A `main` deploy must keep `gh-pages`'s `branch/` folder. `clean-exclude: branch` in `deploy.yml` does that; without it, every `main` deploy wipes all branch previews.
  - Deploys of different branches can run at once. They push to `gh-pages` without force (`force: false`) and rebase onto each other.
  - If a build is identical to what's already published, the deploy action adds no commit to `gh-pages`, and the job log says `deployment_status: skipped`. Don't wait for a `gh-pages` commit that will never come.
- The live site and every branch preview share one origin, `dblevins-3dgfx.github.io`, so they share local storage. A setting saved in one preview applies in all of them.
- The sandbox's matching rules usually let a free edge take a given tile only one way. That's why auto-rotate's rotate controls step through fits on nearby edges rather than on one edge (#2).
- On `jigsaw`, the solved tiling is generated by deflation, ported from Penrogo's `penrose-board.ts`, so every puzzle is a legal Penrose tiling by construction.

## Decisions

- The owner hasn't decided what the game is. `main` is a single-player sandbox with everything two-player and Go-like taken out of Penrogo's original game. The jigsaw is one experiment, kept on a branch.
- The owner asked for Penrogo's conventions here (https://github.com/dblevins-3dgfx/penrogo): `CLAUDE.md`'s spec-and-tests rules and `.oxlintrc.json` are copied from it, and the deploy workflow is modelled on its own. The owner's sudoku4david repository has the same spec-and-tests rules.
- Kites are amber and darts indigo, chosen when the two-player colors were removed.
- Auto-rotate stays a mode you switch on; turning the tile while it's on steps through the fits instead of switching it off (#2). It isn't saved.
- Jigsaw choices, on `jigsaw`:
  - The default picture is drawn in code (`ui/defaultPicture.ts`), so the repository needs no image files or licences.
  - A picture the player chooses stays on their device and is never uploaded.
  - A piece only locks into its own home, and only snaps to pieces it borders in the solved puzzle.
  - The puzzle's outer border is always drawn on edge pieces, whatever the tile-outlines setting.
  - Show picture lives in the Settings dialog, not the toolbar, and settings are saved in the browser.

## Setup outside the repository

- **GitHub Pages:** Settings → Pages → Source is "Deploy from a branch", branch `gh-pages`, folder `/ (root)`. The owner set this by hand after the first deploy. There is no custom domain (no `CNAME` on `gh-pages`).
- **Analytics, search console, scheduled jobs:** none.
- **Branch protection for `main`:** it was suggested (require the `test` check), but whether it was ever set up is unverified.
- **AI assistant access:** the owner created the repository on GitHub, empty, and the Claude GitHub App then had access to it (exactly how access was granted is unverified). Another assistant will need its own access.

## Things to watch for

- Stale previews: a branch's preview stays on `gh-pages` until the branch is deleted. `branch/claude-nifty-ptolemy-7mqxwl/` is still there.
- The header is cramped on phones. On `jigsaw`, "How to Play" and "Settings" shrink to icons on narrow screens; on `main` they don't yet.
- `jigsaw` and `main` drift apart: changes to shared files on `main` (`ui/`, the spec, `README.md`) have to be merged into `jigsaw` by hand.

## Open work

- [#4](https://github.com/dblevins-3dgfx/penrose-puzzle/issues/4), a jigsaw timer and move counter, is for the `jigsaw` branch. The issue lists open questions for the owner, for example whether turning a piece counts as a move and whether the timer pauses while the tab is hidden.
- Whether, and when, `jigsaw` merges into `main` is the owner's decision.
- What the actual puzzle game is remains open (spec section 10).
