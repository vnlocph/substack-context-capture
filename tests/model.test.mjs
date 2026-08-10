import test from "node:test";
import assert from "node:assert/strict";
import { normalizeArticleUrl, researchItemId, mergeArticle, mergeThread } from "../lib/model.js";
import { toMarkdown } from "../lib/exporters.js";
import { ZipWriter } from "../lib/zip.js";

const article = {
  canonicalUrl: "https://example.substack.com/p/hello?utm_source=x#section",
  title: "Hello",
  publication: "Example",
  capturedAt: "2026-08-10T00:00:00.000Z",
  blocks: [
    { type: "paragraph", text: "Main argument." },
    { type: "image", src: "https://substackcdn.com/a.png", alt: "Chart", assetName: "image-001.png" }
  ]
};

test("normalizes article and comments URLs to one key", () => {
  assert.equal(normalizeArticleUrl("https://x.substack.com/p/a/comments?x=1#y"), "https://x.substack.com/p/a");
  assert.equal(researchItemId("https://x.substack.com/p/a/comments"), researchItemId("https://x.substack.com/p/a"));
});

test("merges article and unique threads", () => {
  let item = mergeArticle(null, article);
  const thread = {
    articleUrl: article.canonicalUrl,
    selectedCommentId: "c2",
    capturedAt: "2026-08-10T01:00:00.000Z",
    comments: [
      { id: "c1", parentId: null, depth: 0, text: "Root" },
      { id: "c2", parentId: "c1", depth: 1, text: "Selected", selected: true }
    ]
  };
  item = mergeThread(item, thread);
  item = mergeThread(item, thread);
  assert.equal(item.threads.length, 1);
  assert.match(toMarkdown(item, { useLocalAssets: true }), /assets\/image-001\.png/);
  assert.match(toMarkdown(item), /Selected comment/);
});

test("creates a readable ZIP payload", () => {
  const zip = new ZipWriter();
  zip.addText("research.md", "hello");
  zip.addText("assets/a.txt", "asset");
  const bytes = zip.build();
  assert.equal(bytes[0], 0x50);
  assert.equal(bytes[1], 0x4b);
  assert.ok(bytes.length > 80);
});
