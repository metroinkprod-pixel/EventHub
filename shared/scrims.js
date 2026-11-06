// Opening hours for the scrims / free play page (matchmaker), from site-config.js:
//   scrims: { name: "Organized Scrims", opens: "5:00 PM", closes: "", date: "", closedText: "" }
// Used by the hub card and the scrims page. Times are the device's local time.
(function () {
  var cfg = (window.HUB && window.HUB.scrims) || {};
  function parse(s) {
    s = String(s || "").trim().toUpperCase();
    var m = /^(\d{1,2})(?::(\d{2}))?\s*([AP])\.?M?\.?$/.exec(s);
    if (m) return (+m[1]) % 12 * 60 + (m[3] === "P" ? 720 : 0) + (+(m[2] || 0));
    m = /^(\d{1,2}):(\d{2})$/.exec(s);
    return m ? (+m[1]) * 60 + (+m[2]) : null;
  }
  function fmt(min) {
    var h = Math.floor(min / 60) % 24, m = min % 60;
    return ((h % 12) || 12) + ":" + String(m).padStart(2, "0") + " " + (h < 12 ? "AM" : "PM");
  }
  function today() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  window.HubScrims = {
    name: cfg.name || "Free Play",
    configured: !!(cfg.opens || cfg.closes),
    // { open, label, short }  label: for the page ("Opens at 5:00 PM"), short: for buttons ("Opens 5:00 PM")
    status: function () {
      var opens = parse(cfg.opens), closes = parse(cfg.closes);
      var d = new Date(), now = d.getHours() * 60 + d.getMinutes();
      var day = /^\d{4}-\d{2}-\d{2}$/.test(cfg.date || "") ? cfg.date : null;
      if (day && today() < day) {
        var nice = new Date(day + "T12:00:00").toLocaleDateString([], { month: "short", day: "numeric" });
        return { open: false, label: "Opens " + nice + (opens != null ? " at " + fmt(opens) : ""), short: "Opens " + nice };
      }
      if (day && today() > day) return { open: false, label: "Closed", short: "Closed", over: true };
      if (opens != null && now < opens) return { open: false, label: "Opens at " + fmt(opens), short: "Opens " + fmt(opens), opensAt: fmt(opens) };
      if (closes != null && now >= closes) return { open: false, label: "Closed for today", short: "Closed", over: true };
      return { open: true, label: closes != null ? "Open until " + fmt(closes) : "Open now", short: "Open now" };
    },
    closedText: cfg.closedText || ""
  };
})();
