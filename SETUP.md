# Event Hub: setup guide

One website for players and staff:

| Page | For | What it is |
|---|---|---|
| `/` | Everyone | Hub home with links to everything |
| `/schedule/`, `/maps/` | Players | Your schedule and map list pages |
| `/stations/` | Players / TV | Live station board from start.gg |
| `/matchmaker/` | Players + staff | Free-play matchmaker (unchanged, its own database) |
| `/run-of-show/` | Staff | Live run of show, timeline, “My shifts”, Sheets import |
| `/checkin/` | Staff | Tournament team check-in, Switch 2 tracking, Sheets / start.gg import |

**Staff data is private.** The run of show, My shifts and check-in show nothing until the device enters the **staff PIN** (once per device, shared by both tools). Attendees don't see the staff links in the menu or on the hub; staff tap **Staff sign-in** at the bottom of the hub.

---

## 0. First: replace your start.gg token

Your `.env` file (with the start.gg API key) was shared during setup. To be safe, create a new token at start.gg → Developer Settings, delete the old one, and use the new one below.

## 1. Staff database (Supabase): about 10 minutes

Use a **new** Supabase project, separate from the matchmaker’s. The matchmaker’s `schema.sql` deletes other functions in its database, so they must never share a project.

1. supabase.com → **New project** (free tier is fine).
2. Open `supabase/ops-setup.sql` in a text editor. Find `>>> STAFF PIN <<<` and replace `CHANGE-ME-123456` with your PIN (6+ digits).
3. Supabase → **SQL Editor** → **New query** → paste the whole file → **Run**.
4. Optional: run `supabase/ops-seed-run-of-show.sql` the same way to load your current run of show (110 blocks, including the owners and checkmarks from the checklist). Run it only once.
5. **Project Settings → API**: copy the **Project URL** and the **anon / publishable** key into `site-config.js` under `ops`. Set `eventName` and `eventDate` while you’re there.

## 2. Matchmaker

Paste your existing matchmaker project’s URL and anon key into `matchmaker/config.js` (the copy in this folder has placeholders). Nothing else changes.

## 3. Images

Add the images the pages expect (they weren’t in the upload):

- `assets/NintendoGridlock.png` and `assets/counterpick-pool.png` (schedule and map list)
- `stations/assets/BigDapple.png` and `stations/assets/GG_logo_white(1).png` (station board)

## 4. Put it online (Vercel)

The station board needs a small server function to talk to start.gg (so your token stays secret), which is why this uses Vercel rather than Netlify Drop.

**Option A, with GitHub (easiest to update):**
1. Create a GitHub repo and upload this folder (the `.gitignore` keeps `.env` out).
2. vercel.com → **Add New → Project** → import the repo. Framework preset: **Other**. No build command.
3. Before deploying, open **Environment Variables** and add `STARTGG_API_KEY`, `EVENT_ID` and (optionally) `MAIN_STATION`.
4. **Deploy.** You’ll get a link like `your-hub.vercel.app`.

**Option B, from your computer:** install Node, then in this folder run `npx vercel` and follow the prompts. Add the environment variables in the Vercel dashboard, then run `npx vercel --prod`.

To test locally, copy `.env.example` to `.env`, fill it in, and run `npx vercel dev`.

## 5. Day-of checklist

1. **The day before:** open the hub and the matchmaker once. Free Supabase projects pause after a week of no use.
2. **Run of show:** open `/run-of-show/`, tap **Staff PIN to edit**, and check the **Now** view. Use **Preview another time** to rehearse.
3. **Staff shifts:** each person opens **My shifts**, picks their name, and taps **Copy my link** to bookmark it.
4. **Check-in:** in `/checkin/` → **Import & setup**, paste your team list from Sheets or use **Fetch teams from start.gg**. Then do a test check-in and **Clear all check-ins**.
5. **Station board:** open `/stations/` on the TV and press F11 for full screen. It has no hub menu on purpose.

## Schedule (fast for every event)

The public schedule is drawn from a Google Sheet, so a new event (or a time change on the day) is just a sheet edit.

1. In Google Sheets, **File → Import** `schedule/schedule-template.csv` (or make a tab with the columns **Day, Start, End, Event, Details, Type**).
   - **Type**: `main`, `general` or `social` (also `side` and `end`). It sets the badge next to the time.
   - **Day**: only needed on the first row of each day.
2. **File → Share → Publish to web** → pick the schedule tab → **Comma-separated values (.csv)** → **Publish**. Copy the link.
3. Paste it into `site-config.js` as `schedule.sheetCsvUrl`.

Edits to the sheet show up on the site within about 5 minutes (Google's publishing delay). No commit needed.
Without a sheet, the page uses `schedule/schedule-data.js` instead.

The event name, date, location, logo and social links on the schedule and map list come from `site-config.js` too.

## Map list from a Google Sheet

Same idea as the schedule:

1. **File → Import** `maps/maplist-template.csv` into a new tab (it's your current map list). Columns: **Stage, Heading, Round, Format, Game, Mode, Map, Stage notes, Image**.
   - **Stage** is the tab name. **Heading**, **Stage notes** and **Image** only go on the first row of each stage.
   - Blank **Stage**, **Round** and **Format** cells repeat the row above.
   - **Mode**: `SZ`, `TC`, `RM`, `CB`, `TW` or `Counterpick` (leave **Map** blank for counterpick games).
   - **Image**: a link such as `/assets/counterpick-pool.png`, shown at the bottom of that stage.
2. **File → Share → Publish to web** → that tab → **CSV** → **Publish**, and paste the link into `site-config.js` as `maps.sheetCsvUrl`.

Without a sheet, the page shows the map list written in `maps/index.html`.

## Updating the run of show from Sheets

Run of show → **Tools** → **Import from Google Sheets**. Select your rows in Sheets (with the header row), copy, paste. The columns are detected automatically (your layout: Start, End, Duration, Category, Task, Owner, Notes) and you can adjust them. **Replace sheet blocks** swaps out blocks from earlier imports and keeps ones added in the app; checkmarks carry over where the start time and category match.

## Running late

Run of show → **Tools** → **Running late?** moves every unfinished block from a chosen time by N minutes.

## Owners

Write owners the way your sheet does: `Deed / Law`, `Raven (Station 1) / Piko (Mainstage)`. Names are split on `/`, `,` and `&`; text in brackets is shown as that person’s spot in **My shifts**. Blocks with no owner, `TBD` or `?` are flagged.

## PIN levels: who can do what

There are three PINs. The owner sets them in **Run of show → Tools → PINs**.

| | Attendees | Volunteer | Staff | Owner |
|---|---|---|---|---|
| Hub, schedule, maps, station board, free play (player side) | ✓ | ✓ | ✓ | ✓ |
| **My shifts**: see and tick off their own blocks | | ✓ | ✓ | ✓ |
| **Check-in**: check teams in/out, mark players here, flag Switch 2s | | ✓ | ✓ | ✓ |
| Full run of show: Now, Timeline, editing, adding, delays | | | ✓ | ✓ |
| Editing teams and players, walk-up teams, imports (add / update) | | | ✓ | ✓ |
| Free play staff tab (still needs the matchmaker's own PIN) | | | ✓ | ✓ |
| Deleting blocks or teams, resets, "replace" imports, changing PINs | | | | ✓ |

- Upgrading from the single-PIN version: your old staff PIN becomes the **owner PIN**. Set Staff and Volunteer PINs before the event.
- The levels are enforced by the database, not just hidden on the page.
- Volunteers pick their own name in **My shifts**. They can only tick off blocks that have their name on them.
- **Turn off** a level's PIN in Tools to sign everyone using it out.
- Staff and volunteers on shared devices should tap **Lock** when they're done.
- Staff pages check for changes every 4 seconds, because private data can't use Supabase's realtime feed.

## Mode icons (map list)

Put square icons (transparent background) in `assets/modes/`: `sz.png`, `tc.png`, `rm.png`, `cb.png`, `tw.png`. Missing icons show the text label instead. For .svg or .webp, set `maps: { iconType: "svg" }` in `site-config.js`.

## Font

Every page uses one font, the station board's bold Arial/Helvetica look. To change it for an event, add `font: "Barlow",` (any Google Fonts name) to `site-config.js`.

## Troubleshooting

- **“Almost ready”** on a staff page: `site-config.js` still has placeholders.
- **“Couldn’t load”**: check the URL/key in `site-config.js` and that `ops-setup.sql` ran without errors.
- **Status shows “Offline, retrying…”**: the page can't reach Supabase. Check the venue Wi-Fi; it reconnects on its own.
- **Station board empty**: check `EVENT_ID` and `STARTGG_API_KEY` in Vercel, then redeploy. Sets only show once they’re assigned a station on start.gg, and the event has to be live (see the original README).
- **Wrong PIN 8 times** locks editing for 5 minutes.
- **Change the PIN**: Run of show → Tools → Change staff PIN.
