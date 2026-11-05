// Shared start.gg helpers for the hub's server functions.
// Settings come from environment variables (Vercel > Project > Settings > Environment Variables):
//   STARTGG_API_KEY   your start.gg API token (keep it secret; never put it in a page)
//   EVENT_ID          the start.gg event ID to show
//   MAIN_STATION      (optional) station number shown as "M" for mainstage. Default 6.
const STARTGG_API_URL = 'https://api.start.gg/gql/alpha';

async function gql(query, variables) {
  if (!process.env.STARTGG_API_KEY) throw new Error('STARTGG_API_KEY is not set');
  const response = await fetch(STARTGG_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + process.env.STARTGG_API_KEY },
    body: JSON.stringify({ query, variables })
  });
  const data = await response.json();
  if (data.errors) throw new Error(data.errors.map(function (e) { return e.message; }).join('; '));
  return data.data;
}

// ---------- roster (team names + players) ----------
const ROSTER_QUERY = `
  query EventEntrants($eventId: ID!, $page: Int!) {
    event(id: $eventId) {
      entrants(query: { page: $page, perPage: 75 }) {
        pageInfo { totalPages }
        nodes { id name team { name members { player { gamerTag } } } }
      }
    }
  }`;

let rosterCache = null, rosterAt = 0;
let fileRoster = {};
try { fileRoster = require('../data/roster.json'); } catch (e) { fileRoster = {}; }

async function fetchRoster() {
  const roster = {};
  let page = 1, totalPages = 1;
  do {
    const d = await gql(ROSTER_QUERY, { eventId: process.env.EVENT_ID, page });
    const entrants = d.event.entrants;
    totalPages = entrants.pageInfo.totalPages;
    entrants.nodes.forEach(function (e) {
      roster[e.id] = {
        entrantName: e.name,
        teamName: e.team ? e.team.name : e.name,
        players: e.team && e.team.members ? e.team.members.map(function (m) { return m.player.gamerTag; }) : []
      };
    });
    page++;
  } while (page <= totalPages && page <= 20);
  return roster;
}

// Live roster, refreshed at most every 10 minutes; falls back to data/roster.json.
async function getRoster(force) {
  if (!force && rosterCache && Date.now() - rosterAt < 10 * 60 * 1000) return rosterCache;
  try {
    rosterCache = await fetchRoster();
    rosterAt = Date.now();
  } catch (e) {
    console.warn('Roster fetch failed, using data/roster.json:', e.message);
    if (!rosterCache) rosterCache = fileRoster;
  }
  return rosterCache;
}

module.exports = { gql, getRoster };
