// ===================================================================
//  EVENT HUB SETTINGS: the one file to edit for each event.
// ===================================================================
window.HUB = {
  eventName: "Big Dapple",                      // shown in footers and on the staff tools
  shortName: "Big Dapple",                      // page titles: "Big Dapple Schedule", "Big Dapple Event Hub", ...
  eventDate: "November 7th, 2026",
  location: "OSNYC - Chinatown",
  logo: "/assets/EventLogo.png",
  theme: "halloween",                           // or "gridlock", "winter", "neon"
  themeColors: {},                              // optional tweaks, e.g. { accent: "#ff7a1a", highlight: "#ffd23f" }

  // Public schedule from a Google Sheet (File > Share > Publish to web > CSV)
  schedule: {
    sheetCsvUrl: "https://docs.google.com/spreadsheets/d/e/2PACX-1vTxJHWk7ezAlQqyBteElG9YFFL3Ut_napJK-PW6Mjg4NeHvcoPdkFYEg18lAncZL8Fq07A_sGbmVXX4/pub?gid=1526195846&single=true&output=csv",
    footnote: "Schedule is subject to bracket performance. Times assume every map in a set is played."
  },

  // Map list from a Google Sheet (same "Publish to web" CSV steps). Leave "" to use maps/index.html as written.
  maps: {
    sheetCsvUrl: "https://docs.google.com/spreadsheets/d/e/2PACX-1vRd78H5aMviESTcSKAd4wxECqMh390r7u02SrWPDAadQS6U4ONQX-n3tONb1G7iGw6OYzca4wb8wXuC/pub?gid=1656499915&single=true&output=csv"
  },

  // Supabase project for Run of Show + Check-in (NOT the matchmaker's project).
  // The anon key is meant to be public; edits are protected by the PINs.
  ops: {
    SUPABASE_URL: "https://vciynxamtqfimsdgrkli.supabase.co",
    SUPABASE_ANON_KEY: "sb_publishable_LzIJLHgEmD04ouXRw0VO3w_n5wlaxBT"
  },

  // Pickup games page (/matchmaker/): its name in the menu and tab.
  // Opening hours are set by staff on that page (Staff > Settings > Opening hours);
  // the times here are only a fallback.
  scrims: { name: "Organized Pickup Games", opens: "", closes: "", date: "", closedText: "" },
   floorplan: [
     { title: "Floor plan", src: "/assets/floorplan.png" },
     { title: "Console layout", sheet: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQVdfPsFDMS_Ita-AdyocblmIt0RJ7_Xedz4BkzBFqzxxvEKj951B6oQBr4f5QRtHEjPtwuMAb7Phpw/pubhtml?gid=1080238690&single=true" }
   ],
  // "Today's activities" on the hub page.
  //   title (required), text, when, main: true (the main event card, shown first), tag (small label)
  //   links: [{ text, href }, ...]  buttons
  //   Activities without links are listed in a short "Also today" box underneath.
  activities: [
    { title: "Splatoon Tournament", main: true, text: "Find your wave on the schedule, each round's maps on the map list, and live matches on the station board.",
      links: [{ text: "Schedule", href: "/schedule/" }, { text: "Map list", href: "/maps/" }, { text: "Station board", href: "/stations/" }] },
    { title: "Organized Pickup Games", text: "Organize a pickup scrim on an open station. Check in, get paired and matched up with others.", links: [{ text: "Check in", href: "/matchmaker/" }] },
    { title: "Costume Contest", text: "Submit your costume and vote for your favorites.", links: [{ text: "Enter or vote", href: "https://pollunit.com/polls/8a2HTqpgBqM5LnnRzhO8AA" }] },
    { title: "Fantasy Brackets", text: "Pick up a fantasy bracket at the T.O. desk. Predict Top 8 match outcomes accurately to win $50!" },
    { title: "Art Show", text: "Check out the art on display throughout the venue!" },
    { title: "Merch Desk", text: "Posters, Light stands, stickers and more past the stage area!" }
  ],

  // Social / link buttons on the hub, schedule and map list. Leave a link "" to hide it.
  links: {
    stream:  "https://twitch.tv/GenGame",
    discord: "https://discord.gg/X5SWeJtX7h",
    startgg: "https://start.gg/bigdapple",
    twitter: "https://twitter.com/metro_ink",
    bluesky: "https://bsky.app/profile/metroink.bsky.social"
  }
};
