# Outta Here

Group trips that actually happen. The crew picks dates and budgets, swipes on AI-pitched trips until everyone matches, books flights and a stay together, then the app runs the trip: live plans, a crew map, an "I'm lost" button, a group pot, and a Trip Wrapped at the end.

This version runs on your own computer. Trips, photos and boarding passes are saved in the `data/` folder of this project.

## Run it on your computer

You only do steps 1–3 once.

1. **Install Node.js.** Download the LTS version from [nodejs.org](https://nodejs.org) and install it. To check it worked, open a terminal (Terminal on Mac, PowerShell on Windows) and run `node -v`. You should see a version number like `v22.x`.
2. **Download the code.**
   ```bash
   git clone https://github.com/maxlclrc1/outta-here.git
   cd outta-here
   ```
   No git? On the GitHub page click **Code → Download ZIP**, unzip it, and open a terminal in that folder.
3. **Install the app's packages.**
   ```bash
   npm install
   ```
4. **Start it.**
   ```bash
   npm run dev
   ```
5. Open **http://localhost:3000** in your browser.

To stop the app, press `Ctrl+C` in the terminal. Run `npm run dev` again any time to start it.

## Turn on the AI features

Trip Match, nightlife picks, stays, the itinerary, packing lists, daily recaps and the hangover planner use Claude. Without a key, everything else still works and the AI buttons are hidden.

1. Get an API key at [platform.claude.com](https://platform.claude.com/) (Settings → API keys). AI requests are billed to that account.
2. In the project folder, copy `.env.example` to a new file named `.env.local`.
3. Paste your key after `ANTHROPIC_API_KEY=` and save.
4. Stop the app (`Ctrl+C`) and run `npm run dev` again.

`.env.local` is ignored by git, so your key never gets uploaded. Never paste it into a chat or a commit.

## Try it with friends on the same Wi-Fi

1. Start the app with `npm run dev:lan` instead of `npm run dev`.
2. Find your computer's local IP address: on Mac, System Settings → Wi-Fi → Details; on Windows, run `ipconfig` and look for "IPv4 Address". It looks like `192.168.1.23`.
3. Friends on the same Wi-Fi open `http://192.168.1.23:3000` on their phones.
4. To invite someone to a specific trip, send them the address with the trip code on the end, like `http://192.168.1.23:3000/#c8ijbj6z7k`. The trip code is shown at the top right of every trip.

Your computer has to stay on with the app running while people use it. Putting it on the internet comes later (see below).

To test as two different people on one computer, use a normal window and a private/incognito window. Each browser counts as a different person.

## How people are identified

There are no accounts yet. The first time someone opens the app, it asks for their name and remembers them in that browser. That's fine on your own computer and Wi-Fi, but anyone who can reach the server could act as anyone else, so don't put this version on the public internet. Real accounts come with the next step.

## Who can see and change what

The server checks every request (`lib/access.ts`), not just the app:

- Your home page only lists plans and crews you're in, and live updates only go to people in that plan.
- An invite link opens a plan. Before joining you see who's in and whether they're coming, nothing else about them.
- Joining adds only yourself, only while invites are on, only with the current link if the organizer made a new one, and never after being removed.
- Only people in a plan can change it or read its expenses, photos, packing list and so on. Only organizers can delete it or change who can invite and lock.
- The change log can't grow until a plan stops saving (`lib/changelog.ts`): it keeps the newest 100 entries within 64 KB, older entries lose their undo copy first, and undo always stays available for the 10 newest changes that can be undone. Older plans are trimmed the next time they're saved. If a plan's own data is still over the 256 KB limit, the save is refused with a clear message and nothing is dropped.
- Two people saving at once don't undo each other (`lib/merge.ts`): lists like the itinerary are merged with anyone else's edits instead of replaced, and saving your own details only sends what you changed, so it can't undo an organizer counting you out. `npm run test:ui:concurrency` reproduces both in real browsers.
- A few other values shared screens rely on are checked too (`lib/planDates.ts`): itinerary stop dates and times (a real date and HH:MM, or empty), destination codes (3 letters, or empty), `nights` (a whole number from 0 to 90), the plan size, task due dates, and each member's chosen and preferred days (lists of real dates). Anything else gets a 400 naming the field. Older plans holding bad values still open: the app treats those values as not set.
- Deleting a plan is one server step (`lib/deletePlan.ts`, `DELETE /api/plans/<id>`): only its organizers can do it, and the plan, everything in it (members, change log, photos, expenses, packing, chat, private spend lists) and its uploaded files go together. If the database can't be saved, nothing is deleted. A file another plan still uses is never deleted, and repeating a delete is harmless. As with every rule here, "organizer" means the browser's unverified id, so this is not real security until accounts exist.
- Undo and Restore never erase newer edits (`lib/merge.ts`, `src/app/05l-log.js`): each logged change remembers what it left behind, and undo only puts back what still looks exactly like that. Stops added since are kept, stops deleted since stay deleted, and if something undo would overwrite was changed by anyone, it's refused with a message saying what changed. The server checks this again at the moment of saving (`_expect`), so two people can't race it.
- The plan's decision rules are checked by the server on every lock (`lib/decide.ts`): "organizers only" locking, the decision style, and hard limits that a vote can't override without that person agreeing. Votes and agreeing are your own: nobody can swipe, vote or agree for someone else, or change someone else's days or limits.
- Private parts of a plan are removed by the server before anything is sent (`lib/privacy.ts`): needs shared "Only organizers" (the AI still plans around them, unnamed), where someone checked in if they chose to hide it (an SOS is always shared), and surprise stops and planners-only chat for the guest of honor.
- Budgets stay with their owner. Other members only learn whether you've set one. Budget fit ("fits 4/5 budgets", hard limits) is worked out on the server (`lib/budget.ts`) and comes back as counts, naming only people who chose to be named. The crew-wide figure is a band ("€300–400"), never the lowest budget itself. Pitch checks use the pitch's price from the plan; any other price is snapped to a ~10% grid, and each person gets a limited number of distinct prices per plan per hour. If a budget check is refused for being too frequent, the app keeps showing the last confirmed answer marked "earlier check" (or "Budget check unavailable right now"), asks again when the server allows it, and won't offer to lock a priced option until a check succeeds. The server's hard-limit rule applies either way.
- AI requests (`app/api/ai/route.ts`) only work for someone in the plan they're for, are size-checked (up to 20 turns, 64 KB of text, 128 KB per request) and rate-limited per person (6 a minute, 40 an hour, 2 at once) and per plan (120 an hour), all before the API key is used. Prompts and keys are never logged. AI picks in the offline demo (no real plan) are refused.
- Uploads (`lib/assets.ts`) must belong to a plan you're in, be a photo (PNG, JPEG, GIF, WebP, HEIC/AVIF) or PDF under 20 MB whose actual contents match its type (SVG and HTML are refused), and stay within quotas: 120 files / 250 MB per person per plan, 1,000 files / 1 GB per plan, 60 uploads per 10 minutes. A refused upload leaves nothing on disk. **Uploaded files are not private:** anyone with a file's link can open it (the link is 128 random bits and isn't listed anywhere, but it can be forwarded). Files stop opening once their plan is deleted. Limits are kept in memory, so they reset when the server restarts.
- Everything people or the AI type is shown as text, never as markup: the app escapes it before it reaches the page. Links in chat become links only for http(s) addresses, and a stay's listing link opens only if it is http(s); anything else (like `javascript:`) isn't shown as a link.
- A plan's dates must be real dates (`lib/planDates.ts`): the window people pick days in, the RSVP deadline, the voting deadline, the locked dates (`{ start, end }`, or none) and each pitch's dates are refused with a 400 unless they're a real day written YYYY-MM-DD (deadlines can be cleared; pitches may have no dates). A plan saved earlier with a bad date still opens: the app treats that date as not set until someone picks a new one.

`npm test` checks these rules (see Tests below). `tests/identity.mjs` also lists, as `gap` lines, the confirmed ways someone can act as another person today; they fail with `OUTTA_IDENTITY_STRICT=1`, for when identity is fixed. Until real accounts exist these rules rely on each browser's id, so they keep a plan private from everyone except someone who copies another person's browser data.

## Tests

Every test command starts its own copy of the app on a free port with a throwaway database and build folder, so it never touches your `data/` folder and can run while `npm run dev` is up. Everything is deleted afterwards. Each suite runs even if an earlier one fails, and the command exits with 1 if any suite failed.

| Command | What it runs | Needs |
|---|---|---|
| `npm test` | The core suite: TypeScript check, app build, then every server suite below | Nothing extra |
| `npm run test:server` | The server suites only: `access`, `budget-privacy`, `privacy`, `decisions`, `concurrency`, `changelog`, `ai-uploads`, `plan-dates`, `plan-values`, `undo`, `plan-delete`, `identity`, `storage` (in `tests/`) | Nothing extra |
| `npm run test:ui` | Browser tests in `tests/ui/`: setup, joining, crews, decisions, personal needs and the change log, budget, itinerary, pitches, recovery and undo, reliability, keyboard, journey, own picks, stays, bad stored dates and values (`dates`), undo next to someone else's edits (`undo`), deleting a plan (`delete`), budget guidance while checks are rate-limited (`budget-busy`), script injection (`xss`: every text field filled with a harmless payload, every tab opened), and a broad feature walk | Playwright |
| `npm run test:ui:concurrency` | `tests/ui-concurrency.mjs`: two real browsers saving at once | Playwright |

Add `--only=<name>` to run one suite, e.g. `npm test -- --only=privacy` or `npm run test:ui -- --only=decide`.

**Playwright** isn't a project dependency. Point the browser tests at an install with environment variables:

- `PLAYWRIGHT`: path to Playwright's `index.mjs`, e.g. from `npm i -g playwright`. If unset, the tests try `import('playwright')`.
- `CHROMIUM`: path to a Chromium binary, only needed if Playwright has no browser of its own installed (`npx playwright install chromium`).

```bash
PLAYWRIGHT=$(npm root -g)/playwright/index.mjs npm run test:ui
```

Without Playwright these two commands stop straight away with a message saying so (exit code 2). The browser suites fail on a crash, any `FAIL` line, or errors on the page. Some of them only check that a flow runs through without errors rather than checking exact results.

## What's where

| Path | What it is |
|---|---|
| `src/app/*.js` | The app itself, split by area (home, plan, book, live, money, memories). Edit these. |
| `src/styles/app.css` | The design. `src/styles/local.css` adds the localhost-only bits. |
| `scripts/build.mjs` | Joins `src/` into `public/app.js` and `public/styles.css`. Runs on its own before `npm run dev`; run `npm run build:app` after editing while the app is running. `npm run build` also minifies them and stamps their URLs in `index.html` with a content hash, so browsers cache them for a year and still get each new build at once. |
| `public/app.js`, `public/styles.css` | Generated by the build. Don't edit them directly. |
| `public/index.html` | The page that loads it all |
| `public/shim.js` | Connects the app to the local server: database, live updates, uploads, AI and the name screen |
| `app/api/db` | Saves and reads trips, after the access checks in `lib/access.ts`; `stream` pushes live updates to the people in each plan |
| `app/api/ai` | Sends AI requests to Claude with your key |
| `app/api/assets` | Stores photos and boarding passes |
| `lib/` | Server code shared by those routes: the store, access rules, AI client |
| `docs/APP_MAP.md` | Every screen, action and status, and how decisions depend on each other |
| `data/` | Your local database and uploads (created on first run, never committed) |

To start over with no trips, stop the app and delete the `data/` folder.

Saving is crash-safe: each save is written to `data/db.json.tmp` and then swapped in, so `db.json` is never left half-written, and the previous good version is kept as `data/db.json.bak`. If `db.json` can't be read when the app starts, it's kept as `db.json.corrupt-<time>` and the backup is loaded (the terminal says so). If there's no usable backup either, the app starts with saving turned off rather than replace your file with an empty one: fix or remove `data/db.json` and restart.

## What's next

1. **Supabase:** real accounts (join with a name, save your spot with a phone number or email), a hosted database, and uploads that work from anywhere.
2. **Real maps and GPS** for the crew map and the "I'm lost" button.
3. **Live flight prices** with Travelpayouts, then Duffel.
4. **Deploy to Vercel** so it's a real link anyone can open.
