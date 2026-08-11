import { researchItemId, mergeThread, normalizeArticleUrl } from "./lib/model.js";

const els = {
  currentUrl: document.getElementById("currentUrl"), selectThreadBtn: document.getElementById("selectThreadBtn"),
  pickerCard: document.getElementById("replyPickerCard"), summary: document.getElementById("replyPickerSummary"),
  picker: document.getElementById("replyPicker"), closeBtn: document.getElementById("closeReplyPickerBtn"),
  loadMoreBtn: document.getElementById("loadMoreRepliesBtn"), selectedCount: document.getElementById("selectedReplyCount"),
  clearBtn: document.getElementById("clearReplySelectionBtn"), addBtn: document.getElementById("addSelectedRepliesBtn"),
  refreshBtn: document.getElementById("refreshBtn"), status: document.getElementById("status")
};

const state = { active: false, replies: [], selected: new Set(), loading: false };
const sid = (value) => String(value ?? "");

function isXStatusUrl(rawUrl = "") {
  try { const url = new URL(rawUrl); return (url.hostname === "x.com" || url.hostname.endsWith(".x.com")) && /\/status\/\d+/.test(url.pathname); }
  catch { return false; }
}
async function activeTab() { const tabs = await chrome.tabs.query({ active: true, currentWindow: true }); return tabs[0] || null; }
async function send(message) { const tab = await activeTab(); if (!tab?.id) throw new Error("Không có tab X đang hoạt động."); return chrome.tabs.sendMessage(tab.id, message); }
function setStatus(message, kind = "") { els.status.textContent = message || ""; els.status.className = `status ${kind}`.trim(); }
function closePicker() { if (!state.active) return; state.active = false; state.replies = []; state.selected.clear(); els.picker.innerHTML = ""; els.pickerCard.classList.add("hidden"); }
function preview(text = "") { const value = String(text).replace(/\s+/g, " ").trim(); return value.length > 320 ? `${value.slice(0, 317)}…` : value; }

function render() {
  if (!state.active) return;
  els.picker.innerHTML = "";
  els.summary.textContent = state.replies.length
    ? `Đã snapshot ${state.replies.length} reply. X chỉ được quét theo từng batch đang hiển thị; không tự tải toàn bộ conversation.`
    : "Chưa thấy reply nào trong batch hiện tại. Có thể bấm Tải thêm để scroll và quét batch tiếp theo.";

  state.replies.forEach((reply) => {
    const id = sid(reply.id); const selected = state.selected.has(id);
    const row = document.createElement("div"); row.className = `multi-reply-item${selected ? " selected" : ""}`;
    const select = document.createElement("button"); select.type = "button"; select.className = "multi-reply-check"; select.textContent = selected ? "✓" : "+";
    select.addEventListener("click", () => { if (selected) state.selected.delete(id); else state.selected.add(id); render(); });
    const body = document.createElement("div"); body.className = "multi-reply-body";
    const author = document.createElement("strong"); author.textContent = reply.handle || reply.author || reply.authorName || "Người dùng X";
    const text = document.createElement("span"); text.textContent = preview(reply.text) || "(Không có nội dung chữ)";
    const meta = document.createElement("small"); meta.textContent = `X reply · ID ${id}`;
    body.append(author, text, meta); row.append(select, body); els.picker.appendChild(row);
  });

  els.selectedCount.textContent = `Đã chọn ${state.selected.size} reply`;
  els.clearBtn.disabled = state.selected.size === 0; els.addBtn.disabled = state.selected.size === 0;
  els.loadMoreBtn.classList.remove("hidden"); els.loadMoreBtn.disabled = state.loading;
  els.loadMoreBtn.textContent = state.loading ? "Đang tải…" : "Tải thêm reply";
  els.pickerCard.classList.remove("hidden");
}

function mergeReplies(replies) { const map = new Map(state.replies.map((reply) => [sid(reply.id), reply])); replies.forEach((reply) => map.set(sid(reply.id), reply)); state.replies = Array.from(map.values()); }

async function openPicker() {
  state.active = true; state.replies = []; state.selected.clear(); els.pickerCard.classList.remove("hidden"); setStatus("Đang quét các reply X đang hiển thị…");
  try {
    await send({ type: "X_RESET_REPLIES" });
    const response = await send({ type: "X_SCAN_REPLIES" }); if (!response?.ok) throw new Error(response?.error || "Không quét được reply.");
    mergeReplies(response.replies || []);
    setStatus(state.replies.length ? `Đã thấy ${state.replies.length} reply. Chọn nhiều reply rồi bấm “Thêm vào bài viết”.` : "Batch hiện tại chưa có reply. Bấm “Tải thêm reply” để scroll và quét tiếp.");
  } catch (error) { setStatus(`Không mở được picker X: ${error.message || error}`, "error"); }
  render();
}

async function loadMore() {
  if (!state.active || state.loading) return; state.loading = true; render(); setStatus("Đang scroll nhẹ và quét thêm reply X…");
  try {
    const response = await send({ type: "X_LOAD_MORE_REPLIES" }); if (!response?.ok) throw new Error(response?.error || "Không tải thêm được reply.");
    const before = state.replies.length; mergeReplies(response.replies || []); const added = state.replies.length - before;
    setStatus(added > 0 ? `Đã thêm ${added} reply mới (${state.replies.length} đã snapshot).` : "Chưa thấy reply mới trong batch này.", added > 0 ? "success" : "");
  } catch (error) { setStatus(`Không tải thêm được reply: ${error.message || error}`, "error"); }
  finally { state.loading = false; render(); }
}

async function saveSelected() {
  if (!state.active || !state.selected.size) return;
  const articleUrl = els.currentUrl?.textContent?.trim() || ""; if (!isXStatusUrl(articleUrl)) return;
  try {
    const canonicalUrl = normalizeArticleUrl(articleUrl); const itemId = researchItemId(canonicalUrl);
    const data = await chrome.storage.local.get("researchItems"); const items = data.researchItems || {}; let item = items[itemId]; let saved = 0;
    for (const replyId of state.selected) {
      const reply = state.replies.find((candidate) => sid(candidate.id) === sid(replyId)); if (!reply) continue;
      const thread = { schemaVersion: 1, source: "x", sourceKind: "x-visible-reply", articleUrl: canonicalUrl, pageUrl: articleUrl,
        selectedCommentId: sid(reply.id), capturedAt: new Date().toISOString(), comments: [{ ...reply, id: sid(reply.id), parentId: null, depth: 0, selected: true }] };
      const next = mergeThread(item, thread); if (next !== item) saved += 1; item = next;
    }
    if (item) { items[itemId] = item; await chrome.storage.local.set({ researchItems: items }); }
    setStatus(`Đã thêm ${saved} reply X vào Research Library. Chưa xuất file.`, "success"); closePicker(); els.refreshBtn?.click();
  } catch (error) { setStatus(`Không lưu được reply X: ${error.message || error}`, "error"); }
}

els.selectThreadBtn.addEventListener("click", (event) => {
  const url = els.currentUrl?.textContent?.trim() || ""; if (!isXStatusUrl(url)) return;
  event.preventDefault(); event.stopImmediatePropagation(); openPicker();
}, true);
els.loadMoreBtn.addEventListener("click", (event) => { if (!state.active) return; event.preventDefault(); loadMore(); });
els.clearBtn.addEventListener("click", () => { if (!state.active) return; state.selected.clear(); render(); });
els.addBtn.addEventListener("click", (event) => { if (!state.active) return; event.preventDefault(); saveSelected(); });
els.closeBtn.addEventListener("click", () => { if (!state.active) return; closePicker(); }, true);
