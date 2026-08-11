function stringId(value) {
  if (value === null || value === undefined || value === "") return "";
  return String(value);
}

export function noteIdFromUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    const match = url.pathname.match(/\/note\/c-(\d+)(?:\/|$)/i);
    return match ? match[1] : null;
  } catch {
    const match = String(rawUrl || "").match(/\/note\/c-(\d+)(?:[/?#]|$)/i);
    return match ? match[1] : null;
  }
}

function textFromBodyJson(node) {
  if (!node) return "";
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(textFromBodyJson).filter(Boolean).join(" ");
  if (typeof node !== "object") return "";
  if (typeof node.text === "string") return node.text;
  return textFromBodyJson(node.content || []);
}

export function noteCommentText(comment = {}) {
  const direct = comment.body || comment.body_text || comment.text || comment.content;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  return textFromBodyJson(comment.body_json || comment.bodyJson).replace(/\s+/g, " ").trim();
}

export function noteCommentAuthor(comment = {}) {
  const user = comment.user || comment.author || {};
  return (
    comment.name || comment.display_name || comment.user_name ||
    user.name || user.display_name || user.handle || comment.handle || comment.username || ""
  );
}

function ancestorIdsFromPath(path) {
  return String(path || "")
    .replace(/^\.+|\.+$/g, "")
    .split(".")
    .filter((part) => /^\d+$/.test(part));
}

function parentIdFromAncestorPath(path, currentId) {
  const parts = ancestorIdsFromPath(path);
  const current = stringId(currentId);
  while (parts.length && stringId(parts.at(-1)) === current) parts.pop();
  return parts.length ? stringId(parts.at(-1)) : null;
}

function unwrapDescendant(item) {
  if (item && typeof item.comment === "object") return item.comment;
  return item || {};
}

function normalizeComment(comment, parentId = null, depth = 0) {
  return {
    id: stringId(comment.id),
    parentId: parentId ? stringId(parentId) : null,
    depth,
    author: noteCommentAuthor(comment),
    createdAt: comment.date || comment.created_at || comment.createdAt || comment.updated_at || "",
    url: comment.url || "",
    text: noteCommentText(comment),
    selected: false
  };
}

function normalizeBranch(branch) {
  const rootRaw = branch?.comment || branch || {};
  if (!rootRaw?.id) return [];

  const root = normalizeComment(rootRaw, null, 0);
  const descendantsRaw = (branch?.descendantComments || rootRaw.descendantComments || []).map(unwrapDescendant);
  const byId = new Map([[root.id, root]]);

  for (const raw of descendantsRaw) {
    if (!raw?.id) continue;
    const currentId = stringId(raw.id);
    const explicitParent = raw.parent_id || raw.parentId || raw.parent_comment_id;
    const pathParent = parentIdFromAncestorPath(raw.ancestor_path || raw.ancestorPath, currentId);
    let parentId = stringId(explicitParent || pathParent || root.id);
    if (!parentId || parentId === currentId) parentId = root.id === currentId ? "" : root.id;
    byId.set(currentId, normalizeComment(raw, parentId || null, 0));
  }

  const childrenByParent = new Map();
  for (const item of byId.values()) {
    if (!item.parentId || item.parentId === item.id) continue;
    if (!childrenByParent.has(item.parentId)) childrenByParent.set(item.parentId, []);
    childrenByParent.get(item.parentId).push(item.id);
  }

  const out = [];
  const seen = new Set();
  function visit(id, depth) {
    if (seen.has(id)) return;
    const item = byId.get(id);
    if (!item) return;
    seen.add(id);
    out.push({ ...item, depth });
    for (const childId of childrenByParent.get(id) || []) visit(childId, depth + 1);
  }
  visit(root.id, 0);

  for (const item of byId.values()) {
    if (!seen.has(item.id)) out.push({ ...item, parentId: null, depth: 0 });
  }
  return out;
}

export function normalizeNoteReplyPayload(payload) {
  const branches = Array.isArray(payload) ? payload : (payload?.commentBranches || payload?.branches || []);
  const comments = [];
  const seen = new Set();
  for (const branch of branches) {
    for (const comment of normalizeBranch(branch)) {
      if (!comment.id || seen.has(comment.id)) continue;
      seen.add(comment.id);
      comments.push(comment);
    }
  }
  return comments;
}

export function buildNoteThread(comments, selectedCommentId, articleUrl) {
  const selectedId = stringId(selectedCommentId);
  const byId = new Map((comments || []).map((comment) => [stringId(comment.id), {
    ...comment,
    id: stringId(comment.id),
    parentId: comment.parentId ? stringId(comment.parentId) : null
  }]));
  const selected = byId.get(selectedId);
  if (!selected) throw new Error("Không tìm thấy comment đã chọn trong dữ liệu reply.");

  const ancestorIds = new Set();
  const ancestorWalkSeen = new Set();
  let current = selected;
  while (current && !ancestorWalkSeen.has(current.id)) {
    ancestorWalkSeen.add(current.id);
    ancestorIds.add(current.id);
    current = current.parentId ? byId.get(current.parentId) : null;
  }

  const childrenByParent = new Map();
  for (const comment of byId.values()) {
    if (!comment.parentId || comment.parentId === comment.id) continue;
    if (!childrenByParent.has(comment.parentId)) childrenByParent.set(comment.parentId, []);
    childrenByParent.get(comment.parentId).push(comment.id);
  }

  const descendantIds = new Set();
  const queue = [...(childrenByParent.get(selected.id) || [])];
  while (queue.length) {
    const childId = queue.shift();
    if (descendantIds.has(childId)) continue;
    descendantIds.add(childId);
    queue.push(...(childrenByParent.get(childId) || []));
  }

  const included = (comments || []).filter((comment) =>
    ancestorIds.has(stringId(comment.id)) || descendantIds.has(stringId(comment.id))
  );
  const baseDepth = included.length
    ? Math.min(...included.map((comment) => Number(comment.depth) || 0))
    : 0;
  const includedIds = new Set(included.map((comment) => stringId(comment.id)));
  const normalized = included.map((comment) => ({
    ...comment,
    id: stringId(comment.id),
    parentId: comment.parentId && includedIds.has(stringId(comment.parentId)) ? stringId(comment.parentId) : null,
    depth: Math.max(0, (Number(comment.depth) || 0) - baseDepth),
    selected: stringId(comment.id) === selectedId,
    url: comment.url || articleUrl
  }));

  return {
    schemaVersion: 1,
    source: "substack",
    sourceKind: "note-replies-api",
    articleUrl,
    pageUrl: articleUrl,
    selectedCommentId: selectedId,
    capturedAt: new Date().toISOString(),
    comments: normalized
  };
}
