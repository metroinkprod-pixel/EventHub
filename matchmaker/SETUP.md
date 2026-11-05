# Tournament Matchmaker: setup guide

About 15 minutes, all free. You need a Supabase account (the database) and somewhere to put four files online (Netlify Drop is the easiest).

## What's in the folder

| File | What it is |
|---|---|
| `index.html` | The app (players and staff use the same link) |
| `matchmaker.js` | The pairing rules |
| `config.js` | Where you paste your Supabase details |
| `schema.sql` | Sets up the database. Run once in Supabase. |

## 1. Create the database (Supabase)

1. Go to supabase.com, sign in, and click **New project**. Pick any name and region, set a database password (save it), and wait a minute for it to finish.
2. In the left sidebar open **SQL Editor** and click **New query**.
3. Open `schema.sql` in a text editor. Find the line marked `>>> STAFF PIN <<<` near the bottom and change `2468` to your own staff PIN (6+ digits recommended).
4. Paste the whole file into the SQL editor and click **Run**. You should see "Success. No rows returned."
5. Go to **Project Settings → API** (or **Data API / API Keys**). Copy:
   - the **Project URL** (looks like `https://abcd1234.supabase.co`)
   - the **anon public** key (or the **publishable** key). Do NOT use the `service_role` / secret key.

## 2. Connect the app

Open `config.js` and paste the two values between the quotes:

```js
window.TM_CONFIG = {
  SUPABASE_URL: "https://abcd1234.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOi...your key..."
};
```

## 3. Put it online (Netlify Drop)

1. Go to app.netlify.com/drop (free account).
2. Drag the whole `tournament-matchmaker` folder onto the page.
3. You get a link like `https://random-name.netlify.app`. In Site settings you can rename it to something like `yourevent.netlify.app`.

Any static host works too (GitHub Pages, Vercel, Cloudflare Pages).

## 4. Day-of checklist

1. Open the link on the staff laptop/tablet, tap **Staff**, enter the PIN.
2. **Settings:** set the event name, number of stations (they're called Stations by default; you can switch to Court, Table, Ring, etc.), players per side (4).
3. Print or display the **Check-in QR code** from Settings so players can scan it.
4. Optional: open the **Stations** tab on a TV or projector. It updates live and shows who's up next.
5. Before doors open, do a test: check yourself in on your phone, start a custom match, record a score, then **Settings → Reset → Clear results, keep players** (or **Start a new event**).

## How it works

**Players (phone, no login):** scan the QR, enter their name and weapons, choose Free agent or With a team (pick an existing team or start a new one). Their phone remembers them. They can check out for a break and check back in, switch teams, update their weapons, and see their status: in line, up next on Station 2, playing, or waiting for more players.

**Matchmaking rules:**
- Registered teams stay together. If a team has more than 4 checked in, the 4 with the fewest games play and the rest sit for that match.
- Teams short on players are filled with free agents (fewest games first).
- Leftover free agents are grouped into pickup squads of 4.
- Squads are lined up by average games played, fewest first. Ties go to whoever has waited longest. Finishing a match puts you at the back of your priority group.
- A team won't face the same opponent twice in a row if another opponent is available.

The app *suggests* the next match for each open station. Staff press **Start** (or **Start all**), so a person always confirms who's actually there.

**Staff (PIN):**
- **Stations:** start suggested matches, enter scores, save results (tied scores ask who won), or cancel a match (players go back in line with no game counted).
- **Players:** add walk-ups (with their weapons), check people in/out, change teams, edit name and weapons, remove. Search also matches weapons. **Phone link** shows a QR the player scans to manage themselves from their own phone (also fixes "I got a new phone / cleared my browser").
- **Custom match:** pick any available players for side A and B. Good for challenge matches or special requests.
- **Teams:** create, rename, delete (players become free agents).
- **Results:** full history, with **Undo result** to fix a wrong score (reverses everyone's stats).

## Weapons

Each player can list their weapons (up to 80 characters, optional). It shows next to their name on the Stations board, suggested matches, the queue, the custom match picker, and the Standings table. Players edit it from their phone; staff edit it with **Edit** on the Players tab.

## Security notes

- Everyone can *view* stations, the queue and standings. Nobody can change data except through the app's built-in actions.
- Staff actions check the PIN on the server every time. After 8 wrong PINs, staff access locks for 5 minutes.
- Each player's phone holds a private key that only lets it check that player in/out or change their team.
- Player names are unique. If someone's name is taken, they'll be asked to add a last initial.
- Staff stay signed in until the browser tab closes or they press **Lock staff**.

## Troubleshooting

- **"Almost ready" message:** `config.js` still has the placeholder values.
- **"Can't reach the database":** check the URL/key in `config.js` and that `schema.sql` ran without errors.
- **Status shows "Reconnecting":** live updates dropped. The app still refreshes every 20 seconds; check the venue Wi-Fi.
- **Free Supabase projects pause after a week of no use.** Open the app (or the Supabase dashboard) the day before your event to wake it up.
- **Already ran an earlier version of `schema.sql`?** Run the new one once to add the weapons field. It replaces the old setup (and erases test data), so do this before the event.
- **Re-running `schema.sql` erases all data.** Use the in-app Reset buttons between events instead.
