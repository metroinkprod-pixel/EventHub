# Event Hub

See **SETUP.md** for setup and deployment.

```
index.html            Hub home
site-config.js        Event name, staff database keys, links   <- edit per event
nav.js                Shared menu bar (add <script src="/nav.js"></script> to any page)
shared/               Styles + helpers for the staff tools
run-of-show/          Run of show tool
checkin/              Tournament check-in tool
schedule/  maps/      Player-facing pages
stations/             Station board (TV)
matchmaker/           Free-play matchmaker (own Supabase project)
api/                  Vercel server functions for start.gg (bracket, roster)
data/roster.json      Backup roster if start.gg can't be reached
scripts/              fetch-roster.js (optional)
supabase/             SQL for the staff database
```
