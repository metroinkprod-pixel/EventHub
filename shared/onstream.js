// "On stream" bar along the bottom of the page: shows the match on the mainstage
// station (from the station board's start.gg feed). Hidden when nothing is on stream.
// Add to a page with:  <script src="/shared/onstream.js"></script>
(function () {
  if (document.documentElement.dataset.hubnav === "off") return;
  var H = window.HUB || {}, stream = (H.links || {}).stream || "";
  var css = document.createElement("style");
  css.textContent =
    ".onstream{position:fixed;left:0;right:0;bottom:0;z-index:45;display:flex;align-items:center;gap:10px;" +
    "padding:8px 12px calc(8px + env(safe-area-inset-bottom,0px));background:var(--t-bg-deep,#0c0c0c);border-top:1px solid var(--t-line,#333);" +
    "font:600 14px/1.3 var(--t-font,Arial,sans-serif);color:var(--t-ink-2,#ddd);text-decoration:none}" +
    ".onstream[hidden]{display:none}" +
    ".onstream .badge{flex:none;background:#9146ff;color:#fff;font-weight:800;font-size:12px;letter-spacing:.06em;padding:3px 8px;border-radius:var(--t-radius-sm,6px)}" +
    ".onstream .txt{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
    // Ticker: only when the text doesn't fit, it slides left to show the rest, pauses, and slides back.
    ".onstream .txt.scroll{text-overflow:clip;mask-image:linear-gradient(90deg,#000 92%,transparent);-webkit-mask-image:linear-gradient(90deg,#000 92%,transparent)}" +
    ".onstream .txt .in{display:inline-block}" +
    ".onstream .txt.scroll .in{animation:os-tick var(--os-dur,8s) ease-in-out infinite alternate}" +
    "@keyframes os-tick{0%,15%{transform:translateX(0)}85%,100%{transform:translateX(var(--os-dx,0))}}" +
    "@media (prefers-reduced-motion:reduce){.onstream .txt.scroll{text-overflow:ellipsis;mask-image:none;-webkit-mask-image:none}.onstream .txt.scroll .in{animation:none}}" +
    ".onstream .txt b{color:var(--t-ink,#fff)}" +
    ".onstream .go{flex:none;color:#b18cff;font-weight:700}" +
    "body.has-onstream{padding-bottom:calc(48px + env(safe-area-inset-bottom,0px))}" +
    "body.has-onstream .toast,body.has-onstream #ops-conn{bottom:calc(58px + env(safe-area-inset-bottom,0px)) !important}";
  document.head.appendChild(css);
  var bar = document.createElement(stream ? "a" : "div");
  bar.className = "onstream"; bar.hidden = true; bar.setAttribute("aria-live", "polite");
  if (stream) { bar.href = stream; bar.target = "_blank"; bar.rel = "noopener"; }
  bar.innerHTML = '<span class="badge">ON STREAM</span><span class="txt"><span class="in"></span></span>' + (stream ? '<span class="go">Watch ›</span>' : "");
  document.body.appendChild(bar);
  var txt = bar.querySelector(".txt"), inner = bar.querySelector(".in"), lastHtml = "";
  function fit() {
    txt.classList.remove("scroll");
    var over = inner.scrollWidth - txt.clientWidth;
    if (over > 4) {
      var dx = over + 24;                                   // a little extra so the end isn't under the fade
      txt.style.setProperty("--os-dx", -dx + "px");
      txt.style.setProperty("--os-dur", Math.max(4, dx / 35 + 2).toFixed(1) + "s");   // ~35px per second
      txt.classList.add("scroll");
    }
  }
  var rt = null;
  window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(fit, 150); });
  function esc(x) { return String(x == null ? "" : x).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  async function tick() {
    if (document.hidden) return;
    try {
      var r = await fetch("/api/bracket");
      if (!r.ok) throw 0;
      var sets = await r.json();
      var s = Array.isArray(sets) && sets.find(function (x) { return x.station === "M"; });
      if (!s) throw 0;
      var html = "<b>" + esc(s.team1.name) + " vs " + esc(s.team2.name) + "</b> · " + esc(s.round) +
        (s.team1.score || s.team2.score ? " · " + esc(s.team1.score) + "–" + esc(s.team2.score) : "");
      var wasHidden = bar.hidden;
      bar.hidden = false; document.body.classList.add("has-onstream");
      if (html !== lastHtml || wasHidden) { lastHtml = html; inner.innerHTML = html; fit(); }   // don't restart the ticker if nothing changed
    } catch (e) { bar.hidden = true; document.body.classList.remove("has-onstream"); }
  }
  tick();
  setInterval(tick, 20000);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) tick(); });
})();
