import { buildNoteThread } from "./note-replies.js";

const sid = (value) => value === null || value === undefined ? "" : String(value);

export function pruneSelectedNoteIds(comments, selectedIds) {
  const byId = new Map((comments || []).map((comment) => [sid(comment.id), {
    ...comment,
    id: sid(comment.id),
    parentId: comment.parentId ? sid(comment.parentId) : null
  }]));
  const selected = new Set((selectedIds || []).map(sid).filter((id) => byId.has(id)));

  for (const id of Array.from(selected)) {
    let current = byId.get(id);
    while (current?.parentId) {
      if (selected.has(current.parentId)) {
        selected.delete(id);
        break;
      }
      current = byId.get(current.parentId);
    }
  }
  return Array.from(selected);
}

export function buildSelectedNoteThreads(comments, selectedIds, articleUrl) {
  return pruneSelectedNoteIds(comments, selectedIds)
    .map((id) => buildNoteThread(comments, id, articleUrl));
}
