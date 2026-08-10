import test from "node:test";
import assert from "node:assert/strict";
import { pruneSelectedNoteIds, buildSelectedNoteThreads } from "../lib/note-selection.js";

test("prunes nested selections under a selected ancestor", () => {
  const comments = [
    { id: "10", parentId: null, depth: 0, text: "A" },
    { id: "11", parentId: "10", depth: 1, text: "B" },
    { id: "12", parentId: "11", depth: 2, text: "C" },
    { id: "20", parentId: null, depth: 0, text: "D" }
  ];
  assert.deepEqual(pruneSelectedNoteIds(comments, ["10", "11", "12", "20"]), ["10", "20"]);
});

test("builds multiple independent selected branches", () => {
  const comments = [
    { id: "10", parentId: null, depth: 0, text: "A" },
    { id: "11", parentId: "10", depth: 1, text: "B" },
    { id: "20", parentId: null, depth: 0, text: "D" },
    { id: "21", parentId: "20", depth: 1, text: "E" }
  ];
  const threads = buildSelectedNoteThreads(comments, ["11", "20"], "https://substack.com/@x/note/c-1");
  assert.equal(threads.length, 2);
  assert.deepEqual(threads[0].comments.map((c) => c.id), ["10", "11"]);
  assert.deepEqual(threads[1].comments.map((c) => c.id), ["20", "21"]);
});
