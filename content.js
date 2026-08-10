(() => {
  const STATE = {
    selectingThread: false,
    candidates: [],
    hoverNode: null,
    onOver: null,
    onOut: null,
    onClick: null,
    onKeydown: null
  };

  const normalizeWhitespace = (value = "") => value.replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();

  function stableHash(value) {
    let h = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
      h ^= value.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(36);
  }

  function getCanonicalUrl() {
    const canonical = document.querySelector('link[rel="canonical"]')?.href || location.href;
    try {
      const url = new URL(canonical, location.href);
      url.hash = "";
      url.search = "";
      url.pathname = url.pathname.replace(/\/comments\/?$/, "").replace(/\/$/, "");
      return url.toString();
    } catch {
      return location.href.split("#")[0].split("?")[0].replace(/\/comments\/?$/, "").replace(/\/$/, "");
    }
  }

  function meta(name, attr = "property") {
    return document.querySelector(`meta[${attr}="${name}"]`)?.content?.trim() || "";
  }

  function getPageInfo() {
    return {
      url: location.href,
      canonicalUrl: getCanonicalUrl(),
      title: meta("og:title") || document.querySelector("h1")?.textContent?.trim() || document.title,
      publication: meta("og:site_name") || "Substack",
      isCommentsPage: /\/comments\/?(?:$|[?#])/.test(location.href)
    };
  }

  function inlineMarkdown(node) {
    if (!node) return "";
    if (node.nodeType === Node.TEXT_NODE) return node.textContent || "";
    if (node.nodeType !== Node.ELEMENT_NODE) return "";

    const el = node;
    const tag = el.tagName.toLowerCase();
    if (["script", "style", "button", "svg", "noscript"].includes(tag)) return "";
    if (tag === "br") return "\n";

    const inner = Array.from(el.childNodes).map(inlineMarkdown).join("");
    if (tag === "a") {
      const href = el.href || el.getAttribute("href");
      const label = normalizeWhitespace(inner) || href || "link";
      return href ? `[${label}](${href})` : label;
    }
    if (["strong", "b"].includes(tag)) return inner.trim() ? `**${inner.trim()}**` : "";
    if (["em", "i"].includes(tag)) return inner.trim() ? `*${inner.trim()}*` : "";
    if (tag === "code") return inner.trim() ? `\`${inner.trim().replace(/`/g, "\\`")}\`` : "";
    return inner;
  }

  function findArticleRoot() {
    const selectors = [
      "article",
      "[data-testid='post-content']",
      "[data-testid*='post-content']",
      ".available-content",
      ".body.markup",
      "main"
    ];

    const candidates = [];
    for (const selector of selectors) {
      document.querySelectorAll(selector).forEach((node) => {
        const text = normalizeWhitespace(node.innerText || "");
        if (text.length >= 200) candidates.push({ node, score: text.length });
      });
    }

    candidates.sort((a, b) => b.score - a.score);
    const articleCandidate = candidates.find(({ node }) => node.tagName?.toLowerCase() === "article");
    return articleCandidate?.node || candidates[0]?.node || document.body;
  }

  function extensionFromUrl(src, contentType = "") {
    const typeMap = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "image/gif": "gif",
      "image/svg+xml": "svg"
    };
    if (typeMap[contentType]) return typeMap[contentType];
    try {
      const pathname = new URL(src, location.href).pathname;
      const match = pathname.match(/\.([a-zA-Z0-9]{2,5})$/);
      if (match) return match[1].toLowerCase().replace("jpeg", "jpg");
    } catch {}
    return "img";
  }

  function captureArticle() {
    const root = findArticleRoot();
    const clone = root.cloneNode(true);

    clone.querySelectorAll([
      "script", "style", "button", "nav", "footer", "form", "iframe",
      "[role='dialog']", "[aria-label*='subscribe' i]", "[class*='subscribe' i]",
      "[class*='paywall' i]", "[class*='comment' i]"
    ].join(",")).forEach((node) => node.remove());

    const blockSelectors = "h1,h2,h3,h4,h5,h6,p,blockquote,pre,ul,ol,figure,img,hr";
    const all = Array.from(clone.querySelectorAll(blockSelectors));
    const blocks = [];
    let imageIndex = 0;

    function hasHandledAncestor(el) {
      let parent = el.parentElement;
      while (parent && parent !== clone) {
        if (parent.matches?.(blockSelectors)) return true;
        parent = parent.parentElement;
      }
      return false;
    }

    for (const el of all) {
      if (hasHandledAncestor(el) && el.tagName.toLowerCase() !== "img") continue;
      const tag = el.tagName.toLowerCase();

      if (/^h[1-6]$/.test(tag)) {
        const text = normalizeWhitespace(inlineMarkdown(el));
        if (text) blocks.push({ type: "heading", level: Number(tag[1]), text });
        continue;
      }

      if (tag === "p") {
        const text = normalizeWhitespace(inlineMarkdown(el));
        if (text) blocks.push({ type: "paragraph", text });
        continue;
      }

      if (tag === "blockquote") {
        const text = normalizeWhitespace(inlineMarkdown(el));
        if (text) blocks.push({ type: "quote", text });
        continue;
      }

      if (tag === "pre") {
        const text = (el.textContent || "").trim();
        if (text) blocks.push({ type: "code", text });
        continue;
      }

      if (tag === "ul" || tag === "ol") {
        const items = Array.from(el.children)
          .filter((child) => child.tagName?.toLowerCase() === "li")
          .map((li) => normalizeWhitespace(inlineMarkdown(li)))
          .filter(Boolean);
        if (items.length) blocks.push({ type: "list", ordered: tag === "ol", items });
        continue;
      }

      if (tag === "hr") {
        blocks.push({ type: "separator" });
        continue;
      }

      if (tag === "figure") {
        const image = el.querySelector("img");
        if (!image) continue;
        imageIndex += 1;
        const src = image.currentSrc || image.src || image.getAttribute("src") || "";
        if (!src) continue;
        const ext = extensionFromUrl(src);
        blocks.push({
          type: "image",
          src,
          alt: image.alt || "",
          caption: normalizeWhitespace(el.querySelector("figcaption")?.textContent || ""),
          assetName: `image-${String(imageIndex).padStart(3, "0")}.${ext}`
        });
        continue;
      }

      if (tag === "img") {
        if (el.closest("figure")) continue;
        imageIndex += 1;
        const src = el.currentSrc || el.src || el.getAttribute("src") || "";
        if (!src) continue;
        const ext = extensionFromUrl(src);
        blocks.push({
          type: "image",
          src,
          alt: el.alt || "",
          caption: "",
          assetName: `image-${String(imageIndex).padStart(3, "0")}.${ext}`
        });
      }
    }

    // Fallback for pages whose post body uses non-semantic divs.
    if (blocks.filter((b) => b.type === "paragraph").length < 2) {
      const text = normalizeWhitespace(root.innerText || "");
      if (text) {
        blocks.length = 0;
        blocks.push({ type: "paragraph", text });
      }
    }

    const page = getPageInfo();
    const publishedAt = meta("article:published_time") || document.querySelector("article time")?.getAttribute("datetime") || "";

    return {
      schemaVersion: 1,
      source: "substack",
      canonicalUrl: page.canonicalUrl,
      pageUrl: location.href,
      title: page.title,
      publication: page.publication,
      publishedAt,
      capturedAt: new Date().toISOString(),
      blocks
    };
  }

  function replyLikeElements() {
    return Array.from(document.querySelectorAll("button,a,[role='button']")).filter((el) => {
      const text = normalizeWhitespace(el.textContent || "");
      return /^reply(?:\s*\(\d+\))?$/i.test(text);
    });
  }

  function findContainerFromReply(replyEl) {
    let current = replyEl.parentElement;
    let best = null;
    let steps = 0;
    while (current && current !== document.body && steps < 10) {
      const text = normalizeWhitespace(current.innerText || "");
      const replyCount = Array.from(current.querySelectorAll("button,a,[role='button']"))
        .filter((el) => /^reply(?:\s*\(\d+\))?$/i.test(normalizeWhitespace(el.textContent || ""))).length;

      if (replyCount === 1 && text.length >= 8 && text.length <= 12000) best = current;
      if (replyCount > 1 && best) break;
      current = current.parentElement;
      steps += 1;
    }
    return best;
  }

  function discoverCommentCandidates() {
    const explicitSelectors = [
      "[data-comment-id]",
      "[data-testid='comment']",
      "[data-testid*='comment-container']",
      "[data-component-name='Comment']"
    ];
    const nodes = new Set();
    const explicitNodes = new WeakSet();

    explicitSelectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((node) => {
        if (normalizeWhitespace(node.innerText || "").length >= 8) {
          nodes.add(node);
          explicitNodes.add(node);
        }
      });
    });

    replyLikeElements().forEach((reply) => {
      const container = findContainerFromReply(reply);
      if (container) nodes.add(container);
    });

    // Remove wrappers that fully contain several smaller candidate comments.
    const raw = Array.from(nodes).filter((node) => node instanceof HTMLElement && node.offsetParent !== null);
    const filtered = raw.filter((node) => {
      if (explicitNodes.has(node)) return true;
      const contained = raw.filter((other) => other !== node && node.contains(other));
      return contained.length < 2;
    });

    filtered.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    return filtered;
  }

  function inferDepths(candidates) {
    if (!candidates.length) return [];
    const lefts = candidates.map((node) => Math.round(node.getBoundingClientRect().left));
    const unique = Array.from(new Set(lefts)).sort((a, b) => a - b);
    const levels = [];
    unique.forEach((left) => {
      if (!levels.length || Math.abs(left - levels[levels.length - 1]) >= 12) levels.push(left);
    });

    return candidates.map((node, index) => {
      // Prefer actual candidate ancestor when the DOM is nested.
      let parent = node.parentElement;
      let nestedDepth = 0;
      while (parent) {
        if (candidates.includes(parent)) nestedDepth += 1;
        parent = parent.parentElement;
      }
      if (nestedDepth > 0) return nestedDepth;

      const left = lefts[index];
      let nearest = 0;
      let distance = Infinity;
      levels.forEach((level, levelIndex) => {
        const d = Math.abs(level - left);
        if (d < distance) {
          distance = d;
          nearest = levelIndex;
        }
      });
      return nearest;
    });
  }

  function authorFromNode(node) {
    const candidates = [
      "[data-testid*='author']",
      "[data-testid*='name']",
      "a[href*='/@']",
      "a[href*='substack.com/@']",
      "[class*='name']"
    ];
    for (const selector of candidates) {
      const el = node.querySelector(selector);
      const value = normalizeWhitespace(el?.textContent || "");
      if (value && value.length <= 120 && !/^reply$/i.test(value)) return value;
    }
    return "";
  }

  function commentText(node) {
    const clone = node.cloneNode(true);
    clone.querySelectorAll("[data-sr-comment-key]").forEach((child) => child.remove());
    clone.querySelectorAll("button,svg,script,style,[role='menu'],[aria-label*='menu' i]").forEach((el) => el.remove());

    // Remove common interaction-only labels from the final text without being too aggressive.
    let text = normalizeWhitespace(clone.innerText || clone.textContent || "");
    text = text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !/^(reply(?:\s*\(\d+\))?|share|like|restack)$/i.test(line))
      .join("\n");
    return normalizeWhitespace(text);
  }

  function captureThread(selectedNode) {
    const candidates = STATE.candidates.length ? STATE.candidates : discoverCommentCandidates();
    const depths = inferDepths(candidates);
    const selectedIndex = candidates.indexOf(selectedNode);
    if (selectedIndex < 0) throw new Error("Selected comment is no longer available.");

    const records = candidates.map((node, index) => {
      const rect = node.getBoundingClientRect();
      const explicitId = node.getAttribute("data-comment-id") || node.id || "";
      const rawText = commentText(node);
      const time = node.querySelector("time");
      const link = Array.from(node.querySelectorAll("a[href]")).find((a) => /comment|#/.test(a.href));
      return {
        node,
        index,
        depth: depths[index] || 0,
        id: explicitId || `comment-${stableHash(`${rawText}|${Math.round(rect.top)}|${index}`)}`,
        author: authorFromNode(node),
        createdAt: time?.getAttribute("datetime") || normalizeWhitespace(time?.textContent || ""),
        url: link?.href || location.href,
        text: rawText
      };
    });

    // Reconstruct parents from visible order + inferred depth.
    const stack = [];
    for (const record of records) {
      while (stack.length > record.depth) stack.pop();
      record.parentId = record.depth > 0 ? stack[record.depth - 1]?.id || null : null;
      stack[record.depth] = record;
      stack.length = record.depth + 1;
    }

    const selected = records[selectedIndex];

    // Ancestor path ending at selected.
    const byId = new Map(records.map((r) => [r.id, r]));
    const ancestorIds = new Set();
    let current = selected;
    while (current) {
      ancestorIds.add(current.id);
      current = current.parentId ? byId.get(current.parentId) : null;
    }

    // Descendants are the following visible nodes until depth returns to selected depth or above.
    const descendantIds = new Set();
    for (let i = selectedIndex + 1; i < records.length; i += 1) {
      const record = records[i];
      if (record.depth <= selected.depth) break;
      descendantIds.add(record.id);
    }

    const included = records.filter((record) => ancestorIds.has(record.id) || descendantIds.has(record.id));
    const minDepth = Math.min(...included.map((record) => record.depth));

    const comments = included.map(({ node, index, ...record }) => ({
      ...record,
      depth: record.depth - minDepth,
      selected: record.id === selected.id
    }));

    // Re-parent after depth normalization, preserving only included records.
    const includedIds = new Set(comments.map((c) => c.id));
    comments.forEach((c) => {
      if (c.parentId && !includedIds.has(c.parentId)) c.parentId = null;
    });

    return {
      schemaVersion: 1,
      source: "substack",
      articleUrl: getCanonicalUrl(),
      pageUrl: location.href,
      selectedCommentId: selected.id,
      capturedAt: new Date().toISOString(),
      comments
    };
  }

  function showToast(message, timeout = 2600) {
    document.getElementById("sr-capture-toast")?.remove();
    const toast = document.createElement("div");
    toast.id = "sr-capture-toast";
    toast.textContent = message;
    document.documentElement.appendChild(toast);
    if (timeout) window.setTimeout(() => toast.remove(), timeout);
  }

  function cleanupSelection() {
    STATE.selectingThread = false;
    STATE.candidates.forEach((node) => {
      node.classList.remove("sr-capture-candidate", "sr-capture-hover");
      node.removeAttribute("data-sr-comment-key");
    });
    STATE.candidates = [];
    STATE.hoverNode = null;
    if (STATE.onOver) document.removeEventListener("mouseover", STATE.onOver, true);
    if (STATE.onOut) document.removeEventListener("mouseout", STATE.onOut, true);
    if (STATE.onClick) document.removeEventListener("click", STATE.onClick, true);
    if (STATE.onKeydown) document.removeEventListener("keydown", STATE.onKeydown, true);
    STATE.onOver = STATE.onOut = STATE.onClick = STATE.onKeydown = null;
  }

  function startThreadSelection() {
    cleanupSelection();
    const candidates = discoverCommentCandidates();
    if (!candidates.length) {
      return { ok: false, error: "No visible comments detected. Open/expand the discussion first, then try again." };
    }

    STATE.selectingThread = true;
    STATE.candidates = candidates;
    candidates.forEach((node, index) => {
      node.dataset.srCommentKey = String(index);
      node.classList.add("sr-capture-candidate");
    });

    STATE.onOver = (event) => {
      const candidate = event.target.closest?.("[data-sr-comment-key]");
      if (!candidate || !STATE.candidates.includes(candidate)) return;
      STATE.hoverNode?.classList.remove("sr-capture-hover");
      STATE.hoverNode = candidate;
      candidate.classList.add("sr-capture-hover");
    };

    STATE.onOut = (event) => {
      const candidate = event.target.closest?.("[data-sr-comment-key]");
      if (candidate && candidate === STATE.hoverNode) candidate.classList.remove("sr-capture-hover");
    };

    STATE.onClick = (event) => {
      const candidate = event.target.closest?.("[data-sr-comment-key]");
      if (!candidate || !STATE.candidates.includes(candidate)) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      try {
        const thread = captureThread(candidate);
        cleanupSelection();
        chrome.runtime.sendMessage({ type: "THREAD_CAPTURED", thread });
        showToast(`Saved thread context: ${thread.comments.length} comments`);
      } catch (error) {
        cleanupSelection();
        chrome.runtime.sendMessage({ type: "THREAD_CAPTURE_ERROR", error: error.message || String(error) });
        showToast("Could not capture this thread.");
      }
    };

    STATE.onKeydown = (event) => {
      if (event.key !== "Escape") return;
      cleanupSelection();
      chrome.runtime.sendMessage({ type: "THREAD_SELECTION_CANCELLED" });
      showToast("Thread selection cancelled.");
    };

    document.addEventListener("mouseover", STATE.onOver, true);
    document.addEventListener("mouseout", STATE.onOut, true);
    document.addEventListener("click", STATE.onClick, true);
    document.addEventListener("keydown", STATE.onKeydown, true);
    showToast(`Select a comment to capture its context (${candidates.length} visible comments). Esc to cancel.`, 5000);
    return { ok: true, count: candidates.length };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    try {
      if (message?.type === "PING") {
        sendResponse({ ok: true, page: getPageInfo() });
        return;
      }
      if (message?.type === "GET_PAGE_INFO") {
        sendResponse({ ok: true, page: getPageInfo() });
        return;
      }
      if (message?.type === "CAPTURE_ARTICLE") {
        sendResponse({ ok: true, article: captureArticle() });
        return;
      }
      if (message?.type === "START_THREAD_SELECTION") {
        sendResponse(startThreadSelection());
        return;
      }
      if (message?.type === "CANCEL_THREAD_SELECTION") {
        cleanupSelection();
        sendResponse({ ok: true });
        return;
      }
    } catch (error) {
      sendResponse({ ok: false, error: error.message || String(error) });
    }
  });
})();
