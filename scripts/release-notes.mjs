const AUTOMATION_SUBJECT = /\b(?:bump (?:the )?(?:patch )?version|record v?\d+\.\d+\.\d+ production release|catalog snapshot|release state|update release metadata)\b/i;
const AUTOMATION_BODY = /\b(?:npm test|tests? passed|dependency audit|workflow assertions|release-state\.json|production deployment|deploy(?:ment)? workflow|ci run|git tag|snapshot artifact)\b/i;
const GENERIC_SUBJECT = /^(?:update|improve the addon|maintenance|miscellaneous changes|changes)$/i;

function clean(value) {
  return String(value ?? "").replace(/<\/?[a-z][^>]*>/gi, "").replace(/[<>]/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/https?:\/\/\S+/gi, "").replace(/[\x60*_~]/g, "").replace(/\s+/g, " ").trim().slice(0, 180);
}

function categoryFor(text) {
  const value = text.toLowerCase();
  if (/\b(privacy|disclosure|document|documentation|guide|guidance|incident response|runbook)\b/.test(value)) return "documentation";
  if (/\b(fix|correct|prevent|recover|fallback|resilien|reliab|error|failure|cooldown|rate.limit)\b/.test(value)) return "reliability";
  if (/\b(performance|faster|latency|efficient|cache)\b/.test(value)) return "performance";
  if (/\b(feature|functionality|catalog|support|add|introduc|enable|allow)\b/.test(value)) return "features";
  if (/\b(refactor|internal structure|maintainability)\b/.test(value)) return "maintenance";
  return null;
}

function toPastTense(value) {
  const text = clean(value).replace(/[.!?]+$/, "");
  const replacements = [
    [/^add\b/i, "Added"], [/^improve\b/i, "Improved"], [/^fix\b/i, "Fixed"],
    [/^correct\b/i, "Corrected"], [/^support\b/i, "Added support for"],
    [/^introduce\b/i, "Introduced"], [/^document\b/i, "Documented"],
    [/^remove\b/i, "Removed"], [/^prevent\b/i, "Prevented"],
    [/^ensure\b/i, "Improved"], [/^preserve\b/i, "Preserved"],
    [/^allow\b/i, "Enabled"], [/^enable\b/i, "Enabled"],
    [/^expose\b/i, "Added"], [/^make\b/i, "Improved"]
  ];
  for (const [pattern, replacement] of replacements) {
    if (pattern.test(text)) return text.replace(pattern, replacement) + ".";
  }
  return text ? text[0].toUpperCase() + text.slice(1) + "." : "";
}

function summaryBullets(body) {
  const lines = String(body ?? "").split(/\r?\n/);
  const result = [];
  let inSummary = false;
  for (const line of lines) {
    if (/^#{1,6}\s+/.test(line)) {
      if (inSummary) break;
      inSummary = /^#{1,6}\s+summary\s*$/i.test(line.trim());
      continue;
    }
    if (!inSummary) continue;
    const match = line.match(/^\s*[-*]\s+(.+?)\s*$/);
    if (!match) continue;
    const bullet = clean(match[1]);
    if (!bullet || AUTOMATION_BODY.test(bullet)) continue;
    result.push(bullet);
  }
  return result;
}

function classifySubject(subject) {
  const cleaned = clean(subject).replace(/\s*\[[^]]+\]/g, "").trim();
  const match = cleaned.match(/^([a-z]+):\s*(.+)$/i);
  if (match) {
    const kind = match[1].toLowerCase();
    const detail = clean(match[2]);
    if (["chore", "test", "release", "ci", "build", "style"].includes(kind)) return null;
    if (kind === "feat" || kind === "feature") return { category: "features", line: detail + "." };
    if (kind === "fix") return { category: "reliability", line: detail + "." };
    if (kind === "perf") return { category: "performance", line: detail + "." };
    if (kind === "docs" || kind === "documentation") return { category: "documentation", line: "Improved documentation and guidance." };
    if (kind === "refactor") return { category: "maintenance", line: "Improved the internal organization and maintainability of the addon." };
    return null;
  }
  if (!cleaned || AUTOMATION_SUBJECT.test(cleaned) || GENERIC_SUBJECT.test(cleaned)) return null;
  const category = categoryFor(cleaned);
  if (!category) return null;
  return { category, line: toPastTense(cleaned) };
}

export function generateReleaseNotes(commits, tag) {
  const categories = new Set();
  const highlights = [];
  const seen = new Set();
  const add = (category, line) => {
    const normalized = clean(line).replace(/[.!?]+$/, "") + ".";
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) return;
    seen.add(key);
    categories.add(category);
    highlights.push(normalized);
  };

  for (const commit of commits ?? []) {
    const subject = clean(commit?.subject);
    const body = String(commit?.body ?? "");
    if (AUTOMATION_SUBJECT.test(subject) || /^\s*(?:chore|test|release|ci|build|style):/i.test(subject)) continue;
    const classified = classifySubject(subject);
    if (classified) add(classified.category, classified.line);
    if (!classified || GENERIC_SUBJECT.test(subject)) {
      for (const bullet of summaryBullets(body)) {
        const category = categoryFor(bullet);
        if (category) add(category, toPastTense(bullet));
      }
    }
  }

  const overview = [];
  if (categories.has("features")) overview.push("This release adds new user-facing functionality.");
  if (categories.has("reliability")) overview.push("It improves reliability and accuracy when identifying anime across different sources.");
  if (categories.has("maintenance")) overview.push("It improves the internal structure of the addon to make future fixes safer and more reliable.");
  if (categories.has("performance")) overview.push("It includes performance and efficiency improvements.");
  if (categories.has("documentation")) overview.push("It improves user-facing documentation and service transparency.");
  if (!overview.length) overview.push("This release contains general reliability and maintenance improvements.");

  return [
    `Release ${tag}`,
    "",
    "Overview",
    ...overview,
    "",
    "Highlights",
    ...(highlights.length ? highlights.slice(0, 12).map(line => `- ${line}`) : ["- General reliability and maintenance improvements."])
  ].join("\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  const commits = input.split("\x1e").filter(Boolean).map(record => {
    const [subject = "", ...body] = record.split("\x1f");
    return { subject, body: body.join("\x1f") };
  });
  process.stdout.write(generateReleaseNotes(commits, process.argv[2] ?? "release") + "\n");
}
