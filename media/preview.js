const vscode = acquireVsCodeApi();

const state = {
  targetFile: "",
  renderedHtml: "",
  threads: [],
  showResolved: true,
  focusThreadId: null
};

const previewContent = document.getElementById("preview-content");
const previewPane = document.querySelector(".preview-pane");
const threadList = document.getElementById("thread-list");
const threadSummary = document.getElementById("thread-summary");
const targetFile = document.getElementById("target-file");
const copyContextButton = document.getElementById("copy-context");
const refreshButton = document.getElementById("refresh");
const selectionActions = document.getElementById("selection-actions");
const selectionAddCommentButton = document.getElementById("selection-add-comment");
const selectionOverlay = document.getElementById("selection-overlay");
const hoverOverlay = document.getElementById("hover-overlay");

const composer = document.getElementById("composer");
const composerQuote = document.getElementById("composer-quote");
const composerBody = document.getElementById("composer-body");
const composerCancel = document.getElementById("composer-cancel");
const composerSubmit = document.getElementById("composer-submit");
const toast = document.getElementById("toast");

let pendingQuote = "";
let pendingRect = null;
let hoverHideTimer = null;
let activeHoverAnchor = null;

window.addEventListener("message", (event) => {
  const message = event.data;
  if (!message || typeof message !== "object") {
    return;
  }

  if (message.type === "setState") {
    Object.assign(state, message.payload);
    render();
    if (state.focusThreadId) {
      focusThread(state.focusThreadId);
      state.focusThreadId = null;
    }
    return;
  }

  if (message.type === "triggerAddFromSelection") {
    handleAddFromSelection();
    return;
  }

  if (message.type === "notify") {
    showToast(message.payload?.message ?? "Done");
  }
});

copyContextButton.addEventListener("click", () => {
  vscode.postMessage({ type: "copyContext" });
});

refreshButton.addEventListener("click", () => {
  vscode.postMessage({ type: "refresh" });
});

selectionAddCommentButton.addEventListener("click", () => {
  if (!pendingQuote) {
    showToast("Select text in the preview first");
    return;
  }

  openComposer(pendingQuote, pendingRect);
  hideSelectionActions();
});

previewContent.addEventListener("mouseup", () => {
  updateSelectionActions();
});

previewContent.addEventListener("keyup", () => {
  updateSelectionActions();
});

previewContent.addEventListener("mouseover", (event) => {
  maybeShowHoverOverlay(event);
});

previewContent.addEventListener("mouseout", (event) => {
  maybeHideHoverOverlay(event);
});

document.addEventListener("selectionchange", () => {
  updateSelectionActions();
});

window.addEventListener("resize", () => {
  if (pendingQuote && pendingRect && !selectionActions.classList.contains("hidden")) {
    positionSelectionActions(pendingRect);
  }
  if (pendingRect && !selectionOverlay.classList.contains("hidden")) {
    positionSelectionOverlay(pendingRect);
  }
  if (!composer.classList.contains("hidden") && pendingRect) {
    positionComposer(pendingRect);
  }
});

if (previewPane instanceof HTMLElement) {
  previewPane.addEventListener("scroll", () => {
    hideSelectionActions();
    hideSelectionOverlay();
    hideHoverOverlay();
  });
}

hoverOverlay.addEventListener("mouseenter", () => {
  clearHoverHideTimer();
});

hoverOverlay.addEventListener("mouseleave", () => {
  scheduleHideHoverOverlay();
});

document.addEventListener("click", (event) => {
  const target = getEventElementTarget(event);
  if (!target) {
    return;
  }

  if (!composer.classList.contains("hidden") && !composer.contains(target) && !selectionActions.contains(target)) {
    closeComposer();
  }

  if (!selectionOverlay.classList.contains("hidden") && !selectionOverlay.contains(target) && !selectionActions.contains(target)) {
    hideSelectionOverlay();
  }

  if (!hoverOverlay.classList.contains("hidden") && !hoverOverlay.contains(target) && !target.closest(".mdc-anchor")) {
    hideHoverOverlay();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeComposer();
    hideSelectionActions();
    hideSelectionOverlay();
    hideHoverOverlay();
  }
});

selectionOverlay.addEventListener("click", (event) => {
  const target = getEventElementTarget(event);
  if (!target) {
    return;
  }

  const actionElement = target.closest("[data-overlay-action]");
  if (!(actionElement instanceof HTMLElement)) {
    return;
  }

  const action = actionElement.dataset.overlayAction;
  const threadId = actionElement.dataset.threadId;

  if (action === "jump" && threadId) {
    event.preventDefault();
    event.stopPropagation();
    openThread(threadId);
    hideSelectionOverlay();
    return;
  }

  if (action === "add") {
    event.preventDefault();
    event.stopPropagation();
    openComposer(pendingQuote, pendingRect);
    hideSelectionOverlay();
  }
});

composerCancel.addEventListener("click", closeComposer);
composerSubmit.addEventListener("click", () => {
  const body = composerBody.value.trim();
  if (!pendingQuote || !body) {
    showToast("Pick text and enter a comment first");
    return;
  }

  vscode.postMessage({
    type: "createThread",
    payload: {
      quote: pendingQuote,
      body
    }
  });

  closeComposer();
});

threadList.addEventListener("click", (event) => {
  const target = getEventElementTarget(event);
  if (!target) {
    return;
  }

  const actionElement = target.closest("[data-action]");
  if (!(actionElement instanceof HTMLElement)) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  const action = actionElement.dataset.action;
  const threadId =
    actionElement.dataset.threadId ?? actionElement.closest(".thread-card")?.dataset.threadId ?? null;
  if (!action || !threadId) {
    return;
  }

  if (action === "jump") {
    openThread(threadId);
    return;
  }

  if (action === "resolve") {
    vscode.postMessage({ type: "resolveThread", payload: { threadId } });
    showToast("Thread resolved");
    return;
  }

  if (action === "reopen") {
    vscode.postMessage({ type: "reopenThread", payload: { threadId } });
    showToast("Thread reopened");
    return;
  }

  if (action === "deleteThread") {
    vscode.postMessage({ type: "deleteThread", payload: { threadId } });
    showToast("Thread removed");
    return;
  }

  if (action === "reply") {
    const container = actionElement.closest(".thread-card");
    if (!(container instanceof HTMLElement)) {
      return;
    }

    const input = container.querySelector("textarea[data-reply-input='true']");
    if (!(input instanceof HTMLTextAreaElement)) {
      return;
    }

    const body = input.value.trim();
    if (!body) {
      showToast("Reply text cannot be empty");
      return;
    }

    vscode.postMessage({ type: "replyToThread", payload: { threadId, body } });
    input.value = "";
    return;
  }

  if (action === "editComment") {
    const commentId = actionElement.dataset.commentId;
    if (!commentId) {
      return;
    }

    const commentItem = actionElement.closest(".comment-item");
    if (!(commentItem instanceof HTMLElement)) {
      return;
    }

    const existing = actionElement.dataset.commentBody ?? "";
    openInlineCommentEditor(commentItem, existing);
    return;
  }

  if (action === "saveEditComment") {
    const commentId = actionElement.dataset.commentId;
    if (!commentId) {
      return;
    }

    const editContainer = actionElement.closest(".comment-inline-edit");
    if (!(editContainer instanceof HTMLElement)) {
      return;
    }

    const textarea = editContainer.querySelector("textarea[data-inline-edit='true']");
    if (!(textarea instanceof HTMLTextAreaElement)) {
      return;
    }

    const nextBody = textarea.value.trim();
    if (!nextBody) {
      showToast("Edited comment cannot be empty");
      return;
    }

    vscode.postMessage({
      type: "editComment",
      payload: { threadId, commentId, body: nextBody.trim() }
    });
    showToast("Comment updated");
    return;
  }

  if (action === "cancelEditComment") {
    const editContainer = actionElement.closest(".comment-inline-edit");
    if (editContainer instanceof HTMLElement) {
      editContainer.remove();
    }
    return;
  }

  if (action === "deleteComment") {
    const commentId = actionElement.dataset.commentId;
    if (!commentId) {
      return;
    }

    vscode.postMessage({
      type: "deleteComment",
      payload: { threadId, commentId }
    });
    showToast("Comment deleted");
  }
});

function render() {
  targetFile.textContent = state.targetFile;
  previewContent.innerHTML = state.renderedHtml;
  applyThreadHighlights();
  renderThreads();
  closeComposer();
  hideSelectionActions();
  hideSelectionOverlay();
  hideHoverOverlay();
}

function renderThreads() {
  threadList.innerHTML = "";
  const stats = summarizeThreads(state.threads);
  threadSummary.textContent = `${stats.open} open • ${stats.orphaned} orphaned • ${stats.resolved} resolved`;

  if (state.threads.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No threads yet. Select text in preview and add your first comment.";
    threadList.appendChild(empty);
    return;
  }

  const sorted = [...state.threads].sort((a, b) => {
    const order = { open: 0, orphaned: 1, resolved: 2 };
    const byStatus = order[a.status] - order[b.status];
    if (byStatus !== 0) {
      return byStatus;
    }
    return b.createdAt.localeCompare(a.createdAt);
  });

  renderThreadGroup(threadList, "Open", sorted.filter((thread) => thread.status === "open"));
  renderThreadGroup(threadList, "Orphaned", sorted.filter((thread) => thread.status === "orphaned"));
  renderThreadGroup(threadList, "Resolved", sorted.filter((thread) => thread.status === "resolved"));
}

function renderThreadGroup(root, title, threads) {
  if (threads.length === 0) {
    return;
  }

  const section = document.createElement("section");
  section.className = "thread-group";

  const heading = document.createElement("h3");
  heading.className = "thread-group-title";
  heading.textContent = `${title} (${threads.length})`;
  section.appendChild(heading);

  for (const thread of threads) {
    const card = document.createElement("article");
    card.className = `thread-card thread-${thread.status}`;
    card.dataset.threadId = thread.id;

    const cardHeader = document.createElement("div");
    cardHeader.className = "thread-card-header";

    const status = document.createElement("span");
    status.className = `thread-status status-${thread.status}`;
    status.textContent = humanizeThreadStatus(thread.status);
    cardHeader.appendChild(status);

    const createdMeta = document.createElement("time");
    createdMeta.className = "thread-created";
    createdMeta.dateTime = thread.createdAt;
    createdMeta.textContent = `Started ${formatDate(thread.createdAt)}`;
    cardHeader.appendChild(createdMeta);

    card.appendChild(cardHeader);

    const title = document.createElement("h3");
    title.className = "thread-quote";
    title.textContent = truncate(thread.anchor.quote, 96);
    title.title = thread.anchor.quote;
    card.appendChild(title);

    const meta = document.createElement("p");
    meta.className = "thread-meta";
    const commentCount = `${thread.comments.length} comment${thread.comments.length === 1 ? "" : "s"}`;
    const latest = thread.comments[thread.comments.length - 1];
    if (latest) {
      meta.textContent = `${commentCount} • Updated ${formatDate(latest.createdAt)}`;
    } else {
      meta.textContent = commentCount;
    }
    card.appendChild(meta);

    const controls = document.createElement("div");
    controls.className = "thread-controls";
    controls.appendChild(makeButton("Open", "jump", thread.id, { variant: "primary" }));
    if (thread.status === "resolved") {
      controls.appendChild(makeButton("Reopen", "reopen", thread.id, { variant: "soft" }));
    } else {
      controls.appendChild(makeButton("Resolve", "resolve", thread.id, { variant: "soft" }));
    }
    controls.appendChild(makeButton("Remove", "deleteThread", thread.id, { variant: "danger" }));
    card.appendChild(controls);

    const comments = document.createElement("ul");
    comments.className = "comment-list";

    for (const comment of thread.comments) {
      const item = document.createElement("li");
      item.className = "comment-item";

      const author = document.createElement("p");
      author.className = "comment-author";
      author.textContent = `${comment.author} • ${formatDate(comment.createdAt)}`;
      item.appendChild(author);

      const body = document.createElement("p");
      body.className = "comment-body";
      body.textContent = comment.body;
      item.appendChild(body);

      const itemActions = document.createElement("div");
      itemActions.className = "comment-actions";

      const edit = makeButton("Edit", "editComment", thread.id, { variant: "ghost", size: "small" });
      edit.dataset.commentId = comment.id;
      edit.dataset.commentBody = comment.body;
      itemActions.appendChild(edit);

      const remove = makeButton("Delete", "deleteComment", thread.id, { variant: "ghost", size: "small" });
      remove.dataset.commentId = comment.id;
      itemActions.appendChild(remove);

      item.appendChild(itemActions);
      comments.appendChild(item);
    }

    card.appendChild(comments);

    if (thread.status !== "resolved") {
      const replyBox = document.createElement("div");
      replyBox.className = "reply-box";

      const replyInput = document.createElement("textarea");
      replyInput.rows = 2;
      replyInput.placeholder = "Reply with context";
      replyInput.dataset.replyInput = "true";
      replyBox.appendChild(replyInput);

      replyBox.appendChild(makeButton("Reply", "reply", thread.id, { variant: "primary" }));
      card.appendChild(replyBox);
    }

    section.appendChild(card);
  }

  root.appendChild(section);
}

function applyThreadHighlights() {
  const highlightable = state.threads.filter((thread) => thread.status !== "resolved");
  if (highlightable.length === 0) {
    return;
  }

  // Build the text index ONCE before any DOM mutations.
  const textIndex = buildHighlightTextIndex(previewContent);
  if (!textIndex || !textIndex.fullText) {
    return;
  }

  // Phase 1: find all matches and create all Ranges while DOM is unmodified.
  const matched = [];
  for (const thread of highlightable) {
    const quote = thread.anchor?.quote ?? "";
    if (!quote.trim()) {
      continue;
    }
    const match = findBestThreadMatch(textIndex, thread);
    if (!match) {
      continue;
    }
    const range = createRangeFromTextSpan(textIndex, match.start, match.end);
    if (!range || range.collapsed) {
      continue;
    }
    matched.push({ thread, match, range });
  }

  // Phase 2: sort by match start position descending (reverse document order).
  matched.sort((a, b) => b.match.start - a.match.start || a.thread.id.localeCompare(b.thread.id));

  // Phase 3: apply wraps in reverse document order.
  // Each wrap only mutates DOM at or after the current position, so earlier
  // Ranges (higher in the document) remain valid throughout.
  for (const { thread, range } of matched) {
    highlightRangeByTextSegments(previewContent, range, thread);
  }
}

function handleAddFromSelection() {
  const selection = getSelectionInfo();
  if (!selection) {
    showToast("Select text in the preview first");
    return;
  }

  openComposer(selection.quote, selection.rect);
}

function closeComposer() {
  composerBody.value = "";
  composer.classList.add("hidden");
}

function openComposer(quote, rect) {
  pendingQuote = quote;
  pendingRect = rect;
  composerQuote.textContent = quote;
  composerBody.value = "";
  composer.classList.remove("hidden");
  positionComposer(rect);
  composerBody.focus();
}

function getSelectionInfo() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return null;
  }

  const range = selection.getRangeAt(0);
  if (range.collapsed) {
    return null;
  }

  if (!previewContent.contains(range.commonAncestorContainer)) {
    return null;
  }

  const quote = selection.toString().replace(/\s+/g, " ").trim();
  if (!quote) {
    return null;
  }

  const rect = range.getBoundingClientRect();
  if (!rect || (rect.width === 0 && rect.height === 0)) {
    return null;
  }

  return {
    quote,
    rect,
    range
  };
}

function updateSelectionActions() {
  const selection = getSelectionInfo();
  if (!selection) {
    hideSelectionActions();
    hideSelectionOverlay();
    return;
  }

  hideHoverOverlay();

  pendingQuote = selection.quote;
  pendingRect = selection.rect;

  const matchedThreads = findMatchingThreads(selection.quote, selection.range);
  if (matchedThreads.length > 0) {
    hideSelectionActions();
    showSelectionOverlay(matchedThreads, selection.rect);
    return;
  }

  hideSelectionOverlay();
  positionSelectionActions(selection.rect);
  selectionActions.classList.remove("hidden");
}

function hideSelectionActions() {
  selectionActions.classList.add("hidden");
}

function showSelectionOverlay(threads, rect) {
  const fragment = document.createDocumentFragment();

  const header = document.createElement("div");
  header.className = "selection-overlay-header";

  const title = document.createElement("p");
  title.className = "selection-overlay-title";
  title.textContent = threads.length === 1 ? "1 thread here" : `${threads.length} threads here`;
  header.appendChild(title);

  const addButton = document.createElement("button");
  addButton.type = "button";
  addButton.textContent = "Add comment";
  addButton.dataset.overlayAction = "add";
  header.appendChild(addButton);

  fragment.appendChild(header);

  const list = document.createElement("div");
  list.className = "selection-overlay-list";

  for (const thread of threads.slice(0, 3)) {
    const card = document.createElement("article");
    card.className = `selection-overlay-thread selection-${thread.status}`;

    const quote = document.createElement("p");
    quote.className = "selection-overlay-quote";
    quote.textContent = truncate(thread.anchor.quote, 96);
    card.appendChild(quote);

    const latestComment = thread.comments[thread.comments.length - 1];
    if (latestComment) {
      const comment = document.createElement("p");
      comment.className = "selection-overlay-comment";
      comment.textContent = `${latestComment.author}: ${truncate(latestComment.body, 180)}`;
      card.appendChild(comment);
    }

    const openButton = document.createElement("button");
    openButton.type = "button";
    openButton.textContent = "Open thread";
    openButton.dataset.overlayAction = "jump";
    openButton.dataset.threadId = thread.id;
    card.appendChild(openButton);

    list.appendChild(card);
  }

  if (threads.length > 3) {
    const note = document.createElement("p");
    note.className = "selection-overlay-note";
    note.textContent = `+ ${threads.length - 3} more threads in sidebar`;
    list.appendChild(note);
  }

  fragment.appendChild(list);

  selectionOverlay.innerHTML = "";
  selectionOverlay.appendChild(fragment);
  positionSelectionOverlay(rect);
  selectionOverlay.classList.remove("hidden");
}

function hideSelectionOverlay() {
  selectionOverlay.classList.add("hidden");
  selectionOverlay.innerHTML = "";
}

function maybeShowHoverOverlay(event) {
  if (hasActiveTextSelection()) {
    return;
  }

  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const anchor = target.closest(".mdc-anchor[data-thread-id]");
  if (!(anchor instanceof HTMLElement)) {
    return;
  }

  const threadId = anchor.dataset.threadId;
  if (!threadId) {
    return;
  }

  const thread = state.threads.find((entry) => entry.id === threadId);
  if (!thread) {
    return;
  }

  clearHoverHideTimer();
  setActiveHoverAnchor(anchor);
  renderHoverOverlay(thread, anchor.getBoundingClientRect());
}

function maybeHideHoverOverlay(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const leavingAnchor = target.closest(".mdc-anchor[data-thread-id]");
  if (!leavingAnchor) {
    return;
  }

  const related = event.relatedTarget;
  if (related instanceof HTMLElement) {
    if (related.closest(".mdc-anchor[data-thread-id]") || hoverOverlay.contains(related)) {
      return;
    }
  }

  scheduleHideHoverOverlay();
}

function renderHoverOverlay(thread, rect) {
  const fragment = document.createDocumentFragment();

  const header = document.createElement("div");
  header.className = "hover-overlay-header";

  const status = document.createElement("p");
  status.className = "hover-overlay-status";
  status.textContent = `${thread.status.toUpperCase()} · ${thread.comments.length} comment${thread.comments.length === 1 ? "" : "s"}`;
  header.appendChild(status);

  fragment.appendChild(header);

  const quote = document.createElement("p");
  quote.className = "hover-overlay-quote";
  quote.textContent = truncate(thread.anchor.quote, 140);
  fragment.appendChild(quote);

  const comments = document.createElement("div");
  comments.className = "hover-overlay-comments";
  const recentComments = thread.comments.slice(-2);

  for (const comment of recentComments) {
    const item = document.createElement("article");
    item.className = "hover-overlay-comment";

    const author = document.createElement("p");
    author.className = "hover-overlay-author";
    author.textContent = `${comment.author} · ${formatDate(comment.createdAt)}`;
    item.appendChild(author);

    const body = document.createElement("p");
    body.className = "hover-overlay-body";
    body.textContent = truncate(comment.body, 240);
    item.appendChild(body);

    comments.appendChild(item);
  }

  fragment.appendChild(comments);

  hoverOverlay.innerHTML = "";
  hoverOverlay.appendChild(fragment);
  positionHoverOverlay(rect);
  hoverOverlay.classList.remove("hidden");
}

function hasActiveTextSelection() {
  const selection = window.getSelection();
  return Boolean(selection && selection.rangeCount > 0 && !selection.getRangeAt(0).collapsed);
}

function setActiveHoverAnchor(anchor) {
  if (activeHoverAnchor && activeHoverAnchor !== anchor) {
    activeHoverAnchor.classList.remove("mdc-hover");
  }
  activeHoverAnchor = anchor;
  activeHoverAnchor.classList.add("mdc-hover");
}

function scheduleHideHoverOverlay() {
  clearHoverHideTimer();
  hoverHideTimer = window.setTimeout(() => {
    hideHoverOverlay();
  }, 160);
}

function clearHoverHideTimer() {
  if (hoverHideTimer !== null) {
    window.clearTimeout(hoverHideTimer);
    hoverHideTimer = null;
  }
}

function hideHoverOverlay() {
  clearHoverHideTimer();
  hoverOverlay.classList.add("hidden");
  hoverOverlay.innerHTML = "";
  if (activeHoverAnchor) {
    activeHoverAnchor.classList.remove("mdc-hover");
    activeHoverAnchor = null;
  }
}

function findMatchingThreads(selectedQuote, range) {
  const normalizedSelection = normalizeText(selectedQuote);
  if (!normalizedSelection) {
    return [];
  }

  const byIntersectionIds = new Set();
  const anchors = previewContent.querySelectorAll(".mdc-anchor[data-thread-id]");
  for (const anchor of anchors) {
    if (range.intersectsNode(anchor)) {
      const threadId = anchor.dataset.threadId;
      if (threadId) {
        byIntersectionIds.add(threadId);
      }
    }
  }

  const byIntersection = state.threads.filter((thread) => byIntersectionIds.has(thread.id));
  if (byIntersection.length > 0) {
    return byIntersection;
  }

  return state.threads.filter((thread) => {
    const threadQuote = normalizeText(thread.anchor.quote);
    if (!threadQuote) {
      return false;
    }

    return threadQuote.includes(normalizedSelection) || normalizedSelection.includes(threadQuote);
  });
}

function normalizeText(value) {
  return normalizeForSearch(value);
}

function positionSelectionActions(rect) {
  const bubbleWidth = 130;
  const x = clamp(rect.left + rect.width / 2 - bubbleWidth / 2, 8, window.innerWidth - bubbleWidth - 8);
  const y = clamp(rect.top - 40, 8, window.innerHeight - 50);

  selectionActions.style.left = `${x}px`;
  selectionActions.style.top = `${y}px`;
}

function positionSelectionOverlay(rect) {
  const overlayWidth = Math.min(360, window.innerWidth - 16);
  const x = clamp(rect.left + rect.width / 2 - overlayWidth / 2, 8, window.innerWidth - overlayWidth - 8);
  let y = rect.bottom + 10;

  const estimatedHeight = 240;
  if (y + estimatedHeight > window.innerHeight - 8) {
    y = Math.max(8, rect.top - estimatedHeight - 10);
  }

  selectionOverlay.style.width = `${overlayWidth}px`;
  selectionOverlay.style.left = `${x}px`;
  selectionOverlay.style.top = `${y}px`;
}

function positionHoverOverlay(rect) {
  const width = Math.min(360, window.innerWidth - 16);
  let x = rect.right + 10;
  if (x + width > window.innerWidth - 8) {
    x = rect.left - width - 10;
  }
  x = clamp(x, 8, window.innerWidth - width - 8);

  const estimatedHeight = 230;
  const y = clamp(rect.top - 10, 8, window.innerHeight - estimatedHeight - 8);

  hoverOverlay.style.width = `${width}px`;
  hoverOverlay.style.left = `${x}px`;
  hoverOverlay.style.top = `${y}px`;
}

function positionComposer(rect) {
  const width = Math.min(420, window.innerWidth - 24);
  const preferredTop = rect ? rect.bottom + 10 : 72;
  const top = clamp(preferredTop, 8, window.innerHeight - 260);
  const left = rect
    ? clamp(rect.left + rect.width / 2 - width / 2, 8, window.innerWidth - width - 8)
    : clamp(window.innerWidth / 2 - width / 2, 8, window.innerWidth - width - 8);

  composer.style.width = `${width}px`;
  composer.style.left = `${left}px`;
  composer.style.top = `${top}px`;
  composer.style.right = "auto";
  composer.style.bottom = "auto";
}

function makeButton(label, action, threadId, options = {}) {
  const variant = options.variant ?? "soft";
  const size = options.size ?? "default";
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.dataset.action = action;
  button.dataset.threadId = threadId;
  button.className = `ui-btn variant-${variant} size-${size}`;
  return button;
}

function humanizeThreadStatus(status) {
  if (status === "open") {
    return "Open";
  }
  if (status === "orphaned") {
    return "Orphaned";
  }
  if (status === "resolved") {
    return "Resolved";
  }
  return status;
}

const BLOCK_TAG_NAME_SET = new Set([
  "ADDRESS",
  "ARTICLE",
  "ASIDE",
  "BLOCKQUOTE",
  "DD",
  "DIV",
  "DL",
  "DT",
  "FIELDSET",
  "FIGCAPTION",
  "FIGURE",
  "FOOTER",
  "FORM",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "HEADER",
  "HR",
  "LI",
  "MAIN",
  "NAV",
  "OL",
  "P",
  "PRE",
  "SECTION",
  "TABLE",
  "TBODY",
  "TD",
  "TH",
  "THEAD",
  "TR",
  "UL"
]);

function buildHighlightTextIndex(root) {
  const nodes = [];
  const starts = [];
  let fullText = "";

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || !node.nodeValue.trim()) {
        return NodeFilter.FILTER_REJECT;
      }

      const parent = node.parentElement;
      if (!parent) {
        return NodeFilter.FILTER_REJECT;
      }

      return NodeFilter.FILTER_ACCEPT;
    }
  });

  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (nodes.length > 0 && shouldInsertBoundarySpace(root, nodes[nodes.length - 1], node)) {
      // Keep block-level boundaries searchable without injecting spaces between inline fragments.
      fullText += " ";
    }

    starts.push(fullText.length);
    nodes.push(node);
    fullText += node.nodeValue || "";
  }

  return {
    nodes,
    starts,
    fullText
  };
}

function shouldInsertBoundarySpace(root, previousNode, nextNode) {
  const previousText = previousNode.nodeValue ?? "";
  const nextText = nextNode.nodeValue ?? "";
  if (!previousText || !nextText) {
    return false;
  }

  if (/\s$/.test(previousText) || /^\s/.test(nextText)) {
    return false;
  }

  const previousParent = previousNode.parentElement;
  const nextParent = nextNode.parentElement;
  if (!previousParent || !nextParent) {
    return false;
  }

  const previousBlock = findClosestBlockAncestor(previousParent, root);
  const nextBlock = findClosestBlockAncestor(nextParent, root);
  if (!previousBlock || !nextBlock) {
    return false;
  }

  return previousBlock !== nextBlock;
}

function findClosestBlockAncestor(node, boundary) {
  let current = node;
  while (current && current !== boundary) {
    if (BLOCK_TAG_NAME_SET.has(current.tagName)) {
      return current;
    }
    current = current.parentElement;
  }

  return boundary instanceof HTMLElement ? boundary : null;
}

function findBestThreadMatch(textIndex, thread) {
  const haystack = normalizeWithIndexMap(textIndex.fullText);
  if (!haystack.text) {
    return null;
  }

  const needles = buildHighlightNeedles(thread.anchor);
  if (needles.length === 0) {
    return null;
  }

  const prefix = normalizeForSearch(thread.anchor?.prefix ?? "");
  const suffix = normalizeForSearch(thread.anchor?.suffix ?? "");

  const matches = [];
  for (let needleIndex = 0; needleIndex < needles.length; needleIndex += 1) {
    const needle = needles[needleIndex];
    let index = haystack.text.indexOf(needle);
    while (index >= 0) {
      const normalizedEnd = index + needle.length;
      const startRaw = haystack.indexMap[index];
      const endRaw = haystack.indexMap[normalizedEnd - 1];
      if (typeof startRaw === "number" && typeof endRaw === "number") {
        const before = haystack.text.slice(0, index);
        const after = haystack.text.slice(normalizedEnd);
        const score =
          suffixOverlap(before, prefix) * 2 +
          prefixOverlap(after, suffix) * 2 +
          (prefix ? 0 : 1) +
          (suffix ? 0 : 1) +
          (needleIndex === 0 ? 0.5 : 0);

        matches.push({
          start: startRaw,
          end: endRaw + 1,
          score
        });
      }

      index = haystack.text.indexOf(needle, index + 1);
    }
  }

  if (matches.length === 0) {
    return null;
  }

  matches.sort((a, b) => b.score - a.score || a.start - b.start);
  return matches[0];
}

function buildHighlightNeedles(anchor) {
  const candidates = [];
  const quote = String(anchor?.quote ?? "");
  const strippedQuote = stripStructuralMarkers(quote);
  const suffixFallback = takeVisibleFallbackText(anchor?.suffix ?? "");

  candidates.push(quote);
  if (strippedQuote && strippedQuote !== quote) {
    candidates.push(strippedQuote);
  }
  if (suffixFallback) {
    candidates.push(suffixFallback);
  }

  const normalizedUnique = [];
  const seen = new Set();
  for (const candidate of candidates) {
    const normalized = normalizeForSearch(candidate);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    normalizedUnique.push(normalized);
  }

  return normalizedUnique;
}

function stripStructuralMarkers(value) {
  return String(value)
    .replace(/(^|\n)\s*#{1,6}\s+/g, "$1")
    .replace(/(^|\n)\s*>+\s*/g, "$1")
    .replace(/(^|\n)\s*(?:\d+[.)]|[-*+]|[\u2022\u25e6\u25aa\u2023])\s+/g, "$1")
    .replace(/(^|\n)\s*\[[ xX]\]\s+/g, "$1")
    .replace(/(^|\n)\s*`{1,3}\s*/g, "$1")
    .replace(/\s*`{1,3}(\n|$)/g, "$1")
    .trim();
}

function takeVisibleFallbackText(value) {
  const cleaned = stripStructuralMarkers(String(value)).trim();
  if (!cleaned) {
    return "";
  }

  return cleaned.split(/\s+/).slice(0, 8).join(" ");
}

function createRangeFromTextSpan(textIndex, start, end) {
  const boundedStart = clamp(start, 0, textIndex.fullText.length);
  const boundedEnd = clamp(end, boundedStart + 1, textIndex.fullText.length);

  const startPos = resolveTextPosition(textIndex, boundedStart);
  const endPos = resolveTextPosition(textIndex, boundedEnd);

  if (!startPos || !endPos) {
    return null;
  }

  const range = document.createRange();
  range.setStart(startPos.node, startPos.offset);
  range.setEnd(endPos.node, endPos.offset);
  return range;
}

function resolveTextPosition(textIndex, absoluteIndex) {
  const nodes = textIndex.nodes;
  const starts = textIndex.starts;

  if (nodes.length === 0) {
    return null;
  }

  const maxIndex = textIndex.fullText.length;
  const index = clamp(absoluteIndex, 0, maxIndex);

  if (index === maxIndex) {
    const last = nodes[nodes.length - 1];
    return {
      node: last,
      offset: (last.nodeValue || "").length
    };
  }

  let low = 0;
  let high = starts.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const start = starts[mid];
    const next = mid + 1 < starts.length ? starts[mid + 1] : maxIndex;

    if (index < start) {
      high = mid - 1;
      continue;
    }

    if (index >= next) {
      low = mid + 1;
      continue;
    }

    return {
      node: nodes[mid],
      offset: index - start
    };
  }

  return null;
}

function highlightRangeByTextSegments(root, range, thread) {
  const segments = collectTextSegmentsInRange(root, range);
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    const segment = segments[i];
    const segmentRange = document.createRange();
    segmentRange.setStart(segment.node, segment.start);
    segmentRange.setEnd(segment.node, segment.end);

    const marker = document.createElement("span");
    marker.className = `mdc-anchor mdc-${thread.status}`;
    marker.dataset.threadId = thread.id;

    try {
      segmentRange.surroundContents(marker);
    } catch {
      try {
        const contents = segmentRange.extractContents();
        marker.appendChild(contents);
        segmentRange.insertNode(marker);
      } catch {
        // Best-effort highlight only; ignore malformed subrange edge cases.
      }
    }
  }
}

function collectTextSegmentsInRange(root, range) {
  const segments = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || !node.nodeValue.trim()) {
        return NodeFilter.FILTER_REJECT;
      }

      const parent = node.parentElement;
      if (!parent) {
        return NodeFilter.FILTER_REJECT;
      }

      if (!range.intersectsNode(node)) {
        return NodeFilter.FILTER_REJECT;
      }

      return NodeFilter.FILTER_ACCEPT;
    }
  });

  while (walker.nextNode()) {
    const node = walker.currentNode;
    const text = node.nodeValue || "";
    let start = 0;
    let end = text.length;

    if (node === range.startContainer) {
      start = range.startOffset;
    }

    if (node === range.endContainer) {
      end = range.endOffset;
    }

    if (end <= start) {
      continue;
    }

    segments.push({ node, start, end });
  }

  return segments;
}

function normalizeForSearch(value) {
  return normalizeWithIndexMap(value).text;
}

function normalizeWithIndexMap(value) {
  const chars = [];
  const indexMap = [];
  let previousWasWhitespace = true;

  for (let i = 0; i < value.length; i += 1) {
    const replacement = normalizeChar(value[i]);

    for (const part of replacement) {
      if (/\s/.test(part)) {
        if (previousWasWhitespace) {
          continue;
        }

        chars.push(" ");
        indexMap.push(i);
        previousWasWhitespace = true;
        continue;
      }

      chars.push(part.toLowerCase());
      indexMap.push(i);
      previousWasWhitespace = false;
    }
  }

  while (chars.length > 0 && chars[chars.length - 1] === " ") {
    chars.pop();
    indexMap.pop();
  }

  return {
    text: chars.join(""),
    indexMap
  };
}

function normalizeChar(char) {
  switch (char) {
    case "\u2018":
    case "\u2019":
      return "'";
    case "\u201C":
    case "\u201D":
      return '"';
    case "\u2013":
    case "\u2014":
      return "-";
    case "\u2026":
      return "...";
    default:
      return char;
  }
}

function suffixOverlap(text, target) {
  if (!target) {
    return 0;
  }

  const max = Math.min(text.length, target.length);
  for (let size = max; size > 0; size -= 1) {
    if (text.endsWith(target.slice(target.length - size))) {
      return size;
    }
  }

  return 0;
}

function prefixOverlap(text, target) {
  if (!target) {
    return 0;
  }

  const max = Math.min(text.length, target.length);
  for (let size = max; size > 0; size -= 1) {
    if (text.startsWith(target.slice(0, size))) {
      return size;
    }
  }

  return 0;
}

function focusThread(threadId) {
  const card = threadList.querySelector(`[data-thread-id='${cssEscape(threadId)}']`);
  if (card instanceof HTMLElement) {
    card.scrollIntoView({ behavior: "smooth", block: "center" });
    card.classList.add("active");
    setTimeout(() => card.classList.remove("active"), 1200);
  }

  const marker = previewContent.querySelector(`.mdc-anchor[data-thread-id='${cssEscape(threadId)}']`);
  if (marker instanceof HTMLElement) {
    marker.scrollIntoView({ behavior: "smooth", block: "center" });
    marker.classList.add("pulse");
    setTimeout(() => marker.classList.remove("pulse"), 1200);
  }
}

function openThread(threadId) {
  focusThread(threadId);
  vscode.postMessage({ type: "focusThread", payload: { threadId } });
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  setTimeout(() => toast.classList.remove("visible"), 1800);
}

function formatDate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return String(iso);
  }

  return date.toLocaleString();
}

function cssEscape(value) {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }

  return value.replace(/[^a-zA-Z0-9_-]/g, "");
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function truncate(value, maxLength) {
  if (!value || value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 1)}…`;
}

function summarizeThreads(threads) {
  return threads.reduce(
    (acc, thread) => {
      acc[thread.status] += 1;
      return acc;
    },
    { open: 0, orphaned: 0, resolved: 0 }
  );
}

function openInlineCommentEditor(commentItem, existingBody) {
  const existingEditor = commentItem.querySelector(".comment-inline-edit");
  if (existingEditor instanceof HTMLElement) {
    const textarea = existingEditor.querySelector("textarea[data-inline-edit='true']");
    if (textarea instanceof HTMLTextAreaElement) {
      textarea.focus();
      textarea.select();
    }
    return;
  }

  const openEditors = threadList.querySelectorAll(".comment-inline-edit");
  for (const editor of openEditors) {
    editor.remove();
  }

  const editor = document.createElement("div");
  editor.className = "comment-inline-edit";

  const textarea = document.createElement("textarea");
  textarea.rows = 3;
  textarea.dataset.inlineEdit = "true";
  textarea.value = existingBody;
  editor.appendChild(textarea);

  const actions = document.createElement("div");
  actions.className = "comment-inline-actions";

  const save = document.createElement("button");
  save.type = "button";
  save.textContent = "Save";
  save.dataset.action = "saveEditComment";
  save.dataset.threadId = commentItem.closest(".thread-card")?.dataset.threadId ?? "";
  const actionSource = commentItem.querySelector("[data-action='editComment']");
  save.dataset.commentId = actionSource instanceof HTMLElement ? actionSource.dataset.commentId ?? "" : "";
  actions.appendChild(save);

  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.textContent = "Cancel";
  cancel.dataset.action = "cancelEditComment";
  actions.appendChild(cancel);

  editor.appendChild(actions);
  commentItem.appendChild(editor);

  textarea.focus();
  textarea.select();
}

function getEventElementTarget(event) {
  const target = event.target;
  if (target instanceof HTMLElement) {
    return target;
  }

  if (target instanceof Node) {
    return target.parentElement;
  }

  return null;
}

vscode.postMessage({ type: "requestState" });
