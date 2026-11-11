// Export every set in the event, with its times, to a CSV for later analysis.
//
// Usage (Node 20+), from the project folder with a .env file containing
// STARTGG_API_KEY and EVENT_ID:
//   node --env-file=.env scripts/fetch-sets.js
//
// Optional: pass a different event ID as the first argument, e.g. for a past event:
//   node --env-file=.env scripts/fetch-sets.js 1234567
//
// Writes exports/sets-<eventId>.csv. The exports/ folder is meant to stay out of
// the public repo (add "exports/" to .gitignore); keep the CSVs in Drive instead.
//
// Columns:
//   scheduled  = start.gg "startAt" (only if you scheduled sets)
//   started    = "startedAt" (only if the set was marked started / in progress)
//   completed  = "completedAt" (when the result was reported)
//   *_epoch    = the same times as Unix seconds, for sorting or spreadsheets
//   minutes    = completed - started, when both exist
const fs = require('fs');
const path = require('path');
const { gql } = require('../api/_startgg');

const TIME_ZONE = 'America/New_York';
const PER_PAGE = 40; // keeps each request under start.gg's 1000-object limit

const QUERY = `
  query EventSetTimes($eventId: ID!, $page: Int!, $perPage: Int!) {
    event(id: $eventId) {
      name
      sets(page: $page, perPage: $perPage, sortType: STANDARD, filters: { hideEmpty: true }) {
        pageInfo { total totalPages }
        nodes {
          id
          state
          fullRoundText
          round
          startAt
          startedAt
          completedAt
          winnerId
          station { number }
          phaseGroup { displayIdentifier phase { name phaseOrder } }
          slots {
            entrant { id name }
            standing { stats { score { value } } }
          }
        }
      }
    }
  }`;

const STATES = { 1: 'not_started', 2: 'in_progress', 3: 'completed', 4: 'ready', 5: 'invalid', 6: 'called', 7: 'queued' };

function localTime(epoch) {
  if (!epoch) return '';
  return new Date(epoch * 1000).toLocaleString('en-US', {
    timeZone: TIME_ZONE, hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true
  });
}
function localDate(epoch) {
  if (!epoch) return '';
  return new Date(epoch * 1000).toLocaleDateString('en-CA', { timeZone: TIME_ZONE }); // YYYY-MM-DD
}
function csvCell(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function score(slot) {
  const v = slot && slot.standing && slot.standing.stats && slot.standing.stats.score
    ? slot.standing.stats.score.value : null;
  if (v === null || v === undefined) return '';
  return v === -1 ? 'DQ' : v;
}

async function main() {
  const eventId = process.argv[2] || process.env.EVENT_ID;
  if (!eventId) throw new Error('No event ID: set EVENT_ID in .env or pass one as an argument');

  const rows = [];
  let page = 1, totalPages = 1, eventName = '';
  do {
    const d = await gql(QUERY, { eventId, page, perPage: PER_PAGE });
    if (!d.event) throw new Error('No event found for ID ' + eventId);
    eventName = d.event.name;
    const sets = d.event.sets;
    totalPages = sets.pageInfo.totalPages || 1;
    sets.nodes.forEach(function (s) {
      const a = s.slots[0] || {}, b = s.slots[1] || {};
      const ea = a.entrant || {}, eb = b.entrant || {};
      const minutes = s.startedAt && s.completedAt ? Math.round((s.completedAt - s.startedAt) / 60) : '';
      rows.push({
        set_id: s.id,
        phase: s.phaseGroup && s.phaseGroup.phase ? s.phaseGroup.phase.name : '',
        phase_order: s.phaseGroup && s.phaseGroup.phase ? s.phaseGroup.phase.phaseOrder : '',
        pool: s.phaseGroup ? s.phaseGroup.displayIdentifier : '',
        round: s.fullRoundText || '',
        round_number: s.round,
        station: s.station ? s.station.number : '',
        team_a: ea.name || '',
        team_b: eb.name || '',
        score_a: score(a),
        score_b: score(b),
        winner: s.winnerId ? (s.winnerId === ea.id ? ea.name : s.winnerId === eb.id ? eb.name : '') : '',
        state: STATES[s.state] || s.state,
        date: localDate(s.completedAt || s.startedAt || s.startAt),
        scheduled: localTime(s.startAt),
        started: localTime(s.startedAt),
        completed: localTime(s.completedAt),
        minutes,
        scheduled_epoch: s.startAt || '',
        started_epoch: s.startedAt || '',
        completed_epoch: s.completedAt || ''
      });
    });
    console.log('Page ' + page + ' of ' + totalPages + ': ' + rows.length + ' sets so far');
    page++;
    if (page <= totalPages) await new Promise(function (r) { setTimeout(r, 800); }); // stay under rate limits
  } while (page <= totalPages && page <= 50);

  rows.sort(function (x, y) {
    return (x.started_epoch || x.completed_epoch || Infinity) - (y.started_epoch || y.completed_epoch || Infinity);
  });

  const cols = Object.keys(rows[0] || { set_id: '' });
  const csv = [cols.join(',')].concat(rows.map(function (r) {
    return cols.map(function (c) { return csvCell(r[c]); }).join(',');
  })).join('\n') + '\n';

  const dir = path.join(__dirname, '..', 'exports');
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, 'sets-' + eventId + '.csv');
  fs.writeFileSync(out, csv);

  const withStart = rows.filter(function (r) { return r.started; }).length;
  const withEnd = rows.filter(function (r) { return r.completed; }).length;
  console.log('\n' + eventName + ': saved ' + rows.length + ' sets to ' + out);
  console.log('  ' + withStart + ' have a start time, ' + withEnd + ' have a completion time.');
  if (rows.length && withStart < rows.length / 2) {
    console.log('  Most sets have no start time: they probably weren\'t marked "in progress" on start.gg.');
    console.log('  Completion times still show when each round actually wrapped up.');
  }
}

main().catch(function (e) { console.error('Failed:', e.message); process.exit(1); });
