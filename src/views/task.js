// Task detail rendered inline on the board (no drawer).
//
// renderInlineDetail(container, task, state, onChange)
//   Mounts the full detail UI into the given container element. The board
//   inserts an expansion row below the clicked task and mounts here.
//
// We keep a tiny openTaskDrawer wrapper for the URL route /task/:id, but
// the board itself no longer uses a drawer.

import {
  el, clear, fmtRelative,
  toast,
} from "../util.js";
import { ROLE_LABELS } from "../config.js";
import {
  loadTask, updateTask, deleteTask,
  loadSubtasks, addSubtask, toggleSubtask, deleteSubtask,
  loadComments, addComment, subscribeCommentsForTask,
  loadLinks, addLink, deleteLink,
  loadDependencies, loadTasks,
} from "../store.js";

// Track a live-comments subscription per detail mount so we can clean up.
const activeSubs = new WeakMap();

export async function renderInlineDetail(container, task, state, onChange) {
  clear(container);
  container.append(el("div", { class: "empty" }, "Loading…"));

  const [full, subtasks, comments, links, deps, allTasks] = await Promise.all([
    loadTask(task.id), loadSubtasks(task.id), loadComments(task.id), loadLinks(task.id),
    loadDependencies(), loadTasks(),
  ]);
  if (!full) { clear(container); container.append(el("div", { class: "empty" }, "Task not found.")); return; }
  Object.assign(task, full);

  const taskById = new Map(allTasks.map(t => [t.id, t]));
  const myDeps   = deps.filter(d => d.task_id === task.id).map(d => taskById.get(d.depends_on_task_id)).filter(Boolean);
  const blocks   = deps.filter(d => d.depends_on_task_id === task.id).map(d => taskById.get(d.task_id)).filter(Boolean);

  clear(container);
  const panel = el("div", { class: "detail-panel" });
  container.append(panel);

  // Top row: need-help toggle + meta line
  const helpLabelOn  = "Cancel 'need help'";
  const helpLabelOff = "I need help with this";
  const helpBtn = el("button", { class: "help-toggle" + (task.needs_help ? " on" : "") }, task.needs_help ? helpLabelOn : helpLabelOff);
  helpBtn.onclick = async () => {
    try {
      await updateTask(task.id, { needs_help: !task.needs_help });
      task.needs_help = !task.needs_help;
      helpBtn.className = "help-toggle" + (task.needs_help ? " on" : "");
      helpBtn.textContent = task.needs_help ? helpLabelOn : helpLabelOff;
      onChange?.();
    } catch (err) { toast(err.message, "error"); }
  };
  panel.append(helpBtn);

  panel.append(el("div", { class: "detail-meta" }, "Last updated " + fmtRelative(task.updated_at)));

  // Explanation
  const expl = el("textarea", { class: "textarea", placeholder: "Short explanation…" }, task.explanation || "");
  expl.onblur = () => saveIfChanged({ explanation: expl.value });
  panel.append(el("div", { class: "field" }, el("label", {}, "Explanation"), expl));

  // Target date + reference number side by side
  const twoCol = el("div", { class: "two-col" });
  const dateInp = el("input", { class: "input", type: "date", value: task.target_date || "" });
  dateInp.onchange = () => patch({ target_date: dateInp.value || null });
  const ref = el("input", { class: "input", type: "text", placeholder: "Case / reference number", value: task.reference_number || "" });
  ref.onblur = () => saveIfChanged({ reference_number: ref.value });
  twoCol.append(
    el("div", { class: "field" }, el("label", {}, "Target date"), dateInp),
    el("div", { class: "field" }, el("label", {}, "Reference / case number"), ref),
  );
  panel.append(twoCol);

  // Appointment
  const appt = el("input", { class: "input", type: "datetime-local",
    value: task.appointment_at ? new Date(task.appointment_at).toISOString().slice(0,16) : "" });
  appt.onchange = () => patch({ appointment_at: appt.value ? new Date(appt.value).toISOString() : null });
  const apptLoc = el("input", { class: "input", type: "text", placeholder: "Location", value: task.appointment_location || "" });
  apptLoc.onblur = () => saveIfChanged({ appointment_location: apptLoc.value });
  const apptNotes = el("textarea", { class: "textarea", placeholder: "Appointment notes" }, task.appointment_notes || "");
  apptNotes.onblur = () => saveIfChanged({ appointment_notes: apptNotes.value });
  panel.append(
    el("div", { class: "detail-section-head" }, "Appointment"),
    el("div", { class: "two-col" },
      el("div", { class: "field" }, el("label", {}, "When"), appt),
      el("div", { class: "field" }, el("label", {}, "Where"), apptLoc),
    ),
    el("div", { class: "field" }, el("label", {}, "Notes"), apptNotes),
  );

  // Checklist
  panel.append(renderSubtasks(subtasks, task.id));

  // Links
  panel.append(renderLinks(links, task.id));

  // Dependencies
  panel.append(depsSection("Depends on", myDeps));
  if (blocks.length) panel.append(depsSection("Blocks", blocks));

  // Comments (with realtime)
  const commentsSec = renderComments(comments, task.id, state);
  panel.append(commentsSec);

  // Danger row
  panel.append(el("div", { class: "detail-danger" },
    (() => {
      const b = el("button", { class: "btn danger small" }, "Delete task");
      b.onclick = async () => {
        if (!confirm("Delete this task? This can't be undone.")) return;
        try { await deleteTask(task.id); onChange?.(); } catch (err) { toast(err.message, "error"); }
      };
      return b;
    })(),
  ));

  async function patch(fields) {
    try {
      const updated = await updateTask(task.id, fields);
      Object.assign(task, updated);
      onChange?.();
    } catch (err) { toast(err.message, "error"); }
  }
  async function saveIfChanged(fields) {
    const changed = {};
    for (const [k, v] of Object.entries(fields)) if (task[k] !== v) changed[k] = v;
    if (Object.keys(changed).length) await patch(changed);
  }
}

// Called by the board when a detail-row is being removed (row collapsed).
export function teardownDetail(container) {
  const unsub = activeSubs.get(container);
  if (unsub) { try { unsub(); } catch {} activeSubs.delete(container); }
}

function depsSection(title, items) {
  return el("div", { class: "detail-section" },
    el("div", { class: "detail-section-head" }, `${title} (${items.length})`),
    el("ul", { class: "dep-list" }, ...items.map(t =>
      el("li", {}, t.title, " ", el("span", { class: "dep-status" }, t.status.replace("_", " "))),
    )),
  );
}

function renderSubtasks(initial, taskId) {
  const section = el("div", { class: "detail-section" },
    el("div", { class: "detail-section-head" }, `Checklist (${initial.length})`),
  );
  const list = el("div");
  section.append(list);
  const state = { items: [...initial] };

  function paint() {
    clear(list);
    for (const st of state.items) list.append(subtaskRow(st));
    const input = el("input", { class: "input", placeholder: "Add a step and press Enter" });
    input.onkeydown = async (e) => {
      if (e.key === "Enter" && input.value.trim()) {
        try {
          const created = await addSubtask(taskId, input.value.trim());
          state.items.push(created);
          paint();
        } catch (err) { toast(err.message, "error"); }
      }
    };
    list.append(el("div", { style: { marginTop: "8px" } }, input));
  }

  function subtaskRow(st) {
    const row = el("div", { class: "subtask-row" });
    const cb = el("input", { type: "checkbox" });
    cb.checked = !!st.done;
    cb.onchange = async () => {
      try { await toggleSubtask(st.id, cb.checked); st.done = cb.checked; }
      catch (err) { toast(err.message, "error"); cb.checked = !cb.checked; }
    };
    const label = el("div", { class: "grow", style: st.done ? { textDecoration: "line-through", color: "var(--muted)" } : {} }, st.title);
    const del = el("button", { class: "linky" }, "delete");
    del.onclick = async () => {
      try { await deleteSubtask(st.id); state.items = state.items.filter(x => x.id !== st.id); paint(); }
      catch (err) { toast(err.message, "error"); }
    };
    row.append(cb, label, del);
    return row;
  }

  paint();
  return section;
}

function renderLinks(initial, taskId) {
  const section = el("div", { class: "detail-section" },
    el("div", { class: "detail-section-head" }, `Useful links (${initial.length})`),
  );
  const state = { items: [...initial] };
  const list = el("div");
  section.append(list);

  function paint() {
    clear(list);
    for (const lnk of state.items) list.append(linkRow(lnk));
    const label = el("input", { class: "input", placeholder: "Label" });
    const url   = el("input", { class: "input", placeholder: "https://…" });
    const add = el("button", { class: "btn small" }, "Add link");
    add.onclick = async () => {
      if (!label.value.trim() || !url.value.trim()) return;
      try {
        const created = await addLink({ task_id: taskId, label: label.value.trim(), url: url.value.trim() });
        state.items.push(created);
        paint();
      } catch (err) { toast(err.message, "error"); }
    };
    list.append(el("div", { style: { display: "flex", gap: "6px", marginTop: "8px", flexWrap: "wrap" } }, label, url, add));
  }
  function linkRow(l) {
    const row = el("div", { class: "subtask-row" });
    row.append(
      el("a", { class: "grow", href: l.url, target: "_blank", rel: "noopener noreferrer", style: { color: "var(--accent-strong)" } }, l.label),
      (() => {
        const del = el("button", { class: "linky" }, "delete");
        del.onclick = async () => { try { await deleteLink(l.id); state.items = state.items.filter(x => x.id !== l.id); paint(); } catch (err) { toast(err.message, "error"); } };
        return del;
      })(),
    );
    return row;
  }

  paint();
  return section;
}

function renderComments(initial, taskId, state) {
  const section = el("div", { class: "detail-section" },
    el("div", { class: "detail-section-head" }, "Comments"),
  );
  const thread = el("div", { class: "thread" });
  section.append(thread);
  const items = [...initial];

  function paint() {
    clear(thread);
    if (!items.length) thread.append(el("div", { class: "empty" }, "No comments yet."));
    for (const c of items) thread.append(msg(c));
    const input = el("textarea", { class: "textarea", placeholder: "Write a comment…" });
    const send = el("button", { class: "btn primary" }, "Post");
    send.onclick = async () => {
      const body = input.value.trim();
      if (!body) return;
      try {
        const c = await addComment(taskId, state.profile.id, body);
        items.push(c);
        input.value = "";
        paint();
      } catch (err) { toast(err.message, "error"); }
    };
    thread.append(el("div", { class: "msg-input" }, input, send));
  }

  function msg(c) {
    const author = c.author_id === state.profile?.id ? "You" : (c.author_id?.slice(0, 6) + "…");
    return el("div", { class: "msg" },
      el("div", { class: "msg-head" }, el("strong", {}, author), el("span", {}, fmtRelative(c.created_at))),
      el("div", { class: "msg-body" }, c.body),
    );
  }

  paint();

  // Live comment updates for this task.
  const unsub = subscribeCommentsForTask(taskId, (newRow) => {
    if (!items.find(x => x.id === newRow.id)) { items.push(newRow); paint(); }
  });
  activeSubs.set(section, unsub);

  return section;
}

// --- Backward-compat drawer opener (used by /task/:id direct link) --------
// Just delegates to inline rendering inside a drawer so nothing depends on
// two separate implementations.
let openDrawerNode = null;
export function closeDrawer() {
  if (openDrawerNode) {
    openDrawerNode.node.remove();
    openDrawerNode.backdrop.remove();
    openDrawerNode = null;
  }
}
export async function openTaskDrawer(taskId, state, onChange) {
  closeDrawer();
  const root = document.getElementById("drawer-root");
  const backdrop = el("div", { class: "drawer-backdrop" });
  backdrop.onclick = () => closeDrawer();
  const node = el("aside", { class: "drawer" });
  const head = el("div", { class: "drawer-head" },
    el("div", { class: "grow" }, "Task"),
    (() => { const b = el("button", { class: "btn ghost small" }, "Close"); b.onclick = () => closeDrawer(); return b; })(),
  );
  const body = el("div", { class: "drawer-body" });
  node.append(head, body);
  root.append(backdrop, node);
  openDrawerNode = { node, backdrop };
  await renderInlineDetail(body, { id: taskId }, state, onChange);
}
