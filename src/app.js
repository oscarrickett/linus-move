import { el, clear, toast } from "./util.js";
import { ROLE_LABELS, SUPABASE_URL } from "./config.js";
import {
  currentSession, currentProfile, onAuthChange, signOut,
  loadPhases, loadCategories, loadTasks, loadDependencies, loadProfiles,
  createTask, subscribeTaskChanges,
} from "./store.js";
import { renderAuth } from "./views/auth.js";
import { renderHome } from "./views/home.js";
import { renderBoard, setPhaseFilter, setExpandedTask } from "./views/board.js";
import { renderVault } from "./views/vault.js";
import { closeDrawer } from "./views/task.js";

const main       = document.getElementById("main");
const sideNavPh  = document.getElementById("side-nav-phases");
const sidePri    = document.getElementById("side-nav-primary");
const bottomNav  = document.getElementById("bottom-nav");
const signoutBtn = document.getElementById("signout-btn");
const userChip   = document.getElementById("user-chip");

const state = {
  profile:      null,
  profilesById: new Map(),
  phases:       [],
  categories:   [],
  tasks:        [],
  deps:         [],
};

let bootedForSession = null;  // last auth user id we booted for (guards against double-boot)

// Catch any silently rejected promise / uncaught error so we see it.
// The specific "reading 'length'" throw from GoTrueClient means the stored
// session is unparseable; nuke it and reload so the user sees the sign-in.
function maybeCorruptSession(err) {
  const msg = String(err?.message || err || "");
  return msg.includes("reading 'length'") || msg.includes("Invalid JWT") || msg.includes("token_hash");
}
function nukeSessionAndReload(reason) {
  console.warn("[session-reset]", reason);
  try {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith("sb-") || k.includes("supabase")) localStorage.removeItem(k);
    }
  } catch {}
  setTimeout(() => location.reload(), 400);
}
window.addEventListener("unhandledrejection", e => {
  console.error("[unhandled rejection]", e.reason);
  if (maybeCorruptSession(e.reason)) return nukeSessionAndReload("unhandledrejection");
  toast("Unhandled: " + (e.reason?.message || e.reason), "error");
});
window.addEventListener("error", e => {
  console.error("[window error]", e.error || e.message);
  if (maybeCorruptSession(e.error)) return nukeSessionAndReload("window error");
});

// ---------- Boot -----------------------------------------------------------
async function boot() {
  if (!SUPABASE_URL || SUPABASE_URL.includes("YOUR-PROJECT")) {
    main.innerHTML = `<div class="empty"><p>Fill in <code>src/config.js</code> then reload.</p></div>`;
    return;
  }

  // Register a SINGLE auth listener. The SDK fires INITIAL_SESSION on start
  // once localStorage has been read, then SIGNED_IN / SIGNED_OUT / TOKEN_REFRESHED.
  onAuthChange(async (session) => {
    console.log("[auth]", session ? `signed-in as ${session.user.email}` : "signed-out");
    if (!session) {
      bootedForSession = null;
      return renderAuthScreen();
    }
    if (bootedForSession === session.user.id) return;   // dedupe repeat fires
    bootedForSession = session.user.id;
    await afterSignIn();
  });

  // Safety net: if the SDK never fires the initial event (rare), fall back to auth.
  setTimeout(() => {
    if (bootedForSession === null && !document.body.classList.contains("auth-mode")) {
      currentSession().then(s => { if (!s) renderAuthScreen(); });
    }
  }, 800);
}

function renderAuthScreen() {
  document.body.classList.add("auth-mode");
  document.getElementById("sidebar").style.display = "none";
  bottomNav.style.display = "none";
  renderAuth(main, () => { /* onAuthChange handles the sign-in event */ });
}

async function afterSignIn() {
  document.body.classList.remove("auth-mode");
  document.getElementById("sidebar").style.display = "";
  bottomNav.style.display = "";
  signoutBtn.hidden = false;
  signoutBtn.onclick = async () => { await signOut(); location.hash = "#/"; };

  await refreshAll();
  paintSidebar();
  route();

  subscribeTaskChanges(async () => {
    state.tasks = await loadTasks();
    if (currentRoute().name === "home" || currentRoute().name === "board") route();
  });
}

async function refreshAll() {
  console.log("[refreshAll] starting");
  await Promise.all([
    step("profile",   () => currentProfile()).then(v => state.profile = v),
    step("profiles",  () => loadProfiles()).then(v => state.profilesById = new Map((v || []).map(p => [p.id, p]))),
    step("phases",    () => loadPhases()).then(v => state.phases = v),
    step("categories",() => loadCategories()).then(v => state.categories = v),
    step("tasks",     () => loadTasks()).then(v => state.tasks = v),
    step("deps",      () => loadDependencies()).then(v => state.deps = v),
  ]);
  if (userChip) userChip.textContent = state.profile
    ? `${state.profile.display_name} · ${roleLabel(state.profile.role)}`
    : "(no profile)";
  console.log("[refreshAll] final counts:", {
    profile: !!state.profile, phases: state.phases.length,
    categories: state.categories.length, tasks: state.tasks.length, deps: state.deps.length,
  });
}

async function step(name, fn) {
  const t0 = performance.now();
  console.log(`[load] ${name} start`);
  try {
    // Bail after 10s so we see a stall instead of hanging forever
    const result = await Promise.race([
      Promise.resolve().then(fn),
      new Promise((_, rej) => setTimeout(() => rej(new Error(`${name} timed out after 10s`)), 10000)),
    ]);
    console.log(`[load] ${name} ok in ${Math.round(performance.now() - t0)}ms; length=${Array.isArray(result) ? result.length : (result ? "1" : "0")}`);
    return result;
  } catch (err) {
    console.error(`[load] ${name} FAILED:`, err);
    toast(`${name} load failed: ${err.message}`, "error");
    return Array.isArray(fn.length) ? [] : null;
  }
}

// ---------- Sidebar --------------------------------------------------------
function paintSidebar() {
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

  const openTasks = state.tasks.filter(t => !["completed","not_needed"].includes(t.status));
  const countAll = document.getElementById("count-all");
  if (countAll) countAll.textContent = openTasks.length;

  const phaseOpenCounts = new Map();
  for (const t of openTasks) {
    if (t.phase_id) phaseOpenCounts.set(t.phase_id, (phaseOpenCounts.get(t.phase_id) || 0) + 1);
  }

  const searchInput = document.getElementById("side-search");
  const q = (searchInput?.value || "").toLowerCase().trim();

  clear(sideNavPh);
  for (const p of state.phases) {
    if (q && !p.name.toLowerCase().includes(q)) continue;
    const count = phaseOpenCounts.get(p.id) || 0;
    const link = el("a", { class: "side-item", href: `#/board?phase=${p.slug}` },
      el("span", { class: "side-glyph flag" }),
      el("span", {}, p.name),
      count ? el("span", { class: "side-count" }, count) : null,
    );
    if (r.name === "board" && r.params.phase === p.slug) link.classList.add("active");
    sideNavPh.append(link);
  }

  for (const a of bottomNav.querySelectorAll("a")) {
    a.classList.remove("active");
    if ((a.dataset.nav === "home" && r.name === "home")
      || (a.dataset.nav === "board" && r.name === "board")
      || (a.dataset.nav === "vault" && r.name === "vault")) {
      a.classList.add("active");
    }
  }

  if (searchInput && !searchInput.dataset.wired) {
    searchInput.dataset.wired = "1";
    searchInput.oninput = () => paintSidebar();
  }
}

// ---------- Routing --------------------------------------------------------
function currentRoute() {
  const hash = location.hash || "#/";
  const [pathRaw, query = ""] = hash.slice(1).split("?");
  const path = pathRaw || "/";
  const params = Object.fromEntries(new URLSearchParams(query));
  if (path.startsWith("/task/")) return { name: "task", params: { id: path.slice("/task/".length) } };
  if (path === "/board") return { name: "board", params };
  if (path === "/vault") return { name: "vault", params };
  return { name: "home", params };
}

async function route() {
  const r = currentRoute();
  closeDrawer();
  if (r.name === "home")  { setExpandedTask(null); renderHome(main, state, appActions); }
  if (r.name === "board") {
    setPhaseFilter(r.params.phase || "");
    renderBoard(main, state, appActions);
  }
  if (r.name === "vault") { setExpandedTask(null); renderVault(main, state); }
  if (r.name === "task") {
    // Task URLs now expand the row inline on the board.
    setExpandedTask(r.params.id);
    setPhaseFilter("");
    renderBoard(main, state, appActions);
    // Scroll the expanded row into view once painted.
    requestAnimationFrame(() => {
      const row = document.querySelector("tr.expanded");
      if (row) row.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
  paintSidebar();
}

window.addEventListener("hashchange", route);

// ---------- Actions passed to views ----------------------------------------
const appActions = {
  openTask(id) { location.hash = `#/task/${id}`; },
  toggleExpand(id) {
    const r = currentRoute();
    const isBoard = r.name === "board" || r.name === "task";
    const currentlyExpanded = r.name === "task" && r.params.id === id;
    if (currentlyExpanded) {
      // Collapse -> back to board (preserving phase if any)
      const q = r.params.phase ? `?phase=${r.params.phase}` : "";
      location.hash = `#/board${q}`;
    } else {
      location.hash = `#/task/${id}`;
    }
  },
  updatePhaseHash(slug) { history.replaceState(null, "", slug ? `#/board?phase=${slug}` : "#/board"); paintSidebar(); },
  async refresh() { state.tasks = await loadTasks(); route(); paintSidebar(); },
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
