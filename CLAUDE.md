# Working on Outta Here

How to work in this repo (the owner's standing preferences):

- **One issue at a time.** Work on the specific thing asked. Don't audit the whole app unless asked.
- **Don't restate the product.** The codebase and `docs/APP_MAP.md` already describe it; read only the files the change touches.
- **Smallest change that works.** Edit the fewest files possible. No rewrites or refactors that weren't asked for.
- **Targeted checks, not the full suite.** After a change: `node scripts/build.mjs && node --check public/app.js`, then a quick check of just the affected flow. Run the full test suite only before a major release or when asked.
- **Batch related fixes.** Several small UI fixes in one prompt are done together, in one pass and one commit.
- **Keep the design.** The look is final unless the owner asks otherwise.

Workflow basics: edit `src/app/*.js` and `src/styles/*.css` (never `public/app.js` or `public/styles.css`, which are generated). Build with `node scripts/build.mjs`; the Claude artifact is built with `--claude <path>`. Commit and push to the working branch when done.
