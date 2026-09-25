import { el, clear, fmtDate, fmtRelative, daysBetween, statusLabel } from "../util.js";
import { MOVE_DATE, ROLE_LABELS } from "../config.js";
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

  // Next actions
  const next = nextActions(tasks, deps, { role, limit: 3 });
  root.append(section(
    "Your next 3 actions",
    "calm and clear; nothing more",
    next.length
      ? el("div", { class: "cards" }, ...next.map(n => actionCard(n, actions)))
      : emptyEl("Nothing pressing right now. Nice."),
  ));

  // Needs help
  const help = needsHelpTasks(tasks);
  if (help.length) {
    root.append(section(
      "Marked ‘I need help’",
      "Oscar can pick these up",
      el("div", { class: "cards" }, ...help.slice(0, 6).map(t => helpCard(t, actions))),
    ));
  }

  // Urgent / overdue
  const urgent = urgentAndOverdue(tasks).slice(0, 5);
  if (urgent.length) {
    root.append(section(
      "Urgent or overdue",
      "on the critical path or past due",
      el("div", { class: "cards" }, ...urgent.map(t => taskCard(t, actions))),
    ));
  }

  // Waiting
  const waiting = waitingTasks(tasks).slice(0, 5);
  if (waiting.length) {
    root.append(section(
      "Waiting for a response",
      "no action needed right now",
      el("div", { class: "cards" }, ...waiting.map(t => taskCard(t, actions))),
    ));
  }
}

function hero(profile) {
  const days = daysBetween(new Date(), MOVE_DATE);
  const label = days > 1 ? `days until the move (${fmtDate(MOVE_DATE)})`
               : days === 1 ? "day to go" : days === 0 ? "today" : `days since the move`;
  return el("div", { class: "hero" },
    el("div", {},
      el("h1", { class: "hero-title" }, `Hi${profile ? " " + (profile.display_name || "").split(" ")[0] : ""}.`),
      el("div", { class: "hero-sub" }, "The move plan lives here. Small steps, together."),
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

function actionCard(entry, actions) {
  const { task, reason } = entry;
  const card = el("div", { class: "card" },
    el("div", { class: "card-title" }, task.title),
    el("div", { class: "card-reason" }, reason),
    el("div", { class: "card-row" },
      el("span", { class: `pill status-${task.status}` }, statusLabel(task.status)),
      el("span", { class: `pill pri-${task.priority}` }, task.priority),
      task.target_date ? el("span", { class: "card-meta" }, "· " + fmtDate(task.target_date)) : null,
    ),
  );
  card.onclick = () => actions.openTask(task.id);
  return card;
}

function taskCard(task, actions) {
  const card = el("div", { class: "card" },
    el("div", { class: "card-title" }, task.title),
    el("div", { class: "card-row" },
      el("span", { class: `pill status-${task.status}` }, statusLabel(task.status)),
      el("span", { class: `pill pri-${task.priority}` }, task.priority),
      task.target_date ? el("span", { class: "card-meta" }, "· " + fmtDate(task.target_date)) : null,
    ),
    el("div", { class: "card-meta" }, "Updated " + fmtRelative(task.updated_at)),
  );
  card.onclick = () => actions.openTask(task.id);
  return card;
}

function helpCard(task, actions) {
  const card = el("div", { class: "card help-card" },
    el("div", { class: "card-title" }, task.title),
    el("div", { class: "card-reason" }, "Linus asked for help with this."),
    el("div", { class: "card-row" },
      el("span", { class: `pill status-${task.status}` }, statusLabel(task.status)),
      el("span", { class: `pill pri-${task.priority}` }, task.priority),
    ),
  );
  card.onclick = () => actions.openTask(task.id);
  return card;
}
