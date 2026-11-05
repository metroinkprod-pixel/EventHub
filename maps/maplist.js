// Rebuilds the map list from a published Google Sheet (CSV) when one is set in
// site-config.js (maps.sheetCsvUrl). Without a sheet, the page shows the map list
// written in maps/index.html as before.
//
// Sheet columns (header names, any order):
//   Stage        tab name, e.g. "Group", "Silver", "Top 8"
//   Heading      optional title shown above that stage (first row of the stage)
//   Round        e.g. "Round 1", "Winners Semifinals"
//   Format       optional, e.g. "Best of 5"
//   Game         optional game number (counts up on its own if blank)
//   Mode         SZ, TC, RM, CB, TW, or Counterpick
//   Map          map name (leave blank for Counterpick)
//   Stage notes  optional rules text for the stage (first row of the stage)
//   Image        optional image link shown at the bottom of the stage (e.g. a map pool)
// Blank Stage / Round / Format cells repeat the row above, so you only type them once.
//
// MODE ICONS: put image files in /assets/modes/ named
//   sz.png  tc.png  rm.png  cb.png  tw.png   (Splat Zones, Tower Control, Rainmaker, Clam Blitz, Turf War)
// Any icon that's missing shows the text label instead. To use .svg or .webp, set maps.iconType in site-config.js.
(function () {
  var cfg = (window.HUB && window.HUB.maps) || {};
  var foot = document.querySelector(".footer");
  if (foot && window.HUB) foot.textContent = [HUB.eventName, HUB.location].filter(Boolean).join(" · ") || foot.textContent;

  var ICON_NAMES = { sz: "Splat Zones", tc: "Tower Control", rm: "Rainmaker", cb: "Clam Blitz", tw: "Turf War" };
  function iconize(root) {
    var ext = (cfg.iconType || "png").replace(/^\./, "");
    root.querySelectorAll(".mode-tag").forEach(function (tag) {
      if (tag.dataset.iconized) return;
      tag.dataset.iconized = "1";
      var m = /\bmode-(sz|tc|rm|cb|tw)\b/.exec(tag.className);
      if (!m) return;
      var label = tag.textContent.trim();
      var img = new Image();
      img.className = "mode-icon";
      img.alt = ICON_NAMES[m[1]];
      img.title = ICON_NAMES[m[1]];
      img.onload = function () {
        tag.classList.add("has-icon");
        tag.textContent = "";
        tag.appendChild(img);
        var sr = document.createElement("span"); sr.className = "sr-only"; sr.textContent = label; tag.appendChild(sr);
      };
      img.src = "/assets/modes/" + m[1] + "." + ext;
    });
  }
  iconize(document);
  if (!cfg.sheetCsvUrl) return;

  function esc(x) { return String(x == null ? "" : x).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function parseCsv(text) {
    text = String(text || "").replace(/\r\n?/g, "\n");
    var rows = [], row = [], cell = "", q = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
      else if (c === '"' && cell === "") q = true;
      else if (c === ",") { row.push(cell); cell = ""; }
      else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
      else cell += c;
    }
    if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
    return rows.map(function (r) { return r.map(function (x) { return x.trim(); }); }).filter(function (r) { return r.some(Boolean); });
  }
  var MODES = [
    [/^(sz|splat ?zones?)$/i, "sz", "SZ"], [/^(tc|tower( control)?)$/i, "tc", "TC"], [/^(rm|rain ?maker)$/i, "rm", "RM"],
    [/^(cb|clam ?blitz)$/i, "cb", "CB"], [/^(tw|turf( war)?)$/i, "tw", "TW"], [/^(cp|counter ?pick)$/i, "cp", "Counterpick"]
  ];
  function mode(m) {
    for (var i = 0; i < MODES.length; i++) if (MODES[i][0].test(m || "")) return { cls: MODES[i][1], label: MODES[i][2] };
    return { cls: "cp", label: m || "TBD" };
  }
  function safeSrc(u) { return /^(https?:\/\/|\/)/i.test(u || "") ? u : ""; }

  function build(rows) {
    var head = rows[0].map(function (h) { return h.toLowerCase(); });
    var col = function (re) { return head.findIndex(function (h) { return re.test(h); }); };
    var c = { stage: col(/^stage$|^tab|bracket/), heading: col(/heading|title/), round: col(/^round/), format: col(/format|best of|^bo/),
              game: col(/^game|^#/), mode: col(/^mode/), map: col(/^map$|map name|stage map/), notes: col(/note|rule|desc/), image: col(/image|img|picture/) };
    if (c.stage < 0 || c.round < 0) throw new Error("The sheet needs at least Stage and Round columns.");
    var stages = [], byName = {}, last = { stage: "", round: "", format: "" };
    rows.slice(1).forEach(function (r) {
      var g = function (k) { return c[k] >= 0 ? (r[c[k]] || "") : ""; };
      var stage = g("stage") || last.stage, round = g("round") || last.round;
      var format = g("format") || (round === last.round && stage === last.stage ? last.format : "");
      if (!stage || !round) return;
      last = { stage: stage, round: round, format: format };
      var st = byName[stage];
      if (!st) { st = byName[stage] = { name: stage, heading: "", notes: "", image: "", rounds: [], byRound: {} }; stages.push(st); }
      if (g("heading") && !st.heading) st.heading = g("heading");
      if (g("notes") && !st.notes) st.notes = g("notes");
      if (g("image") && !st.image) st.image = g("image");
      var rd = st.byRound[round];
      if (!rd) { rd = st.byRound[round] = { name: round, format: format, games: [] }; st.rounds.push(rd); }
      if (!rd.format && format) rd.format = format;
      if (g("mode") || g("map")) rd.games.push({ n: g("game") || String(rd.games.length + 1), mode: mode(g("mode")), map: g("map") });
    });
    return stages;
  }

  function draw(stages) {
    var tabsEl = document.querySelector(".stage-tabs"), content = document.querySelector(".content");
    if (!stages.length || !tabsEl || !content) return;
    // The original page has the footer inside .content; keep it when the content is redrawn.
    var footEl = content.querySelector(".footer");
    if (footEl) content.parentNode.insertBefore(footEl, content.nextSibling);
    tabsEl.innerHTML = stages.map(function (st, i) {
      return '<div class="stage-tab' + (i === 0 ? " active" : "") + '" data-stage="s' + i + '" role="tab" tabindex="0" aria-selected="' + (i === 0) + '">' + esc(st.name) + "</div>";
    }).join("");
    content.innerHTML = stages.map(function (st, i) {
      var hasCp = st.rounds.some(function (r) { return r.games.some(function (g) { return g.mode.label === "Counterpick"; }); });
      return '<div class="stage-block' + (i === 0 ? " visible" : "") + '" data-stage="s' + i + '">' +
        '<div class="stage-label">' + esc(st.heading || st.name) + "</div>" +
        (st.notes ? '<div class="stage-desc">' + esc(st.notes).replace(/\n/g, "<br>") + "</div>" : "") +
        st.rounds.map(function (rd) {
          return '<div class="round-block"><div class="round-label">' + esc(rd.name) + (rd.format ? ' <span class="bo-tag">' + esc(rd.format) + "</span>" : "") + "</div>" +
            rd.games.map(function (g) {
              return '<div class="match"><div class="game-num">' + esc(g.n) + '</div><div class="match-info"><span class="mode-tag mode-' + g.mode.cls + '">' + esc(g.mode.label) + "</span>" +
                (g.map ? '<span class="map-name">' + esc(g.map) + "</span>" : "") + "</div></div>";
            }).join("") + "</div>";
        }).join("") +
        (safeSrc(st.image) ? '<div class="cp-pool-block"><div class="cp-pool-label">' + (hasCp ? "Counterpick Map Pool" : "Map Pool") + '</div><div class="cp-pool-img-wrap"><img src="' + esc(safeSrc(st.image)) + '" alt="Map pool"></div></div>' : "") +
        "</div>";
    }).join("");
    var tabs = tabsEl.querySelectorAll(".stage-tab"), blocks = content.querySelectorAll(".stage-block");
    function pick(tab) {
      tabs.forEach(function (t) { t.classList.toggle("active", t === tab); t.setAttribute("aria-selected", String(t === tab)); });
      blocks.forEach(function (b) { b.classList.toggle("visible", b.dataset.stage === tab.dataset.stage); });
      content.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    iconize(content);
    tabs.forEach(function (t) {
      t.addEventListener("click", function () { pick(t); });
      t.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(t); } });
    });
  }

  fetch(cfg.sheetCsvUrl, { cache: "no-store" })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); })
    .then(function (t) {
      if (/^\s*</.test(t)) throw new Error("Got a web page, not CSV. Use File > Share > Publish to web > CSV.");
      draw(build(parseCsv(t)));
    })
    .catch(function (e) { console.warn("Map list sheet failed; showing the map list written in the page:", e); });
})();
