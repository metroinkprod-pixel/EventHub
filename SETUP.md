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

Anyone with the link can **view** the staff pages. Changing anything needs the **staff PIN** (entered once per device, shared by run of show and check-in).

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

## Updating the run of show from Sheets

Run of show → **Tools** → **Import from Google Sheets**. Select your rows in Sheets (with the header row), copy, paste. The columns are detected automatically (your layout: Start, End, Duration, Category, Task, Owner, Notes) and you can adjust them. **Replace sheet blocks** swaps out blocks from earlier imports and keeps ones added in the app; checkmarks carry over where the start time and category match.

## Running late

Run of show → **Tools** → **Running late?** moves every unfinished block from a chosen time by N minutes.

## Owners

Write owners the way your sheet does: `Deed / Law`, `Raven (Station 1) / Piko (Mainstage)`. Names are split on `/`, `,` and `&`; text in brackets is shown as that person’s spot in **My shifts**. Blocks with no owner, `TBD` or `?` are flagged.

## Troubleshooting

- **“Almost ready”** on a staff page: `site-config.js` still has placeholders.
- **“Couldn’t load”**: check the URL/key in `site-config.js` and that `ops-setup.sql` ran without errors.
- **Status shows “Reconnecting”**: live updates dropped; pages still refresh every minute. Check the venue Wi-Fi.
- **Station board empty**: check `EVENT_ID` and `STARTGG_API_KEY` in Vercel, then redeploy. Sets only show once they’re assigned a station on start.gg, and the event has to be live (see the original README).
- **Wrong PIN 8 times** locks editing for 5 minutes.
- **Change the PIN**: Run of show → Tools → Change staff PIN.
