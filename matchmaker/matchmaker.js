// Matchmaking logic. Pure functions, no network.
// Rules:
//  - Registered teams stay together. A team with 4+ available players plays its
//    4 with the fewest games (the rest sit on the bench for that match).
//  - Incomplete teams are filled with the free agents who have played least.
//  - Remaining free agents form pickup squads of 4.
//  - Squads are queued by average games played (fewest first), then by how
//    long they have been waiting.
//  - When possible, a team doesn't face the same opponent twice in a row.
(function (root) {
  function readyTime(p) { return Date.parse(p.ready_since) || 0; }
  function byPriority(x, y) { return (x.games - y.games) || (readyTime(x) - readyTime(y)); }
  function avg(arr, f) { return arr.length ? arr.reduce(function (s, x) { return s + f(x); }, 0) / arr.length : 0; }

  function makeSquad(members, kind, teamId, teamName, extra) {
    var squad = {
      key: teamId ? 'team:' + teamId : 'pickup:' + members.map(function (p) { return p.id; }).sort().join(','),
      kind: kind,                       // 'team' | 'filled' | 'pickup'
      team_id: teamId || null,
      name: teamName || ('Team ' + members[0].name),
      players: members,
      fillIds: new Set((extra && extra.fill) || []),
      bench: (extra && extra.bench) || [],
      avgGames: avg(members, function (p) { return p.games; }),
      avgReady: avg(members, readyTime)
    };
    return squad;
  }

  function plan(input) {
    var players = input.players || [], teams = input.teams || [], matches = input.matches || [];
    var settings = input.settings || {};
    var size = settings.team_size || 4;
    var stations = settings.stations || 1;
    var teamById = new Map(teams.map(function (t) { return [t.id, t]; }));

    var active = matches.filter(function (m) { return m.status === 'active'; });
    var busy = new Map(); // player id -> match
    active.forEach(function (m) { m.a_players.concat(m.b_players).forEach(function (id) { busy.set(id, m); }); });
    var usedStations = new Set(active.map(function (m) { return m.station; }));
    var openStations = [];
    for (var s = 1; s <= stations; s++) if (!usedStations.has(s)) openStations.push(s);

    var available = players.filter(function (p) { return p.checked_in && !busy.has(p.id); }).sort(byPriority);

    var groups = new Map(), free = [];
    available.forEach(function (p) {
      if (p.team_id && teamById.has(p.team_id)) {
        if (!groups.has(p.team_id)) groups.set(p.team_id, []);
        groups.get(p.team_id).push(p);
      } else free.push(p);
    });

    var squads = [], partials = [];
    groups.forEach(function (members, tid) {
      var name = teamById.get(tid).name;
      if (members.length >= size) {
        squads.push(makeSquad(members.slice(0, size), 'team', tid, name, { bench: members.slice(size) }));
      } else {
        partials.push({ team_id: tid, name: name, members: members });
      }
    });

    partials.sort(function (a, b) {
      return (avg(a.members, function (p) { return p.games; }) - avg(b.members, function (p) { return p.games; })) ||
             (avg(a.members, readyTime) - avg(b.members, readyTime));
    });
    var unfilled = [];
    partials.forEach(function (pt) {
      var need = size - pt.members.length;
      if (free.length >= need) {
        var fill = free.splice(0, need);
        squads.push(makeSquad(pt.members.concat(fill), 'filled', pt.team_id, pt.name,
          { fill: fill.map(function (p) { return p.id; }) }));
      } else {
        unfilled.push({ team_id: pt.team_id, name: pt.name, members: pt.members, need: need });
      }
    });

    while (free.length >= size) squads.push(makeSquad(free.splice(0, size), 'pickup'));
    var leftoverFree = free;

    squads.sort(function (a, b) { return (a.avgGames - b.avgGames) || (a.avgReady - b.avgReady); });

    // Most recent opponent for each registered team.
    var lastOpp = new Map();
    matches.filter(function (m) { return m.status === 'done'; })
      .sort(function (a, b) { return Date.parse(b.finished_at) - Date.parse(a.finished_at); })
      .forEach(function (m) {
        if (m.a_team_id && !lastOpp.has(m.a_team_id)) lastOpp.set(m.a_team_id, m.b_team_id || null);
        if (m.b_team_id && !lastOpp.has(m.b_team_id)) lastOpp.set(m.b_team_id, m.a_team_id || null);
      });
    function isRematch(x, y) {
      return !!(x.team_id && y.team_id && (lastOpp.get(x.team_id) === y.team_id || lastOpp.get(y.team_id) === x.team_id));
    }

    var proposals = [], used = new Set();
    for (var k = 0; k < openStations.length; k++) {
      var i = -1;
      for (var a = 0; a < squads.length; a++) if (!used.has(a)) { i = a; break; }
      if (i < 0) break;
      var j = -1, fallback = -1;
      for (var b = i + 1; b < squads.length; b++) {
        if (used.has(b)) continue;
        if (fallback < 0) fallback = b;
        if (!isRematch(squads[i], squads[b])) { j = b; break; }
      }
      if (j < 0) j = fallback;
      if (j < 0) break;
      used.add(i); used.add(j);
      proposals.push({ station: openStations[k], a: squads[i], b: squads[j] });
    }
    var queued = squads.filter(function (_, idx) { return !used.has(idx); });

    return {
      size: size, busy: busy, available: available, squads: squads, proposals: proposals,
      queued: queued, unfilled: unfilled, leftoverFree: leftoverFree, openStations: openStations
    };
  }

  // Where is one player in line? Used for the player's phone screen.
  function playerSpot(result, playerId) {
    var m = result.busy.get(playerId);
    if (m) return { state: 'playing', match: m };
    for (var p = 0; p < result.proposals.length; p++) {
      var pr = result.proposals[p];
      if (pr.a.players.some(function (x) { return x.id === playerId; })) return { state: 'next', proposal: pr, squad: pr.a };
      if (pr.b.players.some(function (x) { return x.id === playerId; })) return { state: 'next', proposal: pr, squad: pr.b };
    }
    for (var q = 0; q < result.queued.length; q++) {
      if (result.queued[q].players.some(function (x) { return x.id === playerId; })) {
        return { state: 'queued', squad: result.queued[q], ahead: q, matchesAhead: Math.floor(q / 2) + 1 };
      }
      if (result.queued[q].bench.some(function (x) { return x.id === playerId; })) return { state: 'bench', squad: result.queued[q] };
    }
    for (var r = 0; r < result.proposals.length; r++) {
      var pr2 = result.proposals[r];
      if (pr2.a.bench.concat(pr2.b.bench).some(function (x) { return x.id === playerId; })) return { state: 'bench', squad: pr2.a.bench.some(function (x) { return x.id === playerId; }) ? pr2.a : pr2.b };
    }
    for (var u = 0; u < result.unfilled.length; u++) {
      if (result.unfilled[u].members.some(function (x) { return x.id === playerId; })) return { state: 'needFill', team: result.unfilled[u] };
    }
    if (result.leftoverFree.some(function (x) { return x.id === playerId; })) {
      return { state: 'needFree', need: result.size - result.leftoverFree.length };
    }
    return { state: 'idle' };
  }

  var api = { plan: plan, playerSpot: playerSpot };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Matchmaker = api;
})(typeof window !== 'undefined' ? window : globalThis);
