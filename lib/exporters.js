function escYaml(value = "") {
  return JSON.stringify(String(value));
}

function blockToMarkdown(block, useLocalAssets) {
  if (!block) return "";
  switch (block.type) {
    case "heading": return `${"#".repeat(Math.min(Math.max(block.level || 2, 1), 6))} ${block.text}`;
    case "paragraph": return block.text || "";
    case "quote": return String(block.text || "").split("\n").map((line) => `> ${line}`).join("\n");
    case "code": return `\`\`\`\n${block.text || ""}\n\`\`\``;
    case "list": return (block.items || []).map((item, index) => `${block.ordered ? `${index + 1}.` : "-"} ${item}`).join("\n");
    case "separator": return "---";
    case "image": {
      const target = useLocalAssets ? `assets/${block.assetName}` : block.src;
      const caption = block.caption ? `\n\n_${block.caption}_` : "";
      return `![${block.alt || "image"}](${target})${caption}`;
    }
    default: return "";
  }
}

function renderThreadComments(comments = []) {
  const lines = [];
  for (const comment of comments) {
    const depth = Math.max(0, Number(comment.depth) || 0);
    const indent = "  ".repeat(depth);
    const label = comment.selected ? "**Selected comment**" : depth === 0 ? "**Comment**" : "**Reply**";
    const metadata = [comment.createdAt].filter(Boolean).join(" · ");
    lines.push(`${indent}- ${label}${metadata ? ` — ${metadata}` : ""}`);
    const textLines = String(comment.text || "").split("\n").filter(Boolean);
    textLines.forEach((line) => lines.push(`${indent}  > ${line}`));
  }
  return lines.join("\n");
}

export function toMarkdown(item, { useLocalAssets = false } = {}) {
  const article = item.article;
  const lines = [
    "---",
    `schema_version: ${item.schemaVersion || 1}`,
    `source: ${escYaml(item.source || "substack")}`,
    `title: ${escYaml(item.title || article?.title || "Untitled")}`,
    `url: ${escYaml(item.canonicalUrl || article?.canonicalUrl || "")}`,
    `publication: ${escYaml(item.publication || article?.publication || "Substack")}`,
    `captured_at: ${escYaml(item.updatedAt || article?.capturedAt || "")}`,
    `saved_threads: ${(item.threads || []).length}`,
    "---",
    "",
    `# ${item.title || article?.title || "Untitled Substack research"}`,
    ""
  ];

  if (article) {
    lines.push("## Source", "", `- URL: ${article.canonicalUrl || item.canonicalUrl || ""}`);
    if (article.publishedAt) lines.push(`- Published: ${article.publishedAt}`);
    if (article.capturedAt) lines.push(`- Captured: ${article.capturedAt}`);
    lines.push("", "## Article", "");
    for (const block of article.blocks || []) {
      const md = blockToMarkdown(block, useLocalAssets);
      if (md) lines.push(md, "");
    }
  } else {
    lines.push("## Article", "", "_The article body has not been captured yet._", "");
  }

  const threads = item.threads || [];
  lines.push("# Saved Discussions", "", `Saved threads: ${threads.length}`, "");
  threads.forEach((thread, index) => {
    lines.push(`## Thread ${index + 1}`, "", `Captured: ${thread.capturedAt || ""}`, "", renderThreadComments(thread.comments || []), "");
  });

  return lines.join("\n").replace(/\n{4,}/g, "\n\n\n").trim() + "\n";
}

export function toJson(item) {
  return JSON.stringify(item, null, 2) + "\n";
}

export function safeFilename(value) {
  return String(value || "research")
    .normalize("NFKD")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 90) || "research";
}
