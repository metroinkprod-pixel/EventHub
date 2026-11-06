// Commentator info: shows the two teams on the mainstage (from start.gg) with their
// caster notes (imported from Google Sheets). Volunteer PIN or higher to view.
(function () {
  var O = window.Ops, esc = O.esc;
  var $ = function (id) { return document.getElementById(id); };
  var main = $("main");
  var teams = [], sets = [], loaded = false, poller = null;
  var params = new URLSearchParams(location.search);
  var view = { tab: params.get("view") || "live", follow: "M", pickA: "", pickB: "", q: "", open: null };
  var imp = null;
  var short = (window.HUB && (HUB.shortName || HUB.eventName)) || "";

  // ---------- helpers ----------
  function norm(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, ""); }
  function findTeam(name) {
    var n = norm(name); if (!n) return null;
    return teams.find(function (t) { return norm(t.name) === n; }) ||
      teams.find(function (t) { var tn = norm(t.name); return tn && (tn.indexOf(n) >= 0 || n.indexOf(tn) >= 0); }) || null;
  }
  function stationLabel(st) { return st === "M" ? "Mainstage" : "Station " + st; }

  // ---------- team card ----------
  function card(name, sideLabel, fallbackPlayers) {
    var t = findTeam(name);
    var html = '<article class="tcard"><div class="head"><div class="side">' + esc(sideLabel) + "</div><h2>" + esc(t ? t.name : name || "TBD") + "</h2></div>";
    if (!t) {
      html += '<div class="missing">No commentator info for this team yet.' +
        (fallbackPlayers && fallbackPlayers.length ? "<br><b>Roster from start.gg:</b> " + fallbackPlayers.map(esc).join(", ") : "") + "</div></article>";
      return html;
    }
    var facts = [];
    if (t.avg_place) facts.push('<div class="fact"><span>Avg. Metro Ink placement</span><b>' + esc(t.avg_place) + "</b></div>");
    if (t.newcomers) facts.push('<div class="fact"><span>Newcomers</span><b>' + esc(t.newcomers) + "</b></div>");
    if (facts.length) html += '<div class="facts">' + facts.join("") + "</div>";
    var ps = (t.players || []).filter(function (p) { return p && (p.name || p.weapon); });
    if (ps.length) {
      html += '<ol class="roster">' + ps.map(function (p, i) {
        var kv = [];
        if (p.weapon) kv.push("<div><span>Weapon</span> " + esc(p.weapon) + "</div>");
        if (p.role) kv.push("<div><span>Role</span> " + esc(p.role) + "</div>");
        return '<li><div class="pn"><span class="num">' + (i + 1) + "</span><b>" + esc(p.name || "?") + "</b>" +
          (p.pronouns ? '<span class="pron">' + esc(p.pronouns) + "</span>" : "") + "</div>" +
          (kv.length ? '<div class="kv">' + kv.join("") + "</div>" : "") + "</li>";
      }).join("") + "</ol>";
    }
    if (t.fun_fact) html += '<div class="fun"><span>Fun fact</span><p>' + esc(t.fun_fact) + "</p></div>";
    return html + "</article>";
  }

  // ---------- On stream ----------
  function viewLive() {
    var live = sets.filter(function (s) { return s.station != null; });
    var opts = '<option value="M"' + (view.follow === "M" ? " selected" : "") + ">Mainstage (on stream)</option>" +
      live.filter(function (s) { return s.station !== "M"; }).map(function (s) {
        return '<option value="' + esc(s.station) + '"' + (String(view.follow) === String(s.station) ? " selected" : "") + ">" + esc(stationLabel(s.station)) + ": " + esc(s.team1.name) + " vs " + esc(s.team2.name) + "</option>";
      }).join("") + '<option value="pick"' + (view.follow === "pick" ? " selected" : "") + ">Pick two teams myself</option>";
    var html = '<section class="panel follow"><label class="f" style="flex:1;min-width:14rem">Showing<select id="follow">' + opts + "</select></label>";
    if (view.follow === "pick") {
      var tOpts = function (cur) { return '<option value="">Choose a team</option>' + teams.map(function (t) { return '<option' + (t.name === cur ? " selected" : "") + ">" + esc(t.name) + "</option>"; }).join(""); };
      html += '<label class="f" style="flex:1;min-width:12rem">Left team<select id="pickA">' + tOpts(view.pickA) + '</select></label>' +
        '<label class="f" style="flex:1;min-width:12rem">Right team<select id="pickB">' + tOpts(view.pickB) + "</select></label>";
    }
    html += "</section>";

    if (view.follow === "pick") {
      html += '<div class="duo">' + card(view.pickA, "Left") + card(view.pickB, "Right") + "</div>";
    } else {
      var s = live.find(function (x) { return String(x.station) === String(view.follow); });
      if (!s) {
        html += '<div class="notice"><b>Nothing on ' + esc(view.follow === "M" ? "the mainstage" : stationLabel(view.follow)) + " right now.</b> " +
          "This updates by itself when start.gg assigns a set to it. Meanwhile, pick teams with “Pick two teams myself”, or browse <b>All teams</b>.</div>";
      } else {
        html += '<section class="panel matchbar"><div><div class="what">' + esc(s.phase) + " · " + esc(s.round) + '</div><div class="small muted">' + esc(stationLabel(s.station)) + "</div></div>" +
          '<div class="score">' + esc(s.team1.score) + " – " + esc(s.team2.score) + "</div></section>";
        html += '<div class="duo">' + card(s.team1.name, "Left · " + s.team1.score + (s.team1.score === 1 ? " game" : " games"), s.team1.players) + card(s.team2.name, "Right · " + s.team2.score + (s.team2.score === 1 ? " game" : " games"), s.team2.players) + "</div>";
      }
    }
    main.innerHTML = html;
    $("follow").onchange = function (e) { view.follow = e.target.value; draw(true); };
    if ($("pickA")) { $("pickA").onchange = function (e) { view.pickA = e.target.value; draw(true); }; $("pickB").onchange = function (e) { view.pickB = e.target.value; draw(true); }; }
  }

  // ---------- All teams ----------
  function viewTeams() {
    var q = norm(view.q);
    var list = teams.filter(function (t) { return !q || norm(t.name + " " + (t.players || []).map(function (p) { return p.name; }).join(" ")).indexOf(q) >= 0; });
    var html = '<section class="panel"><input type="search" class="search" id="tq" placeholder="Search team or player" value="' + esc(view.q) + '" style="width:100%;font-size:1.1rem;padding:12px 14px"></section>';
    if (!teams.length) html += '<div class="notice">No team info yet. ' + (O.can("staff") ? "Use the <b>Import</b> tab to paste it from Google Sheets." : "Ask a staff member to import it.") + "</div>";
    if (view.open) html += '<div class="duo">' + card(view.open, "Team") + '<div><button class="btn" data-act="close">Back to the list</button></div></div>';
    else html += '<section class="panel flush"><ul class="teamlist">' + list.map(function (t) {
      return '<li><button data-act="open" data-name="' + esc(t.name) + '"><b>' + esc(t.name) + '</b><span class="muted small">' + (t.players || []).filter(function (p) { return p && p.name; }).length + " players ›</span></button></li>";
    }).join("") + (list.length ? "" : '<li><p class="empty">No teams match.</p></li>') + "</ul></section>";
    main.innerHTML = html;
    var tq = $("tq");
    tq.oninput = function () { view.q = tq.value; view.open = null; clearTimeout(viewTeams.t); viewTeams.t = setTimeout(function () { draw(true); var el = $("tq"); el.focus(); el.setSelectionRange(el.value.length, el.value.length); }, 200); };
  }

  // ---------- Import (staff) ----------
  var FIELDS = [["", "Ignore"], ["name", "Team name"], ["avg_place", "Avg. placement"], ["newcomers", "Newcomers"], ["fun_fact", "Fun fact"]];
  for (var n = 1; n <= 5; n++) ["name", "weapon", "role", "pronouns"].forEach(function (k) { FIELDS.push(["p" + n + "_" + k, "Player " + n + " " + k]); });
  function guess(table) {
    var first = table[0] || [], map = first.map(function () { return ""; }), hasHeader = false, used = {};
    first.forEach(function (h, i) {
      var f = "", m = /(?:^|\b)(?:p|player)\s*#?\s*([1-5])\b\s*[-:]?\s*(.*)$/i.exec(h);
      if (m) {
        var rest = m[2].toLowerCase();
        f = "p" + m[1] + "_" + (/weapon/.test(rest) ? "weapon" : /role/.test(rest) ? "role" : /pronoun/.test(rest) ? "pronouns" : "name");
      } else if (/avg|average|placement|place/i.test(h)) f = "avg_place";
      else if (/newcomer|new player|first/i.test(h)) f = "newcomers";
      else if (/fun|fact/i.test(h)) f = "fun_fact";
      else if (/^(team|team name|name)$/i.test(h.trim())) f = "name";
      if (f && !used[f]) { map[i] = f; used[f] = true; hasHeader = true; }
    });
    if (!hasHeader) {   // same order as the template: Team, Avg, Newcomers, Fun fact, then P1 name/weapon/role/pronouns ... P5
      var order = ["name", "avg_place", "newcomers", "fun_fact"];
      for (var k = 1; k <= 5; k++) ["name", "weapon", "role", "pronouns"].forEach(function (x) { order.push("p" + k + "_" + x); });
      map = first.map(function (_, i) { return order[i] || ""; });
    }
    return { map: map, hasHeader: hasHeader };
  }
  function rows() {
    if (!imp) return [];
    var body = imp.hasHeader ? imp.table.slice(1) : imp.table;
    return body.map(function (r) {
      var o = { name: "", avg_place: "", newcomers: "", fun_fact: "", players: [] };
      var ps = [{}, {}, {}, {}, {}];
      imp.map.forEach(function (f, i) {
        var v = (r[i] || "").trim(); if (!f || !v) return;
        var m = /^p([1-5])_(\w+)$/.exec(f);
        if (m) ps[+m[1] - 1][m[2]] = v; else o[f] = v;
      });
      o.players = ps.filter(function (p) { return p.name || p.weapon; });
      return o;
    }).filter(function (o) { return o.name; });
  }
  function viewImport() {
    if (!O.can("staff")) { main.innerHTML = O.noAccessHtml("Importing team info needs a staff PIN."); return; }
    var html = '<section class="panel"><h2>Import team info from Google Sheets</h2>' +
      '<p class="small muted">One row per team. Select the rows in your sheet (with the header row), copy, and paste below. Headers like <b>Team Name, Avg Placement, Newcomers, Fun Fact, P1 Name, P1 Weapon, P1 Role, P1 Pronouns, P2 Name…</b> are matched automatically. ' +
      '<a href="/casters/caster-template.csv" style="color:var(--t-accent)">Download a template</a>.</p>' +
      '<textarea id="paste" placeholder="Paste rows here">' + esc(imp ? imp.raw : "") + "</textarea>";
    if (imp && imp.table.length) {
      var sample = imp.table[0], rs = rows();
      html += '<h3 style="margin:14px 0 6px;font-size:1rem">Match the columns</h3><div class="mapgrid">' + imp.map.map(function (f, i) {
        return '<label class="f">' + esc(imp.hasHeader ? (sample[i] || "Column " + (i + 1)) : "Column " + (i + 1) + ": " + (sample[i] || "").slice(0, 16)) +
          '<select data-col="' + i + '">' + FIELDS.map(function (x) { return '<option value="' + x[0] + '"' + (x[0] === f ? " selected" : "") + ">" + x[1] + "</option>"; }).join("") + "</select></label>";
      }).join("") + "</div>" +
        '<label class="small" style="display:flex;gap:6px;align-items:center;margin-top:8px"><input type="checkbox" id="hdr"' + (imp.hasHeader ? " checked" : "") + "> First row is a header</label>" +
        '<p class="small" style="margin:12px 0 6px"><b>' + rs.length + " teams</b> ready. Preview of the first one:</p>" +
        (rs[0] ? '<div class="duo">' + previewCard(rs[0]) + "</div>" : "") +
        '<div class="bar" style="margin-top:12px"><button class="btn primary" data-act="imp-merge">Add / update teams</button>' +
        (O.can("owner") ? '<button class="btn danger" data-act="imp-replace">Replace all team info</button>' : "") + "</div>" +
        '<p class="small muted" style="margin:8px 0 0">“Add / update” replaces the info of teams with the same name and adds new ones.</p>';
    }
    html += "</section>";
    if (teams.length) html += '<section class="panel"><h2>Loaded</h2><p class="small muted">' + teams.length + " teams.</p>" +
      (O.can("owner") ? '<button class="btn danger" data-act="reset">Delete all team info</button>' : "") + "</section>";
    main.innerHTML = html;
    $("paste").oninput = function (e) {
      var raw = e.target.value, table = O.parseTable(raw);
      if (!table.length) { imp = null; return; }
      var g = guess(table); imp = { raw: raw, table: table, map: g.map, hasHeader: g.hasHeader };
      clearTimeout(viewImport.t); viewImport.t = setTimeout(function () { draw(true); }, 400);
    };
    main.querySelectorAll("select[data-col]").forEach(function (s) { s.onchange = function () { imp.map[+s.dataset.col] = s.value; draw(true); }; });
    var h = $("hdr"); if (h) h.onchange = function () { imp.hasHeader = h.checked; draw(true); };
  }
  function previewCard(t) {
    var saved = teams; teams = [t];
    var html = card(t.name, "Preview"); teams = saved; return html;
  }

  // ---------- clicks ----------
  main.addEventListener("click", async function (e) {
    var b = e.target.closest("[data-act]"); if (!b) return;
    var act = b.dataset.act;
    if (act === "unlock") return O.askPin();
    if (act === "open") { view.open = b.dataset.name; draw(true); window.scrollTo(0, 0); return; }
    if (act === "close") { view.open = null; draw(true); return; }
    try {
      if (act === "imp-merge" || act === "imp-replace") {
        var rs = rows(); if (!rs.length) return;
        if (act === "imp-replace" && prompt("This deletes all team info first. Type REPLACE to continue.") !== "REPLACE") return;
        var r = await O.rpc("ops_casters_import", { p_rows: rs, p_mode: act === "imp-replace" ? "replace" : "merge" });
        O.toast(r.added + " added, " + r.updated + " updated"); imp = null; await reload(); draw(true);
      }
      if (act === "reset") {
        if (prompt("Delete all commentator team info? Type DELETE to confirm.") !== "DELETE") return;
        await O.rpc("ops_casters_reset", {}); O.toast("Deleted"); await reload(); draw(true);
      }
    } catch (err) { O.toast(err.message); }
  });

  // ---------- render ----------
  function render() {
    var staff = O.can("staff");
    document.querySelectorAll("#tabs button").forEach(function (b) {
      if (b.dataset.tab === "import") b.hidden = !staff;
      b.setAttribute("aria-pressed", String(b.dataset.tab === view.tab));
    });
    if (!O.configured) { main.innerHTML = O.notConfiguredHtml(); return; }
    if (!O.unlocked()) { main.innerHTML = O.lockedHtml("commentator team info"); return; }
    if (!O.can("volunteer")) { main.innerHTML = O.noAccessHtml("Commentator info needs a volunteer, staff or owner PIN."); return; }
    if (!loaded) { main.innerHTML = '<p class="muted">Loading…</p>'; return; }
    ({ live: viewLive, teams: viewTeams, import: viewImport }[view.tab] || viewLive)();
  }
  var draw = O.makeRenderer(render);
  document.querySelectorAll("#tabs button").forEach(function (b) {
    b.onclick = function () { view.tab = b.dataset.tab; view.open = null; var u = new URL(location.href); u.searchParams.set("view", view.tab); history.replaceState(null, "", u); draw(true); };
  });

  async function reload() {
    var r = await O.rpc("ops_casters_list", {});
    teams = O.merge(teams, r.teams || []);
    loaded = true;
    draw();
  }
  async function loadSets() {
    try {
      var r = await fetch("/api/bracket");
      if (!r.ok) return;
      var data = await r.json();
      if (Array.isArray(data)) { var before = JSON.stringify(sets); sets = data; if (JSON.stringify(sets) !== before && view.tab === "live") draw(); }
    } catch (e) {}
  }
  O.onLockChange = function () {
    if (!O.unlocked()) { teams = []; loaded = false; draw(true); return; }
    if (poller) poller.now().catch(function () {});
    draw(true);
  };

  (function start() {
    if (short) $("title").innerHTML = esc(short) + " commentator info";
    O.bindLock();
    if (!O.configured) { render(); return; }
    // Team info: check for changes now and then (it's private, so no realtime)
    poller = { last: null, now: async function () {
      if (!O.unlocked() || !O.can("volunteer")) return;
      try {
        var v = await O.sb.rpc("ops_casters_version", { p_pin: O.pin });
        if (v.data && v.data.ok && v.data.v !== poller.last) { poller.last = v.data.v; await reload(); }
        else if (v.data && !v.data.ok) { if (v.data.error === "bad_pin") O.lock(); else if (!loaded) { loaded = true; draw(); } }
      } catch (e) {}
    } };
    if (O.unlocked()) O.checkSavedPin().finally(function () { poller.now(); });
    render();
    setInterval(function () { if (!document.hidden) poller.now(); }, 20000);
    loadSets(); setInterval(function () { if (!document.hidden) loadSets(); }, 10000);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) { loadSets(); poller.now(); } });
  })();
})();
