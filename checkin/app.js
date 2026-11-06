// Tournament check-in: teams, players present, Switch 2 tracking, Sheets / start.gg import.
(function () {
  var O = window.Ops, esc = O.esc;
  var teams = [], players = [], attendees = [];
  var view = { tab: new URLSearchParams(location.search).get("view") || "desk", q: "", grp: "", status: "", editing: null,
               dq: "", dkind: "", dst: "", aedit: null };
  var attImport = null, attDefaultKind = "competitor";
  var importState = null, sggPreview = null;
  var $ = function (id) { return document.getElementById(id); };
  var main = $("main");
  var SW = { "": "Not set", bringing: "Bringing a Switch 2", needs: "Needs to borrow", lent: "Borrowing one (sorted)", none: "Not bringing" };

  if (window.HUB && HUB.eventName) $("title").innerHTML = "Check-in<small>" + esc(HUB.eventName + (HUB.eventDate ? " · " + HUB.eventDate : "")) + "</small>";

  function teamPlayers(t) { return players.filter(function (p) { return p.team_id === t.id; }).sort(function (a, b) { return a.sort - b.sort; }); }
  function groups() {
    var s = {}; teams.forEach(function (t) { if (t.grp) s[t.grp] = true; });
    return Object.keys(s).sort(function (a, b) { return a.localeCompare(b, undefined, { numeric: true }); });
  }
  function sortTeams(list) {
    return list.slice().sort(function (a, b) {
      return (a.grp || "~").localeCompare(b.grp || "~", undefined, { numeric: true }) || a.name.localeCompare(b.name);
    });
  }
  function timeAgo(ts) {
    if (!ts) return "";
    var d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }

  // ---------- edits ----------
  async function run(fn, args, okMsg) {
    try { var r = await O.rpc(fn, args); if (okMsg) O.toast(okMsg); return r; }
    catch (err) { O.toast(err.message); await reload(); return null; }
  }
  function checkIn(t) {
    O.guard(async function () {
      var prev = { status: t.status, checked_in_at: t.checked_in_at };
      var tp = teamPlayers(t), wasHere = tp.filter(function (p) { return p.present; }).map(function (p) { return p.id; });
      t.status = "checked_in"; t.checked_in_at = t.checked_in_at || new Date().toISOString();
      tp.forEach(function (p) { p.present = true; });
      draw(true);
      var r = await run("ops_team_checkin", { p_id: t.id, p_status: "checked_in", p_players: null });
      if (r) O.toast(t.name + " checked in", async function () {
        await run("ops_team_checkin", { p_id: t.id, p_status: prev.status === "checked_in" ? "checked_in" : "expected", p_players: null });
        if (wasHere.length && prev.status !== "checked_in") {
          for (var i = 0; i < wasHere.length; i++) await run("ops_player_save", { p_player: { id: wasHere[i], present: true } });
        }
        await reload();
      });
    });
  }
  function setStatus(t, status) {
    O.guard(async function () {
      t.status = status; if (status !== "checked_in") t.checked_in_at = null;
      if (status === "expected") teamPlayers(t).forEach(function (p) { p.present = false; });
      draw(true);
      await run("ops_team_checkin", { p_id: t.id, p_status: status, p_players: null });
    });
  }
  function togglePlayer(p) {
    O.guard(async function () {
      p.present = !p.present; draw(true);
      await run("ops_player_save", { p_player: { id: p.id, present: p.present } });
    });
  }

  // ---------- check-in view ----------
  function teamCard(t) {
    if (view.editing === t.id) return editorHtml(t);
    var tp = teamPlayers(t), here = tp.filter(function (p) { return p.present; }).length;
    var cls = t.status === "checked_in" ? " in" : t.status === "no_show" ? " no" : "";
    var pill = t.status === "checked_in" ? '<span class="pill done">Checked in ' + esc(timeAgo(t.checked_in_at)) + "</span>" :
      t.status === "no_show" ? '<span class="pill late">No-show</span>' : '<span class="pill flag">Not here yet</span>';
    var sub = [t.grp ? '<span class="tag">' + esc(t.grp) + "</span>" : "", t.captain ? "Captain: " + esc(t.captain) : "", t.contact ? esc(t.contact) : "",
      t.paid ? '<span class="tag">Paid</span>' : ""].filter(Boolean).join(" ");
    return '<article class="team' + cls + '" id="t-' + t.id + '">' +
      '<div class="head"><h3>' + esc(t.name) + "</h3>" + pill + "</div>" +
      (sub ? '<div class="sub">' + sub + "</div>" : "") +
      (tp.length ? '<div class="players" aria-label="Players. Tap to mark here.">' + tp.map(function (p) {
        return '<button class="player' + (p.present ? " here" : "") + '" data-act="player" data-id="' + p.id + '" aria-pressed="' + p.present + '">' + esc(p.name) + "</button>";
      }).join("") + '</div><div class="small muted">' + here + " of " + tp.length + " players here</div>" : '<div class="small muted">No players listed.</div>') +
      (t.notes ? '<div class="notes">' + esc(t.notes) + "</div>" : "") +
      '<div class="acts">' +
      (t.status === "checked_in" ? '<button class="btn" data-act="undo" data-id="' + t.id + '">Undo check-in</button>'
        : '<button class="btn good" data-act="checkin" data-id="' + t.id + '">Check in team</button>') +
      (t.status !== "no_show" ? '<button class="btn ghost" data-act="noshow" data-id="' + t.id + '">No-show</button>' : '<button class="btn ghost" data-act="undo" data-id="' + t.id + '">Not a no-show</button>') +
      (O.can("staff") ? '<button class="btn ghost" data-act="edit" data-id="' + t.id + '">Edit</button>' : "") + "</div></article>";
  }

  function editorHtml(t) {
    var tp = teamPlayers(t);
    return '<article class="team editing" id="t-' + t.id + '"><form class="editor" data-id="' + t.id + '">' +
      '<label class="f wide">Team name<input type="text" name="name" required value="' + esc(t.name) + '"></label>' +
      '<label class="f">Group / wave<input type="text" name="grp" list="grps" value="' + esc(t.grp) + '" placeholder="e.g. Wave A"></label>' +
      '<label class="f">Captain<input type="text" name="captain" value="' + esc(t.captain) + '"></label>' +
      '<label class="f">Contact<input type="text" name="contact" value="' + esc(t.contact) + '" placeholder="Discord, phone…"></label>' +
      '<label class="f wide">Notes<input type="text" name="notes" value="' + esc(t.notes) + '"></label>' +
      '<label class="small" style="display:flex;gap:6px;align-items:center"><input type="checkbox" name="paid"' + (t.paid ? " checked" : "") + "> Paid</label>" +
      '<div class="wide"><div class="f" style="margin-bottom:4px">Players</div><div class="plist">' +
      tp.map(function (p) { return '<div class="prow"><input type="text" data-pid="' + p.id + '" value="' + esc(p.name) + '" aria-label="Player name"><button type="button" class="btn sm ghost" data-act="rmplayer" data-id="' + p.id + '" aria-label="Remove ' + esc(p.name) + '">Remove</button></div>'; }).join("") +
      '<div class="prow"><input type="text" name="newplayer" placeholder="Add a player"><button type="button" class="btn sm" data-act="addplayer" data-id="' + t.id + '">Add</button></div></div></div>' +
      '<div class="acts wide" style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary">Save</button><button type="button" class="btn ghost" data-act="cancel">Cancel</button>' +
      (O.can("owner") ? '<button type="button" class="btn danger" data-act="delteam" data-id="' + t.id + '">Delete team</button>' : "") + "</div></form></article>";
  }

  function viewCheckin() {
    var gs = groups();
    if (view.grp && gs.indexOf(view.grp) < 0) view.grp = "";
    var scope = view.grp ? teams.filter(function (t) { return t.grp === view.grp; }) : teams;
    var nIn = scope.filter(function (t) { return t.status === "checked_in"; }).length;
    var nNo = scope.filter(function (t) { return t.status === "no_show"; }).length;
    var html = '<div class="summary">' +
      '<div class="stat' + (scope.length && nIn === scope.length ? " all" : "") + '"><b>' + nIn + " / " + scope.length + "</b><span>teams checked in" + (view.grp ? " · " + esc(view.grp) : "") + "</span></div>" +
      '<div class="stat"><b>' + (scope.length - nIn - nNo) + "</b><span>not here yet</span></div>" +
      (nNo ? '<div class="stat"><b>' + nNo + "</b><span>no-shows</span></div>" : "") +
      gs.filter(function () { return !view.grp; }).map(function (g) {
        var gt = teams.filter(function (t) { return t.grp === g; }), gi = gt.filter(function (t) { return t.status === "checked_in"; }).length;
        return '<div class="stat' + (gi === gt.length ? " all" : "") + '"><b>' + gi + " / " + gt.length + "</b><span>" + esc(g) + "</span></div>";
      }).join("") + "</div>";
    html += '<section class="panel" style="display:grid;gap:10px"><input type="search" class="search" id="q" placeholder="Search team, player or captain" value="' + esc(view.q) + '" autocomplete="off">' +
      '<div class="bar" style="justify-content:space-between"><div class="chips">' +
      '<button class="chip" data-grp="" aria-pressed="' + (!view.grp) + '">All groups</button>' +
      gs.map(function (g) { return '<button class="chip" data-grp="' + esc(g) + '" aria-pressed="' + (view.grp === g) + '">' + esc(g) + "</button>"; }).join("") +
      '</div><div class="chips">' +
      [["", "Everyone"], ["expected", "Not here"], ["checked_in", "Checked in"], ["no_show", "No-shows"]].map(function (s) {
        return '<button class="chip" data-st="' + s[0] + '" aria-pressed="' + (view.status === s[0]) + '">' + s[1] + "</button>";
      }).join("") + "</div></div>" + (O.can("staff") ? '<div class="bar"><button class="btn" data-act="newteam">+ Add walk-up team</button></div>' : "") + "</section>";
    var q = view.q.trim().toLowerCase();
    var list = sortTeams(scope.filter(function (t) {
      if (view.editing === t.id) return true;
      if (view.status && t.status !== view.status) return false;
      if (!q) return true;
      var hay = (t.name + " " + t.captain + " " + t.contact + " " + teamPlayers(t).map(function (p) { return p.name; }).join(" ")).toLowerCase();
      return hay.indexOf(q) >= 0;
    }));
    if (!teams.length) html += '<div class="notice">No teams yet. Go to <b>Import &amp; setup</b> to paste your team list from Google Sheets or pull it from start.gg.</div>';
    else html += list.length ? '<div class="teams">' + list.map(teamCard).join("") + "</div>" : '<p class="muted">No teams match.</p>';
    html += '<datalist id="grps">' + gs.map(function (g) { return '<option value="' + esc(g) + '">'; }).join("") + "</datalist>";
    main.innerHTML = html;
    var qi = $("q");
    qi.oninput = function () { view.q = qi.value; clearTimeout(viewCheckin.t); viewCheckin.t = setTimeout(function () { draw(true); var el = $("q"); el.focus(); el.setSelectionRange(el.value.length, el.value.length); }, 200); };
    main.querySelectorAll("[data-grp]").forEach(function (b) { b.onclick = function () { view.grp = b.dataset.grp; draw(true); }; });
    main.querySelectorAll("[data-st]").forEach(function (b) { b.onclick = function () { view.status = b.dataset.st; draw(true); }; });
    main.querySelectorAll("form.editor").forEach(bindEditor);
  }

  function bindEditor(f) {
    f.onsubmit = async function (e) {
      e.preventDefault();
      var t = teams.find(function (x) { return x.id === f.dataset.id; }); if (!t) return;
      var el = f.elements;
      var fields = { id: t.id, name: el["name"].value.trim(), grp: el["grp"].value.trim(), captain: el["captain"].value.trim(), contact: el["contact"].value.trim(),
                     notes: el["notes"].value.trim(), paid: el["paid"].checked };
      var r = await run("ops_team_save", { p_team: fields });
      if (!r) return;
      var renames = [];
      f.querySelectorAll("[data-pid]").forEach(function (inp) {
        var p = players.find(function (x) { return x.id === inp.dataset.pid; });
        if (p && inp.value.trim() && inp.value.trim() !== p.name) renames.push({ id: p.id, name: inp.value.trim() });
      });
      for (var i = 0; i < renames.length; i++) await run("ops_player_save", { p_player: renames[i] });
      if (el["newplayer"].value.trim()) await run("ops_player_save", { p_player: { team_id: t.id, name: el["newplayer"].value.trim() } });
      view.editing = null;
      await reload();
      O.toast("Saved " + fields.name);
    };
  }

  // ---------- Front desk (attendees) ----------
  var KIND = { competitor: "Competitor", spectator: "Spectator" };
  function timeOf(ts) { return ts ? new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : ""; }
  function attCheck(a, on) {
    O.guard(async function () {
      a.checked_in = on; a.checked_in_at = on ? (a.checked_in_at || new Date().toISOString()) : null; draw(true);
      var r = await run("ops_attendee_checkin", { p_id: a.id, p_in: on });
      if (r && on) O.toast(a.name + " checked in", function () { attCheck(a, false); });
    });
  }
  function swSelect(cur) {
    return '<select name="switch2">' + ["", "bringing", "needs", "lent", "none"].map(function (k) { return '<option value="' + k + '"' + ((cur || "") === k ? " selected" : "") + ">" + SW[k] + "</option>"; }).join("") + "</select>";
  }
  function swBadge(a) {
    return a.switch2 === "needs" ? '<span class="pill late">Needs a Switch 2</span>' : a.switch2 === "bringing" ? '<span class="tag">Bringing a Switch 2</span>' :
      a.switch2 === "lent" ? '<span class="tag">Borrowing (sorted)</span>' : "";
  }
  function personRow(a) {
    if (view.aedit === a.id) {
      var full = O.can("staff");
      return '<li class="editing"><form class="grid2 aeditf" data-id="' + a.id + '">' +
        (full ? '<label class="f">Name<input type="text" name="name" value="' + esc(a.name) + '" required></label>' +
          '<label class="f">Type<select name="kind"><option value="competitor"' + (a.kind === "competitor" ? " selected" : "") + '>Competitor</option><option value="spectator"' + (a.kind === "spectator" ? " selected" : "") + ">Spectator</option></select></label>" +
          '<label class="f">Team<input type="text" name="team" value="' + esc(a.team) + '" list="teamnames"></label>' : "<b style='grid-column:1/-1'>" + esc(a.name) + "</b>") +
        '<label class="f">Switch 2' + swSelect(a.switch2) + "</label>" +
        '<label class="f" style="grid-column:1/-1">Notes<textarea name="notes" rows="3" style="min-height:0;font-family:inherit;font-size:1rem">' + esc(a.notes) + "</textarea></label>" +
        '<div class="bar" style="grid-column:1/-1"><button class="btn primary">Save</button><button type="button" class="btn ghost" data-act="att-cancel">Cancel</button>' +
        (full ? '<button type="button" class="btn danger" data-act="att-del" data-id="' + a.id + '" style="margin-left:auto">Delete</button>' : "") + "</div></form></li>";
    }
    return '<li class="' + (a.checked_in ? "in" : "") + '"><div class="who"><b>' + esc(a.name) + "</b>" +
      '<div class="meta"><span class="pill ' + (a.kind === "spectator" ? "spec" : "comp") + '">' + KIND[a.kind] + "</span>" +
      (a.source === "walkup" ? '<span class="tag">Walk-up</span>' : "") + (a.team ? "<span>" + esc(a.team) + "</span>" : "") + swBadge(a) +
      (a.checked_in ? '<span class="pill done">Checked in ' + esc(timeOf(a.checked_in_at)) + "</span>" : "") + "</div>" +
      (a.notes ? '<div class="small" style="margin-top:4px;white-space:pre-wrap;overflow-wrap:anywhere">' + esc(a.notes) + "</div>" : "") + "</div>" +
      '<div class="acts">' + (a.checked_in ? '<button class="btn sm ghost" data-act="att-undo" data-id="' + a.id + '">Undo</button>'
        : '<button class="btn good" data-act="att-in" data-id="' + a.id + '">Check in</button>') +
      '<button class="btn sm ghost" data-act="att-edit" data-id="' + a.id + '">' + (O.can("staff") ? "Edit" : "Notes") + "</button></div></li>";
  }
  function viewDesk() {
    function count(list) { return list.filter(function (a) { return a.checked_in; }).length + " / " + list.length; }
    var comp = attendees.filter(function (a) { return a.kind === "competitor"; }), spec = attendees.filter(function (a) { return a.kind === "spectator"; });
    var html = '<div class="summary"><div class="stat' + (attendees.length && attendees.every(function (a) { return a.checked_in; }) ? " all" : "") + '"><b>' + count(attendees) + "</b><span>checked in</span></div>" +
      '<div class="stat"><b>' + count(comp) + "</b><span>competitors</span></div>" +
      '<div class="stat"><b>' + count(spec) + "</b><span>spectators</span></div></div>";
    html += '<section class="panel" style="display:grid;gap:10px"><input type="search" class="search" id="dq" placeholder="Search name or team" value="' + esc(view.dq) + '" autocomplete="off">' +
      '<div class="bar" style="justify-content:space-between"><div class="chips">' +
      [["", "Everyone"], ["competitor", "Competitors"], ["spectator", "Spectators"]].map(function (k) { return '<button class="chip" data-dkind="' + k[0] + '" aria-pressed="' + (view.dkind === k[0]) + '">' + k[1] + "</button>"; }).join("") +
      '</div><div class="chips">' + [["", "All"], ["out", "Not here"], ["in", "Checked in"]].map(function (k) { return '<button class="chip" data-dst="' + k[0] + '" aria-pressed="' + (view.dst === k[0]) + '">' + k[1] + "</button>"; }).join("") +
      "</div></div>" +
      '<details><summary class="small"><b>Walk-up?</b> Add someone who isn’t on the list</summary><form class="bar" id="walkf" data-draft style="margin-top:8px">' +
      '<label class="f" style="flex:2;min-width:10rem">Name<input type="text" name="name" required></label>' +
      '<label class="f">Type<select name="kind"><option value="spectator">Spectator</option><option value="competitor">Competitor</option></select></label>' +
      '<label class="f" style="flex:1;min-width:8rem">Team (competitors)<input type="text" name="team" list="teamnames"></label>' +
      '<label class="f">Switch 2' + swSelect("") + "</label>" +
      '<label class="f" style="flex-basis:100%">Notes<textarea name="notes" rows="2" style="min-height:0;font-family:inherit;font-size:1rem" placeholder="Anything worth remembering: paid at the door, came with…, needs a controller…"></textarea></label>' +
      '<button class="btn primary" style="align-self:end">Add &amp; check in</button></form></details></section>';
    var q = view.dq.trim().toLowerCase();
    var list = attendees.filter(function (a) {
      if (view.aedit === a.id) return true;
      if (view.dkind && a.kind !== view.dkind) return false;
      if (view.dst === "in" && !a.checked_in) return false;
      if (view.dst === "out" && a.checked_in) return false;
      return !q || (a.name + " " + a.team + " " + a.notes).toLowerCase().indexOf(q) >= 0;
    }).sort(function (x, y) { return x.name.localeCompare(y.name, undefined, { sensitivity: "base" }); });
    if (!attendees.length) html += '<div class="notice">No attendee list yet. ' + (O.can("staff") ? "Go to <b>Import &amp; setup</b> to paste it from Google Sheets, or add everyone from the team list." : "Ask a staff member to import it, or add walk-ups above.") + "</div>";
    else html += '<section class="panel flush">' + (list.length ? '<ul class="people">' + list.slice(0, 300).map(personRow).join("") + "</ul>" +
      (list.length > 300 ? '<p class="empty">Showing 300 of ' + list.length + ". Search to narrow it down.</p>" : "") : '<p class="empty">Nobody matches.</p>') + "</section>";
    html += '<datalist id="teamnames">' + teams.map(function (t) { return '<option value="' + esc(t.name) + '">'; }).join("") + "</datalist>";
    main.innerHTML = html;
    var qi = $("dq");
    qi.oninput = function () { view.dq = qi.value; clearTimeout(viewDesk.t); viewDesk.t = setTimeout(function () { draw(true); var el = $("dq"); el.focus(); el.setSelectionRange(el.value.length, el.value.length); }, 200); };
    main.querySelectorAll("[data-dkind]").forEach(function (b) { b.onclick = function () { view.dkind = b.dataset.dkind; draw(true); }; });
    main.querySelectorAll("[data-dst]").forEach(function (b) { b.onclick = function () { view.dst = b.dataset.dst; draw(true); }; });
    var wf = $("walkf");
    wf.onsubmit = function (e) {
      e.preventDefault();
      var el = wf.elements, nm = el["name"].value.trim(); if (!nm) return;
      O.guard(async function () {
        var r = await run("ops_attendee_save", { p: { name: nm, kind: el["kind"].value, team: el["team"].value.trim(), notes: el["notes"].value.trim(),
          switch2: el["switch2"].value, source: "walkup", checked_in: true } }, nm + " added and checked in");
        if (r) { attendees.push(r.attendee); var cur = $("walkf"); if (cur) cur.reset(); draw(true); }
      });
    };
    main.querySelectorAll("form.aeditf").forEach(function (f) {
      f.onsubmit = async function (e) {
        e.preventDefault();
        var el = f.elements, body = { id: f.dataset.id, notes: el["notes"].value.trim(), switch2: el["switch2"].value };
        if (el["name"]) { body.name = el["name"].value.trim(); body.kind = el["kind"].value; body.team = el["team"].value.trim(); }
        var r = await run("ops_attendee_save", { p: body }, "Saved");
        if (r) { view.aedit = null; await reload(); }
      };
    });
  }

  // Attendee list import (Import & setup)
  var AFIELDS = [["", "Ignore"], ["name", "Name"], ["kind", "Type"], ["team", "Team"], ["switch2", "Switch 2"], ["contact", "Contact"], ["notes", "Notes"]];
  function attGuess(table) {
    var first = table[0] || [], map = first.map(function () { return ""; }), hasHeader = false;
    var tests = [["name", /^(name|full name|attendee|player|gamer ?tag|tag|ign)$/i], ["kind", /type|ticket|role|kind|registration|category/i],
                 ["team", /team/i], ["switch2", /switch|console/i], ["contact", /contact|email|discord|phone/i], ["notes", /note|comment/i]];
    first.forEach(function (h, i) { for (var k = 0; k < tests.length; k++) { if (map.indexOf(tests[k][0]) < 0 && tests[k][1].test(h)) { map[i] = tests[k][0]; hasHeader = true; break; } } });
    if (!hasHeader) map[0] = "name";
    return { map: map, hasHeader: hasHeader };
  }
  function normKind(v) {
    v = String(v || "").toLowerCase();
    if (/spect|guest|visit|viewer|watch|audience|general admission|\bga\b/.test(v)) return "spectator";
    if (/comp|player|entrant|team|venue fee|tournament|registrant/.test(v)) return "competitor";
    return "";
  }
  function attRows() {
    if (!attImport) return [];
    var body = attImport.hasHeader ? attImport.table.slice(1) : attImport.table;
    return body.map(function (r) {
      var o = { name: "", kind: "", team: "", contact: "", notes: "", switch2: "" };
      attImport.map.forEach(function (f, i) { var v = (r[i] || "").trim(); if (f && v) o[f] = f === "kind" ? normKind(v) : f === "switch2" ? normSwitch(v) : (o[f] ? o[f] + " " + v : v); });
      if (!o.kind) o.kind = attDefaultKind;
      return o;
    }).filter(function (o) { return o.name; });
  }
  function attSetupHtml() {
    var html = '<section class="panel"><h2>Attendee list (front desk)</h2><p class="small muted">Paste everyone coming, from Google Sheets (with the header row). A <b>Type</b> column with words like “spectator” or “competitor” sorts people automatically.</p>' +
      '<textarea id="apaste" placeholder="Paste the attendee list here">' + esc(attImport ? attImport.raw : "") + "</textarea>";
    if (attImport && attImport.table.length) {
      var sample = attImport.table[0], rows = attRows();
      html += '<h3 style="margin:14px 0 6px;font-size:1rem">Match the columns</h3><div class="mapgrid">' + attImport.map.map(function (f, i) {
        return '<label class="f">' + esc(attImport.hasHeader ? (sample[i] || "Column " + (i + 1)) : "Column " + (i + 1) + ": " + (sample[i] || "").slice(0, 18)) +
          '<select data-acol="' + i + '">' + AFIELDS.map(function (x) { return '<option value="' + x[0] + '"' + (x[0] === f ? " selected" : "") + ">" + x[1] + "</option>"; }).join("") + "</select></label>";
      }).join("") + "</div>" +
        '<div class="bar" style="margin-top:8px"><label class="small" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="ahdr"' + (attImport.hasHeader ? " checked" : "") + "> First row is a header</label>" +
        '<label class="small">People without a type are <select id="akind"><option value="competitor"' + (attDefaultKind === "competitor" ? " selected" : "") + '>Competitors</option><option value="spectator"' + (attDefaultKind === "spectator" ? " selected" : "") + ">Spectators</option></select></label></div>" +
        '<p class="small" style="margin:12px 0 6px"><b>' + rows.length + " people</b>: " + rows.filter(function (r) { return r.kind === "competitor"; }).length + " competitors, " +
        rows.filter(function (r) { return r.kind === "spectator"; }).length + " spectators.</p>" +
        '<div class="tablewrap"><table class="prevtable"><thead><tr><th>Name</th><th>Type</th><th>Team</th><th>Notes</th></tr></thead><tbody>' +
        rows.slice(0, 8).map(function (r) { return "<tr><td>" + esc(r.name) + "</td><td>" + KIND[r.kind] + "</td><td>" + esc(r.team) + "</td><td>" + esc(r.notes) + "</td></tr>"; }).join("") + "</tbody></table></div>" +
        '<div class="bar" style="margin-top:12px"><button class="btn primary" data-act="att-imp-merge">Add / update people</button>' +
        (O.can("owner") ? '<button class="btn danger" data-act="att-imp-replace">Replace the whole list</button>' : "") + "</div>";
    }
    html += '<div class="bar" style="margin-top:12px;border-top:1px solid var(--line);padding-top:12px"><button class="btn" data-act="att-from-teams">Add all team players as competitors</button>' +
      '<span class="small muted">Uses the team list below; skips anyone already listed.</span></div></section>';
    return html;
  }

  // ---------- Switch 2 view ----------
  function viewSwitch() {
    var pool = attendees.filter(function (a) { return view.swAll || a.kind === "competitor"; })
      .sort(function (x, y) { return x.name.localeCompare(y.name, undefined, { sensitivity: "base" }); });
    function by(k) { return pool.filter(function (a) { return (a.switch2 || "") === k; }); }
    function rows(list, acts) {
      if (!list.length) return '<p class="empty">None.</p>';
      return '<ul class="people">' + list.map(function (a) {
        return '<li><div class="who"><b>' + esc(a.name) + '</b><div class="meta"><span class="pill ' + (a.kind === "spectator" ? "spec" : "comp") + '">' + KIND[a.kind] + "</span>" +
          (a.team ? "<span>" + esc(a.team) + "</span>" : "") + (a.checked_in ? '<span class="pill done">Here</span>' : '<span class="pill flag">Not here yet</span>') + "</div>" +
          (a.notes ? '<div class="small" style="margin-top:4px;white-space:pre-wrap">' + esc(a.notes) + "</div>" : "") + "</div>" +
          '<div class="acts">' + acts.map(function (x) { return '<button class="btn sm' + (x[2] ? " " + x[2] : "") + '" data-act="asw-' + x[0] + '" data-id="' + a.id + '">' + x[1] + "</button>"; }).join("") + "</div></li>";
      }).join("") + "</ul>";
    }
    main.innerHTML =
      '<div class="notice">Some people may not have filled out the form and will ask to borrow a Switch 2. Hold off, but note it here (mark them “Needs one”).</div>' +
      '<div class="chips"><button class="chip" data-swall="0" aria-pressed="' + !view.swAll + '">Competitors</button><button class="chip" data-swall="1" aria-pressed="' + !!view.swAll + '">Everyone</button></div>' +
      '<section class="panel flush"><header><h2>Needs to borrow (' + by("needs").length + ")</h2></header>" + rows(by("needs"), [["lent", "Sorted", "good"], ["none", "Not needed"]]) + "</section>" +
      '<section class="panel flush"><header><h2>Bringing a Switch 2 (' + by("bringing").length + ")</h2></header>" + rows(by("bringing"), [["needs", "Actually needs one"]]) + "</section>" +
      '<section class="panel flush"><header><h2>Borrowing, sorted (' + by("lent").length + ")</h2></header>" + rows(by("lent"), [["needs", "Not sorted"]]) + "</section>" +
      '<section class="panel flush"><header><h2>Not set (' + by("").length + ")</h2></header>" + rows(by(""), [["bringing", "Bringing"], ["needs", "Needs one"]]) + "</section>";
    main.querySelectorAll("[data-swall]").forEach(function (b) { b.onclick = function () { view.swAll = b.dataset.swall === "1"; draw(true); }; });
  }

  // ---------- import + setup ----------
  var FIELDS = [["", "Ignore"], ["name", "Team name"], ["grp", "Group / wave"], ["captain", "Captain"], ["contact", "Contact"],
                ["players", "Player(s)"], ["paid", "Paid"], ["notes", "Notes"]];
  function guessMap(table) {
    var first = table[0] || [], map = first.map(function () { return ""; }), hasHeader = false;
    var tests = [["name", /^(team|team name|name|entrant)$/i], ["grp", /group|wave|pool|bracket|division/i], ["captain", /captain|cap\b/i],
                 ["contact", /contact|discord|phone|email|handle/i], ["players", /player|member|roster|ign|gamertag|tag/i],
                 ["paid", /paid|payment|fee/i], ["notes", /note|comment/i]];
    first.forEach(function (h, i) {
      for (var k = 0; k < tests.length; k++) {
        var f = tests[k][0];
        if ((f === "players" || map.indexOf(f) < 0) && tests[k][1].test(h)) { map[i] = f; hasHeader = true; break; }
      }
    });
    if (!hasHeader) { map[0] = "name"; for (var i = 1; i < first.length; i++) map[i] = "players"; }
    return { map: map, hasHeader: hasHeader };
  }
  function normSwitch(v) {
    v = String(v || "").toLowerCase().trim();
    if (!v) return "";
    if (/need|borrow|lend|no console/.test(v)) return "needs";
    if (/^(y|yes|true|x|✓|✔|bringing|bring|have|1)\b/.test(v)) return "bringing";
    if (/^(n|no|false|0|none)\b/.test(v)) return "none";
    return "";
  }
  function importTeams() {
    if (!importState) return [];
    var body = importState.hasHeader ? importState.table.slice(1) : importState.table;
    var byName = {};
    body.forEach(function (r) {
      var o = { name: "", grp: "", captain: "", contact: "", players: [], switch2: "", paid: false, notes: "" };
      importState.map.forEach(function (f, i) {
        var v = (r[i] || "").trim(); if (!f || !v) return;
        if (f === "players") o.players = o.players.concat(v.split(/[,;\n]+/).map(function (s) { return s.trim(); }).filter(Boolean));
        else if (f === "switch2") o.switch2 = normSwitch(v);
        else if (f === "paid") o.paid = /^(y|yes|true|x|✓|✔|paid|1)/i.test(v);
        else o[f] = o[f] ? o[f] + " " + v : v;
      });
      if (!o.name) return;
      var key = o.name.toLowerCase();
      if (byName[key]) { byName[key].players = byName[key].players.concat(o.players); }   // one row per player is fine too
      else byName[key] = o;
    });
    return Object.keys(byName).map(function (k) { return byName[k]; });
  }
  function previewTable(list) {
    return '<div class="tablewrap"><table class="prevtable"><thead><tr><th>Team</th><th>Group</th><th>Players</th></tr></thead><tbody>' +
      list.slice(0, 8).map(function (t) { return "<tr><td>" + esc(t.name) + "</td><td>" + esc(t.grp || "") + "</td><td>" + esc((t.players || []).join(", ")) + "</td></tr>"; }).join("") +
      "</tbody></table></div>" + (list.length > 8 ? '<p class="small muted">…and ' + (list.length - 8) + " more.</p>" : "");
  }
  function viewSetup() {
    var html = "";
    if (!O.unlocked()) html += '<div class="notice">Enter the staff PIN to import or reset. <button class="btn sm" data-act="unlock">Enter PIN</button></div>';
    html += attSetupHtml();
    html += '<section class="panel"><h2>Team list (T.O. check-in)</h2><p class="small muted">Select your team list in Sheets (with the header row), copy, and paste below. Players can be in separate columns, in one column separated by commas, or one player per row with the team name repeated.</p>' +
      '<textarea id="paste" placeholder="Paste rows here">' + esc(importState ? importState.raw : "") + "</textarea>";
    if (importState && importState.table.length) {
      var sample = importState.table[0];
      html += '<h3 style="margin:14px 0 6px;font-size:1rem">Match the columns</h3><div class="mapgrid">' + importState.map.map(function (f, i) {
        return '<label class="f">' + esc(importState.hasHeader ? (sample[i] || "Column " + (i + 1)) : "Column " + (i + 1) + ": " + (sample[i] || "").slice(0, 18)) +
          '<select data-col="' + i + '">' + FIELDS.map(function (x) { return '<option value="' + x[0] + '"' + (x[0] === f ? " selected" : "") + ">" + x[1] + "</option>"; }).join("") + "</select></label>";
      }).join("") + "</div>" +
        '<label class="small" style="display:flex;gap:6px;align-items:center;margin-top:8px"><input type="checkbox" id="hdr"' + (importState.hasHeader ? " checked" : "") + "> First row is a header</label>";
      var list = importTeams();
      html += '<p class="small" style="margin:12px 0 6px"><b>' + list.length + " teams</b> found.</p>" + previewTable(list) +
        '<div class="bar" style="margin-top:12px"><button class="btn primary" data-act="imp-merge">Add / update teams</button>' + (O.can("owner") ? '<button class="btn danger" data-act="imp-replace">Replace all teams</button>' : "") + "</div>" +
        '<p class="small muted" style="margin:8px 0 0">“Add / update” matches teams by name, fills in missing details and players, and keeps check-ins. “Replace” deletes every team first.</p>';
    }
    html += "</section>";
    html += '<section class="panel"><h2>Import from start.gg</h2><p class="small muted">Pulls teams and players from the event set in the hub’s start.gg settings (the same one the station board uses).</p>' +
      '<div class="bar"><button class="btn" data-act="sgg-fetch">Fetch teams from start.gg</button></div>' +
      (sggPreview ? '<p class="small" style="margin:12px 0 6px"><b>' + sggPreview.length + " teams</b> on start.gg.</p>" + previewTable(sggPreview) +
        '<div class="bar" style="margin-top:12px"><button class="btn primary" data-act="sgg-merge">Add / update teams</button></div>' : "") + "</section>";
    html += '<section class="panel"><h2>Export</h2><p class="small muted">Download check-in status as a CSV.</p><button class="btn" data-act="export">Download CSV</button></section>';
    html += '<section class="panel"><h2>Export</h2><p class="small muted">Front desk check-ins as a CSV.</p><button class="btn" data-act="att-export">Download attendee CSV</button></section>';
    if (O.can("owner")) html += '<section class="panel"><h2>Reset <span class="tag">Owner</span></h2>' +
      '<p class="small muted" style="margin:0 0 6px">Front desk</p><div class="bar"><button class="btn" data-act="att-reset-statuses">Clear front desk check-ins</button><button class="btn danger" data-act="att-reset-all">Delete the attendee list</button></div>' +
      '<p class="small muted" style="margin:12px 0 6px">Teams</p><div class="bar"><button class="btn" data-act="reset-statuses">Clear team check-ins</button><button class="btn danger" data-act="reset-all">Delete all teams</button></div></section>';
    main.innerHTML = html;
    $("paste").oninput = function (e) {
      var raw = e.target.value, table = O.parseTable(raw);
      if (!table.length) { importState = null; return; }
      var g = guessMap(table);
      importState = { raw: raw, table: table, map: g.map, hasHeader: g.hasHeader };
      clearTimeout(viewSetup.t); viewSetup.t = setTimeout(function () { draw(true); }, 400);
    };
    main.querySelectorAll("select[data-col]").forEach(function (s) { s.onchange = function () { importState.map[+s.dataset.col] = s.value; draw(true); }; });
    var hdr = $("hdr"); if (hdr) hdr.onchange = function () { importState.hasHeader = hdr.checked; draw(true); };
    $("apaste").oninput = function (e) {
      var raw = e.target.value, table = O.parseTable(raw);
      if (!table.length) { attImport = null; return; }
      var g = attGuess(table);
      attImport = { raw: raw, table: table, map: g.map, hasHeader: g.hasHeader };
      clearTimeout(viewSetup.ta); viewSetup.ta = setTimeout(function () { draw(true); }, 400);
    };
    main.querySelectorAll("select[data-acol]").forEach(function (s) { s.onchange = function () { attImport.map[+s.dataset.acol] = s.value; draw(true); }; });
    var ah = $("ahdr"); if (ah) ah.onchange = function () { attImport.hasHeader = ah.checked; draw(true); };
    var ak = $("akind"); if (ak) ak.onchange = function () { attDefaultKind = ak.value; draw(true); };
  }

  async function doImport(list, mode, source) {
    if (!list.length) return;
    if (mode === "replace" && prompt("This deletes all " + teams.length + " teams and their check-ins first. Type REPLACE to continue.") !== "REPLACE") return;
    var r = await run("ops_teams_import", { p_teams: list, p_mode: mode, p_source: source });
    if (r) { O.toast(r.added + " added, " + r.updated + " updated"); importState = null; sggPreview = null; await reload(); }
  }
  async function fetchStartgg() {
    try {
      var res = await fetch("/api/roster");
      var data = await res.json();
      if (!res.ok) throw new Error(data.error || "start.gg didn’t respond");
      sggPreview = data.teams.map(function (t) { return { name: t.name, players: t.players }; });
      draw(true);
    } catch (err) { O.toast("Couldn’t fetch from start.gg: " + err.message); }
  }
  function exportCsv() {
    var lines = [["Team", "Group", "Status", "Checked in at", "Players here", "Players", "Captain", "Contact", "Paid", "Notes"]];
    sortTeams(teams).forEach(function (t) {
      var tp = teamPlayers(t);
      lines.push([t.name, t.grp, t.status, t.checked_in_at ? new Date(t.checked_in_at).toLocaleTimeString() : "",
        tp.filter(function (p) { return p.present; }).length + "/" + tp.length, tp.map(function (p) { return p.name + (p.present ? " ✓" : ""); }).join(", "),
        t.captain, t.contact, t.paid ? "yes" : "", t.notes]);
    });
    var csv = lines.map(function (l) { return l.map(function (c) { c = String(c == null ? "" : c); return /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(","); }).join("\n");
    var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = "check-in.csv"; a.click();
  }

  // ---------- clicks ----------
  main.addEventListener("click", function (e) {
    var b = e.target.closest("[data-act]"); if (!b) return;
    var act = b.dataset.act, id = b.dataset.id;
    var t = id && teams.find(function (x) { return x.id === id; });
    var a = id && attendees.find(function (x) { return x.id === id; });
    if (act === "att-in") attCheck(a, true);
    else if (act === "att-undo") attCheck(a, false);
    else if (act === "att-edit") O.guard(function () { view.aedit = a.id; draw(true); });
    else if (act === "asw-lent" || act === "asw-bringing" || act === "asw-needs" || act === "asw-none") O.guard(async function () {
      a.switch2 = act.slice(4); draw(true); await run("ops_attendee_save", { p: { id: a.id, switch2: a.switch2 } });
    });
    else if (act === "att-cancel") { view.aedit = null; draw(true); }
    else if (act === "att-del") O.guard(async function () {
      if (!confirm("Delete " + a.name + " from the attendee list?")) return;
      view.aedit = null; await run("ops_attendee_delete", { p_id: a.id }, "Deleted"); await reload();
    });
    else if (act === "att-imp-merge" || act === "att-imp-replace") O.guard(async function () {
      var rows = attRows(); if (!rows.length) return;
      var mode = act === "att-imp-replace" ? "replace" : "merge";
      if (mode === "replace" && prompt("This deletes the current attendee list and its check-ins. Type REPLACE to continue.") !== "REPLACE") return;
      var r = await run("ops_attendees_import", { p_rows: rows, p_mode: mode, p_source: "sheet" });
      if (r) { O.toast(r.added + " added, " + r.updated + " updated"); attImport = null; await reload(); }
    });
    else if (act === "att-from-teams") O.guard(async function () {
      var r = await run("ops_attendees_from_teams", {});
      if (r) { O.toast(r.added + " competitors added from the team list"); await reload(); }
    });
    else if (act === "att-reset-statuses") O.guard(async function () {
      if (!confirm("Clear every front desk check-in?")) return;
      await run("ops_attendees_reset", { p_mode: "statuses" }, "Front desk check-ins cleared"); await reload();
    });
    else if (act === "att-reset-all") O.guard(async function () {
      if (prompt("This deletes the whole attendee list. Type DELETE to confirm.") !== "DELETE") return;
      await run("ops_attendees_reset", { p_mode: "everything" }, "Attendee list deleted"); await reload();
    });
    else if (act === "att-export") {
      var lines = [["Name", "Type", "Team", "Checked in", "Time", "Switch 2", "Walk-up", "Contact", "Notes"]].concat(attendees.slice().sort(function (x, y) { return x.name.localeCompare(y.name); }).map(function (p) {
        return [p.name, KIND[p.kind], p.team, p.checked_in ? "yes" : "", p.checked_in_at ? new Date(p.checked_in_at).toLocaleTimeString() : "", SW[p.switch2 || ""], p.source === "walkup" ? "yes" : "", p.contact, p.notes];
      }));
      var csv = lines.map(function (l) { return l.map(function (c) { c = String(c == null ? "" : c); return /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(","); }).join("\n");
      var dl = document.createElement("a"); dl.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); dl.download = "attendees.csv"; dl.click();
    }
    else if (act === "checkin") checkIn(t);
    else if (act === "undo") setStatus(t, "expected");
    else if (act === "noshow") setStatus(t, "no_show");
    else if (act === "player") { var p = players.find(function (x) { return x.id === id; }); if (p) togglePlayer(p); }
    else if (act === "edit") O.guard(function () { view.editing = t.id; draw(true); });
    else if (act === "cancel") { view.editing = null; draw(true); }
    else if (act === "newteam") O.guard(async function () {
      var name = prompt("Team name"); if (!name || !name.trim()) return;
      var r = await run("ops_team_save", { p_team: { name: name.trim(), notes: "Walk-up" } });
      if (r) { teams.push(r.team); view.editing = r.team.id; view.q = ""; draw(true); }
    });
    else if (act === "delteam") O.guard(async function () {
      if (!confirm("Delete " + t.name + " and its players?")) return;
      view.editing = null; await run("ops_team_delete", { p_id: t.id }, "Deleted " + t.name); await reload();
    });
    else if (act === "rmplayer") O.guard(async function () {
      await run("ops_player_delete", { p_id: id }); players = players.filter(function (x) { return x.id !== id; }); draw(true);
    });
    else if (act === "addplayer") O.guard(async function () {
      var inp = b.closest(".prow").querySelector("input"), name = inp.value.trim(); if (!name) return;
      var r = await run("ops_player_save", { p_player: { team_id: id, name: name } });
      if (r) { players.push(r.player); inp.value = ""; draw(true); }
    });
    else if (act === "unlock") O.askPin();
    else if (act === "imp-merge") O.guard(function () { doImport(importTeams(), "merge", "sheet"); });
    else if (act === "imp-replace") O.guard(function () { doImport(importTeams(), "replace", "sheet"); });
    else if (act === "sgg-fetch") fetchStartgg();
    else if (act === "sgg-merge") O.guard(function () { doImport(sggPreview || [], "merge", "startgg"); });
    else if (act === "export") exportCsv();
    else if (act === "reset-statuses") O.guard(async function () {
      if (!confirm("Clear every team’s check-in?")) return;
      await run("ops_checkin_reset", { p_mode: "statuses" }, "Check-ins cleared"); await reload();
    });
    else if (act === "reset-all") O.guard(async function () {
      if (prompt("This deletes every team and player. Type DELETE to confirm.") !== "DELETE") return;
      await run("ops_checkin_reset", { p_mode: "everything" }, "All teams deleted"); await reload();
    });
  });

  // ---------- render ----------
  function render() {
    var staff = O.can("staff");
    var tab = !staff && view.tab === "setup" ? "desk" : view.tab;   // volunteers: front desk, teams and Switch 2s
    document.querySelectorAll("#tabs button").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.dataset.tab === tab));
      b.hidden = O.unlocked() && !staff && b.dataset.tab === "setup";
    });
    if (!O.configured) { main.innerHTML = O.notConfiguredHtml(); return; }
    if (!O.unlocked()) { main.innerHTML = O.lockedHtml("check-in"); return; }
    if (!loaded || !O.roleKnown()) { main.innerHTML = '<p class="muted">Loading…</p>'; return; }
    ({ desk: viewDesk, checkin: viewCheckin, switch: viewSwitch, setup: viewSetup }[tab] || viewDesk)();
  }
  var draw = O.makeRenderer(render, function () { return !!view.editing || !!view.aedit; });
  document.querySelectorAll("#tabs button").forEach(function (b) {
    b.onclick = function () {
      view.tab = b.dataset.tab; view.editing = null;
      var u = new URL(location.href); u.searchParams.set("view", view.tab); history.replaceState(null, "", u);
      draw(true); window.scrollTo(0, 0);
    };
  });
  var loaded = false, poller = null;
  async function reload() {
    if (!O.roleKnown()) await O.checkSavedPin();
    var res = await O.rpc("ops_checkin_list", {});
    teams = O.merge(teams, res.teams); players = O.merge(players, res.players); attendees = O.merge(attendees, res.attendees || []);
    loaded = true;
    draw();
  }
  O.onLockChange = function () {
    if (!O.unlocked()) { teams = []; players = []; attendees = []; loaded = false; view.editing = null; sggPreview = null; if (poller) poller.reset(); O.setConn(false, "Locked"); draw(true); return; }
    if (!loaded && poller) poller.now().catch(function () {});
    draw(true);
  };
  (async function start() {
    O.bindLock();
    if (!O.configured) { render(); O.setConn(false, "Not set up"); return; }
    poller = O.poll("checkin", function () {
      return reload().catch(function (err) {
        if (!loaded) main.innerHTML = '<div class="notice"><b>Couldn’t load check-in.</b> Check the Supabase details in site-config.js and that ops-setup.sql ran. (' + esc(err.message) + ")</div>";
      });
    });
    if (O.unlocked()) { O.checkSavedPin().finally(function () { poller.now(); }); } else { O.setConn(false, "Locked"); render(); }
  })();
})();
