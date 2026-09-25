// Thin wrapper around Supabase for the queries the app needs.
// Kept in one file so the storage layer stays swappable.

import { supabase } from "./supabase.js";

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

export async function signOut() { await supabase.auth.signOut(); }

export async function currentSession() {
  const { data } = await supabase.auth.getSession();
  return data?.session || null;
}

export async function currentProfile() {
  const session = await currentSession();
  if (!session) return null;
  const { data, error } = await supabase
    .from("profiles").select("*").eq("id", session.user.id).maybeSingle();
  if (error) throw error;
  return data;
}

export function onAuthChange(fn) {
  return supabase.auth.onAuthStateChange((_ev, session) => fn(session));
}

// ---------- Reference data --------------------------------------------------
export async function loadPhases() {
  const { data, error } = await supabase.from("phases").select("*").order("sort_order");
  if (error) throw error;
  return data || [];
}
export async function loadCategories() {
  const { data, error } = await supabase.from("categories").select("*").order("sort_order");
  if (error) throw error;
  return data || [];
}

// ---------- Tasks -----------------------------------------------------------
export async function loadTasks() {
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function loadDependencies() {
  const { data, error } = await supabase.from("task_dependencies").select("*");
  if (error) throw error;
  return data || [];
}

export async function loadTask(id) {
  const { data, error } = await supabase.from("tasks").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateTask(id, patch) {
  const { data, error } = await supabase
    .from("tasks").update(patch).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function createTask(fields) {
  const { data, error } = await supabase
    .from("tasks").insert(fields).select().single();
  if (error) throw error;
  return data;
}

export async function deleteTask(id) {
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) throw error;
}

// ---------- Subtasks --------------------------------------------------------
export async function loadSubtasks(taskId) {
  const { data, error } = await supabase
    .from("subtasks").select("*").eq("task_id", taskId).order("sort_order");
  if (error) throw error;
  return data || [];
}
export async function addSubtask(taskId, title) {
  const { data, error } = await supabase.from("subtasks")
    .insert({ task_id: taskId, title }).select().single();
  if (error) throw error;
  return data;
}
export async function toggleSubtask(id, done) {
  const { error } = await supabase.from("subtasks").update({ done }).eq("id", id);
  if (error) throw error;
}
export async function deleteSubtask(id) {
  const { error } = await supabase.from("subtasks").delete().eq("id", id);
  if (error) throw error;
}

// ---------- Comments --------------------------------------------------------
export async function loadComments(taskId) {
  const { data, error } = await supabase
    .from("comments").select("*").eq("task_id", taskId).order("created_at");
  if (error) throw error;
  return data || [];
}
export async function addComment(taskId, authorId, body) {
  const { data, error } = await supabase
    .from("comments").insert({ task_id: taskId, author_id: authorId, body })
    .select().single();
  if (error) throw error;
  return data;
}

// ---------- Links -----------------------------------------------------------
export async function loadLinks(taskId) {
  const q = supabase.from("links").select("*").order("created_at");
  const { data, error } = taskId ? await q.eq("task_id", taskId) : await q.is("task_id", null);
  if (error) throw error;
  return data || [];
}
export async function addLink({ task_id = null, label, url, is_official = false }) {
  const { data, error } = await supabase.from("links")
    .insert({ task_id, label, url, is_official }).select().single();
  if (error) throw error;
  return data;
}
export async function deleteLink(id) {
  const { error } = await supabase.from("links").delete().eq("id", id);
  if (error) throw error;
}

// ---------- Info records ----------------------------------------------------
export async function loadInfoRecords() {
  const { data, error } = await supabase
    .from("info_records").select("*").order("updated_at", { ascending: false });
  if (error) throw error;
  return data || [];
}
export async function upsertInfoRecord(row) {
  if (row.id) {
    const { data, error } = await supabase.from("info_records")
      .update({ key: row.key, value: row.value, notes: row.notes, visibility: row.visibility })
      .eq("id", row.id).select().single();
    if (error) throw error;
    return data;
  } else {
    const { data, error } = await supabase.from("info_records")
      .insert({ key: row.key, value: row.value, notes: row.notes, visibility: row.visibility })
      .select().single();
    if (error) throw error;
    return data;
  }
}
export async function deleteInfoRecord(id) {
  const { error } = await supabase.from("info_records").delete().eq("id", id);
  if (error) throw error;
}

// ---------- Contacts --------------------------------------------------------
export async function loadContacts() {
  const { data, error } = await supabase
    .from("contacts").select("*").order("name");
  if (error) throw error;
  return data || [];
}
export async function upsertContact(row) {
  if (row.id) {
    const { data, error } = await supabase.from("contacts")
      .update(row).eq("id", row.id).select().single();
    if (error) throw error;
    return data;
  } else {
    const { data, error } = await supabase.from("contacts")
      .insert(row).select().single();
    if (error) throw error;
    return data;
  }
}
export async function deleteContact(id) {
  const { error } = await supabase.from("contacts").delete().eq("id", id);
  if (error) throw error;
}

// ---------- Realtime --------------------------------------------------------
export function subscribeTaskChanges(fn) {
  const chan = supabase.channel("tasks-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, p => fn(p))
    .subscribe();
  return () => supabase.removeChannel(chan);
}

export function subscribeCommentsForTask(taskId, fn) {
  const chan = supabase.channel(`comments-live-${taskId}`)
    .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "comments", filter: `task_id=eq.${taskId}` },
        p => fn(p.new))
    .subscribe();
  return () => supabase.removeChannel(chan);
}
