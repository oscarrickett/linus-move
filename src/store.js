// Thin data layer. Auth uses the Supabase SDK; every query hits the REST
// API directly via apiJson (reads the JWT from localStorage each call).

import { supabase, apiJson, apiFetch, getAccessToken, getCurrentUserId } from "./supabase.js";

// ---------- Session / profile ----------------------------------------------
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signUp(email, password, displayName, role) {
  const { data, error } = await supabase.auth.signUp({
    email, password,
    options: { data: { display_name: displayName, role } },
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  try { await supabase.auth.signOut(); } catch {}
  // Belt-and-braces: also clear the storage in case SDK signOut hangs.
  try {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith("sb-") || k.includes("supabase")) localStorage.removeItem(k);
    }
  } catch {}
}

// Synchronous session presence check.
export function hasSession() { return !!getAccessToken(); }

// Async wrapper so existing callers work; never hangs.
export async function currentSession() {
  const jwt = getAccessToken();
  const uid = getCurrentUserId();
  return jwt && uid ? { access_token: jwt, user: { id: uid } } : null;
}

export async function currentProfile() {
  const uid = getCurrentUserId();
  if (!uid) return null;
  const rows = await apiJson(`/profiles?select=*&id=eq.${uid}`);
  return rows?.[0] || null;
}

export function onAuthChange(fn) {
  return supabase.auth.onAuthStateChange((_ev, session) => fn(session));
}

// ---------- Reference data --------------------------------------------------
export async function loadPhases() {
  return await apiJson("/phases?select=*&order=sort_order.asc");
}
export async function loadCategories() {
  return await apiJson("/categories?select=*&order=sort_order.asc");
}
export async function loadProfiles() {
  return await apiJson("/profiles?select=id,display_name,role");
}

// ---------- Tasks -----------------------------------------------------------
export async function loadTasks() {
  return await apiJson("/tasks?select=*&order=updated_at.desc");
}
export async function loadDependencies() {
  return await apiJson("/task_dependencies?select=*");
}
export async function loadTask(id) {
  const rows = await apiJson(`/tasks?select=*&id=eq.${encodeURIComponent(id)}`);
  return rows?.[0] || null;
}
export async function updateTask(id, patch) {
  const rows = await apiJson(`/tasks?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: patch });
  return rows?.[0];
}
export async function createTask(fields) {
  const rows = await apiJson("/tasks", { method: "POST", body: fields });
  return rows?.[0];
}
export async function deleteTask(id) {
  await apiJson(`/tasks?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
}

// ---------- Subtasks --------------------------------------------------------
export async function loadSubtasks(taskId) {
  return await apiJson(`/subtasks?task_id=eq.${taskId}&order=sort_order.asc`);
}
export async function addSubtask(taskId, title) {
  const rows = await apiJson("/subtasks", { method: "POST", body: { task_id: taskId, title } });
  return rows?.[0];
}
export async function toggleSubtask(id, done) {
  await apiJson(`/subtasks?id=eq.${id}`, { method: "PATCH", body: { done } });
}
export async function deleteSubtask(id) {
  await apiJson(`/subtasks?id=eq.${id}`, { method: "DELETE" });
}

// ---------- Comments --------------------------------------------------------
export async function loadComments(taskId) {
  return await apiJson(`/comments?task_id=eq.${taskId}&order=created_at.asc`);
}
export async function addComment(taskId, authorId, body) {
  const rows = await apiJson("/comments", { method: "POST", body: { task_id: taskId, author_id: authorId, body } });
  return rows?.[0];
}

// ---------- Links -----------------------------------------------------------
export async function loadLinks(taskId) {
  const filter = taskId ? `task_id=eq.${taskId}` : `task_id=is.null`;
  return await apiJson(`/links?${filter}&order=created_at.asc`);
}
export async function addLink({ task_id = null, label, url, is_official = false }) {
  const rows = await apiJson("/links", { method: "POST", body: { task_id, label, url, is_official } });
  return rows?.[0];
}
export async function deleteLink(id) {
  await apiJson(`/links?id=eq.${id}`, { method: "DELETE" });
}

// ---------- Info records ----------------------------------------------------
export async function loadInfoRecords() {
  return await apiJson("/info_records?select=*&order=updated_at.desc");
}
export async function upsertInfoRecord(row) {
  if (row.id) {
    const rows = await apiJson(`/info_records?id=eq.${row.id}`, {
      method: "PATCH",
      body: { key: row.key, value: row.value, notes: row.notes, visibility: row.visibility },
    });
    return rows?.[0];
  }
  const rows = await apiJson("/info_records", {
    method: "POST",
    body: { key: row.key, value: row.value, notes: row.notes, visibility: row.visibility },
  });
  return rows?.[0];
}
export async function deleteInfoRecord(id) {
  await apiJson(`/info_records?id=eq.${id}`, { method: "DELETE" });
}

// ---------- Contacts --------------------------------------------------------
export async function loadContacts() {
  return await apiJson("/contacts?select=*&order=name.asc");
}
export async function upsertContact(row) {
  if (row.id) {
    const rows = await apiJson(`/contacts?id=eq.${row.id}`, { method: "PATCH", body: row });
    return rows?.[0];
  }
  const rows = await apiJson("/contacts", { method: "POST", body: row });
  return rows?.[0];
}
export async function deleteContact(id) {
  await apiJson(`/contacts?id=eq.${id}`, { method: "DELETE" });
}

// ---------- Realtime --------------------------------------------------------
// Best-effort: the SDK realtime channel may still work; if not, callers
// still function fine without live updates.
export function subscribeTaskChanges(fn) {
  try {
    const chan = supabase.channel("tasks-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, p => fn(p))
      .subscribe();
    return () => { try { supabase.removeChannel(chan); } catch {} };
  } catch { return () => {}; }
}
export function subscribeCommentsForTask(taskId, fn) {
  try {
    const chan = supabase.channel(`comments-live-${taskId}`)
      .on("postgres_changes",
          { event: "INSERT", schema: "public", table: "comments", filter: `task_id=eq.${taskId}` },
          p => fn(p.new))
      .subscribe();
    return () => { try { supabase.removeChannel(chan); } catch {} };
  } catch { return () => {}; }
}
