// The Supabase JS SDK hangs on page reload after session restore in some
// versions (silently, no error). We keep the SDK only for the auth ceremony
// (signInWithPassword, signOut, onAuthStateChange) and go straight to the
// REST API for every data query. That way a reload is bulletproof: we read
// the JWT out of localStorage and use it directly.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

const REST = SUPABASE_URL.replace(/\/+$/, "") + "/rest/v1";
const PROJECT_REF = new URL(SUPABASE_URL).host.split(".")[0];
const STORAGE_KEY = `sb-${PROJECT_REF}-auth-token`;

// Read the current access_token out of localStorage without touching the
// SDK. Also handles the case where the SDK has stored it as a JSON blob.
export function getAccessToken() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Newer SDK versions wrap it: { currentSession: {...} } or plain.
    return parsed?.access_token || parsed?.currentSession?.access_token || null;
  } catch { return null; }
}

export function getCurrentUserId() {
  const jwt = getAccessToken();
  if (!jwt) return null;
  try {
    const b64 = jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = "=".repeat((4 - (b64.length % 4)) % 4);
    return JSON.parse(atob(b64 + pad)).sub || null;
  } catch { return null; }
}

// Direct-fetch REST call. Reads the JWT fresh each time from localStorage.
export async function apiFetch(path, { method = "GET", body, headers, signal, prefer = "return=representation" } = {}) {
  const jwt = getAccessToken();
  const auth = jwt ? `Bearer ${jwt}` : `Bearer ${SUPABASE_ANON_KEY}`;
  return fetch(REST + path, {
    method,
    signal,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: auth,
      "Content-Type": "application/json",
      Prefer: prefer,
      ...(headers || {}),
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
}

export async function apiJson(path, opts) {
  const r = await apiFetch(path, opts);
  const text = await r.text();
  if (!r.ok) {
    let msg = text.slice(0, 300);
    try { const j = JSON.parse(text); msg = j.message || j.error || msg; } catch {}
    throw new Error(`${opts?.method || "GET"} ${path}: ${r.status} ${msg}`);
  }
  return text ? JSON.parse(text) : null;
}
