import { researchItemId, mergeArticle, mergeThread, normalizeArticleUrl } from "./lib/model.js";
import { toMarkdown, toJson, safeFilename } from "./lib/exporters.js";
import { ZipWriter } from "./lib/zip.js";

const els = {
  connectionBadge: document.getElementById("connectionBadge"), currentTitle: document.getElementById("currentTitle"),
  currentUrl: document.getElementById("currentUrl"), currentStats: document.getElementById("currentStats"),
  saveArticleBtn: document.getElementById("saveArticleBtn"), selectThreadBtn: document.getElementById("selectThreadBtn"),
  captureHint: document.getElementById("captureHint"), refreshBtn: document.getElementById("refreshBtn"),
  library: document.getElementById("library"), exportCard: document.getElementById("exportCard"),
  exportTitle: document.getElementById("exportTitle"), exportMdBtn: document.getElementById("exportMdBtn"),
  exportJsonBtn: document.getElementById("exportJsonBtn"), exportZipBtn: document.getElementById("exportZipBtn"), status: document.getElementById("status")
};

const state = { tabId: null, page: null, items: {}, selectedItemId: null };
function setStatus(message, kind = "") { els.status.textContent = message || ""; els.status.className = `status ${kind}`.trim(); }
function setConnected(ok, text) { els.connectionBadge.textContent = text; els.connectionBadge.className = `badge ${ok ? "" : "error"}`.trim(); }
async function activeTab() { const tabs = await chrome.tabs.query({ active: true, currentWindow: true }); return tabs[0] || null; }

function sourceFromUrl(rawUrl = "") {
  try {
    const url = new URL(rawUrl);
    if ((url.hostname === "x.com" || url.hostname.endsWith(".x.com")) && /\/status\/\d+/.test(url.pathname)) return "x";
    if (url.hostname === "substack.com" || url.hostname.endsWith(".substack.com")) return "substack";
  } catch {}
  return null;
}

async function sendToPage(message) { if (!state.tabId) throw new Error("Không có tab được hỗ trợ đang hoạt động."); return chrome.tabs.sendMessage(state.tabId, message); }
async function loadItems() { const data = await chrome.storage.local.get("researchItems"); state.items = data.researchItems || {}; renderLibrary(); }
async function saveItems() { await chrome.storage.local.set({ researchItems: state.items }); renderLibrary(); }
function currentItem() { if (!state.page?.canonicalUrl) return null; return state.items[researchItemId(state.page.canonicalUrl)] || null; }
function selectedItem() { return state.selectedItemId ? state.items[state.selectedItemId] : currentItem(); }
function sourceLabel(source) { return source === "x" ? "X" : source === "substack" ? "Substack" : "Web"; }

function renderCurrentStats() {
  const item = currentItem(); if (!item) { els.currentStats.classList.add("hidden"); return; }
  const imageCount = item.article?.blocks?.filter((block) => block.type === "image").length || 0;
  const comments = (item.threads || []).reduce((total, thread) => total + (thread.comments?.length || 0), 0);
  els.currentStats.innerHTML = `<span class="stat">${sourceLabel(item.source)}</span><span class="stat">${item.article ? "Đã lưu nội dung" : "Chỉ có thảo luận"}</span><span class="stat">${item.threads?.length || 0} nhánh</span><span class="stat">${comments} comment</span><span class="stat">${imageCount} ảnh</span>`;
  els.currentStats.classList.remove("hidden");
}

function renderLibrary() {
  const items = Object.values(state.items).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  if (!items.length) { els.library.className = "library empty-state"; els.library.textContent = "Chưa có nội dung nào được lưu."; els.exportCard.classList.add("hidden"); renderCurrentStats(); return; }
  els.library.className = "library"; els.library.innerHTML = "";
  items.forEach((item) => {
    const node = document.createElement("div"); node.className = `library-item ${state.selectedItemId === item.id ? "selected" : ""}`.trim();
    const comments = (item.threads || []).reduce((sum, thread) => sum + (thread.comments?.length || 0), 0);
    node.innerHTML = `<p class="library-title"></p><p class="library-meta">${sourceLabel(item.source)} · ${item.threads?.length || 0} nhánh · ${comments} comment · ${item.article ? "đã lưu nội dung" : "chỉ có thảo luận"}</p>`;
    node.querySelector(".library-title").textContent = item.title || "Nghiên cứu chưa đặt tên";
    node.addEventListener("click", () => { state.selectedItemId = item.id; renderLibrary(); }); els.library.appendChild(node);
  });
  const item = selectedItem() || items[0]; if (!state.selectedItemId && item) state.selectedItemId = item.id;
  if (item) { els.exportTitle.textContent = item.title || "Gói nghiên cứu"; els.exportCard.classList.remove("hidden"); }
  renderCurrentStats();
}

async function refreshPage() {
  const tab = await activeTab(); state.tabId = tab?.id || null; const source = sourceFromUrl(tab?.url || "");
  if (!tab || !source) {
    state.page = null; els.currentTitle.textContent = "Mở một post X hoặc bài Substack"; els.currentUrl.textContent = tab?.url || "—";
    setConnected(false, "Chưa hỗ trợ"); els.saveArticleBtn.disabled = true; els.selectThreadBtn.disabled = true; els.captureHint.textContent = "Hiện hỗ trợ X post detail và Substack."; renderCurrentStats(); return;
  }
  try {
    const response = await sendToPage({ type: "GET_PAGE_INFO" }); if (!response?.ok) throw new Error(response?.error || "Content script chưa sẵn sàng.");
    state.page = response.page; els.currentTitle.textContent = state.page.title || tab.title || "Nội dung"; els.currentUrl.textContent = state.page.canonicalUrl || tab.url;
    setConnected(true, source === "x" ? "X" : (state.page.isCommentsPage ? "Substack · Thảo luận" : "Substack"));
    els.saveArticleBtn.disabled = false; els.selectThreadBtn.disabled = false; els.saveArticleBtn.textContent = source === "x" ? "Lưu post X" : "Lưu bài viết";
    els.captureHint.textContent = source === "x" ? "X: quét reply theo từng batch đang hiển thị để tránh tải toàn bộ conversation." : "Substack: Note dùng picker reply; bài thường chọn comment đang hiển thị.";
    const item = currentItem(); if (item) state.selectedItemId = item.id; renderLibrary();
  } catch (error) { setConnected(false, "Tải lại trang"); els.saveArticleBtn.disabled = true; els.selectThreadBtn.disabled = true; setStatus("Hãy tải lại tab này sau khi reload extension rồi mở lại bảng điều khiển.", "error"); }
}

async function saveArticle() {
  setStatus("Đang lưu nội dung và thông tin media…"); els.saveArticleBtn.disabled = true;
  try {
    const response = await sendToPage({ type: "CAPTURE_ARTICLE" }); if (!response?.ok) throw new Error(response?.error || "Không thể lưu nội dung.");
    const article = response.article; const id = researchItemId(article.canonicalUrl); state.items[id] = mergeArticle(state.items[id], article); state.selectedItemId = id; await saveItems();
    setStatus(`Đã lưu ${sourceLabel(article.source)} vào Research Library. Chưa xuất file.`, "success");
  } catch (error) { setStatus(error.message || String(error), "error"); }
  finally { els.saveArticleBtn.disabled = false; }
}

async function selectThreadFallback() {
  setStatus("Hãy chọn một comment đang được đánh dấu trên trang. Nhấn Esc để hủy.");
  try { const response = await sendToPage({ type: "START_THREAD_SELECTION_V2" }); if (!response?.ok) throw new Error(response?.error || "Không thể bật chế độ chọn comment."); setStatus(`Đã phát hiện ${response.count} comment đang hiển thị. Hãy bấm vào một comment trên trang.`); }
  catch (error) { setStatus(error.message || String(error), "error"); }
}

function downloadBlob(blob, filename) { const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000); }
function exportMarkdown() { const item = selectedItem(); if (!item) return; const filename = `${safeFilename(item.title)}.md`; downloadBlob(new Blob([toMarkdown(item)], { type: "text/markdown;charset=utf-8" }), filename); setStatus(`Đã xuất ${filename}.`, "success"); }
function exportJson() { const item = selectedItem(); if (!item) return; const filename = `${safeFilename(item.title)}.json`; downloadBlob(new Blob([toJson(item)], { type: "application/json;charset=utf-8" }), filename); setStatus(`Đã xuất ${filename}.`, "success"); }
function sniffExtension(contentType, fallbackName) { const map = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/svg+xml": "svg" }; if (map[contentType]) return map[contentType]; const ext = fallbackName?.split(".").pop(); return ext && ext.length <= 5 ? ext : "img"; }

async function exportZip() {
  const item = selectedItem(); if (!item) return; els.exportZipBtn.disabled = true; setStatus("Đang tạo ZIP và tải media có thể tải được…");
  try {
    const zip = new ZipWriter(); zip.addText("research.md", toMarkdown(item, { useLocalAssets: true })); zip.addText("research.json", toJson(item));
    const images = item.article?.blocks?.filter((block) => block.type === "image" && block.src) || []; const failures = [];
    for (let index = 0; index < images.length; index += 1) {
      const image = images[index]; setStatus(`Đang tải ảnh ${index + 1}/${images.length}…`);
      try { const response = await fetch(image.src, { credentials: "omit", cache: "force-cache" }); if (!response.ok) throw new Error(`HTTP ${response.status}`); const contentType = response.headers.get("content-type")?.split(";")[0] || ""; const bytes = new Uint8Array(await response.arrayBuffer()); const ext = sniffExtension(contentType, image.assetName); const base = image.assetName.replace(/\.[^.]+$/, ""); zip.addBytes(`assets/${base}.${ext}`, bytes); }
      catch (error) { failures.push(`${image.assetName}\t${image.src}\t${error.message || error}`); }
    }
    if (failures.length) zip.addText("assets/FAILED_ASSETS.txt", failures.join("\n") + "\n"); const bytes = zip.build(); const filename = `${safeFilename(item.title)}.zip`; downloadBlob(new Blob([bytes], { type: "application/zip" }), filename); setStatus(`Đã xuất ZIP: ${images.length - failures.length}/${images.length} ảnh tải được.`, failures.length ? "" : "success");
  } catch (error) { setStatus(error.message || String(error), "error"); }
  finally { els.exportZipBtn.disabled = false; }
}

chrome.runtime.onMessage.addListener(async (message) => {
  if (message?.type === "THREAD_CAPTURED") { const thread = message.thread; const canonicalUrl = normalizeArticleUrl(thread.articleUrl); const id = researchItemId(canonicalUrl); state.items[id] = mergeThread(state.items[id], thread); state.selectedItemId = id; await saveItems(); setStatus(`Đã lưu nhánh thảo luận (${thread.comments.length} comment). Chưa xuất file.`, "success"); }
  else if (message?.type === "THREAD_CAPTURE_ERROR") setStatus(message.error || "Không thể lưu nhánh thảo luận.", "error");
  else if (message?.type === "THREAD_SELECTION_CANCELLED") setStatus("Đã hủy chọn nhánh thảo luận.");
});

els.saveArticleBtn.addEventListener("click", saveArticle);
els.selectThreadBtn.addEventListener("click", selectThreadFallback);
els.refreshBtn.addEventListener("click", async () => { await loadItems(); await refreshPage(); });
els.exportMdBtn.addEventListener("click", exportMarkdown); els.exportJsonBtn.addEventListener("click", exportJson); els.exportZipBtn.addEventListener("click", exportZip);
chrome.tabs.onActivated?.addListener(() => refreshPage()); chrome.tabs.onUpdated?.addListener((tabId, changeInfo) => { if (tabId === state.tabId && changeInfo.status === "complete") refreshPage(); });
await loadItems(); await refreshPage();
