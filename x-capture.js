(() => {
  const snapshots = new Map();
  const clean = (value = "") => String(value).replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();

  function statusIdFromUrl(rawUrl = location.href) {
    try { return new URL(rawUrl, location.href).pathname.match(/\/status\/(\d+)/)?.[1] || null; }
    catch { return String(rawUrl).match(/\/status\/(\d+)/)?.[1] || null; }
  }

  function canonicalUrl() {
    const id = statusIdFromUrl();
    if (!id) return location.href.split(/[?#]/)[0];
    const handle = location.pathname.match(/^\/([^/]+)\/status\/\d+/)?.[1];
    return handle ? `https://x.com/${handle}/status/${id}` : location.href.split(/[?#]/)[0];
  }

  function articleStatusId(article) {
    for (const link of article.querySelectorAll('a[href*="/status/"]')) {
      const id = statusIdFromUrl(link.href || link.getAttribute("href") || "");
      if (id) return id;
    }
    return null;
  }

  function articleForStatus(statusId) {
    return Array.from(document.querySelectorAll('article[data-testid="tweet"], article'))
      .find((article) => articleStatusId(article) === statusId) || null;
  }

  function authorFromArticle(article) {
    const text = clean(article.querySelector('[data-testid="User-Name"]')?.innerText || "");
    const handle = text.match(/@[\w_]+/)?.[0] || "";
    const display = text.split("\n").map((part) => part.trim()).find((part) => part && !part.startsWith("@")) || "";
    return { author: display, handle };
  }

  function textFromArticle(article) {
    const tweetText = article.querySelector('[data-testid="tweetText"]');
    return clean(tweetText?.innerText || tweetText?.textContent || "");
  }

  function mediaFromArticle(article) {
    const out = [];
    const seen = new Set();
    article.querySelectorAll('[data-testid="tweetPhoto"] img, img[src*="pbs.twimg.com/media"]').forEach((img) => {
      const src = img.currentSrc || img.src || "";
      if (!src || seen.has(src)) return;
      seen.add(src);
      out.push({ type: "image", src, alt: img.alt || "" });
    });
    article.querySelectorAll("video").forEach((video) => {
      const poster = video.poster || "";
      if (!poster || seen.has(poster)) return;
      seen.add(poster);
      out.push({ type: "image", src: poster, alt: "Video poster" });
    });
    return out;
  }

  function snapshotArticle(article) {
    const id = articleStatusId(article);
    if (!id) return null;
    const { author, handle } = authorFromArticle(article);
    const time = article.querySelector("time");
    const url = Array.from(article.querySelectorAll('a[href*="/status/"]'))
      .map((a) => a.href || a.getAttribute("href") || "")
      .find((href) => statusIdFromUrl(href) === id) || `https://x.com/i/status/${id}`;
    return {
      id, parentId: null, depth: 0, author: handle || author, authorName: author, handle,
      createdAt: time?.getAttribute("datetime") || clean(time?.textContent || ""),
      url, text: textFromArticle(article), media: mediaFromArticle(article), selected: false
    };
  }

  function rootSnapshot() {
    const id = statusIdFromUrl();
    const article = id ? articleForStatus(id) : null;
    return article ? snapshotArticle(article) : null;
  }

  function pageInfo() {
    const root = rootSnapshot();
    return {
      url: location.href,
      canonicalUrl: canonicalUrl(),
      title: root ? `X post ${root.handle ? `by ${root.handle}` : ""}`.trim() : document.title,
      publication: "X", source: "x", isCommentsPage: false, sourceKind: "x-status"
    };
  }

  function captureArticle() {
    const root = rootSnapshot();
    if (!root) throw new Error("Không tìm thấy post X đang mở. Hãy mở trang chi tiết của một post.");
    const blocks = [];
    if (root.text) blocks.push({ type: "paragraph", text: root.text });
    (root.media || []).forEach((media, index) => blocks.push({
      type: "image", src: media.src, alt: media.alt || "", caption: "",
      assetName: `image-${String(index + 1).padStart(3, "0")}.img`
    }));
    return {
      schemaVersion: 1, source: "x", canonicalUrl: canonicalUrl(), pageUrl: location.href,
      title: `X post ${root.handle ? `by ${root.handle}` : ""}`.trim(), publication: "X",
      publishedAt: root.createdAt || "", capturedAt: new Date().toISOString(), rootPost: root, blocks
    };
  }

  function scanVisibleReplies() {
    const rootId = statusIdFromUrl();
    const articles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
    let added = 0;
    for (const article of articles) {
      const snap = snapshotArticle(article);
      if (!snap || snap.id === rootId || !snap.text) continue;
      if (!snapshots.has(snap.id)) added += 1;
      snapshots.set(snap.id, snap);
    }
    return { replies: Array.from(snapshots.values()), added, visibleCount: articles.length };
  }

  async function loadMoreReplies() {
    const before = snapshots.size;
    scanVisibleReplies();
    window.scrollBy({ top: Math.max(480, Math.round(window.innerHeight * 0.75)), behavior: "smooth" });
    await new Promise((resolve) => setTimeout(resolve, 900));
    scanVisibleReplies();
    return { replies: Array.from(snapshots.values()), added: snapshots.size - before };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "GET_PAGE_INFO") { sendResponse({ ok: true, page: pageInfo() }); return; }
    if (message?.type === "CAPTURE_ARTICLE") {
      try { sendResponse({ ok: true, article: captureArticle() }); }
      catch (error) { sendResponse({ ok: false, error: error.message || String(error) }); }
      return;
    }
    if (message?.type === "X_SCAN_REPLIES") { sendResponse({ ok: true, ...scanVisibleReplies() }); return; }
    if (message?.type === "X_RESET_REPLIES") { snapshots.clear(); sendResponse({ ok: true }); return; }
    if (message?.type === "X_LOAD_MORE_REPLIES") {
      loadMoreReplies().then((result) => sendResponse({ ok: true, ...result }))
        .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
      return true;
    }
  });
})();
