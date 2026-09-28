import { el, clear, toast } from "./util.js";
import { ROLE_LABELS, SUPABASE_URL } from "./config.js";
import {
  currentSession, currentProfile, onAuthChange, signOut,
  loadPhases, loadCategories, loadTasks, loadDependencies,
  createTask, subscribeTaskChanges,
} from "./store.js";
import { renderAuth } from "./views/auth.js";
import { renderHome } from "./views/home.js";
import { renderBoard, setPhaseFilter } from "./views/board.js";
import { renderVault } from "./views/vault.js";
import { openTaskDrawer, closeDrawer } from "./views/task.js";

const main       = document.getElementById("main");
const sideNavPh  = document.getElementById("side-nav-phases");
const sidePri    = document.getElementById("side-nav-primary");
const bottomNav  = document.getElementById("bottom-nav");
const signoutBtn = document.getElementById("signout-btn");
const userChip   = document.getElementById("user-chip");

const state = {
  profile:    null,
  phases:     [],
  categories: [],
  tasks:      [],
  deps:       [],
};

// ---------- Boot -----------------------------------------------------------
async function boot() {
  if (!SUPABASE_URL || SUPABASE_URL.includes("YOUR-PROJECT")) {
    main.innerHTML = `
      <div class="empty">
        <p>Please open <code>src/config.js</code> and fill in your Supabase URL and anon key,
        then reload the page.</p>
        <p>Instructions in the README.</p>
      </div>`;
    return;
  }

  onAuthChange(async (session) => {
    if (!session) return renderAuthScreen();
    await afterSignIn();
  });

  const session = await currentSession();
  if (!session) return renderAuthScreen();
  await afterSignIn();
}

function renderAuthScreen() {
  document.body.classList.add("auth-mode");
  document.getElementById("sidebar").style.display = "none";
  bottomNav.style.display = "none";
  renderAuth(main, boot);
}

async function afterSignIn() {
  document.body.classList.remove("auth-mode");
  document.getElementById("sidebar").style.display = "";
  bottomNav.style.display = "";
  signoutBtn.hidden = false;
  signoutBtn.onclick = async () => { await signOut(); location.hash = "#/"; boot(); };

  await refreshAll();
  paintSidebar();
  route();

  // Realtime task updates
  subscribeTaskChanges(async () => {
    state.tasks = await loadTasks();
    if (currentRoute().name === "home" || currentRoute().name === "board") route();
  });
}

async function refreshAll() {
  state.profile = await currentProfile();
  if (userChip) userChip.textContent = state.profile
    ? `${state.profile.display_name} · ${roleLabel(state.profile.role)}`
    : "";
  const [phases, categories, tasks, deps] = await Promise.all([
    loadPhases(), loadCategories(), loadTasks(), loadDependencies(),
  ]);
  state.phases = phases; state.categories = categories; state.tasks = tasks; state.deps = deps;
}

// ---------- Sidebar --------------------------------------------------------
function paintSidebar() {
  // Primary nav active state
  const r = currentRoute();
  for (const link of sidePri.querySelectorAll(".side-item")) {
    link.classList.remove("active");
    const target = link.getAttribute("href");
    if ((target === "#/" && r.name === "home")
      || (target === "#/board" && r.name === "board" && !r.params.phase)
      || (target === "#/vault" && r.name === "vault")) {
      link.classList.add("active");
    }
  }

  // Total open-task count (all tasks minus completed/not_needed)
  const openTasks = state.tasks.filter(t => !["completed","not_needed"].includes(t.status));
  const countAll = document.getElementById("count-all");
  if (countAll) countAll.textContent = openTasks.length;

  // Per-phase counts
  const phaseOpenCounts = new Map();
  for (const t of openTasks) {
    if (t.phase_id) phaseOpenCounts.set(t.phase_id, (phaseOpenCounts.get(t.phase_id) || 0) + 1);
  }

  // Sidebar search filter
  const searchInput = document.getElementById("side-search");
  const q = (searchInput?.value || "").toLowerCase().trim();

  // Phase list
  clear(sideNavPh);
  for (const p of state.phases) {
    if (q && !p.name.toLowerCase().includes(q)) continue;
    const count = phaseOpenCounts.get(p.id) || 0;
    const link = el("a", { class: "side-item", href: `#/board?phase=${p.slug}` },
      el("span", { class: "side-glyph" }, phaseGlyph(p.slug)),
      el("span", {}, p.name),
      count ? el("span", { class: "side-count" }, count) : null,
    );
    if (r.name === "board" && r.params.phase === p.slug) link.classList.add("active");
    sideNavPh.append(link);
  }

  // Bottom nav active
  for (const a of bottomNav.querySelectorAll("a")) {
    a.classList.remove("active");
    if ((a.dataset.nav === "home" && r.name === "home")
      || (a.dataset.nav === "board" && r.name === "board")
      || (a.dataset.nav === "vault" && r.name === "vault")) {
      a.classList.add("active");
    }
  }

  // Wire the sidebar search once
  if (searchInput && !searchInput.dataset.wired) {
    searchInput.dataset.wired = "1";
    searchInput.oninput = () => paintSidebar();
  }
}

function phaseGlyph(slug) {
  return {
    prepare_now: "P",
    december_visit: "D",
    waiting_for_registration: "W",
    before_leaving_england: "L",
    first_week: "1",
    first_month: "M",
    longer_term: "∞",
  }[slug] || "•";
}

// ---------- Routing --------------------------------------------------------
function currentRoute() {
  const hash = location.hash || "#/";
  const [pathRaw, query = ""] = hash.slice(1).split("?");
  const path = pathRaw || "/";
  const params = Object.fromEntries(new URLSearchParams(query));
  if (path.startsWith("/task/")) {
    return { name: "task", params: { id: path.slice("/task/".length) } };
  }
  if (path === "/board") return { name: "board", params };
  if (path === "/vault") return { name: "vault", params };
  return { name: "home", params };
}

async function route() {
  const r = currentRoute();
  closeDrawer();
  if (r.name === "home")  renderHome(main, state, appActions);
  if (r.name === "board") {
    setPhaseFilter(r.params.phase || "");
    renderBoard(main, state, appActions);
  }
  if (r.name === "vault") renderVault(main, state);
  if (r.name === "task") {
    // Show board underneath if nothing rendered
    if (!main.hasChildNodes()) renderBoard(main, state, appActions);
    openTaskDrawer(r.params.id, state, async () => {
      state.tasks = await loadTasks();
      if (currentRoute().name === "board") renderBoard(main, state, appActions);
      if (currentRoute().name === "home")  renderHome(main, state, appActions);
      paintSidebar();
    });
  }
  paintSidebar();
}

window.addEventListener("hashchange", route);

// ---------- Actions passed to views ----------------------------------------
const appActions = {
  openTask(id) { location.hash = `#/task/${id}`; },
  updatePhaseHash(slug) { history.replaceState(null, "", slug ? `#/board?phase=${slug}` : "#/board"); paintSidebar(); },
  async createTask() {
    const title = prompt("New task title");
    if (!title || !title.trim()) return;
    try {
      const t = await createTask({
        title: title.trim(),
        phase_id: state.phases.find(p => p.slug === "prepare_now")?.id || null,
        status: "not_started", priority: "medium", assigned_to: "both",
      });
      state.tasks = await loadTasks();
      location.hash = `#/task/${t.id}`;
    } catch (err) { toast(err.message, "error"); }
  },
  async createTaskIn({ title, category_id, phase_id }) {
    try {
      const t = await createTask({
        title,
        category_id,
        phase_id: phase_id || state.phases.find(p => p.slug === "prepare_now")?.id || null,
        status: "not_started", priority: "medium", assigned_to: "both",
      });
      state.tasks = await loadTasks();
      location.hash = `#/task/${t.id}`;
    } catch (err) { toast(err.message, "error"); }
  },
};

function roleLabel(r) { return ROLE_LABELS[r] || r; }

boot();
