# Outta Here: app map

A reference for how the app fits together: every screen, the main actions, the statuses a plan goes
through, which decisions depend on which, and where screens used to overlap. The plan journey
(`src/app/05n-journey.js`) is built on this.

## Screens

**Outside a plan**
- **Join**: type a name. Invite links show what you're being invited to.
- **Home ("What are we doing?")**: Needs you, plans as departure-board rows (list or calendar), crews.
- **New plan**: who it's with (crew) → size (hangout, day out, weekend, trip) → kind (trips only) → basics.
- **Crew page**: members, plans, invite link, templates, Crew DNA, past plans.

**Inside a plan** (bottom nav → tabs; tabs a plan size doesn't need are hidden)

| Section | Tabs | What happens there |
|---|---|---|
| Home | Overview, Crew, To-dos, Changes, Settings | The journey, passport, who's coming, your details, limits and needs, to-dos, change log, settings and templates |
| Plan | Trip Match, Dates, What if, Spots/Nightlife, Itinerary | Pick where/what (pitches, own picks, final vote), pick when, compare options, places, day-by-day plan |
| Book | Flights, Stays, Boarding passes, Packing | Fares per home city, stays (AI and your own finds), bookings and arrivals, packing list |
| Live | Today, Map, Bucket list, Hype | Today's plan, meeting point, check-ins, SOS, map, bucket list, hype feed |
| Money | All-in cost, My spend, Group pot, Expenses | Cost per person, personal spending, kitty, split expenses |
| Memories | Wrapped, Photos, Awards | Recap story, photo wall, superlatives |

## Main actions, by where they happen

| Action | Where | Changes |
|---|---|---|
| Send the invite | Crew, home row | People join |
| Say if you're in (Interested / Going / Confirmed / Booked / Can't go) | Overview passport, Crew | Member `status` |
| Swipe on pitches, final vote, lock a pitch | Trip Match | `swipes`, `runoff`, `lockedDest` + `lockedDates` |
| Suggest and vote on your own picks, lock one | Trip Match › Your own picks | `destinations`, member `votes`, `lockedDest` |
| Tap free days, lock dates | Dates | member `days`, `lockedDates` |
| Book a flight, send a boarding pass | Flights, Boarding passes | `tickets` |
| Find, vote on and lock a stay; mark it booked | Stays | `stay` |
| Draft or add the itinerary, move a stop | Itinerary | `itinerary` |
| Take or finish a to-do | To-dos | `tasks` |
| Set the meeting point | Live › Today | `meet` |
| Share when you land | Boarding passes | member `arrive` |
| Log an expense, settle up | Money | `expenses`, `pot` |
| Add photos, watch Wrapped | Memories | `photos` |

## Statuses

- **Person**: interested → going → confirmed → booked, or can't go.
- **Plan status** (`stageOf`, shown on the home board and passport): draft → gathering votes → decided →
  organizing → confirmed → happening → memories. Works from the plan alone, so the home page can show it.
- **Journey stage** (`journey()`, inside a plan): get people together → decide → prepare → final check →
  experience → afterward. Each plan size has its own steps in each stage.

## Dependencies between decisions

```
invite ──► answers (in / out)
where ──┬─► flights (trips) ─► arrivals
when  ──┼─► stay (weekends, trips) ─► stay booked
        ├─► itinerary
        ├─► confirm who's coming
        └─► place and time (hangouts, days out) ─► meeting point
dates passed ─► photos, settle up, recap
to-dos: never blocked
```

Where and when can be decided in parallel. Nothing that needs a destination or dates is offered as
something to do until both are set; until then it shows as "Unlocks after …".

## Overlaps found, and what replaced them

| Before | Overlap | Now |
|---|---|---|
| "Your next move" pill, the yellow dot, the Move card, the step checklist, the status track | Five separate guesses at "what's next", each with its own logic | One journey engine. The guide card, the next-move pill, the dot, the glow on the control, the milestone toast and the home rows all read from it |
| Overview tiles for flights and stays | Repeated what the journey says about booking | Folded into the journey; the Book section still has everything |
| "Who's holding things up" (Crew) | Same information as the journey's waiting list | Kept on Crew as the people view; the journey names who it's waiting on per step |
| Trip Match and Where | Two places to pick a destination | Merged earlier into Trip Match |
| Status track and passport stamps | Two progress displays | The journey's stage strip on the overview; the passport keeps its stamps |
| Creation form asked for currency, nights and guest of honor up front | Details that only matter later | Moved under "More options"; the guest of honor is a journey step |
