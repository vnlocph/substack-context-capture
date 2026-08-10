# MVP scope

## Product principle

Capture quality is more important than one-click speed. The extension should preserve enough context that a human or an LLM can reconstruct the article and the discussion without revisiting Substack.

## Milestone 1 — Article capture

- User explicitly clicks **Save article**.
- Capture title, canonical URL, publication, published timestamp, capture timestamp.
- Preserve semantic blocks: headings, paragraphs, quotes, code, lists, separators, images.
- Store image source URLs and deterministic asset names.

## Milestone 2 — Discussion capture

- User explicitly clicks **Select discussion thread**.
- Visible comment candidates are highlighted on the page.
- Clicking a comment captures:
  - all visible ancestors needed to understand it;
  - the selected comment;
  - all visible descendants in the selected branch.
- Store `id`, `parentId`, `depth`, text, optional source display name, timestamp, URL and selected marker.
- Sibling branches outside the selected branch are excluded.

## Milestone 3 — Library + merge

- One canonical article URL maps to one Research Item.
- Capturing the article again updates the article body.
- Capturing another thread merges it into the same Research Item.
- Exact duplicate thread captures are ignored by fingerprint.

## Milestone 4 — Export

- Markdown: optimized for humans and LLM context windows.
- JSON: structured source of truth for future AI/RAG work.
- ZIP: `research.md`, `research.json`, and article images under `assets/`.

## Explicitly not in MVP

- AI summaries or topic classification.
- Embeddings/vector database.
- Automated crawling.
- Author reputation/scoring.
- Monitoring changes over time.
- Automatic collection of every comment.
