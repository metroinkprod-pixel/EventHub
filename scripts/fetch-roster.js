// Optional: save the start.gg roster to data/roster.json as a backup.
// The station board already pulls the roster live (refreshing every 10 minutes)
// and only uses this file if start.gg can't be reached.
//
// Usage (Node 20+), from the project folder with a .env file containing
// STARTGG_API_KEY and EVENT_ID:
//   node --env-file=.env scripts/fetch-roster.js
const fs = require('fs');
const path = require('path');
const { getRoster } = require('../api/_startgg');

getRoster(true).then(function (roster) {
  const out = path.join(__dirname, '..', 'data', 'roster.json');
  fs.writeFileSync(out, JSON.stringify(roster, null, 2));
  console.log('Saved ' + Object.keys(roster).length + ' entrants to ' + out);
}).catch(function (e) { console.error('Failed:', e.message); process.exit(1); });
