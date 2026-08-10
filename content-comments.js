(() => {
  const state = { candidates: [], over: null, out: null, click: null, key: null };
  const clean = (v = "") => v.replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  const REPLY = /^(?:reply|replies|répondre|réponse|réponses|trả lời|tra loi|responder|respuesta|antworten|antwort|rispondi|risposta|resposta|beantwoorden|antwoord|返信|回复|回覆)(?:\s*\(\d+\))?$/i;

  function hash(value) {
    let h = 2166136261;
    for (let i = 0; i < value.length; i += 1) { h ^= value.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36);
  }

  function canonicalUrl() {
    const raw = document.querySelector('link[rel="canonical"]')?.href || location.href;
    try {
      const u = new URL(raw, location.href);
      u.hash = ""; u.search = "";
      u.pathname = u.pathname.replace(/\/comments\/?$/, "").replace(/\/$/, "");
      return u.toString();
    } catch { return location.href.split(/[?#]/)[0].replace(/\/comments\/?$/, "").replace(/\/$/, ""); }
  }

  function visible(el) {
    if (!(el instanceof HTMLElement)) return false;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const s = getComputedStyle(el);
    return s.display !== "none" && s.visibility !== "hidden" && s.opacity !== "0";
  }

  function replyControl(el) {
    if (!(el instanceof HTMLElement)) return false;
    const text = clean(el.textContent || "");
    const aria = clean(el.getAttribute("aria-label") || "");
    const testId = clean(el.getAttribute("data-testid") || "");
    const component = clean(el.getAttribute("data-component-name") || "");
    return REPLY.test(text) || REPLY.test(aria) || /(?:^|[-_])reply(?:$|[-_])/i.test(testId) || /reply/i.test(component);
  }

  function replyControls(root = document) {
    return Array.from(root.querySelectorAll("button,a,[role='button']")).filter(replyControl);
  }

  function containerFromMarker(marker, requireReply = false) {
    let cur = marker.parentElement;
    let best = null;
    for (let step = 0; cur && cur !== document.body && step < 12; step += 1, cur = cur.parentElement) {
      const text = clean(cur.innerText || "");
      const replies = replyControls(cur).length;
      const times = cur.querySelectorAll("time").length;
      const explicit = cur.matches?.("[data-comment-id],[data-comment_id],[data-testid*='comment' i],[data-component-name*='comment' i],[id^='comment-'],[id^='comment_']");
      const profile = Boolean(cur.querySelector("a[href*='/@'],a[href*='substack.com/@'],img[alt]"));
      const commentsPage = /\/comments\/?(?:$|[?#])/.test(location.href);
      const looksLikeComment = requireReply ? replies === 1 : (replies >= 1 || explicit || (commentsPage && profile));
      if (times <= 1 && text.length >= 8 && text.length <= 12000 && looksLikeComment) best = cur;
      if ((replies > 1 || times > 1) && best) break;
    }
    return best;
  }

  function discover() {
    const nodes = new Set();
    const selectors = [
      "[data-comment-id]", "[data-comment_id]", "[data-testid='comment']",
      "[data-testid*='comment-container' i]", "[data-testid*='comment-item' i]",
      "[data-component-name*='comment' i]", "[id^='comment-']", "[id^='comment_']"
    ];
    for (const selector of selectors) {
      document.querySelectorAll(selector).forEach((el) => {
        const text = clean(el.innerText || "");
        if (visible(el) && text.length >= 8 && text.length <= 15000) nodes.add(el);
      });
    }
    replyControls().forEach((el) => { const c = containerFromMarker(el, true); if (c && visible(c)) nodes.add(c); });
    document.querySelectorAll("time").forEach((el) => { const c = containerFromMarker(el, false); if (c && visible(c)) nodes.add(c); });

    const raw = Array.from(nodes).filter(visible);
    const smallest = raw.filter((el) => !raw.some((other) => other !== el && el.contains(other)));
    const seen = new Set();
    return smallest.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top).filter((el) => {
      const r = el.getBoundingClientRect();
      const key = `${Math.round(r.top)}|${Math.round(r.left)}|${hash(clean(el.innerText || "").slice(0, 500))}`;
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });
  }

  function depths(nodes) {
    const left = nodes.map((n) => Math.round(n.getBoundingClientRect().left));
    const levels = [];
    [...new Set(left)].sort((a, b) => a - b).forEach((v) => { if (!levels.length || Math.abs(v - levels.at(-1)) >= 12) levels.push(v); });
    return nodes.map((node, i) => {
      let d = 0, p = node.parentElement;
      while (p) { if (nodes.includes(p)) d += 1; p = p.parentElement; }
      if (d) return d;
      let best = 0, dist = Infinity;
      levels.forEach((v, j) => { const x = Math.abs(v - left[i]); if (x < dist) { dist = x; best = j; } });
      return best;
    });
  }

  function author(node) {
    for (const sel of ["[data-testid*='author']", "[data-testid*='name']", "a[href*='/@']", "a[href*='substack.com/@']", "[class*='name']"]) {
      const value = clean(node.querySelector(sel)?.textContent || "");
      if (value && value.length <= 120 && !REPLY.test(value)) return value;
    }
    return "";
  }

  function textOf(node) {
    const clone = node.cloneNode(true);
    clone.querySelectorAll("button,svg,script,style,[role='menu'],[aria-label*='menu' i]").forEach((el) => el.remove());
    return clean((clone.innerText || clone.textContent || "").split("\n").map((x) => x.trim())
      .filter((x) => x && !REPLY.test(x) && !/^(share|like|restack|partager|aimer|j’aime|chia sẻ|thích)$/i.test(x)).join("\n"));
  }

  function capture(selectedNode) {
    const nodes = state.candidates;
    const ds = depths(nodes);
    const selectedIndex = nodes.indexOf(selectedNode);
    if (selectedIndex < 0) throw new Error("Comment đã chọn không còn tồn tại trên trang.");
    const records = nodes.map((node, i) => {
      const r = node.getBoundingClientRect();
      const text = textOf(node);
      const time = node.querySelector("time");
      const link = Array.from(node.querySelectorAll("a[href]")).find((a) => /comment|#/.test(a.href));
      return {
        node, depth: ds[i] || 0,
        id: node.getAttribute("data-comment-id") || node.getAttribute("data-comment_id") || node.id || `comment-${hash(`${text}|${Math.round(r.top)}|${i}`)}`,
        author: author(node), createdAt: time?.getAttribute("datetime") || clean(time?.textContent || ""),
        url: link?.href || location.href, text
      };
    });
    const stack = [];
    records.forEach((r) => { while (stack.length > r.depth) stack.pop(); r.parentId = r.depth > 0 ? stack[r.depth - 1]?.id || null : null; stack[r.depth] = r; stack.length = r.depth + 1; });
    const selected = records[selectedIndex];
    const byId = new Map(records.map((r) => [r.id, r]));
    const ids = new Set();
    for (let cur = selected; cur; cur = cur.parentId ? byId.get(cur.parentId) : null) ids.add(cur.id);
    for (let i = selectedIndex + 1; i < records.length; i += 1) { if (records[i].depth <= selected.depth) break; ids.add(records[i].id); }
    const included = records.filter((r) => ids.has(r.id));
    const min = Math.min(...included.map((r) => r.depth));
    const comments = included.map(({ node, ...r }) => ({ ...r, depth: r.depth - min, selected: r.id === selected.id }));
    const includedIds = new Set(comments.map((c) => c.id));
    comments.forEach((c) => { if (c.parentId && !includedIds.has(c.parentId)) c.parentId = null; });
    return { schemaVersion: 1, source: "substack", articleUrl: canonicalUrl(), pageUrl: location.href, selectedCommentId: selected.id, capturedAt: new Date().toISOString(), comments };
  }

  function toast(message, timeout = 3500) {
    document.getElementById("sr-capture-toast")?.remove();
    const el = document.createElement("div"); el.id = "sr-capture-toast"; el.textContent = message; document.documentElement.appendChild(el);
    if (timeout) setTimeout(() => el.remove(), timeout);
  }

  function cleanup() {
    state.candidates.forEach((n) => { n.classList.remove("sr-capture-candidate", "sr-capture-hover"); n.removeAttribute("data-sr-v2-key"); });
    if (state.over) document.removeEventListener("mouseover", state.over, true);
    if (state.out) document.removeEventListener("mouseout", state.out, true);
    if (state.click) document.removeEventListener("click", state.click, true);
    if (state.key) document.removeEventListener("keydown", state.key, true);
    state.candidates = []; state.over = state.out = state.click = state.key = null;
  }

  function start() {
    cleanup();
    const candidates = discover();
    if (!candidates.length) {
      const replies = replyControls().length;
      const times = Array.from(document.querySelectorAll("time")).filter(visible).length;
      return { ok: false, error: `Không phát hiện được comment. Hãy mở phần thảo luận/reply rồi thử lại. Chẩn đoán: ${replies} nút trả lời, ${times} mốc thời gian đang hiển thị.` };
    }
    state.candidates = candidates;
    candidates.forEach((n, i) => { n.dataset.srV2Key = String(i); n.classList.add("sr-capture-candidate"); });
    state.over = (e) => { const n = e.target.closest?.("[data-sr-v2-key]"); if (n && state.candidates.includes(n)) n.classList.add("sr-capture-hover"); };
    state.out = (e) => { const n = e.target.closest?.("[data-sr-v2-key]"); if (n) n.classList.remove("sr-capture-hover"); };
    state.click = (e) => {
      const n = e.target.closest?.("[data-sr-v2-key]"); if (!n || !state.candidates.includes(n)) return;
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      try { const thread = capture(n); cleanup(); chrome.runtime.sendMessage({ type: "THREAD_CAPTURED", thread }); toast(`Đã lưu ${thread.comments.length} bình luận vào thư viện. Chưa xuất file.`); }
      catch (err) { cleanup(); chrome.runtime.sendMessage({ type: "THREAD_CAPTURE_ERROR", error: err.message || String(err) }); toast("Không thể lưu nhánh thảo luận này."); }
    };
    state.key = (e) => { if (e.key === "Escape") { cleanup(); chrome.runtime.sendMessage({ type: "THREAD_SELECTION_CANCELLED" }); toast("Đã hủy chọn nhánh thảo luận."); } };
    document.addEventListener("mouseover", state.over, true); document.addEventListener("mouseout", state.out, true);
    document.addEventListener("click", state.click, true); document.addEventListener("keydown", state.key, true);
    toast(`Đã nhận diện ${candidates.length} comment. Bấm vào comment muốn lưu; Esc để hủy.`, 5000);
    return { ok: true, count: candidates.length };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "START_THREAD_SELECTION_V2") { try { sendResponse(start()); } catch (e) { sendResponse({ ok: false, error: e.message || String(e) }); } }
    if (message?.type === "CANCEL_THREAD_SELECTION_V2") { cleanup(); sendResponse({ ok: true }); }
  });
})();
