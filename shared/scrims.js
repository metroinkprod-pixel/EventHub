// Opening hours for the scrims page (matchmaker).
// Staff set them in the scrims page: Staff > Settings > Opening hours (saved in the matchmaker's database).
// site-config.js  scrims: { name, opens, closes, date, closedText }  is the fallback if none are saved there.
// Used by the hub card and the scrims page. Times are the device's local time.
(function () {
  var cfg = (window.HUB && window.HUB.scrims) || {};
  var hours = { opens: cfg.opens || "", closes: cfg.closes || "", date: cfg.date || "" };
  var listeners = [];
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
  var S = window.HubScrims = {
    name: cfg.name || "Free Play",
    closedText: cfg.closedText || "",
    configured: function () { return !!(hours.opens || hours.closes || hours.date); },
    hours: function () { return Object.assign({}, hours); },
    // Hours saved by staff in the matchmaker (empty saved hours = always open)
    setFromSettings: function (st) {
      if (!st || !("opens" in st)) return;            // database not updated yet: keep site-config hours
      hours = { opens: st.opens || "", closes: st.closes || "", date: st.open_date || "" };
      listeners.forEach(function (fn) { try { fn(); } catch (e) {} });
    },
    onChange: function (fn) { listeners.push(fn); },
    // { open, label, short, over }   label for the page ("Opens at 5:00 PM"), short for buttons ("Opens 5:00 PM")
    status: function () {
      var opens = parse(hours.opens), closes = parse(hours.closes);
      var d = new Date(), now = d.getHours() * 60 + d.getMinutes();
      var day = /^\d{4}-\d{2}-\d{2}$/.test(hours.date) ? hours.date : null;
      if (day && today() < day) {
        var nice = new Date(day + "T12:00:00").toLocaleDateString([], { month: "short", day: "numeric" });
        return { open: false, label: "Opens " + nice + (opens != null ? " at " + fmt(opens) : ""), short: "Opens " + nice };
      }
      if (day && today() > day) return { open: false, label: "Closed", short: "Closed", over: true };
      if (opens != null && now < opens) return { open: false, label: "Opens at " + fmt(opens), short: "Opens " + fmt(opens) };
      if (closes != null && now >= closes) return { open: false, label: "Closed for today", short: "Closed", over: true };
      return { open: true, label: closes != null ? "Open until " + fmt(closes) : "Open now", short: "Open now" };
    },
    // Hub page: read the saved hours straight from the matchmaker's database (public, read-only).
    loadFromMatchmaker: function () {
      function go() {
        var c = window.TM_CONFIG;
        if (!c || !c.SUPABASE_URL || /YOUR-/.test(c.SUPABASE_URL)) return;
        fetch(c.SUPABASE_URL.replace(/\/$/, "") + "/rest/v1/settings?id=eq.1&select=*", { headers: { apikey: c.SUPABASE_ANON_KEY, Authorization: "Bearer " + c.SUPABASE_ANON_KEY } })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (rows) { if (rows && rows[0]) S.setFromSettings(rows[0]); })
          .catch(function () {});
      }
      if (window.TM_CONFIG) return go();
      var s = document.createElement("script"); s.src = "/matchmaker/config.js"; s.onload = go; document.head.appendChild(s);
    }
  };
})();
