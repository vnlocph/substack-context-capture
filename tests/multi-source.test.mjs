import test from "node:test";
import assert from "node:assert/strict";
import { createResearchItem, mergeThread } from "../lib/model.js";

test("creates X research items without hard-coded Substack source", () => {
  const item = createResearchItem({
    source: "x",
    canonicalUrl: "https://x.com/example/status/123",
    title: "X post by @example",
    publication: "X",
    blocks: [{ type: "paragraph", text: "hello" }]
  });
  assert.equal(item.source, "x");
  assert.equal(item.publication, "X");
});

test("creates X discussion-only research item", () => {
  const item = mergeThread(null, {
    source: "x",
    articleUrl: "https://x.com/example/status/123",
    selectedCommentId: "456",
    comments: [{ id: "456", parentId: null, text: "reply" }]
  });
  assert.equal(item.source, "x");
  assert.match(item.title, /X/);
  assert.equal(item.threads.length, 1);
});
