// Draws the schedule from a published Google Sheet (CSV) or schedule-data.js.
(function () {
  var H = window.HUB || {}, cfg = H.schedule || {};
  var box = document.getElementById("schedule");
  var TAGS = { main: "Main event", side: "Side event", social: "Social", end: "End of day", general: "General" };

  // Long words and links wrap instead of running off the screen on phones.
  var st = document.createElement("style");
  st.textContent = ".item-info{min-width:0}.item-name,.item-sub{overflow-wrap:anywhere;word-break:break-word}" +
    ".item-sub a{color:var(--t-accent);font-weight:600;text-decoration:underline;text-underline-offset:2px}";
  document.head.appendChild(st);

  // Turn web addresses in Details into tappable links showing just the site name ("pollunit.com ↗").
  function linkify(text) {
    return esc(text).replace(/\bhttps?:\/\/[^\s<]+[^\s<.,;:!?)\]'"]/g, function (url) {
      var raw = url.replace(/&amp;/g, "&"), host = raw;
      try { host = new URL(raw).hostname.replace(/^www\./, ""); } catch (e) {}
      return '<a href="' + url + '" target="_blank" rel="noopener">' + esc(host) + " ↗</a>";
    });
  }

  function esc(x) { return String(x == null ? "" : x).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function parseCsv(text) {
    text = String(text || "").replace(/\r\n?/g, "\n");
    var sep = text.indexOf("\t") >= 0 && text.indexOf(",") < 0 ? "\t" : ",";
    var rows = [], row = [], cell = "", q = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
      else if (c === '"' && cell === "") q = true;
      else if (c === sep) { row.push(cell); cell = ""; }
      else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
      else cell += c;
    }
    if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
    return rows.map(function (r) { return r.map(function (x) { return x.trim(); }); })
               .filter(function (r) { return r.some(Boolean); });
  }
  function normType(t) {
    t = String(t || "").toLowerCase();
    if (/main|tourn|bracket|pool/.test(t)) return "main";
    if (/side|exhib|amateur/.test(t)) return "side";
    if (/social|party|karaoke|photo|costume|meet/.test(t)) return "social";
    if (/end|wrap|close/.test(t)) return "end";
    return "general";
  }
  // Columns: Day | Start | End | Event | Details | Type   (header names can be in any order; Type = main / general / social / side / end)
  function rowsToItems(rows) {
    if (!rows.length) return [];
    var head = rows[0].map(function (h) { return h.toLowerCase(); });
    var find = function (re) { return head.findIndex(function (h) { return re.test(h); }); };
    var col = { day: find(/^day|date/), start: find(/^start|^time|^from/), end: find(/^end|^until|^to$/),
                title: find(/event|title|name|what|item/), details: find(/detail|desc|sub|note|info/), type: find(/type|kind|category/), tag: find(/^tag|label|badge/) };
    var hasHeader = col.title >= 0 || col.start >= 0;
    if (!hasHeader) col = { day: 0, start: 1, end: 2, title: 3, details: 4, type: 5, tag: 6 };
    var last = "";
    return rows.slice(hasHeader ? 1 : 0).map(function (r) {
      var g = function (k) { return col[k] >= 0 ? (r[col[k]] || "") : ""; };
      var day = g("day") || last; last = day;
      return { day: day, start: g("start"), end: g("end"), title: g("title"), details: g("details"), type: g("type"), tag: g("tag") };
    }).filter(function (it) { return it.title; });
  }

  function draw(items) {
    if (!items.length) { box.innerHTML = '<p class="item-sub" style="text-align:center">The schedule will be posted soon.</p>'; return; }
    var days = [], byDay = {};
    items.forEach(function (it) {
      var d = it.day || "";
      if (!byDay[d]) { byDay[d] = []; days.push(d); }
      byDay[d].push(it);
    });
    box.innerHTML = days.map(function (d) {
      return '<div class="day-block">' + (d ? '<div class="day-label">' + esc(d) + "</div>" : "") +
        byDay[d].map(function (it) {
          var type = normType(it.type), tagCls = type === "general" || type === "end" ? "wrap" : type;
          return '<div class="item"><span class="tag tag-' + tagCls + '">' + esc(TAGS[type]) + "</span>" +
            '<div class="time-col">' + esc(it.start) + (it.end ? '<span class="end-time">→ ' + esc(it.end) + "</span>" : "") + "</div>" +
            '<div class="item-info"><div class="item-name">' + esc(it.title) + "</div>" +
            (it.details ? '<div class="item-sub">' + linkify(it.details) + "</div>" : "") + "</div></div>";
        }).join("") + "</div>";
    }).join("");
  }

  var foot = document.getElementById("footnote");
  if (foot) foot.textContent = [cfg.footnote, H.eventName, H.location].filter(Boolean).join(" · ");

  var backup = window.SCHEDULE_ITEMS || [];
  if (!cfg.sheetCsvUrl) { draw(backup); return; }
  fetch(cfg.sheetCsvUrl, { cache: "no-store" })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); })
    .then(function (t) {
      if (/^\s*</.test(t)) throw new Error("Got a web page, not CSV. Use File > Share > Publish to web > CSV.");
      draw(rowsToItems(parseCsv(t)));
    })
    .catch(function (e) { console.warn("Schedule sheet failed, using schedule-data.js:", e); draw(backup); });
})();
