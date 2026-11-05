// Shared hub navigation. Add to any page with:
//   <script src="/nav.js" defer></script>
// Add data-hubnav="off" to <html> to hide it (e.g. on a TV display).
(function () {
  if (document.documentElement.dataset.hubnav === "off") return;
  var LINKS = [
    { href: "/",             label: "Hub" },
    { href: "/schedule/",    label: "Schedule" },
    { href: "/maps/",        label: "Maps" },
    { href: "/stations/",    label: "Stations" },
    { href: "/matchmaker/",  label: "Free play" },
    { href: "/run-of-show/", label: "Run of show", staff: true },
    { href: "/checkin/",     label: "Check-in", staff: true }
  ];
  var path = location.pathname.replace(/index\.html$/, "");
  if (path.length > 1 && !path.endsWith("/")) path += "/";
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
    ".hubnav a.staff::before{content:'';display:inline-block;width:6px;height:6px;border-radius:50%;background:#f2b04f;margin-right:6px;vertical-align:middle}";
  document.head.appendChild(css);
  var nav = document.createElement("nav");
  nav.className = "hubnav";
  nav.setAttribute("aria-label", "Event hub");
  var addedSep = false;
  LINKS.forEach(function (l) {
    if (l.staff && !addedSep) { var s = document.createElement("span"); s.className = "sep"; nav.appendChild(s); addedSep = true; }
    var a = document.createElement("a");
    a.href = l.href; a.textContent = l.label;
    if (l.staff) a.className = "staff";
    if (path === l.href) a.setAttribute("aria-current", "page");
    nav.appendChild(a);
  });
  document.body.insertBefore(nav, document.body.firstChild);
})();
