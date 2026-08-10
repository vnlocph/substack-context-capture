import test from "node:test";
import assert from "node:assert/strict";
import { noteIdFromUrl, normalizeNoteReplyPayload, buildNoteThread } from "../lib/note-replies.js";

test("extracts note id from Substack note URL", () => {
  assert.equal(noteIdFromUrl("https://substack.com/@itsdhn/note/c-303382639"), "303382639");
  assert.equal(noteIdFromUrl("https://substack.com/@x/post/p-123"), null);
});

test("normalizes commentBranches and descendantComments", () => {
  const comments = normalizeNoteReplyPayload({
    commentBranches: [{
      comment: { id: 10, body: "Root reply", name: "A", date: "2026-08-01" },
      descendantComments: [
        { id: 11, body: "Child", name: "B", ancestor_path: ".10." },
        { comment: { id: 12, body_json: { content: [{ content: [{ text: "Grand child" }] }] }, ancestor_path: ".10.11." } }
      ]
    }]
  });
  assert.deepEqual(comments.map((c) => [c.id, c.parentId, c.depth, c.text]), [
    ["10", null, 0, "Root reply"],
    ["11", "10", 1, "Child"],
    ["12", "11", 2, "Grand child"]
  ]);
});

test("builds ancestors + selected + descendants only", () => {
  const comments = [
    { id: "10", parentId: null, depth: 0, text: "A" },
    { id: "11", parentId: "10", depth: 1, text: "B" },
    { id: "12", parentId: "11", depth: 2, text: "C" },
    { id: "13", parentId: "10", depth: 1, text: "Sibling" }
  ];
  const thread = buildNoteThread(comments, "11", "https://substack.com/@x/note/c-1");
  assert.deepEqual(thread.comments.map((c) => c.id), ["10", "11", "12"]);
  assert.equal(thread.comments.find((c) => c.id === "11").selected, true);
});
