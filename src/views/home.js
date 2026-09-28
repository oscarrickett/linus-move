import { el, clear, fmtDate, fmtRelative, daysBetween, statusLabel } from "../util.js";
import { MOVE_DATE } from "../config.js";
import { ROLE_LABELS } from "../config.js";
import {
  nextActions, urgentAndOverdue, waitingTasks, needsHelpTasks, progress,
} from "../helper.js";

export function renderHome(root, state, actions) {
  clear(root);
  const { tasks, deps, profile } = state;
  const role = profile?.role || "helper";

  root.append(hero(profile));

  const prog = progress(tasks);
  root.append(
    el("div", { class: "section" },
      el("div", { class: "section-head" },
        el("h2", {}, "Overall progress"),
        el("span", { class: "section-hint" }, `${prog.done} of ${prog.total} done · ${prog.pct}%`),
      ),
      el("div", { class: "progress" }, el("span", { style: { width: `${prog.pct}%` } })),
    ),
  );

  // Next 3 recommended actions
  const next = nextActions(tasks, deps, { role, limit: 3 });
  root.append(section(
    "Your next 3 actions",
    "calm and clear; nothing more",
    next.length
      ? rowsList(next.map(n => actionRow(n, actions)))
      : emptyEl("Nothing pressing right now."),
  ));

  // Needs help
  const help = needsHelpTasks(tasks);
  if (help.length) {
    root.append(section(
      "Marked 'I need help'",
      "Oscar can pick these up",
      rowsList(help.slice(0, 6).map(t => taskRow(t, actions, { helpTint: true })), { help: true }),
    ));
  }

  // Urgent / overdue
  const urgent = urgentAndOverdue(tasks).slice(0, 5);
  if (urgent.length) {
    root.append(section(
      "Urgent or overdue",
      "on the critical path or past due",
      rowsList(urgent.map(t => taskRow(t, actions))),
    ));
  }

  // Waiting
  const waiting = waitingTasks(tasks).slice(0, 5);
  if (waiting.length) {
    root.append(section(
      "Waiting for a response",
      "no action needed right now",
      rowsList(waiting.map(t => taskRow(t, actions))),
    ));
  }
}

function hero(profile) {
  const days = daysBetween(new Date(), MOVE_DATE);
  const first = (profile?.display_name || "").split(/[\s.]+/)[0];
  const name  = first ? first.charAt(0).toUpperCase() + first.slice(1) : "";
  const greeting = name ? `Hej ${name}` : "Hej";
  const label = days > 1 ? `dagar kvar tills flyttdagen (${fmtDate(MOVE_DATE)})`
               : days === 1 ? "en dag kvar" : days === 0 ? "idag" : `dagar sedan flyttdagen`;
  return el("div", { class: "hero" },
    el("div", { class: "hero-flag" }),
    el("div", {},
      el("h1", { class: "hero-title" },
        el("span", { class: "flag-icon" }),
        greeting + " · Linus till Sverige"),
      el("div", { class: "hero-sub" }, "Vägen hem. Small steps, together."),
    ),
    el("div", { class: "countdown" },
      el("div", { class: "countdown-num" }, Math.abs(days).toString()),
      el("div", { class: "countdown-label" }, label),
    ),
  );
}

function section(title, hint, body) {
  return el("div", { class: "section" },
    el("div", { class: "section-head" },
      el("h2", {}, title),
      hint ? el("span", { class: "section-hint" }, hint) : null,
    ),
    body,
  );
}

function emptyEl(text) { return el("div", { class: "empty" }, text); }

function rowsList(rows, opts = {}) {
  return el("div", { class: "rows" + (opts.help ? " help-strip" : "") }, ...rows);
}

function actionRow(entry, actions) {
  const { task, reason } = entry;
  const row = el("div", { class: "row" },
    el("div", {},
      el("div", { class: "row-title" }, task.title),
      el("div", { class: "row-reason" }, reason),
    ),
    el("span", { class: `pill status-${task.status}` }, statusLabel(task.status)),
    el("span", { class: `pill pri-${task.priority}` }, task.priority),
    el("span", { class: "row-meta" }, task.target_date ? fmtDate(task.target_date) : ""),
  );
  row.onclick = () => actions.openTask(task.id);
  return row;
}

function taskRow(task, actions, opts = {}) {
  const row = el("div", { class: "row" },
    el("div", {},
      el("div", { class: "row-title" }, task.title),
      el("div", { class: "row-reason" }, opts.helpTint ? "Linus asked for help with this." : personLabel(task.assigned_to)),
    ),
    el("span", { class: `pill status-${task.status}` }, statusLabel(task.status)),
    el("span", { class: `pill pri-${task.priority}` }, task.priority),
    el("span", { class: "row-meta" }, task.target_date ? fmtDate(task.target_date) : fmtRelative(task.updated_at)),
  );
  row.onclick = () => actions.openTask(task.id);
  return row;
}

function personLabel(v) {
  if (v === "linus") return ROLE_LABELS.linus;
  if (v === "oscar") return ROLE_LABELS.helper;
  if (v === "both")  return "Both";
  return "Unassigned";
}
