import { el, clear, fmtRelative, fmtDate, daysBetween, statusLabel, toast, STATUS_OPTIONS, PRIORITY_OPTIONS, ASSIGNED_OPTIONS } from "../util.js";
import { ROLE_LABELS } from "../config.js";
import { updateTask } from "../store.js";

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

const collapsed = new Set();  // category ids that are collapsed

export function setPhaseFilter(slug) { filterState.phase = slug || ""; }

export function renderBoard(root, state, actions) {
  clear(root);
  const { tasks, phases, categories } = state;

  const phaseBySlug = new Map(phases.map(p => [p.slug, p]));
  const catById     = new Map(categories.map(c => [c.id, c]));
  const phaseById   = new Map(phases.map(p => [p.id, p]));

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
    sortBtn(() => renderBody()),
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

  const body = el("div");
  root.append(body);
  renderBody();

  function renderBody() {
    clear(body);
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
    const isCollapsed = collapsed.has(cat?.id);
    const group = el("div", { class: "group" });
    const head = el("div", { class: "group-head" + (isCollapsed ? " collapsed" : "") });
    head.append(
      el("span", { class: "caret" }, "▾"),
      el("span", { class: "cat-bar", style: { background: cat?.color || "#4e5773" } }),
      el("h3", {}, cat?.name || "Uncategorised"),
      el("span", { class: "group-count" }, `${items.length} item${items.length === 1 ? "" : "s"}`),
    );
    head.onclick = () => {
      if (isCollapsed) collapsed.delete(cat.id); else collapsed.add(cat.id);
      renderBody();
    };
    group.append(head);

    if (isCollapsed) return group;

    const bodyEl = el("div", { class: "group-body" });
    const table = el("table", { class: "table" },
      el("thead", {},
        el("tr", {},
          el("th", { style: { width: "40%" } }, "Task"),
          el("th", {}, "Phase"),
          el("th", {}, "Status"),
          el("th", {}, "Priority"),
          el("th", {}, "Person"),
          el("th", {}, "Target"),
          el("th", {}, "Updated"),
        ),
      ),
      el("tbody", {},
        ...items.map(t => taskRow(t, phaseById)),
      ),
    );
    bodyEl.append(table);

    const foot = el("div", { class: "group-foot" }, "+ Add task in this category");
    foot.onclick = (e) => {
      e.stopPropagation();
      const title = prompt(`New task in ${cat.name}`);
      if (!title || !title.trim()) return;
      actions.createTaskIn({ title: title.trim(), category_id: cat.id });
    };
    bodyEl.append(foot);

    group.append(bodyEl);
    return group;
  }

  function taskRow(t, phaseById) {
    const overdue = t.target_date && daysBetween(new Date(), t.target_date) < 0 && !["completed","not_needed"].includes(t.status);

    // Inline title editing
    const titleCell = el("td", { class: "col-title" });
    const titleSpan = el("span", { class: "inline-title" }, t.title);
    titleSpan.title = "Double-click to rename";
    titleSpan.ondblclick = (e) => { e.stopPropagation(); editInlineTitle(titleSpan, t); };
    titleCell.append(titleSpan);
    if (t.needs_help)             titleCell.append(el("span", { class: "help-flag" }, "needs help"));
    if (t.requires_folkbokforing) titleCell.append(el("small", {}, "requires folkbokföring"));

    // Inline phase pill
    const phase = phaseById.get(t.phase_id);
    const phasePill = el("span", { class: "pill subtle inline-edit" }, phase?.name || "—");
    phasePill.onclick = (e) => { e.stopPropagation(); pickOne(phasePill, [["", "—"], ...state.phases.map(p => [p.id, p.name])], t.phase_id, v => save(t, { phase_id: v || null })); };

    // Inline status pill
    const statusPill = el("span", { class: `pill status-${t.status} inline-edit` }, statusLabel(t.status));
    statusPill.onclick = (e) => { e.stopPropagation(); pickOne(statusPill, STATUS_OPTIONS.map(s => [s, statusLabel(s)]), t.status, v => save(t, { status: v })); };

    // Inline priority pill
    const prioPill = el("span", { class: `pill pri-${t.priority} inline-edit` }, t.priority);
    prioPill.onclick = (e) => { e.stopPropagation(); pickOne(prioPill, PRIORITY_OPTIONS.map(p => [p, p]), t.priority, v => save(t, { priority: v })); };

    // Inline person avatar
    const personCell = personChip(t.assigned_to);
    personCell.classList.add("inline-edit");
    personCell.onclick = (e) => { e.stopPropagation(); pickOne(personCell, ASSIGNED_OPTIONS.map(a => [a, personLabelFor(a)]), t.assigned_to, v => save(t, { assigned_to: v })); };

    const tr = el("tr", { class: overdue ? "overdue" : "" },
      titleCell,
      el("td", { class: "col-meta" }, phasePill),
      el("td", {}, statusPill),
      el("td", {}, prioPill),
      el("td", {}, personCell),
      el("td", { class: "col-target col-meta" }, t.target_date ? fmtDate(t.target_date) : "—"),
      el("td", { class: "col-meta" }, fmtRelative(t.updated_at)),
    );
    tr.onclick = () => actions.openTask(t.id);
    return tr;
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
      const newSpan = el("span", { class: "inline-title" }, task.title);
      newSpan.title = "Double-click to rename";
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
  const initial = { linus: "L", oscar: "O", both: "LO" }[v] || "—";
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
      const wrap = el("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } });
      const opts = [["", "Anyone"], ["linus", ROLE_LABELS.linus], ["oscar", ROLE_LABELS.helper], ["both", "Both"]];
      for (const [val, label] of opts) {
        const item = el("button", {
          class: "btn ghost",
          style: {
            justifyContent: "flex-start",
            background: filterState.assigned === val ? "var(--bg-elev-2)" : "",
          },
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
        selectField("Status", filterState.status, [["", "Any status"], ...["not_started","preparing","ready","in_progress","waiting","blocked","completed","not_needed"].map(s => [s, statusLabel(s)])], v => filterState.status = v),
        selectField("Priority", filterState.priority, [["", "Any"], ["urgent","Urgent"], ["high","High"], ["medium","Medium"], ["low","Low"]], v => filterState.priority = v),
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

function sortBtn(onChange) {
  // (Sort just returns a stable list right now; expose the picker for parity/discoverability.)
  const b = el("button", { class: "btn" },
    el("span", { class: "icon" }, "⇅"),
    "Sort",
  );
  b.onclick = () => {};  // no-op for now; sort is fixed to status/priority/updated
  b.title = "Sorted by status then priority";
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

// Small option-picker popover shared by all inline pills.
function pickOne(anchor, options, currentValue, onPick) {
  popoverFrom(anchor, ({ close }) => {
    const wrap = el("div", { style: { display: "flex", flexDirection: "column", gap: "2px", minWidth: "180px" } });
    for (const [val, label] of options) {
      const item = el("button", {
        class: "btn ghost",
        style: {
          justifyContent: "flex-start",
          background: String(currentValue) === String(val) ? "var(--bg-elev-2)" : "",
        },
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
    const openOrder = { in_progress: 1, ready: 2, preparing: 3, not_started: 4, waiting: 5, blocked: 6, completed: 7, not_needed: 8 };
    const oa = openOrder[a.status] || 9;
    const ob = openOrder[b.status] || 9;
    if (oa !== ob) return oa - ob;
    const pa = { urgent: 1, high: 2, medium: 3, low: 4 }[a.priority] || 5;
    const pb = { urgent: 1, high: 2, medium: 3, low: 4 }[b.priority] || 5;
    if (pa !== pb) return pa - pb;
    return new Date(b.updated_at) - new Date(a.updated_at);
  });
}
