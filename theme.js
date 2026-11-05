// Applies the event theme from site-config.js before the page draws.
//   theme: "halloween"                        (name of a block in theme.css)
//   themeColors: { accent: "#ea602e" }        (optional: override single colors)
//   font: "Barlow"                            (optional: any Google Font name, used on every page)
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
  var c = H.themeColors || {};
  Object.keys(c).forEach(function (k) {
    if (c[k]) root.style.setProperty("--t-" + k.replace(/[A-Z]/g, function (m) { return "-" + m.toLowerCase(); }), c[k]);
  });
})();
