// Track the latest v2 line via esm.sh. Newer versions fix a "Cannot read
// properties of null (reading 'length')" throw in GoTrueClient that hangs
// every request when combined with sb_publishable_* keys + stale sessions.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
