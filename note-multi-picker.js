import { researchItemId, mergeThread, normalizeArticleUrl } from "./lib/model.js";
import { noteIdFromUrl, normalizeNoteReplyPayload } from "./lib/note-replies.js";
import { buildSelectedNoteThreads } from "./lib/note-selection.js";

const els = {
  currentUrl: document.getElementById("currentUrl"),
  selectThreadBtn: document.getElementById("selectThreadBtn"),
  pickerCard: document.getElementById("replyPickerCard"),
  summary: document.getElementById("replyPickerSummary"),
  picker: document.getElementById("replyPicker"),
  closeBtn: document.getElementById("closeReplyPickerBtn"),
  loadMoreBtn: document.getElementById("loadMoreRepliesBtn"),
  selectedCount: document.getElementById("selectedReplyCount"),
  clearBtn: document.getElementById("clearReplySelectionBtn"),
  addBtn: document.getElementById("addSelectedRepliesBtn"),
  refreshBtn: document.getElementById("refreshBtn"),
  status: document.getElementById("status")
};

const state = {
  noteId: null,
  articleUrl: null,
  comments: [],
  selected: new Set(),
  expandedRoots: new Set(),
  nextCursor: null,
  hasMore: false,
  loading: false,
  pagesLoaded: 0
};

const id = (value) => String(value ?? "");

function setStatus(message, kind = "") {
  els.status.textContent = message || "";
  els.status.className = `status ${kind}`.trim();
}

function reset() {
  state.noteId = null;
  state.articleUrl = null;
  state.comments = [];
  state.selected = new Set();
  state.expandedRoots = new Set();
  state.nextCursor = null;
  state.hasMore = false;
  state.loading = false;
  state.pagesLoaded = 0;
  els.picker.innerHTML = "";
}

function closePicker() {
  reset();
  els.pickerCard.classList.add("hidden");
}

function byId() {
  return new Map(state.comments.map((comment) => [id(comment.id), comment]));
}

function descendantsOf(commentId) {
  const children = new Map();
  for (const comment of state.comments) {
    if (!comment.parentId) continue;
    const parent = id(comment.parentId);
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(id(comment.id));
  }
  const out = [];
  const queue = [...(children.get(id(commentId)) || [])];
  while (queue.length) {
    const next = queue.shift();
    out.push(next);
    queue.push(...(children.get(next) || []));
  }
  return out;
}

function ancestorsOf(commentId) {
  const map = byId();
  const out = [];
  let current = map.get(id(commentId));
  while (current?.parentId) {
    const parent = id(current.parentId);
    out.push(parent);
    current = map.get(parent);
  }
  return out;
}

function toggleSelection(commentId) {
  const selectedId = id(commentId);
  if (state.selected.has(selectedId)) {
    state.selected.delete(selectedId);
  } else {
    ancestorsOf(selectedId).forEach((ancestor) => state.selected.delete(ancestor));
    descendantsOf(selectedId).forEach((descendant) => state.selected.delete(descendant));
    state.selected.add(selectedId);
  }
  render();
}

function roots() {
  const ids = new Set(state.comments.map((comment) => id(comment.id)));
  return state.comments.filter((comment) => !comment.parentId || !ids.has(id(comment.parentId)));
}

function branch(rootId) {
  const ids = new Set([id(rootId), ...descendantsOf(rootId)]);
  return state.comments.filter((comment) => ids.has(id(comment.id)));
}

function preview(text = "") {
  const value = String(text).replace(/\s+/g, " ").trim();
  if (!value) return "(Không có nội dung chữ)";
  return value.length > 260 ? `${value.slice(0, 257)}…` : value;
}

function commentRow(comment, nested = false) {
  const commentId = id(comment.id);
  const selected = state.selected.has(commentId);
  const row = document.createElement("div");
  row.className = `multi-reply-item${selected ? " selected" : ""}${nested ? " nested" : ""}`;
  if (nested) row.style.marginLeft = `${Math.min(Number(comment.depth) || 1, 4) * 12}px`;

  const select = document.createElement("button");
  select.type = "button";
  select.className = "multi-reply-check";
  select.textContent = selected ? "✓" : "+";
  select.title = selected ? "Bỏ chọn nhánh này" : "Chọn nhánh này";
  select.addEventListener("click", () => toggleSelection(commentId));

  const body = document.createElement("div");
  body.className = "multi-reply-body";
  const author = document.createElement("strong");
  author.textContent = comment.author || "Người dùng Substack";
  const text = document.createElement("span");
  text.textContent = preview(comment.text);
  const meta = document.createElement("small");
  meta.textContent = nested ? `Reply cấp ${comment.depth}` : "Comment gốc";
  body.append(author, text, meta);
  row.append(select, body);
  return row;
}

function render() {
  if (!state.noteId) return;
  els.picker.innerHTML = "";
  const rootList = roots();
  els.summary.textContent = `Đã tải ${rootList.length} comment gốc / ${state.comments.length} comment từ ${state.pagesLoaded} lượt. Không tự tải phần còn lại.`;

  rootList.forEach((root) => {
    const wrapper = document.createElement("div");
    wrapper.className = "multi-reply-branch";
    wrapper.appendChild(commentRow(root));

    const children = branch(root.id).filter((comment) => id(comment.id) !== id(root.id));
    if (children.length) {
      const expand = document.createElement("button");
      expand.type = "button";
      expand.className = "multi-reply-expand";
      const isOpen = state.expandedRoots.has(id(root.id));
      expand.textContent = isOpen ? `Ẩn ${children.length} phản hồi` : `Mở ${children.length} phản hồi`;
      expand.addEventListener("click", () => {
        if (isOpen) state.expandedRoots.delete(id(root.id));
        else state.expandedRoots.add(id(root.id));
        render();
      });
      wrapper.appendChild(expand);
      if (isOpen) {
        const nested = document.createElement("div");
        nested.className = "multi-reply-children";
        children.forEach((comment) => nested.appendChild(commentRow(comment, true)));
        wrapper.appendChild(nested);
      }
    }
    els.picker.appendChild(wrapper);
  });

  els.selectedCount.textContent = `Đã chọn ${state.selected.size} nhánh`;
  els.clearBtn.disabled = state.selected.size === 0;
  els.addBtn.disabled = state.selected.size === 0;
  els.loadMoreBtn.classList.toggle("hidden", !state.hasMore);
  els.loadMoreBtn.disabled = state.loading;
  els.loadMoreBtn.textContent = state.loading ? "Đang tải…" : "Tải thêm comment";
  els.pickerCard.classList.remove("hidden");
}

function mergeComments(nextComments) {
  const map = new Map(state.comments.map((comment) => [id(comment.id), comment]));
  nextComments.forEach((comment) => map.set(id(comment.id), comment));
  state.comments = Array.from(map.values());
}

async function fetchPage(cursor = null) {
  const url = new URL(`https://substack.com/api/v1/reader/comment/${state.noteId}/replies`);
  if (cursor) url.searchParams.set("cursor", cursor);
  const response = await fetch(url.toString(), {
    credentials: "include",
    cache: "no-store",
    headers: { Accept: "application/json" }
  });
  if (!response.ok) throw new Error(`Substack trả về HTTP ${response.status}.`);
  const data = await response.json();
  const comments = normalizeNoteReplyPayload(data);
  const nextCursor = data?.nextCursor ? String(data.nextCursor) : null;
  const branchCount = Array.isArray(data?.commentBranches) ? data.commentBranches.length : 0;
  return { comments, nextCursor, hasMore: Boolean(nextCursor && branchCount) };
}

async function loadNextPage(initial = false) {
  if (state.loading || !state.noteId || (!initial && !state.hasMore)) return;
  state.loading = true;
  render();
  setStatus(initial ? "Đang tải lượt comment đầu tiên…" : "Đang tải thêm comment…");
  try {
    const page = await fetchPage(initial ? null : state.nextCursor);
    mergeComments(page.comments);
    state.nextCursor = page.nextCursor;
    state.hasMore = page.hasMore;
    state.pagesLoaded += 1;
    setStatus(`Đã tải ${state.comments.length} comment. Chọn nhiều nhánh rồi bấm “Thêm vào bài viết”.`, "success");
  } catch (error) {
    setStatus(`Không tải được comment: ${error.message || error}`, "error");
    if (initial) closePicker();
  } finally {
    state.loading = false;
    render();
  }
}

async function openPicker(noteId, articleUrl) {
  reset();
  state.noteId = String(noteId);
  state.articleUrl = articleUrl;
  els.pickerCard.classList.remove("hidden");
  await loadNextPage(true);
}

async function saveSelected() {
  if (!state.selected.size || !state.articleUrl) return;
  els.addBtn.disabled = true;
  try {
    const threads = buildSelectedNoteThreads(state.comments, Array.from(state.selected), state.articleUrl);
    const canonicalUrl = normalizeArticleUrl(state.articleUrl);
    const itemId = researchItemId(canonicalUrl);
    const data = await chrome.storage.local.get("researchItems");
    const items = data.researchItems || {};
    let item = items[itemId];
    let contextCount = 0;
    threads.forEach((thread) => {
      item = mergeThread(item, thread);
      contextCount += thread.comments.length;
    });
    items[itemId] = item;
    await chrome.storage.local.set({ researchItems: items });
    setStatus(`Đã thêm ${threads.length} nhánh (${contextCount} comment theo ngữ cảnh) vào bài viết. Chưa xuất file.`, "success");
    closePicker();
    els.refreshBtn?.click();
  } catch (error) {
    setStatus(error.message || String(error), "error");
    els.addBtn.disabled = false;
  }
}

els.selectThreadBtn.addEventListener("click", (event) => {
  const articleUrl = els.currentUrl?.textContent?.trim() || "";
  const noteId = noteIdFromUrl(articleUrl);
  if (!noteId) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  openPicker(noteId, articleUrl);
}, true);

els.loadMoreBtn.addEventListener("click", () => loadNextPage(false));
els.clearBtn.addEventListener("click", () => { state.selected.clear(); render(); });
els.addBtn.addEventListener("click", saveSelected);
els.closeBtn.addEventListener("click", () => reset(), true);
