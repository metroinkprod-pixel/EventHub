// ===================================================================
//  EVENT HUB SETTINGS: the one file to edit for each event.
// ===================================================================
window.HUB = {
  eventName: "Big Dapple",                       // shown on the hub and staff tools
  eventDate: "November 7th, 2026",                                // e.g. "Saturday, Dec 5"
  location: "OSNYC - Chinatown",
  logo: "/assets/EventLogo.png",
  theme: "halloween",      // or "gridlock", "winter", "neon"
  themeColors: {},         // optional tweaks, e.g. { accent: "#ff7a1a", highlight: "#ffd23f" }
  schedule: {
    sheetCsvUrl: "https://docs.google.com/spreadsheets/d/e/2PACX-1vTxJHWk7ezAlQqyBteElG9YFFL3Ut_napJK-PW6Mjg4NeHvcoPdkFYEg18lAncZL8Fq07A_sGbmVXX4/pub?gid=1526195846&single=true&output=csv",
    footnote: "Schedule is subject to bracket performance. Times Times assume every map in a set is played."
  },
         // Map list from a Google Sheet (same "Publish to web" CSV steps). Leave "" to use maps/index.html as written.
   maps: {
     sheetCsvUrl: "https://docs.google.com/spreadsheets/d/e/2PACX-1vRd78H5aMviESTcSKAd4wxECqMh390r7u02SrWPDAadQS6U4ONQX-n3tONb1G7iGw6OYzca4wb8wXuC/pub?gid=1656499915&single=true&output=csv"
   },
  // Supabase project for Run of Show + Check-in (NOT the matchmaker's project).
  // Supabase > Project Settings > API: Project URL and the anon / publishable key.
  // The anon key is meant to be public; edits are protected by the staff PIN.
  ops: {
    SUPABASE_URL: "https://vciynxamtqfimsdgrkli.supabase.co",
    SUPABASE_ANON_KEY: "sb_publishable_LzIJLHgEmD04ouXRw0VO3w_n5wlaxBT"
  },
 // "Today's activities" on the hub page. Remove the list (or leave it empty) to hide the section.
 //   title (required), text, when, link, linkText, main: true (marks the main event), tag (small label)
   // "Today's activities" on the hub page (replaces the plain page links when set).
   //   title (required), text, when, main: true (the main event card, shown first), tag (small label)
   //   links: [{ text, href }, ...]  buttons; the first one is the bold one
   //   Activities without links are listed in a short "Also today" box underneath.
   activities: [
     { title: "4v4 Splatoon Tournament", main: true, text: "The main event. Find your wave on the schedule, each round's maps on the map list, and live matches on the station board.",
       links: [{ text: "Schedule", href: "/schedule/" }, { text: "Map list", href: "/maps/" }, { text: "Station board", href: "/stations/" }] },
     { title: "Free Play", text: "Scrims on open stations all day. Check in and get matched.", links: [{ text: "Check in", href: "/matchmaker/" }] },
     { title: "Costume Contest", text: "Submit your costume and vote for your favorites.", links: [{ text: "Enter or vote", href: "https://pollunit.com/polls/8a2HTqpgBqM5LnnRzhO8AA" }] },
     { title: "Fantasy Brackets", text: "Pick up a fantasy bracket at the T.O. desk." },
     { title: "Art Show", text: "Check out the art on display throughout the venue." },
     { title: "Merch Desk", text: "Shirts, stickers and more past the stage area." }
   ],  // Links shown on the hub home page. Leave a link "" to hide it.
  links: {
    stream:  "https://twitch.tv/GenGame",
    discord: "https://discord.gg/X5SWeJtX7h",
    startgg: "https://start.gg/bigdapple",
    twitter: "https://twitter.com/metro_ink",
    bluesky: "https://bsky.app/profile/metroink.bsky.social"
  }
};
