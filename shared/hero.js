// Fills the schedule / map list header from site-config.js, so each event
// only needs its details changed in one place.
(function () {
  var H = window.HUB || {}, L = H.links || {};
  var name = document.querySelector(".event-name");
  // Heading = page name, e.g. "Big Dapple Schedule" (set by theme.js from shortName in site-config.js)
  if (name && (window.HUB_PAGE_TITLE || H.eventName)) name.textContent = window.HUB_PAGE_TITLE || H.eventName;
  var logo = document.querySelector(".logo-wrap img");
  if (logo && H.logo) { logo.src = H.logo; logo.alt = (H.eventName || "Event") + " logo"; }
  var pills = document.querySelectorAll(".event-meta > .meta-pill");
  function setPill(el, text) {
    if (!el) return;
    if (!text) { el.style.display = "none"; return; }
    var nodes = [].slice.call(el.childNodes).filter(function (n) { return n.nodeType === 3; });
    nodes.forEach(function (n) { n.textContent = ""; });
    el.appendChild(document.createTextNode(" " + text));
  }
  setPill(pills[0], H.eventDate);
  setPill(pills[1], H.location);
  var keys = { twitch: "stream", discord: "discord", twitter: "twitter", bluesky: "bluesky", startgg: "startgg" };
  Object.keys(keys).forEach(function (cls) {
    var a = document.querySelector(".link-pill." + cls);
    if (!a) return;
    var url = L[keys[cls]];
    if (url) a.href = url; else a.style.display = "none";
  });
})();
