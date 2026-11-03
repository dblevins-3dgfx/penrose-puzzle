# Keep the spec in step with the code

`penrose-puzzle-spec.md` describes the game as it is implemented. Any change the player can see, or that changes what is stored (play, rules, the puzzle, the screen, controls, settings kept in the browser), updates the spec in the same pull request. The PR description names the spec sections that changed, or says why none needed to.

# Test every spec rule

A pull request that adds or changes a rule in `penrose-puzzle-spec.md` adds or updates the unit tests for it (`*.test.ts` beside the module, such as `rules.test.ts`; run them with `npm test`) in the same pull request. Put the rule's logic in a plain function in a module without React (like `rules.ts` or `geometry.ts`) so it can be tested; the React code (`penrose-puzzle.tsx`) should only call it. A rule that can't be unit-tested (timers, page events, storage, drawing, layout) gets a row in `untested-requirements.md` saying where it lives and why. Remove a row from that file when its rule gains a test.

