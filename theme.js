// Applies the event theme from site-config.js before the page draws.
//   theme: "halloween"                        (name of a block in theme.css)
//   themeColors: { accent: "#ea602e" }        (optional: override single colors)
// Preview without changing anything: add ?theme=winter to any page address.
(function () {
  var H = window.HUB || {};
  var name = "";
  try { name = new URLSearchParams(location.search).get("theme") || ""; } catch (e) {}
  name = name || H.theme || "halloween";
  var root = document.documentElement;
  root.setAttribute("data-theme", name);
  var c = H.themeColors || {};
  Object.keys(c).forEach(function (k) {
    if (c[k]) root.style.setProperty("--t-" + k.replace(/[A-Z]/g, function (m) { return "-" + m.toLowerCase(); }), c[k]);
  });
})();
