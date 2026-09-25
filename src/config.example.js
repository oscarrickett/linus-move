// Copy this file to config.js and fill in the two values from your Supabase project.
// (Project settings > API. The anon key is the "public" key and is safe to commit,
// but keeping config.js gitignored lets you swap projects without touching git.)

export const SUPABASE_URL      = "https://YOUR-PROJECT.supabase.co";
export const SUPABASE_ANON_KEY = "YOUR-ANON-KEY";

// Target move date. Home countdown reads this.
export const MOVE_DATE = "2027-02-15";

// Optional: friendly names for the two roles used by the app.
export const ROLE_LABELS = {
  linus:  "Linus",
  helper: "Oscar",
  family: "Family",
};
