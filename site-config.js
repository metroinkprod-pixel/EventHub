// ===================================================================
//  EVENT HUB SETTINGS: the one file to edit for each event.
// ===================================================================
window.HUB = {
  eventName: "Big Dapple Event Hub",                       // shown on the hub and staff tools
  eventDate: "November 7th, 2026",                                // e.g. "Saturday, Dec 5"

  // Supabase project for Run of Show + Check-in (NOT the matchmaker's project).
  // Supabase > Project Settings > API: Project URL and the anon / publishable key.
  // The anon key is meant to be public; edits are protected by the staff PIN.
  ops: {
    SUPABASE_URL: "https://vciynxamtqfimsdgrkli.supabase.co",
    SUPABASE_ANON_KEY: "sb_publishable_LzIJLHgEmD04ouXRw0VO3w_n5wlaxBT"
  },

  // Links shown on the hub home page. Leave a link "" to hide it.
  links: {
    stream:  "https://twitch.tv/GenGame",
    discord: "https://discord.gg/X5SWeJtX7h",
    startgg: "https://start.gg/bigdapple"
  }
};
