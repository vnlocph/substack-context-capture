export function normalizeArticleUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    url.hash = "";
    url.search = "";
    url.pathname = url.pathname.replace(/\/comments\/?$/, "").replace(/\/$/, "");
    return url.toString();
  } catch {
    return String(rawUrl || "").split("#")[0].split("?")[0].replace(/\/comments\/?$/, "").replace(/\/$/, "");
  }
}

export function stableHash(value) {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

export function researchItemId(url) {
  return `research-${stableHash(normalizeArticleUrl(url))}`;
}

function sourceFrom(articleOrThread = {}) {
  return articleOrThread.source || articleOrThread.platform || "substack";
}

function sourceLabel(source) {
  if (source === "x") return "X";
  if (source === "substack") return "Substack";
  return source || "Web";
}

export function createResearchItem(article) {
  const now = new Date().toISOString();
  const source = sourceFrom(article);
  const label = sourceLabel(source);
  return {
    schemaVersion: 1,
    id: researchItemId(article.canonicalUrl),
    source,
    canonicalUrl: normalizeArticleUrl(article.canonicalUrl),
    title: article.title || `Untitled ${label} item`,
    publication: article.publication || label,
    createdAt: now,
    updatedAt: now,
    article,
    threads: []
  };
}

export function mergeArticle(existing, article) {
  if (!existing) return createResearchItem(article);
  const source = sourceFrom(article) || existing.source;
  return {
    ...existing,
    source,
    canonicalUrl: normalizeArticleUrl(article.canonicalUrl || existing.canonicalUrl),
    title: article.title || existing.title,
    publication: article.publication || existing.publication,
    updatedAt: new Date().toISOString(),
    article
  };
}

export function threadFingerprint(thread) {
  const parts = (thread.comments || []).map((comment) => `${comment.id}:${comment.parentId || ""}:${comment.text || ""}`);
  return stableHash(`${thread.articleUrl}|${thread.selectedCommentId}|${parts.join("|")}`);
}

export function mergeThread(existing, thread) {
  const source = sourceFrom(thread);
  const label = sourceLabel(source);
  const base = existing || {
    schemaVersion: 1,
    id: researchItemId(thread.articleUrl),
    source,
    canonicalUrl: normalizeArticleUrl(thread.articleUrl),
    title: `Captured ${label} discussion`,
    publication: label,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    article: null,
    threads: []
  };

  const fingerprint = threadFingerprint(thread);
  const previous = base.threads || [];
  if (previous.some((item) => item.fingerprint === fingerprint)) return base;

  return {
    ...base,
    source: base.source || source,
    updatedAt: new Date().toISOString(),
    threads: [...previous, { ...thread, fingerprint }]
  };
}
