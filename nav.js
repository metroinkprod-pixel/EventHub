// Shared hub navigation. Add to any page with:
//   <script src="/nav.js" defer></script>
// Add data-hubnav="off" to <html> to hide it (e.g. on a TV display).
// Staff links only show on devices that have entered the staff PIN.
(function () {
  if (document.documentElement.dataset.hubnav === "off") return;
  var LINKS = [
    { href: "/",             label: "Hub" },
    { href: "/schedule/",    label: "Schedule" },
    { href: "/maps/",        label: "Maps" },
    { href: "/stations/",    label: "Stations" },
    { href: "/matchmaker/",  label: "Free play" },
    { href: "/run-of-show/", label: "Run of show", staff: true },
    { href: "/run-of-show/?view=mine", label: "My shifts", staff: true },
    { href: "/checkin/",     label: "Check-in", staff: true },
    { href: "/matchmaker/#staff", label: "Free play staff", staff: true }
  ];
  function isStaff() { try { return !!localStorage.getItem("ops-pin"); } catch (e) { return false; } }
  var path = location.pathname.replace(/index\.html$/, "");
  if (path.length > 1 && !path.endsWith("/")) path += "/";
  var here = path + location.search + location.hash;
  var css = document.createElement("style");
  css.textContent =
    ".hubnav{position:relative;z-index:50;display:flex;gap:2px;align-items:center;overflow-x:auto;scrollbar-width:none;" +
    "padding:calc(env(safe-area-inset-top,0px) + 6px) 10px 6px;background:#0b1220;border-bottom:1px solid #26324a;" +
    "font:600 14px/1.2 system-ui,-apple-system,'Segoe UI',sans-serif}" +
    ".hubnav::-webkit-scrollbar{display:none}" +
    ".hubnav a{color:#b8c4d8;text-decoration:none;padding:7px 11px;border-radius:8px;white-space:nowrap}" +
    ".hubnav a:hover{background:#1a2438;color:#fff}" +
    ".hubnav a[aria-current=page]{background:#e8edf5;color:#0b1220}" +
    ".hubnav .sep{width:1px;align-self:stretch;margin:4px 6px;background:#26324a;flex:none}" +
    ".hubnav a.staff::before{content:'';display:inline-block;width:6px;height:6px;border-radius:50%;background:#f2b04f;margin-right:6px;vertical-align:middle}" +
    ".hubnav:not(.is-staff) .staff{display:none}";
  document.head.appendChild(css);
  var nav = document.createElement("nav");
  nav.className = "hubnav";
  nav.setAttribute("aria-label", "Event hub");
  var addedSep = false;
  // Pick the most specific matching link as the current page.
  var best = null;
  LINKS.forEach(function (l) {
    var u = new URL(l.href, location.origin), key = u.pathname + u.search + u.hash;
    if ((key === here || (u.pathname === path && !u.search && !u.hash)) && (!best || key.length > best.length) && here.indexOf(key) === 0) best = key;
  });
  LINKS.forEach(function (l) {
    if (l.staff && !addedSep) { var s = document.createElement("span"); s.className = "sep staff"; nav.appendChild(s); addedSep = true; }
    var a = document.createElement("a");
    a.href = l.href; a.textContent = l.label;
    if (l.staff) a.className = "staff";
    var u = new URL(l.href, location.origin);
    if (u.pathname + u.search + u.hash === best) a.setAttribute("aria-current", "page");
    nav.appendChild(a);
  });
  function sync() { nav.classList.toggle("is-staff", isStaff()); }
  sync();
  window.addEventListener("ops-lock-change", sync);
  window.addEventListener("storage", function (e) { if (e.key === "ops-pin") sync(); });
  document.body.insertBefore(nav, document.body.firstChild);
})();
