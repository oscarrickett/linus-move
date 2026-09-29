// Deterministic "what should Linus do next?" scorer.
// Takes the loaded tasks + dependencies, returns a short recommended list
// plus a human sentence explaining why.

import { daysBetween } from "./util.js";
import { MOVE_DATE } from "./config.js";

const PRIO_WEIGHT = { urgent: 40, high: 25, medium: 12, low: 4 };

export function computeBlockingCounts(tasks, deps) {
  const openIds = new Set(
    tasks.filter(t => t.status !== "completed").map(t => t.id)
  );
  const counts = new Map();
  for (const d of deps) {
    if (openIds.has(d.task_id)) {
      counts.set(d.depends_on_task_id, (counts.get(d.depends_on_task_id) || 0) + 1);
    }
  }
  return counts;
}

export function unmetDependencies(task, tasks, deps) {
  const byId = new Map(tasks.map(t => [t.id, t]));
  return deps
    .filter(d => d.task_id === task.id)
    .map(d => byId.get(d.depends_on_task_id))
    .filter(t => t && t.status !== "completed");
}

export function scoreTask(task, ctx) {
  if (task.status === "completed") return -Infinity;

  let score = PRIO_WEIGHT[task.priority] ?? 0;

  if (task.target_date) {
    const days = daysBetween(new Date(), task.target_date);
    if (days < 0)       score += 60;
    else if (days <= 3) score += 40;
    else if (days <= 7) score += 25;
    else if (days <= 30) score += 12;
    else score += 4;
  } else {
    const daysToMove = daysBetween(new Date(), MOVE_DATE);
    if (daysToMove > 0 && daysToMove < 60) score += 6;
  }

  const blocking = ctx.blocking.get(task.id) || 0;
  score += Math.min(blocking * 8, 32);

  const unmet = unmetDependencies(task, ctx.tasks, ctx.deps);
  if (unmet.length > 0) score -= 20;

  if (task.status === "in_progress") score += 8;

  return score;
}

export function nextActions(tasks, deps, { role, limit = 3 } = {}) {
  const ctx = { tasks, deps, blocking: computeBlockingCounts(tasks, deps) };

  const eligible = tasks
    .filter(t => t.status !== "completed")
    .filter(t => {
      if (!role || role === "helper" || role === "family") return true;
      // For Linus: hide tasks assigned only to Oscar
      return t.assigned_to !== "oscar";
    });

  const scored = eligible
    .map(t => ({ task: t, score: scoreTask(t, ctx), unmet: unmetDependencies(t, tasks, deps) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(x => ({ ...x, reason: reasonFor(x.task, x.unmet, ctx.blocking.get(x.task.id) || 0) }));

  return scored;
}

function reasonFor(task, unmet, blockingCount) {
  const bits = [];
  if (task.target_date) {
    const d = daysBetween(new Date(), task.target_date);
    if (d < 0) bits.push(`overdue by ${Math.abs(d)} d`);
    else if (d <= 7) bits.push(`due in ${d} d`);
    else bits.push(`due ${task.target_date}`);
  }
  if (blockingCount > 0) bits.push(`unlocks ${blockingCount} other task${blockingCount === 1 ? "" : "s"}`);
  if (unmet.length > 0) bits.push(`waits on: ${unmet.map(u => u.title).slice(0,2).join(", ")}`);
  if (bits.length === 0) bits.push(`priority ${task.priority}`);
  return bits.join(" · ");
}

export function urgentAndOverdue(tasks) {
  const today = new Date();
  return tasks
    .filter(t => t.status !== "completed")
    .filter(t => t.priority === "urgent" || (t.target_date && daysBetween(today, t.target_date) <= 3))
    .sort((a, b) => {
      const ad = a.target_date ? daysBetween(today, a.target_date) : 999;
      const bd = b.target_date ? daysBetween(today, b.target_date) : 999;
      return ad - bd;
    });
}

export function waitingTasks() { return []; }   // no longer a status

export function needsHelpTasks(tasks) {
  return tasks.filter(t => t.needs_help && t.status !== "completed");
}

export function progress(tasks) {
  if (!tasks.length) return { done: 0, total: 0, pct: 0 };
  const done = tasks.filter(t => t.status === "completed").length;
  return { done, total: tasks.length, pct: Math.round((done / tasks.length) * 100) };
}
