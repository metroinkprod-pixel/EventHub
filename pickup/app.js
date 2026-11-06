// Organized pickup games: players join with a name + weapon, get shuffled into
// random teams, winner stays on. Runs itself; staff only step in if needed.
(function () {
  var O = window.Ops, esc = O.esc, H = window.HUB || {};
  var $ = function (id) { return document.getElementById(id); };
  var main = $("main");
  var NAME = (H.scrims && H.scrims.name) || "Pickup Games";
  var ME_KEY = "pug-me";
  var COLORS = { Orange: "#ff7a1a", Blue: "#3b82f6", Pink: "#ff4fa3", Green: "#3ccf6e", Purple: "#9b5cff", Yellow: "#ffd400", Turquoise: "#20d6c7", Red: "#ff4d4d" };

  var S = { settings: { stations: 2, station_label: "Station", team_size: 4, best_of: 5, max_streak: 0 }, players: [], matches: [], loaded: false };
  var me = null;
  try { me = JSON.parse(localStorage.getItem(ME_KEY) || "null"); } catch (e) {}
  // A phone link from staff ("#link=<id>.<key>") links this phone to a player they added.
  var linkM = /^#link=([0-9a-f-]{36})\.([0-9a-f]{32})$/.exec(location.hash || "");
  if (linkM) { me = { id: linkM[1], token: linkM[2] }; try { localStorage.setItem(ME_KEY, JSON.stringify(me)); } catch (e) {} history.replaceState(null, "", "#play"); }
  var view = { tab: (location.hash || "").replace("#", "") || "play", pick: null, added: null };
  if (view.tab === "me") view.tab = "play";          // old QR codes pointed to #me
  var busy = false;

  $("title").innerHTML = esc(window.HUB_PAGE_TITLE || NAME) + '<small id="sub"></small>';

  // ---------- helpers ----------
  function L() { return S.settings.station_label || "Station"; }
  // Station numbers in use, e.g. [2] or [1, 3, 4]
  function nums() {
    var n = S.settings.station_numbers;
    if (n && n.length) return n.slice().sort(function (a, b) { return a - b; });
    var out = []; for (var i = 1; i <= (S.settings.stations || 1); i++) out.push(i); return out;
  }
  function paused(i) { return (S.settings.paused || []).indexOf(i) >= 0; }
  function player(id) { return S.players.find(function (p) { return p.id === id; }); }
  function mine() { return me && player(me.id); }
  function live() { return S.matches.filter(function (m) { return m.status === "active" || m.status === "waiting"; }); }
  function matchOf(id) { return live().find(function (m) { return m.a_players.indexOf(id) >= 0 || m.b_players.indexOf(id) >= 0; }); }
  function line() { return S.players.filter(function (p) { return p.status === "queue"; }).sort(function (a, b) { return new Date(a.queued_at) - new Date(b.queued_at); }); }
  function need() { return Math.floor((S.settings.best_of || 5) / 2) + 1; }
  function swatch(name) { return '<span class="swatch" style="background:' + (COLORS[name] || "var(--t-accent)") + '"></span>'; }
  function teamHtml(name, ids, names, opts) {
    opts = opts || {};
    var list = ids.length ? ids.map(function (id, i) {
      var p = player(id), you = me && id === me.id;
      return '<li class="' + (you ? "you" : "") + '"><span>' + esc(p ? p.name : names[i] || "?") + (you ? " (you)" : "") + '</span><span class="w">' + esc(p ? p.weapon : "") + "</span></li>";
    }).join("") : '<li class="muted">Waiting for players…</li>';
    return '<div class="team' + (opts.mine ? " mine" : "") + '"><div class="tn"><span>' + swatch(name) + esc(name || "Team") + "</span>" +
      (opts.streak ? '<span class="pill done">' + opts.streak + (opts.streak === 1 ? " win" : " wins in a row") + "</span>" : "") + "</div><ul>" + list + "</ul></div>";
  }
  function closedStatus() { return window.HubScrims && HubScrims.configured() ? HubScrims.status() : { open: true }; }
  var ERR = {
    name_taken: "That name is already in. Pick a different one (or add your tag).",
    empty: "Enter your name first.", too_long: "That name is too long (30 characters max).",
    in_match: "You’re in a match right now. Finish it first.",
    already_reported: "Someone already reported this match.", bad_score: "That score doesn’t fit the format.",
    bad_token: "This phone isn’t linked to that player anymore.", not_in_match: "You’re not in this match.",
    forbidden: "Your PIN can’t do that.", bad_stations: "List the station numbers to use, like 2 or 1, 3, 4.",
    no_sub: "Nobody’s in line to take your spot yet. Finish this game, or ask a staff member.",
    line_empty: "Nobody’s in line. Pick a player to write in.", not_available: "That player is already playing.", bad_time: "Times should look like 17:00.", bad_date: "Pick a date or leave it empty."
  };
  async function call(fn, args, ok) {
    if (busy) return null;
    busy = true;
    try {
      var r = await O.sb.rpc(fn, args);
      if (r.error) throw new Error("Couldn’t reach the server. Check your connection.");
      if (!r.data.ok) {
        if (r.data.error === "bad_token") { forget(); }
        if (r.data.error === "bad_pin") { O.lock(); }
        throw new Error(ERR[r.data.error] || ("That didn’t work (" + r.data.error + ")."));
      }
      if (ok) O.toast(ok);
      await load();
      return r.data;
    } catch (e) { O.toast(e.message); return null; }
    finally { busy = false; }
  }
  function forget() { me = null; try { localStorage.removeItem(ME_KEY); } catch (e) {} }
  function staffArgs(extra) { return Object.assign({ p_pin: O.pin }, extra); }

  // ---------- Play tab ----------
  function viewPlay() {
    var st = closedStatus(), p = mine();
    if (!st.open && !(p && p.status === "playing")) {
      return '<section class="panel closed"><span class="tag">' + (st.over ? "Closed" : "Not open yet") + "</span><h2>" + esc(st.label) + "</h2>" +
        '<p class="lead">' + esc((window.HubScrims && HubScrims.closedText) || (st.over ? "Thanks for playing!" : NAME + " opens then. Check the schedule for what’s on now.")) + "</p></section>" + howHtml();
    }
    if (!p) {
      return '<section class="panel me"><h2>Jump in</h2><p class="lead">Enter your name and weapon. You’ll be put on a random team when it’s your turn.</p>' +
        '<form class="form" id="joinf"><div class="row2"><label class="f">Your name<input type="text" name="name" maxlength="30" autocomplete="nickname" required></label>' +
        '<label class="f">Weapon you’ll play<input type="text" name="weapon" maxlength="40" list="weapons" placeholder="e.g. Splattershot"></label></div>' +
        '<button class="btn primary" style="justify-self:start">Get in line</button></form></section>' + howHtml();
    }
    var m = matchOf(p.id), html = "";
    if (m && m.status === "active") {
      var side = m.a_players.indexOf(p.id) >= 0 ? "a" : "b";
      html += '<section class="panel me"><span class="pill live" style="justify-self:start">You’re up</span><h2>Go to ' + esc(L()) + " " + m.station + "</h2>" +
        '<div class="teams">' + teamHtml(m.a_name, m.a_players, m.a_names, { mine: side === "a", streak: m.a_streak }) + '<span class="vs">VS</span>' +
        teamHtml(m.b_name, m.b_players, m.b_names, { mine: side === "b" }) + "</div>" + reportHtml(m) +
        '<div class="bar"><button class="btn ghost sm" data-act="sub-out">I have to leave</button><span class="small muted">The next person in line takes your spot.</span></div></section>';
    } else if (m && m.status === "waiting") {
      var more = Math.max(0, S.settings.team_size - line().length);
      html += '<section class="panel me"><span class="pill done" style="justify-self:start">You won · ' + m.a_streak + (m.a_streak === 1 ? " win" : " wins in a row") + "</span>" +
        "<h2>Stay at " + esc(L()) + " " + m.station + "</h2>" +
        '<p class="lead">Waiting for challengers' + (more ? ": " + more + " more player" + (more === 1 ? "" : "s") + " needed in line." : ". They’re on the way.") + "</p>" +
        teamHtml(m.a_name, m.a_players, m.a_names, { mine: true, streak: m.a_streak }) +
        '<div class="bar"><button class="btn ghost" data-act="break">Leave the station</button></div><p class="small muted" style="margin:0">If you leave, the next person in line takes your spot and your team keeps its streak.</p></section>';
    } else if (p.status === "queue") {
      var ln = line(), pos = ln.findIndex(function (x) { return x.id === p.id; }) + 1;
      var free = freeSpots();
      html += '<section class="panel me"><span class="pill flag" style="justify-self:start">In line</span><div class="big">#' + pos + "</div>" +
        '<p class="lead">' + esc(nextText(pos, ln.length, free)) + "</p>" +
        '<p class="small muted" style="margin:0">Playing: <b>' + esc(p.weapon || "no weapon set") + "</b> · You’ll get a random team. This page updates by itself.</p>" +
        '<div class="bar"><button class="btn" data-act="weapon">Change weapon</button><button class="btn ghost" data-act="away">Take a break</button><button class="btn ghost" data-act="leave">Leave for good</button></div></section>';
    } else {
      html += '<section class="panel me"><span class="pill skip" style="justify-self:start">On a break</span><h2>Ready to play again?</h2>' +
        '<div class="bar"><button class="btn primary" data-act="rejoin">Get back in line</button><button class="btn ghost" data-act="leave">Leave for good</button></div></section>';
    }
    html += '<section class="panel"><h2 style="margin-bottom:6px">Your games</h2><p class="lead">' + p.wins + " wins · " + p.losses + " losses · best streak " + p.best_streak + "</p></section>";
    return html;
  }
  function freeSpots() {
    var n = 0, s = S.settings;
    var ns = nums().filter(function (i) { return !paused(i); });
    live().forEach(function (m) { if (m.status === "waiting" && ns.indexOf(m.station) >= 0) n += s.team_size; });
    ns.forEach(function (i) { if (!live().some(function (m) { return m.station === i; })) n += s.team_size * 2; });
    return n;
  }
  function nextText(pos, total, free) {
    var size = S.settings.team_size;
    if (free >= size && total < size * 2 && free >= size * 2 && !live().some(function (m) { return m.status === "waiting"; })) {
      var more = size * 2 - total;
      return "Next game starts when " + more + " more player" + (more === 1 ? "" : "s") + " join the line.";
    }
    if (pos <= size) return "You’re in the next group. Stay close!";
    var ahead = Math.ceil((pos - size) / size);
    return pos - 1 + " ahead of you · about " + ahead + " more game" + (ahead === 1 ? "" : "s") + " until you’re up.";
  }
  function reportHtml(m) {
    var n = need(), pick = view.pick && view.pick.id === m.id ? view.pick : null;
    var scores = [];
    for (var l = 0; l < n; l++) scores.push(n + "–" + l);
    return '<div style="display:grid;gap:8px;border-top:1px solid var(--line);padding-top:12px"><b>Done? Report the result (best of ' + S.settings.best_of + ")</b>" +
      '<div class="choices"><span class="small muted" style="align-self:center">Who won?</span>' +
      ["a", "b"].map(function (w) { var nm = w === "a" ? m.a_name : m.b_name; return '<button class="btn" data-act="pick-w" data-w="' + w + '" aria-pressed="' + (!!pick && pick.w === w) + '">' + swatch(nm) + esc(nm) + "</button>"; }).join("") + "</div>" +
      (pick && pick.w ? '<div class="choices"><span class="small muted" style="align-self:center">Score</span>' + scores.map(function (sc, i) {
        return '<button class="btn" data-act="pick-s" data-l="' + i + '" aria-pressed="' + (pick.l === i) + '">' + sc + "</button>";
      }).join("") + "</div>" : "") +
      (pick && pick.w && pick.l != null ? '<button class="btn primary" data-act="report" data-id="' + m.id + '" style="justify-self:start">Submit: ' +
        esc(pick.w === "a" ? m.a_name : m.b_name) + " wins " + n + "–" + pick.l + "</button>" : "") + "</div>";
  }
  function howHtml() {
    return '<section class="panel"><h2 style="margin-bottom:8px">How it works</h2><ol class="how">' +
      "<li>Get in line with your name and weapon.</li>" +
      "<li>When it’s your turn you’re put on a random team of " + S.settings.team_size + " and sent to a " + esc(L().toLowerCase()) + ".</li>" +
      "<li>Best of " + S.settings.best_of + ". Anyone in the match reports the result here.</li>" +
      "<li>Winners stay on" + (S.settings.max_streak ? " (up to " + S.settings.max_streak + " wins in a row)" : "") + ", the next group from the line challenges them. Everyone else gets back in line.</li></ol></section>";
  }

  // ---------- Stations + line ----------
  function viewStations(staff) {
    var s = S.settings, ln = line(), html = '<section class="stations">';
    nums().forEach(function (i) {
      var m = live().find(function (x) { return x.station === i; });
      html += '<article class="panel st"><header><h3>' + esc(L()) + " " + i + "</h3>" +
        (paused(i) && !m ? '<span class="pill late">Paused</span>' : !m ? '<span class="pill skip">Open</span>' : m.status === "active" ? '<span class="pill live">Playing</span>' : '<span class="pill flag">Waiting for challengers</span>') + "</header>";
      if (!m) html += '<p class="lead">' + (paused(i) ? "Paused by staff. Games start again when it’s resumed." : "Starts when " + s.team_size * 2 + " players are in line.") + "</p>";
      else if (m.status === "active") html += '<div class="teams">' + teamHtml(m.a_name, m.a_players, m.a_names, { streak: m.a_streak }) + '<span class="vs">VS</span>' + teamHtml(m.b_name, m.b_players, m.b_names) + "</div>";
      else html += teamHtml(m.a_name, m.a_players, m.a_names, { streak: m.a_streak });
      if (staff && m) html += staffMatchHtml(m);
      if (staff) html += '<div class="bar">' + (paused(i)
        ? '<button class="btn sm primary" data-act="s-pause" data-st="' + i + '" data-p="0">Resume ' + esc(L().toLowerCase()) + " " + i + "</button><span class='small muted'>New games start automatically again.</span>"
        : '<button class="btn sm ghost" data-act="s-pause" data-st="' + i + '" data-p="1">Pause ' + esc(L().toLowerCase()) + " " + i + "</button><span class='small muted'>Lets the current match finish; no new ones start.</span>") + "</div>";
      html += "</article>";
    });
    html += "</section>";
    html += '<section class="panel"><h2 style="margin-bottom:8px">In line (' + ln.length + ")</h2>" +
      (ln.length ? '<ol class="line">' + ln.map(function (p) {
        return '<li class="' + (me && p.id === me.id ? "you" : "") + '">' + esc(p.name) + (p.weapon ? ' <span class="w">· ' + esc(p.weapon) + "</span>" : "") + "</li>";
      }).join("") + "</ol>" : '<p class="lead">Nobody in line right now.</p>') + "</section>";
    return html;
  }

  // ---------- Standings ----------
  function viewStandings() {
    var ps = S.players.filter(function (p) { return p.games > 0; }).sort(function (a, b) { return b.wins - a.wins || b.best_streak - a.best_streak || a.losses - b.losses || a.name.localeCompare(b.name); });
    var done = S.matches.filter(function (m) { return m.status === "done"; }).sort(function (a, b) { return new Date(b.finished_at) - new Date(a.finished_at); }).slice(0, 15);
    return '<section class="panel flush"><header><h2>Players</h2></header><div class="tablewrap"><table><thead><tr><th class="n">#</th><th>Player</th><th>Weapon</th><th class="n">W</th><th class="n">L</th><th class="n">Best streak</th></tr></thead><tbody>' +
      (ps.length ? ps.map(function (p, i) { return "<tr><td class='n'>" + (i + 1) + "</td><td><b>" + esc(p.name) + "</b></td><td>" + esc(p.weapon) + "</td><td class='n'>" + p.wins + "</td><td class='n'>" + p.losses + "</td><td class='n'>" + p.best_streak + "</td></tr>"; }).join("")
        : '<tr><td colspan="6" class="muted">No games played yet.</td></tr>') + "</tbody></table></div></section>" +
      '<section class="panel flush"><header><h2>Recent results</h2></header><div class="tablewrap"><table><thead><tr><th>Where</th><th>Winner</th><th class="n">Score</th><th>Loser</th></tr></thead><tbody>' +
      (done.length ? done.map(function (m) {
        var aw = m.winner === "a";
        return "<tr><td>" + esc(L()) + " " + m.station + "</td><td><b>" + swatch(aw ? m.a_name : m.b_name) + esc((aw ? m.a_names : m.b_names).join(", ")) + "</b></td><td class='n'>" +
          (aw ? m.score_a + "–" + m.score_b : m.score_b + "–" + m.score_a) + "</td><td>" + esc((aw ? m.b_names : m.a_names).join(", ")) + "</td></tr>";
      }).join("") : '<tr><td colspan="4" class="muted">No results yet.</td></tr>') + "</tbody></table></div></section>";
  }

  // ---------- Staff ----------
  function staffMatchHtml(m) {
    var n = need(), btns = "";
    if (m.status === "active") {
      for (var l = 0; l < n; l++) {
        btns += '<button class="btn sm" data-act="s-result" data-id="' + m.id + '" data-w="a" data-l="' + l + '">' + esc(m.a_name) + " " + n + "–" + l + "</button>";
        btns += '<button class="btn sm" data-act="s-result" data-id="' + m.id + '" data-w="b" data-l="' + l + '">' + esc(m.b_name) + " " + n + "–" + l + "</button>";
      }
    }
    var inMatch = m.a_players.concat(m.b_players).map(function (id) { return player(id); }).filter(Boolean);
    var avail = S.players.filter(function (p) { return p.status === "queue" || p.status === "away"; })
      .sort(function (a, b) { return (a.status === b.status ? 0 : a.status === "queue" ? -1 : 1) || new Date(a.queued_at) - new Date(b.queued_at); });
    var swap = '<form class="bar swapf" data-id="' + m.id + '" style="width:100%">' +
      '<label class="f">Take out<select name="out">' + inMatch.map(function (p) { return '<option value="' + p.id + '">' + esc(p.name) + "</option>"; }).join("") + "</select></label>" +
      '<label class="f">Put in<select name="in"><option value="">Next in line</option>' + avail.map(function (p) {
        return '<option value="' + p.id + '">' + esc(p.name) + (p.status === "away" ? " (on a break)" : " (in line)") + "</option>"; }).join("") + "</select></label>" +
      '<label class="f">Then they go<select name="to"><option value="away">On a break</option><option value="queue">Back in line</option></select></label>' +
      '<button class="btn sm" style="align-self:end">Swap</button></form>';
    var cancel = '<form class="bar cancelf" data-id="' + m.id + '" style="width:100%"><label class="f">Players go<select name="to"><option value="queue">To the front of the line</option><option value="away">On a break</option></select></label>' +
      '<button class="btn sm danger" style="align-self:end">' + (m.status === "active" ? "Cancel match" : "Break up team") + "</button>" +
      '<span class="small muted" style="align-self:end">The ' + esc(L().toLowerCase()) + " is paused until you resume it.</span></form>";
    return '<div class="bar" style="border-top:1px dashed var(--line);padding-top:10px">' + btns + cancel + swap + "</div>";
  }
  function viewStaff() {
    if (!O.can("staff")) return O.unlocked() ? O.noAccessHtml("Staff controls need a staff or owner PIN.") : O.lockedHtml("the pickup games controls");
    var s = S.settings;
    var link = view.added ? location.origin + "/pickup/#link=" + view.added.id + "." + view.added.token : "";
    var html = '<section class="panel"><h2 style="margin-bottom:6px">Add a player</h2><p class="lead" style="margin-bottom:10px">For people without a phone, or to write someone in. They join the line; use <b>Swap</b> under a ' + esc(L().toLowerCase()) + " to put them straight onto a team.</p>" +
      '<form class="bar" id="addf"><label class="f" style="flex:1;min-width:10rem">Name<input type="text" name="name" maxlength="30" required></label>' +
      '<label class="f" style="flex:1;min-width:10rem">Weapon<input type="text" name="weapon" maxlength="40" list="weapons"></label>' +
      '<label class="f">Add them<select name="status"><option value="queue">To the line</option><option value="away">On a break (not playing yet)</option></select></label>' +
      '<button class="btn primary" style="align-self:end">Add player</button></form>' +
      (view.added ? '<p class="small" style="margin:10px 0 0">Added <b>' + esc(view.added.name) + '</b>. To give them the page on their own phone later, send them this link: ' +
        '<a href="' + esc(link) + '" style="color:var(--t-accent);overflow-wrap:anywhere">' + esc(link) + '</a> <button class="btn sm" data-act="copy-link" data-v="' + esc(link) + '">Copy</button></p>' : "") + "</section>" +
      '<section class="panel"><h2 style="margin-bottom:6px">Settings</h2><p class="lead" style="margin-bottom:10px">Changes apply right away. The page runs itself; use the controls under each ' + esc(L().toLowerCase()) + " only if something goes wrong.</p>" +
      '<form class="grid2" id="setf">' +
      '<label class="f">' + esc(L()) + ' numbers to use<input type="text" name="station_numbers" inputmode="numeric" placeholder="e.g. 2  or  1, 3, 4" value="' + esc(nums().join(", ")) + '"></label>' +
      '<label class="f">Call them<select name="station_label">' + ["Station", "Setup", "Court", "Table"].map(function (x) { return "<option" + (x === s.station_label ? " selected" : "") + ">" + x + "</option>"; }).join("") + "</select></label>" +
      '<label class="f">Players per team<input type="number" name="team_size" min="1" max="8" value="' + s.team_size + '"></label>' +
      '<label class="f">Best of<select name="best_of">' + [1, 3, 5, 7].map(function (x) { return "<option" + (x === s.best_of ? " selected" : "") + ">" + x + "</option>"; }).join("") + "</select></label>" +
      '<label class="f">Winners stay for at most<select name="max_streak"><option value="0"' + (!s.max_streak ? " selected" : "") + ">No limit</option>" +
      [2, 3, 4, 5].map(function (x) { return '<option value="' + x + '"' + (x === s.max_streak ? " selected" : "") + ">" + x + " wins</option>"; }).join("") + "</select></label>" +
      '<label class="f">Opens at<input type="time" name="opens" value="' + esc(s.opens || "") + '"></label>' +
      '<label class="f">Closes at<input type="time" name="closes" value="' + esc(s.closes || "") + '"></label>' +
      '<label class="f">Only on this date<input type="date" name="open_date" value="' + esc(s.open_date || "") + '"></label>' +
      '<div class="bar" style="grid-column:1/-1"><button class="btn primary">Save settings</button><span class="small muted">Leave the times empty to stay open.</span></div></form></section>';
    html += viewStations(true);
    var ps = S.players.slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
    html += '<section class="panel flush"><header><h2>Players (' + ps.length + ")</h2></header><div class=\"tablewrap\"><table><thead><tr><th>Player</th><th>Weapon</th><th>Status</th><th></th></tr></thead><tbody>" +
      (ps.length ? ps.map(function (p) {
        var inM = matchOf(p.id);
        var stTxt = p.status === "queue" ? "In line" : p.status === "away" ? "On a break" : inM ? (inM.status === "active" ? "Playing, " : "Holding, ") + L() + " " + inM.station : "Playing";
        return "<tr><td><b>" + esc(p.name) + "</b></td><td>" + esc(p.weapon) + "</td><td>" + esc(stTxt) + '</td><td><div class="bar">' +
          (p.status !== "queue" ? '<button class="btn sm" data-act="s-player" data-a="queue" data-id="' + p.id + '">Back in line</button>' : "") +
          (p.status !== "away" ? '<button class="btn sm ghost" data-act="s-player" data-a="away" data-id="' + p.id + '">Break</button>' : "") +
          '<button class="btn sm danger" data-act="s-player" data-a="remove" data-id="' + p.id + '">Remove</button></div></td></tr>';
      }).join("") : '<tr><td colspan="4" class="muted">No players yet.</td></tr>') + "</tbody></table></div></section>";
    if (O.can("owner")) html += '<section class="panel"><h2>Reset <span class="tag">Owner</span></h2><div class="bar">' +
      '<button class="btn" data-act="s-reset" data-m="results">Clear results, keep players</button><button class="btn danger" data-act="s-reset" data-m="everything">Remove everyone</button></div></section>';
    return html;
  }

  // ---------- render ----------
  function render() {
    var staffOk = O.can("staff");
    if (view.tab === "staff" && !O.unlocked()) { /* show lock screen */ }
    document.querySelectorAll("#tabs button").forEach(function (b) {
      if (b.dataset.tab === "staff") b.hidden = !staffOk && view.tab !== "staff";
      b.setAttribute("aria-pressed", String(b.dataset.tab === view.tab));
    });
    var s = S.settings;
    var sub = $("sub"); if (sub) sub.textContent = "Random teams · winner stays on · best of " + s.best_of;
    if (!O.configured) { main.innerHTML = O.notConfiguredHtml(); return; }
    if (!S.loaded) { main.innerHTML = '<p class="muted">Loading…</p>'; return; }
    main.innerHTML = { play: viewPlay, stations: function () { return viewStations(false); }, standings: viewStandings, staff: viewStaff }[view.tab]() || "";
    var jf = $("joinf");
    if (jf) jf.onsubmit = async function (e) {
      e.preventDefault();
      var nm = jf.elements["name"].value.trim(), wp = jf.elements["weapon"].value.trim();
      if (!nm) return;
      var d = await call("pug_join", { p_name: nm, p_weapon: wp }, "You’re in line!");
      if (d) { me = { id: d.id, token: d.token }; try { localStorage.setItem(ME_KEY, JSON.stringify(me)); } catch (x) {} draw(true); }
    };
    var af = $("addf");
    if (af) af.onsubmit = async function (e) {
      e.preventDefault();
      var el = af.elements, nm = el["name"].value.trim();
      if (!nm) return;
      var d = await call("pug_staff_add", staffArgs({ p_name: nm, p_weapon: el["weapon"].value.trim(), p_status: el["status"].value }), nm + " added.");
      if (d) { view.added = { id: d.id, token: d.token, name: nm }; draw(true); }
    };
    main.querySelectorAll("form.cancelf").forEach(function (f) {
      f.onsubmit = function (e) {
        e.preventDefault();
        if (!confirm("Cancel this? The " + L().toLowerCase() + " is paused so nothing new starts until you press Resume.")) return;
        call("pug_staff_cancel", staffArgs({ p_match: f.dataset.id, p_to: f.elements["to"].value }), "Cancelled. " + L() + " paused.");
      };
    });
    main.querySelectorAll("form.swapf").forEach(function (f) {
      f.onsubmit = function (e) {
        e.preventDefault();
        var el = f.elements;
        call("pug_staff_swap", staffArgs({ p_match: f.dataset.id, p_out: el["out"].value, p_in: el["in"].value || null, p_out_to: el["to"].value }), "Swapped.");
      };
    });
    var sf = $("setf");
    if (sf) sf.onsubmit = function (e) {
      e.preventDefault();
      var el = sf.elements, p = {};
      ["team_size", "best_of", "max_streak"].forEach(function (k) { p[k] = parseInt(el[k].value, 10); });
      ["station_numbers", "station_label", "opens", "closes", "open_date"].forEach(function (k) { p[k] = el[k].value; });
      call("pug_staff_settings", staffArgs({ p: p }), "Settings saved.");
    };
  }
  var draw = O.makeRenderer(render);

  main.addEventListener("click", async function (e) {
    var b = e.target.closest("[data-act]"); if (!b) return;
    var act = b.dataset.act;
    if (act === "unlock") return O.askPin();
    if (act === "copy-link") { try { await navigator.clipboard.writeText(b.dataset.v); O.toast("Link copied"); } catch (x) { prompt("Copy this link:", b.dataset.v); } return; }
    if (act === "pick-w") { view.pick = { id: matchOf(me.id).id, w: b.dataset.w, l: null }; return draw(true); }
    if (act === "pick-s") { view.pick.l = +b.dataset.l; return draw(true); }
    if (act === "report") {
      var pk = view.pick; view.pick = null;
      return call("pug_report", { p_player: me.id, p_token: me.token, p_match: b.dataset.id, p_winner: pk.w, p_w: need(), p_l: pk.l }, "Result saved. GG!");
    }
    if (act === "away") return call("pug_set", { p_player: me.id, p_token: me.token, p_status: "away" }, "Enjoy your break.");
    if (act === "rejoin") return call("pug_set", { p_player: me.id, p_token: me.token, p_status: "queue" }, "You’re back in line.");
    if (act === "break" || act === "sub-out") {
      if (!confirm("Leave your team? The next person in line takes your spot, and you go on a break.")) return;
      return call("pug_set", { p_player: me.id, p_token: me.token, p_status: "away" }, "You’re out. Someone from the line took your spot.");
    }
    if (act === "weapon") {
      var w = prompt("What weapon will you play?", (mine() || {}).weapon || ""); if (w == null) return;
      return call("pug_set", { p_player: me.id, p_token: me.token, p_status: null, p_weapon: w }, "Weapon updated.");
    }
    if (act === "leave") {
      if (!confirm("Leave for good? Your name and stats are removed.")) return;
      var d = await call("pug_leave", { p_player: me.id, p_token: me.token }, "You’ve left. Thanks for playing!");
      if (d) { forget(); draw(true); }
      return;
    }
    // staff
    if (act === "s-result") { var m = S.matches.find(function (x) { return x.id === b.dataset.id; }); if (!confirm("Record " + (b.dataset.w === "a" ? m.a_name : m.b_name) + " winning " + need() + "–" + b.dataset.l + "?")) return;
      return call("pug_staff_result", staffArgs({ p_match: b.dataset.id, p_winner: b.dataset.w, p_w: need(), p_l: +b.dataset.l }), "Result recorded."); }
    if (act === "s-pause") return call("pug_staff_pause", staffArgs({ p_station: +b.dataset.st, p_paused: b.dataset.p === "1" }), b.dataset.p === "1" ? "Paused." : "Resumed.");
    if (act === "s-player") {
      var p = player(b.dataset.id);
      if (b.dataset.a === "remove" && !confirm("Remove " + (p ? p.name : "this player") + "? Their name and stats are deleted.")) return;
      return call("pug_staff_player", staffArgs({ p_player: b.dataset.id, p_action: b.dataset.a }), "Done.");
    }
    if (act === "s-reset") {
      var word = b.dataset.m === "everything" ? "REMOVE" : "CLEAR";
      if (prompt("Type " + word + " to confirm.") !== word) return;
      return call("pug_staff_reset", staffArgs({ p_mode: b.dataset.m }), "Reset done.");
    }
  });

  document.querySelectorAll("#tabs button").forEach(function (b) {
    b.onclick = function () { view.tab = b.dataset.tab; history.replaceState(null, "", "#" + view.tab); draw(true); };
  });
  window.addEventListener("hashchange", function () { var t = location.hash.replace("#", ""); if (t && t !== view.tab && /^(play|stations|standings|staff)$/.test(t)) { view.tab = t; draw(true); } });
  O.onLockChange = function () { draw(true); };

  // ---------- data ----------
  async function load() {
    var r = await Promise.all([
      O.sb.from("pug_settings").select("*").eq("id", 1).maybeSingle(),
      O.sb.from("pug_players").select("id,name,weapon,status,queued_at,games,wins,losses,best_streak"),
      O.sb.from("pug_matches").select("*").order("created_at", { ascending: false }).limit(300)
    ]);
    for (var i = 0; i < r.length; i++) if (r[i].error) throw r[i].error;
    if (r[0].data) { S.settings = r[0].data; if (window.HubScrims) HubScrims.setFromSettings(S.settings); }
    S.players = r[1].data || []; S.matches = r[2].data || []; S.loaded = true;
    if (me && !player(me.id)) forget();                          // removed by staff or reset
    if (view.pick && !live().some(function (m) { return m.id === view.pick.id && m.status === "active"; })) view.pick = null;
    draw();
  }
  var t = null;
  function soon() { clearTimeout(t); t = setTimeout(function () { load().catch(function () {}); }, 250); }
  (async function start() {
    O.bindLock();
    if (!O.configured) { render(); return; }
    try { await load(); }
    catch (e) { main.innerHTML = '<div class="notice"><b>Couldn’t load pickup games.</b> Make sure pickup-setup.sql has been run in the run-of-show Supabase project. (' + esc(e.message || e) + ")</div>"; return; }
    if (O.unlocked()) O.checkSavedPin();
    var ch = O.sb.channel("pug");
    ["pug_settings", "pug_players", "pug_matches"].forEach(function (tb) { ch.on("postgres_changes", { event: "*", schema: "public", table: tb }, soon); });
    ch.subscribe(function (status) { if (status === "SUBSCRIBED") soon(); });
    setInterval(function () { if (!document.hidden) load().catch(function () {}); }, 15000);
    setInterval(function () { draw(); }, 30000);                 // opening time can pass
    document.addEventListener("visibilitychange", function () { if (!document.hidden) soon(); });
    if (window.HubScrims) HubScrims.onChange(function () { draw(); });
  })();
})();
