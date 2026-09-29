import { el, clear, fmtRelative, fmtDate, daysBetween, statusLabel, priorityLabel, toast, STATUS_OPTIONS, PRIORITY_OPTIONS, ASSIGNED_OPTIONS } from "../util.js";
import { ROLE_LABELS } from "../config.js";
import { updateTask, deleteTask } from "../store.js";
import { renderInlineDetail, teardownDetail } from "./task.js";

let expandedTaskId = null;
export function setExpandedTask(id) { expandedTaskId = id; }

const selected = new Set();     // task ids currently checked
let currentActions = null;      // last-passed actions, used by bulk bar

// Filter state persisted per session
const filterState = {
  phase: "",
  category: "",
  status: "",
  assigned: "",
  priority: "",
  needsHelp: false,
  requiresFolk: false,
  mode: "",
  search: "",
};

export function setPhaseFilter(slug) { filterState.phase = slug || ""; }

export function renderBoard(root, state, actions) {
  currentActions = actions;
  clear(root);
  const { tasks, phases, categories } = state;

  const phaseBySlug = new Map(phases.map(p => [p.slug, p]));
  const catById     = new Map(categories.map(c => [c.id, c]));
  const phaseById   = new Map(phases.map(p => [p.id, p]));

  // Prune selection to tasks that still exist
  const validIds = new Set(tasks.map(t => t.id));
  for (const id of [...selected]) if (!validIds.has(id)) selected.delete(id);

  const phaseObj = filterState.phase ? phaseBySlug.get(filterState.phase) : null;
  const filtered = filteredTasks(tasks, catById, phaseById);

  root.append(
    el("div", { class: "page-head" },
      el("h1", { class: "page-title" }, phaseObj ? phaseObj.name : "All tasks"),
      el("span", { class: "page-sub" }, `${filtered.length} of ${tasks.length}`),
    ),
  );

  const toolbar = el("div", { class: "toolbar" });
  toolbar.append(
    (() => { const b = el("button", { class: "btn primary" }, el("span", { class: "plus" }, "+"), "New"); b.onclick = () => actions.createTask(); return b; })(),
    personFilterBtn(() => renderBody()),
    filterBtn(categories, () => renderBody()),
    activeFiltersChips(() => renderBody()),
    (() => {
      const wrap = el("div", { class: "search-wrap" });
      const input = el("input", { type: "search", placeholder: `Search ${phaseObj ? phaseObj.name : "tasks"}...` });
      input.value = filterState.search;
      input.oninput = () => { filterState.search = input.value; renderBody(); };
      wrap.append(input);
      return wrap;
    })(),
  );
  root.append(toolbar);

  const bulkBar = el("div", { class: "bulk-bar", hidden: selected.size === 0 });
  root.append(bulkBar);

  const body = el("div");
  root.append(body);
  renderBody();

  function renderBulkBar() {
    clear(bulkBar);
    if (selected.size === 0) { bulkBar.hidden = true; return; }
    bulkBar.hidden = false;
    bulkBar.append(
      el("span", { class: "bulk-count" }, `${selected.size} selected`),
      (() => { const b = el("button", { class: "btn small danger" }, "Delete"); b.onclick = bulkDelete; return b; })(),
      (() => { const b = el("button", { class: "btn small ghost" }, "Cancel"); b.onclick = () => { selected.clear(); renderBody(); }; return b; })(),
    );
  }

  async function bulkDelete() {
    const n = selected.size;
    if (!confirm(`Delete ${n} task${n === 1 ? "" : "s"}? This can't be undone.`)) return;
    try {
      for (const id of [...selected]) await deleteTask(id);
      selected.clear();
      await actions.refresh();
    } catch (err) { toast(err.message, "error"); }
  }

  function renderBody() {
    clear(body);
    renderBulkBar();
    const list = filteredTasks(tasks, catById, phaseById);
    root.querySelector(".page-sub").textContent = `${list.length} of ${tasks.length}`;

    if (!list.length) {
      body.append(el("div", { class: "empty" }, "No tasks match those filters."));
      return;
    }

    const byCat = new Map();
    for (const t of list) {
      const cat = catById.get(t.category_id);
      const key = cat?.id || "uncat";
      if (!byCat.has(key)) byCat.set(key, { cat, items: [] });
      byCat.get(key).items.push(t);
    }
    const groups = [...byCat.values()].sort((a, b) => (a.cat?.sort_order ?? 99) - (b.cat?.sort_order ?? 99));
    for (const g of groups) body.append(renderGroup(g.cat, g.items));
  }

  function renderGroup(cat, items) {
    const group = el("div", { class: "group" });
    const head = el("div", { class: "group-head" });
    head.append(
      el("span", { class: "caret" }, "▾"),
      el("span", { class: "cat-bar", style: { background: cat?.color || "#4e5773" } }),
      el("h3", {}, cat?.name || "Uncategorised"),
      el("span", { class: "group-count" }, `${items.length} item${items.length === 1 ? "" : "s"}`),
    );
    group.append(head);

    const bodyEl = el("div", { class: "group-body" });
    const tbody = el("tbody");
    for (const t of items) {
      tbody.append(taskRow(t, phaseById));
      if (t.id === expandedTaskId) tbody.append(detailRow(t));
    }
    const table = el("table", { class: "table" },
      el("thead", {},
        el("tr", {},
          el("th", { class: "col-check" },
            (() => {
              const cb = el("input", { type: "checkbox" });
              cb.checked = items.length > 0 && items.every(t => selected.has(t.id));
              cb.onclick = (e) => {
                e.stopPropagation();
                if (cb.checked) items.forEach(t => selected.add(t.id));
                else items.forEach(t => selected.delete(t.id));
                renderBody();
              };
              return cb;
            })(),
          ),
          el("th", { style: { width: "38%" } }, "Task"),
          el("th", {}, "Phase"),
          el("th", {}, "Status"),
          el("th", {}, "Priority"),
          el("th", {}, "Person"),
          el("th", {}, "Updated"),
          el("th", { class: "col-actions" }, ""),
        ),
      ),
      tbody,
    );
    bodyEl.append(table);

    const foot = el("div", { class: "group-foot" }, "+ Add task in this category");
    foot.onclick = (e) => {
      e.stopPropagation();
      const title = prompt(`New task in ${cat?.name || "category"}`);
      if (!title || !title.trim()) return;
      actions.createTaskIn({ title: title.trim(), category_id: cat?.id });
    };
    bodyEl.append(foot);

    group.append(bodyEl);
    return group;
  }

  function taskRow(t, phaseById) {
    const overdue = t.target_date && daysBetween(new Date(), t.target_date) < 0 && !["completed","not_needed"].includes(t.status);

    // Selection checkbox
    const checkCell = el("td", { class: "col-check" });
    const cb = el("input", { type: "checkbox" });
    cb.checked = selected.has(t.id);
    cb.onclick = (e) => {
      e.stopPropagation();
      if (cb.checked) selected.add(t.id); else selected.delete(t.id);
      renderBody();
    };
    checkCell.append(cb);
    checkCell.onclick = (e) => e.stopPropagation();

    // Inline title edit
    const titleCell = el("td", { class: "col-title" });
    const titleSpan = el("span", { class: "inline-title", title: "Double-click to rename" }, t.title);
    titleSpan.ondblclick = (e) => { e.stopPropagation(); editInlineTitle(titleSpan, t); };
    titleCell.append(titleSpan);
    if (t.needs_help)             titleCell.append(el("span", { class: "help-flag" }, "needs help"));
    if (t.requires_folkbokforing) titleCell.append(el("small", {}, "requires folkbokföring"));

    const phase = phaseById.get(t.phase_id);
    const phasePill = el("span", { class: "pill subtle inline-edit", title: "Click to change phase" }, phase?.name || "—");
    phasePill.onclick = (e) => { e.stopPropagation(); pickOne(phasePill, [["", "—"], ...state.phases.map(p => [p.id, p.name])], t.phase_id, v => save(t, { phase_id: v || null })); };

    const statusPill = el("span", { class: `pill status-${t.status} inline-edit`, title: "Click to change status" }, statusLabel(t.status));
    statusPill.onclick = (e) => { e.stopPropagation(); pickOne(statusPill, STATUS_OPTIONS.map(s => [s, statusLabel(s)]), t.status, v => save(t, { status: v })); };

    const prioPill = el("span", { class: `pill pri-${t.priority} inline-edit`, title: "Click to change priority" }, priorityLabel(t.priority));
    prioPill.onclick = (e) => { e.stopPropagation(); pickOne(prioPill, PRIORITY_OPTIONS.map(p => [p, priorityLabel(p)]), t.priority, v => save(t, { priority: v })); };

    const personCell = personChip(t.assigned_to);
    personCell.classList.add("inline-edit");
    personCell.title = "Click to reassign";
    personCell.onclick = (e) => { e.stopPropagation(); pickOne(personCell, ASSIGNED_OPTIONS.map(a => [a, personLabelFor(a)]), t.assigned_to, v => save(t, { assigned_to: v })); };

    // Per-row action menu (visible on hover, always clickable)
    const actionBtn = el("button", { class: "row-actions-btn", title: "Actions", "aria-label": "Row actions" }, "⋯");
    actionBtn.onclick = (e) => { e.stopPropagation(); openRowMenu(actionBtn, t); };

    const isExpanded = t.id === expandedTaskId;
    const tr = el("tr", { class: (overdue ? "overdue " : "") + (isExpanded ? "expanded" : "") },
      checkCell,
      titleCell,
      el("td", { class: "col-meta" }, phasePill),
      el("td", {}, statusPill),
      el("td", {}, prioPill),
      el("td", {}, personCell),
      el("td", { class: "col-meta" }, fmtRelative(t.updated_at)),
      el("td", { class: "col-actions" }, actionBtn),
    );
    tr.onclick = () => actions.toggleExpand(t.id);
    tr.oncontextmenu = (e) => { e.preventDefault(); openRowMenu(actionBtn, t); };
    return tr;
  }

  function detailRow(t) {
    const holder = el("td", { colspan: "8", class: "detail-cell" });
    const container = el("div", { class: "detail-container" });
    holder.append(container);
    renderInlineDetail(container, t, state, () => actions.refresh());
    const row = el("tr", { class: "detail-row" }, holder);
    row.onclick = e => e.stopPropagation();
    return row;
  }

  function openRowMenu(anchor, t) {
    popoverFrom(anchor, ({ close }) => {
      const wrap = el("div", { class: "row-menu" });
      const item = (label, cls = "") => {
        const b = el("button", { class: "row-menu-item " + cls }, label);
        return b;
      };
      const openItem = item("Open");
      openItem.onclick = () => { close(); actions.openTask(t.id); };
      const dupItem = item("Duplicate");
      dupItem.onclick = async () => {
        close();
        try {
          await actions.createTaskIn({ title: (t.title || "Task") + " (copy)", category_id: t.category_id, phase_id: t.phase_id });
        } catch (err) { toast(err.message, "error"); }
      };
      const delItem = item("Delete", "danger");
      delItem.onclick = async () => {
        close();
        if (!confirm(`Delete "${t.title}"? This can't be undone.`)) return;
        try { await deleteTask(t.id); await actions.refresh(); }
        catch (err) { toast(err.message, "error"); }
      };
      wrap.append(openItem, dupItem, el("div", { class: "row-menu-sep" }), delItem);
      return wrap;
    });
  }

  function editInlineTitle(span, task) {
    const input = el("input", { class: "input", value: task.title, style: { padding: "3px 6px", fontSize: "13.5px" } });
    span.replaceWith(input);
    input.focus(); input.select();
    let done = false;
    const commit = async (save) => {
      if (done) return; done = true;
      const val = input.value.trim();
      if (save && val && val !== task.title) {
        try {
          await updateTask(task.id, { title: val });
          task.title = val;
        } catch (err) { toast(err.message, "error"); }
      }
      const newSpan = el("span", { class: "inline-title", title: "Double-click to rename" }, task.title);
      newSpan.ondblclick = (e) => { e.stopPropagation(); editInlineTitle(newSpan, task); };
      input.replaceWith(newSpan);
      if (save) actions.refresh();
    };
    input.onkeydown = e => { if (e.key === "Enter") commit(true); if (e.key === "Escape") commit(false); };
    input.onblur = () => commit(true);
    input.onclick = e => e.stopPropagation();
  }

  async function save(task, patch) {
    try {
      await updateTask(task.id, patch);
      Object.assign(task, patch);
      actions.refresh();
    } catch (err) { toast(err.message, "error"); }
  }
}

function personLabelFor(v) {
  if (v === "linus") return ROLE_LABELS.linus;
  if (v === "oscar") return ROLE_LABELS.helper;
  if (v === "both")  return "Both";
  return "Unassigned";
}

function personChip(v) {
  const cls = {
    linus:  "avatar-linus",
    oscar:  "avatar-oscar",
    both:   "avatar-both",
  }[v] || "avatar-none";
  const initial = { linus: "L", oscar: "O", both: "LO" }[v] || "+";
  const label = v === "linus" ? ROLE_LABELS.linus : v === "oscar" ? ROLE_LABELS.helper : v === "both" ? "Both" : "Unassigned";
  return el("span", { class: "avatar" },
    el("span", { class: `avatar-dot ${cls}` }, initial),
    label,
  );
}

/* ---------- Filter popover ------------------------------------------------ */

function personFilterBtn(onChange) {
  const b = el("button", { class: "btn" + (filterState.assigned ? " primary" : "") },
    el("span", { class: "icon" }, "◐"),
    filterState.assigned
      ? (filterState.assigned === "linus" ? ROLE_LABELS.linus : filterState.assigned === "oscar" ? ROLE_LABELS.helper : "Both")
      : "Person",
  );
  b.onclick = (e) => {
    e.stopPropagation();
    popoverFrom(b, ({ close }) => {
      const wrap = el("div", { style: { display: "flex", flexDirection: "column", gap: "2px" } });
      const opts = [["", "Anyone"], ["linus", ROLE_LABELS.linus], ["oscar", ROLE_LABELS.helper], ["both", "Both"]];
      for (const [val, label] of opts) {
        const item = el("button", {
          class: "row-menu-item",
          style: { background: filterState.assigned === val ? "var(--bg-elev-2)" : "" },
        }, label);
        item.onclick = () => { filterState.assigned = val; close(); onChange(); };
        wrap.append(item);
      }
      return wrap;
    });
  };
  return b;
}

function filterBtn(categories, onChange) {
  const active = filterState.status || filterState.category || filterState.priority || filterState.mode || filterState.needsHelp || filterState.requiresFolk;
  const b = el("button", { class: "btn" + (active ? " primary" : "") },
    el("span", { class: "icon" }, "⊟"),
    "Filter",
  );
  b.onclick = (e) => {
    e.stopPropagation();
    popoverFrom(b, ({ close }) => {
      const wrap = el("div", { style: { display: "flex", flexDirection: "column", gap: "10px", minWidth: "280px" } });
      wrap.append(
        selectField("Category", filterState.category, [["", "All categories"], ...categories.map(c => [c.id, c.name])], v => filterState.category = v),
        selectField("Status", filterState.status, [["", "Any status"], ...STATUS_OPTIONS.map(s => [s, statusLabel(s)])], v => filterState.status = v),
        selectField("Priority", filterState.priority, [["", "Any"], ...PRIORITY_OPTIONS.map(p => [p, priorityLabel(p)])], v => filterState.priority = v),
        selectField("Mode", filterState.mode, [["", "Any"], ["online","Online"], ["in_person","In person"], ["either","Either"]], v => filterState.mode = v),
        checkField("Needs help", filterState.needsHelp, v => filterState.needsHelp = v),
        checkField("Requires folkbokföring", filterState.requiresFolk, v => filterState.requiresFolk = v),
      );
      const foot = el("div", { class: "row-actions" });
      const clearBtn = el("button", { class: "btn ghost small" }, "Clear all");
      clearBtn.onclick = () => {
        filterState.category = filterState.status = filterState.priority = filterState.mode = "";
        filterState.needsHelp = false; filterState.requiresFolk = false;
        close(); onChange();
      };
      const applyBtn = el("button", { class: "btn primary small" }, "Apply");
      applyBtn.onclick = () => { close(); onChange(); };
      foot.append(clearBtn, applyBtn);
      wrap.append(foot);
      return wrap;
    });
  };
  return b;
}

function activeFiltersChips(onChange) {
  const chips = [];
  const push = (label, clear) => {
    const chip = el("button", { class: "btn ghost small", title: "Remove filter" }, label, " ×");
    chip.onclick = () => { clear(); onChange(); };
    chips.push(chip);
  };
  if (filterState.needsHelp)     push("Needs help", () => filterState.needsHelp = false);
  if (filterState.requiresFolk)  push("Folkbokföring", () => filterState.requiresFolk = false);
  return el("div", { style: { display: "flex", gap: "6px", flexWrap: "wrap" } }, ...chips);
}

function selectField(label, value, options, setter) {
  const sel = el("select", { class: "select" });
  for (const [v, l] of options) {
    const o = el("option", { value: v }, l);
    if (String(v) === String(value)) o.selected = true;
    sel.append(o);
  }
  sel.onchange = () => setter(sel.value);
  return el("div", { class: "field" }, el("label", {}, label), sel);
}

function checkField(label, value, setter) {
  const wrap = el("label", { class: "field", style: { flexDirection: "row", alignItems: "center", gap: "8px" } });
  const cb = el("input", { type: "checkbox" });
  cb.checked = !!value;
  cb.onchange = () => setter(cb.checked);
  wrap.append(cb, el("span", { style: { color: "var(--text-dim)", fontSize: "13px" } }, label));
  return wrap;
}

function popoverFrom(anchorBtn, build) {
  const rect = anchorBtn.getBoundingClientRect();
  const backdrop = el("div", { class: "popover-backdrop" });
  const pop = el("div", { class: "popover" });
  pop.style.left = `${Math.max(8, rect.left)}px`;
  pop.style.top  = `${rect.bottom + 6 + window.scrollY}px`;
  const close = () => { pop.remove(); backdrop.remove(); };
  backdrop.onclick = close;
  document.body.append(backdrop, pop);
  pop.append(build({ close }));

  requestAnimationFrame(() => {
    const w = pop.getBoundingClientRect();
    if (w.right > window.innerWidth - 8) {
      pop.style.left = `${window.innerWidth - w.width - 12}px`;
    }
  });
}

function pickOne(anchor, options, currentValue, onPick) {
  popoverFrom(anchor, ({ close }) => {
    const wrap = el("div", { class: "row-menu" });
    for (const [val, label] of options) {
      const item = el("button", {
        class: "row-menu-item",
        style: { background: String(currentValue) === String(val) ? "var(--bg-elev-2)" : "" },
      }, label);
      item.onclick = (e) => { e.stopPropagation(); close(); onPick(val); };
      wrap.append(item);
    }
    return wrap;
  });
}

function filteredTasks(tasks, catById, phaseById) {
  return tasks.filter(t => {
    if (filterState.phase) {
      const p = phaseById.get(t.phase_id);
      if (!p || p.slug !== filterState.phase) return false;
    }
    if (filterState.category && t.category_id !== filterState.category) return false;
    if (filterState.status && t.status !== filterState.status) return false;
    if (filterState.assigned && t.assigned_to !== filterState.assigned) return false;
    if (filterState.priority && t.priority !== filterState.priority) return false;
    if (filterState.needsHelp && !t.needs_help) return false;
    if (filterState.requiresFolk && !t.requires_folkbokforing) return false;
    if (filterState.mode && t.mode !== filterState.mode) return false;
    if (filterState.search && !t.title.toLowerCase().includes(filterState.search.toLowerCase())) return false;
    return true;
  }).sort((a, b) => {
    const openOrder = { in_progress: 1, not_started: 2, completed: 3 };
    const oa = openOrder[a.status] || 9;
    const ob = openOrder[b.status] || 9;
    if (oa !== ob) return oa - ob;
    const pa = { urgent: 1, high: 2, medium: 3, low: 4 }[a.priority] || 5;
    const pb = { urgent: 1, high: 2, medium: 3, low: 4 }[b.priority] || 5;
    if (pa !== pb) return pa - pb;
    return new Date(b.updated_at) - new Date(a.updated_at);
  });
}
