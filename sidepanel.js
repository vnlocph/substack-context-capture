import { researchItemId, mergeArticle, mergeThread, normalizeArticleUrl } from "./lib/model.js";
import { toMarkdown, toJson, safeFilename } from "./lib/exporters.js";
import { ZipWriter } from "./lib/zip.js";
import { noteIdFromUrl, normalizeNoteReplyPayload, buildNoteThread } from "./lib/note-replies.js";

const els = {
  connectionBadge: document.getElementById("connectionBadge"),
  currentTitle: document.getElementById("currentTitle"),
  currentUrl: document.getElementById("currentUrl"),
  currentStats: document.getElementById("currentStats"),
  saveArticleBtn: document.getElementById("saveArticleBtn"),
  selectThreadBtn: document.getElementById("selectThreadBtn"),
  captureHint: document.getElementById("captureHint"),
  replyPickerCard: document.getElementById("replyPickerCard"),
  replyPickerSummary: document.getElementById("replyPickerSummary"),
  replyPicker: document.getElementById("replyPicker"),
  closeReplyPickerBtn: document.getElementById("closeReplyPickerBtn"),
  refreshBtn: document.getElementById("refreshBtn"),
  library: document.getElementById("library"),
  exportCard: document.getElementById("exportCard"),
  exportTitle: document.getElementById("exportTitle"),
  exportMdBtn: document.getElementById("exportMdBtn"),
  exportJsonBtn: document.getElementById("exportJsonBtn"),
  exportZipBtn: document.getElementById("exportZipBtn"),
  status: document.getElementById("status")
};

const state = {
  tabId: null,
  page: null,
  items: {},
  selectedItemId: null,
  noteId: null,
  noteReplies: []
};

function setStatus(message, kind = "") {
  els.status.textContent = message || "";
  els.status.className = `status ${kind}`.trim();
}

function setConnected(ok, text) {
  els.connectionBadge.textContent = text;
  els.connectionBadge.className = `badge ${ok ? "" : "error"}`.trim();
}

async function activeTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

function isSubstackUrl(url = "") {
  try {
    const host = new URL(url).hostname;
    return host === "substack.com" || host.endsWith(".substack.com");
  } catch {
    return false;
  }
}

async function sendToPage(message) {
  if (!state.tabId) throw new Error("Không có tab Substack đang hoạt động.");
  return chrome.tabs.sendMessage(state.tabId, message);
}

async function loadItems() {
  const data = await chrome.storage.local.get("researchItems");
  state.items = data.researchItems || {};
  renderLibrary();
}

async function saveItems() {
  await chrome.storage.local.set({ researchItems: state.items });
  renderLibrary();
}

function currentItem() {
  if (!state.page?.canonicalUrl) return null;
  return state.items[researchItemId(state.page.canonicalUrl)] || null;
}

function selectedItem() {
  return state.selectedItemId ? state.items[state.selectedItemId] : currentItem();
}

function renderCurrentStats() {
  const item = currentItem();
  if (!item) {
    els.currentStats.classList.add("hidden");
    return;
  }
  const imageCount = item.article?.blocks?.filter((block) => block.type === "image").length || 0;
  const comments = (item.threads || []).reduce((total, thread) => total + (thread.comments?.length || 0), 0);
  els.currentStats.innerHTML = `
    <span class="stat">${item.article ? "Đã lưu bài viết" : "Chỉ có thảo luận"}</span>
    <span class="stat">${item.threads?.length || 0} nhánh</span>
    <span class="stat">${comments} bình luận</span>
    <span class="stat">${imageCount} ảnh</span>`;
  els.currentStats.classList.remove("hidden");
}

function renderLibrary() {
  const items = Object.values(state.items).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  if (!items.length) {
    els.library.className = "library empty-state";
    els.library.textContent = "Chưa có nội dung nào được lưu.";
    els.exportCard.classList.add("hidden");
    renderCurrentStats();
    return;
  }

  els.library.className = "library";
  els.library.innerHTML = "";
  items.forEach((item) => {
    const node = document.createElement("div");
    node.className = `library-item ${state.selectedItemId === item.id ? "selected" : ""}`.trim();
    const comments = (item.threads || []).reduce((sum, thread) => sum + (thread.comments?.length || 0), 0);
    node.innerHTML = `
      <p class="library-title"></p>
      <p class="library-meta">${item.threads?.length || 0} nhánh · ${comments} bình luận · ${item.article ? "đã lưu bài viết" : "chỉ có thảo luận"}</p>`;
    node.querySelector(".library-title").textContent = item.title || "Nghiên cứu chưa đặt tên";
    node.addEventListener("click", () => {
      state.selectedItemId = item.id;
      renderLibrary();
    });
    els.library.appendChild(node);
  });

  const item = selectedItem() || items[0];
  if (!state.selectedItemId && item) state.selectedItemId = item.id;
  if (item) {
    els.exportTitle.textContent = item.title || "Gói nghiên cứu";
    els.exportCard.classList.remove("hidden");
  }
  renderCurrentStats();
}

function hideReplyPicker() {
  state.noteReplies = [];
  state.noteId = null;
  els.replyPicker.innerHTML = "";
  els.replyPickerCard.classList.add("hidden");
}

function formatReplyText(text = "") {
  const clean = String(text).replace(/\s+/g, " ").trim();
  if (!clean) return "(Comment không có nội dung chữ)";
  return clean.length > 260 ? `${clean.slice(0, 257)}…` : clean;
}

function renderReplyPicker(noteId, comments) {
  state.noteId = noteId;
  state.noteReplies = comments;
  els.replyPicker.innerHTML = "";
  els.replyPickerSummary.textContent = `Đã tải ${comments.length} reply từ Note #${noteId}. Chọn một comment bên dưới.`;

  comments.forEach((comment) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "reply-item";
    button.style.marginLeft = `${Math.min(Number(comment.depth) || 0, 4) * 14}px`;
    button.style.width = `calc(100% - ${Math.min(Number(comment.depth) || 0, 4) * 14}px)`;

    const author = document.createElement("span");
    author.className = "reply-item-author";
    author.textContent = comment.author || "Người dùng Substack";
    const text = document.createElement("span");
    text.className = "reply-item-text";
    text.textContent = formatReplyText(comment.text);
    const meta = document.createElement("span");
    meta.className = "reply-item-meta";
    meta.textContent = `${comment.depth > 0 ? `Reply cấp ${comment.depth}` : "Comment gốc"} · ID ${comment.id}`;

    button.append(author, text, meta);
    button.addEventListener("click", () => saveSelectedNoteReply(comment.id));
    els.replyPicker.appendChild(button);
  });

  els.replyPickerCard.classList.remove("hidden");
}

async function refreshPage() {
  const tab = await activeTab();
  state.tabId = tab?.id || null;
  hideReplyPicker();

  if (!tab || !isSubstackUrl(tab.url || "")) {
    state.page = null;
    els.currentTitle.textContent = "Mở một bài viết Substack";
    els.currentUrl.textContent = tab?.url || "—";
    setConnected(false, "Không phải Substack");
    els.saveArticleBtn.disabled = true;
    els.selectThreadBtn.disabled = true;
    renderCurrentStats();
    return;
  }

  try {
    const response = await sendToPage({ type: "GET_PAGE_INFO" });
    if (!response?.ok) throw new Error(response?.error || "Extension chưa được nạp trên trang này.");
    state.page = response.page;
    const noteId = noteIdFromUrl(state.page.canonicalUrl || tab.url);
    els.currentTitle.textContent = state.page.title || tab.title || "Bài viết Substack";
    els.currentUrl.textContent = state.page.canonicalUrl || tab.url;
    setConnected(true, noteId ? "Note" : (state.page.isCommentsPage ? "Thảo luận" : "Sẵn sàng"));
    els.captureHint.textContent = noteId
      ? "Đây là Substack Note. Khi bấm Chọn nhánh thảo luận, extension sẽ tải cây reply trực tiếp rồi cho bạn chọn comment — không cần mở icon bình luận trước."
      : "Extension sẽ đánh dấu comment đang hiển thị trên trang để bạn chọn nhánh cần lưu.";
    els.saveArticleBtn.disabled = false;
    els.selectThreadBtn.disabled = false;
    const item = currentItem();
    if (item) state.selectedItemId = item.id;
    renderLibrary();
  } catch (error) {
    setConnected(false, "Tải lại trang");
    els.saveArticleBtn.disabled = true;
    els.selectThreadBtn.disabled = true;
    setStatus("Hãy tải lại tab Substack này sau khi cài extension, rồi mở lại bảng điều khiển.", "error");
  }
}

async function saveArticle() {
  setStatus("Đang lưu cấu trúc bài viết và thông tin hình ảnh…");
  els.saveArticleBtn.disabled = true;
  try {
    const response = await sendToPage({ type: "CAPTURE_ARTICLE" });
    if (!response?.ok) throw new Error(response?.error || "Không thể lưu bài viết.");
    const article = response.article;
    const id = researchItemId(article.canonicalUrl);
    state.items[id] = mergeArticle(state.items[id], article);
    state.selectedItemId = id;
    await saveItems();
    setStatus(`Đã lưu bài viết (${article.blocks.length} khối nội dung) vào thư viện. Chưa xuất file.`, "success");
  } catch (error) {
    setStatus(error.message || String(error), "error");
  } finally {
    els.saveArticleBtn.disabled = false;
  }
}

async function fetchNoteReplies(noteId) {
  const all = [];
  let cursor = null;
  let pages = 0;

  while (pages < 25) {
    const url = new URL(`https://substack.com/api/v1/reader/comment/${noteId}/replies`);
    if (cursor) url.searchParams.set("cursor", cursor);
    const response = await fetch(url.toString(), {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: { Accept: "application/json" }
    });
    if (!response.ok) throw new Error(`Substack trả về HTTP ${response.status} khi tải reply.`);
    const data = await response.json();
    all.push(...normalizeNoteReplyPayload(data));
    pages += 1;
    const nextCursor = data?.nextCursor;
    const hasBranches = Array.isArray(data?.commentBranches) && data.commentBranches.length > 0;
    if (!nextCursor || !hasBranches) break;
    cursor = String(nextCursor);
  }

  const seen = new Set();
  return all.filter((comment) => {
    if (!comment.id || seen.has(comment.id)) return false;
    seen.add(comment.id);
    return true;
  });
}

async function loadNoteReplyPicker(noteId) {
  els.selectThreadBtn.disabled = true;
  setStatus("Đang tải cây reply của Note từ Substack…");
  try {
    const comments = await fetchNoteReplies(noteId);
    if (!comments.length) {
      hideReplyPicker();
      setStatus("Note này hiện không có reply nào có thể tải được.", "error");
      return;
    }
    renderReplyPicker(noteId, comments);
    setStatus(`Đã tải ${comments.length} reply. Hãy chọn comment muốn lưu ở bảng bên dưới.`, "success");
  } catch (error) {
    hideReplyPicker();
    setStatus(`Không tải được reply trực tiếp: ${error.message || error} Tôi sẽ thử chế độ chọn trên trang.`, "error");
    try {
      const response = await sendToPage({ type: "START_THREAD_SELECTION_V2" });
      if (!response?.ok) throw new Error(response?.error || "Không thể bật chế độ chọn comment trên trang.");
      setStatus(`Fallback: đã phát hiện ${response.count} comment đang hiển thị. Hãy bấm vào một comment trên trang.`);
    } catch (fallbackError) {
      setStatus(`Không tải được reply của Note và trang cũng chưa render comment. Chi tiết: ${fallbackError.message || fallbackError}`, "error");
    }
  } finally {
    els.selectThreadBtn.disabled = false;
  }
}

async function saveSelectedNoteReply(commentId) {
  if (!state.noteReplies.length || !state.page?.canonicalUrl) return;
  try {
    const thread = buildNoteThread(state.noteReplies, commentId, state.page.canonicalUrl);
    const canonicalUrl = normalizeArticleUrl(thread.articleUrl);
    const id = researchItemId(canonicalUrl);
    state.items[id] = mergeThread(state.items[id], thread);
    state.selectedItemId = id;
    await saveItems();
    setStatus(`Đã lưu nhánh này (${thread.comments.length} comment) vào thư viện. Chưa xuất file.`, "success");
    hideReplyPicker();
  } catch (error) {
    setStatus(error.message || String(error), "error");
  }
}

async function selectThread() {
  const noteId = noteIdFromUrl(state.page?.canonicalUrl || state.page?.url || "");
  if (noteId) {
    await loadNoteReplyPicker(noteId);
    return;
  }

  setStatus("Hãy chọn một comment đang được đánh dấu trên trang. Nhấn Esc để hủy.");
  try {
    const response = await sendToPage({ type: "START_THREAD_SELECTION_V2" });
    if (!response?.ok) throw new Error(response?.error || "Không thể bật chế độ chọn comment.");
    setStatus(`Đã phát hiện ${response.count} comment đang hiển thị. Hãy bấm vào một comment trên trang.`);
  } catch (error) {
    setStatus(error.message || String(error), "error");
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function exportMarkdown() {
  const item = selectedItem();
  if (!item) return;
  const filename = `${safeFilename(item.title)}.md`;
  downloadBlob(new Blob([toMarkdown(item)], { type: "text/markdown;charset=utf-8" }), filename);
  setStatus(`Đã xuất ${filename}.`, "success");
}

function exportJson() {
  const item = selectedItem();
  if (!item) return;
  const filename = `${safeFilename(item.title)}.json`;
  downloadBlob(new Blob([toJson(item)], { type: "application/json;charset=utf-8" }), filename);
  setStatus(`Đã xuất ${filename}.`, "success");
}

function sniffExtension(contentType, fallbackName) {
  const map = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/svg+xml": "svg"
  };
  if (map[contentType]) return map[contentType];
  const ext = fallbackName?.split(".").pop();
  return ext && ext.length <= 5 ? ext : "img";
}

async function exportZip() {
  const item = selectedItem();
  if (!item) return;
  els.exportZipBtn.disabled = true;
  setStatus("Đang tạo gói ZIP và tải ảnh của bài viết…");

  try {
    const zip = new ZipWriter();
    zip.addText("research.md", toMarkdown(item, { useLocalAssets: true }));
    zip.addText("research.json", toJson(item));

    const images = item.article?.blocks?.filter((block) => block.type === "image" && block.src) || [];
    const failures = [];

    for (let index = 0; index < images.length; index += 1) {
      const image = images[index];
      setStatus(`Đang tải ảnh ${index + 1}/${images.length}…`);
      try {
        const response = await fetch(image.src, { credentials: "omit", cache: "force-cache" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const contentType = response.headers.get("content-type")?.split(";")[0] || "";
        const bytes = new Uint8Array(await response.arrayBuffer());
        const wantedExt = sniffExtension(contentType, image.assetName);
        const base = image.assetName.replace(/\.[^.]+$/, "");
        const finalName = `${base}.${wantedExt}`;
        zip.addBytes(`assets/${finalName}`, bytes);
        if (finalName !== image.assetName) zip.addBytes(`assets/${image.assetName}`, bytes);
      } catch (error) {
        failures.push(`${image.assetName}\t${image.src}\t${error.message || error}`);
      }
    }

    if (failures.length) {
      zip.addText("assets/FAILED_ASSETS.txt", "Không thể tải một số ảnh từ xa. URL gốc:\n\n" + failures.join("\n") + "\n");
    }

    const bytes = zip.build();
    const filename = `${safeFilename(item.title)}.zip`;
    downloadBlob(new Blob([bytes], { type: "application/zip" }), filename);
    setStatus(`Đã xuất ZIP: tải được ${images.length - failures.length}/${images.length} ảnh.`, failures.length ? "" : "success");
  } catch (error) {
    setStatus(error.message || String(error), "error");
  } finally {
    els.exportZipBtn.disabled = false;
  }
}

chrome.runtime.onMessage.addListener(async (message) => {
  if (message?.type === "THREAD_CAPTURED") {
    const thread = message.thread;
    const canonicalUrl = normalizeArticleUrl(thread.articleUrl);
    const id = researchItemId(canonicalUrl);
    state.items[id] = mergeThread(state.items[id], thread);
    state.selectedItemId = id;
    await saveItems();
    setStatus(`Đã lưu nhánh thảo luận (${thread.comments.length} bình luận) vào thư viện. Chưa xuất file.`, "success");
    return;
  }
  if (message?.type === "THREAD_CAPTURE_ERROR") {
    setStatus(message.error || "Không thể lưu nhánh thảo luận.", "error");
    return;
  }
  if (message?.type === "THREAD_SELECTION_CANCELLED") {
    setStatus("Đã hủy chọn nhánh thảo luận.");
  }
});

els.saveArticleBtn.addEventListener("click", saveArticle);
els.selectThreadBtn.addEventListener("click", selectThread);
els.closeReplyPickerBtn.addEventListener("click", hideReplyPicker);
els.refreshBtn.addEventListener("click", async () => { await loadItems(); await refreshPage(); });
els.exportMdBtn.addEventListener("click", exportMarkdown);
els.exportJsonBtn.addEventListener("click", exportJson);
els.exportZipBtn.addEventListener("click", exportZip);

chrome.tabs.onActivated?.addListener(() => refreshPage());
chrome.tabs.onUpdated?.addListener((tabId, changeInfo) => {
  if (tabId === state.tabId && changeInfo.status === "complete") refreshPage();
});

await loadItems();
await refreshPage();
