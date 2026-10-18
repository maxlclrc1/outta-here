# Working on Outta Here

How to work in this repo (the owner's standing preferences):

- **One improvement per prompt.** Work on the specific thing asked. No giant refactors, and no 30-minute task turning into an hour-long detour. Don't audit the whole app unless asked.
- **Real user value first.** Every change should help a group go from "we should do something" to "it's happening."
- **Simpler beats more features.** Hide complexity until it's needed. Keep useful functionality, but don't put it all in people's faces.
- **Keep the Duolingo-inspired delight.** Beautiful visuals, obvious next steps, tactile interactions and satisfying moments (the language of the setup, voting, plan home and free-days screens), without turning the app into a toy.
- **Don't restate the product.** The codebase and `docs/APP_MAP.md` already describe it; read only the files the change touches.
- **Smallest change that works.** Edit the fewest files possible. No rewrites or refactors that weren't asked for.
- **Test narrowly.** After a change: `node scripts/build.mjs && node --check public/app.js`, then only the directly relevant tests. Run the full test suite only before a major release or when asked.
- **Batch related fixes.** Several small UI fixes in one prompt are done together, in one pass and one commit.

## Roadmap

The goal is to get people using Outta/Here for actual plans, see where they struggle, and improve based on what happens.

1. **Make the core experience irresistible** (in progress). Polish creating, joining, inviting, choosing dates, voting and reaching a decision. Remove the feeling of homework.
2. **Prove it works with real groups.** Get friends to use it for actual plans. Find out where they drop off and whether the group really reaches decisions.
3. **Prepare for launch.** Real authentication, security, reliable deployment, and the essentials for safely supporting real users.
4. **Grow based on evidence.** Invest in advanced features only when users show they need them.

Workflow basics: edit `src/app/*.js` and `src/styles/*.css` (never `public/app.js` or `public/styles.css`, which are generated). Build with `node scripts/build.mjs`; the Claude artifact is built with `--claude <path>`. Commit and push to the working branch when done.
