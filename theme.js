// Applies the event theme from site-config.js before the page draws.
//   theme: "halloween"                        (name of a block in theme.css)
//   themeColors: { accent: "#ea602e" }        (optional: override single colors)
//   font: "Barlow"                            (optional: any Google Font name, used on every page)
//   favicon: "/assets/favicon.png"            (the browser-tab logo for every page)
// Preview without changing anything: add ?theme=winter to any page address.
(function () {
  var H = window.HUB || {};
  var name = "";
  try { name = new URLSearchParams(location.search).get("theme") || ""; } catch (e) {}
  name = name || H.theme || "halloween";
  var root = document.documentElement;
  root.setAttribute("data-theme", name);
  if (H.font) {
    root.style.setProperty("--t-font", '"' + H.font.replace(/"/g, "") + '", Arial, sans-serif');
    if (!/^(arial|helvetica|system-ui|sans-serif)$/i.test(H.font)) {
      var l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = "https://fonts.googleapis.com/css2?family=" + encodeURIComponent(H.font).replace(/%20/g, "+") + ":wght@400;500;600;700;800&display=swap";
      document.head.appendChild(l);
    }
  }
  // Page names, e.g. "Big Dapple Schedule". Uses shortName (or eventName) from site-config.js.
  // No shortName? Use eventName without a trailing "Event Hub" / "Hub" ("Big Dapple Event Hub" -> "Big Dapple").
  var short = (H.shortName || String(H.eventName || "Event").replace(/\s*[-–—:|·]?\s*(event\s*)?hub\s*$/i, "")).trim() || "Event";
  var PAGES = { "/": short + " Event Hub", "/schedule/": short + " Schedule", "/maps/": short + " Map List",
                "/stations/": short + " Stations", "/matchmaker/": short + " " + ((H.scrims && H.scrims.name) || "Free Play"), "/run-of-show/": short + " Run of Show",
                "/checkin/": short + " Check-in" };
  var p = location.pathname.replace(/index\.html$/, "");
  if (p.length > 1 && !p.endsWith("/")) p += "/";
  var pageTitle = PAGES[p];
  if (pageTitle) {
    window.HUB_PAGE_TITLE = pageTitle;
    document.title = pageTitle;
    // Some pages (free play) set their own title later; keep ours.
    new MutationObserver(function () { if (document.title !== pageTitle) document.title = pageTitle; })
      .observe(document.head, { subtree: true, childList: true, characterData: true });
  }
  // One browser-tab logo for every page (replaces any page's own icon).
  var icon = H.favicon || "/assets/favicon.png";
  [].slice.call(document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]')).forEach(function (l) { l.remove(); });
  [["icon", icon], ["apple-touch-icon", icon]].forEach(function (x) {
    var l = document.createElement("link"); l.rel = x[0]; l.href = x[1]; document.head.appendChild(l);
  });
  var c = H.themeColors || {};
  Object.keys(c).forEach(function (k) {
    if (c[k]) root.style.setProperty("--t-" + k.replace(/[A-Z]/g, function (m) { return "-" + m.toLowerCase(); }), c[k]);
  });
})();
