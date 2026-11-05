// Shared helpers for the staff tools: Supabase connection, staff PIN,
// live updates, toasts, time parsing and Google Sheets paste parsing.
(function () {
  var PIN_KEY = "ops-pin";
  var cfg = (window.HUB && window.HUB.ops) || {};
  var Ops = window.Ops = {
    sb: null, pin: null, configured: false,
    onLockChange: function () {}
  };
  try { Ops.pin = localStorage.getItem(PIN_KEY); } catch (e) {}

  Ops.configured = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY &&
    cfg.SUPABASE_URL.indexOf("YOUR-") < 0 && cfg.SUPABASE_ANON_KEY.indexOf("YOUR-") < 0);
  if (Ops.configured && window.supabase) Ops.sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  // ---------- text + time helpers ----------
  Ops.esc = function (x) {
    return String(x == null ? "" : x).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
  // "8:20 AM", "8:20am", "20:20", "8 PM" -> minutes after midnight (or null)
  Ops.parseTime = function (s) {
    s = String(s || "").trim().toUpperCase();
    if (!s) return null;
    var m = /^(\d{1,2})(?::(\d{2}))?\s*([AP])\.?M?\.?$/.exec(s);
    if (m) {
      var h = (+m[1]) % 12 + (m[3] === "P" ? 12 : 0);
      return h * 60 + (+(m[2] || 0));
    }
    m = /^(\d{1,2}):(\d{2})$/.exec(s);
    if (m && +m[1] < 24) return (+m[1]) * 60 + (+m[2]);
    return null;
  };
  Ops.fmt = function (min) {
    if (min == null) return "";
    var h = Math.floor(min / 60) % 24, m = min % 60;
    return ((h % 12) || 12) + ":" + String(m).padStart(2, "0") + " " + (h < 12 ? "AM" : "PM");
  };
  Ops.toTimeInput = function (min) {
    if (min == null) return "";
    return String(Math.floor(min / 60) % 24).padStart(2, "0") + ":" + String(min % 60).padStart(2, "0");
  };
  Ops.nowMin = function () { var d = new Date(); return d.getHours() * 60 + d.getMinutes(); };

  // "Deed/ Raven (Station 1) / Piko (Mainstage), Law?" -> [{name:"Deed"},{name:"Raven",role:"Station 1"},...]
  Ops.people = function (owner) {
    return String(owner || "").split(/[,/&+]+|\band\b/i).map(function (part) {
      var role = "", m = /\(([^)]*)\)/.exec(part);
      if (m) role = m[1].trim();
      var name = part.replace(/\([^)]*\)/g, "").replace(/\?/g, "").trim();
      return { name: name, role: role };
    }).filter(function (p) { return p.name && !/^(tbd|\?+|n\/a)$/i.test(p.name); });
  };
  Ops.needsOwner = function (owner) {
    var o = String(owner || "").trim();
    return !o || /\?|\btbd\b/i.test(o) || !Ops.people(o).length;
  };

  // Parse text copied from Google Sheets / Excel (tab-separated, quotes allowed) or CSV.
  Ops.parseTable = function (text) {
    text = String(text || "").replace(/\r\n?/g, "\n");
    var sep = text.indexOf("\t") >= 0 ? "\t" : ",";
    var rows = [], row = [], cell = "", q = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"' && cell === "") q = true;
      else if (c === sep) { row.push(cell); cell = ""; }
      else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
      else cell += c;
    }
    if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
    return rows.map(function (r) { return r.map(function (c) { return c.trim(); }); })
               .filter(function (r) { return r.some(function (c) { return c !== ""; }); });
  };

  // ---------- connection status ----------
  Ops.setConn = function (live, text) {
    var d = document.getElementById("dot"), c = document.getElementById("conn");
    if (d) d.classList.toggle("live", !!live);
    if (c) c.textContent = text || (live ? "Live" : "Reconnecting…");
  };

  // ---------- toast ----------
  var toastTimer = null, toastUndo = null;
  Ops.toast = function (msg, undo) {
    var t = document.getElementById("toast");
    if (!t) {
      t = document.createElement("div"); t.id = "toast"; t.className = "toast"; t.setAttribute("role", "status");
      t.innerHTML = '<span></span><button type="button">Undo</button>';
      document.body.appendChild(t);
      t.querySelector("button").onclick = function () { t.hidden = true; var u = toastUndo; toastUndo = null; if (u) u(); };
    }
    t.querySelector("span").textContent = msg;
    t.querySelector("button").hidden = !undo;
    toastUndo = undo || null;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; toastUndo = null; }, undo ? 8000 : 4500);
  };

  // ---------- staff PIN ----------
  var dlg = null, pending = null;
  function buildPinDialog() {
    dlg = document.createElement("dialog");
    dlg.className = "pin";
    dlg.innerHTML = '<form method="dialog"><h2>Enter staff PIN</h2><p class="muted small">You only need to do this once on this device. It works for every staff tool in the hub.</p>' +
      '<input class="pin-input" type="password" inputmode="numeric" autocomplete="off" aria-label="Staff PIN">' +
      '<div class="err" aria-live="polite"></div><div class="row"><button type="button" class="btn ghost" data-x>Cancel</button><button class="btn primary">Unlock</button></div></form>';
    document.body.appendChild(dlg);
    dlg.querySelector("[data-x]").onclick = function () { pending = null; dlg.close(); };
    dlg.querySelector("form").onsubmit = async function (e) {
      e.preventDefault();
      var v = dlg.querySelector("input").value.trim(), err = dlg.querySelector(".err");
      if (!v) return;
      err.textContent = "Checking…";
      var res = await Ops.sb.rpc("ops_verify", { p_pin: v });
      if (res.error) { err.textContent = "Couldn’t reach the server. Check your connection."; return; }
      if (!res.data.ok) { err.textContent = res.data.error === "locked" ? "Too many wrong PINs. Try again in 5 minutes." : "Wrong PIN."; return; }
      Ops.pin = v;
      try { localStorage.setItem(PIN_KEY, v); } catch (e2) {}
      dlg.close();
      Ops.updateLock();
      var act = pending; pending = null;
      if (act) act();
    };
  }
  Ops.unlocked = function () { return !!Ops.pin; };
  Ops.askPin = function (then) {
    if (!Ops.sb) return;
    if (!dlg) buildPinDialog();
    pending = then || null;
    dlg.querySelector("input").value = "";
    dlg.querySelector(".err").textContent = "";
    dlg.showModal();
    setTimeout(function () { dlg.querySelector("input").focus(); }, 30);
  };
  Ops.guard = function (fn) { if (Ops.unlocked()) fn(); else Ops.askPin(fn); };
  Ops.lock = function () {
    Ops.pin = null;
    try { localStorage.removeItem(PIN_KEY); } catch (e) {}
    Ops.updateLock();
  };
  Ops.updateLock = function () {
    var b = document.getElementById("lockBtn");
    if (b) {
      b.textContent = Ops.unlocked() ? "Unlocked · Lock" : "🔒 Staff PIN";
      b.classList.toggle("on", Ops.unlocked());
    }
    try { window.dispatchEvent(new CustomEvent("ops-lock-change", { detail: { unlocked: Ops.unlocked() } })); } catch (e) {}
    Ops.onLockChange();
  };
  Ops.bindLock = function () {
    var b = document.getElementById("lockBtn");
    if (b) b.onclick = function () { if (Ops.unlocked()) Ops.lock(); else Ops.askPin(); };
    Ops.updateLock();
  };
  Ops.checkSavedPin = async function () {
    if (!Ops.pin || !Ops.sb) return;
    var res = await Ops.sb.rpc("ops_verify", { p_pin: Ops.pin });
    if (res.data && !res.data.ok && res.data.error === "bad_pin") Ops.lock();
  };

  var MESSAGES = {
    locked: "Too many wrong PINs on this hub. Wait 5 minutes.",
    empty: "That needs a name or description.",
    name_taken: "There’s already a team with that name.",
    pin_too_short: "The new PIN needs at least 4 characters."
  };
  // Call a PIN-protected database function. Throws an Error with a readable message.
  Ops.rpc = async function (name, args) {
    var res = await Ops.sb.rpc(name, Object.assign({ p_pin: Ops.pin }, args || {}));
    if (res.error) throw new Error("Couldn’t save. Check your connection and try again.");
    if (!res.data.ok) {
      if (res.data.error === "bad_pin") { Ops.lock(); throw new Error("The staff PIN has changed. Enter the new PIN to keep editing."); }
      throw new Error(MESSAGES[res.data.error] || ("That didn’t go through (" + res.data.error + ")."));
    }
    return res.data;
  };

  // ---------- data loading + live updates ----------
  // All staff data is private, so pages load it through PIN-checked functions
  // and poll a cheap version check every few seconds instead of realtime.
  Ops.poll = function (scope, onChange) {
    var last = null, busy = false;
    async function tick(force) {
      if (busy || !Ops.unlocked() || (document.hidden && !force)) return;
      busy = true;
      try {
        var res = await Ops.sb.rpc("ops_version", { p_pin: Ops.pin, p_scope: scope });
        if (res.error) throw res.error;
        if (!res.data.ok) { if (res.data.error === "bad_pin") Ops.lock(); Ops.setConn(false, "Locked"); return; }
        Ops.setConn(true, "Live");
        if (force || res.data.v !== last) { last = res.data.v; await onChange(); }
      } catch (e) { Ops.setConn(false, "Offline, retrying…"); }
      finally { busy = false; }
    }
    setInterval(tick, 4000);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) tick(); });
    return { now: function () { return tick(true); }, reset: function () { last = null; } };
  };
  // Keep the same objects for rows that still exist, so in-progress edits stay attached.
  Ops.merge = function (oldRows, newRows) {
    var byId = {};
    oldRows.forEach(function (r) { byId[r.id] = r; });
    return newRows.map(function (n) { return byId[n.id] ? Object.assign(byId[n.id], n) : n; });
  };
  Ops.lockedHtml = function (what) {
    return '<section class="panel" style="text-align:center;padding:36px 16px"><div style="font-size:2rem">🔒</div>' +
      '<h2 style="margin:8px 0 6px">Staff only</h2><p class="muted" style="margin:0 0 16px">Enter the staff PIN to see ' + Ops.esc(what) + '. You only need to do this once on this device.</p>' +
      '<button class="btn primary" data-act="unlock">Enter staff PIN</button></section>';
  };

  // Don't redraw under someone's fingers while they type.
  Ops.makeRenderer = function (render, isBusy) {
    var pendingRender = false;
    function busy() {
      var a = document.activeElement;
      return (isBusy && isBusy()) || (a && a.closest && a.closest("main") && /INPUT|SELECT|TEXTAREA/.test(a.tagName));
    }
    document.addEventListener("focusout", function () {
      setTimeout(function () { if (pendingRender && !busy()) { pendingRender = false; render(); } }, 0);
    });
    return function schedule(force) {
      if (!force && busy()) { pendingRender = true; return; }
      pendingRender = false; render();
    };
  };

  Ops.notConfiguredHtml = function () {
    return '<div class="notice"><b>Almost ready.</b> Paste your Supabase Project URL and anon key into <code>site-config.js</code> (the <code>ops</code> section), then reload. See SETUP.md.</div>';
  };
})();
