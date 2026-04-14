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

const composer = document.getElementById("composer");
const composerQuote = document.getElementById("composer-quote");
const composerBody = document.getElementById("composer-body");
const composerCancel = document.getElementById("composer-cancel");
const composerSubmit = document.getElementById("composer-submit");
const toast = document.getElementById("toast");

let pendingQuote = "";
let pendingRect = null;

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
  });
}

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  if (!composer.classList.contains("hidden") && !composer.contains(target) && !selectionActions.contains(target)) {
    closeComposer();
  }

  if (!selectionOverlay.classList.contains("hidden") && !selectionOverlay.contains(target) && !selectionActions.contains(target)) {
    hideSelectionOverlay();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeComposer();
    hideSelectionActions();
    hideSelectionOverlay();
  }
});

selectionOverlay.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const actionElement = target.closest("[data-overlay-action]");
  if (!(actionElement instanceof HTMLElement)) {
    return;
  }

  const action = actionElement.dataset.overlayAction;
  const threadId = actionElement.dataset.threadId;

  if (action === "jump" && threadId) {
    focusThread(threadId);
    hideSelectionOverlay();
    return;
  }

  if (action === "add") {
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
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const actionElement = target.closest("[data-action]");
  if (!(actionElement instanceof HTMLElement)) {
    return;
  }

  const action = actionElement.dataset.action;
  const threadId = actionElement.dataset.threadId;
  if (!action || !threadId) {
    return;
  }

  if (action === "jump") {
    focusThread(threadId);
    return;
  }

  if (action === "resolve") {
    vscode.postMessage({ type: "resolveThread", payload: { threadId } });
    return;
  }

  if (action === "reopen") {
    vscode.postMessage({ type: "reopenThread", payload: { threadId } });
    return;
  }

  if (action === "deleteThread") {
    if (window.confirm("Delete this thread?")) {
      vscode.postMessage({ type: "deleteThread", payload: { threadId } });
    }
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

    const existing = actionElement.dataset.commentBody ?? "";
    const nextBody = window.prompt("Edit comment", existing);
    if (!nextBody || !nextBody.trim()) {
      return;
    }

    vscode.postMessage({
      type: "editComment",
      payload: { threadId, commentId, body: nextBody.trim() }
    });
    return;
  }

  if (action === "deleteComment") {
    const commentId = actionElement.dataset.commentId;
    if (!commentId) {
      return;
    }

    if (window.confirm("Delete this comment?")) {
      vscode.postMessage({
        type: "deleteComment",
        payload: { threadId, commentId }
      });
    }
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

    const title = document.createElement("h3");
    title.className = "thread-quote";
    title.textContent = truncate(thread.anchor.quote, 96);
    title.title = thread.anchor.quote;
    card.appendChild(title);

    const meta = document.createElement("p");
    meta.className = "thread-meta";
    meta.textContent = `${thread.comments.length} comment${thread.comments.length === 1 ? "" : "s"}`;
    card.appendChild(meta);

    const controls = document.createElement("div");
    controls.className = "thread-controls";
    controls.appendChild(makeButton("Go", "jump", thread.id));
    if (thread.status === "resolved") {
      controls.appendChild(makeButton("Reopen", "reopen", thread.id));
    } else {
      controls.appendChild(makeButton("Resolve", "resolve", thread.id));
    }
    controls.appendChild(makeButton("Remove", "deleteThread", thread.id));
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

      const edit = makeButton("Edit", "editComment", thread.id);
      edit.dataset.commentId = comment.id;
      edit.dataset.commentBody = comment.body;
      itemActions.appendChild(edit);

      const remove = makeButton("Delete", "deleteComment", thread.id);
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
      replyInput.placeholder = "Reply";
      replyInput.dataset.replyInput = "true";
      replyBox.appendChild(replyInput);

      replyBox.appendChild(makeButton("Reply", "reply", thread.id));
      card.appendChild(replyBox);
    }

    section.appendChild(card);
  }

  root.appendChild(section);
}

function applyThreadHighlights() {
  const highlightable = state.threads.filter((thread) => thread.status !== "resolved");
  for (const thread of highlightable) {
    wrapFirstTextMatch(previewContent, thread.anchor.quote, thread.id, thread.status);
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
  return value
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\s+/g, " ")
    .trim();
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

function makeButton(label, action, threadId) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.dataset.action = action;
  button.dataset.threadId = threadId;
  return button;
}

function wrapFirstTextMatch(root, quote, threadId, status) {
  const needle = quote.trim();
  if (!needle) {
    return;
  }

  const lowerNeedle = needle.toLowerCase();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || !node.nodeValue.trim()) {
        return NodeFilter.FILTER_REJECT;
      }

      const parent = node.parentElement;
      if (!parent || parent.closest(".mdc-anchor")) {
        return NodeFilter.FILTER_REJECT;
      }

      return NodeFilter.FILTER_ACCEPT;
    }
  });

  while (walker.nextNode()) {
    const node = walker.currentNode;
    const raw = node.nodeValue || "";
    const lowerRaw = raw.toLowerCase();
    const index = lowerRaw.indexOf(lowerNeedle);
    if (index < 0) {
      continue;
    }

    const range = document.createRange();
    range.setStart(node, index);
    range.setEnd(node, index + needle.length);

    const marker = document.createElement("span");
    marker.className = `mdc-anchor mdc-${status}`;
    marker.dataset.threadId = threadId;

    try {
      range.surroundContents(marker);
      return;
    } catch {
      return;
    }
  }
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

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  setTimeout(() => toast.classList.remove("visible"), 1800);
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
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

vscode.postMessage({ type: "requestState" });
