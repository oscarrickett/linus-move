// Small DOM + date helpers. No dependencies.

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "style" && typeof v === "object") Object.assign(node.style, v);
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (k === "dataset" && typeof v === "object") {
      for (const [dk, dv] of Object.entries(v)) node.dataset[dk] = dv;
    } else if (v === true) node.setAttribute(k, "");
    else node.setAttribute(k, v);
  }
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

export function daysBetween(from, to) {
  const a = new Date(from), b = new Date(to);
  a.setHours(0,0,0,0); b.setHours(0,0,0,0);
  return Math.round((b - a) / 86400000);
}

export function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function fmtRelative(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff/60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff/3600)} h ago`;
  const days = Math.floor(diff/86400);
  if (days < 30) return `${days} d ago`;
  return fmtDate(iso);
}

export function statusLabel(s) {
  return {
    not_started:  "Not started",
    preparing:    "Preparing",
    ready:        "Ready to do",
    in_progress:  "In progress",
    waiting:      "Waiting",
    blocked:      "Blocked",
    completed:    "Completed",
    not_needed:   "Not needed",
  }[s] || s;
}

export function priorityLabel(p) {
  return { low: "Low", medium: "Medium", high: "High", urgent: "Urgent" }[p] || p;
}

export const STATUS_OPTIONS = [
  "not_started","preparing","ready","in_progress","waiting","blocked","completed","not_needed"
];
export const PRIORITY_OPTIONS = ["low","medium","high","urgent"];
export const ASSIGNED_OPTIONS  = ["linus","oscar","both","unassigned"];
export const MODE_OPTIONS      = ["either","online","in_person"];

export function toast(msg, kind = "info") {
  const root = document.getElementById("toast-root");
  const t = el("div", { class: "toast" + (kind === "error" ? " error" : "") }, msg);
  root.append(t);
  setTimeout(() => { t.style.opacity = "0"; t.style.transition = "opacity 0.3s"; }, 2600);
  setTimeout(() => t.remove(), 3000);
}

export function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
