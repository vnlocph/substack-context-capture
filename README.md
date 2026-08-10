# Substack Context Capture

A Chrome Manifest V3 extension that turns a Substack post plus manually selected discussion threads into a structured research package for humans and LLMs.

The MVP intentionally contains **no AI integration and no crawler**. Collection is user-initiated: save the article, then select only the discussion branches worth preserving.

## MVP capabilities

- Save a Substack article into structured semantic blocks.
- Preserve image references and download article images when exporting a ZIP package.
- Enter discussion-selection mode and click a visible comment.
- Capture the context path (ancestors), selected comment, and visible descendants while excluding unrelated sibling branches.
- Merge repeated captures into one Research Item per canonical article URL.
- Export Markdown, JSON, or a ZIP containing both formats plus assets.

See [`docs/mvp.md`](docs/mvp.md) for the product scope and [`docs/data-model.md`](docs/data-model.md) for the storage schema.

## Install locally

1. Clone or download this repository.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select this repository directory.
6. Open a public Substack post and click the extension icon to open the side panel.
7. If the Substack tab was already open before installation, reload it once so the content script is injected.

No build command and no npm install are required.

## Usage

### Capture an article

Open the post and click **Save article** in the side panel. The extension stores the article locally in `chrome.storage.local`.

### Capture a discussion branch

Open the post's comments/discussion, expand the replies you want included, then click **Select discussion thread**. Visible comment candidates receive a dashed outline. Click the comment you care about.

The captured branch contains:

- ancestors before the selected comment;
- the selected comment;
- visible descendants below it;
- `parentId` and `depth` so the relationship survives export.

Press `Esc` to leave selection mode without saving.

> Substack's web markup can change. Comment discovery is therefore heuristic in this first MVP. The UI reports when it cannot identify visible comments instead of silently saving bad data.

## Export formats

### Markdown

Human/LLM-readable document containing metadata, article blocks and saved discussion branches.

### JSON

Loss-minimized structured source for later AI, clustering, RAG or knowledge extraction.

### ZIP

Portable package:

```text
research-package.zip
├── research.md
├── research.json
└── assets/
    ├── image-001.webp
    └── ...
```

The ZIP writer is dependency-free and uses standard uncompressed ZIP entries. If an image cannot be fetched because its host is outside the extension permissions or the URL has expired, the package includes `assets/FAILED_ASSETS.txt` with the original URL.

## Privacy and collection model

- No backend.
- No automatic crawling.
- No AI API.
- Nothing is uploaded by this extension.
- Captures remain in Chrome local extension storage until exported or extension storage is cleared.

## Current limitations

- Initial host support is `substack.com` and `*.substack.com`; custom-domain publications are not injected yet.
- Thread extraction only sees comments/replies currently rendered in the page DOM. Expand replies before capture.
- Substack DOM changes can require selector/heuristic adjustments.
- Article images from an unexpected third-party host may fail to download into ZIP; their original URLs remain in JSON.

## Next implementation milestones

1. Test against several live Substack layouts and harden comment detection.
2. Add a detail view to inspect/remove individual saved threads before export.
3. Add optional custom-domain permission support.
4. Add import/export of the local research library.
5. Only after real usage data exists: AI explanation → knowledge synthesis → shareable idea generation.
