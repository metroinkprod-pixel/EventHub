// Shared hub navigation with Log in / Log out on the right. Add to any page with:
//   <script src="/nav.js"></script>   (just before </body>)
// Add data-hubnav="off" to <html> to hide it (e.g. on a TV display).
// Staff links only show on devices that have entered a PIN, and only the ones
// that PIN's level can use (volunteers: My shifts + Check-in).
(function () {
  if (document.documentElement.dataset.hubnav === "off") return;
  var LINKS = [
    { href: "/",             label: "Hub" },
    { href: "/schedule/",    label: "Schedule" },
    { href: "/maps/",        label: "Maps" },
    { href: "/stations/",    label: "Stations" },
    { href: "/matchmaker/",  label: "Free play" },
    { href: "/run-of-show/", label: "Run of show", staff: "staff" },
    { href: "/run-of-show/?view=mine", label: "My shifts", staff: "volunteer" },
    { href: "/checkin/",     label: "Check-in", staff: "volunteer" },
    { href: "/matchmaker/#staff", label: "Free play staff", staff: "staff" }
  ];
  var RANK = { volunteer: 1, staff: 2, owner: 3 }, NAMES = { volunteer: "Volunteer", staff: "Staff", owner: "Owner" };
  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function level() { return get("ops-pin") ? (RANK[get("ops-role")] || 1) : 0; }

  var path = location.pathname.replace(/index\.html$/, "");
  if (path.length > 1 && !path.endsWith("/")) path += "/";
  var here = path + location.search + location.hash;
  var R = "var(--t-radius-sm,6px)";
  var css = document.createElement("style");
  css.textContent =
    ".hubnav{position:relative;z-index:50;display:flex;align-items:center;gap:8px;" +
    "padding:calc(env(safe-area-inset-top,0px) + 6px) 10px 6px;background:var(--t-bg-deep,#0b1220);border-bottom:1px solid var(--t-line,#26324a);" +
    "font:700 14px/1.2 var(--t-font,Arial,sans-serif);letter-spacing:.04em;text-transform:uppercase}" +
    ".hubnav .hubnav-links{display:flex;gap:2px;align-items:center;overflow-x:auto;scrollbar-width:none;flex:1;min-width:0}" +
    ".hubnav .hubnav-links::-webkit-scrollbar{display:none}" +
    ".hubnav a{color:var(--t-muted,#b8c4d8);text-decoration:none;padding:7px 11px;border-radius:" + R + ";white-space:nowrap}" +
    ".hubnav a:hover{background:var(--t-surface-2,#1a2438);color:var(--t-ink,#fff)}" +
    ".hubnav a[aria-current=page]{background:var(--t-accent,#e8edf5);color:var(--t-accent-ink,#0b1220)}" +
    ".hubnav .sep{width:1px;align-self:stretch;margin:4px 6px;background:var(--t-line,#26324a);flex:none}" +
    ".hubnav:not(.is-staff) .staff{display:none}" +
    ".hubnav .auth{flex:none;font:inherit;letter-spacing:inherit;text-transform:inherit;cursor:pointer;white-space:nowrap;padding:7px 12px;border-radius:" + R + ";" +
    "border:1px solid var(--t-line,#26324a);background:none;color:var(--t-ink,#fff)}" +
    ".hubnav .auth:hover{border-color:var(--t-accent,#fff)}" +
    ".hubnav .auth.on{color:var(--t-muted,#b8c4d8)}" +
    ".hubnav .auth small{font-size:11px;color:var(--t-warn,#f2b04f);margin-right:6px}" +
    // PIN dialog, so it looks the same on every page
    "dialog.pin{margin:auto;box-sizing:border-box;border:1px solid var(--t-line,#333);border-radius:var(--t-radius,10px);background:var(--t-surface,#1b1b1b);color:var(--t-ink,#fff);padding:20px;width:min(340px,calc(100% - 32px));font-family:var(--t-font,Arial,sans-serif)}" +
    "dialog.pin::backdrop{background:rgb(0 0 0 / .55)}" +
    "dialog.pin h2{margin:0 0 6px;font-size:1.15rem}" +
    "dialog.pin p{margin:0 0 12px;color:var(--t-muted,#aaa);font-size:.9rem}" +
    "dialog.pin .pin-input{width:100%;box-sizing:border-box;font-size:1.4rem;letter-spacing:.3em;text-align:center;padding:8px;border-radius:" + R + ";border:1px solid var(--t-line,#333);background:var(--t-bg,#111);color:var(--t-ink,#fff)}" +
    "dialog.pin .row{display:flex;gap:8px;justify-content:flex-end;margin-top:14px}" +
    "dialog.pin .btn{font:inherit;font-weight:700;padding:7px 14px;border-radius:" + R + ";border:1px solid var(--t-line,#333);background:none;color:var(--t-ink,#fff);cursor:pointer}" +
    "dialog.pin .btn.primary{background:var(--t-accent,#e8602e);border-color:var(--t-accent,#e8602e);color:var(--t-accent-ink,#000)}" +
    "dialog.pin .err{color:var(--t-danger,#ff6b6b);font-size:.9rem;min-height:1.3em;margin-top:8px}";
  document.head.appendChild(css);

  var nav = document.createElement("nav");
  nav.className = "hubnav";
  nav.setAttribute("aria-label", "Event hub");
  var links = document.createElement("div");
  links.className = "hubnav-links";
  nav.appendChild(links);
  var best = null;
  LINKS.forEach(function (l) {
    var u = new URL(l.href, location.origin), key = u.pathname + u.search + u.hash;
    if ((key === here || (u.pathname === path && !u.search && !u.hash)) && (!best || key.length > best.length) && here.indexOf(key) === 0) best = key;
  });
  var addedSep = false;
  LINKS.forEach(function (l) {
    if (l.staff && !addedSep) { var s = document.createElement("span"); s.className = "sep staff"; links.appendChild(s); addedSep = true; }
    var a = document.createElement("a");
    a.href = l.href; a.textContent = l.label;
    if (l.staff) { a.className = "staff"; a.dataset.need = l.staff; }
    var u = new URL(l.href, location.origin);
    if (u.pathname + u.search + u.hash === best) a.setAttribute("aria-current", "page");
    links.appendChild(a);
  });
  var auth = document.createElement("button");
  auth.type = "button";
  auth.className = "auth";
  nav.appendChild(auth);

  function sync() {
    var lv = level();
    nav.classList.toggle("is-staff", lv > 0);
    links.querySelectorAll("a.staff").forEach(function (a) { a.style.display = lv >= RANK[a.dataset.need] ? "" : "none"; });
    auth.classList.toggle("on", lv > 0);
    auth.innerHTML = lv > 0 ? "<small>" + (NAMES[get("ops-role")] || "Signed in") + "</small>Log out" : "Log in";
    auth.title = lv > 0 ? "Log out of the staff tools on this device" : "Staff and volunteers: enter your PIN";
  }

  // Load the staff helpers on pages that don't have them yet (schedule, maps, free play...).
  function load(src) {
    return new Promise(function (res, rej) { var s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  }
  async function ensureOps() {
    if (window.Ops) return window.Ops;
    if (!window.HUB) await load("/site-config.js");
    if (!window.supabase) await load("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js");
    await load("/shared/ops.js");
    return window.Ops;
  }
  auth.onclick = async function () {
    if (level() > 0) {
      if (window.Ops) window.Ops.lock();
      else {
        try { localStorage.removeItem("ops-pin"); localStorage.removeItem("ops-role"); } catch (e) {}
        try { window.dispatchEvent(new CustomEvent("ops-lock-change", { detail: { unlocked: false } })); } catch (e) {}
      }
      sync();
      return;
    }
    try {
      var O = await ensureOps();
      if (!O || !O.configured) { alert("The staff tools aren’t set up yet (see site-config.js)."); return; }
      O.askPin();
    } catch (e) { alert("Couldn’t load the log-in. Check your connection and try again."); }
  };

  sync();
  window.addEventListener("ops-lock-change", sync);
  window.addEventListener("storage", function (e) { if (e.key === "ops-pin" || e.key === "ops-role") sync(); });
  document.body.insertBefore(nav, document.body.firstChild);
})();
