// Backup schedule, used when no Google Sheet is set in site-config.js
// (or if the sheet can't be loaded). One line per item:
//   day      heading the item goes under (items with the same day are grouped)
//   start    e.g. "11:00 AM"
//   end      optional, e.g. "12:00 PM"
//   title    what attendees see
//   details  optional smaller line underneath
//   type     main | general | social | side | end   (sets the badge)
window.SCHEDULE_ITEMS = [
  { day: "Event day", start: "11:00 AM", end: "12:00 PM", title: "Doors open & check-in", details: "Check in your team at the T.O. desk", type: "general" },
  { day: "Event day", start: "11:30 AM", end: "12:00 PM", title: "Wave A check-in & warmup", details: "Team warmup and station assignment", type: "main" },
  { day: "Event day", start: "12:00 PM", end: "1:30 PM", title: "Wave A pools", details: "Pools A1 and A2, rounds 1 to 3", type: "main" },
  { day: "Event day", start: "1:00 PM", end: "1:30 PM", title: "Wave B check-in", details: "Team warmup and station assignment", type: "main" },
  { day: "Event day", start: "1:30 PM", end: "3:00 PM", title: "Wave B pools", details: "Pools B1 and B2, rounds 1 to 3", type: "main" },
  { day: "Event day", start: "2:10 PM", end: "2:50 PM", title: "Silver & Bronze check-in", type: "main" },
  { day: "Event day", start: "2:30 PM", end: "4:30 PM", title: "Silver bracket", details: "Semifinals and finals on stream", type: "main" },
  { day: "Event day", start: "3:00 PM", end: "4:30 PM", title: "Bronze bracket", type: "main" },
  { day: "Event day", start: "4:30 PM", end: "4:45 PM", title: "Group photo", details: "Follow organizer instructions", type: "social" },
  { day: "Event day", start: "4:45 PM", end: "4:55 PM", title: "Costume contest winner", type: "social" },
  { day: "Event day", start: "4:50 PM", end: "7:05 PM", title: "Top 8 round robin", details: "Three rounds on stream", type: "main" },
  { day: "Event day", start: "7:20 PM", end: "8:00 PM", title: "Finals", type: "main" },
  { day: "Event day", start: "7:40 PM", end: "8:10 PM", title: "Medal ceremony & wrap-up", details: "Awards, prizes and closing remarks", type: "end" }
];
