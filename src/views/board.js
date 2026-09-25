import { el, clear, fmtRelative, fmtDate, statusLabel } from "../util.js";
import { ROLE_LABELS } from "../config.js";

// Filter state persisted per session
const filterState = {
  phase: "",        // phase slug or ""
  category: "",
  status: "",
  assigned: "",
  priority: "",
  needsHelp: false,
  requiresFolk: false,
  mode: "",
  search: "",
};

export function setPhaseFilter(slug) {
  filterState.phase = slug || "";
}

export function renderBoard(root, state, actions) {
  clear(root);
  const { tasks, phases, categories } = state;

  const phaseBySlug = new Map(phases.map(p => [p.slug, p]));
  const catById     = new Map(categories.map(c => [c.id, c]));
  const phaseById   = new Map(phases.map(p => [p.id, p]));

  // Head
  const phaseObj = filterState.phase ? phaseBySlug.get(filterState.phase) : null;
  root.append(
    el("div", { class: "page-head" },
      el("h1", { class: "page-title" }, phaseObj ? phaseObj.name : "All tasks"),
      el("span", { class: "page-sub" }, `${filteredTasks(tasks, catById, phaseById).length} shown`),
    ),
  );

  // Toolbar
  const bar = el("div", { class: "toolbar" });
  bar.append(
    button("+ New task", () => actions.createTask(), true),
    selectCtl("Phase", filterState.phase, [["", "All phases"], ...phases.map(p => [p.slug, p.name])], v => { filterState.phase = v; render(); actions.updatePhaseHash(v); }),
    selectCtl("Category", filterState.category, [["", "All categories"], ...categories.map(c => [c.id, c.name])], v => { filterState.category = v; render(); }),
    selectCtl("Status", filterState.status, [["", "Any status"], ...["not_started","preparing","ready","in_progress","waiting","blocked","completed","not_needed"].map(s => [s, statusLabel(s)])], v => { filterState.status = v; render(); }),
    selectCtl("Assigned", filterState.assigned, [["", "Anyone"], ["linus", ROLE_LABELS.linus], ["oscar", ROLE_LABELS.helper], ["both", "Both"]], v => { filterState.assigned = v; render(); }),
    selectCtl("Priority", filterState.priority, [["", "Any"], ["urgent","Urgent"], ["high","High"], ["medium","Medium"], ["low","Low"]], v => { filterState.priority = v; render(); }),
    selectCtl("Mode", filterState.mode, [["", "Any"], ["online","Online"], ["in_person","In person"], ["either","Either"]], v => { filterState.mode = v; render(); }),
    toggleBtn("Needs help", filterState.needsHelp, v => { filterState.needsHelp = v; render(); }),
    toggleBtn("Requires folkbokföring", filterState.requiresFolk, v => { filterState.requiresFolk = v; render(); }),
    (() => {
      const input = el("input", { class: "input", type: "search", placeholder: "Search title…", style: { maxWidth: "220px" } });
      input.value = filterState.search;
      input.oninput = () => { filterState.search = input.value; render(); };
      return input;
    })(),
  );
  root.append(bar);

  // Groups (by category within the selected phase, or by phase overall)
  const groupsWrap = el("div");
  root.append(groupsWrap);

  render();

  function render() {
    clear(groupsWrap);
    const list = filteredTasks(tasks, catById, phaseById);

    if (!list.length) {
      groupsWrap.append(el("div", { class: "empty" }, "No tasks match those filters."));
      return;
    }

    // Group by category always; phase filter narrows the list first.
    const byCat = new Map();
    for (const t of list) {
      const cat = catById.get(t.category_id);
      const key = cat?.id || "uncat";
      if (!byCat.has(key)) byCat.set(key, { cat, items: [] });
      byCat.get(key).items.push(t);
    }
    const groups = [...byCat.values()].sort((a, b) => (a.cat?.sort_order ?? 99) - (b.cat?.sort_order ?? 99));
    for (const g of groups) {
      groupsWrap.append(renderGroup(g.cat, g.items));
    }
  }

  function renderGroup(cat, items) {
    const group = el("div", { class: "group" });
    group.append(
      el("div", { class: "group-head" },
        el("div", { class: "cat-dot", style: { background: cat?.color || "#8892a0" } }),
        el("h3", {}, cat?.name || "Uncategorised"),
        el("span", { class: "group-count" }, `${items.length} item${items.length === 1 ? "" : "s"}`),
      ),
    );
    const table = el("table", { class: "table" },
      el("thead", {},
        el("tr", {},
          el("th", { style: { width: "40%" } }, "Task"),
          el("th", {}, "Phase"),
          el("th", {}, "Status"),
          el("th", {}, "Priority"),
          el("th", {}, "Assigned"),
          el("th", {}, "Target"),
          el("th", {}, "Updated"),
        ),
      ),
      el("tbody", {},
        ...items.map(t => {
          const tr = el("tr", {},
            el("td", { class: "col-title" },
              t.title,
              t.needs_help ? el("span", { class: "help-flag" }, "· needs help") : null,
              t.requires_folkbokforing ? el("span", { class: "card-meta" }, "  · req. folkbokföring") : null,
            ),
            el("td", { class: "card-meta" }, phaseById.get(t.phase_id)?.name || ""),
            el("td", {}, el("span", { class: `pill status-${t.status}` }, statusLabel(t.status))),
            el("td", {}, el("span", { class: `pill pri-${t.priority}` }, t.priority)),
            el("td", { class: "card-meta" }, assignedLabel(t.assigned_to)),
            el("td", { class: "card-meta" }, t.target_date ? fmtDate(t.target_date) : "—"),
            el("td", { class: "card-meta" }, fmtRelative(t.updated_at)),
          );
          tr.onclick = () => actions.openTask(t.id);
          return tr;
        }),
      ),
    );
    group.append(table);
    return group;
  }
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
    // Sort by status (open first), then priority, then updated_at
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

function assignedLabel(v) {
  if (v === "linus") return ROLE_LABELS.linus;
  if (v === "oscar") return ROLE_LABELS.helper;
  if (v === "both")  return "Both";
  return "—";
}

function button(label, onClick, primary) {
  const b = el("button", { class: "btn" + (primary ? " primary" : "") }, label);
  b.onclick = onClick;
  return b;
}

function selectCtl(label, value, options, onChange) {
  const sel = el("select", { class: "select", style: { width: "auto" } });
  for (const [v, l] of options) {
    const o = el("option", { value: v }, l);
    if (v === value) o.selected = true;
    sel.append(o);
  }
  sel.onchange = () => onChange(sel.value);
  return sel;
}

function toggleBtn(label, active, onChange) {
  const b = el("button", { class: "btn" + (active ? " primary" : "") }, label);
  b.onclick = () => onChange(!active);
  return b;
}
