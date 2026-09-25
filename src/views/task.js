import {
  el, clear, fmtRelative, fmtDate, statusLabel,
  STATUS_OPTIONS, PRIORITY_OPTIONS, ASSIGNED_OPTIONS, MODE_OPTIONS, toast,
} from "../util.js";
import { ROLE_LABELS } from "../config.js";
import {
  loadTask, updateTask, deleteTask,
  loadSubtasks, addSubtask, toggleSubtask, deleteSubtask,
  loadComments, addComment, subscribeCommentsForTask,
  loadLinks, addLink, deleteLink,
  loadDependencies, loadTasks,
} from "../store.js";

let openDrawer = null;

export function closeDrawer() {
  if (openDrawer) {
    openDrawer.unsubs.forEach(fn => fn && fn());
    openDrawer.node.remove();
    openDrawer.backdrop.remove();
    openDrawer = null;
  }
}

export async function openTaskDrawer(taskId, state, onChange) {
  closeDrawer();

  const root = document.getElementById("drawer-root");
  const backdrop = el("div", { class: "drawer-backdrop" });
  backdrop.onclick = () => closeDrawer();
  const node = el("aside", { class: "drawer", role: "dialog", "aria-modal": "true" });
  root.append(backdrop, node);

  openDrawer = { node, backdrop, unsubs: [] };

  node.append(el("div", { class: "drawer-body" }, el("div", { class: "empty" }, "Loading…")));

  const [task, subtasks, comments, links, deps, allTasks] = await Promise.all([
    loadTask(taskId), loadSubtasks(taskId), loadComments(taskId), loadLinks(taskId),
    loadDependencies(), loadTasks(),
  ]);
  if (!task) { closeDrawer(); toast("Task not found", "error"); return; }

  const taskById = new Map(allTasks.map(t => [t.id, t]));
  const myDeps   = deps.filter(d => d.task_id === task.id).map(d => taskById.get(d.depends_on_task_id)).filter(Boolean);
  const blocks   = deps.filter(d => d.depends_on_task_id === task.id).map(d => taskById.get(d.task_id)).filter(Boolean);
  const phase    = state.phases.find(p => p.id === task.phase_id);
  const category = state.categories.find(c => c.id === task.category_id);

  clear(node);

  // Head
  const head = el("div", { class: "drawer-head" },
    el("div", { class: "grow" },
      category ? el("span", { class: "pill subtle" },
        el("span", { style: { display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", background: category.color, marginRight: "6px" } }),
        category.name,
      ) : null,
      phase ? el("span", { class: "card-meta", style: { marginLeft: "8px" } }, phase.name) : null,
    ),
    (() => {
      const b = el("button", { class: "btn ghost" }, "Close");
      b.onclick = () => closeDrawer();
      return b;
    })(),
  );
  node.append(head);

  const body = el("div", { class: "drawer-body" });
  node.append(body);

  // Title (editable)
  const titleInput = el("input", { class: "drawer-title", value: task.title });
  titleInput.onblur = () => saveIfChanged({ title: titleInput.value });
  body.append(titleInput);

  // Meta line
  body.append(el("div", { class: "card-meta" },
    "Last updated " + fmtRelative(task.updated_at),
  ));

  // Need help toggle
  const helpLabelOn  = "Cancel 'need help'";
  const helpLabelOff = "I need help with this";
  const helpBtn = el("button", { class: "help-toggle" + (task.needs_help ? " on" : "") }, task.needs_help ? helpLabelOn : helpLabelOff);
  helpBtn.onclick = async () => {
    await patch({ needs_help: !task.needs_help });
    task.needs_help = !task.needs_help;
    helpBtn.className = "help-toggle" + (task.needs_help ? " on" : "");
    helpBtn.textContent = task.needs_help ? helpLabelOn : helpLabelOff;
  };
  body.append(el("div", { style: { margin: "12px 0 4px" } }, helpBtn));

  // Meta grid
  const meta = el("div", { class: "meta-grid" });
  meta.append(
    fieldSelect("Status", task.status, STATUS_OPTIONS.map(s => [s, statusLabel(s)]), v => patch({ status: v })),
    fieldSelect("Priority", task.priority, PRIORITY_OPTIONS.map(p => [p, p]), v => patch({ priority: v })),
    fieldSelect("Assigned to", task.assigned_to || "both", ASSIGNED_OPTIONS.map(a => [a, assignedLabel(a)]), v => patch({ assigned_to: v })),
    fieldSelect("Mode", task.mode || "either", MODE_OPTIONS.map(m => [m, modeLabel(m)]), v => patch({ mode: v })),
    fieldDate("Target date", task.target_date, v => patch({ target_date: v || null })),
    fieldSelect("Phase", task.phase_id || "", [["", "—"], ...state.phases.map(p => [p.id, p.name])], v => patch({ phase_id: v || null })),
    fieldSelect("Category", task.category_id || "", [["", "—"], ...state.categories.map(c => [c.id, c.name])], v => patch({ category_id: v || null })),
    fieldCheck("Can prepare early", task.can_prepare_early, v => patch({ can_prepare_early: v })),
    fieldCheck("Requires folkbokföring", task.requires_folkbokforing, v => patch({ requires_folkbokforing: v })),
  );
  body.append(meta);

  // Explanation
  const expl = el("textarea", { class: "textarea", placeholder: "Short explanation…" }, task.explanation || "");
  expl.onblur = () => saveIfChanged({ explanation: expl.value });
  body.append(el("div", { class: "field" }, el("label", {}, "Explanation"), expl));

  // Appointment
  const appt = el("input", { class: "input", type: "datetime-local",
    value: task.appointment_at ? new Date(task.appointment_at).toISOString().slice(0,16) : "" });
  appt.onchange = () => patch({ appointment_at: appt.value ? new Date(appt.value).toISOString() : null });
  const apptLoc = el("input", { class: "input", type: "text", placeholder: "Location", value: task.appointment_location || "" });
  apptLoc.onblur = () => saveIfChanged({ appointment_location: apptLoc.value });
  const apptNotes = el("textarea", { class: "textarea", placeholder: "Appointment notes" }, task.appointment_notes || "");
  apptNotes.onblur = () => saveIfChanged({ appointment_notes: apptNotes.value });
  body.append(
    el("div", { class: "field" }, el("label", {}, "Appointment"), appt),
    el("div", { class: "field" }, el("label", {}, "Location"), apptLoc),
    el("div", { class: "field" }, el("label", {}, "Notes"), apptNotes),
  );

  // Reference number
  const ref = el("input", { class: "input", type: "text", placeholder: "e.g. Skatteverket case number", value: task.reference_number || "" });
  ref.onblur = () => saveIfChanged({ reference_number: ref.value });
  body.append(el("div", { class: "field" }, el("label", {}, "Reference / case number"), ref));

  // Dependencies
  body.append(el("div", { class: "section" },
    el("div", { class: "section-head" }, el("h2", {}, "Depends on"), el("span", { class: "section-hint" }, `${myDeps.length}`)),
    myDeps.length
      ? el("ul", { style: { paddingLeft: "18px", margin: 0 } }, ...myDeps.map(t =>
          el("li", {},
            el("a", { href: `#/task/${t.id}`, onClick: (e) => { e.preventDefault(); openTaskDrawer(t.id, state, onChange); } }, t.title),
            " ",
            el("span", { class: `pill status-${t.status}`, style: { marginLeft: "6px" } }, statusLabel(t.status)),
          ),
        ))
      : el("div", { class: "empty" }, "No dependencies."),
  ));

  if (blocks.length) {
    body.append(el("div", { class: "section" },
      el("div", { class: "section-head" }, el("h2", {}, "Blocks"), el("span", { class: "section-hint" }, `${blocks.length}`)),
      el("ul", { style: { paddingLeft: "18px", margin: 0 } }, ...blocks.map(t =>
        el("li", {},
          el("a", { href: `#/task/${t.id}`, onClick: (e) => { e.preventDefault(); openTaskDrawer(t.id, state, onChange); } }, t.title),
        ),
      )),
    ));
  }

  // Subtasks
  body.append(renderSubtasks(subtasks, taskId));

  // Links
  body.append(renderLinks(links, taskId));

  // Comments
  body.append(renderComments(comments, taskId, state));

  // Delete button
  body.append(el("div", { style: { marginTop: "24px" } },
    (() => {
      const b = el("button", { class: "btn danger" }, "Delete task");
      b.onclick = async () => {
        if (!confirm("Delete this task? This can't be undone.")) return;
        try {
          await deleteTask(taskId);
          closeDrawer();
          onChange();
        } catch (err) { toast(err.message, "error"); }
      };
      return b;
    })(),
  ));

  async function patch(fields) {
    try {
      const updated = await updateTask(taskId, fields);
      Object.assign(task, updated);
      onChange();
    } catch (err) { toast(err.message, "error"); }
  }
  async function saveIfChanged(fields) {
    const changed = {};
    for (const [k, v] of Object.entries(fields)) if (task[k] !== v) changed[k] = v;
    if (Object.keys(changed).length) await patch(changed);
  }
}

function fieldSelect(label, value, options, onChange) {
  const sel = el("select", { class: "select" });
  for (const [v, l] of options) {
    const o = el("option", { value: v }, l);
    if (String(value) === String(v)) o.selected = true;
    sel.append(o);
  }
  sel.onchange = () => onChange(sel.value);
  return el("div", { class: "field" }, el("label", {}, label), sel);
}
function fieldDate(label, value, onChange) {
  const input = el("input", { class: "input", type: "date", value: value || "" });
  input.onchange = () => onChange(input.value);
  return el("div", { class: "field" }, el("label", {}, label), input);
}
function fieldCheck(label, value, onChange) {
  const wrap = el("label", { class: "field", style: { flexDirection: "row", alignItems: "center", gap: "8px" } });
  const cb = el("input", { type: "checkbox" });
  cb.checked = !!value;
  cb.onchange = () => onChange(cb.checked);
  wrap.append(cb, el("span", { style: { color: "var(--muted)", fontSize: "13px" } }, label));
  return wrap;
}

function renderSubtasks(initial, taskId) {
  const section = el("div", { class: "section" },
    el("div", { class: "section-head" }, el("h2", {}, "Checklist"), el("span", { class: "section-hint" }, `${initial.length}`)),
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
  const section = el("div", { class: "section" },
    el("div", { class: "section-head" }, el("h2", {}, "Useful links"), el("span", { class: "section-hint" }, `${initial.length}`)),
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
  const section = el("div", { class: "section" },
    el("div", { class: "section-head" }, el("h2", {}, "Comments")),
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
    const author = c.author_id === state.profile?.id ? "You" : nameFor(c.author_id, state);
    return el("div", { class: "msg" },
      el("div", { class: "msg-head" }, el("strong", {}, author), el("span", {}, fmtRelative(c.created_at))),
      el("div", { class: "msg-body" }, c.body),
    );
  }

  paint();

  // Live updates
  const unsub = subscribeCommentsForTask(taskId, (newRow) => {
    if (!items.find(x => x.id === newRow.id)) { items.push(newRow); paint(); }
  });
  if (openDrawer) openDrawer.unsubs.push(unsub);

  return section;
}

function nameFor(id, state) {
  // We don't preload all profiles; show a short user-id fallback.
  return id ? id.slice(0, 6) + "…" : "someone";
}

function assignedLabel(v) {
  if (v === "linus") return ROLE_LABELS.linus;
  if (v === "oscar") return ROLE_LABELS.helper;
  if (v === "both")  return "Both";
  return "Unassigned";
}
function modeLabel(m) {
  if (m === "online") return "Online";
  if (m === "in_person") return "In person";
  return "Either";
}
