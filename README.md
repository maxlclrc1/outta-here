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
- Budgets stay with their owner. Other members only learn whether you've set one. Budget fit ("fits 4/5 budgets", hard limits) is worked out on the server (`lib/budget.ts`) and comes back as counts, naming only people who chose to be named. The crew-wide figure is a band ("€300–400"), never the lowest budget itself. Pitch checks use the pitch's price from the plan; any other price is snapped to a ~10% grid, and each person gets a limited number of distinct prices per plan per hour.

`npm run test:server` checks these rules against the running app. Until real accounts exist these rules rely on each browser's id, so they keep a plan private from everyone except someone who copies another person's browser data.

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

## What's next

1. **Supabase:** real accounts (join with a name, save your spot with a phone number or email), a hosted database, and uploads that work from anywhere.
2. **Real maps and GPS** for the crew map and the "I'm lost" button.
3. **Live flight prices** with Travelpayouts, then Duffel.
4. **Deploy to Vercel** so it's a real link anyone can open.
