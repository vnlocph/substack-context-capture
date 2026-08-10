import { researchItemId, mergeArticle, mergeThread, normalizeArticleUrl } from "./lib/model.js";
import { toMarkdown, toJson, safeFilename } from "./lib/exporters.js";
import { ZipWriter } from "./lib/zip.js";

const els = {
  connectionBadge: document.getElementById("connectionBadge"),
  currentTitle: document.getElementById("currentTitle"),
  currentUrl: document.getElementById("currentUrl"),
  currentStats: document.getElementById("currentStats"),
  saveArticleBtn: document.getElementById("saveArticleBtn"),
  selectThreadBtn: document.getElementById("selectThreadBtn"),
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
  selectedItemId: null
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
  if (!state.tabId) throw new Error("No active Substack tab.");
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
    <span class="stat">${item.article ? "Article saved" : "Thread only"}</span>
    <span class="stat">${item.threads?.length || 0} threads</span>
    <span class="stat">${comments} comments</span>
    <span class="stat">${imageCount} images</span>`;
  els.currentStats.classList.remove("hidden");
}

function renderLibrary() {
  const items = Object.values(state.items).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  if (!items.length) {
    els.library.className = "library empty-state";
    els.library.textContent = "Nothing captured yet.";
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
      <p class="library-meta">${item.threads?.length || 0} threads · ${comments} comments · ${item.article ? "article saved" : "thread only"}</p>`;
    node.querySelector(".library-title").textContent = item.title || "Untitled research";
    node.addEventListener("click", () => {
      state.selectedItemId = item.id;
      renderLibrary();
    });
    els.library.appendChild(node);
  });

  const item = selectedItem() || items[0];
  if (!state.selectedItemId && item) state.selectedItemId = item.id;
  if (item) {
    els.exportTitle.textContent = item.title || "Research package";
    els.exportCard.classList.remove("hidden");
  }
  renderCurrentStats();
}

async function refreshPage() {
  const tab = await activeTab();
  state.tabId = tab?.id || null;
  if (!tab || !isSubstackUrl(tab.url || "")) {
    state.page = null;
    els.currentTitle.textContent = "Open a Substack post";
    els.currentUrl.textContent = tab?.url || "—";
    setConnected(false, "Not Substack");
    els.saveArticleBtn.disabled = true;
    els.selectThreadBtn.disabled = true;
    renderCurrentStats();
    return;
  }

  try {
    const response = await sendToPage({ type: "GET_PAGE_INFO" });
    if (!response?.ok) throw new Error(response?.error || "Content script unavailable.");
    state.page = response.page;
    els.currentTitle.textContent = state.page.title || tab.title || "Substack post";
    els.currentUrl.textContent = state.page.canonicalUrl || tab.url;
    setConnected(true, state.page.isCommentsPage ? "Discussion" : "Ready");
    els.saveArticleBtn.disabled = false;
    els.selectThreadBtn.disabled = false;
    const item = currentItem();
    if (item) state.selectedItemId = item.id;
    renderLibrary();
  } catch (error) {
    setConnected(false, "Reload page");
    els.saveArticleBtn.disabled = true;
    els.selectThreadBtn.disabled = true;
    setStatus("Reload this Substack tab after installing the extension, then reopen the panel.", "error");
  }
}

async function saveArticle() {
  setStatus("Capturing article structure and image references…");
  els.saveArticleBtn.disabled = true;
  try {
    const response = await sendToPage({ type: "CAPTURE_ARTICLE" });
    if (!response?.ok) throw new Error(response?.error || "Article capture failed.");
    const article = response.article;
    const id = researchItemId(article.canonicalUrl);
    state.items[id] = mergeArticle(state.items[id], article);
    state.selectedItemId = id;
    await saveItems();
    setStatus(`Saved article: ${article.blocks.length} content blocks.`, "success");
  } catch (error) {
    setStatus(error.message || String(error), "error");
  } finally {
    els.saveArticleBtn.disabled = false;
  }
}

async function selectThread() {
  setStatus("Select a highlighted comment on the page. Press Esc to cancel.");
  try {
    const response = await sendToPage({ type: "START_THREAD_SELECTION" });
    if (!response?.ok) throw new Error(response?.error || "Could not enter selection mode.");
    setStatus(`${response.count} visible comments detected. Click one on the page.`);
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
  setStatus(`Exported ${filename}.`, "success");
}

function exportJson() {
  const item = selectedItem();
  if (!item) return;
  const filename = `${safeFilename(item.title)}.json`;
  downloadBlob(new Blob([toJson(item)], { type: "application/json;charset=utf-8" }), filename);
  setStatus(`Exported ${filename}.`, "success");
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
  setStatus("Building ZIP and downloading article images…");

  try {
    const zip = new ZipWriter();
    zip.addText("research.md", toMarkdown(item, { useLocalAssets: true }));
    zip.addText("research.json", toJson(item));

    const images = item.article?.blocks?.filter((block) => block.type === "image" && block.src) || [];
    const failures = [];

    for (let index = 0; index < images.length; index += 1) {
      const image = images[index];
      setStatus(`Downloading image ${index + 1}/${images.length}…`);
      try {
        const response = await fetch(image.src, { credentials: "omit", cache: "force-cache" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const contentType = response.headers.get("content-type")?.split(";")[0] || "";
        const bytes = new Uint8Array(await response.arrayBuffer());
        const wantedExt = sniffExtension(contentType, image.assetName);
        const base = image.assetName.replace(/\.[^.]+$/, "");
        const finalName = `${base}.${wantedExt}`;
        zip.addBytes(`assets/${finalName}`, bytes);
        if (finalName !== image.assetName) {
          // Keep the declared path valid if content-type changed.
          zip.addBytes(`assets/${image.assetName}`, bytes);
        }
      } catch (error) {
        failures.push(`${image.assetName}\t${image.src}\t${error.message || error}`);
      }
    }

    if (failures.length) {
      zip.addText("assets/FAILED_ASSETS.txt", "Some remote images could not be downloaded. Original URLs:\n\n" + failures.join("\n") + "\n");
    }

    const bytes = zip.build();
    const filename = `${safeFilename(item.title)}.zip`;
    downloadBlob(new Blob([bytes], { type: "application/zip" }), filename);
    setStatus(`Exported ZIP: ${images.length - failures.length}/${images.length} images downloaded.`, failures.length ? "" : "success");
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
    setStatus(`Saved discussion context: ${thread.comments.length} comments.`, "success");
    return;
  }
  if (message?.type === "THREAD_CAPTURE_ERROR") {
    setStatus(message.error || "Thread capture failed.", "error");
    return;
  }
  if (message?.type === "THREAD_SELECTION_CANCELLED") {
    setStatus("Thread selection cancelled.");
  }
});

els.saveArticleBtn.addEventListener("click", saveArticle);
els.selectThreadBtn.addEventListener("click", selectThread);
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
