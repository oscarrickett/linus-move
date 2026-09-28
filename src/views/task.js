// Minimal inline task detail: just a comment thread with an obvious close.
// (Status / priority / assignee / phase are already inline-editable on the
//  row itself; there's no drawer.)

import { el, clear, fmtRelative, toast, escapeHtml } from "../util.js";
import {
  loadTask,
  loadComments, addComment, subscribeCommentsForTask,
} from "../store.js";

const activeSubs = new WeakMap();

export async function renderInlineDetail(container, task, state, onChange) {
  clear(container);
  const panel = el("div", { class: "detail-panel comments-only" });
  container.append(panel);

  // Header: close button + task title (for context)
  const head = el("div", { class: "detail-head" });
  const close = el("button", { class: "detail-close", "aria-label": "Close" }, "×");
  close.onclick = (e) => { e.stopPropagation(); collapseBoard(); };
  head.append(
    close,
    el("div", { class: "detail-title" }, task.title || "…"),
  );
  panel.append(head);

  // Loading state
  const commentsWrap = el("div", { class: "comments-wrap" },
    el("div", { class: "empty small" }, "Loading…")
  );
  panel.append(commentsWrap);

  // Load the full task (in case the row-lite version is stale) and comments
  const [full, comments] = await Promise.all([
    loadTask(task.id).catch(() => task),
    loadComments(task.id).catch(() => []),
  ]);
  Object.assign(task, full || {});

  renderComments(commentsWrap, comments, task.id, state);
}

export function teardownDetail(container) {
  const unsub = activeSubs.get(container);
  if (unsub) { try { unsub(); } catch {} activeSubs.delete(container); }
}

function collapseBoard() {
  // Drop /task/:id from the hash but keep any phase filter.
  const hash = location.hash || "";
  const phaseMatch = hash.match(/[?&]phase=([^&]+)/);
  location.hash = phaseMatch ? `#/board?phase=${phaseMatch[1]}` : "#/board";
}

function renderComments(container, initial, taskId, state) {
  clear(container);
  const thread = el("div", { class: "thread" });
  container.append(thread);

  const items = [...initial];

  function paint() {
    clear(thread);
    if (!items.length) thread.append(el("div", { class: "empty small" }, "No comments yet."));
    for (const c of items) thread.append(msg(c));
    const input = el("textarea", { class: "textarea", placeholder: "Write a comment… links are turned into clickable links automatically." });
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
    input.onkeydown = (e) => {
      // Cmd/Ctrl+Enter posts
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") send.onclick();
    };
    thread.append(el("div", { class: "msg-input" }, input, send));
  }

  function msg(c) {
    const author = authorName(c.author_id, state);
    const body = el("div", { class: "msg-body" });
    body.innerHTML = autolink(c.body);
    return el("div", { class: "msg" },
      el("div", { class: "msg-head" }, el("strong", {}, author), el("span", {}, fmtRelative(c.created_at))),
      body,
    );
  }

  paint();

  const unsub = subscribeCommentsForTask(taskId, (newRow) => {
    if (!items.find(x => x.id === newRow.id)) { items.push(newRow); paint(); }
  });
  activeSubs.set(container, unsub);
}

function authorName(id, state) {
  if (!id) return "someone";
  if (id === state.profile?.id) return "You";
  const p = state.profilesById?.get(id);
  if (p) return p.display_name || "someone";
  return id.slice(0, 6) + "…";
}

// Turn plain-text URLs into anchor tags. Everything else is escaped for
// safety, then newlines are preserved as <br>.
function autolink(text) {
  const safe = escapeHtml(text);
  const withLinks = safe.replace(
    /(https?:\/\/[^\s<>"'()]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
  );
  return withLinks.replace(/\n/g, "<br>");
}

// -- Legacy no-op drawer helpers so app.js can still import them.
export function closeDrawer() {}
export async function openTaskDrawer() {}
