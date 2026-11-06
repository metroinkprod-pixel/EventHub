// Run of show: live overview, timeline, personal shifts, and Sheets import.
(function () {
  var O = window.Ops, esc = O.esc, fmt = O.fmt;
  var rows = [];
  var params = new URLSearchParams(location.search);
  var view = {
    tab: params.get("view") || (params.get("me") ? "mine" : "now"),
    person: "", category: "", hideDone: false, needsOwner: false, q: "",
    editing: null, preview: null
  };
  var me = params.get("me") || "";
  if (!me) { try { me = localStorage.getItem("ros-me") || ""; } catch (e) {} }
  var importState = null;
  var $ = function (id) { return document.getElementById(id); };
  var main = $("main");

  if (window.HUB && HUB.eventName) { $("title").innerHTML = "Run of show<small>" + esc(HUB.eventName + (HUB.eventDate ? " · " + HUB.eventDate : "")) + "</small>"; }

  // ---------- derived state ----------
  function now() { return view.preview != null ? view.preview : O.nowMin(); }
  function endOf(r) { return r.end_min != null ? r.end_min : (r.start_min != null ? r.start_min + 15 : null); }
  function finished(r) { return r.status === "done" || r.status === "skipped"; }
  function isLive(r, n) {
    if (finished(r)) return false;
    if (r.status === "live") return true;
    return r.section === "day" && r.start_min != null && r.start_min <= n && n < endOf(r);
  }
  function isLate(r, n) { return !finished(r) && r.section === "day" && r.start_min != null && endOf(r) <= n; }
  function byTime(a, b) {
    var sa = { before: 0, day: 1, after: 2 }[a.section], sb = { before: 0, day: 1, after: 2 }[b.section];
    if (sa !== sb) return sa - sb;
    var ma = a.start_min, mb = b.start_min;
    if (ma == null && mb == null) return a.sort - b.sort;
    if (ma == null) return 1; if (mb == null) return -1;
    return ma - mb || (endOf(a) - endOf(b)) || a.sort - b.sort;
  }
  var ownerList = [];   // volunteers only get owner names, not the whole run of show
  function allPeople() {
    var s = {};
    (O.can("staff") ? rows.map(function (r) { return r.owner; }) : ownerList).forEach(function (o) { O.people(o).forEach(function (p) { s[p.name] = true; }); });
    return Object.keys(s).sort(function (a, b) { return a.localeCompare(b); });
  }
  function categories() {
    var s = {};
    rows.forEach(function (r) { if (r.category) s[r.category] = true; });
    return Object.keys(s).sort();
  }
  function hasPerson(r, name) {
    var n = name.toLowerCase();
    return O.people(r.owner).some(function (p) { return p.name.toLowerCase() === n; });
  }
  function roleFor(r, name) {
    var n = name.toLowerCase(), hit = O.people(r.owner).find(function (p) { return p.name.toLowerCase() === n; });
    return hit && hit.role;
  }
  function timeRange(r) {
    if (r.start_min == null) return r.section === "after" ? "After" : "Before";
    return fmt(r.start_min) + (r.end_min != null ? "–" + fmt(r.end_min) : "");
  }
  function statusPill(r, n) {
    if (r.status === "done") return '<span class="pill done">Done</span>';
    if (r.status === "skipped") return '<span class="pill skip">Skipped</span>';
    if (isLive(r, n)) return '<span class="pill live">Now</span>';
    if (isLate(r, n)) return '<span class="pill late">Not marked done</span>';
    return "";
  }
  function ownerHtml(r) {
    var needs = O.needsOwner(r.owner);
    return '<span class="owner-txt' + (needs ? " needs" : "") + '">' + esc(r.owner || "No owner") + "</span>";
  }

  // ---------- edits ----------
  async function save(r, fields) {
    var before = Object.assign({}, r);
    Object.assign(r, fields); draw(true);
    try {
      var res = await O.rpc("ops_ros_save", { p_row: Object.assign({ id: r.id }, fields) });
      Object.assign(r, res.row);
    } catch (err) { Object.assign(r, before); O.toast(err.message); }
    draw(true);
  }
  function setStatus(r, status) {
    O.guard(async function () {
      var before = r.status;
      r.status = status; draw(true);
      try {
        var res = await O.rpc("ops_ros_mark", { p_id: r.id, p_status: status, p_name: me || "" });
        Object.assign(r, res.row);
      } catch (err) { r.status = before; O.toast(err.message); }
      draw(true);
    });
  }
  async function addRow(fields) {
    try {
      var res = await O.rpc("ops_ros_save", { p_row: fields });
      if (!rows.some(function (x) { return x.id === res.row.id; })) rows.push(res.row);
      draw(true);
      return res.row;
    } catch (err) { O.toast(err.message); return null; }
  }
  async function del(r) {
    rows = rows.filter(function (x) { return x.id !== r.id; }); draw(true);
    try {
      await O.rpc("ops_ros_delete", { p_id: r.id });
      O.toast("Deleted “" + r.task + "”", function () {
        addRow({ id: r.id, section: r.section, start_min: r.start_min, end_min: r.end_min, category: r.category, task: r.task,
                 owner: r.owner, notes: r.notes, status: r.status, added: r.added, sort: r.sort });
      });
    } catch (err) { rows.push(r); O.toast(err.message); draw(true); }
  }

  // ---------- views ----------
  function blockCard(r, n, opts) {
    opts = opts || {};
    var cls = isLive(r, n) ? " live" : (isLate(r, n) ? " late" : "");
    var prog = "";
    if (isLive(r, n) && r.start_min != null) {
      var pct = Math.max(0, Math.min(100, Math.round((n - r.start_min) / Math.max(1, endOf(r) - r.start_min) * 100)));
      prog = '<div class="prog" aria-hidden="true"><i style="width:' + pct + '%"></i></div>';
    }
    var role = opts.person ? roleFor(r, opts.person) : "";
    return '<article class="card' + cls + '">' +
      '<div class="t">' + esc(timeRange(r)) + " " + statusPill(r, n) + "</div>" +
      '<div class="task">' + esc(r.task) + "</div>" +
      (role ? '<div class="who"><b>Your spot:</b> ' + esc(role) + "</div>" : "") +
      '<div class="who">' + ownerHtml(r) + "</div>" +
      (r.notes ? '<div class="small muted" style="white-space:pre-wrap">' + esc(r.notes) + "</div>" : "") +
      prog +
      (finished(r) ? "" : '<div class="acts"><button class="btn sm good" data-act="done" data-id="' + r.id + '">Done</button>' +
        (opts.noSkip ? "" : '<button class="btn sm ghost" data-act="skip" data-id="' + r.id + '">Skip</button>') + "</div>") +
      "</article>";
  }

  function viewNow() {
    var n = now();
    var day = rows.filter(function (r) { return r.section === "day"; });
    var live = day.filter(function (r) { return isLive(r, n); }).sort(byTime);
    var late = day.filter(function (r) { return isLate(r, n) && r.status !== "live"; }).sort(byTime);
    var next = day.filter(function (r) { return !finished(r) && r.start_min != null && r.start_min > n && r.start_min <= n + 60; }).sort(byTime);
    var after = day.filter(function (r) { return !finished(r) && r.start_min != null && r.start_min > n; }).sort(byTime);
    var whoMap = {};
    live.forEach(function (r) { O.people(r.owner).forEach(function (p) { (whoMap[p.name] = whoMap[p.name] || []).push(r.task + (p.role ? " (" + p.role + ")" : "")); }); });
    var whoNames = Object.keys(whoMap).sort();
    var done = rows.filter(finished).length;
    var html = '<section class="panel"><div class="now-head"><div><div class="muted small">' + (view.preview != null ? "Previewing" : "Right now") + '</div><div class="clock">' + fmt(n) + "</div></div>" +
      '<div class="preview"><label for="pv">Preview another time</label><input type="time" id="pv" value="' + (view.preview != null ? O.toTimeInput(view.preview) : "") + '">' +
      (view.preview != null ? '<button class="btn sm" data-act="pv-reset">Back to live</button>' : "") + "</div></div>" +
      '<p class="small muted" style="margin:10px 0 0">' + done + " of " + rows.length + " blocks done · " + live.length + " happening now · " + late.length + " not marked done</p></section>";

    html += '<section><h2 style="margin:0 0 10px;font-size:1.1rem">Happening now</h2>' +
      (live.length ? '<div class="cards">' + live.map(function (r) { return blockCard(r, n); }).join("") + "</div>"
        : '<p class="muted">Nothing scheduled right now.' + (after[0] ? " Next up: <b>" + esc(after[0].task) + "</b> at " + fmt(after[0].start_min) + "." : "") + "</p>") + "</section>";
    if (late.length) {
      html += '<section><h2 style="margin:0 0 10px;font-size:1.1rem">Finished on the schedule, not marked done</h2><div class="cards">' +
        late.slice(-12).map(function (r) { return blockCard(r, n); }).join("") + "</div>" +
        (late.length > 12 ? '<p class="small muted">Showing the latest 12. See Timeline for all.</p>' : "") + "</section>";
    }
    html += '<section class="panel flush"><header><h2>Up next (60 min)</h2></header>' +
      (next.length ? '<ul class="list">' + next.map(function (r) { return rowHtml(r, n); }).join("") + "</ul>" : '<p class="empty">Nothing starts in the next hour.</p>') + "</section>";
    html += '<section class="panel"><h2 style="margin-bottom:10px">Who’s on what now</h2>' +
      (whoNames.length ? '<dl class="who-now">' + whoNames.map(function (nm) { return "<dt>" + esc(nm) + "</dt><dd>" + whoMap[nm].map(esc).join("; ") + "</dd>"; }).join("") + "</dl>"
        : '<p class="muted" style="margin:0">Nobody has a block right now.</p>') + "</section>";
    main.innerHTML = html;
    var pv = $("pv");
    pv.onchange = function () { var v = pv.value; view.preview = v ? O.parseTime(v) : null; draw(true); };
  }

  function rowHtml(r, n) {
    if (view.editing === r.id) return editorHtml(r);
    var cls = r.status === "done" ? " done" : (r.status === "skipped" ? " skipped" : (isLive(r, n) ? " live" : ""));
    return '<li class="' + cls.trim() + '" id="r-' + r.id + '">' +
      '<input type="checkbox" class="chk" data-act="toggle" data-id="' + r.id + '"' + (r.status === "done" ? " checked" : "") + ' aria-label="Done: ' + esc(r.task) + '">' +
      '<span class="time">' + esc(timeRange(r)) + "</span>" +
      '<div class="body"><div class="task">' + esc(r.task) + "</div>" +
      '<div class="meta">' + statusPill(r, n) + (r.category ? '<span class="tag">' + esc(r.category) + "</span>" : "") +
      (r.added ? '<span class="tag added">Added</span>' : "") + ownerHtml(r) + "</div>" +
      (r.notes ? '<div class="notes">' + esc(r.notes) + "</div>" : "") + "</div>" +
      (O.can("staff") ? '<button class="btn sm ghost" data-act="edit" data-id="' + r.id + '">Edit</button>' : "") + "</li>";
  }

  function editorHtml(r) {
    var secOpt = [["before", "Before the day"], ["day", "Event day"], ["after", "After the event"]].map(function (s) {
      return '<option value="' + s[0] + '"' + (r.section === s[0] ? " selected" : "") + ">" + s[1] + "</option>";
    }).join("");
    var stOpt = [["todo", "To do"], ["live", "In progress"], ["done", "Done"], ["skipped", "Skipped"]].map(function (s) {
      return '<option value="' + s[0] + '"' + (r.status === s[0] ? " selected" : "") + ">" + s[1] + "</option>";
    }).join("");
    return '<li class="editing" id="r-' + r.id + '"><form class="editor" data-id="' + r.id + '">' +
      '<label class="f">Start<input type="time" name="start" value="' + O.toTimeInput(r.start_min) + '"></label>' +
      '<label class="f">End<input type="time" name="end" value="' + O.toTimeInput(r.end_min) + '"></label>' +
      '<label class="f">When<select name="section">' + secOpt + "</select></label>" +
      '<label class="f">Status<select name="status">' + stOpt + "</select></label>" +
      '<label class="f wide">Task<input type="text" name="task" required value="' + esc(r.task) + '"></label>' +
      '<label class="f">Category<input type="text" name="category" list="cats" value="' + esc(r.category) + '"></label>' +
      '<label class="f">Owner(s)<input type="text" name="owner" list="ppl" value="' + esc(r.owner) + '" placeholder="e.g. Deed / Law (Station 3)"></label>' +
      '<label class="f wide">Notes<input type="text" name="notes" value="' + esc(r.notes) + '"></label>' +
      '<div class="acts"><button class="btn primary">Save</button><button type="button" class="btn ghost" data-act="cancel">Cancel</button>' +
      (O.can("owner") ? '<button type="button" class="btn danger" data-act="delete" data-id="' + r.id + '">Delete</button>' : "") + "</div></form></li>";
  }

  function viewTimeline() {
    var n = now();
    var ppl = allPeople(), cats = categories();
    if (view.person && ppl.indexOf(view.person) < 0) view.person = "";
    var list = rows.filter(function (r) {
      if (view.hideDone && finished(r) && view.editing !== r.id) return false;
      if (view.needsOwner && !O.needsOwner(r.owner)) return false;
      if (view.person && !hasPerson(r, view.person)) return false;
      if (view.category && r.category !== view.category) return false;
      if (view.q) { var q = view.q.toLowerCase(); if ((r.task + " " + r.owner + " " + r.notes + " " + r.category).toLowerCase().indexOf(q) < 0) return false; }
      return true;
    }).sort(byTime);
    var needs = rows.filter(function (r) { return !finished(r) && O.needsOwner(r.owner); }).length;
    var html = '<section class="panel"><div class="bar">' +
      '<input type="search" id="q" placeholder="Search tasks, people, notes" value="' + esc(view.q) + '" style="flex:1;min-width:12rem">' +
      '<select id="fp" aria-label="Person"><option value="">Everyone</option>' + ppl.map(function (p) { return '<option' + (p === view.person ? " selected" : "") + ">" + esc(p) + "</option>"; }).join("") + "</select>" +
      '<select id="fc" aria-label="Category"><option value="">All categories</option>' + cats.map(function (c) { return '<option' + (c === view.category ? " selected" : "") + ">" + esc(c) + "</option>"; }).join("") + "</select>" +
      '<button class="btn sm" id="fd" aria-pressed="' + view.hideDone + '">' + (view.hideDone ? "Showing open only" : "Hide done") + "</button>" +
      '<button class="btn sm" id="fo" aria-pressed="' + view.needsOwner + '">' + (view.needsOwner ? "Showing needs owner" : "Needs an owner (" + needs + ")") + "</button>" +
      "</div></section>";

    html += '<section class="panel flush"><header><h2>Add a block</h2></header><form class="addrow" id="addf">' +
      '<label class="f">Start<input type="time" name="start"></label><label class="f">End<input type="time" name="end"></label>' +
      '<label class="f">When<select name="section"><option value="day">Event day</option><option value="before">Before the day</option><option value="after">After the event</option></select></label>' +
      '<label class="f task-in">Task<input type="text" name="task" placeholder="What needs doing" required></label>' +
      '<label class="f">Category<input type="text" name="category" list="cats" placeholder="e.g. Tournament"></label>' +
      '<label class="f">Owner(s)<input type="text" name="owner" list="ppl" placeholder="e.g. Deed / Law"></label>' +
      '<label class="f notes-in">Notes<input type="text" name="notes"></label>' +
      '<button class="btn primary">Add block</button></form></section>';

    var groups = [], cur = null;
    list.forEach(function (r) {
      var key = r.section === "before" ? "Before the day" : r.section === "after" ? "After the event" :
        (r.start_min == null ? "Event day, no time set" : fmt(Math.floor(r.start_min / 60) * 60).replace(":00", ""));
      if (!cur || cur.key !== key) { cur = { key: key, items: [] }; groups.push(cur); }
      cur.items.push(r);
    });
    html += '<section class="panel flush">' + (groups.length ? groups.map(function (g) {
      return '<div class="hour">' + esc(g.key) + '</div><ul class="list">' + g.items.map(function (r) { return rowHtml(r, n); }).join("") + "</ul>";
    }).join("") : '<p class="empty">Nothing matches these filters.</p>') + "</section>";
    html += '<datalist id="ppl">' + ppl.map(function (p) { return "<option value=\"" + esc(p) + "\">"; }).join("") + "</datalist>" +
      '<datalist id="cats">' + cats.map(function (c) { return "<option value=\"" + esc(c) + "\">"; }).join("") + "</datalist>";
    main.innerHTML = html;

    $("q").oninput = function (e) { view.q = e.target.value; clearTimeout(viewTimeline.t); viewTimeline.t = setTimeout(function () { draw(true); var q = $("q"); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }, 250); };
    $("fp").onchange = function (e) { view.person = e.target.value; draw(true); };
    $("fc").onchange = function (e) { view.category = e.target.value; draw(true); };
    $("fd").onclick = function () { view.hideDone = !view.hideDone; draw(true); };
    $("fo").onclick = function () { view.needsOwner = !view.needsOwner; draw(true); };
    $("addf").onsubmit = function (e) {
      e.preventDefault();
      var f = e.target, el = f.elements, s = O.parseTime(el["start"].value), en = O.parseTime(el["end"].value);
      var fields = { task: el["task"].value.trim(), category: el["category"].value.trim(), owner: el["owner"].value.trim(), notes: el["notes"].value.trim(),
                     start_min: s, end_min: en, section: el["section"].value || "day", added: true };
      if (!fields.task) { O.toast("Add a task description first."); return; }
      if (s == null && en != null) { O.toast("Set a start time too (or clear the end time)."); return; }
      if (s != null && en != null && en <= s) { O.toast("The end time is before the start time."); return; }
      O.guard(async function () {
        var row = await addRow(fields);
        if (!row) return;
        f.reset();
        // Make sure the new block is visible, then point at it
        view.q = ""; view.person = ""; view.category = ""; view.needsOwner = false; view.hideDone = false;
        draw(true);
        O.toast("Added “" + row.task + "” " + (row.start_min != null ? "at " + fmt(row.start_min) : row.section === "after" ? "to After the event" : row.section === "before" ? "to Before the day" : "to the event day"));
        var li = document.getElementById("r-" + row.id);
        if (li) { li.scrollIntoView({ behavior: "smooth", block: "center" }); li.style.transition = "background 1.2s"; li.style.background = "var(--flag-bg)"; setTimeout(function () { li.style.background = ""; }, 1600); }
      });
    };
    main.querySelectorAll("form.editor").forEach(function (f) {
      f.onsubmit = function (e) {
        e.preventDefault();
        var r = rows.find(function (x) { return x.id === f.dataset.id; });
        if (!r) return;
        view.editing = null;
        save(r, { start_min: O.parseTime(f.elements["start"].value), end_min: O.parseTime(f.elements["end"].value), section: f.elements["section"].value, status: f.elements["status"].value,
                  task: f.elements["task"].value.trim() || r.task, category: f.elements["category"].value.trim(), owner: f.elements["owner"].value.trim(), notes: f.elements["notes"].value.trim() });
      };
    });
  }

  function viewMine() {
    var n = now(), ppl = allPeople();
    var html = '<section class="panel"><div class="bar"><label for="me" class="small muted">I am</label><select id="me"><option value="">Choose your name</option>' +
      ppl.map(function (p) { return '<option' + (p.toLowerCase() === me.toLowerCase() ? " selected" : "") + ">" + esc(p) + "</option>"; }).join("") + "</select>" +
      (me ? '<button class="btn sm" id="share">Copy my link</button>' : "") + "</div>" +
      '<p class="small muted" style="margin:8px 0 0">Bookmark your own link so this page opens straight to your shifts.</p></section>';
    if (!me) { main.innerHTML = html; bindMine(); return; }
    var mine = rows.filter(function (r) { return hasPerson(r, me); }).sort(byTime);
    var nowL = mine.filter(function (r) { return isLive(r, n); });
    var nextL = mine.filter(function (r) { return !finished(r) && !isLive(r, n) && r.section === "day" && r.start_min != null && r.start_min > n; });
    var prepL = mine.filter(function (r) { return !finished(r) && (r.section !== "day" || r.start_min == null); });
    var lateL = mine.filter(function (r) { return isLate(r, n) && r.status !== "live"; });
    var doneL = mine.filter(finished);
    function grp(title, list, extra) {
      if (!list.length) return "";
      return '<section><h2 style="margin:0 0 10px;font-size:1.1rem">' + title + ' <span class="muted small">(' + list.length + ")</span></h2>" +
        '<div class="cards">' + list.map(function (r) { return blockCard(r, n, { person: me, noSkip: true }); }).join("") + "</div>" + (extra || "") + "</section>";
    }
    html += grp("Now", nowL) + grp("Coming up", nextL) + grp("Not marked done yet", lateL) + grp("Prep and wrap-up", prepL);
    if (doneL.length) html += '<details class="panel"><summary><b>Done</b> (' + doneL.length + ')</summary><ul class="list" style="margin:10px -16px -16px">' + doneL.map(function (r) { return rowHtml(r, n); }).join("") + "</ul></details>";
    if (!mine.length) html += '<p class="muted">No blocks with your name yet.</p>';
    main.innerHTML = html;
    bindMine();
  }
  function bindMine() {
    $("me").onchange = function (e) {
      me = e.target.value;
      try { localStorage.setItem("ros-me", me); } catch (x) {}
      var u = new URL(location.href); if (me) u.searchParams.set("me", me); else u.searchParams.delete("me"); u.searchParams.delete("view");
      history.replaceState(null, "", u);
      if (!O.can("staff")) { loaded = false; draw(true); reload().catch(function (err) { O.toast(err.message); }); }
      else draw(true);
    };
    var s = $("share");
    if (s) s.onclick = async function () {
      var u = new URL(location.href); u.search = "?me=" + encodeURIComponent(me);
      try { await navigator.clipboard.writeText(u.toString()); O.toast("Link copied"); } catch (e) { prompt("Copy this link:", u.toString()); }
    };
  }

  // ---------- floor plan ----------
  // Image(s) in the repo, set in site-config.js:
  //   floorplan: "/assets/floorplan.png"
  //   or several: floorplan: [{ title: "Main hall", src: "/assets/floor-main.png" }, { title: "Side room", src: "/assets/floor-side.png" }]
  function viewFloor() {
    var fp = (window.HUB && HUB.floorplan) || "/assets/floorplan.png";
    var list = (Array.isArray(fp) ? fp : [{ title: "", src: fp }]).filter(function (x) { return x && x.src; });
    main.innerHTML = '<section class="floor" style="display:grid;gap:16px">' + list.map(function (x, i) {
      return '<figure>' + (x.title ? "<figcaption>" + esc(x.title) + "</figcaption>" : "") +
        '<a href="' + esc(x.src) + '" target="_blank" rel="noopener"><img src="' + esc(x.src) + '" alt="' + esc(x.title || "Floor plan") + '" data-i="' + i + '"></a>' +
        '<span class="small muted">Tap the image to open it full size and zoom in.</span></figure>';
    }).join("") + "</section>";
    main.querySelectorAll(".floor img").forEach(function (img) {
      img.onerror = function () {
        img.closest("figure").innerHTML = '<div class="notice"><b>No floor plan yet.</b> Add your image to the repo as <code>' + esc(img.getAttribute("src")) +
          '</code> (or set <code>floorplan</code> in site-config.js), commit, and it shows up here.</div>';
      };
    });
  }

  // ---------- tools ----------
  var FIELDS = [["", "Ignore"], ["start", "Start time"], ["end", "End time"], ["category", "Category"], ["task", "Task"], ["owner", "Owner"], ["notes", "Notes"]];
  function guessMapping(table) {
    var first = table[0] || [], hasHeader = false, map = first.map(function () { return ""; });
    var tests = [["start", /^(start|begin|from|time|start time)$/i], ["end", /^(end|until|to|end time|finish)$/i], ["category", /cat|type|area|dept|section/i],
                 ["task", /task|item|what|activity|description|event|block/i], ["owner", /owner|who|staff|assigned|lead|responsib|person/i], ["notes", /note|comment|detail/i]];
    first.forEach(function (h, i) {
      tests.forEach(function (t) { if (!map[i] && map.indexOf(t[0]) < 0 && t[1].test(h)) { map[i] = t[0]; hasHeader = true; } });
    });
    if (!hasHeader) {
      // Your sheet's layout: Start | End | Duration | Category | Task | Owner | Notes
      if (O.parseTime(first[0]) != null && O.parseTime(first[1]) != null && /min|hr|hour/i.test(first[2] || "")) {
        map = ["start", "end", "", "category", "task", "owner", "notes"].slice(0, first.length);
      } else if (O.parseTime(first[0]) != null) {
        map = ["start", "end", "task", "owner", "notes", "category"].slice(0, first.length);
      } else {
        map = ["task", "owner", "notes", "category"].slice(0, first.length);
      }
      while (map.length < first.length) map.push("");
    }
    return { map: map, hasHeader: hasHeader };
  }
  function mappedRows() {
    if (!importState) return [];
    var body = importState.hasHeader ? importState.table.slice(1) : importState.table;
    return body.map(function (r) {
      var o = { start: "", end: "", category: "", task: "", owner: "", notes: "" };
      importState.map.forEach(function (f, i) { if (f && r[i] != null) o[f] = o[f] ? o[f] + " " + r[i] : r[i]; });
      var s = O.parseTime(o.start), e = O.parseTime(o.end);
      return { section: s == null ? "before" : "day", start_min: s, end_min: e, category: o.category, task: o.task, owner: o.owner, notes: o.notes };
    }).filter(function (r) { return r.task; });
  }
  function viewTools() {
    var n = now();
    var html = "";
    if (!O.unlocked()) html += '<div class="notice">Enter the staff PIN to use these tools. <button class="btn sm" data-act="unlock">Enter PIN</button></div>';
    html += '<section class="panel"><h2>Running late?</h2><p class="small muted">Moves every unfinished block on the event day that starts at or after this time. Use a negative number to pull blocks earlier.</p>' +
      '<form class="bar" id="shiftf"><label class="f">From<input type="time" name="from" value="' + O.toTimeInput(n) + '"></label>' +
      '<label class="f">Minutes<input type="number" name="delta" value="10" step="5" style="width:6rem"></label>' +
      '<button class="btn primary" style="align-self:end">Shift blocks</button></form></section>';

    html += '<section class="panel"><h2>Import from Google Sheets</h2><p class="small muted">In your sheet, select the rows (include the header row if you have one), copy, and paste here. CSV text works too.</p>' +
      '<textarea id="paste" placeholder="Paste rows here">' + esc(importState ? importState.raw : "") + "</textarea>";
    if (importState && importState.table.length) {
      var cols = importState.map.length, sample = importState.hasHeader ? importState.table[0] : importState.table[0];
      html += '<h3 style="margin:14px 0 6px;font-size:1rem">Match the columns</h3><div class="mapgrid">' +
        importState.map.map(function (f, i) {
          return '<label class="f">' + esc(importState.hasHeader ? (sample[i] || "Column " + (i + 1)) : "Column " + (i + 1) + ": " + (sample[i] || "").slice(0, 18)) +
            '<select data-col="' + i + '">' + FIELDS.map(function (x) { return '<option value="' + x[0] + '"' + (x[0] === f ? " selected" : "") + ">" + x[1] + "</option>"; }).join("") + "</select></label>";
        }).join("") + "</div>" +
        '<label class="small" style="display:flex;gap:6px;align-items:center;margin-top:8px"><input type="checkbox" id="hdr"' + (importState.hasHeader ? " checked" : "") + "> First row is a header</label>";
      var mr = mappedRows();
      html += '<p class="small" style="margin:12px 0 6px"><b>' + mr.length + " blocks</b> ready to import. First few:</p>" +
        '<div class="tablewrap"><table class="prevtable"><thead><tr><th>Time</th><th>Category</th><th>Task</th><th>Owner</th><th>Notes</th></tr></thead><tbody>' +
        mr.slice(0, 6).map(function (r) { return "<tr><td>" + esc(r.start_min == null ? "—" : fmt(r.start_min) + (r.end_min != null ? "–" + fmt(r.end_min) : "")) + "</td><td>" + esc(r.category) + "</td><td>" + esc(r.task) + "</td><td>" + esc(r.owner) + "</td><td>" + esc(r.notes) + "</td></tr>"; }).join("") +
        "</tbody></table></div>" +
        '<div class="bar" style="margin-top:12px">' + (O.can("owner") ? '<button class="btn primary" data-act="import-replace">Replace sheet blocks</button>' : "") + '<button class="btn' + (O.can("owner") ? "" : " primary") + '" data-act="import-append">Add to the run of show</button></div>' +
        (O.can("owner") ? '<p class="small muted" style="margin:8px 0 0">“Replace” swaps out everything that came from a sheet and keeps blocks added in this app. Checkmarks carry over for blocks that keep the same start time and category.</p>'
          : '<p class="small muted" style="margin:8px 0 0">Only the owner can replace the whole run of show; you can add blocks to it.</p>');
    }
    html += "</section>";

    html += '<section class="panel"><h2>Export</h2><p class="small muted">Download the current run of show as a CSV you can open in Sheets.</p><button class="btn" data-act="export">Download CSV</button></section>';
    if (O.can("owner")) {
      html += '<section class="panel"><h2>Reset <span class="tag">Owner</span></h2><div class="bar"><button class="btn" data-act="reset-statuses">Uncheck everything</button>' +
        '<button class="btn danger" data-act="reset-all">Delete the whole run of show</button></div></section>';
      html += '<section class="panel"><h2>PINs <span class="tag">Owner</span></h2>' +
        '<p class="small muted">One PIN per level, used for the run of show and check-in. Volunteers can check teams in and see their own shifts. Staff can do everything except deleting, resetting and changing PINs.</p>' +
        '<div id="pinstatus" class="small muted" style="margin-bottom:8px"></div>' +
        [["volunteer", "Volunteer PIN"], ["staff", "Staff PIN"], ["owner", "Owner PIN"]].map(function (x) {
          return '<form class="bar pinf" data-role="' + x[0] + '" style="margin-bottom:8px"><label class="f" style="flex:1;min-width:12rem">' + x[1] +
            '<input type="password" name="pin" inputmode="numeric" placeholder="New ' + x[1].toLowerCase() + '" autocomplete="new-password"></label>' +
            '<button class="btn" style="align-self:end">Set</button>' + (x[0] !== "owner" ? '<button type="button" class="btn ghost" data-act="pin-off" data-role="' + x[0] + '" style="align-self:end">Turn off</button>' : "") + "</form>";
        }).join("") + "</section>";
    }
    main.innerHTML = html;
    if (O.can("owner")) loadPinStatus();

    $("paste").oninput = function (e) {
      var raw = e.target.value, table = O.parseTable(raw);
      if (!table.length) { importState = null; return; }
      var g = guessMapping(table);
      importState = { raw: raw, table: table, map: g.map, hasHeader: g.hasHeader };
      clearTimeout(viewTools.t); viewTools.t = setTimeout(function () { draw(true); }, 400);
    };
    main.querySelectorAll("select[data-col]").forEach(function (s) {
      s.onchange = function () { importState.map[+s.dataset.col] = s.value; draw(true); };
    });
    var hdr = $("hdr"); if (hdr) hdr.onchange = function () { importState.hasHeader = hdr.checked; draw(true); };
    $("shiftf").onsubmit = function (e) {
      e.preventDefault();
      var from = O.parseTime(e.target.elements["from"].value), delta = parseInt(e.target.elements["delta"].value, 10);
      if (from == null || !delta) return;
      O.guard(async function () {
        try { var r = await O.rpc("ops_ros_shift", { p_from: from, p_delta: delta }); O.toast("Moved " + r.count + " blocks by " + delta + " min"); await reload(); }
        catch (err) { O.toast(err.message); }
      });
    };
    main.querySelectorAll("form.pinf").forEach(function (f) {
      f.onsubmit = async function (e) {
        e.preventDefault();
        var v = f.elements["pin"].value.trim(), role = f.dataset.role;
        if (!v) return;
        try {
          await O.rpc("ops_change_pin", { p_role: role, p_new_pin: v });
          if (role === "owner") { O.pin = v; try { localStorage.setItem("ops-pin", v); } catch (x) {} }
          O.toast(role.charAt(0).toUpperCase() + role.slice(1) + " PIN set"); f.reset(); loadPinStatus();
        } catch (err) { O.toast(err.message); }
      };
    });
  }
  async function loadPinStatus() {
    try {
      var r = await O.rpc("ops_pin_status", {}), el = $("pinstatus");
      if (el) el.textContent = "Volunteer PIN: " + (r.volunteer ? "set" : "off") + " · Staff PIN: " + (r.staff ? "set" : "off") + " · Owner PIN: set";
    } catch (e) {}
  }

  async function doImport(mode) {
    var list = mappedRows();
    if (!list.length) return;
    if (mode === "replace") {
      // keep checkmarks for blocks that line up with the old sheet rows
      var old = rows.filter(function (r) { return r.source === "sheet" && r.status !== "todo"; });
      var norm = function (s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, ""); };
      list.forEach(function (r) {
        var i = old.findIndex(function (o) { return o.start_min === r.start_min && norm(o.category) === norm(r.category); });
        if (i < 0) i = old.findIndex(function (o) { return norm(o.task) === norm(r.task); });
        if (i >= 0) { r.status = old[i].status; old.splice(i, 1); }
      });
      if (!confirm("Replace the " + rows.filter(function (r) { return r.source === "sheet"; }).length + " sheet blocks with these " + list.length + "? Blocks added in the app stay.")) return;
    }
    try {
      var res = await O.rpc("ops_ros_import", { p_rows: list, p_mode: mode });
      importState = null; O.toast("Imported " + res.count + " blocks"); rows = []; await reload();
    } catch (err) { O.toast(err.message); }
  }

  function exportCsv() {
    var head = ["Start", "End", "Category", "Task", "Owner", "Notes", "Status", "When"];
    var lines = [head].concat(rows.slice().sort(byTime).map(function (r) {
      return [fmt(r.start_min), fmt(r.end_min), r.category, r.task, r.owner, r.notes, r.status, r.section];
    })).map(function (l) { return l.map(function (c) { c = String(c == null ? "" : c); return /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(","); });
    var blob = new Blob([lines.join("\n")], { type: "text/csv" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "run-of-show.csv"; a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }

  // ---------- click handling ----------
  main.addEventListener("click", function (e) {
    var b = e.target.closest("[data-act]");
    if (!b) return;
    var act = b.dataset.act, r = b.dataset.id && rows.find(function (x) { return x.id === b.dataset.id; });
    if (act === "toggle") {
      e.preventDefault();
      var target = r.status === "done" ? "todo" : "done";
      setStatus(r, target);
    }
    else if (act === "done") setStatus(r, "done");
    else if (act === "skip") setStatus(r, "skipped");
    else if (act === "edit") O.guard(function () { view.editing = r.id; draw(true); var el = document.querySelector("#r-" + r.id + " [name=task]"); if (el) el.focus(); });
    else if (act === "cancel") { view.editing = null; draw(true); }
    else if (act === "delete") { view.editing = null; del(r); }
    else if (act === "pv-reset") { view.preview = null; draw(true); }
    else if (act === "unlock") O.askPin();
    else if (act === "import-replace") O.guard(function () { doImport("replace"); });
    else if (act === "import-append") O.guard(function () { doImport("append"); });
    else if (act === "export") exportCsv();
    else if (act === "pin-off") (async function () {
      var role = b.dataset.role;
      if (!confirm("Turn off the " + role + " PIN? Anyone using it will be signed out.")) return;
      try { await O.rpc("ops_change_pin", { p_role: role, p_new_pin: "" }); O.toast(role + " PIN turned off"); loadPinStatus(); } catch (err) { O.toast(err.message); }
    })();
    else if (act === "reset-statuses") O.guard(async function () {
      if (!confirm("Uncheck every block for everyone?")) return;
      try { await O.rpc("ops_ros_reset", { p_mode: "statuses" }); await reload(); } catch (err) { O.toast(err.message); }
    });
    else if (act === "reset-all") O.guard(async function () {
      if (prompt("This deletes every block. Type DELETE to confirm.") !== "DELETE") return;
      try { await O.rpc("ops_ros_reset", { p_mode: "everything" }); await reload(); } catch (err) { O.toast(err.message); }
    });
  });

  // ---------- rendering ----------
  function render() {
    var staff = O.can("staff");
    var tab = staff || view.tab === "floor" ? view.tab : "mine";   // volunteers: their own shifts + floor plan
    document.querySelectorAll("#tabs button").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.dataset.tab === tab));
      b.hidden = O.unlocked() && !staff && b.dataset.tab !== "mine" && b.dataset.tab !== "floor";
    });
    if (!O.configured) { main.innerHTML = O.notConfiguredHtml(); return; }
    if (!O.unlocked()) { main.innerHTML = O.lockedHtml("the run of show and shifts"); return; }
    if (!loaded || !O.roleKnown()) { main.innerHTML = '<p class="muted">Loading…</p>'; return; }
    ({ now: viewNow, timeline: viewTimeline, mine: viewMine, floor: viewFloor, tools: viewTools }[tab] || viewNow)();
  }
  var draw = O.makeRenderer(render, function () { return !!view.editing; });
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
    if (O.can("staff")) {
      var res = await O.rpc("ops_ros_list", {});
      rows = O.merge(rows, res.rows);
    } else {
      var ppl = await O.rpc("ops_ros_people", {});
      ownerList = ppl.owners || [];
      var mine = me ? await O.rpc("ops_ros_mine", { p_name: me }) : { rows: [] };
      rows = O.merge(rows, mine.rows);
    }
    loaded = true;
    draw();
  }
  var lastRole = O.role;
  O.onLockChange = function () {
    if (!O.unlocked()) { rows = []; ownerList = []; loaded = false; view.editing = null; if (poller) poller.reset(); O.setConn(false, "Locked"); draw(true); return; }
    if (O.role !== lastRole) { lastRole = O.role; rows = []; loaded = false; if (poller) poller.reset(); }
    if (!loaded && poller) poller.now().catch(function () {});
    draw(true);
  };
  (async function start() {
    O.bindLock();
    if (!O.configured) { render(); O.setConn(false, "Not set up"); return; }
    poller = O.poll("ros", function () {
      return reload().catch(function (err) {
        if (!loaded) main.innerHTML = '<div class="notice"><b>Couldn’t load the run of show.</b> Check the Supabase details in site-config.js and that ops-setup.sql ran. (' + esc(err.message) + ")</div>";
      });
    });
    if (O.unlocked()) { O.checkSavedPin().finally(function () { poller.now(); }); } else { O.setConn(false, "Locked"); render(); }
    setInterval(function () { if (view.tab !== "tools" && view.tab !== "floor" && loaded) draw(); }, 30000);
  })();
})();
