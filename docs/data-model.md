# Research Item data model

```json
{
  "schemaVersion": 1,
  "id": "research-...",
  "source": "substack",
  "canonicalUrl": "https://publication.substack.com/p/example",
  "title": "Example",
  "publication": "Publication",
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601",
  "article": {
    "schemaVersion": 1,
    "canonicalUrl": "...",
    "pageUrl": "...",
    "title": "...",
    "publication": "...",
    "publishedAt": "...",
    "capturedAt": "...",
    "blocks": [
      { "type": "paragraph", "text": "..." },
      { "type": "image", "src": "...", "assetName": "image-001.webp" }
    ]
  },
  "threads": [
    {
      "schemaVersion": 1,
      "articleUrl": "...",
      "selectedCommentId": "...",
      "capturedAt": "...",
      "fingerprint": "...",
      "comments": [
        {
          "id": "...",
          "parentId": null,
          "depth": 0,
          "text": "...",
          "author": "optional display name",
          "createdAt": "...",
          "url": "...",
          "selected": false
        }
      ]
    }
  ]
}
```

The comment representation is intentionally flat with `parentId` + `depth`. It is easy to merge, de-duplicate and export, while still preserving the discussion tree.
