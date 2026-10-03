"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => ZoeySyncPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian5 = require("obsidian");

// src/dirty.ts
function recommendedIgnoreRules(configDir) {
  return [
    "# Git \u5143\u6570\u636E",
    ".git/",
    ".zoey-sync/",
    "# Obsidian \u5DE5\u4F5C\u533A\u3001\u56DE\u6536\u7AD9\u4E0E\u7F13\u5B58",
    `${configDir}/cache/`,
    `${configDir}/workspace.json`,
    `${configDir}/workspace-mobile.json`,
    `${configDir}/workspaces/`,
    `${configDir}/trash/`,
    ".trash/",
    "# \u63D2\u4EF6\u751F\u6210\u7684\u672C\u673A\u72B6\u6001\u4E0E\u65E5\u5FD7\uFF08\u540C\u6B65\u8BBE\u7F6E\u4FDD\u7559\uFF09",
    `${configDir}/plugins/zoey-sync-test/data.json`,
    `${configDir}/plugins/simple-one-sync/data.json`,
    `${configDir}/plugins/simple-sync/data.json`,
    `${configDir}/plugins/obsidian-git/data.json`,
    `${configDir}/plugins/recent-files-obsidian/data.json`,
    `${configDir}/plugins/simple-link/data.json`,
    `${configDir}/plugins/simple-link/link-state.json`,
    `${configDir}/plugins/simple-link/link-state.json.recovery`,
    `${configDir}/plugins/simple-link/mobile-ignore.json`,
    "# AI \u5DE5\u5177\u7684\u672C\u673A\u4E34\u65F6\u4EA7\u7269\u4E0E\u4F1A\u8BDD",
    ".codex/output/",
    ".codex/AGENTS.md",
    ".claudian/sessions/",
    ".smart-env/",
    "# Obsidian Git \u4E34\u65F6\u51B2\u7A81\u6E05\u5355",
    "conflict-files-obsidian-git.md",
    "# \u7CFB\u7EDF\u6587\u4EF6",
    ".DS_Store",
    "Thumbs.db",
    "desktop.ini",
    "# \u5907\u4EFD\u4E0E\u4E34\u65F6\u6587\u4EF6",
    "*.tmp",
    "*.bak",
    "# \u672C\u673A\u4F9D\u8D56",
    "node_modules/"
  ];
}
function defaultSyncIgnorePatterns(configDir) {
  return recommendedIgnoreRules(configDir).filter((line) => !line.startsWith("#"));
}
function globToRegex(pattern) {
  let source = "";
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === "*") {
      if (pattern[index + 1] === "*") {
        source += ".*";
        index += 1;
      } else {
        source += "[^/]*";
      }
    } else if (character === "?") {
      source += "[^/]";
    } else {
      source += character.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
    }
  }
  return source;
}
function matchesIgnorePattern(path2, rawPattern) {
  let pattern = rawPattern.trim().replace(/\\/g, "/");
  if (!pattern || pattern.startsWith("#")) return false;
  if (pattern.startsWith("!")) pattern = pattern.slice(1);
  if (pattern.startsWith("/")) pattern = pattern.slice(1);
  const directoryOnly = pattern.endsWith("/");
  if (directoryOnly) pattern = pattern.slice(0, -1);
  if (!pattern) return false;
  const prefix = pattern.includes("/") ? "^" : "(?:^|/)";
  const suffix = directoryOnly ? "(?:/.*)?$" : "$";
  return new RegExp(`${prefix}${globToRegex(pattern)}${suffix}`).test(path2);
}
function shouldIgnore(path2, patterns, configDir) {
  const normalized = path2.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/$/, "");
  if (configDir && normalized === `${configDir}/plugins/simple-link/data.json`) return true;
  let ignored = false;
  for (const rawPattern of patterns) {
    const pattern = rawPattern.trim();
    if (!pattern || pattern.startsWith("#")) continue;
    if (matchesIgnorePattern(normalized, pattern)) ignored = !pattern.startsWith("!");
  }
  return ignored;
}
function coalesceDirty(entries, next) {
  const result = entries.map((entry) => ({ ...entry }));
  if (next.type === "add" || next.type === "modify") {
    const existing = result.find(
      (entry) => entry.path === next.path && (entry.type === "add" || entry.type === "modify")
    );
    if (existing) {
      if (existing.type !== "add") existing.type = next.type;
      return result;
    }
    const deleted = result.find((entry) => entry.path === next.path && entry.type === "delete");
    if (deleted) {
      deleted.type = "modify";
      return result;
    }
    return [...result, next];
  }
  if (next.type === "delete") {
    const added2 = result.findIndex((entry) => entry.path === next.path && entry.type === "add");
    if (added2 >= 0) {
      return result.filter((entry, index) => index !== added2 && entry.path !== next.path);
    }
    const moved = result.find((entry) => entry.type === "move" && entry.path === next.path);
    if (moved?.fromPath) {
      return [
        ...result.filter(
          (entry) => entry !== moved && entry.path !== next.path && entry.path !== moved.fromPath
        ),
        { type: "delete", path: moved.fromPath }
      ];
    }
    return [...result.filter((entry) => entry.path !== next.path), next];
  }
  const added = result.find((entry) => entry.path === next.fromPath && entry.type === "add");
  if (added) {
    added.path = next.path;
    return result;
  }
  const previousMove = result.find((entry) => entry.type === "move" && entry.path === next.fromPath);
  if (previousMove) {
    previousMove.path = next.path;
    const modified2 = result.find(
      (entry) => entry.path === next.fromPath && entry.type === "modify"
    );
    if (modified2) modified2.path = next.path;
    return result;
  }
  const modified = result.find((entry) => entry.path === next.fromPath && entry.type === "modify");
  const remaining = result.filter((entry) => entry !== modified && entry.path !== next.path);
  const move = { ...next };
  if (modified) return [...remaining, move, { type: "modify", path: next.path }];
  return [
    ...remaining.filter((entry) => entry.path !== next.fromPath && entry.fromPath !== next.fromPath),
    move
  ];
}

// src/gitStatus.ts
function findRemoteChangeOverlaps(localChanges, remoteChanges) {
  const localPaths = new Set(
    localChanges.flatMap((change) => [change.path, change.oldPath].filter((path2) => Boolean(path2)))
  );
  const remotePaths = new Set(
    remoteChanges.flatMap((change) => [change.path, change.oldPath].filter((path2) => Boolean(path2)))
  );
  return [...localPaths].filter((path2) => remotePaths.has(path2)).sort((a, b) => a.localeCompare(b));
}
function parseGitStatus(output) {
  const records = output.split("\0").filter(Boolean);
  const changes = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const code = record.slice(0, 2);
    const path2 = record.slice(3);
    if (!path2) continue;
    if (code.includes("R") || code.includes("C")) {
      changes.push({ path: path2, oldPath: records[++index], kind: "moved" });
    } else if (code === "??" || code.includes("A")) {
      changes.push({ path: path2, kind: "added" });
    } else if (code.includes("D")) {
      changes.push({ path: path2, kind: "deleted" });
    } else if (code.includes("M")) {
      changes.push({ path: path2, kind: "modified" });
    } else {
      changes.push({ path: path2, kind: "changed" });
    }
  }
  return changes;
}
function parseGitNameStatus(output) {
  const fields = output.split("\0").filter(Boolean);
  const changes = [];
  for (let index = 0; index < fields.length; index += 1) {
    const code = fields[index];
    const kindCode = code[0];
    if (kindCode === "R" || kindCode === "C") {
      const oldPath = fields[++index];
      const path3 = fields[++index];
      if (path3 && oldPath) changes.push({ path: path3, oldPath, kind: "moved" });
      continue;
    }
    const path2 = fields[++index];
    if (!path2) continue;
    if (kindCode === "A") changes.push({ path: path2, kind: "added" });
    else if (kindCode === "D") changes.push({ path: path2, kind: "deleted" });
    else if (kindCode === "M") changes.push({ path: path2, kind: "modified" });
    else changes.push({ path: path2, kind: "changed" });
  }
  return changes;
}

// src/conflict.ts
var CONFLICT_PATTERN = /^<<<<<<<[^\r\n]*\r?\n([\s\S]*?)(?:^\|\|\|\|\|\|\|[^\r\n]*\r?\n[\s\S]*?)?^=======\r?\n([\s\S]*?)^>>>>>>>[^\r\n]*(?:\r?\n|$)/gm;
function parseConflictBlocks(content) {
  const blocks = [];
  for (const match of content.matchAll(CONFLICT_PATTERN)) {
    if (match.index === void 0) continue;
    blocks.push({
      start: match.index,
      end: match.index + match[0].length,
      // Merge 时 HEAD 是本机版本，另一侧是刚 Fetch 的 GitHub 版本。
      local: match[1],
      github: match[2]
    });
  }
  return blocks;
}
function applyConflictResolutions(content, blocks, resolutions) {
  if (blocks.length !== resolutions.length) throw new Error("\u4ECD\u6709\u51B2\u7A81\u6CA1\u6709\u5904\u7406");
  let result = content;
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const block = blocks[index];
    result = result.slice(0, block.start) + resolutions[index] + result.slice(block.end);
  }
  return result;
}

// src/gitError.ts
function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}
function isTransientGitNetworkError(error) {
  return /timed? out|timeout|schannel|ssl|tls|could not resolve host|failed to connect|connection (?:was )?(?:reset|closed)|network is unreachable|unable to access/i.test(
    messageOf(error)
  );
}
function isUncertainGitAuthError(error) {
  return /the token in (?:keyring|default) is invalid/i.test(messageOf(error));
}
function isMissingRemoteRefError(error) {
  return /couldn.t find remote ref/i.test(messageOf(error));
}
function describeGitError(error) {
  const message = messageOf(error);
  if (isUncertainGitAuthError(message)) {
    return `GitHub \u8BA4\u8BC1\u72B6\u6001\u68C0\u67E5\u5931\u8D25\uFF08\u6682\u4E0D\u80FD\u786E\u8BA4 Token \u5DF2\u5931\u6548\uFF0C\u53EF\u80FD\u662F\u7F51\u7EDC\u6216\u7CFB\u7EDF\u51ED\u636E\u6682\u65F6\u4E0D\u53EF\u7528\uFF09\uFF1A${message}`;
  }
  if (/authentication failed|could not read username|http (?:401|403)|access denied|permission denied|repository not found/i.test(
    message
  )) {
    return `\u8BA4\u8BC1\u5931\u8D25\uFF1A${message}`;
  }
  if (isTransientGitNetworkError(message)) return `\u4E0E GitHub \u7F51\u7EDC\u8FDE\u63A5\u5931\u8D25\uFF1A${message}`;
  return message;
}

// src/conflictPreview.ts
var import_obsidian = require("obsidian");

// src/textDiff.ts
function textParts(local, remote) {
  const a = local.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  const b = remote.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  let start = 0, endA = a.length, endB = b.length;
  while (start < endA && start < endB && a[start] === b[start]) start++;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const parts = [];
  if (start) parts.push({ common: a.slice(0, start).join("") });
  const x = a.slice(start, endA), y = b.slice(start, endB);
  if ((x.length + 1) * (y.length + 1) > 1e6) {
    parts.push({ local: x.join(""), remote: y.join("") });
  } else if (x.length || y.length) {
    const width = y.length + 1;
    const table = new Uint32Array((x.length + 1) * width);
    for (let i2 = x.length - 1; i2 >= 0; i2--) for (let j2 = y.length - 1; j2 >= 0; j2--) {
      table[i2 * width + j2] = x[i2] === y[j2] ? 1 + table[(i2 + 1) * width + j2 + 1] : Math.max(table[(i2 + 1) * width + j2], table[i2 * width + j2 + 1]);
    }
    let i = 0, j = 0, common = "", left = "", right = "";
    const flushDiff = () => {
      if (left || right) parts.push({ local: left, remote: right });
      left = right = "";
    };
    const flushCommon = () => {
      if (common) parts.push({ common });
      common = "";
    };
    while (i < x.length || j < y.length) {
      if (i < x.length && j < y.length && x[i] === y[j]) {
        flushDiff();
        common += x[i++];
        j++;
      } else {
        flushCommon();
        if (j >= y.length || i < x.length && table[(i + 1) * width + j] >= table[i * width + j + 1]) left += x[i++];
        else right += y[j++];
      }
    }
    flushDiff();
    flushCommon();
  }
  if (endA < a.length) parts.push({ common: a.slice(endA).join("") });
  return parts;
}
function resolveTextParts(parts, selections) {
  let index = 0;
  const result = parts.map((part) => part.common !== void 0 ? part.common : selections[index++]);
  if (index !== selections.length || result.some((part) => part === void 0)) throw new Error("\u4ECD\u6709\u5DEE\u5F02\u533A\u5757\u672A\u9009\u62E9\u3002");
  return result.join("");
}

// src/conflictPreview.ts
var SAMPLE_FILES = [
  {
    path: "\u793A\u4F8B/\u9879\u76EE\u65B9\u6848.md",
    totalLines: 1218,
    localUpdatedAt: "2026-09-27T00:41:00+08:00",
    remoteUpdatedAt: "2026-09-26T23:58:00+08:00",
    blocks: [
      { line: 318, local: "\u5148\u6574\u7406\u73B0\u6709\u7B14\u8BB0\uFF0C\u518D\u9010\u6B65\u8C03\u6574\u5206\u7C7B\u3002", remote: "\u5148\u5B8C\u6210\u5206\u7C7B\u89C4\u5219\uFF0C\u518D\u6279\u91CF\u6574\u7406\u73B0\u6709\u7B14\u8BB0\u3002" },
      { line: 742, local: "1. \u68C0\u67E5\u91CD\u590D\u7B14\u8BB0\n2. \u786E\u8BA4\u94FE\u63A5\n3. \u5F52\u6863", remote: "1. \u786E\u8BA4\u94FE\u63A5\n2. \u5F52\u6863\n3. \u68C0\u67E5\u91CD\u590D\u7B14\u8BB0" }
    ]
  },
  { path: "\u793A\u4F8B/\u9605\u8BFB\u8BB0\u5F55.md", totalLines: 864, localUpdatedAt: "2026-09-26T21:12:00+08:00", remoteUpdatedAt: "2026-09-27T00:18:00+08:00", blocks: [{ line: 205, local: "\u4FDD\u7559\u539F\u6587\u6458\u5F55\uFF0C\u4E4B\u540E\u8865\u5145\u60F3\u6CD5\u3002", remote: "\u6574\u7406\u4E3A\u4E09\u6761\u8981\u70B9\uFF0C\u65B9\u4FBF\u4E4B\u540E\u68C0\u7D22\u3002" }] },
  { path: "\u793A\u4F8B/\u5468\u4F1A\u7EAA\u8981.md", totalLines: 176, localUpdatedAt: "2026-09-27T00:22:00+08:00", remoteUpdatedAt: "2026-09-26T22:46:00+08:00", blocks: [{ line: 86, local: "\u5468\u4E09\u5B8C\u6210\u521D\u7A3F\u3002", remote: "\u5468\u4E94\u5B8C\u6210\u521D\u7A3F\uFF0C\u5E76\u9080\u8BF7\u5927\u5BB6\u6838\u5BF9\u3002" }] },
  {
    path: "\u793A\u4F8B/\u5199\u4F5C\u63D0\u7EB2.md",
    totalLines: 392,
    localUpdatedAt: "2026-09-26T20:30:00+08:00",
    remoteUpdatedAt: "2026-09-27T00:36:00+08:00",
    blocks: [
      { line: 34, local: "\u7B2C\u4E00\u7AE0\u4ECE\u4E3B\u4EBA\u516C\u7684\u56DE\u5FC6\u5F00\u59CB\u3002", remote: "\u7B2C\u4E00\u7AE0\u4ECE\u4E00\u5C01\u6765\u4FE1\u5F00\u59CB\u3002" },
      { line: 112, local: "\u7ED3\u5C3E\u4FDD\u7559\u60AC\u5FF5\u3002", remote: "\u7ED3\u5C3E\u4EA4\u4EE3\u6545\u4E8B\u7684\u65F6\u95F4\u7EBF\u3002" }
    ]
  },
  { path: "\u793A\u4F8B/\u5DE5\u5177\u6E05\u5355.md", totalLines: 98, localUpdatedAt: "2026-09-26T23:44:00+08:00", remoteUpdatedAt: "2026-09-26T22:16:00+08:00", blocks: [{ line: 52, local: "- \u672C\u5730\u5907\u4EFD\uFF1A\u6BCF\u5468\u4E00\u6B21", remote: "- \u672C\u5730\u5907\u4EFD\uFF1A\u6BCF\u5929\u4E00\u6B21" }] },
  { path: "\u793A\u4F8B/\u65E5\u8BB0.md", totalLines: 64, localUpdatedAt: "2026-09-26T19:50:00+08:00", remoteUpdatedAt: "2026-09-27T00:07:00+08:00", blocks: [{ line: 29, local: "\u4ECA\u5929\u5148\u6574\u7406\u65E7\u9879\u76EE\u3002", remote: "\u4ECA\u5929\u5148\u5B8C\u6210\u65B0\u9879\u76EE\u7684\u51C6\u5907\u3002" }] },
  { path: "\u793A\u4F8B/\u5206\u7C7B\u89C4\u5219.md", totalLines: 631, localUpdatedAt: "2026-09-27T00:29:00+08:00", remoteUpdatedAt: "2026-09-26T23:20:00+08:00", blocks: [{ line: 441, local: "\u5F85\u6574\u7406\u5185\u5BB9\u5148\u653E\u5165\u6536\u96C6\u7BB1\u3002", remote: "\u5F85\u6574\u7406\u5185\u5BB9\u6309\u4E3B\u9898\u76F4\u63A5\u5F52\u7C7B\u3002" }] },
  { path: "\u793A\u4F8B/\u65C5\u884C\u6E05\u5355.md", totalLines: 82, localUpdatedAt: "2026-09-26T22:02:00+08:00", remoteUpdatedAt: "2026-09-27T00:25:00+08:00", blocks: [{ line: 63, local: "- \u5E26\u5145\u7535\u5668\u548C\u96E8\u4F1E", remote: "- \u5E26\u5145\u7535\u5668\u3001\u96E8\u4F1E\u548C\u5907\u7528\u773C\u955C" }] }
];
var ZoeySyncConflictPreviewModal = class extends import_obsidian.Modal {
  constructor(app, live) {
    super(app);
    this.live = live;
    this.parts = /* @__PURE__ */ new Map();
    this.loading = /* @__PURE__ */ new Set();
    this.loaded = /* @__PURE__ */ new Set();
    this.wholeContents = /* @__PURE__ */ new Map();
    this.readErrors = /* @__PURE__ */ new Map();
    this.results = {};
    this.active = false;
    this.inline = false;
    this.page = 0;
    this.fileChoices = /* @__PURE__ */ new Map();
    this.blockChoices = /* @__PURE__ */ new Map();
    this.appliedCount = 0;
    this.stage = "content";
    this.files = live?.files ?? SAMPLE_FILES;
    this.pending = new Set(this.files.map((file) => file.path));
    if (this.live && this.files.some((file) => file.reviewStage === "file")) this.stage = "file";
  }
  wait() {
    const result = new Promise((resolve) => {
      this.resolve = resolve;
    });
    this.open();
    return result;
  }
  waitIn(container) {
    this.inline = true;
    this.contentEl = container;
    this.contentEl.addClass("is-mobile-review");
    this.contentEl.addClass("is-sidebar-review");
    this.active = true;
    const result = new Promise((resolve) => {
      this.resolve = resolve;
    });
    this.render(false);
    return result;
  }
  close() {
    if (this.inline) this.onClose();
    else super.close();
  }
  compact() {
    return this.inline || import_obsidian.Platform.isMobile;
  }
  onOpen() {
    this.active = true;
    this.modalEl.addClass("zoey-sync-preview-modal");
    this.modalEl.toggleClass("is-mobile-review-modal", this.compact());
    this.modalEl.parentElement?.toggleClass("simple-link-mobile-review-container", this.compact());
    this.contentEl.toggleClass("is-mobile-review", this.compact());
    this.render(false);
  }
  onClose() {
    this.modalEl.parentElement?.removeClass("simple-link-mobile-review-container");
    this.active = false;
    this.resolve?.(null);
    this.resolve = void 0;
    this.contentEl.empty();
  }
  render(preserveScroll = true) {
    const root = this.contentEl;
    const scrollTop = preserveScroll ? (root.querySelector(".zoey-sync-preview__mobile-scroll") ?? root).scrollTop : 0;
    root.empty();
    root.addClass("zoey-sync-preview");
    const body = this.compact() ? root.createDiv({ cls: "zoey-sync-preview__mobile-scroll" }) : root;
    const stageFiles = this.stageFiles();
    const hasContent = this.files.some((file) => file.reviewStage !== "file");
    const header = (this.compact() ? root : body).createDiv({ cls: "zoey-sync-preview__header" });
    const heading = header.createDiv();
    heading.createDiv({ text: this.live ? "\u8F7B\u91CF\u540C\u6B65 \xB7 \u6587\u4EF6\u4E0E\u5185\u5BB9\u786E\u8BA4" : "\u754C\u9762\u9884\u89C8 \xB7 \u793A\u4F8B\u6570\u636E", cls: "zoey-sync-preview__eyebrow" });
    const title = heading.createEl("h2", { text: this.live ? this.stage === "file" ? "\u6587\u4EF6\u5DEE\u5F02\u786E\u8BA4" : "\u5185\u5BB9\u5DEE\u5F02\u786E\u8BA4" : "\u5904\u7406\u6587\u4EF6\u5DEE\u5F02" });
    const count = title.createSpan({ cls: "zoey-sync-preview__title-count" });
    count.createSpan({ text: String(stageFiles.length), cls: "zoey-sync-preview__title-number" });
    count.createSpan({ text: " \u9879" });
    const reset = header.createEl("button", { text: "\u6E05\u7A7A\u9009\u62E9", cls: "zoey-sync-preview__clear" });
    reset.addEventListener("click", () => this.clearStageChoices());
    if (this.compact()) {
      const close = this.createButton(header, "\xD7", () => this.close(), "zoey-sync-preview__close");
      close.setAttr("aria-label", "\u5173\u95ED\u5DEE\u5F02\u786E\u8BA4");
    }
    const toolbar = body.createDiv({ cls: "zoey-sync-preview__toolbar" });
    const bulk = toolbar.createDiv({ cls: "zoey-sync-preview__bulk" });
    if (!this.live) this.createButton(bulk, "\u5168\u9009\u6700\u65B0", () => this.selectAll("latest"), "zoey-sync-preview__bulk-choice");
    if (this.live && this.stage === "file") {
      this.createButton(bulk, "\u5168\u90E8\u4FDD\u7559", () => this.keepAll());
      this.createButton(bulk, "\u5168\u90E8\u5220\u9664", () => {
        for (const file of stageFiles) {
          this.fileChoices.set(file.path, file.keepSide ? file.keepSide === "local" ? "remote" : "local" : "delete");
          for (let i = 0; i < file.blocks.length; i++) this.blockChoices.delete(this.blockKey(file.path, i));
        }
        this.render();
      }, "zoey-sync-preview__delete-all");
      this.createButton(bulk, "\u8DDF\u968F\u672C\u673A", () => this.selectAll("local"), "zoey-sync-preview__bulk-choice is-local");
      this.createButton(bulk, "\u8DDF\u968F\u4E91\u7AEF", () => this.selectAll("remote"), "zoey-sync-preview__bulk-choice is-remote");
    } else {
      this.createButton(bulk, "\u8DDF\u968F\u672C\u673A", () => this.selectAll("local"), "zoey-sync-preview__bulk-choice is-local");
      this.createButton(bulk, "\u8DDF\u968F\u4E91\u7AEF", () => this.selectAll("remote"), "zoey-sync-preview__bulk-choice is-remote");
    }
    if (this.appliedCount > 0) {
      body.createDiv({ text: `${this.live ? "\u5DF2\u4FDD\u5B58\u9009\u62E9" : "\u793A\u4F8B\u4E2D\u5DF2\u5E94\u7528"} ${this.appliedCount} \u4E2A\uFF0C\u5269\u4F59 ${this.pending.size} \u4E2A\u5F85\u5904\u7406\u3002`, cls: "zoey-sync-preview__feedback" });
    }
    const list = body.createDiv({ cls: "zoey-sync-preview__list" });
    const pendingFiles = stageFiles;
    const pages = Math.max(1, Math.ceil(pendingFiles.length / 100));
    this.page = Math.min(this.page, pages - 1);
    for (const file of pendingFiles.slice(this.page * 100, (this.page + 1) * 100)) this.renderFile(list, file);
    if (pages > 1) {
      const pager = body.createDiv({ cls: "zoey-sync-preview__toolbar" });
      this.createButton(pager, "\u4E0A\u4E00\u9875", () => {
        this.page--;
        this.render(false);
      }).disabled = this.page === 0;
      pager.createSpan({ text: `${this.page + 1} / ${pages} \u9875` });
      this.createButton(pager, "\u4E0B\u4E00\u9875", () => {
        this.page++;
        this.render(false);
      }).disabled = this.page === pages - 1;
    }
    if (this.pending.size === 0) list.createDiv({ text: "\u793A\u4F8B\u6587\u4EF6\u5DF2\u5168\u90E8\u5904\u7406\u3002\u53EF\u4EE5\u70B9\u201C\u91CD\u7F6E\u793A\u4F8B\u201D\u91CD\u65B0\u67E5\u770B\u3002", cls: "zoey-sync-preview__empty" });
    const ready = this.getReadyFiles().filter((file) => stageFiles.includes(file));
    const footer = root.createDiv({ cls: "zoey-sync-preview__footer" });
    footer.createSpan({ text: `\u5DF2\u9009\u597D ${ready.length} \u4E2A \xB7 \u4ECD\u9700\u9009\u62E9 ${stageFiles.length - ready.length} \u4E2A` });
    const actions = footer.createDiv({ cls: "zoey-sync-preview__footer-actions" });
    if (this.live && this.stage === "content" && this.files.some((file) => file.reviewStage === "file")) this.createButton(actions, "\u8FD4\u56DE\u6587\u4EF6\u786E\u8BA4", () => {
      this.stage = "file";
      this.page = 0;
      this.expandedPath = void 0;
      this.render(false);
    });
    const apply = actions.createEl("button", { text: this.live ? this.stage === "file" && hasContent ? "\u4E0B\u4E00\u6B65\uFF1A\u786E\u8BA4\u5185\u5BB9" : "\u786E\u8BA4\u540C\u6B65" : `\u5E94\u7528\u9009\u62E9${ready.length > 0 ? ` (${ready.length})` : ""}`, cls: "mod-cta" });
    apply.disabled = ready.length === 0 || !!this.live && ready.length !== stageFiles.length;
    apply.addEventListener("click", () => this.applyReadyFiles());
    body.scrollTop = scrollTop;
  }
  renderFile(list, file) {
    const expanded = this.expandedPath === file.path;
    const row = list.createDiv({ cls: "zoey-sync-preview__file" });
    row.toggleClass("is-expanded", expanded);
    const summary = row.createDiv({ cls: "zoey-sync-preview__summary" });
    const toggle = summary.createEl("button", { cls: "zoey-sync-preview__toggle" });
    toggle.setAttr("aria-expanded", String(expanded));
    toggle.setAttr("aria-label", `${expanded ? "\u6536\u8D77" : "\u5C55\u5F00"}${file.path}`);
    (0, import_obsidian.setIcon)(toggle.createSpan({ cls: "zoey-sync-preview__chevron" }), "chevron-right");
    const name = toggle.createSpan({ cls: "zoey-sync-preview__name" });
    const displayPath = file.label ?? file.path;
    name.createSpan({ text: this.compact() ? displayPath.split("/").pop() ?? displayPath : displayPath, cls: "zoey-sync-preview__path" });
    if (!this.live) name.createSpan({ text: file.description ?? `${file.blocks.length} \u5904\u5DEE\u5F02`, cls: "zoey-sync-preview__meta" });
    else summary.createDiv({ text: file.description ?? "\u6587\u4EF6\u5185\u5BB9\u4E0D\u540C", cls: "zoey-sync-preview__reason" });
    const toggleFile = () => {
      this.expandedPath = expanded ? void 0 : file.path;
      if (!expanded && this.live && !this.loaded.has(file.path)) void this.loadFile(file);
      this.render();
    };
    summary.addEventListener("click", (event) => {
      if (event.target instanceof Element && event.target.closest(".zoey-sync-preview__choice-control")) return;
      toggleFile();
    });
    if (!this.live) {
      const times = summary.createDiv({ cls: "zoey-sync-preview__times" });
      times.setAttr("aria-expanded", String(expanded));
      times.setAttr("aria-label", `${expanded ? "\u6536\u8D77" : "\u5C55\u5F00"}${file.path}\uFF0C\u672C\u673A\u4E0E GitHub \u66F4\u65B0\u65F6\u95F4`);
      for (const [side, text, value] of [["local", "\u672C\u673A", file.localUpdatedAt], ["remote", "GitHub", file.remoteUpdatedAt]]) {
        const line = times.createSpan({ cls: "zoey-sync-preview__time" });
        line.toggleClass("is-newer", !this.live && this.latestSide(file) === side);
        line.createSpan({ text: this.live ? text : `${text}\u66F4\u65B0` });
        if (this.live) line.createSpan({ text: (side === "local" ? file.localPaths : file.remotePaths)?.join("\u3001") ?? file.missingLabel ?? "\u5220\u9664" });
        else {
          const time = line.createEl("time", { text: this.formatTime(value) });
          time.setAttr("datetime", value);
        }
      }
    }
    const selected = this.fileChoices.get(file.path);
    const control = summary.createDiv({ cls: "zoey-sync-preview__choice-control" });
    control.setAttr("aria-label", `${file.path}\u5F53\u524D${this.fileStatus(file)}`);
    const segments = control.createDiv({ cls: "zoey-sync-preview__segments" });
    const options = this.live ? [["local", file.localChoiceLabel ?? "\u672C\u673A"], ["remote", file.remoteChoiceLabel ?? "GitHub"]] : [["latest", "\u6700\u65B0"], ["local", "\u672C\u673A"], ["remote", "GitHub"]];
    if (file.allowBoth) options.push(["both", "\u4FDD\u7559\u4E24\u8FB9"]);
    if (selected === "delete") options.push(["delete", "\u5220\u9664\u6587\u4EF6"]);
    segments.style.gridTemplateColumns = `repeat(${options.length}, minmax(0, 1fr))`;
    for (const [choice, label] of options) {
      const option = segments.createEl("button", { text: label, cls: `zoey-sync-preview__segment is-${choice === "latest" ? this.latestSide(file) : choice}` });
      option.toggleClass("is-selected", selected === choice);
      option.setAttr("aria-label", `${file.path}\u9009\u62E9${label}`);
      option.setAttr("aria-pressed", String(selected === choice));
      option.addEventListener("click", () => this.selectFile(file, choice));
    }
    if (expanded) {
      if (this.compact() && !file.showPaths && displayPath.includes("/")) row.createDiv({ text: displayPath, cls: "zoey-sync-preview__path-details" });
      if (file.showPaths) {
        const paths = row.createDiv({ cls: "zoey-sync-preview__path-details" });
        paths.createDiv({ text: "\u672C\u673A\u8DEF\u5F84\uFF1A" + (file.localPaths?.join("\u3001") ?? "\u4E0D\u5B58\u5728") });
        paths.createDiv({ text: "\u4E91\u7AEF\u8DEF\u5F84\uFF1A" + (file.remotePaths?.join("\u3001") ?? "\u4E0D\u5B58\u5728") });
      }
      if (this.loading.has(file.path)) row.createDiv({ text: "\u6B63\u5728\u8BFB\u53D6\u5DEE\u5F02\u2026", cls: "zoey-sync-preview__notice" });
      else if (this.readErrors.has(file.path)) {
        row.createDiv({ text: this.readErrors.get(file.path), cls: "zoey-sync-preview__notice" });
        this.createButton(row, "\u91CD\u8BD5", () => {
          void this.loadFile(file);
        });
      } else if (this.wholeContents.has(file.path)) this.renderWholeContents(row, file);
      else if (!file.blocks.length) row.createDiv({ text: file.missingLabel ? "\u6B64\u9879\u6309\u6587\u4EF6\u5B58\u5728\u72B6\u6001\u9009\u62E9\u540C\u6B65\u65B9\u5411\u3002" : "\u5185\u5BB9\u76F8\u540C\uFF0C\u6309\u6587\u4EF6\u6216\u8DEF\u5F84\u9009\u62E9\u5373\u53EF\u3002", cls: "zoey-sync-preview__notice" });
      else this.renderBlocks(row, file);
    }
  }
  async loadFile(file) {
    if (!this.live || this.loading.has(file.path)) return;
    this.loading.add(file.path);
    this.readErrors.delete(file.path);
    try {
      const content = await this.live.read(file);
      if (!this.active) return;
      if (file.allowBoth) {
        file.blocks = [];
        this.loaded.add(file.path);
        return;
      }
      if (file.mergeable === false || content.local === null || content.remote === null) {
        this.wholeContents.set(file.path, content);
        file.mergeable = false;
        file.blocks = [{ line: 1, local: "\u4E8C\u8FDB\u5236\u6216\u8D85\u8FC7 200 KB \u7684\u6587\u4EF6\uFF0C\u8BF7\u6309\u5B8C\u6574\u6587\u4EF6\u9009\u62E9\u3002", remote: "\u4E8C\u8FDB\u5236\u6216\u8D85\u8FC7 200 KB \u7684\u6587\u4EF6\uFF0C\u8BF7\u6309\u5B8C\u6574\u6587\u4EF6\u9009\u62E9\u3002" }];
      } else {
        const parts = textParts(content.local, content.remote);
        this.parts.set(file.path, parts);
        let line = 1;
        file.blocks = [];
        for (const part of parts) {
          if (part.common === void 0) file.blocks.push({ line, local: part.local, remote: part.remote });
          line += ((part.common ?? part.local ?? "").match(/\n/g) ?? []).length;
        }
      }
      this.loaded.add(file.path);
    } catch (error) {
      this.readErrors.set(file.path, error instanceof Error ? error.message : String(error));
    } finally {
      this.loading.delete(file.path);
      if (this.active) this.render();
    }
  }
  renderWholeContents(row, file) {
    const details = row.createDiv({ cls: "zoey-sync-preview__whole-details" });
    const content = this.wholeContents.get(file.path);
    for (const side of ["local", "remote"]) {
      const paths = side === "local" ? file.localPaths : file.remotePaths;
      if (!paths?.length) continue;
      details.createEl("h4", { text: side === "local" ? "\u672C\u673A\u5185\u5BB9" : "\u4E91\u7AEF\u5185\u5BB9" });
      if (content[side] === null) details.createDiv({ text: "\u4E8C\u8FDB\u5236\u6216\u8D85\u8FC7 200 KB \u7684\u6587\u4EF6\uFF0C\u6309\u5B8C\u6574\u6587\u4EF6\u9009\u62E9\uFF0C\u4E0D\u5C55\u5F00\u6B63\u6587\u3002" });
      else details.createEl("pre", { text: content[side] || "\uFF08\u7A7A\u6587\u4EF6\uFF09", cls: "zoey-sync-preview__whole-content" });
    }
  }
  renderBlocks(row, file) {
    const details = row.createDiv({ cls: "zoey-sync-preview__details" });
    details.toggleClass("is-mixed", this.selectionTone(file) === "mixed");
    const headings = details.createDiv({ cls: "zoey-sync-preview__block-headers" });
    headings.createSpan({ text: "\u5DEE\u5F02", cls: "zoey-sync-preview__block-heading" });
    headings.createSpan({ text: "\u672C\u673A\u533A\u5757", cls: "zoey-sync-preview__block-heading" });
    headings.createSpan({ text: "Git \u533A\u5757", cls: "zoey-sync-preview__block-heading" });
    file.blocks.forEach((block, index) => {
      const key = this.blockKey(file.path, index);
      const wholeChoice = this.fileChoices.get(file.path);
      const selection = this.blockChoices.get(key) ?? (wholeChoice ? { method: wholeChoice === "latest" ? this.latestSide(file) : wholeChoice === "both" || wholeChoice === "delete" ? "local" : wholeChoice } : void 0);
      const blockRow = details.createDiv({ cls: "zoey-sync-preview__block" });
      const title = blockRow.createDiv({ cls: "zoey-sync-preview__block-title" });
      const caption = title.createDiv({ cls: "zoey-sync-preview__block-caption" });
      caption.createSpan({ text: `\u5DEE\u5F02 ${index + 1} / ${file.blocks.length}` });
      caption.createSpan({ text: `\u7EA6\u7B2C ${block.line} \u884C`, cls: "zoey-sync-preview__line" });
      const merge = this.createButton(title, selection?.method === "merged" ? "\u53D6\u6D88\u5408\u5E76" : this.compact() ? "\u5408\u5E76 / \u7F16\u8F91" : "\u5408\u5E76", () => this.toggleMerge(file, index), "zoey-sync-preview__merge");
      if (file.mergeable === false) merge.hidden = true;
      merge.toggleClass("is-selected", selection?.method === "merged");
      merge.setAttr("aria-pressed", String(selection?.method === "merged"));
      if (this.compact() && selection?.method !== "merged") merge.hidden = true;
      if (selection?.method === "merged") {
        const result = blockRow.createDiv({ cls: "zoey-sync-preview__result" });
        result.createDiv({ text: "\u5408\u5E76\u7ED3\u679C \xB7 \u53EF\u76F4\u63A5\u7F16\u8F91", cls: "zoey-sync-preview__result-label" });
        const editor = result.createEl("textarea", { cls: "zoey-sync-preview__editor" });
        editor.rows = Math.min(8, Math.max(4, (selection.text ?? "").split("\n").length + 1));
        editor.value = selection.text ?? "";
        editor.setAttr("aria-label", `${file.path}\u7B2C ${index + 1} \u5904\u6700\u7EC8\u5185\u5BB9`);
        editor.addEventListener("input", () => {
          selection.text = editor.value;
        });
      } else if (this.compact()) {
        for (const side of ["local", "remote"]) {
          const panel = blockRow.createDiv({ cls: `zoey-sync-preview__mobile-content is-${side}` });
          panel.createDiv({ text: side === "local" ? "\u672C\u673A\u5185\u5BB9" : "\u4E91\u7AEF\u5185\u5BB9", cls: "zoey-sync-preview__side-label" });
          panel.createDiv({ text: block[side], cls: "zoey-sync-preview__side-content" });
        }
        const choices = title.createDiv({ cls: "zoey-sync-preview__mobile-block-choices" });
        for (const side of ["local", "remote"]) {
          const button = this.createButton(choices, side === "local" ? "\u91C7\u7528\u672C\u673A" : "\u91C7\u7528\u4E91\u7AEF", () => this.selectBlock(file, index, side), `zoey-sync-preview__segment is-${side}`);
          button.toggleClass("is-selected", selection?.method === side);
          button.setAttr("aria-pressed", String(selection?.method === side));
          button.disabled = file.mergeable === false;
        }
        if (file.mergeable !== false) this.createButton(choices, "\u5408\u5E76 / \u7F16\u8F91", () => this.toggleMerge(file, index), "zoey-sync-preview__merge");
      } else {
        this.renderSide(blockRow, "\u672C\u673A", block.local, "local", selection?.method === "local", () => this.selectBlock(file, index, "local"), file.mergeable === false);
        this.renderSide(blockRow, "GitHub", block.remote, "remote", selection?.method === "remote", () => this.selectBlock(file, index, "remote"), file.mergeable === false);
      }
    });
  }
  renderSide(parent, label, content, side, selected, choose, disabled = false) {
    const panel = parent.createEl("button", { cls: `zoey-sync-preview__side is-${side}` });
    panel.toggleClass("is-selected", selected);
    panel.setAttr("aria-label", `\u91C7\u7528${label}\u533A\u5757`);
    panel.setAttr("aria-pressed", String(selected));
    panel.createSpan({ text: content, cls: "zoey-sync-preview__side-content" });
    panel.addEventListener("click", choose);
    panel.disabled = disabled;
  }
  createButton(parent, label, action, className) {
    const button = parent.createEl("button", { text: label, cls: className });
    button.addEventListener("click", action);
    return button;
  }
  blockKey(path2, index) {
    return `${path2}:${index}`;
  }
  latestSide(file) {
    return Date.parse(file.localUpdatedAt) >= Date.parse(file.remoteUpdatedAt) ? "local" : "remote";
  }
  selectionTone(file) {
    const whole = this.fileChoices.get(file.path);
    if (whole === "delete") return void 0;
    if (whole) return whole === "latest" ? this.latestSide(file) : whole === "both" ? "mixed" : whole;
    const methods = file.blocks.map((_, index) => this.blockChoices.get(this.blockKey(file.path, index))?.method);
    if (!methods.length || methods.some((method) => !method)) return void 0;
    return methods.every((method) => method === "local") ? "local" : methods.every((method) => method === "remote") ? "remote" : "mixed";
  }
  formatTime(value) {
    return new Date(value).toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
  }
  fileStatus(file) {
    const whole = this.fileChoices.get(file.path);
    if (whole) return whole === "latest" ? `\u6700\u65B0 \xB7 ${this.latestSide(file) === "local" ? "\u672C\u673A" : "GitHub"}` : whole === "delete" ? "\u5220\u9664\u6587\u4EF6" : whole === "both" ? "\u4FDD\u7559\u4E24\u8FB9" : whole === "local" ? file.localChoiceLabel ?? "\u672C\u673A" : file.remoteChoiceLabel ?? "GitHub";
    const chosen = file.blocks.filter((_, index) => this.blockChoices.has(this.blockKey(file.path, index))).length;
    return chosen === 0 ? "\u672A\u51B3\u5B9A" : chosen === file.blocks.length ? "\u533A\u5757\u5DF2\u9009\u597D" : `\u5DF2\u51B3\u5B9A ${chosen}/${file.blocks.length} \u5904`;
  }
  selectFile(file, choice) {
    this.fileChoices.set(file.path, choice);
    for (let index = 0; index < file.blocks.length; index += 1) this.blockChoices.delete(this.blockKey(file.path, index));
    this.render();
  }
  selectAll(choice) {
    for (const file of this.stageFiles()) {
      if (this.pending.has(file.path)) {
        this.fileChoices.set(file.path, choice);
        for (let index = 0; index < file.blocks.length; index += 1) this.blockChoices.delete(this.blockKey(file.path, index));
      }
    }
    this.render();
  }
  selectBlock(file, index, method) {
    const key = this.blockKey(file.path, index);
    const previous = this.blockChoices.get(key);
    const block = file.blocks[index];
    const text = method === "merged" ? previous?.method === "merged" ? previous.text : `${block.local}

${block.remote}` : void 0;
    const wholeChoice = this.fileChoices.get(file.path);
    if (wholeChoice) {
      const side = wholeChoice === "latest" ? this.latestSide(file) : wholeChoice === "both" || wholeChoice === "delete" ? "local" : wholeChoice;
      for (let other = 0; other < file.blocks.length; other += 1) {
        this.blockChoices.set(this.blockKey(file.path, other), { method: side });
      }
    }
    this.fileChoices.delete(file.path);
    this.blockChoices.set(key, { method, text });
    this.render();
  }
  toggleMerge(file, index) {
    const key = this.blockKey(file.path, index);
    if (this.blockChoices.get(key)?.method === "merged") {
      this.blockChoices.delete(key);
      this.render();
      return;
    }
    this.selectBlock(file, index, "merged");
  }
  stageFiles() {
    return this.files.filter((file) => this.pending.has(file.path) && (!this.live || (file.reviewStage ?? "content") === this.stage));
  }
  clearStageChoices() {
    for (const file of this.stageFiles()) {
      this.fileChoices.delete(file.path);
      for (let i = 0; i < file.blocks.length; i++) this.blockChoices.delete(this.blockKey(file.path, i));
    }
    this.render();
  }
  keepAll() {
    for (const file of this.stageFiles()) {
      if (file.keepSide) this.fileChoices.set(file.path, file.keepSide);
      else if (file.allowBoth) this.fileChoices.set(file.path, "both");
      else this.fileChoices.set(file.path, "local");
    }
    this.render();
  }
  getReadyFiles() {
    return this.files.filter((file) => this.pending.has(file.path) && (this.fileChoices.has(file.path) || file.mergeable !== false && file.blocks.length > 0 && file.blocks.every((_, index) => this.blockChoices.has(this.blockKey(file.path, index)))));
  }
  applyReadyFiles() {
    const ready = this.getReadyFiles();
    if (this.live) {
      if (this.stageFiles().some((file) => !ready.includes(file))) return;
      if (this.stage === "file" && this.files.some((file) => file.reviewStage !== "file")) {
        this.stage = "content";
        this.page = 0;
        this.expandedPath = void 0;
        this.render(false);
        return;
      }
      if (ready.length !== this.pending.size) return;
    }
    for (const file of ready) {
      if (this.live) {
        const whole = this.fileChoices.get(file.path);
        this.results[file.path] = whole ? { choice: whole === "latest" ? this.latestSide(file) : whole } : {
          choice: "manual",
          text: resolveTextParts(this.parts.get(file.path), file.blocks.map((block, index) => {
            const selected = this.blockChoices.get(this.blockKey(file.path, index));
            return selected.method === "merged" ? selected.text ?? "" : block[selected.method];
          }))
        };
      }
      this.pending.delete(file.path);
      this.fileChoices.delete(file.path);
      for (let index = 0; index < file.blocks.length; index += 1) this.blockChoices.delete(this.blockKey(file.path, index));
    }
    this.appliedCount += ready.length;
    if (this.expandedPath && !this.pending.has(this.expandedPath)) this.expandedPath = void 0;
    if (this.live && this.pending.size === 0) {
      this.resolve?.(this.results);
      this.resolve = void 0;
      this.close();
      return;
    }
    this.render(false);
  }
  reset() {
    this.pending = new Set(this.files.map((file) => file.path));
    this.results = {};
    this.page = 0;
    this.stage = this.live && this.files.some((file) => file.reviewStage === "file") ? "file" : "content";
    this.expandedPath = void 0;
    this.fileChoices.clear();
    this.blockChoices.clear();
    this.appliedCount = 0;
    this.render(false);
  }
};

// src/setupDifferences.ts
var import_obsidian2 = require("obsidian");
var SetupDifferencesModal = class extends import_obsidian2.Modal {
  constructor(app, paths, choices, read, apply) {
    super(app);
    this.paths = paths;
    this.read = read;
    this.apply = apply;
    this.active = false;
    this.choices = { ...choices };
  }
  onOpen() {
    this.active = true;
    this.modalEl.addClass("zoey-sync-preview-modal");
    const root = this.contentEl;
    root.addClass("zoey-sync-preview");
    root.createEl("h2", { text: "\u5904\u7406\u6587\u4EF6\u5DEE\u5F02" });
    root.createDiv({ cls: "zoey-sync-preview__notice", text: "\u6309\u6587\u4EF6\u9009\u62E9\u4FDD\u7559\u672C\u673A\u6216\u91C7\u7528 GitHub\u3002\u8FD9\u91CC\u4FDD\u5B58\u63A5\u5165\u8BA1\u5212\uFF0C\u5B8C\u6210\u63A5\u5165\u65F6\u624D\u5E94\u7528\u3002\u6587\u672C\u9884\u89C8\u6700\u591A\u663E\u793A\u524D 10,000 \u4E2A\u5B57\u7B26\uFF0C\u9009\u62E9\u4F1A\u5E94\u7528\u6574\u4E2A\u6587\u4EF6\u3002" });
    const toolbar = root.createDiv({ cls: "zoey-sync-preview__toolbar" });
    const count = toolbar.createSpan({ cls: "zoey-sync-preview__count" });
    const bulk = toolbar.createDiv({ cls: "zoey-sync-preview__bulk" });
    const selects = [];
    const update = () => {
      const remaining = this.paths.filter((path2) => !this.choices[path2]).length;
      count.setText(`\u5F85\u5904\u7406 ${remaining} / ${this.paths.length} \u4E2A\u6587\u4EF6`);
      save.disabled = remaining > 0;
    };
    for (const side of ["local", "remote"]) {
      const button = bulk.createEl("button", { text: side === "local" ? "\u5168\u90E8\u9009\u672C\u673A" : "\u5168\u90E8\u9009 GitHub" });
      button.addEventListener("click", () => {
        this.paths.forEach((path2, index) => {
          this.choices[path2] = side;
          selects[index].value = side;
        });
        update();
      });
    }
    const list = root.createDiv({ cls: "zoey-sync-preview__list" });
    for (const path2 of this.paths) {
      const file = list.createDiv({ cls: "zoey-sync-preview__file" });
      const summary = file.createDiv({ cls: "zoey-sync-preview__summary" });
      summary.createSpan({ text: path2, cls: "zoey-sync-preview__path" });
      const select = summary.createEl("select");
      for (const [value, label] of [["", "\u8BF7\u9009\u62E9"], ["local", "\u4FDD\u7559\u672C\u673A"], ["remote", "\u91C7\u7528 GitHub"]]) select.createEl("option", { value, text: label });
      select.value = this.choices[path2] || "";
      selects.push(select);
      select.addEventListener("change", () => {
        if (select.value) this.choices[path2] = select.value;
        else delete this.choices[path2];
        update();
      });
      const detail = file.createEl("details", { cls: "zoey-sync-setup-files" });
      detail.createEl("summary", { text: "\u5C55\u5F00\u5BF9\u7167\u4E24\u7AEF\u5185\u5BB9" });
      const content = detail.createDiv({ cls: "zoey-sync-setup-comparison" });
      let loaded = false;
      detail.addEventListener("toggle", () => {
        if (!detail.open || loaded) return;
        loaded = true;
        content.setText("\u6B63\u5728\u8BFB\u53D6\u2026");
        void this.read(path2).then((result) => {
          if (!this.active) return;
          content.empty();
          for (const [label, text] of [["\u672C\u673A", result.local], ["GitHub", result.remote]]) {
            const side = content.createDiv();
            side.createEl("strong", { text: label });
            side.createEl("pre", { text });
          }
        }).catch((error) => {
          if (!this.active) return;
          content.addClass("zoey-sync-setup-error");
          content.setText(`\u8BFB\u53D6\u5931\u8D25\uFF1A${error instanceof Error ? error.message : String(error)}\u3002\u6536\u8D77\u540E\u53EF\u91CD\u8BD5\u3002`);
          loaded = false;
        });
      });
    }
    const footer = root.createDiv({ cls: "zoey-sync-preview__footer" });
    const cancel = footer.createEl("button", { text: "\u53D6\u6D88" });
    cancel.addEventListener("click", () => this.close());
    const save = footer.createEl("button", { text: "\u786E\u8BA4\u9009\u62E9", cls: "mod-cta" });
    save.addEventListener("click", () => {
      if (this.paths.some((path2) => !this.choices[path2])) return;
      this.apply(this.choices);
      this.close();
    });
    update();
  }
  onClose() {
    this.active = false;
    this.contentEl.empty();
  }
};

// src/nestedRepos.ts
var nodeRequire = typeof process !== "undefined" && process.versions?.node ? window.require : void 0;
var fs = nodeRequire ? nodeRequire("fs").promises : null;
var path = nodeRequire ? nodeRequire("path") : null;
async function findNestedRepos(vaultPath, configDir) {
  if (!fs || !path) throw new Error("\u5185\u5D4C\u4ED3\u5E93\u68C0\u67E5\u4EC5\u652F\u6301\u684C\u9762\u7AEF");
  const found = [];
  const visit = async (folder) => {
    const entries = await fs.readdir(folder, { withFileTypes: true });
    if (folder !== vaultPath) {
      const git = entries.find((entry) => entry.name === ".git" && (entry.isDirectory() || entry.isFile()));
      if (git) found.push({ directory: path.relative(vaultPath, folder).replace(/\\/g, "/"), gitIsDirectory: git.isDirectory() });
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === ".git") continue;
      const absolute = path.join(folder, entry.name);
      const relative = path.relative(vaultPath, absolute).replace(/\\/g, "/");
      if (!shouldIgnore(relative, defaultSyncIgnorePatterns(configDir), configDir)) await visit(absolute);
    }
  };
  await visit(vaultPath);
  return found;
}
function nestedGitIgnoreRules(repos) {
  return repos.map((repo) => `/${repo.directory}/.git${repo.gitIsDirectory ? "/" : ""}`);
}
async function nestedRepoFiles(vaultPath, repos, git, configDir) {
  if (!path || !fs) throw new Error("\u5185\u5D4C\u4ED3\u5E93\u68C0\u67E5\u4EC5\u652F\u6301\u684C\u9762\u7AEF");
  const files = [];
  let vaultIgnore = [];
  try {
    vaultIgnore = (await fs.readFile(path.join(vaultPath, ".gitignore"), "utf8")).split(/\r?\n/);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  for (const repo of repos) {
    const absolute = path.join(vaultPath, repo.directory);
    const listed = await git(["-C", absolute, "ls-files", "--cached", "--others", "--exclude-standard", "-z"]);
    for (const name of listed.split("\0").filter(Boolean)) {
      if (name === ".git" || name.startsWith(".git/") || name.startsWith("../") || path.isAbsolute(name)) continue;
      const relative = `${repo.directory}/${name.replace(/\\/g, "/")}`;
      try {
        if ((await fs.lstat(path.join(vaultPath, relative))).isFile()) files.push(relative);
      } catch {
      }
    }
    const data = `${repo.directory}/data.json`;
    if (repo.directory.startsWith(`${configDir}/plugins/`) && repo.directory.slice(`${configDir}/plugins/`.length).split("/").length === 1 && !shouldIgnore(data, [...defaultSyncIgnorePatterns(configDir), ...vaultIgnore], configDir)) {
      try {
        if ((await fs.lstat(path.join(vaultPath, data))).isFile()) files.push(data);
      } catch {
      }
    }
  }
  return [...new Set(files)].sort();
}
async function seedNestedRepoFiles(vaultPath, repos, git, configDir, skip = /* @__PURE__ */ new Set()) {
  if (!fs || !path) throw new Error("\u5185\u5D4C\u4ED3\u5E93\u68C0\u67E5\u4EC5\u652F\u6301\u684C\u9762\u7AEF");
  const tracked = new Set((await git(["ls-files", "--cached", "-z"])).split("\0").filter(Boolean));
  const candidates = await nestedRepoFiles(vaultPath, repos, git, configDir);
  const stage = async (file) => {
    const info = await fs.stat(path.join(vaultPath, file));
    const mode = info.mode & 73 ? "100755" : "100644";
    const sha = (await git(["hash-object", "-w", "--", file])).trim();
    await git(["update-index", "--add", "--cacheinfo", `${mode},${sha},${file}`]);
    tracked.add(file);
  };
  for (const repo of repos) {
    const prefix = `${repo.directory}/`;
    if (![...tracked].some((file) => file.startsWith(prefix))) {
      const file = candidates.find((name) => name.startsWith(prefix) && !skip.has(name));
      if (file) await stage(file);
    }
    const data = `${repo.directory}/data.json`;
    if (candidates.includes(data) && !tracked.has(data) && !skip.has(data)) await stage(data);
  }
}
async function rebuildNestedRepoTracking(vaultPath, repos, git, configDir) {
  if (!repos.length) return 0;
  if (fs && path) {
    try {
      await fs.access(path.join(vaultPath, ".gitmodules"));
      const modules = await git(["config", "-f", ".gitmodules", "--get-regexp", "^submodule\\..*\\.path$"]);
      const paths = new Set(modules.split(/\r?\n/).map((line) => line.slice(line.indexOf(" ") + 1).trim()));
      if (repos.some((repo) => paths.has(repo.directory))) {
        throw new Error("\u68C0\u6D4B\u5230\u6B63\u5F0F Git \u5B50\u6A21\u5757\uFF1B\u8BF7\u5148\u5355\u72EC\u5904\u7406 .gitmodules\uFF0C\u5411\u5BFC\u4E0D\u4F1A\u5C06\u5176\u6539\u6210\u666E\u901A\u76EE\u5F55\u3002");
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("\u6B63\u5F0F Git \u5B50\u6A21\u5757")) throw error;
    }
  }
  const before = new Set((await git(["ls-files", "--cached", "-z"])).split("\0").filter(Boolean));
  const staged = (await git(["ls-files", "--stage", "-z"])).split("\0").filter(Boolean);
  for (const repo of repos) {
    if (staged.some((line) => line.startsWith("160000 ") && line.endsWith(`	${repo.directory}`))) {
      await git(["rm", "-f", "--cached", "--", repo.directory]);
    }
  }
  await seedNestedRepoFiles(vaultPath, repos, git, configDir);
  const files = await nestedRepoFiles(vaultPath, repos, git, configDir);
  for (const repo of repos) {
    if (files.some((file) => file.startsWith(`${repo.directory}/`)) || [...before].some((file) => file.startsWith(`${repo.directory}/`))) {
      await git(["add", "-A", "--", repo.directory]);
    }
  }
  const after = new Set((await git(["ls-files", "--cached", "-z"])).split("\0").filter(Boolean));
  const missing = files.filter((file) => !after.has(file));
  if (missing.length) throw new Error(`\u4E3B\u4ED3\u5E93\u4ECD\u672A\u8FFD\u8E2A\u5185\u5D4C\u4ED3\u5E93\u6587\u4EF6 ${missing[0]}\uFF1B\u8BF7\u68C0\u67E5\u4E3B\u4ED3\u5E93\u7684\u5176\u4ED6\u5FFD\u7565\u89C4\u5219\u3002`);
  if (repos.some((repo) => after.has(repo.directory))) {
    throw new Error("\u4E3B\u4ED3\u5E93\u4ECD\u628A\u5185\u5D4C\u4ED3\u5E93\u8BB0\u5F55\u4E3A Git \u5F15\u7528\uFF0C\u672A\u80FD\u91CD\u5EFA\u666E\u901A\u6587\u4EF6\u8FFD\u8E2A\u3002");
  }
  return files.filter((file) => !before.has(file)).length;
}

// src/onboarding.ts
var nodeRequire2 = typeof process !== "undefined" && process.versions?.node ? window.require : void 0;
var nodeFs = nodeRequire2 ? nodeRequire2("fs").promises : null;
var nodeFsStream = nodeRequire2 ? nodeRequire2("fs") : null;
var nodePath = nodeRequire2 ? nodeRequire2("path") : null;
var nodeCrypto = nodeRequire2 ? nodeRequire2("crypto") : null;
function gitTransferProgress(label, report) {
  return (chunk) => {
    const matches = [...chunk.matchAll(/(Receiving objects|Resolving deltas|Counting objects|Compressing objects|Writing objects):\s*(\d+)%/g)];
    const latest = matches[matches.length - 1];
    if (!latest) return;
    const phase = latest[1] === "Receiving objects" ? "\u63A5\u6536\u5BF9\u8C61" : latest[1] === "Resolving deltas" ? "\u89E3\u6790\u5DEE\u5F02" : latest[1] === "Counting objects" ? "\u7EDF\u8BA1\u5BF9\u8C61" : latest[1] === "Writing objects" ? "\u53D1\u9001\u5BF9\u8C61" : "\u538B\u7F29\u5BF9\u8C61";
    report?.(`${label}\uFF1A${phase} ${latest[2]}%\u2026`);
  };
}
function setupIgnoreRuleGroups(preview, configDir) {
  const groups = [{ title: "Git \u5143\u6570\u636E\uFF08\u4FDD\u7559\u5185\u5D4C\u4ED3\u5E93\u81EA\u8EAB\u5386\u53F2\uFF09", rules: [".git/", ...nestedGitIgnoreRules(preview.nestedRepos)] }];
  for (const line of recommendedIgnoreRules(configDir)) {
    if (line === "# Git \u5143\u6570\u636E" || line === ".git/") continue;
    if (line.startsWith("# ")) groups.push({ title: line.slice(2), rules: [] });
    else groups[groups.length - 1].rules.push(line);
  }
  return groups;
}
function missingSetupIgnoreRules(existing, configDir) {
  const patterns = new Set(existing.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#")));
  return recommendedIgnoreRules(configDir).filter((line) => !line.startsWith("#") && !patterns.has(line) && !(line.endsWith("/") && patterns.has(line.slice(0, -1))));
}
function applySetupIgnoreBase(preview, choice, configDir) {
  const base = choice === "remote" ? preview.remoteIgnore : preview.localIgnore;
  const lines = base.split(/\r?\n/);
  const missing = [...missingSetupIgnoreRules(base, configDir), ...nestedGitIgnoreRules(preview.nestedRepos).filter((rule) => !lines.includes(rule))];
  const eol = base.includes("\r\n") ? "\r\n" : "\n";
  preview.missingIgnoreRules = missing;
  preview.optimizedIgnore = missing.length ? `${base}${base && !base.endsWith("\n") ? eol : ""}${eol}# Simple Link recommended local exclusions${eol}${missing.join(eol)}${eol}` : base;
  const patterns = preview.optimizedIgnore.split(/\r?\n/);
  preview.trackedExcludedLocal = [.../* @__PURE__ */ new Set([
    ...preview.additionalIgnoredLocal,
    ...preview.trackedLocalFiles.filter((name) => shouldIgnore(name, patterns, configDir) || shouldIgnore(name, recommendedIgnoreRules(configDir), configDir))
  ])].sort();
  preview.trackedExcludedRemote = preview.remoteFiles.filter((name) => shouldIgnore(name, patterns, configDir) || shouldIgnore(name, recommendedIgnoreRules(configDir), configDir));
}
function setupIgnoreDiffers(preview) {
  return preview.localIgnore.replace(/\r\n/g, "\n").trim() !== preview.remoteIgnore.replace(/\r\n/g, "\n").trim();
}
function parseGithubRepoUrl(input) {
  const trimmed = input.trim();
  const match = /^https:\/\/github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?$/i.exec(trimmed);
  if (!match || match[2] === "." || match[2] === "..") {
    throw new Error("\u8BF7\u8F93\u5165 GitHub \u4ED3\u5E93\u7684 HTTPS \u5730\u5740\uFF0C\u4F8B\u5982 https://github.com/\u7528\u6237\u540D/\u4ED3\u5E93\u540D.git");
  }
  return { url: `https://github.com/${match[1]}/${match[2]}.git`, owner: match[1], name: match[2] };
}
function explainSetupError(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (/ENOENT|is not recognized|spawn (?:git|gh)/i.test(message)) return "\u7F3A\u5C11 Git \u6216 GitHub CLI\uFF0C\u8BF7\u5148\u5B89\u88C5\u540E\u91CD\u8BD5\u3002";
  if (/timed? out|could not resolve|DNS|network|failed to connect|unable to access|ETIMEDOUT/i.test(message)) return "\u7F51\u7EDC\u8FDE\u63A5\u5931\u8D25\u6216\u8D85\u65F6\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u4E0E\u4EE3\u7406\u540E\u91CD\u8BD5\u3002";
  if (/not logged|authentication|token|401|403|permission denied|no authentication/i.test(message)) return "GitHub \u767B\u5F55\u5931\u6548\u6216\u5F53\u524D\u8D26\u53F7\u6CA1\u6709\u4ED3\u5E93\u6743\u9650\uFF0C\u8BF7\u91CD\u65B0\u6388\u6743\u3002";
  if (/404|not found|could not read from remote/i.test(message)) return "\u4ED3\u5E93\u5730\u5740\u9519\u8BEF\uFF0C\u6216\u5F53\u524D\u8D26\u53F7\u65E0\u6743\u8BBF\u95EE\u8BE5\u4ED3\u5E93\u3002";
  return message;
}
function sameGithubRepo(a, b) {
  const ssh = /^git@github\.com:([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?$/i.exec(a.trim());
  if (ssh) return `https://github.com/${ssh[1]}/${ssh[2]}.git`.toLowerCase() === b.toLowerCase();
  try {
    return parseGithubRepoUrl(a).url.toLowerCase() === parseGithubRepoUrl(b).url.toLowerCase();
  } catch {
    return false;
  }
}
function hasFileAsParent(path2, otherFiles) {
  let slash = path2.indexOf("/");
  while (slash >= 0) {
    if (otherFiles.has(path2.slice(0, slash))) return true;
    slash = path2.indexOf("/", slash + 1);
  }
  return false;
}
function pathBatches(paths) {
  const batches = [];
  let current = [];
  let length = 0;
  for (const path2 of paths) {
    if (current.length && (current.length >= 100 || length + path2.length > 12e3)) {
      batches.push(current);
      current = [];
      length = 0;
    }
    current.push(path2);
    length += path2.length + 1;
  }
  if (current.length) batches.push(current);
  return batches;
}
var GitSetup = class {
  constructor(vaultPath, run, configDir) {
    this.vaultPath = vaultPath;
    this.run = run;
    this.configDir = configDir;
    if (!nodeFs || !nodePath) throw new Error("\u9996\u6B21\u4F7F\u7528\u5F15\u5BFC\u4EC5\u652F\u6301\u684C\u9762\u7AEF");
  }
  async checkTools() {
    await this.run("git", ["--version"]);
    await this.run("gh", ["--version"]);
  }
  async login(onCode, signal) {
    await this.checkTools();
    if (signal?.aborted) return;
    let output = "";
    let lastCode = "";
    await this.run("gh", ["auth", "login", "--hostname", "github.com", "--git-protocol", "https", "--web", "--clipboard"], 3e5, (chunk) => {
      output += chunk;
      const code = output.match(/\b[A-Z0-9]{4}-[A-Z0-9]{4}\b/)?.[0];
      if (code && code !== lastCode) {
        lastCode = code;
        onCode?.(code);
      }
    }, void 0, signal);
    await this.checkLogin();
  }
  async loginWithToken(token) {
    const value = token.trim();
    if (!value) throw new Error("\u8BF7\u5148\u7C98\u8D34 GitHub Token\u3002");
    await this.checkTools();
    await this.run("gh", ["auth", "login", "--hostname", "github.com", "--git-protocol", "https", "--with-token"], 12e4, void 0, `${value}
`);
    await this.checkLogin();
  }
  async checkLogin() {
    await this.run("gh", ["auth", "status", "--active", "--hostname", "github.com"]);
  }
  async createRepository(name) {
    const repoName = name.trim();
    if (!/^[A-Za-z0-9._-]{1,100}$/.test(repoName) || repoName === "." || repoName === "..") {
      throw new Error("\u4ED3\u5E93\u540D\u79F0\u53EA\u80FD\u4F7F\u7528\u5B57\u6BCD\u3001\u6570\u5B57\u3001\u70B9\u3001\u4E0B\u5212\u7EBF\u6216\u8FDE\u5B57\u7B26\uFF0C\u4E14\u4E0D\u80FD\u8D85\u8FC7 100 \u4E2A\u5B57\u7B26\u3002");
    }
    await this.checkTools();
    await this.checkLogin();
    const owner = (await this.run("gh", ["api", "user", "--jq", ".login"])).trim();
    if (!/^[A-Za-z0-9-]+$/.test(owner)) throw new Error("\u65E0\u6CD5\u786E\u8BA4\u5F53\u524D GitHub \u767B\u5F55\u8D26\u53F7\uFF0C\u8BF7\u91CD\u65B0\u6388\u6743\u3002");
    await this.run("gh", ["repo", "create", `${owner}/${repoName}`, "--private"]);
    return `https://github.com/${owner}/${repoName}.git`;
  }
  async verifyRepository(input) {
    const parsed = parseGithubRepoUrl(input);
    await this.checkLogin();
    const raw = await this.run("gh", ["repo", "view", `${parsed.owner}/${parsed.name}`, "--json", "isPrivate,viewerPermission,defaultBranchRef"]);
    const data = JSON.parse(raw);
    if (data.isPrivate !== true) throw new Error("\u8BE5\u4ED3\u5E93\u4E0D\u662F\u79C1\u4EBA\u4ED3\u5E93\u3002\u8BF7\u5728 GitHub \u4ED3\u5E93\u8BBE\u7F6E\u4E2D\u6539\u4E3A Private \u540E\u91CD\u8BD5\u3002");
    if (!(/* @__PURE__ */ new Set(["ADMIN", "MAINTAIN", "WRITE"])).has(data.viewerPermission ?? "")) {
      throw new Error("\u5F53\u524D GitHub \u8D26\u53F7\u6CA1\u6709\u6B64\u4ED3\u5E93\u7684\u5199\u5165\u6743\u9650\u3002");
    }
    const branch = data.defaultBranchRef?.name || "main";
    const branchRaw = data.defaultBranchRef?.name ? await this.run("gh", ["api", `repos/${parsed.owner}/${parsed.name}/branches/${encodeURIComponent(branch)}`]) : "";
    const remoteSha = branchRaw ? JSON.parse(branchRaw).commit?.sha ?? "" : "";
    return { ...parsed, branch, remoteSha };
  }
  async localRoot() {
    try {
      return (await this.run("git", ["rev-parse", "--show-toplevel"])).trim();
    } catch {
      return null;
    }
  }
  async readIgnore() {
    try {
      return await nodeFs.readFile(nodePath.join(this.vaultPath, ".gitignore"), "utf8");
    } catch (error) {
      if (error.code === "ENOENT") return "";
      throw error;
    }
  }
  async localFiles(root, nestedRepos) {
    if (root) {
      const output = await this.run("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"]);
      const nested = await nestedRepoFiles(this.vaultPath, nestedRepos, (args) => this.run("git", args), this.configDir);
      const files = [];
      for (const name of /* @__PURE__ */ new Set([...output.split("\0").filter(Boolean), ...nested])) {
        try {
          if ((await nodeFs.stat(nodePath.join(this.vaultPath, name))).isFile()) files.push(name);
        } catch {
        }
      }
      return files.sort();
    }
    let existingIgnore = [];
    try {
      existingIgnore = (await nodeFs.readFile(nodePath.join(this.vaultPath, ".gitignore"), "utf8")).split(/\r?\n/);
    } catch {
    }
    const patterns = [...defaultSyncIgnorePatterns(this.configDir), ...existingIgnore];
    const found = [];
    const visit = async (folder) => {
      for (const item of await nodeFs.readdir(folder, { withFileTypes: true })) {
        const absolute = nodePath.join(folder, item.name);
        const name = nodePath.relative(this.vaultPath, absolute).replace(/\\/g, "/");
        if (item.name === ".git") {
          continue;
        }
        if (shouldIgnore(name, patterns, this.configDir)) continue;
        if (item.isDirectory()) await visit(absolute);
        else if (item.isFile()) found.push(name);
      }
    };
    await visit(this.vaultPath);
    return found.sort();
  }
  async preview(repo, onProgress) {
    onProgress?.("1 \xB7 \u68C0\u67E5\u672C\u5730\u4ED3\u5E93\u3001\u5206\u652F\u4E0E\u672A\u5B8C\u6210\u7684 Git \u64CD\u4F5C\u2026");
    const localRoot = await this.localRoot();
    if (localRoot && (await nodeFs.realpath(localRoot)).toLowerCase() !== (await nodeFs.realpath(this.vaultPath)).toLowerCase()) {
      throw new Error(`\u5F53\u524D Vault \u4F4D\u4E8E\u53E6\u4E00\u4E2A Git \u4ED3\u5E93\u5185\u90E8\uFF1A${localRoot}\u3002\u8BF7\u5148\u72EC\u7ACB\u8BBE\u7F6E Vault \u4ED3\u5E93\u3002`);
    }
    let localBranch = null;
    if (localRoot) {
      try {
        localBranch = (await this.run("git", ["symbolic-ref", "--quiet", "--short", "HEAD"])).trim();
      } catch {
        throw new Error("\u672C\u673A\u4ED3\u5E93\u5F53\u524D\u5904\u4E8E detached HEAD\u3002\u8BF7\u5148\u5207\u6362\u5230\u8981\u540C\u6B65\u7684\u672C\u5730\u5206\u652F\uFF0C\u518D\u91CD\u65B0\u68C0\u67E5\u3002");
      }
      for (const ref of ["MERGE_HEAD", "REBASE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD"]) {
        let exists = false;
        try {
          await this.run("git", ["rev-parse", "--verify", "-q", ref]);
          exists = true;
        } catch {
        }
        if (exists) throw new Error(`\u68C0\u6D4B\u5230\u672A\u5B8C\u6210\u7684 ${ref} \u64CD\u4F5C\uFF0C\u8BF7\u5148\u5728 Git \u4E2D\u5904\u7406\u540E\u91CD\u65B0\u68C0\u67E5\u3002`);
      }
    }
    let origin = null;
    if (localRoot) {
      try {
        origin = await this.run("git", ["config", "--get", "remote.origin.url"]);
      } catch {
      }
      if (origin && !sameGithubRepo(origin, repo.url)) {
        throw new Error("\u73B0\u6709 origin \u6307\u5411\u5176\u4ED6\u4ED3\u5E93\u6216\u5305\u542B\u51ED\u636E\u3002\u5411\u5BFC\u4E0D\u4F1A\u8986\u76D6\u5B83\u3002");
      }
    }
    onProgress?.("2 \xB7 \u626B\u63CF\u672C\u5730\u6587\u4EF6\u4E0E\u5185\u5D4C\u4ED3\u5E93\u2026");
    const nestedRepos = await findNestedRepos(this.vaultPath, this.configDir);
    const nestedUserData = new Set((await nestedRepoFiles(this.vaultPath, nestedRepos, (args) => this.run("git", args), this.configDir)).filter((name) => nestedRepos.some((repo2) => name === `${repo2.directory}/data.json`)));
    const localFiles = await this.localFiles(localRoot, nestedRepos);
    const trackedLocal = localRoot ? (await this.run("git", ["ls-files", "--cached", "-z"])).split("\0").filter(Boolean) : [];
    const trackedIgnoredLocal = localRoot ? (await this.run("git", ["ls-files", "--cached", "--ignored", "--exclude-standard", "-z"])).split("\0").filter(Boolean) : [];
    const localSignatures = {};
    const localGitBlobs = {};
    let hashed = 0;
    let lastProgress = Date.now();
    onProgress?.(`3 \xB7 \u8BA1\u7B97\u672C\u5730\u6587\u4EF6\u54C8\u5E0C\uFF1A0 / ${localFiles.length}\u2026`);
    for (const file of localFiles) {
      const stat = await nodeFs.stat(nodePath.join(this.vaultPath, file));
      const hash = nodeCrypto.createHash("sha256");
      const gitHash = nodeCrypto.createHash("sha1").update(`blob ${stat.size}\0`);
      for await (const chunk of nodeFsStream.createReadStream(nodePath.join(this.vaultPath, file))) {
        if (!Buffer.isBuffer(chunk)) throw new Error("\u65E0\u6CD5\u8BFB\u53D6\u672C\u5730\u6587\u4EF6\u5B57\u8282\uFF0C\u5DF2\u505C\u6B62\u68C0\u67E5\u3002");
        hash.update(chunk);
        gitHash.update(chunk);
      }
      localSignatures[file] = `${stat.size}:${hash.digest("hex")}`;
      localGitBlobs[file] = gitHash.digest("hex");
      hashed++;
      if (hashed === localFiles.length || Date.now() - lastProgress >= 250) {
        onProgress?.(`3 \xB7 \u8BA1\u7B97\u672C\u5730\u6587\u4EF6\u54C8\u5E0C\uFF1A${hashed} / ${localFiles.length}\u2026`);
        lastProgress = Date.now();
      }
    }
    onProgress?.("4 \xB7 \u68C0\u67E5\u672C\u5730\u4E0E\u4E91\u7AEF\u7684\u63D0\u4EA4\u5386\u53F2\u2026");
    let alreadyLinked = false;
    let relatedHistory = false;
    if (localRoot && repo.remoteSha) {
      let hasHead = false;
      try {
        await this.run("git", ["rev-parse", "--verify", "HEAD"]);
        hasHead = true;
      } catch {
      }
      if (hasHead) {
        try {
          await this.run("git", ["cat-file", "-e", `${repo.remoteSha}^{commit}`]);
        } catch {
          onProgress?.("4 \xB7 Fetch\uFF1A\u83B7\u53D6\u4E91\u7AEF\u63D0\u4EA4\u8BB0\u5F55\u2026");
          await this.run("git", ["fetch", "--progress", "--no-tags", "--no-write-fetch-head", repo.url, repo.branch], void 0, gitTransferProgress("4 \xB7 Fetch", onProgress));
          await this.run("git", ["cat-file", "-e", `${repo.remoteSha}^{commit}`]);
        }
        onProgress?.("4 \xB7 Merge-base\uFF1A\u68C0\u67E5\u4E24\u7AEF\u5171\u540C\u5386\u53F2\u4E0E\u5408\u5E76\u5173\u7CFB\u2026");
        try {
          await this.run("git", ["merge-base", "HEAD", repo.remoteSha]);
          relatedHistory = true;
        } catch {
        }
        if (relatedHistory) {
          try {
            await this.run("git", ["merge-base", "--is-ancestor", repo.remoteSha, "HEAD"]);
            alreadyLinked = true;
          } catch {
          }
        }
      }
    }
    if (relatedHistory && localBranch !== repo.branch) {
      throw new Error(`\u672C\u673A\u5F53\u524D\u5206\u652F\u662F ${localBranch}\uFF0C\u8FDC\u7AEF\u9ED8\u8BA4\u5206\u652F\u662F ${repo.branch}\u3002\u8BF7\u5148\u5207\u6362\u5230\u8981\u540C\u6B65\u7684 ${repo.branch} \u5206\u652F\uFF0C\u518D\u91CD\u65B0\u68C0\u67E5\u3002`);
    }
    if (localRoot) {
      if (trackedLocal.includes(`${this.configDir}/plugins/simple-one-sync/data.json`) || trackedLocal.includes(`${this.configDir}/plugins/zoey-sync-test/data.json`)) {
        throw new Error("\u672C\u5730 Git \u6B63\u5728\u8DDF\u8E2A\u63D2\u4EF6\u7684\u672C\u673A\u51ED\u636E\u6587\u4EF6 data.json\u3002\u8BF7\u5148\u505C\u6B62\u8DDF\u8E2A\u8BE5\u6587\u4EF6\uFF0C\u518D\u7EE7\u7EED\u63A5\u5165\u3002");
      }
      const staged = await this.run("git", ["ls-files", "--stage", "-z"]);
      const nestedPaths = new Set(nestedRepos.map((item) => item.directory));
      if (staged.split("\0").some((line) => line.startsWith("160000 ") && !nestedPaths.has(line.slice(line.indexOf("	") + 1)))) {
        throw new Error("\u672C\u5730 Git \u5305\u542B\u5B50\u6A21\u5757\uFF0C\u5411\u5BFC\u6682\u4E0D\u652F\u6301\u81EA\u52A8\u63A5\u5165\u3002");
      }
    }
    let remoteFiles = [];
    const remoteBlobs = {};
    onProgress?.("5 \xB7 \u8BFB\u53D6\u4E91\u7AEF\u6587\u4EF6\u5217\u8868\u2026");
    if (repo.remoteSha) {
      const raw = await this.run("gh", ["api", `repos/${repo.owner}/${repo.name}/git/trees/${repo.remoteSha}?recursive=1`]);
      const tree = JSON.parse(raw);
      if (tree.truncated) throw new Error("\u8FDC\u7AEF\u6587\u4EF6\u5217\u8868\u8FC7\u5927\uFF0CGitHub \u53EA\u8FD4\u56DE\u4E86\u90E8\u5206\u6587\u4EF6\uFF1B\u5411\u5BFC\u5DF2\u505C\u6B62\uFF0C\u8BF7\u5148\u7F29\u5C0F\u4ED3\u5E93\u6216\u624B\u52A8\u63A5\u5165\u3002");
      if (tree.tree?.some((item) => item.type === "commit")) throw new Error("\u8FDC\u7AEF\u4ED3\u5E93\u5305\u542B Git \u5B50\u6A21\u5757\uFF0C\u5411\u5BFC\u6682\u4E0D\u652F\u6301\u81EA\u52A8\u63A5\u5165\u3002");
      remoteFiles = (tree.tree ?? []).filter((item) => item.type === "blob").map((item) => {
        remoteBlobs[item.path] = { sha: item.sha ?? "", size: item.size ?? 0 };
        return item.path;
      }).sort();
      if (remoteFiles.includes(`${this.configDir}/plugins/simple-one-sync/data.json`) || remoteFiles.includes(`${this.configDir}/plugins/zoey-sync-test/data.json`)) {
        throw new Error("\u8FDC\u7AEF\u6B63\u5728\u8DDF\u8E2A\u63D2\u4EF6\u7684\u672C\u673A\u51ED\u636E\u6587\u4EF6 data.json\u3002\u8BF7\u5148\u4ECE\u8FDC\u7AEF\u5386\u53F2\u4E2D\u5904\u7406\u5B83\uFF0C\u518D\u7EE7\u7EED\u63A5\u5165\u3002");
      }
    }
    onProgress?.(`6 \xB7 \u5BF9\u6BD4\u6587\u4EF6\u4E0E\u8DEF\u5F84\uFF1A\u672C\u5730 ${localFiles.length} \u4E2A\uFF0C\u4E91\u7AEF ${remoteFiles.length} \u4E2A\u2026`);
    const localSet = new Set(localFiles);
    const remoteSet = new Set(remoteFiles);
    const remoteOnly = remoteFiles.filter((name) => !localSet.has(name));
    const deletedTrackedRemote = !alreadyLinked ? remoteOnly.filter((name) => trackedLocal.includes(name)) : [];
    if (deletedTrackedRemote.length > 0) {
      throw new Error(`\u672C\u673A\u5DF2\u5220\u9664\u4F46\u8FDC\u7AEF\u4ECD\u6709\u540C\u540D\u6587\u4EF6\uFF1A${deletedTrackedRemote.slice(0, 3).join("\u3001")}\u3002\u8BF7\u5148\u624B\u52A8\u786E\u8BA4\u540E\u91CD\u65B0\u68C0\u67E5\u3002`);
    }
    const ignoredLocalCollisions = [];
    for (const name of remoteOnly) {
      try {
        await nodeFs.lstat(nodePath.join(this.vaultPath, name));
        ignoredLocalCollisions.push(name);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    if (ignoredLocalCollisions.length > 0) {
      throw new Error(`\u8FDC\u7AEF\u6587\u4EF6\u4E0E\u672C\u673A\u5DF2\u5FFD\u7565\u7684\u73B0\u6709\u8DEF\u5F84\u91CD\u540D\uFF1A${ignoredLocalCollisions.slice(0, 3).join("\u3001")}\u3002\u8BF7\u5148\u5907\u4EFD\u5E76\u624B\u52A8\u6574\u7406\u540E\u91CD\u65B0\u68C0\u67E5\u3002`);
    }
    const identicalCount = localFiles.filter((name) => remoteBlobs[name]?.sha.length === 40 && localGitBlobs[name] === remoteBlobs[name].sha).length;
    const overlaps = relatedHistory ? [] : localFiles.filter((name) => name !== ".gitignore" && remoteSet.has(name) && (remoteBlobs[name]?.sha.length !== 40 || localGitBlobs[name] !== remoteBlobs[name].sha));
    const prefixCollision = localFiles.some((name) => hasFileAsParent(name, remoteSet)) || remoteFiles.some((name) => hasFileAsParent(name, localSet));
    if (prefixCollision) throw new Error("\u4E24\u7AEF\u5B58\u5728\u540C\u540D\u6587\u4EF6\u4E0E\u76EE\u5F55\u51B2\u7A81\uFF0C\u9700\u8981\u5148\u624B\u52A8\u6574\u7406\u540E\u518D\u63A5\u5165\u3002");
    onProgress?.("7 \xB7 \u6838\u5BF9\u672C\u5730\u4E0E\u4E91\u7AEF\u7684\u5FFD\u7565\u89C4\u5219\u53CA\u8FFD\u8E2A\u8303\u56F4\u2026");
    const existingIgnore = await this.readIgnore();
    let remoteIgnore = "";
    if (remoteFiles.includes(".gitignore")) {
      const raw = await this.run("gh", ["api", `repos/${repo.owner}/${repo.name}/git/blobs/${remoteBlobs[".gitignore"].sha}`]);
      const data = JSON.parse(raw);
      if (data.encoding !== "base64" || typeof data.content !== "string") throw new Error("\u65E0\u6CD5\u8BFB\u53D6\u8FDC\u7AEF .gitignore\uFF0C\u8BF7\u91CD\u65B0\u68C0\u67E5\u3002");
      remoteIgnore = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(data.content.replace(/\s/g, ""), "base64"));
    }
    const nestedRules = nestedGitIgnoreRules(nestedRepos);
    const effectiveIgnore = [...existingIgnore.split(/\r?\n/), ...recommendedIgnoreRules(this.configDir), ...nestedRules];
    const result = {
      vaultPath: this.vaultPath,
      repoUrl: repo.url,
      branch: repo.branch,
      remoteSha: repo.remoteSha,
      alreadyLinked,
      relatedHistory,
      localRoot,
      localBranch,
      origin,
      localFiles,
      localSignatures,
      remoteFiles,
      remoteBlobs,
      overlaps,
      identicalCount,
      remoteOnly,
      localOnly: localFiles.filter((name) => !remoteSet.has(name)),
      missingIgnoreRules: [...missingSetupIgnoreRules(existingIgnore, this.configDir), ...nestedRules.filter((rule) => !existingIgnore.split(/\r?\n/).includes(rule))],
      nestedRepos,
      localIgnore: existingIgnore,
      remoteIgnore,
      trackedLocalFiles: trackedLocal,
      optimizedIgnore: "",
      additionalIgnoredLocal: trackedIgnoredLocal.filter((name) => !nestedUserData.has(name) && !shouldIgnore(name, existingIgnore.split(/\r?\n/), this.configDir)),
      trackedExcludedLocal: [.../* @__PURE__ */ new Set([...trackedIgnoredLocal.filter((name) => !nestedUserData.has(name)), ...trackedLocal.filter((name) => shouldIgnore(name, recommendedIgnoreRules(this.configDir), this.configDir))])].sort(),
      trackedExcludedRemote: remoteFiles.filter((name) => shouldIgnore(name, effectiveIgnore, this.configDir))
    };
    applySetupIgnoreBase(result, "local", this.configDir);
    onProgress?.(`\u2713 \u68C0\u67E5\u5B8C\u6210\uFF1A\u672C\u5730 ${localFiles.length} \u4E2A\u6587\u4EF6\uFF0C\u4E91\u7AEF ${remoteFiles.length} \u4E2A\u6587\u4EF6\uFF0C\u540C\u540D\u5DEE\u5F02 ${overlaps.length} \u4E2A\u3002`);
    return result;
  }
  async readOverlap(repo, preview, file) {
    if (!preview.overlaps.includes(file)) throw new Error("\u8BE5\u6587\u4EF6\u4E0D\u5728\u540C\u540D\u6587\u4EF6\u5217\u8868\u4E2D\uFF0C\u8BF7\u91CD\u65B0\u68C0\u67E5\u7B2C 3 \u6B65\u3002");
    const absolute = nodePath.resolve(this.vaultPath, file);
    const vault = nodePath.resolve(this.vaultPath);
    if (!absolute.toLowerCase().startsWith(`${vault}${nodePath.sep}`.toLowerCase())) throw new Error("\u6587\u4EF6\u8DEF\u5F84\u8D85\u51FA Vault");
    const localStat = await nodeFs.stat(absolute);
    const local = localStat.size > 1e5 ? `\u6587\u4EF6\u8F83\u5927\uFF08${localStat.size} \u5B57\u8282\uFF09\uFF0C\u8BF7\u5728 Obsidian \u4E2D\u6253\u5F00\u672C\u673A\u6587\u4EF6\u67E5\u770B\u3002` : this.describeContent(await nodeFs.readFile(absolute));
    const blob = preview.remoteBlobs[file];
    if (!blob?.sha) throw new Error("\u7F3A\u5C11\u8FDC\u7AEF\u6587\u4EF6\u4FE1\u606F\uFF0C\u8BF7\u91CD\u65B0\u68C0\u67E5\u7B2C 3 \u6B65\u3002");
    if (blob.size > 1e5) return { path: file, local, remote: `\u8FDC\u7AEF\u6587\u4EF6\u8F83\u5927\uFF08${blob.size} \u5B57\u8282\uFF09\uFF0C\u8BF7\u5728 GitHub \u4ED3\u5E93\u7F51\u9875\u67E5\u770B\u3002` };
    const raw = await this.run("gh", ["api", `repos/${repo.owner}/${repo.name}/git/blobs/${blob.sha}`]);
    const data = JSON.parse(raw);
    if (data.encoding !== "base64" || !data.content) throw new Error("\u65E0\u6CD5\u8BFB\u53D6\u8FDC\u7AEF\u6587\u4EF6\u5185\u5BB9");
    return { path: file, local, remote: this.describeContent(Buffer.from(data.content.replace(/\s/g, ""), "base64")) };
  }
  describeContent(buffer) {
    if (buffer.includes(0)) return `\u4E8C\u8FDB\u5236\u6587\u4EF6\uFF08${buffer.length} \u5B57\u8282\uFF09\uFF0C\u8BF7\u5728\u5BF9\u5E94\u4F4D\u7F6E\u67E5\u770B\u539F\u6587\u4EF6\u3002`;
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(buffer).slice(0, 1e4);
    } catch {
      return `\u975E UTF-8 \u6587\u672C\u6216\u4E8C\u8FDB\u5236\u6587\u4EF6\uFF08${buffer.length} \u5B57\u8282\uFF09\u3002`;
    }
  }
  async appendIgnore(repos) {
    const file = nodePath.join(this.vaultPath, ".gitignore");
    const existing = await this.readIgnore();
    const missing = [...missingSetupIgnoreRules(existing, this.configDir), ...nestedGitIgnoreRules(repos).filter((rule) => !existing.split(/\r?\n/).includes(rule))];
    if (!missing.length) return;
    const eol = existing.includes("\r\n") ? "\r\n" : "\n";
    const separator = existing ? `${existing.endsWith("\n") ? "" : eol}${eol}` : "";
    await nodeFs.writeFile(file, `${existing}${separator}# Simple Link recommended local exclusions${eol}${missing.join(eol)}${eol}`, "utf8");
  }
  async rebuildTrackingIndex(paths, skipped, repos) {
    for (const path2 of paths) {
      try {
        await this.run("git", ["check-ignore", "--no-index", "-q", "--", path2]);
      } catch {
        throw new Error(`\u4E0D\u80FD\u786E\u8BA4 .gitignore \u4F1A\u6392\u9664 ${path2}\uFF0C\u5DF2\u505C\u6B62\u91CD\u5EFA Git \u8FFD\u8E2A\u3002\u8BF7\u68C0\u67E5\u6392\u9664\u89C4\u5219\u540E\u91CD\u65B0\u9884\u89C8\u3002`);
      }
    }
    await this.run("git", ["rm", "-r", "-f", "--cached", "--ignore-unmatch", "--", "."]);
    await seedNestedRepoFiles(this.vaultPath, repos, (args) => this.run("git", args), this.configDir, skipped);
    await this.run("git", ["add", "-A"]);
    if (skipped.size) {
      const staged = new Set((await this.run("git", ["diff", "--cached", "--name-only", "-z"])).split("\0").filter(Boolean));
      for (const batch of pathBatches([...skipped].filter((path2) => staged.has(path2)))) {
        await this.run("git", ["reset", "-q", "HEAD", "--", ...batch]);
      }
    }
    const allowedData = new Set((await nestedRepoFiles(this.vaultPath, repos, (args) => this.run("git", args), this.configDir)).filter((name) => repos.some((repo) => name === `${repo.directory}/data.json`)));
    const remaining = (await this.run("git", ["ls-files", "-ci", "--exclude-standard", "-z"])).split("\0").filter((name) => name && !allowedData.has(name));
    if (remaining.length) throw new Error(`\u91CD\u5EFA\u540E\u4ECD\u6709 ${remaining.length} \u4E2A\u88AB\u5FFD\u7565\u7684\u6587\u4EF6\u53D7\u5230\u8FFD\u8E2A\uFF0C\u8BF7\u68C0\u67E5 .gitignore \u540E\u91CD\u8BD5\u3002`);
  }
  async finish(repo, prior, choices, author, onMutationStart, activelyChangingPaths = /* @__PURE__ */ new Set(), rebuildTracking = false, onProgress) {
    onProgress?.("\u6838\u9A8C\u4ED3\u5E93\u4E0E\u6388\u6743");
    const verified = await this.verifyRepository(repo.url);
    onProgress?.("\u91CD\u65B0\u68C0\u67E5\u4E24\u7AEF\u6587\u4EF6\u4E0E\u5FFD\u7565\u89C4\u5219");
    const latest = await this.preview(verified, (message) => onProgress?.(`\u91CD\u65B0\u68C0\u67E5 \xB7 ${message}`));
    const ignoreDiffers = setupIgnoreDiffers(latest);
    if (latest.localIgnore !== prior.localIgnore || latest.remoteIgnore !== prior.remoteIgnore) {
      throw new Error(".gitignore \u5728\u9884\u89C8\u540E\u53D1\u751F\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u68C0\u67E5\u4E24\u7AEF\u89C4\u5219\u3002");
    }
    if (ignoreDiffers && !choices[".gitignore"]) throw new Error("\u8BF7\u9009\u62E9\u4EE5\u672C\u673A\u6216\u8FDC\u7AEF .gitignore \u4E3A\u57FA\u51C6\u3002");
    applySetupIgnoreBase(latest, choices[".gitignore"] || "local", this.configDir);
    if (verified.branch !== prior.branch || latest.alreadyLinked !== prior.alreadyLinked || latest.relatedHistory !== prior.relatedHistory || JSON.stringify(latest.remoteFiles) !== JSON.stringify(prior.remoteFiles) || latest.remoteSha !== prior.remoteSha || latest.origin !== prior.origin || latest.localBranch !== prior.localBranch) {
      throw new Error("\u8FDC\u7AEF\u6216\u4ED3\u5E93\u72B6\u6001\u5728\u9884\u89C8\u540E\u53D1\u751F\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u68C0\u67E5\u7B2C 3 \u6B65\u3002");
    }
    if (JSON.stringify(latest.trackedExcludedLocal) !== JSON.stringify(prior.trackedExcludedLocal) || JSON.stringify(latest.trackedExcludedRemote) !== JSON.stringify(prior.trackedExcludedRemote)) {
      throw new Error("\u5DF2\u88AB Git \u8DDF\u8E2A\u7684\u5FFD\u7565\u6587\u4EF6\u5728\u9884\u89C8\u540E\u53D1\u751F\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u68C0\u67E5\u7B2C 3 \u6B65\u3002");
    }
    const changedSincePreview = new Set([.../* @__PURE__ */ new Set([...prior.localFiles, ...latest.localFiles])].filter((file) => prior.localSignatures[file] !== latest.localSignatures[file]));
    if (changedSincePreview.has(".gitignore") || JSON.stringify(latest.missingIgnoreRules) !== JSON.stringify(prior.missingIgnoreRules)) {
      throw new Error(".gitignore \u5728\u9884\u89C8\u540E\u53D1\u751F\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u68C0\u67E5\u7B2C 3 \u6B65\u7684\u5F85\u8865\u89C4\u5219\u3002");
    }
    const active = /* @__PURE__ */ new Set([...changedSincePreview, ...activelyChangingPaths]);
    const pluginDirs = new Set([...active].map((file) => /^\.obsidian\/plugins\/[^/]+\//.exec(file)?.[0]).filter((dir) => !!dir));
    const changedOutsidePlugins = [...changedSincePreview].filter((file) => ![...pluginDirs].some((dir) => file.startsWith(dir)));
    if (!latest.alreadyLinked && changedOutsidePlugins.length > 0) {
      throw new Error("\u9996\u6B21\u5408\u5E76\u524D\u672C\u5730\u6587\u4EF6\u5728\u9884\u89C8\u540E\u53D1\u751F\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u68C0\u67E5\u7B2C 3 \u6B65\u3002");
    }
    const skipped = new Set(changedSincePreview);
    const changes = latest.localRoot ? parseGitStatus(await this.run("git", ["status", "--porcelain=v1", "--untracked-files=all", "-z"])) : [];
    const dirtyPaths = new Set(changes.flatMap((change) => [change.path, change.oldPath].filter((file) => !!file)));
    for (const file of latest.localFiles) {
      if ((!latest.localRoot || dirtyPaths.has(file)) && (active.has(file) || [...pluginDirs].some((dir) => file.startsWith(dir)))) skipped.add(file);
    }
    if (!latest.relatedHistory && latest.overlaps.some((file) => skipped.has(file))) {
      throw new Error("\u6B63\u5728\u7F16\u8F91\u7684\u63D2\u4EF6\u4E0E\u8FDC\u7AEF\u5B58\u5728\u540C\u540D\u6587\u4EF6\u3002\u8BF7\u6682\u505C\u7F16\u8F91\u5E76\u91CD\u65B0\u68C0\u67E5\u7B2C 3 \u6B65\uFF0C\u907F\u514D\u9996\u6B21\u5408\u5E76\u8986\u76D6\u672C\u673A\u6587\u4EF6\u3002");
    }
    if (latest.localRoot) {
      for (const change of changes) {
        if ([change.path, change.oldPath].some((file) => file && (active.has(file) || [...pluginDirs].some((dir) => file.startsWith(dir))))) {
          skipped.add(change.path);
          if (change.oldPath) skipped.add(change.oldPath);
        }
      }
    }
    if (latest.relatedHistory && !latest.alreadyLinked && skipped.size > 0) {
      const base = (await this.run("git", ["merge-base", "HEAD", latest.remoteSha])).trim();
      const remoteChanges = (await this.run("git", ["diff", "--name-only", "-z", base, latest.remoteSha])).split("\0").filter(Boolean);
      const overlap = remoteChanges.find((file) => skipped.has(file));
      if (overlap) throw new Error(`\u8FDC\u7AEF\u4E5F\u4FEE\u6539\u4E86\u6B63\u5728\u7F16\u8F91\u7684\u6587\u4EF6 ${overlap}\u3002\u8BF7\u5148\u6682\u505C\u7F16\u8F91\u5E76\u5904\u7406\u8BE5\u6587\u4EF6\uFF0C\u518D\u91CD\u65B0\u68C0\u67E5\u7B2C 3 \u6B65\u3002`);
    }
    for (const file of latest.overlaps) if (!choices[file]) throw new Error(`\u8BF7\u9009\u62E9\u540C\u540D\u6587\u4EF6\u7684\u4FDD\u7559\u7248\u672C\uFF1A${file}`);
    if (!author.name.trim() || !author.email.trim() || author.name === "default" || author.email === "default@default.com") {
      throw new Error("\u8BF7\u586B\u5199 Git \u63D0\u4EA4\u4F5C\u8005\u540D\u79F0\u548C\u90AE\u7BB1\u3002");
    }
    await onMutationStart?.();
    onProgress?.("\u51C6\u5907\u4ED3\u5E93\u4E0E\u6587\u4EF6\u8FFD\u8E2A");
    if (!latest.localRoot) await this.run("git", ["init", "-b", repo.branch]);
    await this.run("git", ["config", "user.name", author.name]);
    await this.run("git", ["config", "user.email", author.email]);
    if (!latest.origin) await this.run("git", ["remote", "add", "origin", repo.url]);
    await nodeFs.writeFile(nodePath.join(this.vaultPath, ".gitignore"), latest.optimizedIgnore, "utf8");
    if (latest.localRoot) await rebuildNestedRepoTracking(this.vaultPath, latest.nestedRepos, (args) => this.run("git", args), this.configDir);
    let hasHead = false;
    try {
      await this.run("git", ["rev-parse", "--verify", "HEAD"]);
      hasHead = true;
    } catch {
    }
    await seedNestedRepoFiles(this.vaultPath, latest.nestedRepos, (args) => this.run("git", args), this.configDir, skipped);
    if (hasHead) await this.run("git", ["add", "-A"]);
    else {
      const included2 = [.../* @__PURE__ */ new Set([...latest.localFiles, ".gitignore"])].filter((file) => !skipped.has(file));
      for (const batch of pathBatches(included2)) await this.run("git", ["add", "-A", "--", ...batch]);
    }
    if (hasHead && skipped.size > 0) {
      const stagedPaths = new Set((await this.run("git", ["diff", "--cached", "--name-only", "-z"])).split("\0").filter(Boolean));
      for (const batch of pathBatches([...skipped].filter((file) => stagedPaths.has(file)))) {
        await this.run("git", ["reset", "-q", "HEAD", "--", ...batch]);
      }
    }
    if (latest.alreadyLinked) {
      const staged = (await this.run("git", ["diff", "--cached", "--name-only", "-z"])).split("\0").filter(Boolean);
      const changedDuringStage = [];
      for (const file of staged) {
        try {
          const stat = await nodeFs.stat(nodePath.join(this.vaultPath, file));
          const hash = nodeCrypto.createHash("sha256");
          for await (const chunk of nodeFsStream.createReadStream(nodePath.join(this.vaultPath, file))) {
            if (!Buffer.isBuffer(chunk)) throw new Error("\u65E0\u6CD5\u8BFB\u53D6\u672C\u5730\u6587\u4EF6\u5B57\u8282\uFF0C\u5DF2\u505C\u6B62\u68C0\u67E5\u3002");
            hash.update(chunk);
          }
          if (`${stat.size}:${hash.digest("hex")}` !== latest.localSignatures[file] && file !== ".gitignore") changedDuringStage.push(file);
        } catch {
          if (latest.localSignatures[file]) changedDuringStage.push(file);
        }
      }
      for (const batch of pathBatches(changedDuringStage)) await this.run("git", ["reset", "-q", "HEAD", "--", ...batch]);
      for (const file of changedDuringStage) skipped.add(file);
    }
    if (rebuildTracking && hasHead) {
      onProgress?.("\u91CD\u5EFA\u5DF2\u6709\u6587\u4EF6\u7684\u8FFD\u8E2A");
      await this.rebuildTrackingIndex(latest.trackedExcludedLocal, skipped, latest.nestedRepos);
    }
    onProgress?.("\u521B\u5EFA\u672C\u5730\u63D0\u4EA4");
    try {
      await this.run("git", ["diff", "--cached", "--quiet"]);
    } catch {
      await this.run("git", ["commit", "-m", "Simple Link initial vault snapshot"]);
    }
    if (repo.remoteSha) {
      onProgress?.("Fetch\uFF1A\u83B7\u53D6\u5E76\u6838\u9A8C\u8FDC\u7AEF\u63D0\u4EA4\u2026");
      await this.run("git", ["fetch", "--progress", "origin", repo.branch], void 0, gitTransferProgress("Fetch", onProgress));
      const fetchedSha = await this.run("git", ["rev-parse", "FETCH_HEAD"]);
      if (fetchedSha !== repo.remoteSha) throw new Error("\u8FDC\u7AEF\u5206\u652F\u5728\u68C0\u67E5\u540E\u66F4\u65B0\u4E86\u3002\u5C1A\u672A\u5408\u5E76\u6216\u63A8\u9001\uFF0C\u8BF7\u91CD\u65B0\u9884\u89C8\u3002");
      let containsRemote = false;
      try {
        await this.run("git", ["merge-base", "--is-ancestor", "FETCH_HEAD", "HEAD"]);
        containsRemote = true;
      } catch {
      }
      if (!containsRemote) {
        onProgress?.("Merge\uFF1A\u5408\u5E76\u672C\u5730\u4E0E\u8FDC\u7AEF\u6587\u4EF6\u2026");
        try {
          await this.run("git", latest.relatedHistory ? ["merge", "--no-commit", "--no-ff", "FETCH_HEAD"] : ["merge", "--allow-unrelated-histories", "--no-commit", "--no-ff", "-s", "ours", "FETCH_HEAD"]);
        } catch (error) {
          try {
            await this.run("git", ["merge", "--abort"]);
          } catch {
          }
          throw new Error(latest.relatedHistory ? `\u540C\u6E90\u4ED3\u5E93\u5408\u5E76\u51FA\u73B0\u51B2\u7A81\uFF1B\u5DF2\u5C1D\u8BD5\u64A4\u9500\u672C\u6B21\u5408\u5E76\u3002\u8BF7\u5148\u5904\u7406\u51B2\u7A81\u540E\u91CD\u65B0\u68C0\u67E5\u7B2C 3 \u6B65\u3002${String(error)}` : String(error));
        }
        try {
          const fromRemote = latest.relatedHistory ? [] : [...latest.remoteOnly, ...latest.overlaps.filter((name) => choices[name] === "remote")].filter((name) => name !== ".gitignore");
          for (const batch of pathBatches(fromRemote)) await this.run("git", ["checkout", "FETCH_HEAD", "--", ...batch]);
          await nodeFs.writeFile(nodePath.join(this.vaultPath, ".gitignore"), latest.optimizedIgnore, "utf8");
          await this.run("git", ["add", "-A"]);
          if (skipped.size > 0) {
            const stagedPaths = new Set((await this.run("git", ["diff", "--cached", "--name-only", "-z"])).split("\0").filter(Boolean));
            for (const batch of pathBatches([...skipped].filter((file) => stagedPaths.has(file)))) {
              await this.run("git", ["reset", "-q", "HEAD", "--", ...batch]);
            }
          }
          if (rebuildTracking) await this.rebuildTrackingIndex(
            [.../* @__PURE__ */ new Set([...latest.trackedExcludedLocal, ...latest.trackedExcludedRemote])],
            skipped,
            latest.nestedRepos
          );
          await this.run("git", ["commit", "-m", "Simple Link connect local and remote notes"]);
        } catch (error) {
          try {
            await this.run("git", ["merge", "--abort"]);
          } catch {
          }
          throw error;
        }
      }
    }
    onProgress?.("\u9996\u6B21\u63A8\u9001\u5230 GitHub");
    await this.run("git", ["push", "--progress", "-u", "origin", `HEAD:${repo.branch}`], void 0, gitTransferProgress("Push\uFF1A\u9996\u6B21\u63A8\u9001", onProgress));
    return [...skipped].sort();
  }
};

// src/linkDiff.ts
var DEFAULT_MOBILE_OPTIONS = {
  mode: "github",
  repoUrl: "",
  branch: "",
  token: "",
  syncImages: true,
  syncPlugins: false,
  plugins: [],
  cacheEnabled: true,
  trackPaths: true,
  ignorePatterns: [],
  autoSyncMinutes: 0,
  bound: false
};
function sameContent(a, b) {
  return !!a && !!b && (a.sha === b.sha || a.rawSha === b.sha || b.rawSha === a.sha);
}
var SYNC_HASH_VERSION = 2;
function syncBytes(bytes) {
  if (bytes.includes(0)) return bytes;
  try {
    const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
    if (!text.includes("\r\n")) return bytes;
    return new TextEncoder().encode(text.replace(/\r\n/g, "\n"));
  } catch {
    return bytes;
  }
}
var newPathRecords = () => ({ moves: {} });
function normalizePaths(value) {
  const moves = value.moves && typeof value.moves === "object" ? value.moves : value;
  return { moves: Object.fromEntries(Object.entries(moves).filter(([from, to]) => typeof to === "string" && from !== to)) };
}
function newLocalState(binding = "") {
  return { schema: 1, binding, baseCommitSha: null, base: {}, cache: {}, dirty: {}, paths: newPathRecords(), revision: 0, lastCacheAt: 0 };
}
function safePath(path2) {
  if (!path2 || path2.startsWith("/") || path2.includes("\\") || [...path2].some((character) => character.charCodeAt(0) < 32) || path2.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("\u4ED3\u5E93\u4E2D\u5B58\u5728\u65E0\u6CD5\u5B89\u5168\u5199\u5165\u7684\u8DEF\u5F84\uFF0C\u5DF2\u505C\u6B62\u540C\u6B65\u3002");
  }
  return path2;
}
var IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "tif", "tiff", "avif", "heic", "heif", "apng"];
function mobileIgnores(options, configDir, pluginId) {
  const generated = [...defaultSyncIgnorePatterns(configDir), ...options.ignorePatterns];
  if (!options.syncImages) generated.push(...IMAGE_EXTENSIONS.map((ext) => `*.${ext}`));
  if (!options.syncPlugins) generated.push(`${configDir}/plugins/`);
  generated.push(
    `${configDir}/plugins/${pluginId}/data.json`,
    `${configDir}/plugins/${pluginId}/link-state.json`,
    `${configDir}/plugins/${pluginId}/link-state.json.recovery`,
    `${configDir}/plugins/${pluginId}/mobile-ignore.json`,
    ".git/",
    ".simple-link/"
  );
  generated.push(`!${configDir}/plugins/${pluginId}/sync-settings.json`);
  return generated;
}
function included(path2, options, configDir, pluginId) {
  if (path2 === `${configDir}/__link_scan__` || path2 === `${configDir}/plugins/__link_scan__` || path2 === `${configDir}/plugins/${pluginId}/__link_scan__`) return true;
  const parts = path2.split("/");
  if (parts.some((part) => part === ".git" || part === "node_modules" || part === ".codex") || path2 === ".simple-link" || path2.startsWith(".simple-link/") || path2 === ".trash" || path2.startsWith(".trash/") || path2.startsWith(".codex/") || path2.startsWith(".claudian/sessions/")) return false;
  if (path2 === `${configDir}/plugins/${pluginId}/sync-settings.json`) return true;
  const ownPrefix = configDir + "/plugins/" + pluginId + "/";
  if (path2.startsWith(ownPrefix)) {
    const relative = path2.slice(ownPrefix.length);
    if (/^(?:data\.json|link-state\.json|mobile-ignore\.json)(?:$|[.~_-])/i.test(relative)) return false;
  }
  if (path2.startsWith(`${configDir}/plugins/`)) {
    const id = path2.slice(`${configDir}/plugins/`.length).split("/")[0];
    if (!options.syncPlugins || id !== "__link_scan__" && !options.plugins.includes(id)) return false;
    if (/\/(?:data|sync-settings)\.json$/i.test(path2)) return false;
  } else if (path2 === configDir || path2.startsWith(`${configDir}/`)) return false;
  if (!options.syncImages && IMAGE_EXTENSIONS.includes(path2.split(".").pop().toLowerCase())) return false;
  return !shouldIgnore(path2, [...defaultSyncIgnorePatterns(configDir), ...options.ignorePatterns], configDir);
}
async function blobSha(bytes) {
  const header = new TextEncoder().encode(`blob ${bytes.byteLength}\0`);
  const payload = new Uint8Array(header.length + bytes.length);
  payload.set(header);
  payload.set(bytes, header.length);
  const digest = await crypto.subtle.digest("SHA-1", payload);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
function noteChange(state, type, path2, oldPath) {
  const revision = ++state.revision;
  state.dirty[path2] = revision;
  if (oldPath) state.dirty[oldPath] = revision;
  if (type !== "rename" || !oldPath) return;
  const { moves } = state.paths;
  const destinations = new Set(Object.values(moves));
  const origins = /* @__PURE__ */ new Set([...Object.keys(state.base), ...Object.keys(moves), ...Object.keys(state.cache), oldPath]);
  for (const base of origins) {
    const current = moves[base] ?? base;
    if (!(base in moves) && destinations.has(base)) continue;
    if (current === oldPath || current.startsWith(`${oldPath}/`)) {
      const target = path2 + current.slice(oldPath.length);
      if (target === base) delete moves[base];
      else moves[base] = target;
    }
  }
  for (const [cachedPath, entry] of Object.entries(state.cache)) {
    if (cachedPath === oldPath || cachedPath.startsWith(`${oldPath}/`)) {
      const target = path2 + cachedPath.slice(oldPath.length);
      state.cache[target] = entry;
      state.dirty[target] = revision;
      delete state.cache[cachedPath];
    }
  }
}
async function listIncluded(adapter, allowed) {
  const files = [];
  const visit = async (dir) => {
    const listing = await adapter.list(dir);
    for (const file of listing.files) {
      const path2 = safePath(file.replace(/^\/+/, ""));
      if (allowed(path2)) files.push(path2);
    }
    for (const folder of listing.folders) {
      const path2 = safePath(folder.replace(/^\/+/, ""));
      if ([".git", "node_modules", ".simple-link", ".trash", ".codex"].includes(path2.split("/").pop())) continue;
      if (allowed(`${path2}/__link_scan__`)) await visit(path2);
    }
  };
  await visit("/");
  return files.sort();
}
async function scanCurrent(adapter, state, options, allowed, force, progress) {
  const paths = await listIncluded(adapter, allowed);
  const current = {};
  for (let index = 0; index < paths.length; index++) {
    const path2 = paths[index];
    const before = await adapter.stat(path2);
    if (!before || before.type !== "file") throw new Error("\u626B\u63CF\u671F\u95F4\u6587\u4EF6\u53D1\u751F\u53D8\u5316\uFF0C\u8BF7\u91CD\u8BD5\u3002");
    const cached = state.cache[path2];
    const recentlyWritten = !!cached && Math.max(before.mtime, cached.mtime) >= cached.verifiedAt - 2e3;
    if (!force && options.cacheEnabled && cached?.hashVersion === SYNC_HASH_VERSION && !state.dirty[path2] && !recentlyWritten && before.mtime === cached.mtime && before.ctime === cached.ctime && before.size === cached.size) {
      cached.mode = state.base[path2]?.mode ?? cached.mode;
      current[path2] = { sha: cached.sha, rawSha: cached.rawSha, mode: cached.mode };
    } else {
      const dirtyRevision = state.dirty[path2];
      const bytes = new Uint8Array(await adapter.readBinary(path2));
      const canonical = syncBytes(bytes);
      const sha = await blobSha(canonical);
      const rawSha = canonical === bytes ? sha : await blobSha(bytes);
      const after = await adapter.stat(path2);
      if (!after || before.mtime !== after.mtime || before.size !== after.size || before.ctime !== after.ctime || state.dirty[path2] !== dirtyRevision) throw new Error("\u626B\u63CF\u671F\u95F4\u6587\u4EF6\u6B63\u5728\u4FEE\u6539\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002");
      const entry = {
        sha,
        rawSha,
        mode: state.base[path2]?.mode ?? "100644",
        mtime: after.mtime,
        ctime: after.ctime,
        size: after.size,
        verifiedAt: Date.now(),
        hashVersion: SYNC_HASH_VERSION
      };
      current[path2] = { sha, rawSha, mode: entry.mode };
      if (options.cacheEnabled) state.cache[path2] = entry;
      if (state.dirty[path2] === dirtyRevision) delete state.dirty[path2];
    }
    if (index % 25 === 0) {
      progress?.(`\u672C\u5730\u54C8\u5E0C ${index + 1}/${paths.length}`);
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    }
  }
  for (const path2 of Object.keys(state.cache)) if (!(path2 in current)) delete state.cache[path2];
  if (!options.cacheEnabled) state.cache = {};
  state.lastCacheAt = Date.now();
  return current;
}
function identityPaths(base, current, recorded, hashFallback = true) {
  const mapping = {};
  const claimed = /* @__PURE__ */ new Set();
  for (const [from, to] of Object.entries(recorded)) {
    if (!base[from]) continue;
    if (to && current[to] && !claimed.has(to)) {
      mapping[from] = to;
      claimed.add(to);
    } else if (to === null || to && !current[to]) mapping[from] = null;
  }
  for (const path2 of Object.keys(base)) {
    if (path2 in mapping) continue;
    if (current[path2] && !claimed.has(path2)) {
      mapping[path2] = path2;
      claimed.add(path2);
    } else mapping[path2] = null;
  }
  const missing = hashFallback ? Object.keys(base).filter((path2) => mapping[path2] === null && !(path2 in recorded)) : [];
  const added = Object.keys(current).filter((path2) => !claimed.has(path2));
  for (const from of missing) {
    const matches = added.filter((to) => !claimed.has(to) && current[to].sha === base[from].sha);
    const sources = missing.filter((path2) => base[path2].sha === base[from].sha);
    if (matches.length === 1 && sources.length === 1) {
      mapping[from] = matches[0];
      claimed.add(matches[0]);
    }
  }
  return mapping;
}
function linkDiff(base, current, records) {
  const mapping = identityPaths(base, current, records.moves, false);
  const claimed = new Set(Object.values(mapping).filter((path2) => !!path2));
  const changes = [];
  for (const [from, to] of Object.entries(mapping)) {
    const old = base[from];
    const next = to ? current[to] : void 0;
    if (!next) changes.push({
      status: "deleted",
      basePath: from,
      currentPath: null,
      baseBlobSha: old.sha,
      currentBlobSha: null,
      contentChanged: false
    });
    else if (from !== to || !sameContent(old, next) || old.mode !== next.mode) changes.push({
      status: from !== to ? "renamed" : "modified",
      basePath: from,
      currentPath: to,
      baseBlobSha: old.sha,
      currentBlobSha: next.sha,
      contentChanged: !sameContent(old, next),
      renameSource: from !== to ? "event" : void 0
    });
  }
  for (const path2 of Object.keys(current)) if (!claimed.has(path2)) changes.push({
    status: "added",
    basePath: null,
    currentPath: path2,
    baseBlobSha: null,
    currentBlobSha: current[path2].sha,
    contentChanged: true
  });
  return changes;
}

// src/mobileGithub.ts
var import_obsidian3 = require("obsidian");
var MobileGithub = class {
  constructor(adapter, configDir, pluginId, getOptions, progress) {
    this.adapter = adapter;
    this.configDir = configDir;
    this.pluginId = pluginId;
    this.getOptions = getOptions;
    this.progress = progress;
    this.state = newLocalState();
    this.remaining = null;
    this.remainingListeners = /* @__PURE__ */ new Set();
    this.remainingRevision = 0;
    this.saveRequested = false;
    this.loaded = false;
    this.deferredEvents = [];
    this.running = false;
    this.allowed = (path2) => included(path2, this.getOptions(), this.configDir, this.pluginId);
  }
  onRemainingChange(listener) {
    this.remainingListeners.add(listener);
    return () => {
      this.remainingListeners.delete(listener);
    };
  }
  resetRemaining() {
    this.remainingRevision++;
    this.remaining = null;
    this.notifyRemaining();
  }
  notifyRemaining() {
    for (const listener of this.remainingListeners) {
      try {
        listener(this.remaining);
      } catch {
        console.warn("Simple Link\uFF1A\u989D\u5EA6\u663E\u793A\u66F4\u65B0\u5931\u8D25\u3002");
      }
    }
  }
  get statePath() {
    return `${this.configDir}/plugins/${this.pluginId}/link-state.json`;
  }
  get recoveryPath() {
    return `${this.statePath}.recovery`;
  }
  async load() {
    if (this.loaded) return;
    let parsed;
    let recovered = false;
    for (const path2 of [this.statePath, this.recoveryPath]) {
      if (!await this.adapter.exists(path2)) continue;
      try {
        const candidate = JSON.parse(await this.adapter.read(path2));
        if (candidate.schema !== 1 || !candidate.base || !candidate.cache || !candidate.paths || !candidate.dirty) {
          throw new Error("Invalid state");
        }
        parsed = candidate;
        recovered = path2 === this.recoveryPath;
        break;
      } catch {
        if (path2 === this.recoveryPath) throw new Error("\u672C\u673A Link \u72B6\u6001\u4E0E\u6062\u590D\u526F\u672C\u5747\u65E0\u6CD5\u8BFB\u53D6\uFF0C\u5DF2\u505C\u6B62\u540C\u6B65\uFF1B\u8BF7\u4FDD\u7559\u6587\u4EF6\u540E\u68C0\u67E5\u3002");
      }
    }
    if (!parsed && await this.adapter.exists(this.statePath)) {
      throw new Error("\u672C\u673A Link \u72B6\u6001\u65E0\u6CD5\u8BFB\u53D6\u4E14\u6CA1\u6709\u6062\u590D\u526F\u672C\uFF0C\u5DF2\u505C\u6B62\u540C\u6B65\uFF1B\u8BF7\u4FDD\u7559\u6587\u4EF6\u540E\u68C0\u67E5\u3002");
    }
    if (parsed) {
      this.state = parsed;
      const oldPaths = !("moves" in parsed.paths) || "copies" in parsed.paths || !!parsed.pending && (!("moves" in parsed.pending.paths) || "copies" in parsed.pending.paths);
      parsed.paths = normalizePaths(parsed.paths);
      if (parsed.pending) parsed.pending.paths = normalizePaths(parsed.pending.paths);
      const legacy = parsed;
      if (recovered || oldPaths || "baseTreeSha" in legacy) {
        delete legacy.baseTreeSha;
        await this.save();
      }
    }
    this.loaded = true;
    for (const event of this.deferredEvents) this.event(event.type, event.path, event.oldPath);
    this.deferredEvents = [];
  }
  save() {
    this.saveRequested = true;
    if (this.savePromise) return this.savePromise;
    const write = Promise.resolve().then(async () => {
      do {
        this.saveRequested = false;
        const snapshot = JSON.stringify(this.state);
        await this.adapter.write(this.recoveryPath, snapshot);
        await this.adapter.write(this.statePath, snapshot);
      } while (this.saveRequested);
    });
    this.savePromise = write;
    void write.finally(() => {
      if (this.savePromise === write) this.savePromise = void 0;
    }).catch(() => void 0);
    return write;
  }
  event(type, path2, oldPath) {
    if (!this.loaded) {
      this.deferredEvents.push({ type, path: path2, oldPath });
      return;
    }
    if (!this.allowed(path2) && (!oldPath || !this.allowed(oldPath))) return;
    noteChange(this.state, type, path2, oldPath);
    if (!this.getOptions().trackPaths) this.state.paths = newPathRecords();
  }
  repo() {
    const repo = parseGithubRepoUrl(this.getOptions().repoUrl);
    if (!this.getOptions().token.trim()) throw new Error("\u8BF7\u586B\u5199\u624B\u673A\u7AEF GitHub Token\u3002");
    return { ...repo, prefix: `/repos/${repo.owner}/${repo.name}` };
  }
  async json(path2, read, method = "GET", body) {
    return read(await this.api(path2, method, body));
  }
  async api(path2, method = "GET", body, raw = false) {
    const token = this.getOptions().token.trim();
    if (!token) throw new Error("\u8BF7\u5148\u586B\u5199 GitHub Token\u3002");
    const remainingRevision = this.remainingRevision;
    let timer;
    try {
      const response = await Promise.race([
        (0, import_obsidian3.requestUrl)({
          url: `https://api.github.com${path2}`,
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: raw ? "application/vnd.github.raw+json" : "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "Content-Type": "application/json"
          },
          body: body === void 0 ? void 0 : JSON.stringify(body),
          throw: false
        }),
        new Promise((_, reject) => {
          timer = window.setTimeout(() => reject(new Error("GitHub \u8BF7\u6C42\u8D85\u65F6\uFF1B\u4E0B\u6B21\u540C\u6B65\u4F1A\u6838\u5BF9\u63D0\u4EA4\u7ED3\u679C\u3002")), 6e4);
        })
      ]);
      const left = Object.entries(response.headers).find(([key]) => key.toLowerCase() === "x-ratelimit-remaining")?.[1];
      if (remainingRevision === this.remainingRevision && token === this.getOptions().token.trim() && left !== void 0 && left.trim() !== "") {
        const remaining = Number(left);
        if (Number.isInteger(remaining) && remaining >= 0) {
          this.remaining = remaining;
          this.notifyRemaining();
        }
      }
      if (response.status < 200 || response.status >= 300) {
        if (response.status === 401) throw new Error("GitHub Token \u65E0\u6548\u6216\u5DF2\u8FC7\u671F\u3002");
        if (response.status === 403 || response.status === 429) throw new Error("GitHub \u62D2\u7EDD\u8BF7\u6C42\uFF1A\u8BF7\u68C0\u67E5 Token \u6743\u9650\u6216\u7A0D\u540E\u91CD\u8BD5\uFF08\u53EF\u80FD\u9650\u6D41\uFF09\u3002");
        if (response.status === 404) throw new Error("\u4ED3\u5E93\u6216\u5206\u652F\u4E0D\u5B58\u5728\uFF0C\u6216\u8005 Token \u65E0\u6743\u8BBF\u95EE\u3002");
        throw new Error(`GitHub HTTP ${response.status}\uFF1A\u8BF7\u6C42\u672A\u5B8C\u6210\uFF0C\u8BF7\u91CD\u65B0\u68C0\u67E5\u8FDC\u7AEF\u72B6\u6001\u3002`);
      }
      if (!raw) return response.json;
      const type = response.headers["content-type"] ?? response.headers["Content-Type"] ?? "";
      if (type.includes("json")) return decodeBase64(apiString(apiObject(response.json).content, true));
      return new Uint8Array(response.arrayBuffer);
    } finally {
      if (timer !== void 0) window.clearTimeout(timer);
    }
  }
  scope() {
    const o = this.getOptions();
    return JSON.stringify([
      o.repoUrl.toLowerCase(),
      o.branch,
      o.syncImages,
      o.syncPlugins,
      [...o.plugins].sort(),
      o.ignorePatterns
    ]);
  }
  async remote(useCompare = false) {
    const repo = this.repo();
    const branch = this.getOptions().branch.trim() || (await this.json(repo.prefix, readRepo)).default_branch;
    if (!branch) throw new Error("\u4ED3\u5E93\u5C1A\u65E0\u5206\u652F\uFF0C\u8BF7\u5148\u5728\u7535\u8111\u7AEF\u521B\u5EFA\u9996\u6B21\u63D0\u4EA4\u3002");
    const head = await this.json(`${repo.prefix}/commits/${encodeURIComponent(branch)}`, readCommit);
    const rootTree = head.commit.tree.sha;
    const renames = {};
    let comparison;
    if (useCompare && this.state.baseCommitSha) {
      if (head.sha !== this.state.baseCommitSha) {
        comparison = await this.json(`${repo.prefix}/compare/${this.state.baseCommitSha}...${head.sha}`, readCompare);
        if (!["ahead", "identical"].includes(comparison.status)) throw new Error("\u8FDC\u7AEF\u5386\u53F2\u4E0E\u5171\u540C\u57FA\u51C6\u4E0D\u4E00\u81F4\uFF0C\u5DF2\u505C\u6B62\u540C\u6B65\uFF0C\u8BF7\u91CD\u65B0\u6838\u5BF9\u4ED3\u5E93\u3002");
        for (const change of comparison.files ?? []) {
          if (change.status === "renamed" && this.allowed(change.previous_filename) && this.allowed(change.filename)) {
            renames[change.previous_filename] = change.filename;
          }
        }
      }
      if (this.state.baseScope === this.scope() && head.sha === this.state.baseCommitSha) {
        const files2 = { ...this.filteredBase() };
        return { commit: head.sha, tree: rootTree, files: files2, plugins: [], branch, renames };
      }
    }
    const files = {};
    const pluginManifests = /* @__PURE__ */ new Set();
    const pluginPrograms = /* @__PURE__ */ new Set();
    const collect = (entry, prefix = "") => {
      const path2 = safePath(prefix + entry.path);
      if (entry.type === "blob" && ["100644", "100755"].includes(entry.mode) && path2.startsWith(`${this.configDir}/plugins/`)) {
        const parts = path2.slice(`${this.configDir}/plugins/`.length).split("/");
        if (parts.length === 2 && parts[1] === "manifest.json") pluginManifests.add(parts[0]);
        if (parts.length === 2 && parts[1] === "main.js") pluginPrograms.add(parts[0]);
      }
      if (!this.allowed(path2)) return;
      if (entry.type === "blob") {
        if (!["100644", "100755"].includes(entry.mode)) throw new Error(`\u4E0D\u652F\u6301\u540C\u6B65\u7B26\u53F7\u94FE\u63A5\uFF1A${path2}`);
        files[path2] = { sha: entry.sha, mode: entry.mode };
      } else if (entry.type === "commit") throw new Error(`\u4E0D\u652F\u6301\u540C\u6B65 Git \u5B50\u6A21\u5757\uFF1A${path2}`);
    };
    const tree = await this.json(`${repo.prefix}/git/trees/${rootTree}?recursive=1`, readTree);
    if (!tree.truncated) {
      for (const entry of tree.tree) collect(entry);
    } else {
      const walk = async (sha, prefix = "") => {
        const subtree = await this.json(`${repo.prefix}/git/trees/${sha}`, readTree);
        if (subtree.truncated) throw new Error("\u8FDC\u7AEF\u76EE\u5F55\u6E05\u5355\u4ECD\u88AB\u622A\u65AD\uFF0C\u5DF2\u505C\u6B62\u540C\u6B65\uFF0C\u672A\u63A8\u65AD\u5220\u9664\u3002");
        for (const entry of subtree.tree) {
          if (entry.type === "tree") {
            const dir = prefix + safePath(entry.path);
            if (dir === this.configDir || dir === `${this.configDir}/plugins` || prefix === `${this.configDir}/plugins/` || this.allowed(`${dir}/__link_scan__`)) {
              await walk(entry.sha, dir + "/");
            }
          } else collect(entry, prefix);
        }
      };
      await walk(rootTree);
    }
    const plugins = [...pluginManifests].filter((id) => pluginPrograms.has(id)).sort();
    return { commit: head.sha, tree: rootTree, files, plugins, branch, renames };
  }
  async listCloudPlugins() {
    const remote = await this.remote();
    return remote.plugins;
  }
  async verify() {
    await this.load();
    const metadata = await this.json(this.repo().prefix, readRepo);
    if (metadata.permissions?.push === false) throw new Error("\u5F53\u524D Token \u6CA1\u6709\u4ED3\u5E93\u5199\u5165\u6743\u9650\uFF0C\u8BF7\u6388\u4E88 Contents \u8BFB\u5199\u6743\u9650\u3002");
    return await this.remote();
  }
  async verifyToken() {
    const user = await this.json("/user", (value) => ({ login: apiString(apiObject(value).login) }));
    if (!user.login) throw new Error("\u672A\u80FD\u786E\u8BA4 Token \u5BF9\u5E94\u7684 GitHub \u8D26\u53F7\u3002");
    return user.login;
  }
  async verifyAccess() {
    await this.verifyToken();
    const { prefix } = this.repo();
    const metadata = await this.json(prefix, readRepo);
    if (!metadata.private) throw new Error("\u8BF7\u9009\u62E9 GitHub \u79C1\u4EBA\u4ED3\u5E93\uFF0C\u907F\u514D\u516C\u5F00\u7B14\u8BB0\u3002");
    if (metadata.archived || metadata.disabled) throw new Error("\u4ED3\u5E93\u5DF2\u5F52\u6863\u6216\u505C\u7528\uFF0C\u65E0\u6CD5\u540C\u6B65\u3002");
    if (metadata.permissions?.push === false) throw new Error("\u5F53\u524D\u8D26\u53F7\u6CA1\u6709\u4ED3\u5E93\u5199\u5165\u6743\u9650\u3002");
    const branch = this.getOptions().branch.trim() || metadata.default_branch;
    if (!branch) throw new Error("\u4ED3\u5E93\u5C1A\u65E0\u5206\u652F\uFF0C\u8BF7\u5148\u5728 GitHub \u521B\u5EFA README \u6216\u9996\u6B21\u63D0\u4EA4\u3002");
    const branchInfo = await this.json(`${prefix}/branches/${encodeURIComponent(branch)}`, (value) => ({ protected: apiBoolean(apiObject(value).protected) }));
    if (branchInfo.protected) throw new Error("\u8BE5\u5206\u652F\u53D7\u4FDD\u62A4\uFF0C\u8BF7\u9009\u62E9\u5141\u8BB8\u76F4\u63A5\u5199\u5165\u7684\u540C\u6B65\u5206\u652F\u3002");
    const remote = await this.remote();
    await this.api(`${prefix}/git/blobs`, "POST", { content: "", encoding: "utf-8" });
    return remote;
  }
  async createPrivateRepository(name) {
    if (!/^[A-Za-z0-9._-]+$/.test(name) || name === "." || name === "..") throw new Error("\u4ED3\u5E93\u540D\u79F0\u53EA\u80FD\u5305\u542B\u82F1\u6587\u3001\u6570\u5B57\u3001\u70B9\u3001\u4E0B\u5212\u7EBF\u6216\u77ED\u6A2A\u7EBF\u3002");
    await this.verifyToken();
    const repo = await this.json("/user/repos", readRepo, "POST", { name, private: true, auto_init: true });
    if (!repo.private || !repo.clone_url) throw new Error("\u672A\u80FD\u786E\u8BA4\u65B0\u4ED3\u5E93\u7684\u79C1\u4EBA\u72B6\u6001\uFF0C\u8BF7\u5230 GitHub \u68C0\u67E5\u521B\u5EFA\u7ED3\u679C\u3002");
    return { url: parseGithubRepoUrl(repo.clone_url).url, branch: repo.default_branch || "" };
  }
  binding(branch) {
    const repo = this.repo();
    return `${repo.owner.toLowerCase()}/${repo.name.toLowerCase()}#${branch}`;
  }
  async bind(verified) {
    if (this.running) throw new Error("\u6B63\u5728\u68C0\u67E5\u7F13\u5B58\u6216\u6267\u884C\u540C\u6B65\uFF0C\u8BF7\u7A0D\u540E\u518D\u7ED1\u5B9A\u4ED3\u5E93\u3002");
    await this.load();
    if (this.state.pending) throw new Error("\u8FD8\u6709\u672A\u5B8C\u6210\u540C\u6B65\uFF0C\u8BF7\u5148\u7528\u539F\u4ED3\u5E93\u6062\u590D\uFF0C\u518D\u66F4\u6362\u7ED1\u5B9A\u3002");
    const remote = verified ?? await this.verify();
    const binding = this.binding(remote.branch);
    if (this.state.binding !== binding) this.state = newLocalState(binding);
    await this.save();
    return remote;
  }
  async refreshCache(force = false) {
    await this.load();
    if (this.running || this.state.pending) throw new Error("\u540C\u6B65\u6267\u884C\u6216\u6062\u590D\u671F\u95F4\u4E0D\u80FD\u91CD\u65B0\u5EFA\u7ACB\u7F13\u5B58\u3002");
    this.running = true;
    const started = performance.now();
    try {
      const current = await scanCurrent(this.adapter, this.state, this.getOptions(), this.allowed, force, this.progress);
      await this.save();
      return { files: Object.keys(current).length, seconds: (performance.now() - started) / 1e3 };
    } finally {
      this.running = false;
    }
  }
  async changes() {
    await this.load();
    if (this.running) return [];
    this.running = true;
    try {
      const current = await scanCurrent(this.adapter, this.state, this.getOptions(), this.allowed, false);
      const base = this.filteredBase();
      await this.save();
      return linkDiff(base, current, this.getOptions().trackPaths ? this.state.paths : newPathRecords());
    } finally {
      this.running = false;
    }
  }
  cachedChanges(paths) {
    const base = this.filteredBase();
    const current = {};
    const visible = new Set(paths);
    for (const path2 of Object.keys(this.state.cache)) if (path2.startsWith(`${this.configDir}/`) || path2.split("/").some((part) => part.startsWith("."))) visible.add(path2);
    for (const path2 of visible) {
      if (!this.allowed(path2)) continue;
      const entry = this.state.cache[path2] ?? base[path2];
      current[path2] = entry ? { sha: entry.sha, rawSha: entry.rawSha, mode: entry.mode } : { sha: "unverified", mode: "100644" };
      if (this.state.dirty[path2]) current[path2] = { sha: `unverified:${this.state.dirty[path2]}`, mode: current[path2].mode };
    }
    return linkDiff(base, current, this.getOptions().trackPaths ? this.state.paths : newPathRecords());
  }
  filteredBase() {
    return Object.fromEntries(Object.entries(this.state.base).filter(([path2]) => this.allowed(path2)));
  }
  async preview(choices = {}) {
    await this.load();
    if (!this.getOptions().bound) throw new Error("\u8BF7\u5148\u5B8C\u6210\u624B\u673A\u7AEF Token\u3001\u4ED3\u5E93\u4E0E\u540C\u6B65\u8303\u56F4\u5F15\u5BFC\u3002");
    if (this.running) throw new Error("\u672C\u5730\u7F13\u5B58\u6B63\u5728\u68C0\u67E5\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002");
    this.running = true;
    try {
      await this.recover();
      this.progress("\u6B63\u5728\u8BFB\u53D6 GitHub \u6587\u4EF6\u6811\u2026");
      const remote = await this.remote(true);
      if (this.state.binding !== this.binding(remote.branch)) throw new Error("\u4ED3\u5E93\u6216\u5206\u652F\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u7ED1\u5B9A\uFF1B\u65E7\u57FA\u51C6\u4E0D\u4F1A\u88AB\u590D\u7528\u3002");
      const local = await scanCurrent(this.adapter, this.state, this.getOptions(), this.allowed, false, this.progress);
      await this.save();
      const base = this.filteredBase();
      const remoteRenames = remote.renames;
      const mergedContents = {};
      const mergedEntries = {};
      for (const [id, decision] of Object.entries(choices)) if (decision.choice === "manual") {
        if (decision.text === void 0) throw new Error("\u624B\u5DE5\u5408\u5E76\u5185\u5BB9\u4E3A\u7A7A\u7F3A\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9\u3002");
        const text = decision.text.replace(/\r\n/g, "\n");
        const sha = await blobSha(new TextEncoder().encode(text));
        mergedContents[sha] = text;
        mergedEntries[id] = { sha, mode: "100644" };
      }
      const desired = {};
      const conflicts = [];
      const put = (side) => {
        if (!side) return;
        if (desired[side.path]) {
          throw new Error(`\u76EE\u6807\u8DEF\u5F84\u88AB\u4E0D\u540C\u6587\u4EF6\u5360\u7528\uFF1A${side.path}\u3002\u8BF7\u5148\u8C03\u6574\u540D\u79F0\uFF0C\u518D\u91CD\u65B0\u9884\u89C8\u3002`);
        }
        const existing = remote.files[side.path];
        desired[side.path] = { sha: sameContent(side, existing) ? existing.sha : side.sha, mode: side.mode };
      };
      const choose = (conflict) => {
        const decision = choices[conflict.id];
        if (!decision) {
          conflicts.push(conflict);
          return;
        }
        if (decision.choice === "delete") {
          if (!["unpaired", "delete", "duplicate"].includes(conflict.kind) && !(conflict.kind === "path" && sameContent(conflict.local, conflict.remote))) throw new Error("\u5185\u5BB9\u5DEE\u5F02\u4E0D\u80FD\u6309\u6587\u4EF6\u6279\u91CF\u5220\u9664\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9\u3002");
          return;
        }
        if (decision.choice === "manual") {
          if (!["content", "initial"].includes(conflict.kind)) throw new Error("\u8BF7\u5148\u6309\u6587\u4EF6\u9009\u62E9\u8DEF\u5F84\u6216\u5220\u9664\u65B9\u6848\u3002");
          put({
            ...mergedEntries[conflict.id],
            mode: conflict.local?.mode ?? conflict.remote?.mode ?? "100644",
            path: conflict.targetPath ?? conflict.local.path,
            source: "local"
          });
          return;
        }
        if (decision.choice === "both") {
          if (conflict.kind !== "duplicate") throw new Error("\u8BE5\u9879\u76EE\u4E0D\u80FD\u4FDD\u7559\u4E24\u4E2A\u7248\u672C\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9\u3002");
          const files2 = [...conflict.localFiles, ...conflict.remoteFiles];
          for (const side2 of files2) if (!desired[side2.path]) put(side2);
          return;
        }
        const files = decision.choice === "local" ? conflict.localFiles : conflict.remoteFiles;
        if (files) {
          for (const side2 of files) put(side2);
          return;
        }
        const side = decision.choice === "local" ? conflict.local : conflict.remote;
        put(side && conflict.targetPath ? { ...side, path: conflict.targetPath } : side);
      };
      const sideAt = (files, path2, source) => path2 && files[path2] ? { ...files[path2], path: path2, source } : void 0;
      const same = (a, b) => !a && !b || !!a && !!b && a.path === b.path && a.mode === b.mode && sameContent(a, b);
      const records = this.getOptions().trackPaths ? this.state.paths : newPathRecords();
      const lMap = identityPaths(base, local, records.moves, false);
      const rMap = identityPaths(base, remote.files, remoteRenames);
      const claimedLocal = new Set(Object.values(lMap));
      const claimedRemote = new Set(Object.values(rMap));
      for (const path2 of Object.keys(base)) {
        const b = { ...base[path2], path: path2, source: "remote" };
        const l = sideAt(local, lMap[path2], "local");
        const r = sideAt(remote.files, rMap[path2], "remote");
        if (same(l, r)) put(l);
        else if (same(l, b)) put(r);
        else if (same(r, b)) put(l);
        else if (!l || !r) choose({ id: `base:${path2}`, label: path2, kind: "delete", base: b, local: l, remote: r });
        else {
          const target = l.path === r.path ? l.path : l.path === path2 ? r.path : r.path === path2 ? l.path : void 0;
          if (!target) choose({ id: `base:${path2}`, label: path2, kind: "path", base: b, local: l, remote: r });
          else if (sameContent(l, r)) put({ ...l, mode: l.mode === b.mode ? r.mode : l.mode, path: target });
          else if (sameContent(l, b)) put({ ...r, path: target });
          else if (sameContent(r, b)) put({ ...l, path: target });
          else choose({ id: `base:${path2}`, label: path2, kind: "content", targetPath: target, base: b, local: l, remote: r });
        }
      }
      const additions = /* @__PURE__ */ new Set([
        ...Object.keys(local).filter((p) => !claimedLocal.has(p)),
        ...Object.keys(remote.files).filter((p) => !claimedRemote.has(p))
      ]);
      if (!this.state.baseCommitSha) {
        for (const path2 of [...additions]) {
          if (local[path2] && remote.files[path2] && sameContent(local[path2], remote.files[path2])) {
            put(sideAt(remote.files, path2, "remote"));
            additions.delete(path2);
          }
        }
        const localHashes = /* @__PURE__ */ new Map(), remoteHashes = /* @__PURE__ */ new Map();
        const remoteShas = new Set(Object.values(remote.files).map((f) => f.sha));
        for (const [files, hashes, source] of [[local, localHashes, "local"], [remote.files, remoteHashes, "remote"]]) {
          const other = source === "local" ? remote.files : local;
          for (const path2 of additions) if (files[path2] && (!other[path2] || sameContent(other[path2], files[path2]))) {
            const hash = source === "local" && files[path2].rawSha && remoteShas.has(files[path2].rawSha) ? files[path2].rawSha : files[path2].sha;
            const group = hashes.get(hash) ?? [];
            group.push({ ...files[path2], path: path2, source });
            hashes.set(hash, group);
          }
        }
        for (const [sha, locals] of localHashes) {
          const remotes = remoteHashes.get(sha);
          if (!remotes) continue;
          choose({
            id: `hash:${sha}`,
            label: locals.length === 1 && remotes.length === 1 ? locals[0].path : `\u76F8\u540C\u5185\u5BB9 \xB7 ${new Set([...locals, ...remotes].map((s) => s.path)).size} \u4E2A\u8DEF\u5F84`,
            kind: "duplicate",
            local: locals[0],
            remote: remotes[0],
            localFiles: locals,
            remoteFiles: remotes
          });
          for (const side of [...locals, ...remotes]) {
            if (!local[side.path] || !remote.files[side.path] || sameContent(local[side.path], remote.files[side.path])) additions.delete(side.path);
          }
        }
      }
      for (const path2 of additions) {
        const l = !claimedLocal.has(path2) ? sideAt(local, path2, "local") : void 0;
        const r = !claimedRemote.has(path2) ? sideAt(remote.files, path2, "remote") : void 0;
        if (l && r && !sameContent(l, r)) choose({ id: `new:${path2}`, label: path2, kind: "initial", local: l, remote: r });
        else if (!this.state.baseCommitSha && !!l !== !!r) {
          choose({ id: `new:${path2}`, label: path2, kind: "unpaired", local: l, remote: r });
        } else put(l ?? r);
      }
      const conflictedLocal = new Set(conflicts.flatMap((c) => c.localFiles?.map((s) => s.path) ?? (c.local ? [c.local.path] : [])));
      const conflictedRemote = new Set(conflicts.flatMap((c) => c.remoteFiles?.map((s) => s.path) ?? (c.remote ? [c.remote.path] : [])));
      const plan = {
        remote,
        local,
        desired,
        conflicts,
        revision: this.state.revision,
        pendingChoices: choices,
        remoteRenames,
        paths: { moves: { ...records.moves } },
        scope: this.scope(),
        mergedContents,
        uploads: Object.keys(desired).filter((p) => desired[p].sha !== remote.files[p]?.sha || desired[p].mode !== remote.files[p]?.mode),
        downloads: Object.keys(desired).filter((p) => !sameContent(desired[p], local[p])),
        localDeletes: Object.keys(local).filter((p) => !desired[p] && !conflictedLocal.has(p)),
        remoteDeletes: Object.keys(remote.files).filter((p) => !desired[p] && !conflictedRemote.has(p))
      };
      return plan;
    } finally {
      this.running = false;
    }
  }
  async content(side) {
    const bytes = side.source === "local" ? new Uint8Array(await this.adapter.readBinary(side.path)) : await this.getBlob(side.sha);
    if (bytes.length > 2e5) return "\u6587\u4EF6\u8D85\u8FC7 200 KB\uFF0C\u9884\u89C8\u5DF2\u7701\u7565\u3002\u8BF7\u5728\u539F\u6587\u4EF6\u4E2D\u68C0\u67E5\u5185\u5BB9\u3002";
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      return text.includes("\0") ? "\u4E8C\u8FDB\u5236\u6587\u4EF6\uFF0C\u4E0D\u63D0\u4F9B\u6587\u672C\u9884\u89C8\u3002" : text;
    } catch {
      return "\u4E8C\u8FDB\u5236\u6587\u4EF6\uFF0C\u4E0D\u63D0\u4F9B\u6587\u672C\u9884\u89C8\u3002";
    }
  }
  async reviewText(side) {
    const bytes = side.source === "local" ? new Uint8Array(await this.adapter.readBinary(side.path)) : await this.getBlob(side.sha);
    if (await blobSha(bytes) !== (side.rawSha ?? side.sha)) throw new Error("\u9884\u89C8\u6587\u4EF6\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u540C\u6B65\u9884\u89C8\u3002");
    if (bytes.length > 2e5) return null;
    try {
      const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(syncBytes(bytes));
      return text.includes("\0") ? null : text;
    } catch {
      return null;
    }
  }
  async getBlob(sha) {
    const bytes = await this.api(`${this.repo().prefix}/git/blobs/${sha}`, "GET", void 0, true);
    if (!(bytes instanceof Uint8Array)) throw new Error("GitHub \u6587\u4EF6\u54CD\u5E94\u683C\u5F0F\u9519\u8BEF\uFF0C\u5DF2\u505C\u6B62\u540C\u6B65\u3002");
    if (await blobSha(bytes) !== sha) throw new Error("\u4E91\u7AEF\u6587\u4EF6\u6821\u9A8C\u5931\u8D25\uFF0C\u5DF2\u505C\u6B62\u5199\u5165\u3002");
    return bytes;
  }
  async liveSha(path2) {
    const stat = await this.adapter.stat(path2);
    if (!stat) return null;
    if (stat.type !== "file") throw new Error(`\u76EE\u6807\u4F4D\u7F6E\u88AB\u6587\u4EF6\u5939\u5360\u7528\uFF1A${path2}`);
    return await blobSha(new Uint8Array(await this.adapter.readBinary(path2)));
  }
  requiresPluginReload(plan) {
    const prefix = this.configDir + "/plugins/" + this.pluginId + "/";
    return [...plan.downloads, ...plan.localDeletes].some((path2) => ["main.js", "manifest.json", "styles.css"].some((name) => path2 === prefix + name));
  }
  async execute(plan) {
    if (plan.conflicts.length) throw new Error("\u4ECD\u6709\u672A\u9009\u62E9\u7684\u51B2\u7A81\uFF0C\u672A\u6267\u884C\u540C\u6B65\u3002");
    if (this.running) throw new Error("\u672C\u5730\u7F13\u5B58\u6B63\u5728\u68C0\u67E5\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002");
    this.running = true;
    try {
      if (plan.scope !== this.scope()) throw new Error("\u540C\u6B65\u8303\u56F4\u6216\u4ED3\u5E93\u8BBE\u7F6E\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u9884\u89C8\u3002");
      if (this.state.revision !== plan.revision) throw new Error("\u9884\u89C8\u540E\u672C\u5730\u53D1\u751F\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u9884\u89C8\u3002");
      const repo = this.repo();
      const head = await this.json(`${repo.prefix}/git/ref/heads/${encodeURIComponent(plan.remote.branch)}`, (value) => ({ object: readSha(apiObject(value).object) }));
      if (head.object.sha !== plan.remote.commit) throw new Error("\u9884\u89C8\u540E\u4E91\u7AEF\u51FA\u73B0\u65B0\u63D0\u4EA4\uFF0C\u8BF7\u91CD\u65B0\u9884\u89C8\u3002");
      const live = await scanCurrent(this.adapter, this.state, this.getOptions(), this.allowed, false, this.progress);
      await this.save();
      if (JSON.stringify(Object.entries(live).map(([p, e]) => [p, e.sha]).sort()) !== JSON.stringify(Object.entries(plan.local).map(([p, e]) => [p, e.sha]).sort())) throw new Error("\u9884\u89C8\u540E\u6587\u4EF6\u5185\u5BB9\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u9884\u89C8\u3002");
      const localBySha = new Map(Object.entries(plan.local).map(([path2, entry]) => [entry.sha, path2]));
      const entries = plan.remoteDeletes.map((path2) => ({ path: path2, mode: plan.remote.files[path2].mode, type: "blob", sha: null }));
      const known = new Set([...Object.values(plan.remote.files), ...Object.values(this.state.base)].map((e) => e.sha));
      let batch = [];
      let batchBytes = 0;
      let treeSha = plan.remote.tree;
      const flush = async () => {
        if (!batch.length) return;
        const tree = await this.json(`${repo.prefix}/git/trees`, readSha, "POST", { base_tree: treeSha, tree: batch });
        treeSha = tree.sha;
        batch = [];
        batchBytes = 0;
      };
      for (const entry of entries) {
        batch.push(entry);
        if (batch.length >= 500) await flush();
      }
      for (let i = 0; i < plan.uploads.length; i++) {
        const path2 = plan.uploads[i];
        const target = plan.desired[path2];
        const item = { path: path2, mode: target.mode, type: "blob" };
        if (known.has(target.sha)) item.sha = target.sha;
        else {
          const sourcePath = localBySha.get(target.sha);
          const merged = plan.mergedContents[target.sha];
          if (!sourcePath && merged === void 0) throw new Error("\u65E0\u6CD5\u627E\u5230\u5F85\u4E0A\u4F20\u5185\u5BB9\uFF0C\u8BF7\u91CD\u65B0\u9884\u89C8\u3002");
          const bytes = merged !== void 0 ? new TextEncoder().encode(merged) : syncBytes(new Uint8Array(await this.adapter.readBinary(sourcePath)));
          if (await blobSha(bytes) !== target.sha) throw new Error("\u4E0A\u4F20\u524D\u672C\u5730\u6587\u4EF6\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u9884\u89C8\u3002");
          let text = null;
          try {
            const decoded = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
            if (!decoded.includes("\0")) text = decoded;
          } catch {
          }
          if (text !== null && bytes.length <= 512e3) {
            item.content = text;
            const size = new TextEncoder().encode(JSON.stringify(item)).length;
            if (batchBytes + size > 1024e3) await flush();
            batchBytes += size;
          } else {
            const blob = await this.json(`${repo.prefix}/git/blobs`, readSha, "POST", { content: encodeBase64(bytes), encoding: "base64" });
            if (blob.sha !== target.sha) throw new Error("\u4E0A\u4F20\u5185\u5BB9\u6821\u9A8C\u5931\u8D25\u3002");
            item.sha = blob.sha;
            known.add(blob.sha);
          }
        }
        batch.push(item);
        if (batch.length >= 500) await flush();
        this.progress(`\u51C6\u5907\u4E91\u7AEF\u5185\u5BB9 ${i + 1}/${plan.uploads.length}`);
      }
      await flush();
      if (this.state.revision !== plan.revision) throw new Error("\u4E0A\u4F20\u51C6\u5907\u671F\u95F4\u672C\u5730\u53D1\u751F\u53D8\u5316\uFF0C\u5C1A\u672A\u66F4\u65B0\u8FDC\u7AEF\u5206\u652F\uFF0C\u8BF7\u91CD\u65B0\u9884\u89C8\u3002");
      const actions = [
        ...plan.downloads.map((path2) => ({ path: path2, sha: plan.desired[path2].sha, expected: plan.local[path2]?.rawSha ?? plan.local[path2]?.sha ?? null })),
        ...plan.localDeletes.map((path2) => ({ path: path2, sha: null, expected: plan.local[path2].rawSha ?? plan.local[path2].sha }))
      ];
      let commitSha = plan.remote.commit;
      if (treeSha !== plan.remote.tree) {
        const commit = await this.json(`${repo.prefix}/git/commits`, readSha, "POST", {
          message: `Simple Link mobile sync ${(/* @__PURE__ */ new Date()).toISOString()}`,
          tree: treeSha,
          parents: [plan.remote.commit]
        });
        commitSha = commit.sha;
      }
      if (plan.scope !== this.scope()) throw new Error("\u4E0A\u4F20\u51C6\u5907\u671F\u95F4\u540C\u6B65\u8303\u56F4\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u9884\u89C8\u3002");
      this.state.pending = {
        commit: commitSha,
        parent: plan.remote.commit,
        base: plan.desired,
        actions,
        revision: plan.revision,
        paths: plan.paths,
        scope: plan.scope
      };
      await this.save();
      if (commitSha !== plan.remote.commit) await this.api(
        `${repo.prefix}/git/refs/heads/${encodeURIComponent(plan.remote.branch)}`,
        "PATCH",
        { sha: commitSha, force: false }
      );
      await this.applyPending();
    } finally {
      this.running = false;
    }
  }
  async recover() {
    const pending = this.state.pending;
    if (!pending) return;
    const remote = await this.remote();
    if (this.state.binding !== this.binding(remote.branch)) throw new Error("\u672A\u5B8C\u6210\u4E8B\u52A1\u5C5E\u4E8E\u5176\u4ED6\u4ED3\u5E93\uFF0C\u4E0D\u80FD\u5207\u6362\u7ED1\u5B9A\u3002");
    if (remote.commit !== pending.commit) {
      if (remote.commit === pending.parent && pending.commit !== pending.parent) {
        this.state.pending = void 0;
        await this.save();
        return;
      }
      const diff = await this.json(`${this.repo().prefix}/compare/${pending.commit}...${remote.commit}`, readCompare);
      if (!["ahead", "identical"].includes(diff.status)) throw new Error("\u672A\u5B8C\u6210\u63D0\u4EA4\u4E0E\u8FDC\u7AEF\u5386\u53F2\u4E0D\u4E00\u81F4\uFF0C\u8BF7\u4FDD\u7559\u672C\u673A\u72B6\u6001\u5E76\u68C0\u67E5\u4ED3\u5E93\u3002");
    }
    for (const action of pending.actions) {
      const current = await this.liveSha(action.path);
      if (current !== action.sha && current !== action.expected) {
        this.state.pending = void 0;
        await this.save();
        this.progress("\u672A\u5B8C\u6210\u540C\u6B65\u4E2D\u53D1\u73B0\u672C\u673A\u65B0\u4FEE\u6539\uFF0C\u5DF2\u4FDD\u7559\u5185\u5BB9\u5E76\u91CD\u65B0\u9884\u89C8\u5DEE\u5F02\u2026");
        return;
      }
    }
    await this.applyPending();
  }
  async ensureParent(path2) {
    const parts = path2.split("/");
    parts.pop();
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (!await this.adapter.exists(current)) await this.adapter.mkdir(current);
    }
  }
  async applyPending() {
    const pending = this.state.pending;
    if (pending.scope !== this.scope()) throw new Error("\u672A\u5B8C\u6210\u540C\u6B65\u7684\u8303\u56F4\u5DF2\u53D8\u5316\uFF0C\u8BF7\u6062\u590D\u539F\u540C\u6B65\u8303\u56F4\u518D\u7EE7\u7EED\u3002");
    const downloaded = /* @__PURE__ */ new Map();
    for (const action of pending.actions) {
      if (!this.allowed(action.path)) throw new Error("\u540C\u6B65\u8303\u56F4\u5DF2\u53D8\u5316\uFF0C\u8BF7\u6062\u590D\u539F\u8303\u56F4\u540E\u7EE7\u7EED\u672A\u5B8C\u6210\u4E8B\u52A1\u3002");
      const current = await this.liveSha(action.path);
      if (current === action.sha) {
        if (action.sha) downloaded.set(action.sha, action.path);
        continue;
      }
      if (current !== action.expected) throw new Error(`\u672C\u5730\u6587\u4EF6\u53C8\u88AB\u4FEE\u6539\uFF0C\u5DF2\u4FDD\u7559\uFF1A${action.path}\u3002\u8BF7\u5148\u5907\u4EFD\u5E76\u6062\u590D\u5230\u9884\u89C8\u5185\u5BB9\u540E\u91CD\u8BD5\u3002`);
      if (action.sha === null) {
        if (await this.liveSha(action.path) !== action.expected) throw new Error("\u5220\u9664\u524D\u672C\u5730\u5185\u5BB9\u53D1\u751F\u53D8\u5316\uFF0C\u5DF2\u505C\u6B62\u3002");
        await this.adapter.remove(action.path);
      } else {
        const source = downloaded.get(action.sha);
        let bytes = source && await this.adapter.exists(source) ? new Uint8Array(await this.adapter.readBinary(source)) : void 0;
        if (!bytes || await blobSha(bytes) !== action.sha) bytes = await this.getBlob(action.sha);
        await this.ensureParent(action.path);
        if (await this.liveSha(action.path) !== action.expected) throw new Error("\u4E0B\u8F7D\u671F\u95F4\u672C\u5730\u5185\u5BB9\u53D1\u751F\u53D8\u5316\uFF0C\u5DF2\u505C\u6B62\u5199\u5165\u3002");
        await this.adapter.writeBinary(action.path, bytes.buffer);
        downloaded.set(action.sha, action.path);
      }
      delete this.state.cache[action.path];
    }
    const moveOrigins = /* @__PURE__ */ new Set([...Object.keys(this.state.paths.moves), ...Object.keys(pending.paths.moves)]);
    const outstanding = [...moveOrigins].filter((path2) => this.state.paths.moves[path2] !== pending.paths.moves[path2]).map((path2) => [path2, this.state.paths.moves[path2] ?? path2]);
    const rebased = newPathRecords();
    for (const [oldBase, target] of outstanding) {
      const origin = pending.paths.moves[oldBase] ?? oldBase;
      if (origin !== target) rebased.moves[origin] = target;
    }
    this.state.base = pending.base;
    this.state.baseCommitSha = pending.commit;
    this.state.baseScope = pending.scope;
    this.state.paths = rebased;
    this.state.pending = void 0;
    await this.save();
    this.progress("\u540C\u6B65\u5DF2\u5BF9\u9F50\uFF0C\u6B63\u5728\u66F4\u65B0\u672C\u5730\u54C8\u5E0C\u7F13\u5B58\u2026");
    await scanCurrent(this.adapter, this.state, this.getOptions(), this.allowed, false, this.progress);
    await this.save();
  }
};
function encodeBase64(bytes) {
  let result = "";
  const chunk = 3 * 16384;
  for (let index = 0; index < bytes.length; index += chunk) {
    result += btoa(String.fromCharCode(...bytes.subarray(index, index + chunk)));
  }
  return result;
}
function decodeBase64(value) {
  const text = atob(value.replace(/\s/g, ""));
  return Uint8Array.from(text, (character) => character.charCodeAt(0));
}
function apiObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("GitHub \u54CD\u5E94\u683C\u5F0F\u9519\u8BEF\uFF0C\u5DF2\u505C\u6B62\u540C\u6B65\u3002");
  return value;
}
function apiString(value, allowEmpty = false) {
  if (typeof value !== "string" || !allowEmpty && !value) throw new Error("GitHub \u54CD\u5E94\u7F3A\u5C11\u5FC5\u8981\u5B57\u6BB5\uFF0C\u5DF2\u505C\u6B62\u540C\u6B65\u3002");
  return value;
}
function apiBoolean(value) {
  if (typeof value !== "boolean") throw new Error("GitHub \u54CD\u5E94\u5E03\u5C14\u5B57\u6BB5\u65E0\u6548\uFF0C\u5DF2\u505C\u6B62\u540C\u6B65\u3002");
  return value;
}
function apiArray(value, read) {
  if (!Array.isArray(value)) throw new Error("GitHub \u6587\u4EF6\u6E05\u5355\u65E0\u6548\uFF0C\u5DF2\u505C\u6B62\u540C\u6B65\uFF1B\u4E0D\u4F1A\u63A8\u65AD\u5220\u9664\u3002");
  return value.map(read);
}
function readSha(value) {
  return { sha: apiString(apiObject(value).sha) };
}
function readRepo(value) {
  const repo = apiObject(value);
  return {
    default_branch: repo.default_branch === void 0 || repo.default_branch === "" ? "" : apiString(repo.default_branch),
    private: repo.private === void 0 ? false : apiBoolean(repo.private),
    archived: repo.archived === void 0 ? false : apiBoolean(repo.archived),
    disabled: repo.disabled === void 0 ? false : apiBoolean(repo.disabled),
    clone_url: repo.clone_url === void 0 ? "" : apiString(repo.clone_url),
    permissions: repo.permissions === void 0 ? void 0 : { push: apiBoolean(apiObject(repo.permissions).push) }
  };
}
function readCommit(value) {
  const commit = apiObject(value);
  return { sha: apiString(commit.sha), commit: { tree: readSha(apiObject(commit.commit).tree) } };
}
function readTree(value) {
  const tree = apiObject(value);
  return { truncated: apiBoolean(tree.truncated), tree: apiArray(tree.tree, (value2) => {
    const entry = apiObject(value2);
    const type = apiString(entry.type);
    if (!["blob", "tree", "commit"].includes(type)) throw new Error("GitHub \u76EE\u5F55\u6761\u76EE\u7C7B\u578B\u672A\u77E5\uFF0C\u5DF2\u505C\u6B62\u540C\u6B65\uFF1B\u4E0D\u4F1A\u63A8\u65AD\u5220\u9664\u3002");
    return { path: safePath(apiString(entry.path)), sha: apiString(entry.sha), mode: apiString(entry.mode), type };
  }) };
}
function readCompare(value) {
  const compare = apiObject(value);
  return { status: apiString(compare.status), files: compare.files === void 0 ? [] : apiArray(compare.files, (value2) => {
    const file = apiObject(value2);
    return {
      status: apiString(file.status),
      filename: apiString(file.filename),
      previous_filename: file.status === "renamed" ? apiString(file.previous_filename) : ""
    };
  }) };
}

// src/mobileUi.ts
var import_obsidian4 = require("obsidian");
function mobileConflictFile(c) {
  const single = c.kind === "unpaired" || c.kind === "delete";
  const duplicate = c.kind === "duplicate";
  const localPaths = c.localFiles?.map((s) => s.path) ?? (c.local ? [c.local.path] : void 0);
  const remotePaths = c.remoteFiles?.map((s) => s.path) ?? (c.remote ? [c.remote.path] : void 0);
  const differentPaths = !!localPaths && !!remotePaths && JSON.stringify(localPaths) !== JSON.stringify(remotePaths);
  const description = single ? c.local ? "\u6587\u4EF6\u4EC5\u5B58\u5728\u4E8E\u672C\u673A" : "\u6587\u4EF6\u4EC5\u5B58\u5728\u4E8E\u4E91\u7AEF" : duplicate ? "\u6587\u4EF6\u5185\u5BB9\u76F8\u540C\uFF0C\u8DEF\u5F84\u4E0D\u540C" : differentPaths ? sameContent(c.local, c.remote) ? "\u6587\u4EF6\u8DEF\u5F84\u4E0D\u540C" : "\u6587\u4EF6\u5185\u5BB9\u53CA\u8DEF\u5F84\u4E0D\u540C" : "\u6587\u4EF6\u5185\u5BB9\u4E0D\u540C";
  return {
    path: c.id,
    label: c.label,
    description,
    localPaths,
    remotePaths,
    localChoiceLabel: single ? c.local ? "\u4E0A\u4F20\u6587\u4EF6" : "\u5220\u9664\u6587\u4EF6" : duplicate ? "\u91C7\u7528\u672C\u673A\u8DEF\u5F84" : "\u91C7\u7528\u672C\u673A",
    remoteChoiceLabel: single ? c.remote ? "\u4E0B\u8F7D\u6587\u4EF6" : "\u5220\u9664\u6587\u4EF6" : duplicate ? "\u91C7\u7528\u4E91\u7AEF\u8DEF\u5F84" : "\u91C7\u7528\u4E91\u7AEF",
    reviewStage: single || duplicate || differentPaths && sameContent(c.local, c.remote) ? "file" : "content",
    keepSide: single ? c.local ? "local" : "remote" : void 0,
    showPaths: differentPaths,
    missingLabel: single ? "\u6587\u4EF6\u4E0D\u5B58\u5728" : void 0,
    allowBoth: duplicate,
    mergeable: c.kind === "content" || c.kind === "initial",
    totalLines: 0,
    localUpdatedAt: "",
    remoteUpdatedAt: "",
    blocks: []
  };
}
var MobileSyncModal = class {
  constructor(app, engine, plan, auto = false, review) {
    this.app = app;
    this.engine = engine;
    this.plan = plan;
    this.auto = auto;
    this.review = review;
    this.choices = {};
  }
  async wait() {
    if (this.plan.conflicts.length && !await this.reviewDifferences()) return false;
    await this.engine.execute(this.plan);
    if (this.engine.requiresPluginReload(this.plan)) new import_obsidian4.Notice("Simple Link \u7A0B\u5E8F\u6587\u4EF6\u5DF2\u66F4\u65B0\uFF0C\u8BF7\u91CD\u65B0\u52A0\u8F7D\u63D2\u4EF6\u6216\u91CD\u542F Obsidian \u4F7F\u65B0\u4EE3\u7801\u751F\u6548\u3002", 12e3);
    return true;
  }
  async reviewDifferences() {
    const conflicts = new Map(this.plan.conflicts.map((c) => [c.id, c]));
    const live = {
      files: this.plan.conflicts.map(mobileConflictFile),
      read: async (file) => {
        const c = conflicts.get(file.path);
        if (c.kind === "duplicate") return { local: "", remote: "" };
        const [local, remote] = await Promise.all([
          c.local ? this.engine.reviewText(c.local) : "",
          c.remote ? this.engine.reviewText(c.remote) : ""
        ]);
        return { local, remote };
      }
    };
    const selected = this.review ? await this.review(live) : await new ZoeySyncConflictPreviewModal(this.app, live).wait();
    if (!selected) return false;
    this.choices = { ...this.plan.pendingChoices, ...selected };
    const next = await this.engine.preview(this.choices);
    if (next.remote.commit !== this.plan.remote.commit || next.revision !== this.plan.revision || JSON.stringify(next.local) !== JSON.stringify(this.plan.local)) {
      throw new Error("\u9009\u62E9\u671F\u95F4\u4E24\u7AEF\u72B6\u6001\u53D1\u751F\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u540C\u6B65\u5E76\u9009\u62E9\u3002");
    }
    if (next.conflicts.length) throw new Error("\u4ECD\u6709\u672A\u5904\u7406\u7684\u5DEE\u5F02\uFF0C\u8BF7\u91CD\u65B0\u540C\u6B65\u5E76\u5B8C\u6210\u9009\u62E9\u3002");
    this.plan = next;
    return true;
  }
};
function mobileCheckbox(root, name, description, checked, change, leading = false) {
  const setting = new import_obsidian4.Setting(root).setName(name).setDesc(description);
  const input = setting.controlEl.createEl("input", { cls: "simple-link-mobile-checkbox", attr: { type: "checkbox", "aria-label": name } });
  input.checked = checked;
  if (leading) {
    setting.settingEl.addClass("simple-link-cloud-plugin-row");
    setting.settingEl.insertBefore(setting.controlEl, setting.infoEl);
    input.id = `simple-link-plugin-${crypto.randomUUID()}`;
    setting.nameEl.empty();
    setting.nameEl.createEl("label", { text: name, attr: { for: input.id } });
  }
  input.addEventListener("change", () => {
    input.disabled = true;
    void Promise.resolve().then(() => change(input.checked)).catch((error) => {
      input.checked = !input.checked;
      new import_obsidian4.Notice(error instanceof Error ? error.message : String(error));
    }).finally(() => {
      input.disabled = false;
    });
  });
  return setting;
}
function renderMobileSyncRules(root, options, save, loadPlugins, currentPluginId = "simple-link") {
  root = root.createDiv({ cls: "simple-link-sync-rules" });
  const image = mobileCheckbox(
    root,
    "\u540C\u6B65\u56FE\u7247",
    "\u614E\u5173\uFF1A\u5173\u95ED\u540E\u6240\u6709\u56FE\u7247\u5747\u4E0D\u53C2\u4E0E\u540C\u6B65\uFF0C\u7B14\u8BB0\u53EF\u80FD\u51FA\u73B0\u7F3A\u56FE\uFF0C\u5176\u4ED6\u8BBE\u5907\u7684\u65B0\u56FE\u7247\u4E5F\u4E0D\u4F1A\u4E0B\u8F7D\u5230\u672C\u673A\u3002",
    options.syncImages,
    async (value) => {
      options.syncImages = value;
      await save();
    }
  );
  image.descEl.addClass("simple-link-mobile-warning");
  const pluginRule = root.createDiv({ cls: "simple-link-plugin-rule" });
  mobileCheckbox(
    pluginRule,
    "\u540C\u6B65\u63D2\u4EF6\u53CA\u914D\u7F6E",
    "\u52FE\u9009\u540E\u8BFB\u53D6\u4E91\u7AEF\u63D2\u4EF6\u5217\u8868\uFF0C\u518D\u9010\u4E2A\u9009\u62E9\u9700\u8981\u540C\u6B65\u7684\u63D2\u4EF6\uFF1B\u672C\u673A\u51ED\u636E\u4E0E\u8FD0\u884C\u72B6\u6001\u4E0D\u53C2\u4E0E\u540C\u6B65\u3002",
    options.syncPlugins,
    async (value) => {
      const previous = options.syncPlugins;
      options.syncPlugins = value;
      try {
        await save();
      } catch (error) {
        options.syncPlugins = previous;
        throw error;
      }
      void showPlugins();
    }
  ).settingEl.addClass("simple-link-plugin-rule-toggle");
  const panel = pluginRule.createDiv({ cls: "simple-link-cloud-plugins" });
  panel.hidden = !options.syncPlugins;
  panel.createEl("h4", { text: "\u4E91\u7AEF\u63D2\u4EF6" });
  panel.createEl("p", { text: "\u8BFB\u53D6\u5F53\u524D\u4E91\u7AEF\u4ED3\u5E93\u4E0E\u5206\u652F\u7684\u63D2\u4EF6\u6E05\u5355\uFF0C\u52FE\u9009\u9700\u8981\u540C\u6B65\u7684\u63D2\u4EF6\uFF1B\u672C\u673A\u5C1A\u672A\u5B89\u88C5\u7684\u63D2\u4EF6\u4E5F\u53EF\u9009\u62E9\u3002" });
  const status = panel.createEl("p", { cls: "zoey-sync-setup-feedback", attr: { role: "status", "aria-live": "polite" } });
  const list = panel.createDiv();
  const refresh = panel.createEl("button", { text: "\u91CD\u65B0\u83B7\u53D6\u4E91\u7AEF\u63D2\u4EF6", cls: "simple-link-cloud-plugins-refresh", attr: { type: "button" } });
  let loadedKey = "";
  let request = 0;
  const key = () => JSON.stringify([options.repoUrl, options.branch, options.token]);
  const showPlugins = async (force = false) => {
    panel.hidden = !options.syncPlugins;
    if (panel.hidden || !force && loadedKey === key()) return;
    const current = ++request;
    const sourceKey = key();
    refresh.disabled = true;
    list.empty();
    status.removeClass("zoey-sync-setup-error");
    status.setText("\u6B63\u5728\u8BFB\u53D6\u4E91\u7AEF\u63D2\u4EF6\u6E05\u5355\u2026");
    try {
      const plugins = [...new Set(await loadPlugins())].sort();
      if (!panel.isConnected || current !== request || sourceKey !== key()) return;
      loadedKey = sourceKey;
      status.setText(plugins.length ? `\u4E91\u7AEF\u68C0\u6D4B\u5230 ${plugins.length} \u4E2A\u63D2\u4EF6\uFF0C\u8BF7\u9010\u4E2A\u52FE\u9009\u3002` : "\u5F53\u524D\u4E91\u7AEF\u4ED3\u5E93\u6CA1\u6709\u53EF\u540C\u6B65\u7684\u63D2\u4EF6\u3002");
      for (const id of plugins) {
        mobileCheckbox(list, id, id === currentPluginId ? "\u4F1A\u6392\u9664\u672C\u673A\u6240\u6709\u72B6\u6001\u6587\u4EF6\uFF0C\u4EC5\u540C\u6B65\u7A0B\u5E8F\u6587\u4EF6\uFF1B\u7A0B\u5E8F\u66F4\u65B0\u540E\u9700\u91CD\u8F7D\u63D2\u4EF6\u3002" : "", options.plugins.includes(id), async (checked) => {
          const previous = options.plugins;
          options.plugins = checked ? [.../* @__PURE__ */ new Set([...options.plugins, id])] : options.plugins.filter((item) => item !== id);
          try {
            await save();
          } catch (error) {
            options.plugins = previous;
            throw error;
          }
        }, true);
      }
    } catch (error) {
      if (current === request && panel.isConnected) {
        status.addClass("zoey-sync-setup-error");
        status.setText(`\u8BFB\u53D6\u4E91\u7AEF\u63D2\u4EF6\u5931\u8D25\uFF1A${error instanceof Error ? error.message : String(error)}\u3002\u8BF7\u91CD\u8BD5\u3002`);
      }
    } finally {
      if (current === request) refresh.disabled = false;
    }
  };
  refresh.addEventListener("click", () => void showPlugins(true));
  void showPlugins();
  mobileCheckbox(
    root,
    "\u5F00\u542F\u54C8\u5E0C\u7F13\u5B58",
    "\u4EC5\u5728\u540C\u6B65\u6D41\u7A0B\u4E2D\u6821\u9A8C\u5E76\u66F4\u65B0\u7F13\u5B58\uFF1B\u5931\u8D25\u91CD\u8BD5\u53EF\u590D\u7528\uFF0C\u57FA\u51C6\u4EC5\u5728\u540C\u6B65\u5B8C\u6210\u540E\u66F4\u65B0\u3002\u5173\u95ED\u540E\u6BCF\u6B21\u540C\u6B65\u91CD\u65B0\u8BA1\u7B97\u3002",
    options.cacheEnabled,
    async (value) => {
      options.cacheEnabled = value;
      await save();
    }
  );
  mobileCheckbox(
    root,
    "\u5F00\u542F\u8DEF\u5F84\u8FFD\u8E2A",
    "\u8BB0\u5F55\u6587\u4EF6\u6539\u540D\u548C\u79FB\u52A8\uFF0C\u5173\u8054\u79FB\u52A8\u540E\u4FEE\u6539\u7684\u5185\u5BB9\u3002",
    options.trackPaths,
    async (value) => {
      options.trackPaths = value;
      await save();
    }
  );
}
function renderMobileSettings(root, host, guide = false, rerender) {
  const options = host.options;
  if (guide) root.createEl("h3", { text: "\u914D\u7F6E GitHub \u8F7B\u91CF\u540C\u6B65" });
  if (guide && !import_obsidian4.Platform.isMobile) root.createEl("p", { text: "\u7535\u8111\u53EF\u542F\u7528\u8F7B\u91CF\u540C\u6B65\u8FD0\u884C\u76F8\u540C\u6D41\u7A0B\uFF1B\u6B64\u6A21\u5F0F\u4F1A\u5B9E\u9645\u8BFB\u5199\u4ED3\u5E93\uFF0C\u786E\u8BA4\u9884\u89C8\u540E\u624D\u6267\u884C\u540C\u6B65\u3002" });
  if (guide) {
    const steps = root.createEl("ol");
    steps.createEl("li", { text: "\u5728\u624B\u673A\u5B89\u88C5\u5E76\u542F\u7528 Simple Link\uFF0C\u9009\u62E9 GitHub API \u6A21\u5F0F\u3002" });
    steps.createEl("li", { text: "\u586B\u5199\u4ED3\u5E93 HTTPS \u5730\u5740\u53CA token\u3002token \u9700\u6388\u4E88\u76EE\u6807\u4ED3\u5E93 contents \u8BFB\u5199\u6743\u9650\u3002" });
    steps.createEl("li", { text: "\u6838\u9A8C\u4ED3\u5E93\uFF0C\u7136\u540E\u786E\u8BA4\u56FE\u7247\u3001\u63D2\u4EF6\u3001\u7F13\u5B58\u548C\u8DEF\u5F84\u8FFD\u8E2A\u9009\u9879\u3002" });
    steps.createEl("li", { text: "\u7ED1\u5B9A\u540E\u624B\u52A8\u540C\u6B65\uFF0C\u68C0\u67E5\u9996\u6B21\u9884\u89C8\u548C\u540C\u540D\u51B2\u7A81\u3002\u9996\u6B21\u7F3A\u5931\u6587\u4EF6\u4E0D\u4F1A\u88AB\u5F53\u6210\u5220\u9664\u3002" });
  }
  const persist = async () => {
    await host.save();
    host.restart();
  };
  if (options.mode === "server") {
    root.createEl("p", { text: "\u670D\u52A1\u5668\u5730\u5740\u548C\u5BC6\u7801\u5728\u4E0B\u65B9\u539F\u670D\u52A1\u5668\u8BBE\u7F6E\u4E2D\u586B\u5199\u3002" });
    return;
  }
  root.createEl("h3", { text: "\u8D26\u6237\u8BBE\u7F6E" });
  const account = root.createDiv({ cls: "simple-link-lightweight-account" });
  const engine = host.engine();
  const quota = new import_obsidian4.Setting(account).setName("GitHub API \u5269\u4F59\u989D\u5EA6");
  const updateQuota = (remaining) => {
    quota.setDesc(remaining === null ? "\u5C1A\u672A\u83B7\u53D6\uFF1B\u4E0E GitHub \u4EA4\u4E92\u540E\u81EA\u52A8\u66F4\u65B0\u3002" : `\u5269\u4F59 ${remaining.toLocaleString()} \u6B21\u8BF7\u6C42\uFF08\u6700\u8FD1\u4E00\u6B21 GitHub \u54CD\u5E94\uFF09\u3002`);
  };
  updateQuota(engine.remaining);
  const unsubscribe = engine.onRemainingChange(updateQuota);
  const quotaObserver = new MutationObserver(() => {
    if (!quota.settingEl.isConnected) {
      unsubscribe();
      quotaObserver.disconnect();
    }
  });
  quotaObserver.observe(root.ownerDocument.body, { childList: true, subtree: true });
  new import_obsidian4.Setting(account).setName("GitHub token").setDesc("\u53EA\u4FDD\u5B58\u5728\u672C\u673A\u63D2\u4EF6\u6570\u636E\u4E2D\uFF0C\u4E0D\u5199\u5165\u5171\u4EAB\u914D\u7F6E\u3002").addText((text) => {
    text.inputEl.type = "password";
    text.setValue(options.token).onChange(async (value) => {
      options.token = value.trim();
      engine.resetRemaining();
      await host.save();
    });
  }).settingEl.addClass("simple-link-lightweight-account-input");
  new import_obsidian4.Setting(account).setName("\u4ED3\u5E93\u5730\u5740").addText((text) => text.setPlaceholder("https://github.com/\u7528\u6237\u540D/\u4ED3\u5E93.git").setValue(options.repoUrl).onChange(async (value) => {
    options.repoUrl = value.trim();
    options.bound = false;
    await host.save();
  })).settingEl.addClass("simple-link-lightweight-account-input");
  root.querySelector('input[placeholder="https://github.com/\u7528\u6237\u540D/\u4ED3\u5E93.git"]')?.setAttribute("data-lightweight-repo", "");
  new import_obsidian4.Setting(account).setName("\u5206\u652F").setDesc("\u7559\u7A7A\u4F7F\u7528\u4ED3\u5E93\u9ED8\u8BA4\u5206\u652F\uFF1B\u4E0D\u81EA\u52A8\u521B\u5EFA\u6216\u91CD\u7F6E\u4ED3\u5E93\u3002").addText((text) => text.setValue(options.branch).onChange(async (value) => {
    options.branch = value.trim();
    options.bound = false;
    await host.save();
  }));
  new import_obsidian4.Setting(account).setName("\u5B8C\u6574\u54C8\u5E0C\u6821\u9A8C").setDesc("\u53EA\u91CD\u65B0\u6838\u5BF9\u540C\u6B65\u8303\u56F4\u5185\u7684\u6587\u4EF6\uFF0C\u4E0D\u63A8\u8FDB\u5171\u540C\u57FA\u51C6\u3001\u4E0D\u4E0A\u4F20\u3002").addButton((button) => button.setButtonText("\u91CD\u65B0\u6821\u9A8C\u5168\u90E8\u540C\u6B65\u6587\u4EF6").setDisabled(!host.active()).onClick(() => void host.calibrate()));
  const status = account.createEl("p", { cls: "zoey-sync-setup-feedback", attr: { role: "status", "aria-live": "polite" } });
  status.hidden = true;
  const report = (message, error = false) => {
    status.hidden = false;
    status.setText(message);
    status.toggleClass("zoey-sync-setup-error", error);
  };
  new import_obsidian4.Setting(account).setName("\u6838\u9A8C\u4ED3\u5E93\u4E0E token").setDesc("\u53EA\u8BFB\u53D6\u6307\u5B9A\u4ED3\u5E93\u4FE1\u606F\u548C\u6587\u4EF6\u6811\uFF0C\u4E0D\u5217\u51FA\u8D26\u53F7\u5168\u90E8\u4ED3\u5E93\uFF0C\u4E0D\u4E0B\u8F7D\u6B63\u6587\u3002").addButton((button) => button.setButtonText("\u68C0\u67E5").setDisabled(!host.active()).onClick(async () => {
    button.setDisabled(true);
    report("\u6B63\u5728\u68C0\u67E5 Token \u4E0E\u4ED3\u5E93\u2026");
    try {
      const remote = await host.engine().verify();
      options.branch = remote.branch;
      await host.save();
      report(`\u5DF2\u6838\u9A8C\u5206\u652F ${remote.branch}\uFF0C\u5F53\u524D\u8303\u56F4 ${Object.keys(remote.files).length} \u4E2A\u4E91\u7AEF\u6587\u4EF6\u3002`);
    } catch (error) {
      report(error instanceof Error ? error.message : String(error), true);
    } finally {
      button.setDisabled(false);
    }
  }));
  root.createEl("h3", { text: "\u540C\u6B65\u8BBE\u7F6E" });
  new import_obsidian4.Setting(root).setName("\u81EA\u52A8\u540C\u6B65\u95F4\u9694\uFF08\u5206\u949F\uFF09").setDesc("\u9ED8\u8BA4 0\uFF0C\u4EC5\u624B\u52A8\u540C\u6B65\uFF1B\u81EA\u52A8\u540C\u6B65\u53D1\u73B0\u51B2\u7A81\u6216\u5220\u9664\u65F6\u7B49\u5F85\u624B\u52A8\u9884\u89C8\u3002").addText((text) => text.setValue(String(options.autoSyncMinutes)).onChange(async (value) => {
    const minutes = Number(value);
    if (!Number.isFinite(minutes) || minutes < 0) return;
    options.autoSyncMinutes = minutes;
    await persist();
  }));
  root.createEl("h3", { text: "\u57FA\u7840\u89C4\u5219" });
  renderMobileSyncRules(root, options, persist, () => host.engine().listCloudPlugins());
  new import_obsidian4.Setting(root).setName("\u672C\u673A\u989D\u5916\u5FFD\u7565\u89C4\u5219").setDesc("\u6BCF\u884C\u4E00\u4E2A\u76EE\u5F55\u6216\u901A\u914D\u7B26\uFF0C\u4F8B\u5982 \u79C1\u4EBA\u76EE\u5F55/\u3002\u4E0D\u6539\u4E91\u7AEF .gitignore\uFF0C\u6392\u9664\u9879\u4E0D\u4F1A\u88AB\u5F53\u6210\u5220\u9664\u3002").addTextArea((text) => text.setValue(options.ignorePatterns.join("\n")).onChange(async (value) => {
    options.ignorePatterns = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    await persist();
  }));
  if (guide) root.createEl("h3", { text: "3 \xB7 link diff \u7F13\u5B58\u4E0E\u8DEF\u5F84" });
}

// src/main.ts
var SyncDeferredError = class extends Error {
};
var DEFAULT_GIT_AUTHOR_NAME = "default";
var DEFAULT_GIT_AUTHOR_EMAIL = "default@default.com";
var CHECKBOX_CHECKED_ICON = "zoey-sync-square-check-contained";
var LAYOUT_SWITCH_ICON = "zoey-sync-layout-panels";
var REFRESH_CHANGES_ICON = "zoey-sync-refresh-changes";
(0, import_obsidian5.addIcon)(
  CHECKBOX_CHECKED_ICON,
  '<g fill="none" stroke="currentColor" stroke-width="8.333" stroke-linecap="round" stroke-linejoin="round"><rect x="12.5" y="12.5" width="75" height="75" rx="8.333"/><path d="m29.167 50.417 13.333 13.333 29.167-30"/></g>'
);
(0, import_obsidian5.addIcon)(
  LAYOUT_SWITCH_ICON,
  '<g fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"><rect x="12" y="15" width="76" height="70" rx="8"/><path d="M42 15v70M42 43h46"/></g>'
);
(0, import_obsidian5.addIcon)(
  REFRESH_CHANGES_ICON,
  '<g fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"><path d="M30 16H20a6 6 0 0 0-6 6v10M70 16h10a6 6 0 0 1 6 6v10M30 84H20a6 6 0 0 1-6-6V68M70 84h10a6 6 0 0 0 6-6V68"/><path d="M34 36h32M34 50h22M34 64h32"/></g>'
);
var DEFAULT_SETTINGS = {
  enabled: true,
  boundRepoUrl: "",
  mobile: { ...DEFAULT_MOBILE_OPTIONS, plugins: [], ignorePatterns: [] },
  desktopGitEnabled: true,
  desktopLightweightEnabled: false,
  mobileSyncEnabled: true,
  viewLayout: "list",
  showVersionViewSwitcher: false,
  changeViewMode: "upload",
  lastSyncAt: 0,
  lastPullAt: 0,
  serverUrl: "",
  serverPassword: "",
  deviceId: "",
  deviceName: "",
  baseVersion: 0,
  dirty: [],
  inFlight: [],
  pendingRequestId: "",
  ignorePatterns: [],
  mobileAutoSyncMinutes: 10,
  commandPollSeconds: 60,
  gitRemoteUrl: "",
  gitBranch: "master",
  gitAuthorName: DEFAULT_GIT_AUTHOR_NAME,
  gitAuthorEmail: DEFAULT_GIT_AUTHOR_EMAIL,
  setupComplete: false,
  setupFlowVersion: 2,
  setupStep: 1,
  setupRepoUrl: "",
  setupMutationStarted: false,
  viewRefreshDelaySeconds: 7,
  autoCommitIdleMinutes: 5,
  autoPushIdleMinutes: 30,
  maxUncommittedMinutes: 30,
  maxUnpushedMinutes: 60,
  pullOnStartup: true,
  autoPullIntervalMinutes: 5,
  pendingMergePushAfterResolve: false,
  errorLogs: []
};
var SHARED_SETTING_KEYS = /* @__PURE__ */ new Set([
  "boundRepoUrl",
  "enabled",
  "viewLayout",
  "showVersionViewSwitcher",
  "serverUrl",
  "ignorePatterns",
  "mobileAutoSyncMinutes",
  "commandPollSeconds",
  "gitRemoteUrl",
  "gitBranch",
  "gitAuthorName",
  "gitAuthorEmail",
  "viewRefreshDelaySeconds",
  "autoCommitIdleMinutes",
  "autoPushIdleMinutes",
  "maxUncommittedMinutes",
  "maxUnpushedMinutes",
  "pullOnStartup",
  "autoPullIntervalMinutes"
]);
function pickLocalSettings(source) {
  const result = {};
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (!SHARED_SETTING_KEYS.has(key) && source[key] !== void 0) {
      result[key] = source[key];
    }
  }
  for (const key of ["setupVerified", "setupBackup"]) {
    if (source[key] !== void 0) result[key] = source[key];
  }
  return result;
}
function pickSharedSettings(source) {
  const result = {};
  for (const key of SHARED_SETTING_KEYS) {
    if (source[key] !== void 0) result[key] = source[key];
  }
  return result;
}
var ERROR_LOG_RETENTION_MS = 24 * 60 * 60 * 1e3;
var MAX_ERROR_LOGS = 500;
var DESKTOP_RETRY_DELAY_MS = 5 * 60 * 1e3;
var DESKTOP_STARTUP_NETWORK_RETRY_DELAY_MS = 5 * 1e3;
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 32768;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, Math.min(index + chunkSize, bytes.length)));
  }
  return btoa(binary);
}
function base64ToArrayBuffer(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}
function messageOf2(error) {
  return error instanceof Error ? error.message : String(error);
}
function formatRelativeTime(timestamp) {
  const elapsed = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(elapsed / 6e4);
  if (minutes < 1) return "\u521A\u521A";
  if (minutes < 60) return `${minutes} \u5206\u949F\u524D`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} \u5C0F\u65F6\u524D`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} \u5929\u524D`;
  return new Date(timestamp).toLocaleString();
}
function formatStatusError(message) {
  const compact = message.replace(/\s+/g, " ").trim();
  if (!compact) return "\u672A\u77E5\u9519\u8BEF";
  return compact.length > 160 ? `${compact.slice(0, 157)}\u2026` : compact;
}
var ZoeySyncPlugin = class extends import_obsidian5.Plugin {
  constructor() {
    super(...arguments);
    this.settings = { ...DEFAULT_SETTINGS };
    this.syncing = false;
    this.featureActive = false;
    this.suppressPaths = /* @__PURE__ */ new Set();
    this.featureEvents = [];
    this.featureIntervals = [];
    this.firstUncommittedAt = 0;
    this.firstUnpushedAt = 0;
    this.lastFileChangeAt = 0;
    this.automaticPushQueued = false;
    this.startupPullScheduled = false;
    this.desktopGitQueue = Promise.resolve();
    this.desktopGitTrace = [];
    this.sharedSettingsWritable = true;
    this.deferredMergePaths = [];
    this.setupChoices = {};
    this.switchingSyncMode = false;
  }
  getSetupActivity() {
    return this.setupActivity;
  }
  setSetupActivity(text, tone) {
    this.setupActivity = { text, tone };
    this.setStatus(text);
    for (const leaf of this.app.workspace.getLeavesOfType(ZoeySyncView.type)) {
      if (leaf.view instanceof ZoeySyncView) leaf.view.updateActivity(this.setupActivity);
    }
  }
  async onload() {
    await this.migrateLegacyLocalSettings();
    await this.loadSettings();
    if (this.useLightweightSync()) await this.getMobileGithub().load();
    if (!import_obsidian5.Platform.isMobile) await this.detectDesktopGitDefaults();
    this.statusEl = this.addStatusBarItem();
    this.registerView(ZoeySyncView.type, (leaf) => new ZoeySyncView(leaf, this));
    this.registerView(ZoeySyncConflictView.type, (leaf) => new ZoeySyncConflictView(leaf, this));
    this.addSettingTab(new ZoeySyncSettingTab(this.app, this));
    this.addCommand({ id: "sync-now", name: "\u540C\u6B65\u7B14\u8BB0", callback: () => void this.syncNow(true) });
    this.addCommand({ id: "test-connection", name: "\u6D4B\u8BD5\u540C\u6B65\u8FDE\u63A5", callback: () => void this.testConnection(true) });
    this.addCommand({ id: "recalibrate-mobile-hashes", name: "\u91CD\u65B0\u6821\u9A8C\u8F7B\u91CF\u540C\u6B65\u8303\u56F4\u54C8\u5E0C", callback: () => void this.calibrateMobileHashes() });
    this.addCommand({ id: "open-sync-view", name: "\u6253\u5F00\u540C\u6B65\u9762\u677F", callback: () => void this.openSyncView() });
    this.addCommand({ id: "preview-conflict-ui", name: "\u9884\u89C8\u51B2\u7A81\u754C\u9762", callback: () => void this.openConflictPreview() });
    if (this.settings.enabled) {
      this.activateFeature();
      if (!import_obsidian5.Platform.isMobile) {
        this.app.workspace.onLayoutReady(() => void this.openSyncView());
      }
    } else if (this.statusEl) this.statusEl.addClass("simple-link-hidden");
  }
  onunload() {
    this.deactivateFeature();
  }
  async setFeatureEnabled(enabled) {
    this.settings.enabled = enabled;
    await this.saveSettings();
    if (enabled) {
      this.activateFeature();
      await this.openSyncView();
    } else {
      this.deactivateFeature();
    }
  }
  useLightweightSync() {
    return import_obsidian5.Platform.isMobile ? this.settings.mobileSyncEnabled : this.settings.desktopLightweightEnabled;
  }
  nativeGitEnabled() {
    return !import_obsidian5.Platform.isMobile && this.settings.desktopGitEnabled && !this.settings.desktopLightweightEnabled;
  }
  async setLightweightSyncEnabled(enabled) {
    if (!import_obsidian5.Platform.isMobile) {
      await this.setDesktopSyncMode(enabled ? "lightweight" : "off");
      return;
    }
    if (this.syncing || this.switchingSyncMode) {
      new import_obsidian5.Notice("\u8BF7\u7B49\u5F85\u5F53\u524D\u540C\u6B65\u5B8C\u6210\u3002");
      return;
    }
    if (enabled) await this.getMobileGithub().load();
    this.deactivateFeature();
    this.settings.mobileSyncEnabled = enabled;
    if (enabled) {
      this.settings.mobile.mode = "github";
      this.settings.desktopGitEnabled = false;
      this.settings.desktopLightweightEnabled = false;
    }
    await this.saveSettings();
    if (this.settings.enabled) this.activateFeature();
  }
  async setDesktopSyncMode(mode) {
    if (import_obsidian5.Platform.isMobile) return;
    if (this.syncing || this.switchingSyncMode) {
      new import_obsidian5.Notice("\u8BF7\u7B49\u5F85\u5F53\u524D\u540C\u6B65\u6216\u6A21\u5F0F\u5207\u6362\u5B8C\u6210\u3002");
      return;
    }
    if (mode === "lightweight") await this.getMobileGithub().load();
    this.switchingSyncMode = true;
    try {
      this.deactivateFeature();
      this.settings.desktopGitEnabled = false;
      this.settings.desktopLightweightEnabled = false;
      await this.desktopGitQueue;
      if (mode === "lightweight") {
        await this.getMobileGithub().load();
        this.settings.mobile.mode = "github";
        this.settings.desktopLightweightEnabled = true;
      } else {
        this.settings.desktopGitEnabled = mode === "git";
        if (mode === "git") this.settings.mobile.mode = "github";
      }
      this.startupPullScheduled = false;
      await this.saveSettings();
      if (this.settings.enabled) this.activateFeature();
    } finally {
      this.switchingSyncMode = false;
    }
  }
  getMobileGithub() {
    if (!this.mobileGithub) this.mobileGithub = new MobileGithub(
      this.app.vault.adapter,
      this.app.vault.configDir,
      this.manifest.id,
      () => this.settings.mobile,
      (message) => this.setStatus(message)
    );
    return this.mobileGithub;
  }
  async completeLightweightGuide(options) {
    if (this.syncing || this.switchingSyncMode) throw new Error("\u8BF7\u7B49\u5F85\u5F53\u524D\u540C\u6B65\u6216\u6A21\u5F0F\u5207\u6362\u5B8C\u6210\u540E\u91CD\u8BD5\u3002");
    this.switchingSyncMode = true;
    this.syncing = true;
    this.deactivateFeature();
    const previous = {
      mobile: this.settings.mobile,
      boundRepoUrl: this.settings.boundRepoUrl,
      desktopGitEnabled: this.settings.desktopGitEnabled,
      desktopLightweightEnabled: this.settings.desktopLightweightEnabled,
      mobileSyncEnabled: this.settings.mobileSyncEnabled
    };
    let bound = false;
    try {
      await this.desktopGitQueue;
      const engine = this.getMobileGithub();
      await engine.load();
      this.settings.mobile = { ...options, plugins: [...options.plugins], ignorePatterns: [...options.ignorePatterns], mode: "github", bound: false };
      const verified = await engine.verifyAccess();
      const remote = await engine.bind(verified);
      bound = true;
      this.settings.mobile.branch = remote.branch;
      this.settings.mobile.bound = true;
      this.settings.boundRepoUrl = this.settings.mobile.repoUrl;
      this.settings.desktopGitEnabled = false;
      this.settings.desktopLightweightEnabled = !import_obsidian5.Platform.isMobile;
      this.settings.mobileSyncEnabled = import_obsidian5.Platform.isMobile;
      this.settings.enabled = true;
      await this.saveSettings();
      await this.mobileHost().save();
      this.activateFeature();
      this.setStatus("\u6B63\u5728\u68C0\u67E5\u9996\u6B21\u540C\u6B65\u5DEE\u5F02\u2026");
      const plan = await engine.preview();
      if (!await new MobileSyncModal(this.app, engine, plan, false, (live) => this.reviewLightweightDifferences(live)).wait()) {
        this.setStatus("\u9996\u6B21\u540C\u6B65\u672A\u5B8C\u6210\uFF0C\u8BF7\u7EE7\u7EED\u63A5\u5165\u6216\u624B\u52A8\u540C\u6B65");
        throw new Error("\u5DF2\u4FDD\u5B58\u8FDE\u63A5\uFF0C\u4F46\u540C\u6B65\u5DF2\u53D6\u6D88\uFF0C\u63A5\u5165\u5C1A\u672A\u5B8C\u6210\uFF1B\u8BF7\u91CD\u8BD5\u5E76\u786E\u8BA4\u540C\u6B65\u4EE5\u5EFA\u7ACB\u5171\u540C\u57FA\u7EBF\u3002");
      }
      if (!engine.state.baseCommitSha) throw new Error("\u540C\u6B65\u672A\u5EFA\u7ACB\u5171\u540C\u57FA\u7EBF\uFF0C\u8BF7\u91CD\u65B0\u9884\u89C8\u540C\u6B65\u3002");
      this.settings.lastSyncAt = Date.now();
      await this.saveSettings();
      this.setStatus("GitHub API \xB7 \u4E24\u7AEF\u5DF2\u5BF9\u9F50");
      await this.recordSuccess("\u8F7B\u91CF\u9996\u6B21\u540C\u6B65", "\u5DF2\u5B8C\u6210\u540C\u6B65\uFF0C\u4FDD\u5B58\u5171\u540C\u57FA\u7EBF\u4E0E\u672C\u5730\u54C8\u5E0C\u7F13\u5B58\u3002");
    } catch (error) {
      if (!bound) Object.assign(this.settings, previous);
      throw error;
    } finally {
      this.syncing = false;
      this.switchingSyncMode = false;
      if (this.settings.enabled) this.activateFeature();
    }
  }
  restartMobileAutomation() {
    if (!this.useLightweightSync() || !this.featureActive) return;
    for (const interval of this.featureIntervals) window.clearInterval(interval);
    this.featureIntervals = [];
    const options = this.settings.mobile;
    if (options.mode === "server") {
      this.addFeatureInterval(window.setInterval(() => void this.pollCommands(), Math.max(15, this.settings.commandPollSeconds) * 1e3));
      if (this.settings.mobileAutoSyncMinutes > 0) this.addFeatureInterval(window.setInterval(
        () => void this.syncNow(false),
        Math.max(1, this.settings.mobileAutoSyncMinutes) * 6e4
      ));
      return;
    }
    if (options.autoSyncMinutes > 0) this.addFeatureInterval(window.setInterval(
      () => {
        if (options.bound) void this.syncNow(false);
      },
      Math.max(1, options.autoSyncMinutes) * 6e4
    ));
  }
  mobileHost() {
    return {
      active: () => this.useLightweightSync(),
      app: this.app,
      options: this.settings.mobile,
      engine: () => this.getMobileGithub(),
      save: async () => {
        await this.saveSettings();
        if (this.useLightweightSync()) {
          const engine = this.getMobileGithub();
          await engine.load();
          if (!this.settings.mobile.trackPaths) engine.state.paths = newPathRecords();
          if (!this.settings.mobile.cacheEnabled) engine.state.cache = {};
          await engine.save();
          const path2 = `${this.app.vault.configDir}/plugins/${this.manifest.id}/mobile-ignore.json`;
          await this.app.vault.adapter.write(path2, JSON.stringify({
            generated: mobileIgnores(
              this.settings.mobile,
              this.app.vault.configDir,
              this.manifest.id
            ),
            selectedPlugins: this.settings.mobile.plugins
          }, null, 2));
        }
      },
      restart: () => this.restartMobileAutomation(),
      sync: () => this.syncNow(true),
      calibrate: () => this.calibrateMobileHashes()
    };
  }
  async calibrateMobileHashes() {
    if (!this.useLightweightSync()) {
      new import_obsidian5.Notice("\u8BF7\u5148\u542F\u7528\u8F7B\u91CF GitHub API \u540C\u6B65\u3002");
      return;
    }
    if (this.syncing) {
      new import_obsidian5.Notice("\u540C\u6B65\u671F\u95F4\u4E0D\u80FD\u91CD\u65B0\u6821\u9A8C\u3002");
      return;
    }
    try {
      const result = await this.getMobileGithub().refreshCache(true);
      new import_obsidian5.Notice(`\u5DF2\u6821\u9A8C ${result.files} \u4E2A\u540C\u6B65\u6587\u4EF6\uFF0C\u7528\u65F6 ${result.seconds.toFixed(2)} \u79D2\uFF1B\u5171\u540C\u57FA\u51C6\u672A\u6539\u53D8\u3002`);
      await this.refreshSyncView();
    } catch (error) {
      new import_obsidian5.Notice(messageOf2(error), 1e4);
    }
  }
  activateFeature() {
    if (this.featureActive) return;
    this.featureActive = true;
    if (this.statusEl) this.statusEl.removeClass("simple-link-hidden");
    this.ribbonEl = this.addRibbonIcon("refresh-cw", "\u6253\u5F00 Simple Link", () => void this.openSyncView());
    this.registerViewRefreshEvents();
    if (this.useLightweightSync()) {
      this.registerMobileEvents();
      this.restartMobileAutomation();
      this.setStatus(import_obsidian5.Platform.isMobile ? "\u79FB\u52A8\u7AEF \xB7 \u7B49\u5F85\u540C\u6B65" : "\u7535\u8111\u7AEF \xB7 \u8F7B\u91CF API \u6A21\u5F0F");
      if (this.settings.mobile.mode === "server") {
        window.setTimeout(() => void this.registerMobile().catch((error) => this.recordError("\u624B\u673A\u8FDE\u63A5", error)), 1e3);
      }
    } else if (this.nativeGitEnabled()) {
      this.configureDesktopAutomation();
      this.scheduleStartupPull();
      void this.resumeDesktopDirtyState();
      this.setStatus(this.settings.setupComplete ? "\u684C\u9762\u7AEF \xB7 Git \u6A21\u5F0F" : "\u7B49\u5F85\u9996\u6B21 Git \u914D\u7F6E");
    } else this.setStatus("\u7535\u8111\u540C\u6B65\u5DF2\u5173\u95ED");
  }
  deactivateFeature() {
    this.featureActive = false;
    for (const ref of this.featureEvents) this.app.vault.offref(ref);
    this.featureEvents = [];
    for (const interval of this.featureIntervals) window.clearInterval(interval);
    this.featureIntervals = [];
    this.clearDesktopTimeouts();
    this.ribbonEl?.remove();
    this.ribbonEl = void 0;
    if (this.statusEl) this.statusEl.addClass("simple-link-hidden");
    this.app.workspace.detachLeavesOfType(ZoeySyncView.type);
    this.app.workspace.detachLeavesOfType(ZoeySyncConflictView.type);
  }
  addFeatureInterval(interval) {
    this.featureIntervals.push(interval);
    this.registerInterval(interval);
  }
  clearDesktopTimeouts() {
    if (this.viewRefreshTimer !== void 0) window.clearTimeout(this.viewRefreshTimer);
    if (this.idleCommitTimer !== void 0) window.clearTimeout(this.idleCommitTimer);
    if (this.idlePushTimer !== void 0) window.clearTimeout(this.idlePushTimer);
    if (this.maxCommitTimer !== void 0) window.clearTimeout(this.maxCommitTimer);
    if (this.maxPushTimer !== void 0) window.clearTimeout(this.maxPushTimer);
    if (this.desktopPushRetryTimer !== void 0) window.clearTimeout(this.desktopPushRetryTimer);
    this.viewRefreshTimer = void 0;
    this.idleCommitTimer = void 0;
    this.idlePushTimer = void 0;
    this.maxCommitTimer = void 0;
    this.maxPushTimer = void 0;
    this.desktopPushRetryTimer = void 0;
    this.firstUncommittedAt = 0;
    this.firstUnpushedAt = 0;
  }
  configureDesktopAutomation() {
    if (!this.settings.setupComplete) return;
    if (this.settings.autoPullIntervalMinutes > 0) {
      this.addFeatureInterval(
        window.setInterval(
          () => void this.enqueueDesktopGit(() => this.desktopFetchAndMerge(), "\u81EA\u52A8 Fetch + Merge").catch(() => void 0),
          Math.max(1, this.settings.autoPullIntervalMinutes) * 60 * 1e3
        )
      );
    }
  }
  scheduleStartupPull() {
    if (!this.settings.setupComplete) return;
    if (!this.settings.pullOnStartup || this.startupPullScheduled) return;
    this.startupPullScheduled = true;
    this.app.workspace.onLayoutReady(() => {
      if (!this.featureActive || !this.nativeGitEnabled()) return;
      void this.enqueueDesktopGit(
        async () => {
          const conflicts = await this.getUnmergedPaths();
          if (conflicts.length > 0) {
            throw new SyncDeferredError(`\u6709 ${conflicts.length} \u4E2A\u5408\u5E76\u51B2\u7A81\u7B49\u5F85\u5904\u7406`);
          }
          try {
            return await this.desktopStartupSync();
          } catch (error) {
            if (!isTransientGitNetworkError(error) && !isUncertainGitAuthError(error)) throw error;
            this.setStatus("GitHub \u8FDE\u63A5\u6216\u8BA4\u8BC1\u6682\u65F6\u5F02\u5E38 \xB7 \u6B63\u5728\u91CD\u8BD5");
            await new Promise((resolve) => window.setTimeout(resolve, DESKTOP_STARTUP_NETWORK_RETRY_DELAY_MS));
            if (!this.featureActive) return false;
            return await this.desktopStartupSync();
          }
        },
        "\u542F\u52A8\u65F6 Commit + Fetch + Merge"
      ).catch(() => void 0);
    });
  }
  async restartDesktopAutomation() {
    if (!this.nativeGitEnabled() || !this.featureActive) return;
    for (const interval of this.featureIntervals) window.clearInterval(interval);
    this.featureIntervals = [];
    if (this.idleCommitTimer !== void 0) window.clearTimeout(this.idleCommitTimer);
    if (this.idlePushTimer !== void 0) window.clearTimeout(this.idlePushTimer);
    if (this.maxCommitTimer !== void 0) window.clearTimeout(this.maxCommitTimer);
    if (this.maxPushTimer !== void 0) window.clearTimeout(this.maxPushTimer);
    if (this.desktopPushRetryTimer !== void 0) window.clearTimeout(this.desktopPushRetryTimer);
    this.idleCommitTimer = void 0;
    this.idlePushTimer = void 0;
    this.maxCommitTimer = void 0;
    this.maxPushTimer = void 0;
    this.desktopPushRetryTimer = void 0;
    this.firstUncommittedAt = 0;
    this.firstUnpushedAt = 0;
    this.configureDesktopAutomation();
    await this.resumeDesktopDirtyState();
  }
  async migrateLegacyLocalSettings() {
    const pluginsPath = `${this.app.vault.configDir}/plugins`;
    const currentPath = `${pluginsPath}/${this.manifest.id}/data.json`;
    const legacyPath = `${pluginsPath}/zoey-sync-test/data.json`;
    const adapter = this.app.vault.adapter;
    if (await adapter.exists(currentPath) || !await adapter.exists(legacyPath)) return;
    const legacyData = JSON.parse(await adapter.read(legacyPath));
    if (!legacyData || typeof legacyData !== "object" || Array.isArray(legacyData)) {
      throw new Error("\u65E7\u7248 Simple Link \u8BBE\u7F6E\u683C\u5F0F\u65E0\u6548\uFF0C\u672A\u8986\u76D6\u672C\u673A\u8BBE\u7F6E\u3002");
    }
    await this.saveData(legacyData);
  }
  async loadSettings() {
    const saved = await this.loadData();
    const shared = await this.loadSharedSettings();
    const legacyShared = pickSharedSettings(saved ?? {});
    this.settings = Object.assign(
      {},
      DEFAULT_SETTINGS,
      shared ?? legacyShared,
      pickLocalSettings(saved ?? {})
    );
    if (saved?.setupComplete === void 0 && this.settings.gitRemoteUrl) this.settings.setupComplete = true;
    if (saved?.setupFlowVersion !== 2) {
      const oldStep = Math.max(1, Math.min(5, Number(saved?.setupStep) || 1));
      this.settings.setupStep = oldStep <= 2 ? 1 : oldStep - 1;
      if (this.settings.setupBackup) {
        const oldBackupStep = Math.max(1, Math.min(5, Number(this.settings.setupBackup.step) || 1));
        this.settings.setupBackup.step = oldBackupStep <= 2 ? 1 : oldBackupStep - 1;
      }
      this.settings.setupFlowVersion = 2;
    }
    delete this.settings.desktopAutoSyncMinutes;
    delete this.settings.autoPushIntervalMinutes;
    this.settings.dirty = Array.isArray(this.settings.dirty) ? this.settings.dirty : [];
    this.settings.mobile = {
      ...DEFAULT_MOBILE_OPTIONS,
      ...saved?.mobile ?? {},
      plugins: [...saved?.mobile?.plugins ?? []],
      ignorePatterns: [...saved?.mobile?.ignorePatterns ?? []]
    };
    if (saved?.boundRepoUrl === void 0 && !shared?.boundRepoUrl) this.settings.boundRepoUrl = this.settings.mobile.repoUrl || this.settings.gitRemoteUrl || this.settings.setupRepoUrl || "";
    if (!saved?.mobile && this.settings.serverUrl) this.settings.mobile.mode = "server";
    if (this.settings.desktopLightweightEnabled) {
      this.settings.desktopGitEnabled = false;
      this.settings.mobile.mode = "github";
    }
    this.settings.inFlight = Array.isArray(this.settings.inFlight) ? this.settings.inFlight : [];
    const storedIgnorePatterns = shared?.ignorePatterns ?? saved?.ignorePatterns;
    this.settings.ignorePatterns = Array.isArray(storedIgnorePatterns) ? storedIgnorePatterns.filter((pattern) => typeof pattern === "string") : defaultSyncIgnorePatterns(this.app.vault.configDir);
    this.settings.errorLogs = Array.isArray(this.settings.errorLogs) ? this.settings.errorLogs : [];
    this.pruneErrorLogs();
    if (!this.settings.lastPullAt) {
      this.settings.lastPullAt = this.settings.errorLogs.filter((entry) => entry.status === "success" && /Fetch|Pull/.test(entry.context)).reduce((latest, entry) => Math.max(latest, entry.timestamp), 0);
    }
    if (!this.settings.deviceId) this.settings.deviceId = crypto.randomUUID();
    if (!this.settings.deviceName) {
      this.settings.deviceName = import_obsidian5.Platform.isMobile ? "Zoey Mobile" : "Zoey Desktop";
    }
    await this.saveSettings();
  }
  async saveSettings() {
    await this.saveData(pickLocalSettings(this.settings));
    if (this.sharedSettingsWritable) await this.saveSharedSettings();
  }
  sharedSettingsPath() {
    return `${this.app.vault.configDir}/plugins/${this.manifest.id}/sync-settings.json`;
  }
  async loadSharedSettings() {
    const path2 = this.sharedSettingsPath();
    if (!await this.app.vault.adapter.exists(path2)) return null;
    try {
      const parsed = JSON.parse(await this.app.vault.adapter.read(path2));
      return pickSharedSettings(parsed);
    } catch (error) {
      this.sharedSettingsWritable = false;
      console.error("Simple Link shared settings", error);
      new import_obsidian5.Notice("Simple Link\uFF1A\u540C\u6B65\u914D\u7F6E\u6587\u4EF6\u5B58\u5728\u51B2\u7A81\u6216\u683C\u5F0F\u9519\u8BEF\uFF0C\u5DF2\u505C\u6B62\u8986\u76D6\u8BE5\u6587\u4EF6", 1e4);
      return null;
    }
  }
  async saveSharedSettings() {
    const path2 = this.sharedSettingsPath();
    const content = `${JSON.stringify(pickSharedSettings(this.settings), null, 2)}
`;
    if (await this.app.vault.adapter.exists(path2)) {
      const current = await this.app.vault.adapter.read(path2);
      if (current === content) return;
    }
    await this.app.vault.adapter.write(path2, content);
  }
  pruneErrorLogs() {
    const cutoff = Date.now() - ERROR_LOG_RETENTION_MS;
    this.settings.errorLogs = this.settings.errorLogs.filter((entry) => entry.timestamp >= cutoff && (entry.status === "success" || entry.message)).slice(-MAX_ERROR_LOGS);
  }
  async recordError(context, error) {
    await this.recordLog(context, "error", messageOf2(error));
  }
  async recordSuccess(context, message = "") {
    await this.recordLog(context, "success", message);
  }
  async recordLog(context, status, message = "") {
    try {
      this.pruneErrorLogs();
      this.settings.errorLogs.push({
        timestamp: Date.now(),
        context,
        message,
        status
      });
      this.settings.errorLogs = this.settings.errorLogs.slice(-MAX_ERROR_LOGS);
      await this.saveSettings();
    } catch (saveError) {
      console.error("Simple Link error log", saveError);
    }
  }
  getRecentErrorLogs() {
    this.pruneErrorLogs();
    return [...this.settings.errorLogs].reverse();
  }
  getActiveSyncError() {
    const logs = this.getRecentErrorLogs();
    const latestFetch = logs.find((entry) => /Fetch|Pull|Push|同步/.test(entry.context));
    const latestPush = logs.find((entry) => /Push|同步/.test(entry.context));
    return [latestFetch, latestPush].filter((entry) => !!entry && entry.status === "error").sort((a, b) => b.timestamp - a.timestamp)[0];
  }
  async clearErrorLogs() {
    this.settings.errorLogs = [];
    await this.saveSettings();
    await this.refreshSyncView();
  }
  setStatus(text) {
    if (this.statusEl) this.statusEl.setText(`Simple Link: ${text}`);
  }
  setSyncActivity(text, tone) {
    this.syncActivity = { text, tone };
    this.setStatus(text);
    for (const leaf of this.app.workspace.getLeavesOfType(ZoeySyncView.type)) {
      if (leaf.view instanceof ZoeySyncView) leaf.view.updateActivity(this.syncActivity);
    }
  }
  clearSyncActivity() {
    this.syncActivity = void 0;
  }
  getSyncActivity() {
    return this.syncActivity ? { ...this.syncActivity } : void 0;
  }
  trackFeatureEvent(ref) {
    this.featureEvents.push(ref);
    this.registerEvent(ref);
  }
  registerViewRefreshEvents() {
    const changed = (file) => this.handleVaultChange([file.path]);
    this.trackFeatureEvent(this.app.vault.on("create", changed));
    this.trackFeatureEvent(this.app.vault.on("modify", changed));
    this.trackFeatureEvent(this.app.vault.on("delete", changed));
    this.trackFeatureEvent(
      this.app.vault.on("rename", (file, oldPath) => this.handleVaultChange([file.path, oldPath]))
    );
  }
  handleVaultChange(paths) {
    const relevantPaths = paths.filter((path2) => !shouldIgnore(path2, this.settings.ignorePatterns, this.app.vault.configDir));
    if (relevantPaths.length === 0) return;
    const now = Date.now();
    this.lastFileChangeAt = now;
    this.scheduleViewRefresh();
    if (this.nativeGitEnabled() && this.settings.setupComplete) {
      this.scheduleDesktopCommit();
      if (this.firstUnpushedAt > 0) this.scheduleDesktopPush();
    }
  }
  scheduleViewRefresh() {
    if (this.viewRefreshTimer !== void 0) window.clearTimeout(this.viewRefreshTimer);
    this.viewRefreshTimer = window.setTimeout(() => {
      this.viewRefreshTimer = void 0;
      void this.refreshSyncView();
    }, Math.max(0.5, this.settings.viewRefreshDelaySeconds) * 1e3);
  }
  scheduleDesktopCommit() {
    if (!this.settings.setupComplete) return;
    if (this.settings.autoCommitIdleMinutes > 0) {
      if (this.idleCommitTimer !== void 0) window.clearTimeout(this.idleCommitTimer);
      this.idleCommitTimer = window.setTimeout(
        () => void this.runAutomaticCommit(),
        Math.max(0.1, this.settings.autoCommitIdleMinutes) * 60 * 1e3
      );
    }
    if (this.firstUncommittedAt === 0) {
      this.firstUncommittedAt = Date.now();
      if (this.settings.maxUncommittedMinutes > 0) {
        this.maxCommitTimer = window.setTimeout(() => {
          void this.runAutomaticCommit();
        }, Math.max(1, this.settings.maxUncommittedMinutes) * 60 * 1e3);
      }
    }
  }
  scheduleDesktopPush() {
    if (!this.settings.setupComplete) return;
    if (this.desktopPushRetryTimer !== void 0) return;
    if (this.lastFileChangeAt === 0) this.lastFileChangeAt = Date.now();
    if (this.settings.autoPushIdleMinutes > 0) {
      if (this.idlePushTimer !== void 0) window.clearTimeout(this.idlePushTimer);
      const idleThreshold = Math.max(0.1, this.settings.autoPushIdleMinutes) * 60 * 1e3;
      const idleFor = Math.max(0, Date.now() - this.lastFileChangeAt);
      this.idlePushTimer = window.setTimeout(() => {
        this.idlePushTimer = void 0;
        void this.runAutomaticPush(false);
      }, Math.max(0, idleThreshold - idleFor));
    }
    if (this.firstUnpushedAt === 0) this.firstUnpushedAt = Date.now();
    if (this.maxPushTimer === void 0 && this.settings.maxUnpushedMinutes > 0) {
      const maxThreshold = Math.max(1, this.settings.maxUnpushedMinutes) * 60 * 1e3;
      const pendingFor = Math.max(0, Date.now() - this.firstUnpushedAt);
      this.maxPushTimer = window.setTimeout(() => {
        this.maxPushTimer = void 0;
        void this.runAutomaticPush(true);
      }, Math.max(0, maxThreshold - pendingFor));
    }
  }
  clearDesktopPushRetry() {
    if (this.desktopPushRetryTimer !== void 0) window.clearTimeout(this.desktopPushRetryTimer);
    this.desktopPushRetryTimer = void 0;
  }
  async scheduleDesktopPushRetry(statusText) {
    try {
      const interrupted = await this.getInterruptedGitOperation();
      const conflicts = await this.getUnmergedPaths();
      if (interrupted || conflicts.length > 0) return;
    } catch {
    }
    if (this.desktopPushRetryTimer !== void 0) window.clearTimeout(this.desktopPushRetryTimer);
    this.desktopPushRetryTimer = window.setTimeout(() => {
      this.desktopPushRetryTimer = void 0;
      void this.enqueueDesktopGit(() => this.desktopAutomaticPush(), "Push \u91CD\u8BD5").catch(() => void 0);
    }, DESKTOP_RETRY_DELAY_MS);
    this.setStatus(statusText ?? "Push \u5931\u8D25 \xB7 5 \u5206\u949F\u540E\u91CD\u8BD5");
  }
  resetDesktopCommitTracking() {
    if (this.idleCommitTimer !== void 0) window.clearTimeout(this.idleCommitTimer);
    if (this.maxCommitTimer !== void 0) window.clearTimeout(this.maxCommitTimer);
    this.idleCommitTimer = void 0;
    this.maxCommitTimer = void 0;
    this.firstUncommittedAt = 0;
  }
  async runAutomaticCommit() {
    let result = { committed: false };
    try {
      await this.enqueueDesktopGit(async () => {
        result = await this.desktopCommitOnly();
        this.resetDesktopCommitTracking();
        if (await this.hasDesktopChanges()) {
          this.scheduleDesktopCommit();
        }
      }, "\u81EA\u52A8 Commit");
      if (result.committed) {
        this.scheduleDesktopPush();
      }
    } catch {
    }
  }
  async runAutomaticPush(forceCommit) {
    if (this.automaticPushQueued) return;
    this.automaticPushQueued = true;
    try {
      await this.enqueueDesktopGit(async () => {
        return await this.desktopAutomaticPush(forceCommit);
      }, "\u81EA\u52A8 Push");
    } catch {
    } finally {
      this.automaticPushQueued = false;
    }
  }
  enqueueDesktopGit(task, errorContext) {
    if (!this.nativeGitEnabled()) return Promise.reject(new SyncDeferredError("\u7535\u8111\u7AEF\u539F\u751F Git \u540C\u6B65\u5DF2\u5173\u95ED"));
    if (!this.settings.setupComplete) return Promise.reject(new Error("\u8BF7\u5148\u5B8C\u6210\u9996\u6B21\u4F7F\u7528\u5F15\u5BFC"));
    const trackedTask = async () => {
      if (!this.nativeGitEnabled()) throw new SyncDeferredError("\u7535\u8111\u7AEF\u539F\u751F Git \u540C\u6B65\u5DF2\u5173\u95ED");
      if (!this.settings.setupComplete) throw new SyncDeferredError("\u8BF7\u5148\u5B8C\u6210\u9996\u6B21\u4F7F\u7528\u5F15\u5BFC");
      const isFetchTask = !!errorContext && (errorContext.includes("Fetch") || errorContext.includes("Pull"));
      const isPushTask = !!errorContext && (errorContext.includes("Push") || errorContext.includes("\u540C\u6B65"));
      this.desktopGitTrace = isFetchTask || isPushTask ? [
        `\u8FDC\u7AEF\uFF1Aorigin/${this.settings.gitBranch}`,
        "\u51ED\u636E\u8DEF\u5F84\uFF1AGitHub CLI"
      ] : [];
      const meaningfulChange = await task();
      if (errorContext && (meaningfulChange !== false || isFetchTask || isPushTask)) {
        const resultMessage = isPushTask ? meaningfulChange === false ? "GitHub \u8FDE\u63A5\u6210\u529F\uFF1B\u65E0\u9700\u4E0A\u4F20" : "GitHub \u8FDE\u63A5\u6210\u529F\uFF1B\u4E0A\u4F20\u5B8C\u6210" : isFetchTask ? meaningfulChange === false ? "GitHub \u8FDE\u63A5\u6210\u529F\uFF1B\u65E0\u9700\u5408\u5E76" : "GitHub \u8FDE\u63A5\u6210\u529F\uFF1B\u68C0\u67E5\u6216\u5408\u5E76\u5B8C\u6210" : "\u672C\u673A\u64CD\u4F5C\u5B8C\u6210\uFF1B\u672A\u6267\u884C GitHub \u8FDC\u7AEF\u8FDE\u63A5\u68C0\u67E5";
        const detail = [resultMessage, ...this.desktopGitTrace].filter(Boolean).join("\n");
        await this.recordSuccess(errorContext, detail);
      }
      this.clearSyncActivity();
      await this.refreshSyncView();
    };
    const run = this.desktopGitQueue.then(trackedTask, trackedTask);
    this.desktopGitQueue = run.catch(async (error) => {
      this.clearSyncActivity();
      if (error instanceof SyncDeferredError) {
        this.setStatus(error.message);
        await this.refreshSyncView();
        return;
      }
      console.error("Simple Link desktop task", error);
      if (errorContext) {
        await this.recordError(errorContext, [...this.desktopGitTrace, describeGitError(error)].join("\n"));
        if (errorContext.includes("Push") || errorContext.includes("\u540C\u6B65")) {
          await this.scheduleDesktopPushRetry();
        } else if (errorContext.includes("Fetch") || errorContext.includes("Pull")) {
          this.setStatus(this.settings.autoPullIntervalMinutes > 0 ? "Fetch \u5931\u8D25 \xB7 \u7B49\u5F85\u4E0B\u6B21\u81EA\u52A8\u68C0\u67E5" : "Fetch \u5931\u8D25");
        }
        await this.refreshSyncView();
      }
    });
    return run;
  }
  async traceDesktopGitStep(label, action) {
    const startedAt = Date.now();
    try {
      const result = await action();
      this.desktopGitTrace.push(`${label}\uFF1A\u6210\u529F\uFF08${Date.now() - startedAt} ms\uFF09`);
      return result;
    } catch (error) {
      this.desktopGitTrace.push(`${label}\uFF1A\u5931\u8D25\uFF08${Date.now() - startedAt} ms\uFF09`);
      throw error;
    }
  }
  async hasDesktopChanges() {
    return (await this.gitRaw(["status", "--porcelain=v1", "-z"])).length > 0;
  }
  async hasDesktopHead() {
    try {
      await this.gitRaw(["rev-parse", "--verify", "HEAD"]);
      return true;
    } catch {
      return false;
    }
  }
  async inspectLocalHistory(retentionDays = 30) {
    if (!this.settings.setupComplete) throw new Error("\u8BF7\u5148\u5B8C\u6210\u7535\u8111\u7AEF Git \u63A5\u5165");
    const nodeRequire3 = window.require;
    if (!nodeRequire3) throw new Error("\u672C\u5730\u5386\u53F2\u7626\u8EAB\u4EC5\u652F\u6301\u7535\u8111\u7AEF");
    const path2 = nodeRequire3("path");
    const root = await this.git(["rev-parse", "--show-toplevel"]);
    if (path2.resolve(root).toLowerCase() !== path2.resolve(this.vaultBasePath()).toLowerCase()) {
      throw new Error("\u5F53\u524D Vault \u4E0D\u662F\u72EC\u7ACB Git \u4ED3\u5E93\uFF0C\u65E0\u6CD5\u5B89\u5168\u6E05\u7406\u5386\u53F2");
    }
    const branch = await this.git(["symbolic-ref", "--quiet", "--short", "HEAD"]);
    if (branch !== this.settings.gitBranch) throw new Error(`\u5F53\u524D\u5206\u652F\u662F ${branch}\uFF0C\u4E0E\u540C\u6B65\u8BBE\u7F6E\u7684 ${this.settings.gitBranch} \u4E0D\u4E00\u81F4`);
    if (await this.hasDesktopChanges()) throw new Error("\u5DE5\u4F5C\u533A\u8FD8\u6709\u672A\u63D0\u4EA4\u7684\u6587\u4EF6\uFF1B\u8BF7\u5148\u5B8C\u6210\u540C\u6B65\u518D\u6E05\u7406");
    if (await this.getInterruptedGitOperationLabel()) throw new Error("\u5B58\u5728\u672A\u5B8C\u6210\u7684 Git \u64CD\u4F5C\uFF0C\u8BF7\u5148\u4FEE\u590D");
    const worktrees = await this.gitRaw(["worktree", "list", "--porcelain"]);
    if (worktrees.split(/\r?\n/).filter((line) => line.startsWith("worktree ")).length !== 1) {
      throw new Error("\u4ED3\u5E93\u5B58\u5728\u5176\u4ED6\u5DE5\u4F5C\u6811\uFF0C\u6682\u4E0D\u80FD\u6E05\u7406\u672C\u5730\u5386\u53F2");
    }
    const allowedRefs = /* @__PURE__ */ new Set([`refs/heads/${branch}`, `refs/remotes/origin/${branch}`, "refs/remotes/origin/HEAD"]);
    const refs = (await this.gitRaw(["for-each-ref", "--format=%(refname)"])).split(/\r?\n/).filter(Boolean);
    const extraRefs = refs.filter((ref) => !allowedRefs.has(ref));
    if (extraRefs.length) throw new Error(`\u4ED3\u5E93\u8FD8\u5B58\u5728\u5176\u4ED6\u5206\u652F\u3001\u6807\u7B7E\u6216\u6682\u5B58\u5F15\u7528\uFF08\u5982 ${extraRefs[0]}\uFF09\uFF0C\u8BF7\u5148\u5904\u7406\u540E\u518D\u6E05\u7406`);
    const head = await this.git(["rev-parse", "HEAD"]);
    const remoteLine = await this.git(["ls-remote", "--exit-code", "origin", `refs/heads/${branch}`], true);
    const remoteHead = remoteLine.split(/\s+/)[0];
    if (!/^[a-f0-9]{40,64}$/i.test(remoteHead) || remoteHead !== head) {
      throw new Error("GitHub \u5206\u652F\u4E0E\u672C\u673A HEAD \u4E0D\u4E00\u81F4\uFF1B\u8BF7\u5148\u5B8C\u6210 Fetch\u3001Merge \u548C Push\uFF0C\u518D\u91CD\u65B0\u68C0\u67E5");
    }
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1e3).toISOString();
    const totalCommits = Number(await this.git(["rev-list", "--count", "HEAD"]));
    const oldCommits = Number(await this.git(["rev-list", "--count", `--before=${cutoff}`, "HEAD"]));
    const objectStats = await this.gitRaw(["count-objects", "-v"]);
    const looseKiB = Number(objectStats.match(/^size: (\d+)$/m)?.[1] ?? 0);
    const packedKiB = Number(objectStats.match(/^size-pack: (\d+)$/m)?.[1] ?? 0);
    return { cutoff, branch, head, totalCommits, oldCommits, localSizeMiB: (looseKiB + packedKiB) / 1024 };
  }
  async slimLocalHistory() {
    let result;
    await this.enqueueDesktopGit(async () => {
      const before = await this.inspectLocalHistory();
      if (before.oldCommits === 0) {
        result = { before, after: before };
        return false;
      }
      await this.git(["fetch", `--shallow-since=${before.cutoff}`, "--no-tags", "origin", `refs/heads/${before.branch}`], true);
      const remoteLine = await this.git(["ls-remote", "--exit-code", "origin", `refs/heads/${before.branch}`], true);
      if (remoteLine.split(/\s+/)[0] !== before.head) {
        throw new Error("\u6E05\u7406\u671F\u95F4 GitHub \u5206\u652F\u53D1\u751F\u53D8\u5316\uFF0C\u5DF2\u505C\u6B62\u5220\u9664\u65E7\u5BF9\u8C61\uFF1B\u8BF7\u5148\u540C\u6B65\u540E\u91CD\u8BD5");
      }
      await this.git(["reflog", "expire", "--expire=now", "--expire-unreachable=now", "--all"]);
      await this.git(["gc", "--prune=now"]);
      const after = await this.inspectLocalHistory();
      result = { before, after };
    }, "\u672C\u5730\u5386\u53F2\u7626\u8EAB");
    if (!result) throw new Error("\u672C\u5730\u5386\u53F2\u7626\u8EAB\u672A\u8FD4\u56DE\u7ED3\u679C");
    return result;
  }
  async getUnpushedCommitWindow() {
    if (!await this.hasDesktopHead()) return null;
    const remoteRef = `refs/remotes/origin/${this.settings.gitBranch}`;
    let range = "HEAD";
    try {
      await this.git(["show-ref", "--verify", "--quiet", remoteRef]);
      range = `${remoteRef}..HEAD`;
    } catch {
    }
    const output = (await this.gitRaw(["log", "--reverse", "--format=%ct", range])).trim();
    if (!output) return null;
    const timestamps = output.split(/\r?\n/).map((value) => Number(value) * 1e3).filter((value) => Number.isFinite(value) && value > 0);
    if (timestamps.length === 0) return null;
    return { oldestAt: timestamps[0], latestAt: timestamps[timestamps.length - 1] };
  }
  resetDesktopPushTracking() {
    if (this.idlePushTimer !== void 0) window.clearTimeout(this.idlePushTimer);
    if (this.maxPushTimer !== void 0) window.clearTimeout(this.maxPushTimer);
    this.idlePushTimer = void 0;
    this.maxPushTimer = void 0;
    this.firstUnpushedAt = 0;
  }
  async resumeDesktopDirtyState() {
    try {
      const interrupted = await this.getInterruptedGitOperation();
      const conflicts = await this.getUnmergedPaths();
      if (interrupted || conflicts.length > 0) {
        this.setStatus(
          conflicts.length > 0 ? `\u6709 ${conflicts.length} \u4E2A\u5408\u5E76\u51B2\u7A81\u7B49\u5F85\u5904\u7406` : `\u68C0\u6D4B\u5230\u672A\u5B8C\u6210\u7684 ${interrupted?.label ?? "Git \u64CD\u4F5C"}`
        );
        await this.refreshSyncView();
        return;
      }
      const hasChanges = await this.hasDesktopChanges();
      if (hasChanges) {
        this.lastFileChangeAt = Date.now();
        this.scheduleDesktopCommit();
      }
      const unpushed = await this.getUnpushedCommitWindow();
      if (unpushed) {
        if (this.idlePushTimer !== void 0) window.clearTimeout(this.idlePushTimer);
        if (this.maxPushTimer !== void 0) window.clearTimeout(this.maxPushTimer);
        this.idlePushTimer = void 0;
        this.maxPushTimer = void 0;
        this.firstUnpushedAt = unpushed.oldestAt;
        if (!hasChanges) this.lastFileChangeAt = unpushed.latestAt;
        this.scheduleDesktopPush();
      }
    } catch {
    }
  }
  async getInterruptedGitOperation() {
    const operations = [
      { ref: "REBASE_HEAD", label: "Rebase", abortArgs: ["rebase", "--abort"] },
      { ref: "MERGE_HEAD", label: "Merge", abortArgs: ["merge", "--abort"] },
      { ref: "CHERRY_PICK_HEAD", label: "Cherry-pick", abortArgs: ["cherry-pick", "--abort"] },
      { ref: "REVERT_HEAD", label: "Revert", abortArgs: ["revert", "--abort"] }
    ];
    for (const operation of operations) {
      try {
        await this.git(["rev-parse", "--verify", "-q", operation.ref]);
        return operation;
      } catch {
      }
    }
    return null;
  }
  async getInterruptedGitOperationLabel() {
    if (!this.settings.setupComplete) throw new Error("\u8BF7\u5148\u5B8C\u6210\u9996\u6B21\u4F7F\u7528\u5F15\u5BFC");
    await this.ensureDesktopGit();
    return (await this.getInterruptedGitOperation())?.label ?? null;
  }
  async restoreRecoveryStash(recoveryStash) {
    try {
      await this.git(["stash", "apply", recoveryStash]);
    } catch (error) {
      const conflicts = await this.getUnmergedPaths();
      if (conflicts.length === 0) throw error;
      for (const path2 of conflicts) {
        try {
          await this.git(["checkout", "--theirs", "--", path2]);
          await this.git(["add", "--", path2]);
        } catch (checkoutError) {
          try {
            await this.git(["cat-file", "-e", `:3:${path2}`]);
          } catch {
            await this.git(["rm", "-f", "--", path2]);
            continue;
          }
          throw checkoutError;
        }
      }
      const remaining = await this.getUnmergedPaths();
      if (remaining.length > 0) {
        throw new Error(`\u4ECD\u6709 ${remaining.length} \u4E2A\u672C\u673A\u6062\u590D\u51B2\u7A81\u65E0\u6CD5\u81EA\u52A8\u5904\u7406\uFF1B\u5907\u4EFD\u4FDD\u7559\u5728 ${recoveryStash}`);
      }
    }
    await this.git(["stash", "drop", recoveryStash]);
  }
  async repairInterruptedGitOperation() {
    let result;
    await this.enqueueDesktopGit(async () => {
      await this.ensureDesktopGit();
      const operation = await this.getInterruptedGitOperation();
      if (!operation) throw new Error("\u6CA1\u6709\u68C0\u6D4B\u5230\u53EF\u81EA\u52A8\u4FEE\u590D\u7684\u672A\u5B8C\u6210 Git \u64CD\u4F5C");
      const hadChanges = await this.hasDesktopChanges();
      let recoveryStash = "";
      if (hadChanges) {
        const message = `Simple Link repair backup ${(/* @__PURE__ */ new Date()).toISOString()}`;
        await this.git(["stash", "push", "--include-untracked", "-m", message]);
        recoveryStash = (await this.git(["stash", "list", "-1", "--format=%gd"])).trim();
        if (!recoveryStash) throw new Error("\u65E0\u6CD5\u5EFA\u7ACB\u672C\u673A\u4FEE\u6539\u7684\u6062\u590D\u5907\u4EFD\uFF0C\u5DF2\u505C\u6B62\u4FEE\u590D");
      }
      try {
        await this.git(operation.abortArgs);
      } catch (error) {
        if (recoveryStash) {
          try {
            await this.restoreRecoveryStash(recoveryStash);
          } catch {
            throw new Error(
              `${operation.label} \u9000\u51FA\u5931\u8D25\uFF1B\u672C\u673A\u4FEE\u6539\u4ECD\u4FDD\u5B58\u5728 ${recoveryStash}\uFF0C\u8BF7\u4E0D\u8981\u624B\u52A8\u5220\u9664\u8BE5\u5907\u4EFD\u3002\u539F\u59CB\u9519\u8BEF\uFF1A${messageOf2(error)}`
            );
          }
        }
        throw error;
      }
      if (recoveryStash) {
        try {
          await this.restoreRecoveryStash(recoveryStash);
        } catch (error) {
          throw new Error(
            `${operation.label} \u5DF2\u9000\u51FA\uFF0C\u4F46\u6062\u590D\u672C\u673A\u4FEE\u6539\u65F6\u9700\u8981\u4EBA\u5DE5\u5904\u7406\uFF1B\u5B8C\u6574\u5907\u4EFD\u4ECD\u4FDD\u5B58\u5728 ${recoveryStash}\u3002${messageOf2(error)}`
          );
        }
      }
      if (await this.hasDesktopHead()) {
        try {
          await this.git(["symbolic-ref", "--quiet", "HEAD"]);
        } catch {
          throw new Error(`${operation.label} \u5DF2\u9000\u51FA\uFF0C\u4F46\u4ED3\u5E93\u4ECD\u5904\u4E8E detached HEAD\uFF0C\u8BF7\u4EBA\u5DE5\u68C0\u67E5\u540E\u518D\u540C\u6B65`);
        }
      }
      const commitResult = await this.desktopCommitOnly();
      if (commitResult.committed) this.scheduleDesktopPush();
      await this.desktopFetchAndMerge();
      result = { operation: operation.label, restoredLocalChanges: hadChanges };
      await this.refreshSyncView();
    }, "\u5F02\u5E38\u4FEE\u590D");
    if (!result) throw new Error("\u5F02\u5E38\u4FEE\u590D\u6CA1\u6709\u8FD4\u56DE\u7ED3\u679C");
    return result;
  }
  async ensureNormalGitState() {
    const operation = await this.getInterruptedGitOperation();
    if (operation) {
      throw new Error(`\u68C0\u6D4B\u5230\u672A\u5B8C\u6210\u7684 ${operation.label}\uFF0C\u81EA\u52A8 Commit\u3001Merge \u548C Push \u5DF2\u6682\u505C`);
    }
    const unmergedPaths = await this.getUnmergedPaths();
    if (unmergedPaths.length > 0) {
      throw new Error(`\u68C0\u6D4B\u5230 ${unmergedPaths.length} \u4E2A\u5C1A\u672A\u89E3\u51B3\u7684 Git \u51B2\u7A81\uFF0C\u81EA\u52A8 Commit\u3001Merge \u548C Push \u5DF2\u6682\u505C`);
    }
    if (await this.hasDesktopHead()) {
      try {
        await this.git(["symbolic-ref", "--quiet", "HEAD"]);
      } catch {
        throw new Error("\u5F53\u524D\u5904\u4E8E detached HEAD\uFF0C\u81EA\u52A8 Commit\u3001Merge \u548C Push \u5DF2\u6682\u505C");
      }
    }
  }
  async openSyncView(refreshExisting = true) {
    if (!this.settings.enabled) {
      new import_obsidian5.Notice("Simple Link \u5DF2\u5173\u95ED\uFF0C\u8BF7\u5148\u5728\u8BBE\u7F6E\u4E2D\u542F\u7528");
      return;
    }
    let leaf = this.app.workspace.getLeavesOfType(ZoeySyncView.type)[0] ?? null;
    const existing = !!leaf;
    if (!leaf) {
      leaf = this.app.workspace.getRightLeaf(false);
      if (!leaf) return;
      await leaf.setViewState({ type: ZoeySyncView.type, active: true });
    }
    await this.app.workspace.revealLeaf(leaf);
    if (existing && refreshExisting) await this.refreshSyncView();
  }
  async reviewLightweightDifferences(live) {
    await this.openSyncView(false);
    const leaf = this.app.workspace.getLeavesOfType(ZoeySyncView.type)[0];
    if (!(leaf?.view instanceof ZoeySyncView)) throw new Error("\u65E0\u6CD5\u6253\u5F00\u8F7B\u91CF\u540C\u6B65\u786E\u8BA4\u4FA7\u680F");
    this.app.setting?.close();
    return await leaf.view.reviewDifferences(live);
  }
  async openConflictPreview() {
    new ZoeySyncConflictPreviewModal(this.app).open();
  }
  async refreshSyncView() {
    const views = this.app.workspace.getLeavesOfType(ZoeySyncView.type).map((leaf) => leaf.view).filter((view) => view instanceof ZoeySyncView);
    await Promise.all(views.map((view) => view.render()));
  }
  async toggleViewLayout() {
    this.settings.viewLayout = this.settings.viewLayout === "list" ? "tree" : "list";
    await this.saveSettings();
    await this.refreshSyncView();
  }
  getChangeViewMode() {
    return !this.nativeGitEnabled() ? "upload" : this.settings.showVersionViewSwitcher ? this.settings.changeViewMode : "upload";
  }
  async setChangeViewMode(mode) {
    this.settings.changeViewMode = mode;
    await this.saveSettings();
    await this.refreshSyncView();
  }
  async setVersionViewSwitcher(visible) {
    this.settings.showVersionViewSwitcher = visible;
    if (!visible) this.settings.changeViewMode = "upload";
    await this.saveSettings();
    await this.refreshSyncView();
  }
  openPluginSettings() {
    const appWithSettings = this.app;
    appWithSettings.setting.open();
    appWithSettings.setting.openTabById(this.manifest.id);
  }
  needsLightweightBaseline() {
    return this.useLightweightSync() && this.settings.mobile.mode === "github" && this.settings.mobile.bound && !this.getMobileGithub().state.baseCommitSha;
  }
  getLightweightPendingStatus() {
    if (!this.useLightweightSync() || this.settings.mobile.mode !== "github") return void 0;
    if (!this.settings.mobile.bound) return { tone: "pending", text: "\u8F7B\u91CF\u540C\u6B65\u5C1A\u672A\u63A5\u5165" };
    if (this.needsLightweightBaseline()) return { tone: "pending", text: "\u5C1A\u672A\u5EFA\u7ACB\u540C\u6B65\u57FA\u51C6 \xB7 \u9700\u6838\u5BF9\u4E91\u7AEF" };
    return void 0;
  }
  async getChanges(mode = this.getChangeViewMode()) {
    if (import_obsidian5.Platform.isMobile && !this.settings.mobileSyncEnabled) return [];
    if (this.useLightweightSync()) {
      if (this.settings.mobile.mode === "github") {
        if (!this.settings.mobile.bound || this.syncing || this.needsLightweightBaseline()) return [];
        const changes = this.getMobileGithub().cachedChanges(this.app.vault.getFiles().map((file) => file.path));
        return changes.map((change) => ({
          path: change.currentPath ?? change.basePath,
          oldPath: change.status === "renamed" ? change.basePath : void 0,
          kind: change.status === "renamed" ? "moved" : change.status
        }));
      }
      return [...this.settings.inFlight, ...this.settings.dirty].map((entry) => ({
        path: entry.path,
        oldPath: entry.fromPath,
        kind: entry.type === "add" ? "added" : entry.type === "delete" ? "deleted" : entry.type === "move" ? "moved" : "modified"
      }));
    }
    if (!this.nativeGitEnabled() || !this.settings.setupComplete) return [];
    if (mode === "commit") return parseGitStatus(await this.gitRaw(["status", "--porcelain=v1", "-z"]));
    return await this.getPendingUploadChanges();
  }
  async getLatestCommitAt() {
    if (!this.nativeGitEnabled() || !this.settings.setupComplete) return 0;
    try {
      const seconds = Number((await this.gitRaw(["log", "-1", "--format=%ct"])).trim());
      return Number.isFinite(seconds) && seconds > 0 ? seconds * 1e3 : 0;
    } catch {
      return 0;
    }
  }
  async getPendingUploadChanges() {
    const remoteRef = `refs/remotes/origin/${this.settings.gitBranch}`;
    let hasRemoteRef = false;
    try {
      await this.git(["show-ref", "--verify", "--quiet", remoteRef]);
      hasRemoteRef = true;
    } catch {
    }
    const tracked = hasRemoteRef ? parseGitNameStatus(await this.gitRaw(["diff", "--name-status", "-z", "--find-renames", remoteRef])) : await this.getInitialUploadChanges();
    const knownPaths = new Set(tracked.map((change) => change.path));
    const untracked = (await this.gitRaw(["ls-files", "--others", "--exclude-standard", "-z"])).split("\0").filter(Boolean).filter((path2) => !knownPaths.has(path2)).map((path2) => ({ path: path2, kind: "added" }));
    return [...tracked, ...untracked].sort((a, b) => a.path.localeCompare(b.path));
  }
  async getInitialUploadChanges() {
    const deletedPaths = new Set(
      parseGitStatus(await this.gitRaw(["status", "--porcelain=v1", "-z"])).filter((change) => change.kind === "deleted").map((change) => change.path)
    );
    return (await this.gitRaw(["ls-files", "--cached", "-z"])).split("\0").filter(Boolean).filter((path2) => !deletedPaths.has(path2)).map((path2) => ({ path: path2, kind: "added" }));
  }
  isSyncing() {
    return this.syncing;
  }
  registerMobileEvents() {
    const apiEvent = (type, file, oldPath) => {
      if (this.settings.mobile.mode !== "github") return;
      if (!this.app.workspace.layoutReady) return;
      const engine = this.getMobileGithub();
      if (!engine.allowed(file.path) && (!oldPath || !engine.allowed(oldPath))) return;
      engine.event(type, file.path, oldPath);
      void engine.save().catch((error) => this.recordError("\u8DEF\u5F84\u8BB0\u5F55", error));
      this.scheduleViewRefresh();
    };
    this.trackFeatureEvent(this.app.vault.on("create", (file) => apiEvent("create", file)));
    this.trackFeatureEvent(this.app.vault.on("modify", (file) => apiEvent("modify", file)));
    this.trackFeatureEvent(this.app.vault.on("delete", (file) => apiEvent("delete", file)));
    this.trackFeatureEvent(this.app.vault.on("rename", (file, oldPath) => apiEvent("rename", file, oldPath)));
    const record = (file, type) => {
      if (!(file instanceof import_obsidian5.TFile)) return;
      void this.recordDirty({ type, path: file.path });
    };
    this.trackFeatureEvent(this.app.vault.on("create", (file) => record(file, "add")));
    this.trackFeatureEvent(this.app.vault.on("modify", (file) => record(file, "modify")));
    this.trackFeatureEvent(this.app.vault.on("delete", (file) => record(file, "delete")));
    this.trackFeatureEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        if (!(file instanceof import_obsidian5.TFile)) return;
        void this.recordDirty({ type: "move", fromPath: oldPath, path: file.path });
      })
    );
  }
  async recordDirty(entry) {
    if (this.settings.mobile.mode === "github") return;
    if (shouldIgnore(entry.path, this.settings.ignorePatterns, this.app.vault.configDir) || entry.fromPath && shouldIgnore(entry.fromPath, this.settings.ignorePatterns, this.app.vault.configDir)) return;
    if (this.suppressPaths.has(entry.path) || entry.fromPath && this.suppressPaths.has(entry.fromPath)) return;
    this.settings.dirty = coalesceDirty(this.settings.dirty, entry);
    await this.saveSettings();
    this.setStatus(`${this.settings.dirty.length} \u9879\u5F85\u540C\u6B65`);
    await this.refreshSyncView();
  }
  validateServerSettings() {
    if (!this.settings.serverUrl || !this.settings.serverPassword) {
      throw new Error("\u8BF7\u5148\u586B\u5199\u670D\u52A1\u5668\u5730\u5740\u548C\u8BA4\u8BC1\u5BC6\u7801");
    }
    const url = new URL(this.settings.serverUrl);
    const local = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
    if (url.protocol !== "https:" && !local) throw new Error("\u516C\u7F51\u670D\u52A1\u5668\u5FC5\u987B\u4F7F\u7528 HTTPS");
  }
  async serverRequest(method, path2, body) {
    this.validateServerSettings();
    const url = `${this.settings.serverUrl.replace(/\/$/, "")}${path2}`;
    try {
      const response = await (0, import_obsidian5.requestUrl)({
        url,
        method,
        headers: {
          Authorization: `Bearer ${this.settings.serverPassword}`,
          "Content-Type": "application/json"
        },
        body: body ? JSON.stringify(body) : void 0,
        throw: false
      });
      const data = response.json;
      if (response.status < 200 || response.status >= 300) {
        const details = data.details ? `\uFF1A${JSON.stringify(data.details)}` : "";
        throw new Error(`${data.error ?? `HTTP ${response.status}`}${details}`);
      }
      return data;
    } catch (error) {
      throw new Error(`\u670D\u52A1\u5668\u8BF7\u6C42\u5931\u8D25\uFF1A${messageOf2(error)}`);
    }
  }
  platformName() {
    if (!import_obsidian5.Platform.isMobile) return "desktop";
    if (import_obsidian5.Platform.isIosApp) return "ios";
    if (import_obsidian5.Platform.isAndroidApp) return "android";
    return "unknown";
  }
  async registerMobile() {
    if (this.settings.mobile.mode !== "server") return;
    if (!this.settings.enabled || !import_obsidian5.Platform.isMobile || !this.settings.serverUrl || !this.settings.serverPassword) return;
    await this.serverRequest("POST", "/v1/devices/register", {
      deviceId: this.settings.deviceId,
      name: this.settings.deviceName,
      platform: this.platformName()
    });
    this.setStatus(`\u5DF2\u8FDE\u63A5 \xB7 v${this.settings.baseVersion}`);
  }
  async testConnection(showNotice) {
    try {
      if (this.useLightweightSync()) {
        if (this.settings.mobile.mode === "github") await this.getMobileGithub().verify();
        else {
          this.validateServerSettings();
          await this.registerMobile();
        }
      } else {
        if (!this.settings.setupComplete) throw new Error("\u8BF7\u5148\u5B8C\u6210\u9996\u6B21\u4F7F\u7528\u5F15\u5BFC");
        await this.testDesktopGit();
      }
      if (showNotice) new import_obsidian5.Notice(`Simple Link\uFF1A${this.useLightweightSync() ? this.settings.mobile.mode === "github" ? "GitHub API" : "\u670D\u52A1\u5668" : "Git"}\u8FDE\u63A5\u6B63\u5E38`);
    } catch (error) {
      await this.recordError("\u6D4B\u8BD5\u8FDE\u63A5", error);
      if (showNotice) new import_obsidian5.Notice(`Simple Link\uFF1A${messageOf2(error)}`, 8e3);
      throw error;
    }
  }
  async syncNow(showNotice) {
    if (!this.useLightweightSync() && !this.nativeGitEnabled()) {
      if (showNotice) new import_obsidian5.Notice("\u5F53\u524D\u8BBE\u5907\u540C\u6B65\u5DF2\u5173\u95ED");
      return;
    }
    if (!this.useLightweightSync() && !this.settings.setupComplete) {
      if (showNotice) new import_obsidian5.Notice("\u8BF7\u5148\u5B8C\u6210\u300C\u4ECE\u96F6\u5F00\u59CB\u7684 Git \u540C\u6B65\u4F7F\u7528\u6307\u5357\u300D");
      return;
    }
    if (!this.settings.enabled) {
      if (showNotice) new import_obsidian5.Notice("Simple Link \u5DF2\u5173\u95ED\uFF0C\u8BF7\u5148\u5728\u8BBE\u7F6E\u4E2D\u542F\u7528");
      return;
    }
    if (this.syncing) {
      if (showNotice) new import_obsidian5.Notice("Simple Link\uFF1A\u5DF2\u6709\u540C\u6B65\u4EFB\u52A1\u6B63\u5728\u8FD0\u884C");
      return;
    }
    this.syncing = true;
    this.setStatus(this.useLightweightSync() ? "\u6B63\u5728\u540C\u6B65\u2026" : "\u51C6\u5907\u68C0\u67E5\u672C\u673A\u4FEE\u6539\u2026");
    try {
      if (this.useLightweightSync()) {
        if (this.settings.mobile.mode === "github") {
          const engine = this.getMobileGithub();
          const plan = await engine.preview();
          if (showNotice) {
            if (!await new MobileSyncModal(this.app, engine, plan, false, (live) => this.reviewLightweightDifferences(live)).wait()) return;
          } else {
            if (!engine.state.baseCommitSha || plan.conflicts.length || plan.localDeletes.length || plan.remoteDeletes.length) {
              throw new SyncDeferredError("\u6709\u9996\u6B21\u914D\u5BF9\u3001\u51B2\u7A81\u6216\u5220\u9664\u5F85\u786E\u8BA4\uFF0C\u8BF7\u624B\u52A8\u9884\u89C8\u540C\u6B65\u3002");
            }
            await engine.execute(plan);
          }
        } else await this.mobileSync();
        this.settings.lastSyncAt = Date.now();
        await this.saveSettings();
        this.setStatus(this.settings.mobile.mode === "github" ? "GitHub API \xB7 \u4E24\u7AEF\u5DF2\u5BF9\u9F50" : `\u5DF2\u540C\u6B65 \xB7 v${this.settings.baseVersion}`);
      } else {
        await this.enqueueDesktopGit(() => this.desktopGitSync());
        this.setStatus("\u540C\u6B65\u68C0\u67E5\u5B8C\u6210");
      }
      await this.recordSuccess(showNotice ? "\u624B\u52A8\u540C\u6B65" : "\u81EA\u52A8\u540C\u6B65", "\u540C\u6B65\u68C0\u67E5\u5B8C\u6210");
      if (showNotice) new import_obsidian5.Notice("Simple Link\uFF1A\u540C\u6B65\u5B8C\u6210");
    } catch (error) {
      if (error instanceof SyncDeferredError) {
        this.setStatus(error.message);
        if (showNotice) new import_obsidian5.Notice(error.message);
        return;
      }
      if (!this.useLightweightSync()) await this.scheduleDesktopPushRetry();
      await this.recordError(showNotice ? "\u624B\u52A8\u540C\u6B65" : "\u81EA\u52A8\u540C\u6B65", error);
      this.setStatus(this.useLightweightSync() ? "\u540C\u6B65\u5931\u8D25" : "\u540C\u6B65\u5931\u8D25 \xB7 5 \u5206\u949F\u540E\u91CD\u8BD5");
      if (showNotice) new import_obsidian5.Notice(`Simple Link\uFF1A${messageOf2(error)}`, 1e4);
      else console.error("Simple Link", error);
    } finally {
      this.syncing = false;
      await this.refreshSyncView();
    }
  }
  async commitNow(showNotice) {
    if (this.nativeGitEnabled() && !this.settings.setupComplete) {
      if (showNotice) new import_obsidian5.Notice("\u8BF7\u5148\u5B8C\u6210\u300C\u4ECE\u96F6\u5F00\u59CB\u7684 Git \u540C\u6B65\u5F15\u5BFC\u300D");
      return;
    }
    if (!this.settings.enabled) {
      if (showNotice) new import_obsidian5.Notice("Simple Link \u5DF2\u5173\u95ED\uFF0C\u8BF7\u5148\u5728\u8BBE\u7F6E\u4E2D\u542F\u7528");
      return;
    }
    if (!this.nativeGitEnabled()) {
      if (showNotice) new import_obsidian5.Notice("\u5F53\u524D\u6A21\u5F0F\u4E0D\u4F7F\u7528\u539F\u751F Git commit\uFF1B\u8BF7\u4F7F\u7528\u9884\u89C8\u5E76\u540C\u6B65");
      return;
    }
    if (this.syncing) {
      if (showNotice) new import_obsidian5.Notice("Simple Link\uFF1A\u5DF2\u6709\u4EFB\u52A1\u6B63\u5728\u8FD0\u884C");
      return;
    }
    this.syncing = true;
    this.setStatus("Commit \u4E2D\u2026");
    await this.refreshSyncView();
    try {
      let result = { committed: false };
      await this.enqueueDesktopGit(async () => {
        result = await this.desktopCommitOnly();
      });
      if (result.committed) this.scheduleDesktopPush();
      this.setStatus(result.committed ? "\u5DF2 Commit" : "\u6CA1\u6709\u53EF Commit \u6587\u4EF6");
      if (showNotice) {
        new import_obsidian5.Notice(result.committed ? "Simple Link\uFF1ACommit \u5B8C\u6210" : "Simple Link\uFF1A\u6CA1\u6709\u53EF Commit \u6587\u4EF6");
      }
    } catch (error) {
      await this.recordError("\u624B\u52A8 Commit", error);
      this.setStatus("Commit \u5931\u8D25");
      if (showNotice) new import_obsidian5.Notice(`Simple Link\uFF1A${messageOf2(error)}`, 1e4);
    } finally {
      this.syncing = false;
      await this.refreshSyncView();
    }
  }
  async buildOperations(entries) {
    const operations = [];
    for (const entry of entries) {
      if (entry.type === "add" || entry.type === "modify") {
        if (!await this.app.vault.adapter.exists(entry.path)) {
          operations.push({ type: "delete", path: entry.path });
          continue;
        }
        const content = await this.app.vault.adapter.readBinary(entry.path);
        operations.push({ type: "upsert", path: entry.path, contentBase64: arrayBufferToBase64(content) });
      } else if (entry.type === "move") {
        operations.push({ type: "move", path: entry.path, fromPath: entry.fromPath });
      } else {
        operations.push({ type: "delete", path: entry.path });
      }
    }
    return operations;
  }
  async mobileSync() {
    await this.registerMobile();
    if (this.settings.inFlight.length === 0 && this.settings.dirty.length > 0) {
      this.settings.inFlight = this.settings.dirty;
      this.settings.dirty = [];
      this.settings.pendingRequestId = crypto.randomUUID();
      await this.saveSettings();
    }
    if (!this.settings.pendingRequestId) this.settings.pendingRequestId = crypto.randomUUID();
    const operations = await this.buildOperations(this.settings.inFlight);
    await this.saveSettings();
    const response = await this.serverRequest("POST", "/v1/sync", {
      deviceId: this.settings.deviceId,
      requestId: this.settings.pendingRequestId,
      baseVersion: this.settings.baseVersion,
      operations
    });
    const newDirtyPaths = new Set(this.settings.dirty.flatMap((entry) => [entry.path, entry.fromPath ?? ""]));
    const overlap = response.actions.map((action) => action.path).filter((path2) => newDirtyPaths.has(path2));
    if (overlap.length > 0) {
      this.settings.inFlight = [];
      this.settings.pendingRequestId = "";
      await this.saveSettings();
      throw new Error(`\u540C\u6B65\u671F\u95F4\u8FD9\u4E9B\u6587\u4EF6\u53C8\u88AB\u4FEE\u6539\uFF0C\u8BF7\u518D\u6B21\u540C\u6B65\u5904\u7406\u51B2\u7A81\uFF1A${overlap.join(", ")}`);
    }
    await this.applyServerActions(response.actions);
    await this.serverRequest("POST", "/v1/sync/ack", {
      deviceId: this.settings.deviceId,
      version: response.baseVersion
    });
    this.settings.baseVersion = response.baseVersion;
    this.settings.inFlight = [];
    this.settings.pendingRequestId = "";
    await this.saveSettings();
    const triggerSync = await this.handleCommands(response.commands ?? []);
    if (response.gitWarning) new import_obsidian5.Notice(`Simple Link\uFF1AGitHub \u6682\u65F6\u4E0D\u53EF\u7528\uFF0C\u672C\u5730\u670D\u52A1\u5668\u540C\u6B65\u5DF2\u5B8C\u6210`, 7e3);
    if (triggerSync) window.setTimeout(() => void this.syncNow(false), 250);
  }
  async ensureParent(path2) {
    const parts = path2.split("/").slice(0, -1);
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (!await this.app.vault.adapter.exists(current)) {
        await this.app.vault.adapter.mkdir(current);
      }
    }
  }
  async applyServerActions(actions) {
    for (const action of actions) this.suppressPaths.add(action.path);
    try {
      for (const action of actions) {
        if (action.type === "delete") {
          if (await this.app.vault.adapter.exists(action.path)) await this.app.vault.adapter.remove(action.path);
        } else {
          if (!action.contentBase64) throw new Error(`\u670D\u52A1\u5668\u7F3A\u5C11\u6587\u4EF6\u5185\u5BB9\uFF1A${action.path}`);
          await this.ensureParent(action.path);
          await this.app.vault.adapter.writeBinary(action.path, base64ToArrayBuffer(action.contentBase64));
        }
      }
    } finally {
      window.setTimeout(() => {
        for (const action of actions) this.suppressPaths.delete(action.path);
      }, 2e3);
    }
  }
  async pollCommands() {
    if (!import_obsidian5.Platform.isMobile || !this.settings.serverUrl || !this.settings.serverPassword) return;
    try {
      const result = await this.serverRequest(
        "GET",
        `/v1/commands?deviceId=${encodeURIComponent(this.settings.deviceId)}`
      );
      const triggerSync = await this.handleCommands(result.commands);
      if (triggerSync) void this.syncNow(false);
    } catch (error) {
      console.error("Simple Link command poll", error);
      await this.recordError("\u6307\u4EE4\u68C0\u67E5", error);
    }
  }
  async handleCommands(commands) {
    if (!commands.length) return false;
    const acknowledged = [];
    let triggerSync = false;
    for (const command of commands) {
      try {
        if (command.kind === "notice") {
          new import_obsidian5.Notice(`${command.title}${command.body ? `
${command.body}` : ""}`, 8e3);
        } else if (command.kind === "sync") {
          new import_obsidian5.Notice(command.title || "\u670D\u52A1\u5668\u8981\u6C42\u540C\u6B65");
          triggerSync = true;
        } else if (command.kind === "open_file") {
          const path2 = command.payload.path;
          if (typeof path2 !== "string" || !path2) throw new Error("open_file \u6307\u4EE4\u7F3A\u5C11 path");
          await this.app.workspace.openLinkText(path2, "", false);
          new import_obsidian5.Notice(command.title || `\u5DF2\u6253\u5F00 ${path2}`);
        }
        acknowledged.push(command.id);
      } catch (error) {
        new import_obsidian5.Notice(`Simple Link \u6307\u4EE4\u5931\u8D25\uFF1A${messageOf2(error)}`, 8e3);
      }
    }
    if (acknowledged.length) {
      await this.serverRequest("POST", "/v1/commands/ack", {
        deviceId: this.settings.deviceId,
        ids: acknowledged
      });
    }
    return triggerSync;
  }
  getSetupPreview() {
    return this.setupPreview;
  }
  getSetupChoices() {
    return { ...this.setupChoices };
  }
  setSetupChoice(path2, choice) {
    this.setupChoices[path2] = choice;
    if (path2 === ".gitignore" && this.setupPreview) {
      applySetupIgnoreBase(this.setupPreview, choice, this.app.vault.configDir);
      this.setupTrackingChoice = void 0;
    }
  }
  getSetupTrackingChoice() {
    return this.setupTrackingChoice;
  }
  setSetupTrackingChoice(choice) {
    this.setupTrackingChoice = choice;
  }
  getVaultBasePath() {
    return this.vaultBasePath();
  }
  async readSetupOverlap(path2) {
    if (!this.settings.setupVerified || !this.setupPreview) throw new Error("\u8BF7\u5148\u68C0\u67E5\u672C\u5730\u4E0E\u8FDC\u7AEF\u6587\u4EF6");
    return this.setup().readOverlap(this.settings.setupVerified, this.setupPreview, path2);
  }
  setup() {
    return new GitSetup(this.vaultBasePath(), (program, args, timeoutMs, onOutput, stdinText, signal) => this.exec(program, args, program === "git" && (args[0] === "fetch" || args[0] === "push"), true, timeoutMs, onOutput, stdinText, signal), this.app.vault.configDir);
  }
  async inspectFileTracking() {
    if (import_obsidian5.Platform.isMobile || !this.settings.setupComplete) throw new Error("\u8BF7\u5148\u5B8C\u6210\u7535\u8111\u7AEF Git \u63A5\u5165");
    const nodeRequire3 = window.require;
    if (!nodeRequire3) throw new Error("\u6587\u4EF6\u8FFD\u8E2A\u68C0\u67E5\u4EC5\u652F\u6301\u7535\u8111\u7AEF");
    const fs2 = nodeRequire3("fs").promises;
    const path2 = nodeRequire3("path");
    const vaultPath = this.vaultBasePath();
    const root = (await this.gitRaw(["rev-parse", "--show-toplevel"])).trim();
    if ((await fs2.realpath(root)).toLowerCase() !== (await fs2.realpath(vaultPath)).toLowerCase()) {
      throw new Error("\u5F53\u524D Vault \u4E0D\u662F\u72EC\u7ACB\u7684 Git \u4ED3\u5E93\uFF0C\u65E0\u6CD5\u4FEE\u590D\u6587\u4EF6\u8FFD\u8E2A");
    }
    await this.ensureNormalGitState();
    let existingIgnore = "";
    try {
      existingIgnore = await fs2.readFile(path2.join(vaultPath, ".gitignore"), "utf8");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const tracked = (await this.gitRaw(["ls-files", "--cached", "-z"])).split("\0").filter(Boolean);
    const ignored = (await this.gitRaw(["ls-files", "-ci", "--exclude-standard", "-z"])).split("\0").filter(Boolean);
    const nestedRepos = await findNestedRepos(vaultPath, this.app.vault.configDir);
    const nestedData = new Set((await nestedRepoFiles(vaultPath, nestedRepos, (args) => this.gitRaw(args), this.app.vault.configDir)).filter((name) => nestedRepos.some((repo) => name === `${repo.directory}/data.json`)));
    const paths = [.../* @__PURE__ */ new Set([
      ...ignored.filter((file) => !nestedData.has(file)),
      ...tracked.filter((file) => shouldIgnore(file, recommendedIgnoreRules(this.app.vault.configDir), this.app.vault.configDir))
    ])].filter((file) => file !== ".gitignore").sort();
    return { paths, missingRules: missingSetupIgnoreRules(existingIgnore, this.app.vault.configDir) };
  }
  async repairFileTracking(preview) {
    let repaired = 0;
    await this.enqueueDesktopGit(async () => {
      const current = await this.inspectFileTracking();
      if (JSON.stringify(current) !== JSON.stringify(preview)) throw new Error("\u6587\u4EF6\u8FFD\u8E2A\u72B6\u6001\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u68C0\u67E5\u540E\u518D\u4FEE\u590D");
      await this.setup().appendIgnore([]);
      const ignored = (await this.gitRaw(["ls-files", "-ci", "--exclude-standard", "-z"])).split("\0").filter((file) => file && file !== ".gitignore");
      if (preview.paths.some((file) => !ignored.includes(file))) throw new Error("\u90E8\u5206\u6587\u4EF6\u4ECD\u672A\u88AB .gitignore \u6392\u9664\uFF0C\u5DF2\u505C\u6B62\u79FB\u9664 Git \u8DDF\u8E2A");
      for (const batch of pathBatches(preview.paths)) await this.git(["rm", "-f", "--cached", "--", ...batch]);
      repaired = preview.paths.length;
      return repaired > 0 || preview.missingRules.length > 0;
    }, "\u4FEE\u590D\u6587\u4EF6\u8FFD\u8E2A");
    return repaired;
  }
  async beginSetup() {
    if (this.syncing) throw new Error("\u5F53\u524D\u6709\u540C\u6B65\u4EFB\u52A1\u6B63\u5728\u8FD0\u884C\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5");
    await this.desktopGitQueue;
    this.settings.setupBackup = {
      step: this.settings.setupStep,
      repoUrl: this.settings.setupRepoUrl,
      verified: this.settings.setupVerified
    };
    this.settings.setupComplete = false;
    this.settings.setupMutationStarted = false;
    this.settings.setupStep = 1;
    this.settings.setupVerified = void 0;
    this.setupPreview = void 0;
    this.setupChoices = {};
    this.setupTrackingChoice = void 0;
    this.clearDesktopTimeouts();
    for (const interval of this.featureIntervals) window.clearInterval(interval);
    this.featureIntervals = [];
    await this.saveSettings();
    await this.refreshSyncView();
  }
  async cancelSetup() {
    const backup = this.settings.setupBackup;
    if (!backup) throw new Error("\u6CA1\u6709\u53EF\u6062\u590D\u7684\u65E7\u540C\u6B65\u914D\u7F6E");
    if (this.settings.setupMutationStarted) throw new Error("\u63A5\u5165\u5DF2\u5F00\u59CB\u4FEE\u6539\u672C\u5730 Git \u72B6\u6001\uFF1B\u8BF7\u5B8C\u6210\u63A5\u5165\u6216\u5148\u624B\u52A8\u68C0\u67E5 Git \u72B6\u6001\uFF0C\u4E0D\u80FD\u76F4\u63A5\u6062\u590D\u81EA\u52A8\u540C\u6B65\u3002");
    this.settings.setupStep = backup.step;
    this.settings.setupRepoUrl = backup.repoUrl;
    this.settings.setupVerified = backup.verified;
    this.settings.setupComplete = true;
    this.settings.setupBackup = void 0;
    this.settings.setupMutationStarted = false;
    this.setupPreview = void 0;
    this.setupChoices = {};
    this.setupTrackingChoice = void 0;
    await this.saveSettings();
    await this.restartDesktopAutomation();
    this.setStatus("\u684C\u9762\u7AEF \xB7 Git \u6A21\u5F0F");
    await this.refreshSyncView();
  }
  async authorizeSetup(onCode, signal) {
    await this.setup().login(onCode, signal);
    await this.detectDesktopGitDefaults();
  }
  async authorizeSetupWithToken(token) {
    await this.setup().loginWithToken(token);
    await this.detectDesktopGitDefaults();
    this.settings.setupStep = Math.max(this.settings.setupStep, 2);
    await this.saveSettings();
  }
  async checkSetupAuthorization() {
    await this.setup().checkTools();
    await this.setup().checkLogin();
    await this.detectDesktopGitDefaults();
    this.settings.setupStep = Math.max(this.settings.setupStep, 2);
    await this.saveSettings();
  }
  async createSetupRepository(name) {
    const url = await this.setup().createRepository(name);
    this.settings.setupRepoUrl = url;
    await this.saveSettings();
    await this.verifySetupRepository(url);
  }
  async verifySetupRepository(url) {
    const verified = await this.setup().verifyRepository(url);
    this.settings.setupRepoUrl = verified.url;
    this.settings.setupVerified = verified;
    this.settings.setupStep = 3;
    this.setupPreview = void 0;
    this.setupChoices = {};
    this.setupTrackingChoice = void 0;
    await this.saveSettings();
  }
  async inspectSetupRepository(onProgress) {
    const repoUrl = this.settings.setupVerified?.url || this.settings.setupRepoUrl;
    if (!repoUrl) throw new Error("\u8BF7\u5148\u586B\u5199\u5E76\u6838\u9A8C\u79C1\u4EBA\u4ED3\u5E93\u5730\u5740");
    onProgress?.("\u6B63\u5728\u786E\u8BA4\u4ED3\u5E93\u4E0E\u8BBF\u95EE\u6743\u9650\u2026");
    const verified = this.settings.setupComplete || !this.settings.setupVerified ? await this.setup().verifyRepository(repoUrl) : this.settings.setupVerified;
    this.settings.setupVerified = verified;
    this.setupPreview = await this.setup().preview(verified, onProgress);
    if (!this.settings.setupComplete) {
      this.setupChoices = {};
      this.setupTrackingChoice = void 0;
      this.settings.setupStep = 3;
      await this.saveSettings();
    }
  }
  async confirmSetupPreview() {
    if (!this.setupPreview) throw new Error("\u8BF7\u5148\u68C0\u67E5\u672C\u5730\u4E0E\u8FDC\u7AEF\u6587\u4EF6");
    if (setupIgnoreDiffers(this.setupPreview) && !this.setupChoices[".gitignore"]) {
      throw new Error("\u8BF7\u5148\u9009\u62E9 .gitignore \u57FA\u51C6\u3002");
    }
    for (const path2 of this.setupPreview.overlaps) {
      if (!this.setupChoices[path2]) throw new Error(`\u8BF7\u9009\u62E9\u540C\u540D\u6587\u4EF6\u7684\u4FDD\u7559\u7248\u672C\uFF1A${path2}`);
    }
    if ((this.setupPreview.trackedExcludedLocal.length || this.setupPreview.trackedExcludedRemote.length) && !this.setupTrackingChoice) {
      throw new Error("\u8BF7\u5148\u9009\u62E9\u5982\u4F55\u5904\u7406\u5DF2\u88AB Git \u8DDF\u8E2A\u7684\u5FFD\u7565\u6587\u4EF6\u3002");
    }
    this.settings.setupStep = 4;
    await this.saveSettings();
  }
  async finishSetup(confirmedRebuildTracking = false, onProgress) {
    const verified = this.settings.setupVerified;
    const preview = this.setupPreview;
    if (!verified || !preview) throw new Error("\u8BF7\u91CD\u65B0\u68C0\u67E5\u672C\u5730\u4E0E\u8FDC\u7AEF\u5185\u5BB9");
    if ((preview.trackedExcludedLocal.length || preview.trackedExcludedRemote.length) && !this.setupTrackingChoice) {
      throw new Error("\u8BF7\u5148\u9009\u62E9\u5982\u4F55\u5904\u7406\u5DF2\u88AB Git \u8DDF\u8E2A\u7684\u5FFD\u7565\u6587\u4EF6\u3002");
    }
    if (this.setupTrackingChoice === "rebuild" && !confirmedRebuildTracking) {
      throw new Error("\u8BF7\u5148\u786E\u8BA4\uFF1A\u505C\u6B62\u8DDF\u8E2A\u540E\uFF0C\u672C\u673A\u6587\u4EF6\u4FDD\u7559\uFF0C\u63A8\u9001\u4F1A\u4ECE\u8FDC\u7AEF\u5F53\u524D\u7248\u672C\u79FB\u9664\u8FD9\u4E9B\u6587\u4EF6\u3002");
    }
    let stage = "\u51C6\u5907\u63A5\u5165";
    const started = Date.now();
    const publishProgress = () => {
      const message = `\u9996\u6B21\u63A5\u5165 \xB7 ${stage}\uFF08\u5DF2\u7528\u65F6 ${Math.floor((Date.now() - started) / 1e3)} \u79D2\uFF09`;
      const tone = /Push|推送/.test(stage) ? "push" : /Merge：|合并本地/.test(stage) ? "merge" : /Fetch/.test(stage) ? "fetch" : /创建本地提交/.test(stage) ? "commit" : "checking";
      this.setSetupActivity(message, tone);
      onProgress?.(message);
    };
    publishProgress();
    const progressTimer = window.setInterval(publishProgress, 1e3);
    try {
      const skippedPaths = await this.setup().finish(verified, preview, this.setupChoices, {
        name: this.settings.gitAuthorName,
        email: this.settings.gitAuthorEmail
      }, async () => {
        this.settings.setupMutationStarted = true;
        await this.saveSettings();
      }, /* @__PURE__ */ new Set(), this.setupTrackingChoice === "rebuild", (current) => {
        stage = current;
        publishProgress();
      });
      stage = "\u4FDD\u5B58\u63A5\u5165\u914D\u7F6E";
      publishProgress();
      preview.missingIgnoreRules = [];
      this.settings.gitRemoteUrl = verified.url;
      this.settings.gitBranch = verified.branch;
      this.settings.setupComplete = true;
      this.settings.setupBackup = void 0;
      this.settings.setupMutationStarted = false;
      await this.saveSettings();
      stage = "\u542F\u7528\u7535\u8111\u7AEF Git \u540C\u6B65";
      publishProgress();
      await this.setDesktopSyncMode("git");
      if (!this.nativeGitEnabled()) throw new Error("\u5F53\u524D\u540C\u6B65\u4ECD\u5728\u8FD0\u884C\uFF0C\u8BF7\u7A0D\u540E\u542F\u7528\u7535\u8111\u7AEF Git \u540C\u6B65\u3002");
      this.setStatus(skippedPaths.length > 0 ? `\u9996\u6B21\u63A5\u5165\u5B8C\u6210 \xB7 ${skippedPaths.length} \u4E2A\u9884\u89C8\u540E\u53D8\u5316\u7684\u6587\u4EF6\u7559\u5F85\u540E\u7EED Commit` : "\u9996\u6B21\u63A5\u5165\u5B8C\u6210");
      if (skippedPaths.length > 0) new import_obsidian5.Notice(`\u9996\u6B21\u63A8\u9001\u6210\u529F\uFF1B${skippedPaths.length} \u4E2A\u9884\u89C8\u540E\u53D8\u5316\u7684\u6587\u4EF6\u672A\u63D0\u4EA4\uFF0C\u540E\u7EED\u5C06\u81EA\u52A8 Commit\u3002`, 1e4);
      window.clearInterval(progressTimer);
      this.setSetupActivity("\u9996\u6B21\u63A5\u5165\u5DF2\u6210\u529F \xB7 \u9996\u6B21\u63A8\u9001\u5B8C\u6210", "success");
      onProgress?.("\u9996\u6B21\u63A5\u5165\u5DF2\u6210\u529F \xB7 \u9996\u6B21\u63A8\u9001\u5B8C\u6210");
      await this.refreshSyncView();
      this.setupActivity = void 0;
    } catch (error) {
      const message = `${stage}\u5931\u8D25 \xB7 ${formatStatusError(messageOf2(error))}`;
      this.setSetupActivity(message, "error");
      onProgress?.(message, true);
      throw error;
    } finally {
      window.clearInterval(progressTimer);
    }
  }
  vaultBasePath() {
    const adapter = this.app.vault.adapter;
    if (!(adapter instanceof import_obsidian5.FileSystemAdapter)) throw new Error("\u5F53\u524D\u5E73\u53F0\u6CA1\u6709\u53EF\u7528\u7684\u672C\u5730 Vault \u8DEF\u5F84");
    return adapter.getBasePath();
  }
  async detectDesktopGitDefaults() {
    const needsAuthorName = !this.settings.gitAuthorName || this.settings.gitAuthorName === DEFAULT_GIT_AUTHOR_NAME;
    const needsAuthorEmail = !this.settings.gitAuthorEmail || this.settings.gitAuthorEmail === DEFAULT_GIT_AUTHOR_EMAIL;
    if (this.settings.gitRemoteUrl && !needsAuthorName && !needsAuthorEmail) return;
    try {
      const [remote, branch, authorName, authorEmail] = await Promise.all([
        ["remote", "get-url", "origin"],
        ["branch", "--show-current"],
        ["config", "user.name"],
        ["config", "user.email"]
      ].map((args) => this.git(args).then((value) => value.trim()).catch(() => "")));
      if (!this.settings.gitRemoteUrl) this.settings.gitRemoteUrl = remote;
      if (branch) this.settings.gitBranch = branch;
      if (needsAuthorName && authorName) this.settings.gitAuthorName = authorName;
      if (needsAuthorEmail && authorEmail) this.settings.gitAuthorEmail = authorEmail;
      await this.saveSettings();
    } catch {
    }
  }
  async getLightweightCliToken(repoUrl) {
    if (import_obsidian5.Platform.isMobile) throw new Error("\u8BF7\u5728\u7535\u8111\u7AEF\u53D6\u5F97 Token\uFF0C\u6216\u5728 GitHub \u4E2D\u521B\u5EFA\u540E\u586B\u5199\u3002");
    const { owner, name } = parseGithubRepoUrl(repoUrl);
    try {
      await this.exec("gh", ["auth", "status", "--active", "--hostname", "github.com"], false, true, 3e4);
    } catch (error) {
      throw new Error("\u767B\u5F55\u68C0\u67E5\u5931\u8D25\uFF1A" + messageOf2(error));
    }
    try {
      const permission = await this.exec("gh", ["api", "repos/" + owner + "/" + name, "--jq", ".permissions.push"], false, true, 3e4);
      if (permission.trim() !== "true") throw new Error("\u5F53\u524D\u8D26\u53F7\u6CA1\u6709\u76EE\u6807\u4ED3\u5E93\u7684\u5199\u5165\u6743\u9650\u3002");
    } catch (error) {
      throw new Error("\u4ED3\u5E93\u6743\u9650\u68C0\u67E5\u5931\u8D25\uFF1A" + messageOf2(error));
    }
    try {
      const token = (await this.exec("gh", ["auth", "token", "--hostname", "github.com"], false, true, 3e4)).trim();
      if (!token) throw new Error("GitHub CLI \u672A\u8FD4\u56DE Token\u3002");
      return { token, repoUrl: "https://github.com/" + owner + "/" + name + ".git" };
    } catch (error) {
      throw new Error("\u83B7\u53D6 Token \u5931\u8D25\uFF1A" + messageOf2(error));
    }
  }
  async exec(program, args, authenticated = false, trim = true, timeoutMs = 12e4, onOutput, stdinText, signal) {
    const nodeRequire3 = window.require;
    if (!nodeRequire3) throw new Error("\u5F53\u524D\u5E73\u53F0\u4E0D\u652F\u6301\u684C\u9762\u547D\u4EE4");
    const childProcess = nodeRequire3("child_process");
    const env = { ...process.env };
    if (program === "git") env.GIT_TERMINAL_PROMPT = "0";
    if (program === "git" && authenticated) {
      env.GIT_CONFIG_COUNT = "2";
      env.GIT_CONFIG_KEY_0 = "credential.helper";
      env.GIT_CONFIG_VALUE_0 = "";
      env.GIT_CONFIG_KEY_1 = "credential.https://github.com.helper";
      env.GIT_CONFIG_VALUE_1 = "!gh auth git-credential";
    }
    return await new Promise((resolve, reject) => {
      const child = childProcess.execFile(
        program,
        args,
        { cwd: this.vaultBasePath(), env, windowsHide: true, timeout: timeoutMs, maxBuffer: 20 * 1024 * 1024, signal },
        (error, stdout, stderr) => {
          if (error) {
            const diagnostic = (stderr || stdout || error.message).trim();
            const secret = stdinText?.trim();
            reject(new Error(secret ? diagnostic.split(secret).join("[hidden]") : diagnostic));
          } else resolve(trim ? stdout.trim() : stdout);
        }
      );
      if (onOutput) {
        child.stdout?.on("data", (chunk) => onOutput(String(chunk)));
        child.stderr?.on("data", (chunk) => onOutput(String(chunk)));
      }
      if (stdinText !== void 0) {
        child.stdin?.on("error", () => {
        });
        child.stdin?.end(stdinText);
      }
    });
  }
  git(args, authenticated = false) {
    return this.exec("git", args, authenticated);
  }
  gitRaw(args) {
    return this.exec("git", args, false, false);
  }
  async ensureDesktopGit() {
    if (!this.settings.gitRemoteUrl) throw new Error("\u8BF7\u586B\u5199 Git \u4ED3\u5E93\u5730\u5740");
    if (!this.settings.gitAuthorName || !this.settings.gitAuthorEmail) {
      throw new Error("\u8BF7\u586B\u5199 Git Author \u540D\u79F0\u548C\u90AE\u7BB1");
    }
    try {
      await this.git(["rev-parse", "--is-inside-work-tree"]);
    } catch {
      await this.git(["init", "-b", this.settings.gitBranch]);
    }
    await this.git(["config", "user.name", this.settings.gitAuthorName]);
    await this.git(["config", "user.email", this.settings.gitAuthorEmail]);
    const remotes = await this.git(["remote"]);
    if (remotes.split(/\s+/).includes("origin")) {
      await this.git(["remote", "set-url", "origin", this.settings.gitRemoteUrl]);
    } else {
      await this.git(["remote", "add", "origin", this.settings.gitRemoteUrl]);
    }
  }
  async testDesktopGit() {
    await this.exec("git", ["--version"]);
    await this.ensureDesktopGit();
    await this.git(["ls-remote", "--heads", "origin", this.settings.gitBranch], true);
  }
  async desktopGitSync() {
    await this.desktopCommitOnly();
    await this.desktopFetchAndMerge(true);
    await this.desktopPushOnly(false);
  }
  async desktopAutomaticPush(forceCommit = false) {
    if (forceCommit) await this.desktopCommitOnly();
    return await this.desktopPushOnly();
  }
  async desktopStartupSync() {
    const result = await this.desktopCommitOnly();
    if (result.committed) this.scheduleDesktopPush();
    const merged = await this.desktopFetchAndMerge();
    await this.resumeDesktopDirtyState();
    return result.committed || merged;
  }
  async desktopCommitOnly() {
    this.setSyncActivity("\u6B63\u5728\u68C0\u67E5\u672C\u673A\u4FEE\u6539\u2026", "checking");
    await this.ensureDesktopGit();
    await this.ensureNormalGitState();
    await this.prepareNestedRepositories();
    const changes = parseGitStatus(await this.gitRaw(["status", "--porcelain=v1", "-z"]));
    if (changes.length === 0) {
      this.setStatus("\u672C\u673A\u6CA1\u6709\u9700\u8981 Commit \u7684\u4FEE\u6539");
      await this.refreshSyncView();
      return { committed: false };
    }
    this.setSyncActivity(`\u6B63\u5728 Commit \xB7 ${changes.length} \u4E2A\u6587\u4EF6`, "commit");
    await this.git(["add", "-A"]);
    let committed = false;
    try {
      await this.git(["diff", "--cached", "--quiet"]);
    } catch {
      await this.git(["commit", "-m", `Zoey Commit: ${(/* @__PURE__ */ new Date()).toISOString()}`]);
      committed = true;
    }
    if (committed) this.resetDesktopCommitTracking();
    this.setStatus(committed ? `\u5DF2 Commit \xB7 ${changes.length} \u4E2A\u6587\u4EF6` : "\u672C\u673A\u6CA1\u6709\u9700\u8981 Commit \u7684\u4FEE\u6539");
    await this.refreshSyncView();
    return { committed };
  }
  async prepareNestedRepositories() {
    const vaultPath = this.vaultBasePath();
    const repos = await findNestedRepos(vaultPath, this.app.vault.configDir);
    if (!repos.length) return;
    const nodeRequire3 = window.require;
    if (!nodeRequire3) throw new Error("\u5185\u5D4C\u4ED3\u5E93\u540C\u6B65\u4EC5\u652F\u6301\u684C\u9762\u7AEF");
    const fs2 = nodeRequire3("fs").promises;
    const path2 = nodeRequire3("path");
    const ignorePath = path2.join(vaultPath, ".gitignore");
    let existing = "";
    try {
      existing = await fs2.readFile(ignorePath, "utf8");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const missing = nestedGitIgnoreRules(repos).filter((rule) => !existing.split(/\r?\n/).includes(rule));
    if (missing.length) {
      const eol = existing.includes("\r\n") ? "\r\n" : "\n";
      const separator = existing ? `${existing.endsWith("\n") ? "" : eol}${eol}` : "";
      await fs2.writeFile(ignorePath, `${existing}${separator}# Embedded Git metadata stays local${eol}${missing.join(eol)}${eol}`, "utf8");
    }
    await rebuildNestedRepoTracking(vaultPath, repos, (args) => this.gitRaw(args), this.app.vault.configDir);
  }
  async desktopFetchAndMerge(pushAfterResolve = false) {
    this.setSyncActivity("\u6B63\u5728\u68C0\u67E5\u4E91\u7AEF\u66F4\u65B0\u2026", "checking");
    await this.ensureDesktopGit();
    await this.ensureNormalGitState();
    this.setSyncActivity("\u6B63\u5728 Fetch \u4E91\u7AEF\u66F4\u65B0\u2026", "fetch");
    try {
      await this.traceDesktopGitStep(
        "Git fetch\uFF08\u8FDE\u63A5\u5E76\u4E0B\u8F7D\u8FDC\u7AEF\u5206\u652F\uFF09",
        () => this.git(["fetch", "origin", this.settings.gitBranch], true)
      );
    } catch (error) {
      if (!isMissingRemoteRefError(error)) throw error;
      this.desktopGitTrace[this.desktopGitTrace.length - 1] = "Git fetch\uFF1A\u8FDC\u7AEF\u5206\u652F\u4E0D\u5B58\u5728";
      this.setStatus("\u4E91\u7AEF\u5C1A\u65E0\u5206\u652F \xB7 \u7B49\u5F85\u9996\u6B21 Push");
      return false;
    }
    if (!await this.hasDesktopHead()) {
      this.desktopGitTrace.push("\u5408\u5E76\u68C0\u67E5\uFF1A\u672C\u673A\u5C1A\u65E0 Commit");
      this.setStatus("\u5DF2\u83B7\u53D6\u4E91\u7AEF\u4FE1\u606F \xB7 \u7B49\u5F85\u9996\u6B21 Commit");
      await this.recordSuccessfulPull();
      return false;
    }
    try {
      await this.git(["merge-base", "--is-ancestor", "FETCH_HEAD", "HEAD"]);
      this.desktopGitTrace.push("\u5408\u5E76\u68C0\u67E5\uFF1A\u8FDC\u7AEF\u63D0\u4EA4\u5DF2\u5305\u542B\u5728\u672C\u673A");
      this.deferredMergePaths = [];
      this.setStatus("\u4E91\u7AEF\u5DF2\u662F\u6700\u65B0");
      await this.recordSuccessfulPull();
      return false;
    } catch {
      this.desktopGitTrace.push("\u5408\u5E76\u68C0\u67E5\uFF1A\u8FDC\u7AEF\u6709\u65B0\u63D0\u4EA4");
    }
    const mergeBase = (await this.gitRaw(["merge-base", "HEAD", "FETCH_HEAD"])).trim();
    const localChanges = parseGitStatus(await this.gitRaw(["status", "--porcelain=v1", "-z"]));
    const remoteChanges = parseGitNameStatus(
      await this.gitRaw(["diff", "--name-status", "-z", "--find-renames", mergeBase, "FETCH_HEAD"])
    );
    const overlappingPaths = findRemoteChangeOverlaps(localChanges, remoteChanges);
    if (overlappingPaths.length > 0) {
      this.deferredMergePaths = overlappingPaths;
      const message = `\u540C\u6B65\u6682\u7F13 \xB7 ${overlappingPaths.length} \u4E2A\u6587\u4EF6\u4ECD\u5728\u4FEE\u6539`;
      if (pushAfterResolve) await this.scheduleDesktopPushRetry(message);
      throw new SyncDeferredError(message);
    }
    this.deferredMergePaths = [];
    this.setSyncActivity("\u6B63\u5728 Merge \u4E91\u7AEF\u66F4\u65B0\u2026", "merge");
    try {
      await this.traceDesktopGitStep("Git merge\uFF08\u5408\u5E76\u8FDC\u7AEF\u63D0\u4EA4\uFF09", () => this.git(["merge", "--no-edit", "FETCH_HEAD"]));
    } catch (error) {
      const conflicts = await this.getUnmergedPaths();
      if (conflicts.length === 0) throw error;
      if (pushAfterResolve) {
        this.settings.pendingMergePushAfterResolve = true;
        await this.saveSettings();
      }
      await this.resolveMergeConflicts(conflicts);
    }
    this.setStatus("\u4E91\u7AEF\u66F4\u65B0\u5DF2\u5408\u5E76");
    await this.recordSuccessfulPull();
    return true;
  }
  async recordSuccessfulPull() {
    this.settings.lastPullAt = Date.now();
    await this.saveSettings();
  }
  async desktopPushOnly(fetchBeforePush = true) {
    await this.ensureDesktopGit();
    await this.ensureNormalGitState();
    if (fetchBeforePush) await this.desktopFetchAndMerge(true);
    await this.ensureNormalGitState();
    if (!await this.getUnpushedCommitWindow()) {
      this.desktopGitTrace.push("\u4E0A\u4F20\u68C0\u67E5\uFF1A\u6CA1\u6709\u5F85\u4E0A\u4F20 Commit");
      this.clearDesktopPushRetry();
      this.setStatus("\u5DF2\u662F\u6700\u65B0 \xB7 \u65E0\u9700\u4E0A\u4F20");
      await this.refreshSyncView();
      return false;
    }
    this.desktopGitTrace.push("\u4E0A\u4F20\u68C0\u67E5\uFF1A\u5B58\u5728\u5F85\u4E0A\u4F20 Commit");
    this.setSyncActivity("\u6B63\u5728 Push \u672C\u673A Commit\u2026", "push");
    await this.traceDesktopGitStep(
      "Git push\uFF08\u4E0A\u4F20\u672C\u673A\u63D0\u4EA4\uFF09",
      () => this.git(["push", "-u", "origin", `HEAD:${this.settings.gitBranch}`], true)
    );
    this.clearDesktopPushRetry();
    this.settings.pendingMergePushAfterResolve = false;
    this.resetDesktopPushTracking();
    this.settings.lastSyncAt = Date.now();
    await this.saveSettings();
    this.setStatus("\u5DF2\u4E0A\u4F20 \xB7 \u521A\u521A");
    await this.refreshSyncView();
    return true;
  }
  async getPendingConflictPaths() {
    if (!this.nativeGitEnabled()) return [];
    try {
      return await this.getUnmergedPaths();
    } catch {
      return [];
    }
  }
  getDeferredMergePaths() {
    return [...this.deferredMergePaths];
  }
  async getUnmergedPaths() {
    const output = await this.gitRaw(["diff", "--name-only", "--diff-filter=U", "-z"]);
    return output.split("\0").filter(Boolean);
  }
  async resolveMergeConflicts(initialPaths) {
    let paths = initialPaths;
    while (paths.length > 0) {
      const outcome = await this.openConflictView(paths);
      if (outcome === "deferred") {
        const remaining = await this.getUnmergedPaths();
        throw new SyncDeferredError(`\u6709 ${remaining.length} \u4E2A\u5408\u5E76\u51B2\u7A81\u7B49\u5F85\u5904\u7406`);
      }
      try {
        await this.git(["-c", "core.editor=true", "merge", "--continue"]);
        return;
      } catch (error) {
        paths = await this.getUnmergedPaths();
        if (paths.length === 0) throw error;
      }
    }
  }
  async continuePendingMergeConflicts() {
    const pushAfterResolve = this.settings.pendingMergePushAfterResolve;
    try {
      await this.enqueueDesktopGit(async () => {
        const paths = await this.getUnmergedPaths();
        if (paths.length > 0) await this.resolveMergeConflicts(paths);
        else if ((await this.getInterruptedGitOperation())?.label === "Merge") {
          await this.git(["-c", "core.editor=true", "merge", "--continue"]);
        }
        if (this.settings.pendingMergePushAfterResolve) {
          await this.desktopPushOnly(false);
        }
        await this.refreshSyncView();
      }, pushAfterResolve ? "\u7EE7\u7EED\u5904\u7406\u5408\u5E76\u51B2\u7A81 + Push" : "\u7EE7\u7EED\u5904\u7406\u5408\u5E76\u51B2\u7A81");
    } catch (error) {
      if (error instanceof SyncDeferredError) return;
      if (this.settings.pendingMergePushAfterResolve) await this.scheduleDesktopPushRetry();
      new import_obsidian5.Notice(`Simple Link\uFF1A\u65E0\u6CD5\u7EE7\u7EED\u5904\u7406\u51B2\u7A81\u3002${messageOf2(error)}`, 12e3);
    }
  }
  async openConflictView(paths) {
    let leaf = this.app.workspace.getLeavesOfType(ZoeySyncConflictView.type)[0] ?? null;
    if (!leaf) leaf = this.app.workspace.getRightLeaf(false);
    if (!leaf) throw new Error("\u65E0\u6CD5\u6253\u5F00\u53F3\u4FA7\u540C\u6B65\u51B2\u7A81\u5904\u7406\u9762\u677F");
    await leaf.setViewState({ type: ZoeySyncConflictView.type, active: true });
    if (!(leaf.view instanceof ZoeySyncConflictView)) throw new Error("\u65E0\u6CD5\u6253\u5F00\u540C\u6B65\u51B2\u7A81\u5904\u7406\u89C6\u56FE");
    const view = leaf.view;
    await this.app.workspace.revealLeaf(leaf);
    return await new Promise((resolve) => view.start(paths, resolve));
  }
  async readConflictFile(path2) {
    try {
      return await this.app.vault.adapter.read(path2);
    } catch {
      return null;
    }
  }
  async applyConflictText(path2, content) {
    await this.app.vault.adapter.write(path2, content);
    await this.git(["add", "--", path2]);
  }
  async applyWholeConflictChoice(path2, source) {
    const checkoutSide = source === "github" ? "--theirs" : "--ours";
    const stage = source === "github" ? 3 : 2;
    try {
      await this.git(["checkout", checkoutSide, "--", path2]);
      await this.git(["add", "--", path2]);
    } catch (error) {
      try {
        await this.git(["cat-file", "-e", `:${stage}:${path2}`]);
      } catch {
        await this.git(["rm", "-f", "--", path2]);
        return;
      }
      throw error;
    }
  }
};
var FileTrackingModal = class extends import_obsidian5.Modal {
  constructor(app, plugin, preview) {
    super(app);
    this.plugin = plugin;
    this.preview = preview;
    this.running = false;
  }
  onOpen() {
    this.modalEl.addClass("zoey-sync-tracking-modal");
    const body = this.contentEl;
    body.empty();
    body.createEl("h2", { text: "\u68C0\u67E5\u5E76\u4FEE\u590D\u6587\u4EF6\u8FFD\u8E2A", cls: "zoey-sync-tracking-title" });
    body.createEl("p", { text: `\u5F85\u8865\u5145 ${this.preview.missingRules.length} \u6761\u5FFD\u7565\u89C4\u5219\uFF1B${this.preview.paths.length} \u4E2A\u5DF2\u8FFD\u8E2A\u6587\u4EF6\u5E94\u6539\u4E3A\u4EC5\u672C\u673A\u4FDD\u7559\u3002`, cls: "zoey-sync-tracking-summary" });
    body.createEl("p", { text: "\u4FEE\u590D\u53EA\u8C03\u6574\u8FD9\u4E9B\u6587\u4EF6\u7684 Git \u8DDF\u8E2A\uFF0C\u5E76\u8865\u9F50\u7F3A\u5C11\u7684 .gitignore \u89C4\u5219\u3002\u672C\u673A\u6587\u4EF6\u548C Git \u5386\u53F2\u90FD\u4F1A\u4FDD\u7559\uFF1B\u4E0B\u4E00\u6B21 commit\u3001push \u540E\uFF0C\u6587\u4EF6\u4F1A\u4ECE\u8FDC\u7AEF\u5F53\u524D\u7248\u672C\u9000\u51FA\u3002", cls: "zoey-sync-tracking-description" });
    if (this.preview.missingRules.length) {
      const rules = body.createEl("details", { cls: "zoey-sync-tracking-details" });
      rules.createEl("summary", { text: `\u67E5\u770B\u5F85\u8865\u5145\u7684\u89C4\u5219\uFF08${this.preview.missingRules.length}\uFF09` });
      rules.createEl("pre", { text: this.preview.missingRules.join("\n"), cls: "zoey-sync-tracking-preview" });
    }
    if (this.preview.paths.length) {
      const files = body.createEl("details", { cls: "zoey-sync-tracking-details" });
      files.createEl("summary", { text: `\u67E5\u770B\u5C06\u505C\u6B62\u8FFD\u8E2A\u7684\u6587\u4EF6\uFF08${this.preview.paths.length}\uFF09` });
      files.createEl("pre", { text: this.preview.paths.join("\n"), cls: "zoey-sync-tracking-preview" });
    }
    const actions = body.createDiv({ cls: "modal-button-container" });
    actions.createEl("button", { text: "\u5173\u95ED" }).addEventListener("click", () => this.close());
    const apply = actions.createEl("button", { text: "\u5E94\u7528\u4FEE\u590D", cls: "mod-cta" });
    apply.disabled = this.preview.paths.length === 0 && this.preview.missingRules.length === 0;
    apply.addEventListener("click", () => {
      if (this.running) return;
      this.running = true;
      apply.disabled = true;
      apply.setText("\u6B63\u5728\u4FEE\u590D\u2026");
      void this.plugin.repairFileTracking(this.preview).then((count) => {
        new import_obsidian5.Notice(`Simple Link\uFF1A\u5DF2\u8BA9 ${count} \u4E2A\u6587\u4EF6\u9000\u51FA Git \u8DDF\u8E2A\uFF1B\u672C\u673A\u6587\u4EF6\u5DF2\u4FDD\u7559`);
        this.close();
      }).catch((error) => {
        new import_obsidian5.Notice(`Simple Link\uFF1A\u4FEE\u590D\u5931\u8D25\u3002${messageOf2(error)}`, 1e4);
        apply.setText("\u8BF7\u5173\u95ED\u540E\u91CD\u65B0\u68C0\u67E5");
      }).finally(() => {
        this.running = false;
      });
    });
  }
};
var GitRepairModal = class extends import_obsidian5.Modal {
  constructor(app, plugin, operation) {
    super(app);
    this.plugin = plugin;
    this.operation = operation;
    this.repairing = false;
  }
  onOpen() {
    const container = this.contentEl;
    container.empty();
    container.createEl("h2", { text: "\u6062\u590D\u6B63\u5E38\u540C\u6B65" });
    container.createEl("p", {
      text: `\u68C0\u6D4B\u5230\u4E0A\u4E00\u6B21 ${this.operation} \u6CA1\u6709\u5B8C\u6210\uFF0C\u56E0\u6B64\u81EA\u52A8 Commit\u3001Merge \u548C Push \u5DF2\u6682\u505C\u3002`
    });
    const list = container.createEl("ul");
    list.createEl("li", { text: "\u4FDD\u62A4\u5F53\u524D\u672C\u673A\u5185\u5BB9\uFF0C\u5E76\u9000\u51FA\u672A\u5B8C\u6210\u7684\u5F02\u5E38\u64CD\u4F5C\u3002" });
    list.createEl("li", { text: "\u4EE5\u6062\u590D\u540E\u7684\u672C\u673A\u5185\u5BB9\u5EFA\u7ACB\u4E00\u4E2A\u65B0\u7684 commit\u3002" });
    list.createEl("li", { text: "Fetch \u4E91\u7AEF\u7248\u672C\u5E76\u5728\u672C\u673A merge\uFF1B\u5982\u6709\u51B2\u7A81\uFF0C\u5728\u53F3\u4FA7\u9762\u677F\u9010\u9879\u9009\u62E9\u3002" });
    list.createEl("li", { text: "\u4FEE\u590D\u5B8C\u6210\u540E\u7B49\u5F85\u6B63\u5E38 push \u8BA1\u65F6\uFF0C\u4E0D\u4F1A\u7ACB\u5373\u4E0A\u4F20\u3002" });
    container.createEl("p", {
      text: "\u64CD\u4F5C\u524D\u4F1A\u5EFA\u7ACB\u4E34\u65F6\u5B89\u5168\u5907\u4EFD\uFF1B\u6062\u590D\u6210\u529F\u540E\u81EA\u52A8\u6E05\u7406\uFF0C\u901A\u5E38\u4E0D\u9700\u8981\u4F60\u5904\u7406\u3002",
      cls: "zoey-sync-conflict__warning"
    });
    const actions = container.createDiv({ cls: "modal-button-container" });
    const cancel = actions.createEl("button", { text: "\u6682\u4E0D\u4FEE\u590D" });
    cancel.addEventListener("click", () => this.close());
    const repair = actions.createEl("button", { text: "\u786E\u8BA4\u6062\u590D", cls: "mod-cta" });
    repair.addEventListener("click", () => {
      if (this.repairing) return;
      this.repairing = true;
      this.close();
      new import_obsidian5.Notice("Simple Link\uFF1A\u6B63\u5728\u6062\u590D\u672C\u673A\u7248\u672C\u5E76\u68C0\u67E5\u4E91\u7AEF\u66F4\u65B0\u2026", 8e3);
      void this.plugin.repairInterruptedGitOperation().then((result) => {
        new import_obsidian5.Notice(
          `Simple Link\uFF1A${result.operation} \u5F02\u5E38\u72B6\u6001\u5DF2\u9000\u51FA${result.restoredLocalChanges ? "\uFF0C\u672C\u673A\u4FEE\u6539\u5DF2\u6062\u590D" : ""}\uFF1B\u672C\u5730 Commit \u548C\u4E91\u7AEF\u5408\u5E76\u68C0\u67E5\u5DF2\u5B8C\u6210\uFF0C\u5C1A\u672A\u7ACB\u5373 Push`,
          1e4
        );
      }).catch((error) => {
        if (error instanceof SyncDeferredError) {
          new import_obsidian5.Notice("Simple Link\uFF1A\u5F02\u5E38\u72B6\u6001\u5DF2\u9000\u51FA\uFF0C\u672C\u673A\u5185\u5BB9\u5DF2\u91CD\u65B0 commit\uFF1B\u5408\u5E76\u51B2\u7A81\u5DF2\u4FDD\u7559\u5728\u540C\u6B65\u9762\u677F\u7B49\u5F85\u5904\u7406", 12e3);
        } else {
          new import_obsidian5.Notice(`Simple Link\uFF1A\u5F02\u5E38\u4FEE\u590D\u672A\u5B8C\u6210\u3002${messageOf2(error)}`, 15e3);
        }
      });
    });
  }
};
var LocalHistorySlimModal = class extends import_obsidian5.Modal {
  constructor(app, plugin, preview) {
    super(app);
    this.plugin = plugin;
    this.preview = preview;
    this.running = false;
  }
  onOpen() {
    const body = this.contentEl;
    body.empty();
    body.createEl("h2", { text: "\u672C\u5730 Git \u5386\u53F2\u7626\u8EAB" });
    body.createEl("p", { text: "\u5DF2\u5B9E\u65F6\u6838\u5BF9 GitHub \u5206\u652F\u4E0E\u672C\u673A head \u4E00\u81F4\uFF0C\u5F53\u524D\u63D0\u4EA4\u5DF2\u4E0A\u4F20\u3002\u6267\u884C\u65F6\u4F1A\u518D\u6838\u5BF9\u4E00\u6B21\u3002" });
    body.createEl("p", {
      text: `\u672C\u673A\u7EA6\u6709 ${this.preview.totalCommits} \u4E2A\u53EF\u89C1 Commit\uFF0C\u5176\u4E2D ${this.preview.oldCommits} \u4E2A\u65E9\u4E8E 30 \u5929\uFF1BGit \u5BF9\u8C61\u7EA6 ${this.preview.localSizeMiB.toFixed(1)} MiB\u3002`
    });
    body.createEl("p", {
      text: "\u6267\u884C\u540E\u672C\u673A\u53EA\u4FDD\u7559\u6700\u8FD1\u7EA6 30 \u5929\u7684\u53EF\u89C1\u5386\u53F2\uFF0C\u5E76\u6E05\u7406\u65E7\u5BF9\u8C61\u548C\u672C\u5730\u6062\u590D\u8BB0\u5F55\u3002GitHub \u4E0A\u7684\u5B8C\u6574\u5386\u53F2\u4E0D\u4F1A\u4FEE\u6539\uFF1B\u4EE5\u540E\u4ECD\u53EF\u4ECE GitHub \u91CD\u65B0\u83B7\u53D6\u3002",
      cls: "zoey-sync-conflict__warning"
    });
    const actions = body.createDiv({ cls: "modal-button-container" });
    actions.createEl("button", { text: "\u53D6\u6D88" }).addEventListener("click", () => this.close());
    const confirm = actions.createEl("button", { text: "\u6E05\u7406\u672C\u673A\u65E7\u5386\u53F2", cls: "mod-cta" });
    confirm.disabled = this.preview.oldCommits === 0;
    confirm.addEventListener("click", () => {
      if (this.running) return;
      this.running = true;
      confirm.disabled = true;
      confirm.setText("\u6B63\u5728\u6E05\u7406\u2026");
      void this.plugin.slimLocalHistory().then(({ before, after }) => {
        this.close();
        new import_obsidian5.Notice(`Simple Link\uFF1A\u672C\u5730\u53EF\u89C1 Commit ${before.totalCommits} \u2192 ${after.totalCommits}\uFF1BGit \u5BF9\u8C61\u7EA6 ${before.localSizeMiB.toFixed(1)} \u2192 ${after.localSizeMiB.toFixed(1)} MiB\u3002`, 12e3);
      }).catch((error) => {
        this.running = false;
        confirm.disabled = false;
        confirm.setText("\u6E05\u7406\u672C\u673A\u65E7\u5386\u53F2");
        new import_obsidian5.Notice(`Simple Link\uFF1A\u6E05\u7406\u672A\u5B8C\u6210\u3002${messageOf2(error)}`, 15e3);
      });
    });
    if (this.preview.oldCommits === 0) {
      body.createEl("p", { text: "\u5F53\u524D\u6CA1\u6709\u65E9\u4E8E 30 \u5929\u7684\u53EF\u89C1 commit\uFF0C\u65E0\u9700\u6E05\u7406\u3002" });
    }
  }
};
var _ZoeySyncConflictView = class _ZoeySyncConflictView extends import_obsidian5.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.totalFiles = 0;
    this.settled = false;
    this.paths = [];
  }
  getViewType() {
    return _ZoeySyncConflictView.type;
  }
  getDisplayText() {
    return "\u5904\u7406\u540C\u6B65\u51B2\u7A81";
  }
  getIcon() {
    return "git-merge";
  }
  async onOpen() {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("zoey-sync-conflict-view");
    container.createDiv({ text: "\u6B63\u5728\u51C6\u5907\u51B2\u7A81\u5185\u5BB9\u2026", cls: "zoey-sync-conflict__intro" });
  }
  onClose() {
    if (!this.settled) this.finish("deferred", false);
    return Promise.resolve();
  }
  start(paths, done) {
    this.paths = [...paths];
    this.totalFiles = paths.length;
    this.done = done;
    this.settled = false;
    void this.renderCurrentFile();
  }
  finish(outcome, detach = true) {
    if (this.settled) return;
    this.settled = true;
    this.done?.(outcome);
    this.done = void 0;
    if (detach) this.leaf.detach();
  }
  async renderCurrentFile() {
    const path2 = this.paths[0];
    const content = await this.plugin.readConflictFile(path2);
    const blocks = content === null ? [] : parseConflictBlocks(content);
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("zoey-sync-conflict-view");
    container.createEl("h2", { text: "\u53D1\u73B0\u5185\u5BB9\u51B2\u7A81" });
    container.createEl("p", {
      text: "GitHub \u548C\u672C\u673A\u4FEE\u6539\u4E86\u540C\u4E00\u5904\u5185\u5BB9\u3002\u8BF7\u9010\u9879\u9009\u62E9\u6700\u7EC8\u4FDD\u7559\u4EC0\u4E48\uFF1B\u786E\u8BA4\u524D\u4E0D\u4F1A\u4E0A\u4F20\u5230 GitHub\u3002",
      cls: "zoey-sync-conflict__intro"
    });
    const progress = container.createDiv({ cls: "zoey-sync-conflict__progress" });
    progress.createSpan({ text: `\u5DF2\u5904\u7406 ${this.totalFiles - this.paths.length} / ${this.totalFiles}` });
    progress.createEl("code", { text: path2 });
    if (content === null || blocks.length === 0) {
      this.renderWholeFileChoice(container, path2);
      return;
    }
    this.renderTextBlocks(container, path2, content, blocks);
  }
  renderWholeFileChoice(container, path2) {
    container.createEl("p", {
      text: "\u8FD9\u4E2A\u6587\u4EF6\u65E0\u6CD5\u6309\u6587\u5B57\u5206\u6BB5\u663E\u793A\uFF0C\u901A\u5E38\u662F\u9644\u4EF6\u51B2\u7A81\uFF0C\u6216\u4E00\u53F0\u8BBE\u5907\u5220\u9664\u4E86\u6587\u4EF6\u3001\u53E6\u4E00\u53F0\u8BBE\u5907\u4FEE\u6539\u4E86\u5B83\u3002\u8BF7\u9009\u62E9\u4FDD\u7559\u54EA\u4E00\u8FB9\u3002",
      cls: "zoey-sync-conflict__warning"
    });
    const choices = container.createDiv({ cls: "zoey-sync-conflict__whole-actions" });
    this.createActionButton(choices, "\u4FDD\u7559 GitHub \u7248\u672C", async () => {
      await this.plugin.applyWholeConflictChoice(path2, "github");
      await this.advance();
    });
    this.createActionButton(choices, "\u4FDD\u7559\u672C\u673A\u7248\u672C", async () => {
      await this.plugin.applyWholeConflictChoice(path2, "local");
      await this.advance();
    }, true);
    this.renderFooter(container);
  }
  renderTextBlocks(container, path2, content, blocks) {
    const resolutions = Array.from({ length: blocks.length });
    let applyButton;
    blocks.forEach((block, index) => {
      const card = container.createDiv({ cls: "zoey-sync-conflict__block" });
      card.createEl("h3", { text: `\u7B2C ${index + 1} \u5904\u5DEE\u5F02` });
      const comparison = card.createDiv({ cls: "zoey-sync-conflict__comparison" });
      this.renderVersion(comparison, "GitHub \u4E0A\u7684\u5185\u5BB9", block.github, "is-github");
      this.renderVersion(comparison, "\u672C\u673A\u5185\u5BB9", block.local, "is-local");
      const actions = card.createDiv({ cls: "zoey-sync-conflict__block-actions" });
      actions.createSpan({ text: "\u6700\u7EC8\u4FDD\u7559\uFF1A", cls: "zoey-sync-conflict__action-label" });
      const result = card.createEl("textarea", { cls: "zoey-sync-conflict__result" });
      result.placeholder = "\u5148\u70B9\u51FB\u4E0B\u9762\u7684\u9009\u62E9\uFF0C\u4E5F\u53EF\u4EE5\u76F4\u63A5\u5728\u8FD9\u91CC\u7F16\u8F91\u6700\u7EC8\u5185\u5BB9";
      result.rows = Math.min(14, Math.max(4, block.github.split("\n").length, block.local.split("\n").length));
      const setResolution = (value) => {
        resolutions[index] = value;
        result.value = value;
        applyButton.disabled = resolutions.some((item) => item === void 0);
      };
      this.createActionButton(actions, "\u4F7F\u7528 GitHub \u5185\u5BB9", () => setResolution(block.github));
      this.createActionButton(actions, "\u4F7F\u7528\u672C\u673A\u5185\u5BB9", () => setResolution(block.local));
      this.createActionButton(actions, "\u4E24\u4EFD\u90FD\u4FDD\u7559", () => setResolution(block.github + block.local));
      result.addEventListener("input", () => {
        resolutions[index] = result.value;
        applyButton.disabled = resolutions.some((item) => item === void 0);
      });
    });
    applyButton = container.createEl("button", {
      text: this.paths.length === 1 ? "\u5E94\u7528\u5E76\u7EE7\u7EED\u540C\u6B65" : "\u5E94\u7528\u5E76\u5904\u7406\u4E0B\u4E00\u4E2A\u6587\u4EF6",
      cls: "mod-cta zoey-sync-conflict__continue"
    });
    applyButton.disabled = true;
    applyButton.addEventListener("click", asyncAction(async () => {
      if (resolutions.some((item) => item === void 0)) return;
      applyButton.disabled = true;
      try {
        await this.plugin.applyConflictText(path2, applyConflictResolutions(content, blocks, resolutions));
        await this.advance();
      } catch (error) {
        new import_obsidian5.Notice(`\u65E0\u6CD5\u5E94\u7528\u51B2\u7A81\u5904\u7406\u7ED3\u679C\uFF1A${messageOf2(error)}`, 8e3);
        applyButton.disabled = false;
      }
    }));
    this.renderFooter(container);
  }
  renderVersion(container, label, value, className) {
    const version = container.createDiv({ cls: `zoey-sync-conflict__version ${className}` });
    version.createDiv({ text: label, cls: "zoey-sync-conflict__source" });
    version.createEl("pre", { text: value || "\uFF08\u8FD9\u4E00\u8FB9\u5220\u9664\u4E86\u8FD9\u6BB5\u5185\u5BB9\uFF09" });
  }
  createActionButton(container, label, action, cta = false) {
    const button = container.createEl("button", { text: label, cls: cta ? "mod-cta" : void 0 });
    button.addEventListener("click", () => void action());
    return button;
  }
  renderFooter(container) {
    const footer = container.createDiv({ cls: "zoey-sync-conflict__footer" });
    const explanation = footer.createSpan({
      text: this.paths.length > 1 ? "\u53EF\u4EE5\u5148\u5904\u7406\u5176\u4ED6\u6587\u4EF6\uFF1B\u672A\u5904\u7406\u7684\u51B2\u7A81\u4F1A\u4E00\u76F4\u4FDD\u7559\u5728\u540C\u6B65\u9762\u677F\u3002" : "\u672A\u5904\u7406\u7684\u51B2\u7A81\u4F1A\u4E00\u76F4\u4FDD\u7559\u5728\u540C\u6B65\u9762\u677F\uFF0C\u7A0D\u540E\u53EF\u4EE5\u7EE7\u7EED\u3002"
    });
    const actions = footer.createDiv({ cls: "zoey-sync-conflict__footer-actions" });
    if (this.paths.length > 1) {
      this.createActionButton(actions, "\u7A0D\u540E\u5904\u7406\u6B64\u6587\u4EF6", () => void this.deferCurrentFile());
    }
    this.createActionButton(actions, "\u6682\u65F6\u6536\u8D77", () => this.finish("deferred"));
    explanation.setAttr("aria-live", "polite");
  }
  async advance() {
    this.paths.shift();
    if (this.paths.length > 0) {
      await this.renderCurrentFile();
    } else {
      this.finish("resolved");
    }
  }
  async deferCurrentFile() {
    const current = this.paths.shift();
    if (!current) return;
    this.paths.push(current);
    await this.renderCurrentFile();
  }
};
_ZoeySyncConflictView.type = "zoey-sync-conflict-view";
var ZoeySyncConflictView = _ZoeySyncConflictView;
var ErrorLogModal = class extends import_obsidian5.Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
  }
  onOpen() {
    this.modalEl.addClass("zoey-sync-error-modal");
    void this.render().catch((error) => new import_obsidian5.Notice(messageOf2(error), 8e3));
  }
  async render() {
    const lastCommitAt = await this.plugin.getLatestCommitAt();
    const container = this.contentEl;
    container.empty();
    const overview = container.createDiv({ cls: "zoey-sync-error-modal__overview" });
    const heading = overview.createDiv();
    heading.createEl("h2", { text: "\u6700\u8FD1\u540C\u6B65\u65E5\u5FD7" });
    heading.createEl("p", {
      text: "\u4EC5\u4FDD\u7559\u6700\u8FD1 24 \u5C0F\u65F6\u7684 commit\u3001\u540C\u6B65\u548C\u8FDE\u63A5\u8BB0\u5F55\u3002",
      cls: "zoey-sync-error-modal__intro"
    });
    const lastTimes = overview.createDiv({ cls: "zoey-sync-error-modal__last-times" });
    const formatTime = (timestamp) => {
      if (!timestamp) return "\u6682\u65E0\u8BB0\u5F55";
      const absolute = new Date(timestamp).toLocaleString("zh-CN", { hour12: false });
      const days = Math.floor(Math.max(0, Date.now() - timestamp) / 864e5);
      const relative = days >= 7 ? `${days} \u5929\u524D` : formatRelativeTime(timestamp);
      return `${absolute}\uFF08${relative}\uFF09`;
    };
    for (const [label, timestamp] of [
      ["\u4E0A\u6B21 Commit", lastCommitAt],
      ["\u4E0A\u6B21 Push", this.plugin.settings.lastSyncAt],
      ["\u4E0A\u6B21 Pull", this.plugin.settings.lastPullAt]
    ]) {
      const row = lastTimes.createDiv({ cls: "zoey-sync-error-modal__last-time" });
      row.createSpan({ text: label });
      row.createEl("time", { text: formatTime(timestamp) });
    }
    const logs = this.plugin.getRecentErrorLogs();
    if (logs.length === 0) {
      container.createDiv({ text: "\u6700\u8FD1 24 \u5C0F\u65F6\u6CA1\u6709\u540C\u6B65\u8BB0\u5F55\u3002", cls: "zoey-sync-error-modal__empty" });
    } else {
      const list = container.createDiv({ cls: "zoey-sync-error-modal__list" });
      for (const entry of logs) {
        const isError = entry.status !== "success";
        const item = list.createEl("details", {
          cls: `zoey-sync-error-modal__item ${isError ? "is-error" : "is-success"}`
        });
        const header = item.createEl("summary", { cls: "zoey-sync-error-modal__header" });
        header.createSpan({ text: entry.context, cls: "zoey-sync-error-modal__context" });
        header.createEl("time", {
          text: new Date(entry.timestamp).toLocaleString("zh-CN", { hour12: false }),
          cls: "zoey-sync-error-modal__time"
        });
        item.createEl("pre", { text: entry.message || "\u8FD9\u6761\u65E7\u8BB0\u5F55\u672A\u4FDD\u5B58\u6267\u884C\u8BE6\u60C5\u3002" });
      }
    }
    const actions = container.createDiv({ cls: "zoey-sync-error-modal__actions" });
    if (logs.length > 0) {
      const clearButton = actions.createEl("button", { text: "\u6E05\u7A7A\u65E5\u5FD7" });
      clearButton.addEventListener("click", asyncAction(async () => {
        await this.plugin.clearErrorLogs();
        await this.render();
      }));
    }
    const closeButton = actions.createEl("button", { text: "\u5173\u95ED", cls: "mod-cta" });
    closeButton.addEventListener("click", () => this.close());
  }
};
var _ZoeySyncView = class _ZoeySyncView extends import_obsidian5.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.renderGeneration = 0;
    this.lightweightPage = 0;
    this.closed = false;
  }
  getViewType() {
    return _ZoeySyncView.type;
  }
  getDisplayText() {
    return "Simple Link";
  }
  getIcon() {
    return "refresh-cw";
  }
  async onOpen() {
    this.closed = false;
    this.app.workspace.onLayoutReady(() => {
      window.setTimeout(() => {
        if (this.leaf.view !== this) return;
        void this.render().catch((error) => {
          new import_obsidian5.Notice(`Simple Link \u9762\u677F\u52A0\u8F7D\u5931\u8D25\uFF1A${messageOf2(error)}`, 1e4);
        });
      }, 0);
    });
  }
  async reviewDifferences(live) {
    if (this.review) throw new Error("\u5DF2\u6709\u8F7B\u91CF\u540C\u6B65\u5DEE\u5F02\u6B63\u5728\u786E\u8BA4");
    ++this.renderGeneration;
    const container = this.containerEl.children[1];
    const review = new ZoeySyncConflictPreviewModal(this.app, live);
    this.review = review;
    try {
      return await review.waitIn(container);
    } finally {
      this.review = void 0;
      container.removeClass("zoey-sync-preview", "is-mobile-review", "is-sidebar-review");
      if (!this.closed) await this.render();
    }
  }
  async onClose() {
    this.closed = true;
    ++this.renderGeneration;
    this.review?.close();
  }
  updateActivity(state) {
    const container = this.containerEl.children[1];
    const status = container.querySelector(".zoey-sync-view__status");
    if (!status) return;
    status.className = `zoey-sync-view__status is-${state.tone}`;
    status.querySelector(".zoey-sync-view__status-text")?.setText(state.text);
  }
  async render() {
    if (this.closed || this.review || !this.app.workspace.layoutReady) return;
    const generation = ++this.renderGeneration;
    const container = this.containerEl.children[1];
    const mode = this.plugin.getChangeViewMode();
    let changes = [];
    let changesError;
    const pendingConflictPaths = await this.plugin.getPendingConflictPaths();
    const deferredMergePaths = this.plugin.getDeferredMergePaths();
    try {
      changes = await this.plugin.getChanges(mode);
    } catch (error) {
      changesError = error;
    }
    let statusState = await this.getStatusState(mode, changes, changesError);
    if (pendingConflictPaths.length > 0) {
      statusState = { tone: "error", text: `\u6709 ${pendingConflictPaths.length} \u4E2A\u5408\u5E76\u51B2\u7A81\u7B49\u5F85\u5904\u7406` };
    } else if (deferredMergePaths.length > 0) {
      statusState = { tone: "error", text: `\u540C\u6B65\u6682\u7F13 \xB7 ${deferredMergePaths.length} \u4E2A\u6587\u4EF6\u4ECD\u5728\u4FEE\u6539` };
    }
    if (generation !== this.renderGeneration) return;
    container.empty();
    container.addClass("zoey-sync-view");
    const recentLogs = this.plugin.getRecentErrorLogs();
    const hasActiveError = !!this.plugin.getActiveSyncError() || recentLogs[0]?.status === "error";
    const header = container.createDiv({ cls: "zoey-sync-view__header" });
    const actions = header.createDiv({ cls: "zoey-sync-view__actions" });
    const layoutButton = actions.createDiv({ cls: "clickable-icon nav-action-button" });
    layoutButton.setAttr("role", "button");
    layoutButton.setAttr("tabindex", "0");
    layoutButton.setAttr("aria-label", "\u66F4\u6539\u5E03\u5C40");
    (0, import_obsidian5.setIcon)(layoutButton, LAYOUT_SWITCH_ICON);
    layoutButton.addEventListener("click", () => void this.plugin.toggleViewLayout());
    const refreshButton = actions.createDiv({ cls: "clickable-icon nav-action-button" });
    refreshButton.setAttr("role", "button");
    refreshButton.setAttr("tabindex", "0");
    refreshButton.setAttr("aria-label", "\u5237\u65B0\u66F4\u6539\u533A");
    (0, import_obsidian5.setIcon)(refreshButton, REFRESH_CHANGES_ICON);
    refreshButton.addEventListener("click", () => void this.render());
    if (recentLogs.length > 0) {
      const errorButton = actions.createDiv({
        cls: `clickable-icon nav-action-button zoey-sync-view__error-button${hasActiveError ? " is-active" : ""}`
      });
      errorButton.setAttr("role", "button");
      errorButton.setAttr("tabindex", "0");
      errorButton.setAttr("aria-label", `\u67E5\u770B\u6700\u8FD1\u540C\u6B65\u65E5\u5FD7\uFF0C\u5171 ${recentLogs.length} \u6761`);
      (0, import_obsidian5.setIcon)(errorButton, hasActiveError ? "triangle-alert" : "history");
      (0, import_obsidian5.setTooltip)(errorButton, `\u67E5\u770B\u6700\u8FD1\u540C\u6B65\u65E5\u5FD7\uFF08${recentLogs.length}\uFF09`);
      errorButton.addEventListener("click", () => new ErrorLogModal(this.app, this.plugin).open());
    }
    const settingsButton = actions.createDiv({ cls: "clickable-icon nav-action-button" });
    settingsButton.setAttr("role", "button");
    settingsButton.setAttr("tabindex", "0");
    settingsButton.setAttr("aria-label", "\u540C\u6B65\u9762\u677F\u8BBE\u7F6E");
    (0, import_obsidian5.setIcon)(settingsButton, "settings");
    (0, import_obsidian5.setTooltip)(settingsButton, "\u540C\u6B65\u9762\u677F\u8BBE\u7F6E");
    settingsButton.addEventListener("click", (event) => this.openViewSettingsMenu(event));
    const status = container.createDiv({ cls: "zoey-sync-view__status" });
    status.addClass(`is-${statusState.tone}`);
    status.createSpan({ cls: "zoey-sync-view__status-dot" });
    status.createSpan({ text: statusState.text, cls: "zoey-sync-view__status-text" });
    if (pendingConflictPaths.length > 0) {
      const reminder = container.createDiv({ cls: "zoey-sync-view__conflict-reminder" });
      (0, import_obsidian5.setIcon)(reminder.createSpan({ cls: "zoey-sync-view__conflict-reminder-icon" }), "triangle-alert");
      const copy = reminder.createDiv({ cls: "zoey-sync-view__conflict-reminder-copy" });
      copy.createDiv({ text: "\u540C\u6B65\u5C1A\u672A\u5B8C\u6210", cls: "zoey-sync-view__conflict-reminder-title" });
      copy.createDiv({
        text: `${pendingConflictPaths.length} \u4E2A\u5F02\u5E38\u6587\u4EF6\u7B49\u5F85\u786E\u8BA4\uFF1B\u5DF2\u80FD\u5408\u5E76\u7684\u5185\u5BB9\u4F1A\u4FDD\u7559\uFF0C\u4E0D\u4F1A\u88AB\u56DE\u6EDA\u3002`,
        cls: "zoey-sync-view__conflict-reminder-desc"
      });
      const continueButton = reminder.createEl("button", { text: "\u7EE7\u7EED\u5904\u7406", cls: "mod-cta" });
      continueButton.addEventListener("click", () => void this.plugin.continuePendingMergeConflicts());
    } else if (deferredMergePaths.length > 0) {
      const reminder = container.createDiv({
        cls: "zoey-sync-view__conflict-reminder zoey-sync-view__conflict-reminder--deferred"
      });
      (0, import_obsidian5.setIcon)(reminder.createSpan({ cls: "zoey-sync-view__conflict-reminder-icon" }), "triangle-alert");
      const copy = reminder.createDiv({ cls: "zoey-sync-view__conflict-reminder-copy" });
      const fileLabel = deferredMergePaths.length === 1 ? `\u201C${deferredMergePaths[0]}\u201D` : `${deferredMergePaths.length} \u4E2A\u6587\u4EF6`;
      copy.createDiv({ text: "\u540C\u6B65\u6682\u7F13\uFF1A\u6587\u4EF6\u4ECD\u5728\u4FEE\u6539", cls: "zoey-sync-view__conflict-reminder-title" });
      copy.createDiv({
        text: `${fileLabel}\u6B63\u5728\u4FEE\u6539\uFF0C\u4E91\u7AEF\u4E5F\u6709\u65B0\u7248\u672C\u3002\u4E3A\u907F\u514D\u8986\u76D6\u672C\u673A\u5185\u5BB9\uFF0C\u5DF2\u6682\u505C\u5408\u5E76\uFF1B\u505C\u6B62\u4FEE\u6539\u5E76\u5B8C\u6210\u672C\u5730 Commit \u540E\uFF0C\u5C06\u81EA\u52A8\u91CD\u65B0\u5C1D\u8BD5\u540C\u6B65\u3002`,
        cls: "zoey-sync-view__conflict-reminder-desc"
      });
    }
    const section = container.createDiv({ cls: "zoey-sync-view__section" });
    const sectionHeader = section.createDiv({ cls: "zoey-sync-view__section-header" });
    const actionButton = sectionHeader.createEl("button", { cls: "zoey-sync-view__section-action" });
    const actionSpinner = actionButton.createSpan({ cls: "zoey-sync-view__section-action-spinner" });
    const actionLabel = actionButton.createSpan({
      text: this.plugin.isSyncing() ? mode === "commit" ? "Commit \u4E2D\u2026" : "\u540C\u6B65\u4E2D\u2026" : mode === "commit" ? "Commit" : "\u540C\u6B65"
    });
    (0, import_obsidian5.setIcon)(actionSpinner, "loader-circle");
    actionButton.toggleClass("is-loading", this.plugin.isSyncing());
    actionButton.disabled = this.plugin.isSyncing() || pendingConflictPaths.length > 0;
    actionButton.setAttr(
      "aria-label",
      mode === "commit" ? "Commit \u5F53\u524D\u5217\u8868\u4E2D\u7684\u672C\u673A\u66F4\u6539" : "\u4E0B\u8F7D\u8FDC\u7AEF\u66F4\u65B0\u5E76\u4E0A\u4F20\u672C\u673A\u66F4\u6539"
    );
    actionButton.addEventListener("click", asyncAction(async () => {
      actionButton.disabled = true;
      actionButton.addClass("is-loading");
      actionLabel.setText(mode === "commit" ? "Commit \u4E2D\u2026" : "\u540C\u6B65\u4E2D\u2026");
      try {
        if (mode === "commit") await this.plugin.commitNow(true);
        else await this.plugin.syncNow(true);
        await this.render();
      } finally {
        actionButton.disabled = this.plugin.isSyncing();
        actionButton.removeClass("is-loading");
      }
    }));
    if (this.plugin.settings.showVersionViewSwitcher) {
      sectionHeader.addClass("has-mode-control");
      this.createModeControl(sectionHeader, mode);
    }
    if (!changesError) {
      if (mode === "commit" && changes.length === 0) actionButton.disabled = true;
      if (this.plugin.useLightweightSync() && this.plugin.isSyncing()) {
        section.createDiv({ text: "\u6B63\u5728\u6838\u5BF9\u4E24\u7AEF\u6216\u7B49\u5F85\u6587\u4EF6\u9009\u62E9\uFF0C\u5F53\u524D\u5217\u8868\u6682\u4E0D\u663E\u793A\u3002", cls: "zoey-sync-view__empty" });
      } else if (this.plugin.getLightweightPendingStatus()) {
        section.createDiv({ text: "\u5C1A\u672A\u5B8C\u6210\u8F7B\u91CF\u540C\u6B65\u9996\u6B21\u5BF9\u9F50\u3002\u70B9\u51FB\u540C\u6B65\u6838\u5BF9\u5B9E\u9645\u5DEE\u5F02\uFF1B\u6CA1\u6709\u57FA\u51C6\u65F6\uFF0C\u7A7A\u5217\u8868\u4E0D\u4EE3\u8868\u6CA1\u6709\u53D8\u5316\u3002", cls: "zoey-sync-view__empty" });
      } else if (changes.length === 0) {
        const empty = section.createDiv({ cls: "zoey-sync-view__empty" });
        (0, import_obsidian5.setIcon)(empty.createSpan(), "check-circle-2");
        empty.createSpan({ text: this.plugin.useLightweightSync() && this.plugin.settings.mobile.mode === "github" ? "\u672C\u673A\u6682\u672A\u53D1\u73B0\u5019\u9009\u53D8\u5316\uFF0C\u4E91\u7AEF\u72B6\u6001\u5C06\u5728\u540C\u6B65\u65F6\u6838\u5BF9" : mode === "upload" ? "\u6CA1\u6709\u5F85\u4E0A\u4F20\u6587\u4EF6" : "\u6CA1\u6709\u5F85 Commit \u6587\u4EF6" });
      } else {
        const lightweight = this.plugin.useLightweightSync() && this.plugin.settings.mobile.mode === "github";
        let visible = changes;
        if (lightweight) {
          section.createDiv({ text: "\u5019\u9009\u53D8\u5316\uFF1B\u540C\u6B65\u65F6\u68C0\u67E5\u54C8\u5E0C\u5E76\u6838\u5BF9\u4E91\u7AEF\u540E\u786E\u5B9A\u5B9E\u9645\u4F20\u8F93\u6570\u91CF\u3002" });
          const pages = Math.ceil(changes.length / 100);
          this.lightweightPage = Math.min(this.lightweightPage, pages - 1);
          visible = changes.slice(this.lightweightPage * 100, (this.lightweightPage + 1) * 100);
          if (pages > 1) {
            const paging = section.createDiv();
            const prev = paging.createEl("button", { text: "\u4E0A\u4E00\u9875" });
            prev.disabled = this.lightweightPage === 0;
            prev.addEventListener("click", () => {
              this.lightweightPage--;
              void this.render();
            });
            paging.createSpan({ text: " \u7B2C " + (this.lightweightPage + 1) + " / " + pages + " \u9875 " });
            const next = paging.createEl("button", { text: "\u4E0B\u4E00\u9875" });
            next.disabled = this.lightweightPage === pages - 1;
            next.addEventListener("click", () => {
              this.lightweightPage++;
              void this.render();
            });
          }
        }
        if (this.plugin.settings.viewLayout === "tree") this.renderTree(section, visible);
        else for (const change of visible) this.renderChange(section, change, true);
      }
    } else {
      if (mode === "commit") actionButton.disabled = true;
      section.createDiv({ text: `\u65E0\u6CD5\u8BFB\u53D6\u66F4\u6539\uFF1A${messageOf2(changesError)}`, cls: "zoey-sync-view__empty is-error" });
    }
  }
  createModeControl(parent, current) {
    const control = parent.createDiv({ cls: "zoey-sync-view__mode-control" });
    control.setAttr("role", "group");
    control.setAttr("aria-label", "\u9009\u62E9\u6587\u4EF6\u5217\u8868");
    const createChoice = (value, tooltip, svg) => {
      const button = control.createEl("button", { cls: "zoey-sync-view__mode-choice" });
      button.toggleClass("is-active", value === current);
      button.setAttr("aria-pressed", String(value === current));
      button.setAttr("aria-label", tooltip);
      (0, import_obsidian5.addIcon)(`simple-link-mode-${value}`, svg);
      (0, import_obsidian5.setIcon)(button, `simple-link-mode-${value}`);
      (0, import_obsidian5.setTooltip)(button, tooltip);
      button.addEventListener("click", () => void this.plugin.setChangeViewMode(value));
    };
    createChoice(
      "commit",
      "\u663E\u793A\u5F85 Commit \u6587\u4EF6",
      '<svg viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="6"/><path d="m6 9.1 2 2 4.2-4.5"/></svg>'
    );
    createChoice(
      "upload",
      "\u663E\u793A\u5F85\u4E0A\u4F20\u6587\u4EF6",
      '<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M9 12V4"/><path d="m6 7 3-3 3 3"/><path d="M4 13v1.5h10V13"/></svg>'
    );
  }
  openViewSettingsMenu(event) {
    const menu = new import_obsidian5.Menu();
    menu.addItem(
      (item) => item.setTitle("\u663E\u793A\u5F85 commit \u5217\u8868").setIcon(this.plugin.settings.showVersionViewSwitcher ? CHECKBOX_CHECKED_ICON : "square").onClick(() => void this.plugin.setVersionViewSwitcher(!this.plugin.settings.showVersionViewSwitcher))
    );
    menu.addSeparator();
    menu.addItem(
      (item) => item.setTitle("\u9884\u89C8\u51B2\u7A81\u754C\u9762").setIcon("git-merge").onClick(() => void this.plugin.openConflictPreview())
    );
    menu.addSeparator();
    menu.addItem(
      (item) => item.setTitle("\u6253\u5F00\u9AD8\u7EA7\u8BBE\u7F6E").setIcon("settings").onClick(() => this.plugin.openPluginSettings())
    );
    menu.showAtMouseEvent(event);
  }
  async getStatusState(mode, changes, changesError) {
    const setupActivity = this.plugin.getSetupActivity();
    if (setupActivity) return setupActivity;
    if (this.plugin.nativeGitEnabled() && !this.plugin.settings.setupComplete) {
      return { tone: "pending", text: `\u9996\u6B21\u63A5\u5165\u672A\u5B8C\u6210 \xB7 \u8BF7\u5728\u8BBE\u7F6E\u4E2D\u7EE7\u7EED\u7B2C ${this.plugin.getSetupPreview() ? this.plugin.settings.setupStep : Math.min(this.plugin.settings.setupStep, 3)} \u6B65` };
    }
    const activity = this.plugin.getSyncActivity();
    if (activity) return activity;
    if (this.plugin.isSyncing()) {
      return { tone: "checking", text: mode === "commit" ? "\u6B63\u5728\u6574\u7406 Commit \u7ED3\u679C\u2026" : "\u6B63\u5728\u6574\u7406\u540C\u6B65\u7ED3\u679C\u2026" };
    }
    if (changesError) {
      return { tone: "error", text: `\u8BFB\u53D6\u72B6\u6001\u5931\u8D25 \xB7 ${formatStatusError(messageOf2(changesError))}` };
    }
    const lightweightPending = this.plugin.getLightweightPendingStatus();
    if (lightweightPending) return lightweightPending;
    if (mode === "commit") {
      const lastCommitAt = await this.plugin.getLatestCommitAt();
      const lastCommitText = lastCommitAt ? `\u4E0A\u6B21\u786E\u8BA4 ${formatRelativeTime(lastCommitAt)}` : "\u5C1A\u672A\u786E\u8BA4";
      if (changes.length > 0) {
        return { tone: "pending", text: `\u5F85\u786E\u8BA4 \xB7 ${changes.length} \u4E2A\u6587\u4EF6 \xB7 ${lastCommitText}` };
      }
      return {
        tone: "success",
        text: lastCommitAt ? `\u5DF2\u786E\u8BA4 \xB7 ${formatRelativeTime(lastCommitAt)}` : "\u5DF2\u786E\u8BA4 \xB7 \u5C1A\u65E0 Commit \u8BB0\u5F55"
      };
    }
    const { lastSyncAt } = this.plugin.settings;
    const lastSyncText = lastSyncAt ? `${this.plugin.useLightweightSync() ? "\u4E0A\u6B21\u540C\u6B65" : "\u4E0A\u6B21 Push"} ${formatRelativeTime(lastSyncAt)}` : this.plugin.useLightweightSync() ? "\u5C1A\u672A\u540C\u6B65" : "\u5C1A\u672A Push";
    const activeError = this.plugin.getActiveSyncError();
    if (activeError) {
      const detail = `${activeError.context}\uFF1A${formatStatusError(activeError.message)}`;
      return { tone: "error", text: `\u540C\u6B65\u5F02\u5E38 \xB7 ${detail} \xB7 ${formatRelativeTime(activeError.timestamp)}` };
    }
    if (changes.length > 0) {
      return { tone: "pending", text: `${this.plugin.useLightweightSync() && this.plugin.settings.mobile.mode === "github" ? "\u5019\u9009\u53D8\u5316" : "\u5F85\u4E0A\u4F20"} \xB7 ${changes.length} \u4E2A\u6587\u4EF6 \xB7 ${lastSyncText}` };
    }
    return {
      tone: "success",
      text: this.plugin.useLightweightSync() ? lastSyncAt ? `\u672C\u673A\u65E0\u5019\u9009\u53D8\u5316 \xB7 \u4E0A\u6B21\u540C\u6B65 ${formatRelativeTime(lastSyncAt)}` : "\u672C\u673A\u65E0\u5019\u9009\u53D8\u5316 \xB7 \u5C1A\u65E0\u540C\u6B65\u8BB0\u5F55" : lastSyncAt ? `\u5DF2\u4E0A\u4F20 \xB7 ${formatRelativeTime(lastSyncAt)}` : "\u5DF2\u4E0A\u4F20 \xB7 \u5C1A\u65E0 Push \u8BB0\u5F55"
    };
  }
  renderTree(parent, changes) {
    const groups = /* @__PURE__ */ new Map();
    for (const change of changes) {
      const slash = change.path.indexOf("/");
      const group = slash === -1 ? "Vault \u6839\u76EE\u5F55" : change.path.slice(0, slash);
      const current = groups.get(group) ?? [];
      current.push(change);
      groups.set(group, current);
    }
    for (const [group, items] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const groupEl = parent.createDiv({ cls: "zoey-sync-view__group" });
      const label = groupEl.createDiv({ cls: "zoey-sync-view__group-label" });
      (0, import_obsidian5.setIcon)(label.createSpan(), "folder-closed");
      label.createSpan({ text: group });
      label.createSpan({ text: String(items.length), cls: "zoey-sync-view__group-count" });
      for (const change of items) this.renderChange(groupEl, change, false);
    }
  }
  renderChange(parent, change, fullPath) {
    const row = parent.createDiv({ cls: "zoey-sync-view__change" });
    row.setAttr("data-kind", change.kind);
    row.createSpan({ text: this.changeMark(change.kind), cls: "zoey-sync-view__mark" });
    const text = row.createDiv({ cls: "zoey-sync-view__change-text" });
    const label = fullPath ? change.path : change.path.split("/").slice(1).join("/") || change.path;
    text.createDiv({ text: label, cls: "zoey-sync-view__path" });
    if (change.kind === "moved" && change.oldPath) {
      text.createDiv({ text: `\u4ECE ${change.oldPath}`, cls: "zoey-sync-view__old-path" });
    }
    if (change.kind !== "deleted") {
      row.addClass("is-clickable");
      row.addEventListener("click", () => void this.app.workspace.openLinkText(change.path, "", false));
    }
  }
  changeMark(kind) {
    if (kind === "added") return "+";
    if (kind === "deleted") return "\u2212";
    if (kind === "moved") return "\u2192";
    return "M";
  }
};
_ZoeySyncView.type = "zoey-sync-view";
var ZoeySyncView = _ZoeySyncView;
var ZoeySyncSettingTab = class extends import_obsidian5.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.desktopPage = "root";
    this.setupViewStep = 1;
    this.lightweightGuideToken = "";
    this.lightweightGuideStatus = "";
    this.lightweightGuideStep = 1;
    this.lightweightGuideLogin = "";
    this.lightweightGuideRepoMode = "existing";
    this.lightweightGuideRepoName = "";
    this.lightweightGuideBusy = false;
    this.setupRepoInput = "";
    this.setupRepoNameInput = "";
    this.setupRepoMode = "existing";
    this.setupPlatform = "github";
    this.setupAuthMode = null;
    this.setupDeviceCode = "";
    this.setupBrowserPending = false;
    this.setupBrowserRequest = 0;
    this.setupTokenInput = "";
    this.setupAuthVerified = false;
    this.setupBusy = false;
    this.setupRebuildConfirmed = false;
    this.setupTrackingPending = false;
    this.setupMessage = "";
    this.setupFailure = false;
  }
  getSettingDefinitions() {
    return [{ name: "\u540C\u6B65\u4E0E\u8BBE\u5907\u8BBE\u7F6E", aliases: ["\u7535\u8111", "\u624B\u673A", "\u670D\u52A1\u5668", "GitHub", "Token"], render: (setting) => {
      setting.settingEl.empty();
      setting.settingEl.addClass("simple-link-settings-render");
      this.settingsHost = setting.settingEl;
      this.renderSettings();
      return () => {
        this.settingsHost = void 0;
        this.lightweightGuideController?.abort();
        this.setupBrowserController?.abort();
      };
    } }];
  }
  display() {
    this.renderSettings();
  }
  renderSettings() {
    const containerEl = this.settingsHost ?? this.containerEl;
    containerEl.empty();
    if (this.desktopPage !== "beginner-mobile") {
      this.lightweightGuideController?.abort();
      this.lightweightGuideController = void 0;
      this.lightweightGuideToken = "";
      this.lightweightGuideStatus = "";
      this.lightweightGuideStep = 1;
      this.lightweightGuideDraft = void 0;
      this.lightweightGuideLogin = "";
      this.lightweightGuideVerified = void 0;
    }
    containerEl.addClass("zoey-sync-settings");
    containerEl.toggleClass("zoey-sync-setup-page", ["setup", "desktop-settings"].includes(this.desktopPage) && !import_obsidian5.Platform.isMobile);
    containerEl.toggleClass("zoey-sync-mobile-guide-page", this.desktopPage === "beginner-mobile");
    if (this.desktopPage === "beginner-mobile") {
      this.displayBeginnerMobile(containerEl);
      return;
    }
    if (this.desktopPage === "beginner-desktop") {
      this.displayDevicePreview(containerEl, "\u4ECE\u521B\u5EFA\u4ED3\u5E93\u5F00\u59CB\uFF1A\u7535\u8111\u7AEF\u540C\u6B65", "\u8BF7\u5728\u7535\u8111\u7AEF\u6253\u5F00\u6B64\u5F15\u5BFC\uFF0C\u5B8C\u6210 GitHub \u6388\u6743\u3001\u4ED3\u5E93\u63A5\u5165\u4E0E\u4E24\u7AEF\u68C0\u67E5\u3002");
      return;
    }
    if (this.desktopPage === "beginner-server") {
      this.displayDevicePreview(containerEl, "\u4ECE\u96F6\u5F00\u59CB\u7684\u670D\u52A1\u5668\u7AEF\u540C\u6B65\u6307\u5357", "\u670D\u52A1\u5668\u7AEF\u63A5\u5165\u5F15\u5BFC\u5C06\u5728\u8FD9\u91CC\u8865\u5145\u3002");
      return;
    }
    if (this.desktopPage === "mobile") {
      this.displayMobilePreview(containerEl);
      return;
    }
    if (this.desktopPage === "server") {
      this.displayServerPreview(containerEl);
      return;
    }
    if (!import_obsidian5.Platform.isMobile && this.desktopPage === "setup") {
      this.displaySetup(containerEl);
      return;
    }
    if (!import_obsidian5.Platform.isMobile && this.desktopPage === "desktop-settings") {
      this.displayDesktopSettings(containerEl);
      return;
    }
    this.addEnableSetting(containerEl);
    this.addDefaultRepoSetting(containerEl);
    this.displayBeginner(containerEl);
    this.displayDesktop(containerEl);
  }
  addDefaultRepoSetting(parent) {
    const row = new import_obsidian5.Setting(parent).setName("\u5F53\u524D\u7ED1\u5B9A Git \u4ED3\u5E93").addText((input) => input.setPlaceholder("https://github.com/\u7528\u6237\u540D/\u4ED3\u5E93.git").setValue(this.plugin.settings.boundRepoUrl).onChange(async (value) => {
      this.plugin.settings.boundRepoUrl = value.trim();
      await this.plugin.saveSettings();
    }));
    row.settingEl.addClass("zoey-sync-stacked-setting");
  }
  addDesktopEngineControls(parent) {
    if (import_obsidian5.Platform.isMobile) return;
    const row = new import_obsidian5.Setting(parent).setName("\u542F\u7528\u7535\u8111\u7AEF\u539F\u751F Git \u540C\u6B65").setDesc("\u5173\u95ED\u540E\u505C\u6B62\u539F\u751F Git \u540C\u6B65\uFF0C\u4E0B\u65B9\u8BBE\u7F6E\u6682\u505C\u4F7F\u7528\u3002").addToggle((toggle) => toggle.setValue(this.plugin.nativeGitEnabled()).onChange(async (enabled) => {
      await this.plugin.setDesktopSyncMode(enabled ? "git" : this.plugin.useLightweightSync() ? "lightweight" : "off");
      this.renderSettings();
    }));
    row.settingEl.addClass("zoey-sync-engine-switch");
  }
  addLightweightEngineControl(parent) {
    const row = new import_obsidian5.Setting(parent).setName("\u542F\u7528\u8F7B\u91CF Git \u540C\u6B65").setDesc("\u5173\u95ED\u540E\u505C\u6B62\u8F7B\u91CF\u540C\u6B65\uFF0C\u4E0B\u65B9\u8BBE\u7F6E\u6682\u505C\u4F7F\u7528\u3002").addToggle((toggle) => toggle.setValue(this.plugin.useLightweightSync()).onChange(async (enabled) => {
      await this.plugin.setLightweightSyncEnabled(enabled);
      this.renderSettings();
    }));
    row.settingEl.addClass("zoey-sync-engine-switch");
  }
  syncSettingsBody(parent, enabled) {
    const body = parent.createEl("fieldset", { cls: "zoey-sync-engine-body" });
    body.disabled = !enabled;
    body.inert = !enabled;
    body.toggleClass("is-disabled", !enabled);
    return body;
  }
  addEnableSetting(parent) {
    new import_obsidian5.Setting(parent).setName("\u542F\u7528 Simple Link").setDesc("\u663E\u793A\u53F3\u4FA7\u540C\u6B65\u9762\u677F\uFF0C\u5E76\u5141\u8BB8\u624B\u52A8\u6216\u5B9A\u65F6\u540C\u6B65\u3002\u5173\u95ED\u540E\u4FDD\u7559\u914D\u7F6E\uFF0C\u4F46\u505C\u6B62\u672C\u63D2\u4EF6\u7684\u540C\u6B65\u5DE5\u4F5C\u3002").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.enabled).onChange(async (value) => {
        await this.plugin.setFeatureEnabled(value);
        this.renderSettings();
      })
    );
  }
  displayMobile(containerEl) {
    new import_obsidian5.Setting(containerEl).setName("\u624B\u673A\u7AEF\u8BBE\u7F6E").setHeading();
    containerEl.createEl("p", {
      text: "\u79FB\u52A8\u7AEF\u517C\u5BB9\u4ECD\u5728\u5B8C\u5584\uFF0C\u4EE5\u4E0B\u4EC5\u4FDD\u7559\u5F53\u524D\u5DF2\u7ECF\u5B9E\u73B0\u7684\u670D\u52A1\u5668\u540C\u6B65\u8BBE\u7F6E\u3002",
      cls: "zoey-sync-section-desc"
    });
    new import_obsidian5.Setting(containerEl).setName("\u670D\u52A1\u5668\u5730\u5740").setDesc("\u516C\u7F51\u5FC5\u987B\u4F7F\u7528 HTTPS\uFF0C\u4F8B\u5982 HTTPS://sync.example.com\u3002").addText(
      (text) => text.setPlaceholder("https://sync.example.com").setValue(this.plugin.settings.serverUrl).onChange(async (value) => {
        this.plugin.settings.serverUrl = value.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian5.Setting(containerEl).setName("\u8BA4\u8BC1\u5BC6\u7801").setDesc("\u4FDD\u5B58\u5728\u672C\u673A\u63D2\u4EF6\u6570\u636E\u4E2D\uFF1B\u8BE5\u6587\u4EF6\u5DF2\u52A0\u5165 Git \u5FFD\u7565\u3002").addText((text) => {
      text.inputEl.type = "password";
      text.setValue(this.plugin.settings.serverPassword).onChange(async (value) => {
        this.plugin.settings.serverPassword = value;
        await this.plugin.saveSettings();
      });
    });
    new import_obsidian5.Setting(containerEl).setName("\u8BBE\u5907\u540D\u79F0").addText(
      (text) => text.setValue(this.plugin.settings.deviceName).onChange(async (value) => {
        this.plugin.settings.deviceName = value.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian5.Setting(containerEl).setName("\u81EA\u52A8\u540C\u6B65\u95F4\u9694\uFF08\u5206\u949F\uFF09").addText(
      (text) => text.setValue(String(this.plugin.settings.mobileAutoSyncMinutes)).onChange(async (value) => {
        this.plugin.settings.mobileAutoSyncMinutes = Math.max(0, Number(value) || 0);
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian5.Setting(containerEl).setName("\u6307\u4EE4\u68C0\u67E5\u95F4\u9694\uFF08\u79D2\uFF09").addText(
      (text) => text.setValue(String(this.plugin.settings.commandPollSeconds)).onChange(async (value) => {
        this.plugin.settings.commandPollSeconds = Math.max(15, Number(value) || 60);
        await this.plugin.saveSettings();
      })
    );
  }
  currentDevice() {
    if (import_obsidian5.Platform.isMobile) return "mobile";
    return typeof process !== "undefined" && process.platform === "linux" ? "server" : "git";
  }
  addCurrentDeviceBadge(button) {
    button.createSpan({ text: "\u7CFB\u7EDF\u8BC6\u522B \xB7 \u5F53\u524D\u8BBE\u5907", cls: "zoey-sync-device-badge" });
  }
  addBeginnerLink(parent, title, icon, page) {
    const button = parent.createEl("button", { cls: "zoey-sync-page-link zoey-sync-beginner-link", attr: { type: "button" } });
    (0, import_obsidian5.setIcon)(button.createSpan({ cls: "zoey-sync-page-link__icon" }), icon);
    button.createSpan({ text: title, cls: "zoey-sync-page-link__title" });
    button.addEventListener("click", () => {
      if (page === "setup") this.prepareSetupGuide();
      this.desktopPage = page;
      this.renderSettings();
    });
  }
  prepareSetupGuide() {
    this.stopSetupBrowserAuthorization();
    this.setupAuthMode = null;
    this.setupAuthVerified = false;
    this.setupFailure = false;
    this.setupViewStep = !this.plugin.settings.setupComplete && this.plugin.settings.setupStep === 4 && !this.plugin.getSetupPreview() ? 3 : this.plugin.settings.setupStep;
    this.setupRepoInput = this.plugin.settings.setupRepoUrl || this.plugin.settings.gitRemoteUrl;
    this.setupRepoMode = "existing";
  }
  displayBeginner(containerEl) {
    new import_obsidian5.Setting(containerEl).setName("\u5165\u95E8\u5C0F\u52A9\u624B").setHeading();
    containerEl.createEl("p", { text: "\u4ECE\u521B\u5EFA\u4ED3\u5E93\u5F00\u59CB\uFF0C\u6309\u8BBE\u5907\u67E5\u770B\u63A5\u5165\u6B65\u9AA4\u3002", cls: "zoey-sync-section-desc" });
    const links = containerEl.createDiv({ cls: "zoey-sync-beginner-links" });
    this.addBeginnerLink(links, "\u7535\u8111\u7AEF\u540C\u6B65\u5F15\u5BFC", "monitor", import_obsidian5.Platform.isMobile ? "beginner-desktop" : "setup");
    this.addBeginnerLink(links, "\u8F7B\u91CF\u540C\u6B65\u5F15\u5BFC", "smartphone", "beginner-mobile");
    this.addBeginnerLink(links, "\u670D\u52A1\u5668\u7AEF\u540C\u6B65\u5F15\u5BFC", "server", "beginner-server");
  }
  displayBeginnerMobile(containerEl) {
    containerEl.addClass("zoey-sync-setup-page");
    const page = containerEl.createDiv({ cls: "zoey-sync-setup-layout" });
    this.displayDevicePreview(page, "\u8F7B\u91CF\u540C\u6B65\u5F15\u5BFC", "\u6309\u56DB\u6B65\u5B8C\u6210 Token \u6388\u6743\u3001\u4ED3\u5E93\u6838\u9A8C\u4E0E\u540C\u6B65\u89C4\u5219\u8BBE\u7F6E\u3002");
    if (!this.lightweightGuideDraft) {
      const options = this.plugin.settings.mobile;
      const repoUrl = this.plugin.settings.boundRepoUrl || options.repoUrl || this.plugin.settings.gitRemoteUrl || this.plugin.settings.setupRepoUrl;
      this.lightweightGuideDraft = {
        ...options,
        plugins: [...options.plugins],
        ignorePatterns: [...options.ignorePatterns],
        repoUrl,
        branch: options.repoUrl === repoUrl ? options.branch : ""
      };
    }
    page.createDiv({ text: "\u63A5\u5165\u8FDB\u5EA6", cls: "zoey-sync-setup-progress-label" });
    const nav = page.createDiv({ cls: "zoey-sync-setup-nav zoey-sync-lightweight-nav" });
    const available = this.lightweightGuideVerified ? 4 : this.lightweightGuideLogin ? 3 : 2;
    ["\u83B7\u53D6 Token", "\u6838\u9A8C Token", "\u9009\u62E9\u4ED3\u5E93", "\u540C\u6B65\u89C4\u5219"].forEach((label, index) => {
      const step = index + 1;
      const done = step === 1 ? !!(this.lightweightGuideToken || this.lightweightGuideLogin) : step === 2 ? !!this.lightweightGuideLogin : step === 3 && !!this.lightweightGuideVerified;
      const button = nav.createEl("button", {
        cls: `zoey-sync-setup-nav__step${step === this.lightweightGuideStep ? " is-active" : ""}${done ? " is-done" : ""}`,
        attr: { type: "button", "aria-current": step === this.lightweightGuideStep ? "step" : "false" }
      });
      button.createSpan({ text: String(step), cls: "zoey-sync-setup-nav__marker" });
      button.createSpan({ text: label, cls: "zoey-sync-setup-nav__label" });
      button.disabled = step > available || this.lightweightGuideBusy;
      button.addEventListener("click", () => {
        if (this.lightweightGuideBusy || step === 3 && !this.lightweightGuideLogin || step === 4 && !this.lightweightGuideVerified) return;
        this.lightweightGuideController?.abort();
        this.lightweightGuideStep = step;
        this.renderSettings();
      });
    });
    if (this.lightweightGuideStep !== 1) {
      this.displayLightweightGuideStep(page);
      return;
    }
    const card = page.createDiv({ cls: "zoey-sync-mobile-guide__card" });
    const ready = !!this.lightweightGuideToken;
    new import_obsidian5.Setting(card).setName("1 \xB7 \u83B7\u53D6 token").setHeading();
    card.createEl("p", { text: "\u5EFA\u8BAE\u5148\u5728\u7535\u8111\u7AEF\u5B8C\u6210\u6D4F\u89C8\u5668\u767B\u5F55\u6388\u6743\uFF0C\u518D\u5728\u672C\u5F15\u5BFC\u5185\u4E00\u952E\u83B7\u53D6 token\u3002\u624B\u673A\u7AEF\u53EF\u9009\u62E9\u300C\u5DF2\u6709 token\uFF0C\u76F4\u63A5\u586B\u5165\u300D\u6838\u9A8C\u8FDE\u63A5\u3002", cls: "zoey-sync-section-desc" });
    const loginStatus = card.createDiv({ cls: "zoey-sync-setup-status", attr: { role: "status", "aria-live": "polite" } });
    const loginIcon = loginStatus.createSpan({ cls: "zoey-sync-setup-status__icon" });
    (0, import_obsidian5.setIcon)(loginIcon, "loader-circle");
    const loginCopy = loginStatus.createDiv({ cls: "zoey-sync-setup-status__copy" });
    const loginTitle = loginCopy.createEl("strong", { text: "\u6B63\u5728\u68C0\u67E5\u672C\u673A\u767B\u5F55\u72B6\u6001\u2026" });
    const loginDescription = loginCopy.createEl("p", { text: "\u68C0\u67E5 Git \u4E0E GitHub CLI\u3002" });
    const prerequisites = loginStatus.createEl("button", { text: "\u5B89\u88C5\u4E0E\u767B\u5F55\u5E2E\u52A9", attr: { type: "button" } });
    prerequisites.hidden = true;
    prerequisites.addEventListener("click", () => {
      this.desktopPage = import_obsidian5.Platform.isMobile ? "beginner-desktop" : "setup";
      this.setupViewStep = 1;
      this.renderSettings();
    });
    const actions = card.createDiv({ cls: "zoey-sync-mobile-guide__actions" });
    const acquire = actions.createEl("button", { text: "\u4E00\u952E\u83B7\u53D6 token\uFF08pc \u7AEF\uFF09", cls: import_obsidian5.Platform.isMobile ? "" : "mod-cta", attr: { type: "button" } });
    const fill = actions.createEl("button", { text: "\u5DF2\u6709 token\uFF0C\u76F4\u63A5\u586B\u5165", cls: import_obsidian5.Platform.isMobile ? "mod-cta" : "", attr: { type: "button" } });
    let loginReady = false;
    let acquiring = false;
    acquire.disabled = true;
    const status = card.createEl("p", { text: this.lightweightGuideStatus, cls: "zoey-sync-mobile-guide__result", attr: { role: "status", "aria-live": "polite" } });
    if (ready) status.addClass("zoey-sync-setup-done");
    const report = (text, error = false) => {
      this.lightweightGuideStatus = text;
      status.setText(text);
      status.toggleClass("zoey-sync-setup-error", error);
    };
    const valid = () => this.desktopPage === "beginner-mobile" && card.isConnected;
    const tokenBox = card.createDiv({ cls: "zoey-sync-mobile-guide__token" });
    tokenBox.hidden = !ready;
    tokenBox.createDiv({ text: "GitHub Token", cls: "zoey-sync-mobile-guide__token-label" });
    const row = tokenBox.createDiv({ cls: "zoey-sync-mobile-guide__token-row" });
    row.createEl("code", { text: this.lightweightGuideToken, cls: "zoey-sync-mobile-guide__token-text" });
    const copy = row.createEl("button", { text: "\u590D\u5236 token", attr: { type: "button" } });
    const copyStatus = tokenBox.createEl("p", { cls: "zoey-sync-mobile-guide__result", attr: { role: "status", "aria-live": "polite" } });
    const reportCopy = (text, error = false) => {
      copyStatus.setText(text);
      copyStatus.toggleClass("zoey-sync-setup-done", !error);
      copyStatus.toggleClass("zoey-sync-setup-error", error);
    };
    copy.addEventListener("click", () => void navigator.clipboard.writeText(this.lightweightGuideToken).then(() => reportCopy("Token \u5DF2\u590D\u5236\u3002"), () => reportCopy("\u590D\u5236\u5931\u8D25\uFF0C\u8BF7\u624B\u52A8\u590D\u5236 Token\u3002", true)));
    tokenBox.createEl("p", { text: "\u8BF7\u59A5\u5584\u4FDD\u5B58 token\uFF0C\u4FBF\u4E8E\u5728\u624B\u673A\u7AEF\u586B\u5165\u6216\u66F4\u6362\u8BBE\u5907\u65F6\u4F7F\u7528\u3002", cls: "zoey-sync-mobile-guide__token-reminder" });
    const accept = (token) => {
      if (!valid()) return;
      this.lightweightGuideDraft.token = token;
      this.lightweightGuideLogin = "";
      this.lightweightGuideVerified = void 0;
      this.lightweightGuideToken = token;
      this.lightweightGuideStatus = "";
      this.renderSettings();
    };
    fill.addEventListener("click", () => {
      this.lightweightGuideStep = 2;
      this.renderSettings();
    });
    const updateLoginStatus = (loggedIn, description, needsPrerequisites = !loggedIn) => {
      if (!valid()) return;
      loginReady = loggedIn && !import_obsidian5.Platform.isMobile;
      acquire.disabled = !loginReady || acquiring;
      loginStatus.toggleClass("is-success", loggedIn);
      loginStatus.toggleClass("is-error", !loggedIn);
      (0, import_obsidian5.setIcon)(loginIcon, loggedIn ? "check" : "triangle-alert");
      loginTitle.setText(loggedIn ? "\u5F53\u524D\u5DF2\u767B\u5F55\u6210\u529F" : "\u5F53\u524D\u672A\u767B\u5F55");
      loginDescription.setText(description);
      prerequisites.hidden = !needsPrerequisites;
    };
    if (import_obsidian5.Platform.isMobile) {
      loginTitle.setText("\u5728\u7535\u8111\u7AEF\u83B7\u53D6\uFF0C\u5728\u624B\u673A\u7AEF\u586B\u5165");
      loginDescription.setText("\u8BF7\u5148\u5728\u7535\u8111\u7AEF\u83B7\u53D6 token\uFF0C\u518D\u70B9\u51FB\u300C\u5DF2\u6709 token\uFF0C\u76F4\u63A5\u586B\u5165\u300D\u6838\u9A8C\u8FDE\u63A5\u3002");
      (0, import_obsidian5.setIcon)(loginIcon, "smartphone");
    } else {
      void Promise.allSettled([
        this.plugin.exec("git", ["--version"], false, true, 1e4),
        this.plugin.exec("gh", ["--version"], false, true, 1e4),
        this.plugin.exec("gh", ["auth", "status", "--active", "--hostname", "github.com"], false, true, 3e4)
      ]).then(([git, gh, auth]) => {
        const tools = `Git ${git.status === "fulfilled" ? "\u5DF2\u5B89\u88C5" : "\u672A\u627E\u5230"} \xB7 GitHub CLI ${gh.status === "fulfilled" ? "\u5DF2\u5B89\u88C5" : "\u672A\u627E\u5230"}`;
        const needsPrerequisites = git.status !== "fulfilled" || gh.status !== "fulfilled" || auth.status !== "fulfilled";
        updateLoginStatus(auth.status === "fulfilled" && gh.status === "fulfilled", `${tools}\u3002${auth.status !== "fulfilled" || gh.status !== "fulfilled" ? "\u8BF7\u5148\u5B8C\u6210\u5B89\u88C5\u4E0E\u767B\u5F55\uFF0C\u518D\u56DE\u5230\u672C\u5F15\u5BFC\u83B7\u53D6 Token\u3002" : "\u70B9\u51FB\u4E0B\u65B9\u6309\u94AE\u5373\u53EF\u4E00\u952E\u83B7\u53D6 Token\u3002"}`, needsPrerequisites);
      });
    }
    acquire.addEventListener("click", () => void (async () => {
      if (acquire.disabled) return;
      acquiring = true;
      acquire.disabled = true;
      fill.disabled = true;
      const login = new AbortController();
      this.lightweightGuideController = login;
      try {
        report("\u6B63\u5728\u68C0\u67E5 GitHub \u767B\u5F55\u72B6\u6001\u2026");
        await this.plugin.exec("gh", ["--version"], false, true, 1e4);
        try {
          await this.plugin.exec("gh", ["auth", "status", "--active", "--hostname", "github.com"], false, true, 3e4);
        } catch {
          if (!valid() || login.signal.aborted) return;
          updateLoginStatus(false, "\u767B\u5F55\u5DF2\u5931\u6548\uFF0C\u8BF7\u5148\u5B8C\u6210\u5B89\u88C5\u4E0E\u767B\u5F55\uFF0C\u518D\u83B7\u53D6 Token\u3002");
          throw new Error("\u8BF7\u5148\u5B8C\u6210 GitHub \u767B\u5F55");
        }
        if (!valid() || login.signal.aborted) return;
        loginDescription.setText("GitHub CLI \u767B\u5F55\u5DF2\u6838\u9A8C\uFF0C\u6B63\u5728\u83B7\u53D6 token\u3002");
        report("\u6B63\u5728\u83B7\u53D6\u767B\u5F55 Token\u2026");
        const token = (await this.plugin.exec("gh", ["auth", "token", "--hostname", "github.com"], false, true, 3e4)).trim();
        if (!token) throw new Error("\u5F53\u524D\u767B\u5F55\u672A\u8FD4\u56DE Token");
        accept(token);
      } catch (error) {
        if (valid() && !login.signal.aborted) report(`\u83B7\u53D6\u5931\u8D25\uFF1A${messageOf2(error)}\u3002\u53EF\u91CD\u8BD5\u6216\u586B\u5165 Token\u3002`, true);
      } finally {
        if (this.lightweightGuideController === login) this.lightweightGuideController = void 0;
        acquiring = false;
        if (valid()) {
          acquire.disabled = !loginReady;
          fill.disabled = false;
        }
      }
    })());
    if (ready) {
      const footer = card.createDiv({ cls: "zoey-sync-setup-footer" });
      const next = footer.createEl("button", { text: "\u6211\u5DF2\u4FDD\u5B58\u597D token", cls: "mod-cta", attr: { type: "button", title: "\u7EE7\u7EED\u914D\u7F6E\u8F7B\u91CF\u540C\u6B65" } });
      next.addEventListener("click", () => {
        this.lightweightGuideStep = 2;
        this.renderSettings();
      });
    }
  }
  displayLightweightGuideStep(page) {
    const options = this.lightweightGuideDraft;
    const step = this.lightweightGuideStep;
    const body = page.createDiv({ cls: "zoey-sync-mobile-guide__card" });
    const engine = new MobileGithub(this.app.vault.adapter, this.app.vault.configDir, this.plugin.manifest.id, () => options, () => {
    });
    const valid = () => body.isConnected && this.desktopPage === "beginner-mobile" && this.lightweightGuideDraft === options;
    const status = body.createEl("p", { cls: "zoey-sync-mobile-guide__result", attr: { role: "status", "aria-live": "polite" } });
    const report = (text, error = false) => {
      if (!valid()) return;
      status.setText(text);
      status.toggleClass("zoey-sync-setup-error", error);
      status.toggleClass("zoey-sync-setup-done", !error);
    };
    const run = async (action) => {
      if (this.lightweightGuideBusy) return;
      this.lightweightGuideBusy = true;
      const controls = Array.from(page.querySelectorAll("button, input"));
      const disabled = controls.map((control) => control.disabled);
      controls.forEach((control) => {
        control.disabled = true;
      });
      try {
        await action();
      } catch (error) {
        report(messageOf2(error), true);
      } finally {
        this.lightweightGuideBusy = false;
        if (valid()) controls.forEach((control, index) => {
          control.disabled = disabled[index];
        });
        updateNext();
        if (!valid() && this.desktopPage === "beginner-mobile" && this.lightweightGuideDraft === options) this.renderSettings();
      }
    };
    new import_obsidian5.Setting(body).setName("").setHeading();
    if (step === 2) {
      body.createEl("p", { text: "\u586B\u5165 token\uFF0C\u6838\u9A8C\u662F\u5426\u80FD\u6210\u529F\u8FDE\u63A5 GitHub\u3002\u8FDE\u63A5\u6210\u529F\u540E\u81EA\u52A8\u8FDB\u5165\u9009\u62E9\u4ED3\u5E93\u3002" });
      body.createEl("p", { text: "Token \u4EC5\u4FDD\u5B58\u5728\u672C\u673A\uFF0C\u4E0D\u5199\u5165\u5171\u4EAB\u914D\u7F6E\u3002" });
      const tokenSetting = new import_obsidian5.Setting(body).setName("GitHub token").addText((text) => {
        text.inputEl.type = "password";
        text.setPlaceholder("\u7C98\u8D34 GitHub token").setValue(options.token).onChange((value) => {
          options.token = value.trim();
          this.lightweightGuideToken = options.token;
          this.lightweightGuideLogin = "";
          this.lightweightGuideVerified = void 0;
          status.empty();
          updateNext();
        });
      });
      tokenSetting.settingEl.addClass("zoey-sync-token-input");
      body.appendChild(status);
      new import_obsidian5.Setting(body).addButton((button) => button.setButtonText("\u6838\u9A8C\u8FDE\u63A5").setCta().onClick(() => void run(async () => {
        this.lightweightGuideLogin = "";
        this.lightweightGuideVerified = void 0;
        report("\u6B63\u5728\u6838\u9A8C GitHub \u8FDE\u63A5\u2026");
        const login = await engine.verifyToken();
        if (!valid()) return;
        this.lightweightGuideLogin = login;
        this.lightweightGuideStep = 3;
        this.renderSettings();
      })));
      if (this.lightweightGuideLogin) report(`\u2713 Token \u6709\u6548\uFF0C\u5F53\u524D\u8D26\u53F7\uFF1A${this.lightweightGuideLogin}\u3002`);
    } else if (step === 3) {
      body.addClass("zoey-sync-setup-intro", "zoey-sync-setup-repository", "zoey-sync-setup-body");
      body.createEl("p", { text: "\u53EF\u4EE5\u6838\u9A8C\u5DF2\u6709\u4ED3\u5E93\uFF0C\u4E5F\u53EF\u4EE5\u7531\u63D2\u4EF6\u521B\u5EFA\u4E00\u4E2A\u65B0\u7684\u79C1\u4EBA\u4ED3\u5E93\u3002", cls: "zoey-sync-setup-step-desc" });
      body.createEl("p", { text: `\u2713 GitHub \u8FDE\u63A5\u6210\u529F\uFF0C\u5F53\u524D\u8D26\u53F7\uFF1A${this.lightweightGuideLogin}\u3002`, cls: "zoey-sync-setup-done" });
      body.createEl("p", { text: "\u4F18\u5148\u8BFB\u53D6\u5171\u4EAB\u914D\u7F6E\u4E2D\u7684\u540C\u6B65\u4ED3\u5E93\u5730\u5740\uFF1B\u6CA1\u6709\u8BB0\u5F55\u65F6\uFF0C\u53EF\u624B\u52A8\u586B\u5199\u6216\u65B0\u5EFA GitHub \u79C1\u4EBA\u4ED3\u5E93\u3002" });
      const modes = body.createDiv({ cls: "zoey-sync-setup-options" });
      for (const mode of ["existing", "create"]) {
        const selected = mode === this.lightweightGuideRepoMode;
        const button = modes.createEl("button", {
          text: mode === "existing" ? "\u4F7F\u7528\u5DF2\u6709 GitHub \u4ED3\u5E93" : "\u65B0\u5EFA GitHub \u79C1\u4EBA\u4ED3\u5E93",
          cls: `zoey-sync-setup-option${selected ? " is-selected" : ""}`,
          attr: { type: "button", "aria-pressed": String(selected) }
        });
        button.addEventListener("click", () => {
          this.lightweightGuideRepoMode = mode;
          this.lightweightGuideVerified = void 0;
          this.renderSettings();
        });
      }
      const card = body.createDiv({ cls: "zoey-sync-setup-detail" });
      const checkRepository = async () => {
        this.lightweightGuideVerified = void 0;
        options.branch = "";
        report("\u6B63\u5728\u68C0\u67E5\u4ED3\u5E93\u9ED8\u8BA4\u5206\u652F\u4E0E\u8BFB\u5199\u6743\u9650\u2026");
        const remote = await engine.verifyAccess();
        if (!valid()) return;
        options.repoUrl = parseGithubRepoUrl(options.repoUrl).url;
        options.branch = remote.branch;
        this.lightweightGuideVerified = remote;
        this.lightweightGuideStep = 4;
        this.renderSettings();
      };
      if (this.lightweightGuideRepoMode === "create") {
        const heading = card.createDiv({ cls: "zoey-sync-setup-section-header" });
        new import_obsidian5.Setting(heading).setName("\u521B\u5EFA GitHub \u65B0\u4ED3\u5E93").setHeading();
        card.createEl("p", { text: "\u586B\u5199\u4ED3\u5E93\u540D\u79F0\u540E\uFF0C\u5728\u5F53\u524D GitHub \u8D26\u53F7\u4E0B\u521B\u5EFA private\uFF08\u79C1\u4EBA\uFF09\u4ED3\u5E93\uFF0C\u5E76\u521D\u59CB\u5316 README \u548C\u9ED8\u8BA4\u5206\u652F\u3002\u6B64\u65F6\u4E0D\u4F1A\u63A8\u9001\u672C\u5730\u6587\u4EF6\u3002" });
        new import_obsidian5.Setting(card).setName("\u65B0\u4ED3\u5E93\u540D\u79F0").addText((text) => text.setPlaceholder("\u4F8B\u5982 my-Obsidian-vault").setValue(this.lightweightGuideRepoName).onChange((value) => {
          this.lightweightGuideRepoName = value.trim();
        })).settingEl.addClass("zoey-sync-setup-repo-name");
        card.appendChild(status);
        new import_obsidian5.Setting(card).addButton((button) => button.setButtonText("\u521B\u5EFA\u79C1\u4EBA\u4ED3\u5E93").setCta().onClick(() => void run(async () => {
          report("\u6B63\u5728\u521B\u5EFA\u79C1\u4EBA\u4ED3\u5E93\u2026");
          const repo = await engine.createPrivateRepository(this.lightweightGuideRepoName);
          if (!valid()) return;
          options.repoUrl = repo.url;
          options.branch = repo.branch;
          this.lightweightGuideRepoMode = "existing";
          try {
            await checkRepository();
          } catch (error) {
            this.renderSettings();
            new import_obsidian5.Notice(`\u79C1\u4EBA\u4ED3\u5E93\u5DF2\u521B\u5EFA\uFF0C\u4F46\u6838\u9A8C\u672A\u5B8C\u6210\uFF1A${messageOf2(error)}\u3002\u8BF7\u68C0\u67E5\u5DF2\u6709\u4ED3\u5E93\u540E\u7EE7\u7EED\u3002`, 1e4);
          }
        }))).settingEl.addClass("zoey-sync-setup-action");
      } else {
        new import_obsidian5.Setting(card).setName("\u6838\u9A8C\u5DF2\u6709 GitHub \u4ED3\u5E93").setHeading();
        card.createEl("p", { text: "\u5728\u5DF2\u6709 GitHub \u4ED3\u5E93\u9875\u9762\u70B9\u51FB\u300Ccode\u300D\uFF0C\u590D\u5236 HTTPS \u5730\u5740\u5E76\u586B\u5165\u4E0B\u65B9\u3002" });
        card.createEl("p", { text: "\u6838\u9A8C\u4ED3\u5E93\u79C1\u4EBA\u72B6\u6001\u3001\u9ED8\u8BA4\u4E3B\u5206\u652F\u4EE5\u53CA\u5F53\u524D token \u7684\u8BFB\u5199\u6743\u9650\uFF0C\u901A\u8FC7\u540E\u81EA\u52A8\u8FDB\u5165\u540C\u6B65\u89C4\u5219\u3002", cls: "zoey-sync-setup-helper" });
        const invalidate = () => {
          this.lightweightGuideVerified = void 0;
          status.empty();
          updateNext();
        };
        const repoSetting = new import_obsidian5.Setting(card).setName("GitHub \u4ED3\u5E93\u5730\u5740").addText((text) => text.setPlaceholder("https://github.com/\u7528\u6237\u540D/\u4ED3\u5E93.git").setValue(options.repoUrl).onChange((value) => {
          options.repoUrl = value.trim();
          invalidate();
        }));
        repoSetting.settingEl.addClass("zoey-sync-setup-repo-url");
        card.appendChild(status);
        new import_obsidian5.Setting(card).addButton((button) => button.setButtonText("\u68C0\u67E5\u4ED3\u5E93").setCta().onClick(() => void run(checkRepository))).settingEl.addClass("zoey-sync-setup-action", "zoey-sync-setup-check-action", "zoey-sync-setup-auth-submit");
        if (this.lightweightGuideVerified) report(`\u2713 \u5DF2\u6838\u9A8C\u79C1\u4EBA\u4ED3\u5E93\u4E0E\u8BFB\u5199\u6743\u9650 \xB7 \u5206\u652F ${this.lightweightGuideVerified.branch}\u3002`);
      }
    } else {
      body.createEl("p", { text: `${options.repoUrl} \xB7 ${options.branch}` });
      body.createEl("p", { text: "\u52FE\u9009\u672C\u673A\u540C\u6B65\u89C4\u5219\uFF0C\u5B8C\u6210\u540E\u4ECD\u53EF\u5728\u8F7B\u91CF Git \u540C\u6B65\u8BBE\u7F6E\u4E2D\u8C03\u6574\u3002" });
      renderMobileSyncRules(body, options, () => {
      }, () => engine.listCloudPlugins());
      body.createEl("p", { text: "\u5B8C\u6210\u540E\u7ED1\u5B9A\u5E76\u542F\u7528\u8F7B\u91CF\u540C\u6B65\uFF1B\u9996\u6B21\u540C\u6B65\u8BF7\u67E5\u770B\u6587\u4EF6\u9884\u89C8\uFF0C\u518D\u786E\u8BA4\u6267\u884C\u3002" });
    }
    let next;
    if (step === 4) {
      body.appendChild(status);
      const footer = body.createDiv({ cls: "zoey-sync-setup-footer" });
      next = footer.createEl("button", { text: "\u5B8C\u6210\u63A5\u5165\u5E76\u542F\u7528\u540C\u6B65", cls: "mod-cta", attr: { type: "button" } });
      next.addEventListener("click", () => {
        if (next?.disabled) return;
        void run(async () => {
          report("\u6B63\u5728\u63A5\u5165\u4ED3\u5E93\uFF1B\u63A5\u4E0B\u6765\u8BF7\u5BA1\u6838\u5E76\u786E\u8BA4\u9996\u6B21\u540C\u6B65\u2026");
          await this.plugin.completeLightweightGuide(options);
          if (!valid()) return;
          report("\u2713 \u63A5\u5165\u5DF2\u5B8C\u6210\uFF0C\u4E24\u7AEF\u5DF2\u5BF9\u9F50\uFF0C\u5171\u540C\u57FA\u7EBF\u4E0E\u672C\u5730\u54C8\u5E0C\u7F13\u5B58\u5DF2\u4FDD\u5B58\u3002");
          page.querySelectorAll(".zoey-sync-lightweight-nav button").forEach((button) => button.addClass("is-done"));
          await new Promise((resolve) => window.setTimeout(resolve, 650));
          if (!valid()) return;
          this.desktopPage = "mobile";
          this.renderSettings();
        });
      });
    }
    const updateNext = () => {
      if (next) next.disabled = this.lightweightGuideBusy || !this.lightweightGuideVerified;
      const available = this.lightweightGuideVerified ? 4 : this.lightweightGuideLogin ? 3 : 2;
      page.querySelectorAll(".zoey-sync-lightweight-nav button").forEach((button, index) => {
        button.disabled = this.lightweightGuideBusy || index + 1 > available;
      });
    };
    updateNext();
  }
  displayDesktopSettings(containerEl) {
    const page = containerEl.createDiv({ cls: "zoey-sync-setup-layout" });
    const header = page.createDiv({ cls: "zoey-sync-page-header zoey-sync-setup-header" });
    const back = header.createEl("button", { cls: "clickable-icon zoey-sync-page-back", attr: { type: "button", title: "\u8FD4\u56DE", "aria-label": "\u8FD4\u56DE\u8BBE\u5907\u540C\u6B65" } });
    (0, import_obsidian5.setIcon)(back, "arrow-left");
    back.addEventListener("click", () => {
      this.desktopPage = "root";
      this.renderSettings();
    });
    new import_obsidian5.Setting(header).setName("\u7535\u8111\u7AEF Git \u540C\u6B65").setHeading();
    this.addDesktopEngineControls(page);
    const body = this.syncSettingsBody(page, this.plugin.nativeGitEnabled());
    this.displayDesktopAdvanced(body);
  }
  displayDesktop(containerEl) {
    const currentDevice = this.currentDevice();
    new import_obsidian5.Setting(containerEl).setName("\u8BBE\u4E0D\u540C\u8BBE\u5907\u540C\u6B65\u8BBE\u7F6E").setHeading();
    containerEl.createEl("p", { text: "\u5DF2\u81EA\u52A8\u8BC6\u522B\u5F53\u524D\u8BBE\u5907\uFF1B\u7535\u8111\u4E5F\u53EF\u4EE5\u8FDB\u5165\u624B\u673A\u8F7B\u91CF\u540C\u6B65\u8FDB\u884C\u914D\u7F6E\u548C\u8FD0\u884C\u3002", cls: "zoey-sync-section-desc" });
    this.addSetupEntry(containerEl, currentDevice === "git");
    const entries = [
      { page: "mobile", title: "\u8F7B\u91CF Git \u540C\u6B65", desc: "\u9002\u7528\u4E8E\u5B89\u5353\u3001iOS\uFF0C\u4E5F\u9002\u7528\u4E8E\u7535\u8111", icon: "smartphone" },
      { page: "server", title: "\u670D\u52A1\u5668\u7AEF \u811A\u672C Git \u540C\u6B65\u8BBE\u7F6E", desc: "Linux \xB7 \u670D\u52A1\u5668\u540C\u6B65\u8BBE\u7F6E", icon: "server" }
    ];
    for (const entry of entries) {
      const isCurrent = currentDevice === entry.page;
      const accessible = isCurrent || entry.page === "mobile" && !import_obsidian5.Platform.isMobile;
      const button = containerEl.createEl("button", {
        cls: `zoey-sync-page-link zoey-sync-device-link${accessible ? "" : " is-disabled"}`,
        attr: { type: "button" }
      });
      button.disabled = !accessible;
      (0, import_obsidian5.setIcon)(button.createSpan({ cls: "zoey-sync-page-link__icon" }), entry.icon);
      const copy = button.createSpan({ cls: "zoey-sync-page-link__copy" });
      copy.createSpan({ text: entry.title, cls: "zoey-sync-page-link__title" });
      copy.createSpan({ text: entry.desc, cls: "zoey-sync-page-link__desc" });
      if (accessible) {
        if (isCurrent) this.addCurrentDeviceBadge(button);
        (0, import_obsidian5.setIcon)(button.createSpan({ cls: "zoey-sync-page-link__chevron" }), "chevron-right");
        button.addEventListener("click", () => {
          this.desktopPage = entry.page;
          this.renderSettings();
        });
      }
    }
  }
  displayDevicePreview(containerEl, title, description) {
    const header = containerEl.createDiv({ cls: "zoey-sync-page-header" });
    const back = header.createEl("button", { cls: "clickable-icon zoey-sync-page-back", attr: { type: "button", "aria-label": "\u8FD4\u56DE" } });
    (0, import_obsidian5.setIcon)(back, "arrow-left");
    back.addEventListener("click", () => {
      this.desktopPage = "root";
      this.renderSettings();
    });
    new import_obsidian5.Setting(header).setName("").setHeading();
    containerEl.createEl("p", { text: description, cls: "zoey-sync-section-desc" });
  }
  displayServerPreview(containerEl) {
    this.displayDevicePreview(containerEl, "\u670D\u52A1\u5668\u7AEF\u540C\u6B65", "Linux \u670D\u52A1\u5668\u7AEF\u7684\u540C\u6B65\u8BBE\u7F6E\u5C06\u5728\u8FD9\u91CC\u8865\u5145\u3002");
    new import_obsidian5.Setting(containerEl).setName("\u5F85\u66F4\u65B0").setHeading();
    const todo = containerEl.createEl("ul");
    todo.createEl("li", { text: "\u672C\u5730 Git \u5386\u53F2\u7626\u8EAB\uFF1A\u4EC5\u6574\u7406\u670D\u52A1\u5668\u672C\u673A\u7684\u65E7\u5386\u53F2\uFF0C\u4FDD\u7559 GitHub \u4E0A\u7684\u5B8C\u6574\u5386\u53F2\uFF1B\u6267\u884C\u524D\u786E\u8BA4\u672C\u5730\u63D0\u4EA4\u5DF2\u4E0A\u4F20\u3002" });
    todo.createEl("li", { text: "\u6309 .gitignore \u91CD\u5EFA\u8FFD\u8E2A\uFF1A\u8BA9\u5DF2\u8FFD\u8E2A\u3001\u540E\u6765\u88AB\u5FFD\u7565\u7684\u6587\u4EF6\u9000\u51FA Git \u7D22\u5F15\uFF0C\u4FDD\u7559\u670D\u52A1\u5668\u672C\u673A\u6587\u4EF6\uFF1B\u4E0D\u6539\u53D8\u624B\u673A\u7AEF\u7684\u6587\u4EF6\u62C9\u53D6\u8BBE\u7F6E\u3002" });
    todo.createEl("li", { text: "\u7535\u8111\u7AEF\u548C\u624B\u673A\u7AEF\u540C\u6B65\u9875\u5F85\u589E\u52A0\u300C\u9AD8\u7EA7\u8BBE\u7F6E\u300D\uFF1A\u9876\u90E8\u653E\u4FBF\u6377\u5F00\u5173\uFF0C\u4E0B\u9762\u5148\u653E\u300C\u91CD\u5EFA\u8FFD\u8E2A\u300D\uFF0C\u6700\u540E\u653E\u300C\u9884\u89C8\u5F53\u524D\u7684\u300D\uFF1B\u5177\u4F53\u8FFD\u8E2A\u8303\u56F4\u5F85\u786E\u8BA4\u3002" });
    todo.createEl("li", { text: "\u5F85\u51B3\u5B9A .Obsidian \u76EE\u5F55\u7684\u7B56\u7565\uFF1A\u6574\u76EE\u5F55\u9000\u51FA Git \u8FFD\u8E2A\uFF0C\u6216\u6309\u6838\u5FC3\u914D\u7F6E\u3001\u63D2\u4EF6\u3001\u4E3B\u9898\u5206\u7C7B\u4FDD\u7559\uFF1B\u6BCF\u53F0\u8BBE\u5907\u7684\u4E0B\u8F7D\u8303\u56F4\u53E6\u884C\u8BBE\u7F6E\u3002" });
    todo.createEl("li", { text: "\u7EF4\u62A4\u4EFB\u52A1\u4E0E\u540C\u6B65\u64CD\u4F5C\u9519\u5F00\u6267\u884C\uFF0C\u5E76\u5C55\u793A\u68C0\u67E5\u7ED3\u679C\u3001\u6267\u884C\u8BB0\u5F55\u548C\u64CD\u4F5C\u524D\u540E\u7684\u7A7A\u95F4\u5360\u7528\u3002" });
  }
  displayMobilePreview(containerEl) {
    this.displayDevicePreview(containerEl, "\u8F7B\u91CF Git \u540C\u6B65", "\u9002\u7528\u4E8E\u5B89\u5353\u3001iOS\uFF0C\u4E5F\u9002\u7528\u4E8E\u7535\u8111");
    this.addLightweightEngineControl(containerEl);
    const body = this.syncSettingsBody(containerEl, this.plugin.useLightweightSync());
    renderMobileSettings(body, this.plugin.mobileHost(), false, () => this.renderSettings());
    if (this.plugin.settings.mobile.mode === "server") this.displayMobile(body);
  }
  addSetupEntry(parent, isCurrent) {
    const button = parent.createEl("button", { cls: `zoey-sync-page-link zoey-sync-device-link zoey-sync-device-link--desktop${isCurrent ? "" : " is-disabled"}`, attr: { type: "button" } });
    button.disabled = !isCurrent;
    (0, import_obsidian5.setIcon)(button.createSpan({ cls: "zoey-sync-page-link__icon" }), "monitor");
    const copy = button.createSpan({ cls: "zoey-sync-page-link__copy" });
    copy.createSpan({ text: "\u7535\u8111\u7AEF Git \u540C\u6B65\u8BBE\u7F6E", cls: "zoey-sync-page-link__title" });
    copy.createSpan({ text: "\u754C\u9762\u3001\u81EA\u52A8\u540C\u6B65\u65F6\u95F4\u4E0E Git \u8BBE\u7F6E", cls: "zoey-sync-page-link__desc" });
    if (!isCurrent) return;
    this.addCurrentDeviceBadge(button);
    (0, import_obsidian5.setIcon)(button.createSpan({ cls: "zoey-sync-page-link__chevron" }), "chevron-right");
    button.addEventListener("click", () => {
      this.desktopPage = "desktop-settings";
      this.renderSettings();
    });
  }
  setupLink(parent, label, href) {
    parent.createEl("a", { text: label, href, attr: { target: "_blank", rel: "noopener noreferrer" } });
  }
  syncSetupProgress(step, message, tone) {
    if (this.desktopPage !== "setup" || step < 1 || step > 3 || !message) return;
    const label = ["\u5B89\u88C5\u4E0E\u6388\u6743", "\u9009\u62E9\u4ED3\u5E93", "\u68C0\u67E5\u672C\u5730\u4E0E\u4E91\u7AEF\u6587\u4EF6"][step - 1];
    this.plugin.setSetupActivity(`\u63A5\u5165\u5F15\u5BFC \xB7 ${label} \xB7 ${message}`, tone ?? (/Fetch/.test(message) ? "fetch" : "checking"));
  }
  async runSetup(action, success, advanceView = true) {
    if (this.setupBusy) return;
    this.setupBusy = true;
    this.setupFailure = false;
    this.setupMessage = "\u6B63\u5728\u68C0\u67E5\uFF0C\u8BF7\u7A0D\u5019\u2026";
    const step = this.setupViewStep;
    const started = Date.now();
    const publish = () => {
      if (this.setupViewStep !== step || this.setupFailure) return;
      const elapsed = /已用时/.test(this.setupMessage) ? "" : `\uFF08\u5DF2\u7528\u65F6 ${Math.floor((Date.now() - started) / 1e3)} \u79D2\uFF09`;
      this.syncSetupProgress(step, this.setupMessage + elapsed);
    };
    publish();
    const timer = step <= 3 ? window.setInterval(publish, 1e3) : void 0;
    this.renderSettings();
    try {
      await action();
      if (success !== void 0) this.setupMessage = success;
      this.syncSetupProgress(step, this.setupMessage || "\u2713 \u672C\u6B65\u5DF2\u5B8C\u6210\u3002", "success");
      if (advanceView) this.setupViewStep = this.plugin.settings.setupStep;
    } catch (error) {
      this.setupFailure = true;
      this.setupMessage = explainSetupError(error);
      this.syncSetupProgress(step, this.setupMessage, "error");
      new import_obsidian5.Notice(`Simple Link\uFF1A${this.setupMessage}`, 1e4);
    } finally {
      if (timer !== void 0) window.clearInterval(timer);
      this.setupBusy = false;
      this.renderSettings();
    }
  }
  verifySetupAuthorization(action, success) {
    if (this.setupBusy) return;
    this.setupAuthVerified = false;
    void this.runSetup(async () => {
      await action();
      this.setupAuthVerified = true;
      if (this.setupAuthMode === "browser") this.stopSetupBrowserAuthorization();
      this.setupMessage = success;
      await this.advanceSetupAfterAuthorization();
    }, "", false);
  }
  async advanceSetupAfterAuthorization() {
    this.syncSetupProgress(1, "\u2713 GitHub \u6388\u6743\u5DF2\u6838\u9A8C\uFF0C\u6B63\u5728\u8FDB\u5165\u9009\u62E9\u4ED3\u5E93\u3002", "success");
    this.renderSettings();
    const success = this.containerEl.querySelector(".zoey-sync-setup-auth .zoey-sync-setup-done");
    await new Promise((resolve) => window.setTimeout(resolve, 650));
    if (!success?.isConnected || this.desktopPage !== "setup" || this.setupViewStep !== 1 || this.setupPlatform !== "github" || !this.setupAuthVerified) return;
    this.setupViewStep = 2;
    this.setupMessage = "";
    this.renderSettings();
  }
  async advanceSetupAfterCheck(step, ready) {
    if (this.desktopPage !== "setup" || this.setupViewStep !== step || !ready()) return;
    this.setupMessage = "\u2713 \u5DF2\u6210\u529F\uFF0C\u6B63\u5728\u8FDB\u5165\u4E0B\u4E00\u6B65\u2026";
    this.syncSetupProgress(step, this.setupMessage, "success");
    this.renderSettings();
    const body = this.containerEl.querySelector(".zoey-sync-setup-body");
    await new Promise((resolve) => window.setTimeout(resolve, 650));
    if (!body?.isConnected || this.desktopPage !== "setup" || this.setupViewStep !== step || !ready()) return;
    this.setupViewStep = step + 1;
    this.setupMessage = "";
    this.renderSettings();
  }
  async advanceSetupAfterPreview() {
    if (this.plugin.settings.setupComplete || this.setupViewStep !== 3 || !this.setupPreviewReady()) return;
    await this.plugin.confirmSetupPreview();
    await this.advanceSetupAfterCheck(3, () => this.setupPreviewReady());
  }
  updateSetupPreviewSelection() {
    this.renderSettings();
    if (this.setupPreviewReady()) {
      void this.runSetup(() => this.advanceSetupAfterPreview(), "", false);
    }
  }
  async verifyExistingSetupAuthorization() {
    try {
      await this.plugin.checkSetupAuthorization();
    } catch (error) {
      const raw = messageOf2(error);
      if (/ENOENT|is not recognized|spawn (?:git|gh)/i.test(raw)) {
        throw new Error("\u5F53\u524D\u8BBE\u5907\u672A\u627E\u5230 GitHub CLI\uFF0C\u8BF7\u5148\u5B89\u88C5\u540E\u91CD\u8BD5\u3002");
      }
      throw new Error("\u5F53\u524D GitHub CLI \u4E2D\u672A\u627E\u5230\u767B\u5F55\u72B6\u6001\uFF0C\u8BF7\u5148\u9009\u62E9\u6D4F\u89C8\u5668\u767B\u5F55\u6388\u6743\u6216 Token \u6388\u6743\u3002");
    }
  }
  stopSetupBrowserAuthorization() {
    this.setupBrowserController?.abort();
    this.setupBrowserController = void 0;
    this.setupBrowserRequest++;
    this.setupBrowserPending = false;
    this.setupDeviceCode = "";
  }
  async startSetupBrowserAuthorization() {
    this.setupBrowserController?.abort();
    this.setupAuthVerified = false;
    const controller = new AbortController();
    this.setupBrowserController = controller;
    const request = ++this.setupBrowserRequest;
    this.setupBrowserPending = true;
    this.setupFailure = false;
    this.setupDeviceCode = "";
    this.setupMessage = "\u6B63\u5728\u83B7\u53D6\u8BBE\u5907\u7801\u2026";
    const started = Date.now();
    const publish = () => {
      if (request !== this.setupBrowserRequest || !this.setupBrowserPending) return;
      this.syncSetupProgress(1, `${this.setupMessage}\uFF08\u5DF2\u7528\u65F6 ${Math.floor((Date.now() - started) / 1e3)} \u79D2\uFF09`);
    };
    publish();
    const progressTimer = window.setInterval(publish, 1e3);
    this.renderSettings();
    try {
      await this.plugin.authorizeSetup((code) => {
        if (request !== this.setupBrowserRequest) return;
        this.setupDeviceCode = code;
        this.setupMessage = "\u8BBE\u5907\u7801\u5DF2\u83B7\u53D6\uFF0C\u7B49\u5F85\u6D4F\u89C8\u5668\u5B8C\u6210\u767B\u5F55\u6388\u6743\u2026";
        publish();
        this.renderSettings();
      }, controller.signal);
      if (request !== this.setupBrowserRequest) return;
      this.setupMessage = "\u6D4F\u89C8\u5668\u6388\u6743\u5DF2\u8FD4\u56DE\uFF0C\u6B63\u5728\u6838\u9A8C GitHub \u767B\u5F55\u72B6\u6001\u2026";
      publish();
      await this.plugin.checkSetupAuthorization();
      if (request !== this.setupBrowserRequest || this.desktopPage !== "setup" || this.setupAuthMode !== "browser") return;
      this.setupAuthVerified = true;
      this.setupBrowserPending = false;
      this.setupMessage = "";
      await this.advanceSetupAfterAuthorization();
    } catch (error) {
      if (request !== this.setupBrowserRequest || controller.signal.aborted) return;
      this.setupFailure = true;
      this.setupMessage = explainSetupError(error);
      this.syncSetupProgress(1, this.setupMessage, "error");
      new import_obsidian5.Notice(`Simple Link\uFF1A${this.setupMessage}`, 1e4);
    } finally {
      window.clearInterval(progressTimer);
      if (request === this.setupBrowserRequest) {
        this.setupBrowserPending = false;
        this.setupBrowserController = void 0;
        this.renderSettings();
      }
    }
  }
  displaySetup(containerEl) {
    const page = containerEl.createDiv({ cls: "zoey-sync-setup-layout" });
    const header = page.createDiv({ cls: "zoey-sync-page-header zoey-sync-setup-header" });
    const back = header.createEl("button", { cls: "clickable-icon zoey-sync-page-back", attr: { type: "button", title: "\u8FD4\u56DE", "aria-label": "\u8FD4\u56DE\u8BBE\u7F6E" } });
    (0, import_obsidian5.setIcon)(back, "arrow-left");
    back.addEventListener("click", () => {
      this.stopSetupBrowserAuthorization();
      this.desktopPage = "root";
      this.renderSettings();
    });
    new import_obsidian5.Setting(header).setName("\u4ECE\u521B\u5EFA\u4ED3\u5E93\u5F00\u59CB\uFF1A\u7535\u8111\u7AEF\u540C\u6B65").setHeading();
    page.createEl("p", { text: "\u6309\u987A\u5E8F\u5B8C\u6210\u56DB\u6B65\u3002\u5DF2\u6838\u9A8C\u7684\u6B65\u9AA4\u53EF\u4EE5\u968F\u65F6\u8FD4\u56DE\u67E5\u770B\u3002", cls: "zoey-sync-section-desc" });
    const guidedDone = this.plugin.settings.setupComplete && !!this.plugin.settings.setupVerified;
    const latestConnectionLog = this.plugin.getRecentErrorLogs().find((entry) => /测试连接|Fetch|Pull|Push|同步/.test(entry.context));
    const loggedFailure = guidedDone && latestConnectionLog?.status === "error" ? latestConnectionLog : void 0;
    let tone = "disconnected";
    let title = "\u5F53\u524D\u672A\u8FDE\u63A5";
    let description = "\u5C1A\u672A\u5B8C\u6210 GitHub \u6388\u6743\u4E0E\u4ED3\u5E93\u63A5\u5165\u3002\u6309\u4E0B\u65B9\u6B65\u9AA4\u7EE7\u7EED\u3002";
    if (!this.plugin.settings.enabled) {
      description = "Simple Link \u5DF2\u5173\u95ED\u3002\u8FD4\u56DE\u63D2\u4EF6\u9996\u9875\u542F\u7528\u540E\uFF0C\u518D\u7EE7\u7EED\u540C\u6B65\u3002";
    } else if (this.setupFailure) {
      tone = "error";
      title = this.setupViewStep <= 2 ? "\u8FDE\u63A5\u5931\u8D25" : "\u63A5\u5165\u68C0\u67E5\u5931\u8D25";
      description = `\u4E0A\u6B21\u68C0\u67E5\u672A\u901A\u8FC7\uFF1A${formatStatusError(this.setupMessage)}\u3002\u8BF7\u5728\u5F53\u524D\u6B65\u9AA4\u91CD\u8BD5\u3002`;
    } else if (loggedFailure) {
      tone = "error";
      title = loggedFailure.context === "\u6D4B\u8BD5\u8FDE\u63A5" ? "\u8FDE\u63A5\u5931\u8D25" : "\u540C\u6B65\u5F02\u5E38";
      description = `\u4E0A\u6B21${loggedFailure.context}\u672A\u901A\u8FC7\u3002\u8BF7\u5728\u540C\u6B65\u9762\u677F\u67E5\u770B\u8BE6\u60C5\uFF0C\u68C0\u67E5\u540E\u91CD\u8BD5\u3002`;
    } else if (guidedDone) {
      tone = "success";
      title = "\u9996\u6B21\u63A5\u5165\u5DF2\u5B8C\u6210";
      description = "\u5DF2\u8FDE\u63A5 GitHub\uFF0C\u81EA\u52A8\u540C\u6B65\u5DF2\u542F\u7528\uFF1B\u9700\u8981\u91CD\u65B0\u6838\u9A8C\u65F6\u53EF\u518D\u6B21\u8FD0\u884C\u5F15\u5BFC\u3002";
    } else if (this.plugin.settings.setupComplete) {
      title = "\u5F53\u524D\u8FDE\u63A5\u5F85\u6838\u9A8C";
      description = "\u68C0\u6D4B\u5230\u65E7\u7248\u540C\u6B65\u914D\u7F6E\uFF0C\u4F46\u5C1A\u672A\u901A\u8FC7\u672C\u5411\u5BFC\u6838\u9A8C\u3002\u53EF\u4ECE\u7B2C\u4E00\u6B65\u91CD\u65B0\u68C0\u67E5\u3002";
    } else if (this.plugin.settings.setupMutationStarted) {
      description = "\u63A5\u5165\u5C1A\u672A\u5B8C\u6210\uFF0C\u81EA\u52A8\u540C\u6B65\u5DF2\u6682\u505C\u3002\u8BF7\u68C0\u67E5\u7B2C 3 \u6B65\u5E76\u5B8C\u6210\u63A5\u5165\u3002";
    }
    const status = page.createDiv({ cls: `zoey-sync-setup-status is-${tone}`, attr: { role: "status" } });
    const statusIcon = status.createSpan({ cls: "zoey-sync-setup-status__icon" });
    (0, import_obsidian5.setIcon)(statusIcon, tone === "success" ? "check" : tone === "error" ? "triangle-alert" : "unplug");
    const copy = status.createDiv({ cls: "zoey-sync-setup-status__copy" });
    copy.createEl("strong", { text: title });
    copy.createEl("p", { text: description });
    if (guidedDone && this.plugin.settings.enabled) {
      const restart = status.createEl("button", { text: "\u91CD\u65B0\u68C0\u67E5\u6216\u4FEE\u590D\u63A5\u5165", attr: { type: "button" } });
      restart.addEventListener("click", () => {
        void this.runSetup(() => this.plugin.beginSetup(), "\u5DF2\u6682\u505C\u81EA\u52A8 Git \u64CD\u4F5C\uFF0C\u8BF7\u4ECE\u7B2C 1 \u6B65\u5F00\u59CB\u3002");
      });
    } else if (this.plugin.settings.setupComplete && !guidedDone) {
      const restart = status.createEl("button", { text: "\u4ECE\u7B2C\u4E00\u6B65\u91CD\u65B0\u68C0\u67E5\u63A5\u5165", attr: { type: "button" } });
      restart.addEventListener("click", () => {
        void this.runSetup(() => this.plugin.beginSetup(), "\u5DF2\u6682\u505C\u81EA\u52A8 Git \u64CD\u4F5C\uFF0C\u8BF7\u4ECE\u7B2C 1 \u6B65\u5F00\u59CB\u3002");
      });
    }
    if (!this.plugin.settings.setupComplete && this.plugin.settings.setupBackup && !this.plugin.settings.setupMutationStarted) {
      const cancel = status.createEl("button", { text: "\u53D6\u6D88\u5411\u5BFC\uFF0C\u6062\u590D\u65E7\u540C\u6B65", attr: { type: "button", title: "\u9000\u51FA\u5411\u5BFC\u5E76\u6062\u590D\u4E4B\u524D\u5DF2\u914D\u7F6E\u7684\u81EA\u52A8\u540C\u6B65" } });
      cancel.disabled = this.setupBusy;
      cancel.addEventListener("click", () => void this.runSetup(() => this.plugin.cancelSetup(), "\u5DF2\u6062\u590D\u4E4B\u524D\u7684\u540C\u6B65\u914D\u7F6E\u3002"));
    }
    new import_obsidian5.Setting(page).setName("\u63A5\u5165\u5F15\u5BFC").setHeading();
    const panel = page.createDiv({ cls: "zoey-sync-setup-tab-panel" });
    panel.createDiv({ text: "\u63A5\u5165\u8FDB\u5EA6", cls: "zoey-sync-setup-progress-label" });
    const steps = ["\u5B89\u88C5\u4E0E\u6388\u6743", "\u9009\u62E9\u4ED3\u5E93", "\u68C0\u67E5\u4E24\u7AEF", "\u5B8C\u6210\u63A5\u5165"];
    const nav = panel.createDiv({ cls: "zoey-sync-setup-nav" });
    steps.forEach((label, index) => {
      const number = index + 1;
      const done = number === 1 ? this.plugin.settings.setupStep >= 2 : number === 2 ? !!this.plugin.settings.setupVerified && this.plugin.settings.setupStep >= 3 : number === 3 ? this.plugin.settings.setupStep >= 4 : guidedDone;
      const tab = nav.createEl("button", { cls: `zoey-sync-setup-nav__step${done ? " is-done" : ""}${this.setupViewStep === number ? " is-active" : ""}`, attr: { type: "button", "aria-current": this.setupViewStep === number ? "step" : "false" } });
      tab.createSpan({ text: String(number), cls: "zoey-sync-setup-nav__marker" });
      tab.createSpan({ text: label, cls: "zoey-sync-setup-nav__label" });
      tab.disabled = !this.plugin.settings.setupComplete && number > this.plugin.settings.setupStep;
      tab.addEventListener("click", () => {
        this.setupViewStep = number;
        this.setupMessage = "";
        this.setupFailure = false;
        this.renderSettings();
      });
    });
    const body = panel.createDiv({ cls: "zoey-sync-card zoey-sync-setup-body" });
    const descriptions = [
      "",
      "\u53EF\u4EE5\u6838\u9A8C\u5DF2\u6709\u4ED3\u5E93\uFF0C\u4E5F\u53EF\u4EE5\u7531\u63D2\u4EF6\u521B\u5EFA\u4E00\u4E2A\u65B0\u7684\u79C1\u4EBA\u4ED3\u5E93\u3002",
      "\u6838\u5BF9\u672C\u5730\u4E0E\u8FDC\u7AEF\u6587\u4EF6\uFF0C\u5E76\u51B3\u5B9A\u540C\u540D\u6587\u4EF6\u5982\u4F55\u5904\u7406\u3002",
      guidedDone ? "\u63A5\u5165\u5DF2\u5B8C\u6210\uFF0C\u53EF\u56DE\u770B\u6838\u9A8C\u7ED3\u679C\u6216\u91CD\u65B0\u68C0\u67E5\u4E24\u7AEF\u72B6\u6001\u3002" : "\u786E\u8BA4\u63A5\u5165\u4FE1\u606F\uFF0C\u7136\u540E\u6267\u884C\u9996\u6B21\u63A8\u9001\u3002"
    ];
    if (this.setupViewStep !== 1) {
      new import_obsidian5.Setting(body).setName("").setHeading();
      body.createEl("p", { text: descriptions[this.setupViewStep - 1], cls: "zoey-sync-setup-step-desc" });
    }
    if (this.setupViewStep === 1) this.displaySetupAuth(body);
    if (this.setupViewStep === 2) this.displaySetupRepo(body);
    if (this.setupViewStep === 3) this.displaySetupPreview(body);
    if (this.setupViewStep === 4) this.displaySetupFinish(body);
  }
  displaySetupAuth(body) {
    body.addClass("zoey-sync-setup-intro", "zoey-sync-setup-platform-step");
    const heading = body.createDiv({ cls: "zoey-sync-setup-section-header" });
    new import_obsidian5.Setting(heading).setName("\u9009\u62E9\u540C\u6B65\u5E73\u53F0").setHeading();
    heading.createSpan({ text: "\u5F53\u524D\u4EC5\u652F\u6301 GitHub", cls: "zoey-sync-setup-badge" });
    const options = body.createDiv({ cls: "zoey-sync-setup-options" });
    for (const platform of ["github", "gitee"]) {
      const selected = this.setupPlatform === platform;
      const button = options.createEl("button", { text: platform === "github" ? "GitHub" : "Gitee", cls: `zoey-sync-setup-option${selected ? " is-selected" : ""}`, attr: { type: "button", "aria-pressed": String(selected) } });
      button.addEventListener("click", () => {
        if (platform !== "github") {
          this.stopSetupBrowserAuthorization();
          this.setupAuthMode = null;
          this.setupAuthVerified = false;
        }
        this.setupPlatform = platform;
        this.setupMessage = "";
        this.setupFailure = false;
        this.renderSettings();
      });
    }
    if (this.setupPlatform === "gitee") body.createEl("p", { text: "Gitee \u5C1A\u672A\u505A\u5B9E\u9645\u517C\u5BB9\uFF0C\u8BF7\u9009\u62E9 GitHub \u7EE7\u7EED\u3002", cls: "zoey-sync-setup-intro__unavailable" });
    else {
      const platformContent = body.createDiv({ cls: "zoey-sync-setup-platform-content", attr: { role: "group", "aria-label": "GitHub \u63A5\u5165\u6B65\u9AA4" } });
      const toolsCard = platformContent.createDiv({ cls: "zoey-sync-setup-detail" });
      new import_obsidian5.Setting(toolsCard).setName("\u5B89\u88C5\u5DE5\u5177").setHeading();
      toolsCard.createEl("p", { text: "\u7535\u8111\u7AEF\u9700\u8981 Git \u6267\u884C\u540C\u6B65\u547D\u4EE4\uFF0CGitHub CLI \u7528\u4E8E\u767B\u5F55\u3001\u5EFA\u4ED3\u548C\u4ED3\u5E93\u6838\u9A8C\u3002\u82E5\u6CA1\u6709 GitHub \u8D26\u53F7\uFF0C\u8BF7\u5148\u5B8C\u6210\u6CE8\u518C\u3002" });
      const downloadLinks = toolsCard.createDiv({ cls: "zoey-sync-setup-links" });
      this.setupLink(downloadLinks, "\u4E0B\u8F7D Git \u2197", "https://git-scm.com/downloads");
      this.setupLink(downloadLinks, "\u4E0B\u8F7D GitHub CLI \u2197", "https://cli.github.com/");
      const authCard = platformContent.createDiv({ cls: "zoey-sync-setup-detail zoey-sync-setup-auth" });
      new import_obsidian5.Setting(authCard).setName("\u9009\u62E9 GitHub \u6388\u6743\u65B9\u5F0F").setHeading();
      const authOptions = authCard.createDiv({ cls: "zoey-sync-setup-options" });
      for (const mode of ["browser", "token", "verify"]) {
        const selected = this.setupAuthMode === mode;
        const label = mode === "browser" ? "\u6D4F\u89C8\u5668\u767B\u5F55\u6388\u6743" : mode === "token" ? "Token \u6388\u6743" : "\u9A8C\u8BC1\u5DF2\u6709\u6388\u6743";
        const button = authOptions.createEl("button", { text: label, cls: `zoey-sync-setup-option${selected ? " is-selected" : ""}`, attr: { type: "button", "aria-pressed": String(selected) } });
        button.disabled = this.setupBusy;
        button.addEventListener("click", () => {
          if (mode !== "browser") this.stopSetupBrowserAuthorization();
          this.setupAuthMode = mode;
          this.setupAuthVerified = false;
          this.setupTokenInput = "";
          this.setupMessage = "";
          this.setupFailure = false;
          if (mode === "browser") void this.startSetupBrowserAuthorization();
          else if (mode === "verify") {
            this.verifySetupAuthorization(
              () => this.verifyExistingSetupAuthorization(),
              "\u5DF2\u6210\u529F\uFF0CGitHub \u6388\u6743\u5DF2\u6838\u9A8C\u3002"
            );
          } else this.renderSettings();
        });
      }
      if (this.setupAuthMode === "browser") {
        const instruction = authCard.createEl("p");
        instruction.append("\u5728\u4E0B\u65B9\u83B7\u53D6\u8BBE\u5907\u7801\uFF0C\u7136\u540E\u5728\u6D4F\u89C8\u5668\u4E2D");
        this.setupLink(instruction, "\u6253\u5F00 GitHub \u8BBE\u5907\u7801\u586B\u5199\u9875 \u2197", "https://github.com/login/device");
        instruction.append("\uFF0C\u6309\u63D0\u793A\u767B\u5F55 GitHub\u3001\u8F93\u5165\u8BBE\u5907\u7801\u5E76\u5B8C\u6210\u6388\u6743\u3002");
        const deviceAction = authCard.createDiv({ cls: "zoey-sync-setup-device-action" });
        deviceAction.createEl("code", {
          text: this.setupDeviceCode || (this.setupBrowserPending ? "\u6B63\u5728\u83B7\u53D6\u2026" : ""),
          cls: `zoey-sync-setup-device-slot${this.setupDeviceCode ? " zoey-sync-setup-device-code" : this.setupBrowserPending ? " zoey-sync-setup-feedback" : ""}`,
          attr: { "aria-live": "polite" }
        });
        const copy = deviceAction.createEl("button", { cls: "zoey-sync-setup-device-icon-button", attr: { type: "button", "aria-label": "\u590D\u5236\u8BBE\u5907\u7801" } });
        (0, import_obsidian5.setIcon)(copy, "copy");
        (0, import_obsidian5.setTooltip)(copy, "\u590D\u5236\u8BBE\u5907\u7801");
        copy.disabled = !this.setupDeviceCode;
        copy.addEventListener("click", () => void navigator.clipboard.writeText(this.setupDeviceCode));
        const refresh = deviceAction.createEl("button", { cls: "zoey-sync-setup-device-icon-button", attr: { type: "button", "aria-label": "\u5237\u65B0\u8BBE\u5907\u7801" } });
        (0, import_obsidian5.setIcon)(refresh, "refresh-cw");
        (0, import_obsidian5.setTooltip)(refresh, "\u5237\u65B0\u8BBE\u5907\u7801");
        refresh.disabled = this.setupBusy;
        refresh.addEventListener("click", () => void this.startSetupBrowserAuthorization());
        new import_obsidian5.Setting(authCard).addButton((button) => button.setButtonText("\u5DF2\u586B\u5199\u8BBE\u5907\u7801\uFF0C\u9A8C\u8BC1\u6388\u6743").setCta().setDisabled(this.setupBusy || !this.setupDeviceCode).onClick(() => this.verifySetupAuthorization(() => this.plugin.checkSetupAuthorization(), "GitHub \u6388\u6743\u5DF2\u6838\u9A8C\u3002"))).settingEl.addClass("zoey-sync-setup-auth-action", "zoey-sync-setup-auth-submit");
      } else if (this.setupAuthMode === "token") {
        authCard.createEl("p", { text: "\u672C\u63D2\u4EF6\u4E0D\u5728\u8BBE\u7F6E\u4E2D\u4FDD\u5B58 token\uFF1Btoken \u4F1A\u4EA4\u7ED9\u672C\u673A GitHub CLI \u4FDD\u5B58\uFF0C\u7528\u4E8E\u767B\u5F55\u4E0E\u540E\u7EED\u540C\u6B65\u3002" });
        const tokenHint = authCard.createDiv({ cls: "zoey-sync-setup-token-hint" });
        const hintIcon = tokenHint.createSpan({ cls: "zoey-sync-setup-token-hint__icon", attr: { "aria-hidden": "true" } });
        (0, import_obsidian5.setIcon)(hintIcon, "circle-alert");
        tokenHint.createSpan({ text: "\u521B\u5EFA Classic Token \u65F6\uFF0C\u8BF7\u52FE\u9009 repo\u3001read:org \u548C gist\uFF1B\u4EC5\u5F53\u9700\u8981\u540C\u6B65 GitHub Actions \u5DE5\u4F5C\u6D41\u6587\u4EF6\u65F6\uFF0C\u518D\u52FE\u9009 workflow\u3002" });
        let tokenVerifyButton;
        const tokenSetting = new import_obsidian5.Setting(authCard).setName("GitHub token").addText((text) => {
          text.setPlaceholder("\u7C98\u8D34 token").setValue(this.setupTokenInput);
          text.inputEl.type = "password";
          text.inputEl.autocomplete = "off";
          text.onChange((value) => {
            this.setupTokenInput = value;
            if (tokenVerifyButton) tokenVerifyButton.disabled = this.setupBusy || !value.trim();
          });
        });
        tokenSetting.settingEl.addClass("zoey-sync-setup-token-setting");
        this.setupLink(tokenSetting.descEl, "\u524D\u5F80 GitHub \u521B\u5EFA Token \u2197", "https://github.com/settings/tokens");
        new import_obsidian5.Setting(authCard).addButton((button) => {
          tokenVerifyButton = button.buttonEl;
          button.setButtonText("\u5DF2\u586B\u5199 token\uFF0C\u9A8C\u8BC1\u6388\u6743").setCta().setDisabled(this.setupBusy || !this.setupTokenInput.trim()).onClick(() => {
            const token = this.setupTokenInput;
            this.setupTokenInput = "";
            this.verifySetupAuthorization(() => this.plugin.authorizeSetupWithToken(token), "GitHub Token \u5DF2\u901A\u8FC7 GitHub CLI \u6838\u9A8C\u3002");
          });
        }).settingEl.addClass("zoey-sync-setup-auth-action", "zoey-sync-setup-auth-submit");
      } else if (this.setupAuthMode === "verify") {
        authCard.createEl("p", { text: this.setupAuthVerified ? "\u5F53\u524D GitHub CLI \u767B\u5F55\u72B6\u6001\u5DF2\u6838\u9A8C\u3002" : this.setupBusy ? "\u6B63\u5728\u9A8C\u8BC1\u5F53\u524D GitHub CLI \u767B\u5F55\u72B6\u6001\u2026" : "\u9009\u62E9\u540E\u4F1A\u81EA\u52A8\u9A8C\u8BC1\u5F53\u524D GitHub CLI \u767B\u5F55\u72B6\u6001\u3002", cls: this.setupAuthVerified || this.setupBusy ? "zoey-sync-setup-feedback" : "" });
        if (this.setupFailure && !this.setupBusy) {
          new import_obsidian5.Setting(authCard).addButton((button) => button.setButtonText("\u91CD\u65B0\u9A8C\u8BC1").setCta().onClick(() => this.verifySetupAuthorization(
            () => this.verifyExistingSetupAuthorization(),
            "\u5DF2\u6210\u529F\uFF0CGitHub \u6388\u6743\u5DF2\u6838\u9A8C\u3002"
          ))).settingEl.addClass("zoey-sync-setup-auth-action", "zoey-sync-setup-auth-submit");
        }
      }
      if (this.setupAuthVerified) authCard.createEl("p", { text: "\u2713 \u5DF2\u6210\u529F", cls: "zoey-sync-setup-done" });
      else if (this.setupMessage) {
        const feedback = authCard.createEl("p", { text: this.setupMessage, cls: this.setupFailure ? "zoey-sync-setup-error" : "zoey-sync-setup-feedback", attr: { role: "status", "aria-live": "polite" } });
        authCard.querySelector(".zoey-sync-setup-auth-submit")?.before(feedback);
      }
    }
  }
  displaySetupRepo(body) {
    body.addClass("zoey-sync-setup-intro", "zoey-sync-setup-repository");
    const options = body.createDiv({ cls: "zoey-sync-setup-options" });
    for (const mode of ["existing", "create"]) {
      const selected = this.setupRepoMode === mode;
      const button = options.createEl("button", { text: mode === "existing" ? "\u4F7F\u7528\u5DF2\u6709 GitHub \u4ED3\u5E93" : "\u65B0\u5EFA GitHub \u79C1\u4EBA\u4ED3\u5E93", cls: `zoey-sync-setup-option${selected ? " is-selected" : ""}`, attr: { type: "button", "aria-pressed": String(selected) } });
      button.addEventListener("click", () => {
        this.setupRepoMode = mode;
        this.setupMessage = "";
        this.setupFailure = false;
        this.renderSettings();
      });
    }
    const card = body.createDiv({ cls: "zoey-sync-setup-detail" });
    if (this.setupRepoMode === "existing") {
      new import_obsidian5.Setting(card).setName("\u6838\u9A8C\u5DF2\u6709 GitHub \u4ED3\u5E93").setHeading();
      card.createEl("p", { text: "\u5728\u5DF2\u6709 GitHub \u4ED3\u5E93\u9875\u9762\u70B9\u51FB\u300Ccode\u300D\uFF0C\u590D\u5236 HTTPS \u5730\u5740\u5E76\u586B\u5165\u4E0B\u65B9\u3002" });
      card.createEl("p", { text: "\u6838\u9A8C\u4F1A\u68C0\u67E5\u4ED3\u5E93\u662F\u5426\u4E3A\u79C1\u6709\uFF0C\u4EE5\u53CA\u5F53\u524D\u767B\u5F55\u8D26\u53F7\u662F\u5426\u5177\u6709\u5199\u5165\u6743\u9650\u3002", cls: "zoey-sync-setup-helper" });
      const repoUrlSetting = new import_obsidian5.Setting(card).setName("GitHub \u4ED3\u5E93\u5730\u5740").addText((text) => text.setPlaceholder("https://github.com/user/vault.git").setValue(this.setupRepoInput).onChange((value) => {
        this.setupRepoInput = value.trim();
      }));
      repoUrlSetting.settingEl.addClass("zoey-sync-setup-repo-url");
      new import_obsidian5.Setting(card).addButton((button) => button.setButtonText("\u68C0\u67E5\u4ED3\u5E93").setCta().setDisabled(this.setupBusy).onClick(() => void this.runSetup(async () => {
        await this.plugin.verifySetupRepository(this.setupRepoInput);
        await this.advanceSetupAfterCheck(2, () => this.setupRepoReady());
      }, "", false))).settingEl.addClass("zoey-sync-setup-action", "zoey-sync-setup-check-action", "zoey-sync-setup-auth-submit");
    } else {
      const heading = card.createDiv({ cls: "zoey-sync-setup-section-header" });
      new import_obsidian5.Setting(heading).setName("\u521B\u5EFA GitHub \u65B0\u4ED3\u5E93").setHeading();
      card.createEl("p", { text: "\u586B\u5199\u4ED3\u5E93\u540D\u79F0\u540E\uFF0C\u63D2\u4EF6\u4F1A\u5728\u5F53\u524D GitHub \u8D26\u53F7\u4E0B\u521B\u5EFA\u4E00\u4E2A\u7A7A\u7684 private\uFF08\u79C1\u4EBA\uFF09\u4ED3\u5E93\u3002\u6B64\u65F6\u4E0D\u4F1A\u63A8\u9001\u672C\u5730\u6587\u4EF6\u3002" });
      new import_obsidian5.Setting(card).setName("\u65B0\u4ED3\u5E93\u540D\u79F0").addText((text) => text.setPlaceholder("\u4F8B\u5982 my-Obsidian-vault").setValue(this.setupRepoNameInput).onChange((value) => {
        this.setupRepoNameInput = value.trim();
      })).settingEl.addClass("zoey-sync-setup-repo-name");
      new import_obsidian5.Setting(card).addButton((button) => button.setButtonText("\u521B\u5EFA\u79C1\u4EBA\u4ED3\u5E93").setCta().setDisabled(this.setupBusy).onClick(() => void this.runSetup(async () => {
        try {
          await this.plugin.createSetupRepository(this.setupRepoNameInput);
        } finally {
          this.setupRepoInput = this.plugin.settings.setupRepoUrl;
        }
        await this.advanceSetupAfterCheck(2, () => this.setupRepoReady());
      }, "", false))).settingEl.addClass("zoey-sync-setup-action");
    }
    const feedback = card.createDiv({ cls: "zoey-sync-setup-repo-feedback", attr: { role: "status", "aria-live": "polite" } });
    if (this.setupMessage) {
      feedback.createEl("p", { text: this.setupMessage, cls: this.setupFailure ? "zoey-sync-setup-error" : this.setupMessage.startsWith("\u2713") ? "zoey-sync-setup-done" : "zoey-sync-setup-repo-result" });
    }
    if (!this.setupBusy && !this.setupFailure && this.setupRepoReady() && this.plugin.settings.setupVerified) {
      feedback.createEl("p", { text: `\u2713 \u5DF2\u6838\u9A8C ${this.plugin.settings.setupVerified.url} \xB7 \u5206\u652F ${this.plugin.settings.setupVerified.branch}`, cls: "zoey-sync-setup-done" });
    }
    card.querySelector(".zoey-sync-setup-action")?.before(feedback);
  }
  setupRepoReady() {
    const verified = this.plugin.settings.setupVerified;
    if (!verified || !this.plugin.settings.setupComplete && this.plugin.settings.setupStep < 3) return false;
    if (this.setupRepoMode === "create") return this.setupRepoNameInput.trim().toLowerCase() === verified.name.toLowerCase();
    try {
      return parseGithubRepoUrl(this.setupRepoInput).url.toLowerCase() === verified.url.toLowerCase();
    } catch {
      return false;
    }
  }
  displaySetupPreview(body) {
    const preview = this.plugin.getSetupPreview();
    body.createEl("p", { text: `\u5F53\u524D Vault\uFF1A${this.plugin.getVaultBasePath()}`, cls: "zoey-sync-section-desc" });
    body.createEl("p", { text: "\u5148\u68C0\u67E5\u672C\u673A\u548C GitHub \u7684\u6587\u4EF6\u5DEE\u5F02\uFF0C\u518D\u51B3\u5B9A\u5982\u4F55\u63A5\u5165\u3002\u68C0\u67E5\u4E0D\u4F1A\u5408\u5E76\u3001\u5220\u9664\u6216\u63A8\u9001\u7B14\u8BB0\u3002", cls: "zoey-sync-section-desc" });
    if (this.plugin.settings.setupComplete && !this.plugin.settings.setupVerified) {
      body.createEl("p", { text: "\u5F53\u524D\u8FDE\u63A5\u6765\u81EA\u65E7\u7248\u8BBE\u7F6E\uFF0C\u5C1A\u672A\u7ECF\u8FC7\u6B64\u5411\u5BFC\u6838\u9A8C\u3002\u4F7F\u7528\u4E0A\u65B9\u300C\u4ECE\u7B2C\u4E00\u6B65\u91CD\u65B0\u68C0\u67E5\u63A5\u5165\u300D\u540E\u53EF\u67E5\u770B\u4E24\u7AEF\u6587\u4EF6\u3002" });
    }
    body.createEl("p", { text: this.setupMessage, cls: `zoey-sync-setup-preview-progress ${this.setupFailure ? "zoey-sync-setup-error" : this.setupMessage.startsWith("\u2713") ? "zoey-sync-setup-done" : "zoey-sync-section-desc"}`, attr: { role: "status", "aria-live": "polite" } });
    if (!preview && this.plugin.settings.setupStep >= 3 && (this.plugin.settings.setupVerified || this.plugin.settings.setupRepoUrl)) {
      const actionLabel = !this.plugin.settings.setupVerified ? "\u91CD\u65B0\u6838\u9A8C\u4ED3\u5E93\u5E76\u68C0\u67E5\u672C\u5730\u4E0E\u4E91\u7AEF\u6587\u4EF6" : this.plugin.settings.setupComplete ? "\u91CD\u65B0\u68C0\u67E5\u672C\u5730\u4E0E\u4E91\u7AEF\u6587\u4EF6" : "\u68C0\u67E5\u672C\u5730\u4E0E\u4E91\u7AEF\u6587\u4EF6";
      const action = body.createDiv({ cls: "zoey-sync-setup-file-check" });
      const check = action.createEl("button", { text: this.setupBusy ? "\u6B63\u5728\u68C0\u67E5\u2026" : actionLabel, cls: "mod-cta", attr: { type: "button" } });
      check.disabled = this.setupBusy;
      check.addEventListener("click", () => void this.runSetup(async () => {
        this.setupOverlapContent = void 0;
        this.setupRebuildConfirmed = false;
        this.setupTrackingPending = false;
        const started = Date.now();
        let stage = "\u6B63\u5728\u5F00\u59CB\u68C0\u67E5\u2026";
        const updateProgress = () => {
          if (this.desktopPage !== "setup" || this.setupViewStep !== 3) return;
          this.setupMessage = `${stage}\uFF08\u5DF2\u7528\u65F6 ${Math.floor((Date.now() - started) / 1e3)} \u79D2\uFF09`;
          this.syncSetupProgress(3, this.setupMessage, stage.startsWith("\u2713") ? "success" : void 0);
          const progress = this.containerEl.querySelector(".zoey-sync-setup-preview-progress");
          if (progress) progress.textContent = this.setupMessage;
        };
        const timer = window.setInterval(updateProgress, 1e3);
        try {
          await this.plugin.inspectSetupRepository((message) => {
            stage = message;
            updateProgress();
          });
        } finally {
          window.clearInterval(timer);
        }
        await this.advanceSetupAfterPreview();
      }, void 0, false));
    }
    if (preview) {
      const overview = body.createDiv({ cls: "zoey-sync-setup-overview" });
      for (const [label, value] of [["\u672C\u673A\u6587\u4EF6", preview.localFiles.length], ["GitHub \u6587\u4EF6", preview.remoteFiles.length], ["\u4EC5\u672C\u673A", preview.localOnly.length], ["\u4EC5 GitHub", preview.remoteOnly.length], ["\u540C\u540D\u5DEE\u5F02", preview.overlaps.length]]) {
        const item = overview.createDiv({ cls: "zoey-sync-setup-overview__item" });
        item.createEl("strong", { text: String(value) });
        item.createSpan({ text: label });
      }
      if (preview.nestedRepos.length) body.createEl("p", {
        text: `\u53D1\u73B0 ${preview.nestedRepos.length} \u4E2A\u5185\u5D4C Git \u4ED3\u5E93\u3002\u53EA\u4F1A\u6392\u9664\u5B83\u4EEC\u7684 .git \u5143\u6570\u636E\uFF1B\u8FD9\u4E9B\u4ED3\u5E93\u81EA\u5DF1\u7684\u5386\u53F2\u4E0D\u53D7\u5F71\u54CD\u3002`,
        cls: "zoey-sync-section-desc"
      });
      if (preview.alreadyLinked) body.createEl("p", { text: "\u672C\u673A\u5DF2\u5305\u542B GitHub \u7684\u63D0\u4EA4\u8BB0\u5F55\uFF0C\u53EF\u4EE5\u7EE7\u7EED\u6838\u5BF9\u6587\u4EF6\u3002", cls: "zoey-sync-setup-done" });
      else if (preview.relatedHistory) body.createEl("p", { text: "\u4E24\u7AEF\u6709\u5171\u540C\u5386\u53F2\uFF1B\u5B8C\u6210\u63A5\u5165\u65F6\u4F1A\u5408\u5E76 GitHub \u7684\u65B0\u63D0\u4EA4\uFF0C\u51B2\u7A81\u4F1A\u505C\u4E0B\u7B49\u5F85\u5904\u7406\u3002", cls: "zoey-sync-section-desc" });
      body.createEl("p", { text: preview.localRoot ? `\u672C\u673A\u5206\u652F\uFF1A${preview.localBranch} \xB7 GitHub \u5206\u652F\uFF1A${preview.branch}` : `\u5F53\u524D Vault \u8FD8\u6CA1\u6709 Git \u4ED3\u5E93\uFF1B\u5B8C\u6210\u63A5\u5165\u65F6\u4F1A\u521B\u5EFA ${preview.branch} \u5206\u652F\u3002`, cls: "zoey-sync-section-desc" });
      new import_obsidian5.Setting(body).setName("Git \u5FFD\u7565\u89C4\u5219").setHeading();
      const ignoreDiffers = setupIgnoreDiffers(preview);
      const ignoreChoice = this.plugin.getSetupChoices()[".gitignore"];
      if (ignoreDiffers) {
        const baseSetting = new import_obsidian5.Setting(body).setName("\u9009\u62E9 .gitignore \u57FA\u51C6").setDesc("\u4E24\u7AEF\u89C4\u5219\u4E0D\u540C\uFF0C\u8BF7\u9009\u62E9\u672C\u673A\u6216\u8FDC\u7AEF\u7248\u672C\u4F5C\u4E3A\u57FA\u51C6\uFF0C\u518D\u8865\u5145\u5EFA\u8BAE\u89C4\u5219\u3002");
        for (const choice of ["local", "remote"]) {
          baseSetting.addButton((button) => {
            button.setButtonText(choice === "local" ? "\u5E94\u7528\u672C\u5730" : "\u5E94\u7528\u8FDC\u7AEF");
            if (ignoreChoice === choice) button.setCta();
            button.onClick(() => {
              this.plugin.setSetupChoice(".gitignore", choice);
              this.setupRebuildConfirmed = false;
              this.setupTrackingPending = false;
              this.updateSetupPreviewSelection();
            });
          });
        }
        const comparison = body.createEl("details", { cls: "zoey-sync-setup-files" });
        comparison.createEl("summary", { text: "\u67E5\u770B\u4E24\u7AEF .gitignore \u8BE6\u60C5" });
        new import_obsidian5.Setting(comparison).setName("\u672C\u673A").setHeading();
        comparison.createEl("pre", { text: preview.localIgnore || "\uFF08\u7A7A\uFF09" });
        new import_obsidian5.Setting(comparison).setName("\u8FDC\u7AEF").setHeading();
        comparison.createEl("pre", { text: preview.remoteIgnore || "\uFF08\u7A7A\uFF09" });
      }
      if (ignoreDiffers && !ignoreChoice) body.createEl("p", { text: "\u4EE5\u4E0B\u4E3A\u672C\u673A\u57FA\u51C6\u7684\u9884\u89C8\uFF1B\u8BF7\u9009\u62E9\u57FA\u51C6\u540E\u786E\u8BA4\u91CD\u5EFA\u3002", cls: "zoey-sync-section-desc" });
      body.createEl("p", { text: `\u4EE5${ignoreChoice === "remote" ? "\u8FDC\u7AEF" : "\u672C\u673A"} .gitignore \u4E3A\u57FA\u51C6\uFF0C\u5F85\u8865\u5145 ${preview.missingIgnoreRules.length} \u6761\u5EFA\u8BAE\u89C4\u5219\u3002\u7528\u4E8E\u6392\u9664\u5DE5\u4F5C\u533A\u3001\u56DE\u6536\u7AD9\u3001\u7F13\u5B58\u3001\u672C\u673A\u72B6\u6001\u548C\u672C\u63D2\u4EF6\u6570\u636E\uFF0C\u4EE5\u53CA\u5185\u5D4C\u4ED3\u5E93\u7684 .git \u5143\u6570\u636E\u3002`, cls: "zoey-sync-section-desc" });
      body.createEl("p", { text: "\u5DF2\u7ECF\u88AB Git \u8FFD\u8E2A\u7684\u6587\u4EF6\uFF0C\u9700\u8981\u5728\u5B8C\u6210\u63A5\u5165\u65F6\u9009\u62E9\u91CD\u5EFA\u8FFD\u8E2A\uFF1B\u672C\u673A\u6587\u4EF6\u4E0D\u4F1A\u56E0\u6B64\u5220\u9664\u3002", cls: "zoey-sync-section-desc" });
      const finalRules = body.createEl("details", { cls: "zoey-sync-setup-files" });
      finalRules.createEl("summary", { text: "\u67E5\u770B\u91CD\u5EFA\u540E\u7684 .gitignore\uFF08\u5B8C\u6574\u89C4\u5219\uFF09" });
      finalRules.createEl("pre", { text: preview.optimizedIgnore || "\uFF08\u7A7A\uFF09" });
      if (preview.missingIgnoreRules.length) {
        const rules = body.createEl("details", { cls: "zoey-sync-setup-files" });
        rules.createEl("summary", { text: `\u67E5\u770B\u5F85\u8865\u5145\u7684\u89C4\u5219\uFF08${preview.missingIgnoreRules.length}\uFF09` });
        rules.createEl("pre", { text: preview.missingIgnoreRules.join("\n") });
      }
      if (preview.localRoot && !preview.relatedHistory && preview.localBranch !== preview.branch) {
        body.createEl("p", { text: `\u672C\u673A\u5DF2\u6709\u72EC\u7ACB\u5386\u53F2\uFF0C\u5F53\u524D ${preview.localBranch} \u5206\u652F\u63A5\u5165\u540E\u4F1A\u63A8\u9001\u5230\u8FDC\u7AEF ${preview.branch} \u5206\u652F\u3002\u8BF7\u6838\u5BF9\u8FD9\u662F\u5426\u662F\u8981\u63A5\u5165\u7684\u4ED3\u5E93\u3002`, cls: "zoey-sync-section-desc" });
      }
      if (preview.localRoot) {
        body.createEl("p", { text: `\u672C\u673A ${preview.trackedExcludedLocal.length} \u4E2A\u3001GitHub ${preview.trackedExcludedRemote.length} \u4E2A\u6587\u4EF6\u4ECD\u88AB\u8FFD\u8E2A\uFF0C\u4F46\u7B26\u5408\u5FFD\u7565\u89C4\u5219\u3002\u5DF2\u8FFD\u8E2A\u6587\u4EF6\u4E0D\u4F1A\u4EC5\u56E0\u52A0\u5165 .gitignore \u5C31\u9000\u51FA\u540C\u6B65\u3002`, cls: "zoey-sync-section-desc" });
        this.setupFileList(body, "\u672C\u5730\u5DF2\u8DDF\u8E2A\u4F46\u5EFA\u8BAE\u5FFD\u7565", preview.trackedExcludedLocal);
        this.setupFileList(body, "\u8FDC\u7AEF\u5DF2\u8DDF\u8E2A\u4F46\u5EFA\u8BAE\u5FFD\u7565", preview.trackedExcludedRemote);
        if (!this.plugin.settings.setupComplete && (preview.trackedExcludedLocal.length || preview.trackedExcludedRemote.length)) {
          const trackingSetting = new import_obsidian5.Setting(body).setName("\u91CD\u5EFA\u5DF2\u6709\u6587\u4EF6\u7684\u8FFD\u8E2A").setDesc("\u6309\u4F18\u5316\u540E\u7684\u89C4\u5219\u91CD\u5EFA Git \u8FFD\u8E2A\u3002\u672C\u673A\u6587\u4EF6\u4FDD\u7559\uFF1B\u6B64\u64CD\u4F5C\u63D0\u4EA4\u5E76\u63A8\u9001\u540E\uFF0C\u4F1A\u6539\u53D8\u8FDC\u7AEF\u7684\u6587\u4EF6\u8FFD\u8E2A\u3002").addButton((button) => button.setButtonText("\u6839\u636E\u5EFA\u8BAE\u91CD\u5EFA Git \u8FFD\u8E2A").setDisabled(ignoreDiffers && !ignoreChoice).onClick(() => {
            this.setupTrackingPending = true;
            this.renderSettings();
          }));
          trackingSetting.settingEl.addClass("zoey-sync-setup-tracking-setting");
          if (this.setupTrackingPending) {
            const detail = body.createEl("details", { cls: "zoey-sync-setup-files" });
            detail.createEl("summary", { text: "\u5C55\u5F00\u67E5\u770B\u91CD\u5EFA\u8BE6\u60C5" });
            detail.createEl("p", { text: "\u8FD9\u91CC\u786E\u8BA4\u91CD\u5EFA\u8BA1\u5212\uFF1B\u5B9E\u9645\u91CD\u5EFA\u5728\u5B8C\u6210\u63A5\u5165\u65F6\u6267\u884C\u3002\u53D6\u6D88\u5219\u4FDD\u7559\u73B0\u6709\u8FFD\u8E2A\u3002" });
            detail.createEl("p", { text: "\u5EFA\u8BAE\u89C4\u5219\u6309\u7528\u9014\u5F52\u7C7B\u3002\u9644\u4EF6\u3001\u4E2A\u4EBA\u76EE\u5F55\u53CA\u539F\u6709\u4F8B\u5916\u89C4\u5219\u4E0D\u4F1A\u65B0\u589E\u4E3A\u901A\u7528\u5EFA\u8BAE\uFF1B\u5B8C\u6574\u89C4\u5219\u4FDD\u7559\u539F\u6709\u987A\u5E8F\u3002" });
            for (const group of setupIgnoreRuleGroups(preview, this.plugin.app.vault.configDir)) {
              new import_obsidian5.Setting(detail).setName("").setHeading();
              detail.createEl("pre", { text: [...new Set(group.rules)].join("\n") });
            }
            const original = detail.createEl("details", { cls: "zoey-sync-setup-files" });
            original.createEl("summary", { text: "\u539F\u6709\u7528\u6237\u89C4\u5219\uFF08\u6240\u9009\u57FA\u51C6\uFF0C\u539F\u6837\u4FDD\u7559\uFF09" });
            original.createEl("pre", { text: (ignoreChoice === "remote" ? preview.remoteIgnore : preview.localIgnore) || "\uFF08\u7A7A\uFF09" });
            this.setupFileList(detail, "\u672C\u5730\u5C06\u505C\u6B62\u8FFD\u8E2A", preview.trackedExcludedLocal);
            this.setupFileList(detail, "\u8FDC\u7AEF\u5EFA\u8BAE\u505C\u6B62\u8FFD\u8E2A", preview.trackedExcludedRemote);
            const trackingConfirm = new import_obsidian5.Setting(body).addButton((button) => button.setButtonText("\u786E\u5B9A").setCta().onClick(() => {
              this.plugin.setSetupTrackingChoice("rebuild");
              this.setupRebuildConfirmed = true;
              this.setupTrackingPending = false;
              this.updateSetupPreviewSelection();
            })).addButton((button) => button.setButtonText("\u53D6\u6D88").onClick(() => {
              this.plugin.setSetupTrackingChoice("keep");
              this.setupRebuildConfirmed = false;
              this.setupTrackingPending = false;
              this.updateSetupPreviewSelection();
            }));
            trackingConfirm.settingEl.addClass("zoey-sync-setup-tracking-setting");
          }
          if (this.plugin.getSetupTrackingChoice()) body.createEl("p", {
            text: this.plugin.getSetupTrackingChoice() === "rebuild" ? "\u2713 \u5DF2\u786E\u8BA4\u91CD\u5EFA Git \u8FFD\u8E2A" : "\u5DF2\u53D6\u6D88\u91CD\u5EFA\uFF0C\u4FDD\u7559\u73B0\u6709\u8FFD\u8E2A\u3002",
            cls: "zoey-sync-section-desc"
          });
        }
      }
      new import_obsidian5.Setting(body).setName("\u6587\u4EF6\u5DEE\u5F02").setHeading();
      this.setupFileList(body, "\u4EC5\u672C\u5730\u6587\u4EF6", preview.localOnly);
      this.setupFileList(body, "\u4EC5\u8FDC\u7AEF\u6587\u4EF6", preview.remoteOnly);
      if (this.plugin.settings.setupComplete) this.setupFileList(body, "\u540C\u540D\u6587\u4EF6", preview.overlaps);
      if (!preview.overlaps.length) body.createEl("p", { text: "\u6CA1\u6709\u9700\u8981\u9010\u9879\u9009\u62E9\u7684\u540C\u540D\u5DEE\u5F02\u3002", cls: "zoey-sync-setup-done" });
      if (preview.overlaps.length && !this.plugin.settings.setupComplete) {
        const choices = this.plugin.getSetupChoices();
        const handled = preview.overlaps.filter((path2) => !!choices[path2]).length;
        new import_obsidian5.Setting(body).setName("\u5904\u7406\u540C\u540D\u6587\u4EF6\u5DEE\u5F02").setDesc(`\u5DF2\u9009\u62E9 ${handled} / ${preview.overlaps.length} \u4E2A\u6587\u4EF6\u3002\u5C55\u5F00\u7A97\u53E3\u5BF9\u7167\u5185\u5BB9\uFF0C\u786E\u8BA4\u672C\u673A\u6216 GitHub \u7248\u672C\u3002`).addButton((button) => button.setButtonText("\u5904\u7406\u6587\u4EF6\u5DEE\u5F02").onClick(() => {
          new SetupDifferencesModal(
            this.app,
            preview.overlaps,
            choices,
            (path2) => this.plugin.readSetupOverlap(path2),
            (selected) => {
              if (this.plugin.getSetupPreview() !== preview) return;
              for (const path2 of preview.overlaps) this.plugin.setSetupChoice(path2, selected[path2]);
              this.updateSetupPreviewSelection();
            }
          ).open();
        }));
      }
    }
  }
  setupPreviewReady() {
    const preview = this.plugin.getSetupPreview();
    if (!preview) return false;
    const choices = this.plugin.getSetupChoices();
    if (setupIgnoreDiffers(preview) && !choices[".gitignore"]) return false;
    if (preview.overlaps.some((path2) => !choices[path2])) return false;
    return !(preview.trackedExcludedLocal.length || preview.trackedExcludedRemote.length) || !!this.plugin.getSetupTrackingChoice();
  }
  setupFileList(body, title, paths) {
    if (paths.length === 0) return;
    const details = body.createEl("details", { cls: "zoey-sync-setup-files" });
    details.createEl("summary", { text: `${title}\uFF08${paths.length}\uFF09` });
    for (const path2 of paths.slice(0, 200)) details.createDiv({ text: path2 });
    if (paths.length > 200) details.createEl("p", { text: `\u8FD8\u6709 ${paths.length - 200} \u4E2A\u6587\u4EF6\u672A\u5728\u8FD9\u91CC\u5C55\u5F00\u3002` });
  }
  displaySetupFinish(body) {
    const preview = this.plugin.getSetupPreview();
    if (!preview) {
      body.createEl("p", { text: this.plugin.settings.setupComplete && this.plugin.settings.setupVerified ? `\u5DF2\u63A5\u5165 ${this.plugin.settings.setupVerified.url}\u3002\u5982\u9700\u67E5\u770B\u5F53\u524D\u4E24\u7AEF\u6587\u4EF6\uFF0C\u8BF7\u8FD4\u56DE\u7B2C 3 \u6B65\u91CD\u65B0\u8BFB\u53D6\u3002` : this.plugin.settings.setupComplete ? "\u5F53\u524D\u8FDE\u63A5\u6765\u81EA\u65E7\u7248\u8BBE\u7F6E\uFF0C\u5C1A\u672A\u7ECF\u8FC7\u6B64\u5411\u5BFC\uFF1B\u5982\u9700\u68C0\u67E5\u63A5\u5165\uFF0C\u8BF7\u4ECE\u7B2C\u4E00\u6B65\u91CD\u65B0\u5F00\u59CB\u3002" : "\u672C\u6B21\u6253\u5F00\u540E\u5C1A\u65E0\u68C0\u67E5\u7ED3\u679C\uFF0C\u8BF7\u8FD4\u56DE\u7B2C 3 \u6B65\u91CD\u65B0\u68C0\u67E5\u3002" });
      return;
    }
    const remoteIgnoreSelected = this.plugin.getSetupChoices()[".gitignore"] === "remote";
    const ignoreSummary = remoteIgnoreSelected ? `\u5C06\u4EE5\u8FDC\u7AEF .gitignore \u4E3A\u57FA\u51C6\u4F18\u5316\uFF0C\u8865\u5145 ${preview.missingIgnoreRules.length} \u6761\u5EFA\u8BAE\u89C4\u5219\u3002` : preview.missingIgnoreRules.length ? `\u5C06\u4FDD\u7559\u73B0\u6709 .gitignore\uFF0C\u5E76\u8865\u5145 ${preview.missingIgnoreRules.length} \u6761\u5EFA\u8BAE\u89C4\u5219\u3002` : "\u73B0\u6709 .gitignore \u5DF2\u5305\u542B\u5EFA\u8BAE\u89C4\u5219\u3002";
    body.createEl("p", { text: `\u5C06\u4FDD\u7559\u672C\u5730 ${preview.localFiles.length} \u4E2A\u6587\u4EF6\uFF0C\u5E76\u63A5\u5165\u8FDC\u7AEF ${preview.remoteFiles.length} \u4E2A\u6587\u4EF6\u3002${ignoreSummary}` });
    if (preview.nestedRepos.length) body.createEl("p", {
      text: `\u5DF2\u8BC6\u522B ${preview.nestedRepos.length} \u4E2A\u5185\u5D4C\u4ED3\u5E93\uFF1B${this.plugin.settings.setupComplete ? "\u4E0B\u6B21\u540C\u6B65" : "\u5B8C\u6210\u63A5\u5165"}\u65F6\u5C06\u91CD\u5EFA\u4E3B\u4ED3\u5E93\u5BF9\u5C0F\u5E93\u6587\u4EF6\u7684\u8FFD\u8E2A\uFF0C\u5E76\u5FFD\u7565\u5C0F\u5E93\u7684 .git \u5143\u6570\u636E\u3002`,
      cls: "zoey-sync-section-desc"
    });
    if (preview.localRoot) {
      const trackingChoice = this.plugin.getSetupTrackingChoice();
      body.createEl("p", { text: trackingChoice === "rebuild" ? "\u5DF2\u9009\u62E9\u6309\u5FFD\u7565\u89C4\u5219\u91CD\u5EFA\u8FFD\u8E2A\u3002\u672C\u673A\u6587\u4EF6\u4FDD\u7559\uFF1B\u4E0B\u6B21\u63A8\u9001\u540E\uFF0C\u88AB\u5FFD\u7565\u6587\u4EF6\u4F1A\u4ECE GitHub \u5F53\u524D\u7248\u672C\u9000\u51FA\u3002" : trackingChoice === "keep" ? "\u5DF2\u9009\u62E9\u6682\u65F6\u4FDD\u7559\u73B0\u6709\u8FFD\u8E2A\uFF1B\u5DF2\u63D0\u4EA4\u7684\u672C\u673A\u72B6\u6001\u4ECD\u4F1A\u7EE7\u7EED\u540C\u6B65\u3002" : "\u672C\u6B21\u4FDD\u6301\u73B0\u6709\u8FFD\u8E2A\uFF1B\u5982\u9700\u6E05\u7406\u5DF2\u63D0\u4EA4\u7684\u672C\u673A\u6587\u4EF6\uFF0C\u53EF\u5728 Git \u540C\u6B65\u8BBE\u7F6E\u4E2D\u68C0\u67E5\u5E76\u4FEE\u590D\u3002", cls: "zoey-sync-section-desc" });
    }
    const authorNameSetting = new import_obsidian5.Setting(body).setName("\u63D0\u4EA4\u4F5C\u8005\u540D\u79F0").setDesc("\u663E\u793A\u5728 Git \u63D0\u4EA4\u8BB0\u5F55\u4E2D\uFF0C\u4E0D\u662F\u767B\u5F55\u8D26\u53F7\u3002").addText((text) => text.setValue(this.plugin.settings.gitAuthorName === DEFAULT_GIT_AUTHOR_NAME ? "" : this.plugin.settings.gitAuthorName).onChange(async (value) => {
      this.plugin.settings.gitAuthorName = value.trim();
      await this.plugin.saveSettings();
    }));
    authorNameSetting.settingEl.addClass("zoey-sync-setup-author-setting");
    const authorEmailSetting = new import_obsidian5.Setting(body).setName("\u63D0\u4EA4\u4F5C\u8005\u90AE\u7BB1").setDesc("\u7528\u4E8E Git \u63D0\u4EA4\u8BB0\u5F55\uFF0C\u4E0D\u662F\u767B\u5F55\u5BC6\u7801\u3002").addText((text) => text.setValue(this.plugin.settings.gitAuthorEmail === DEFAULT_GIT_AUTHOR_EMAIL ? "" : this.plugin.settings.gitAuthorEmail).onChange(async (value) => {
      this.plugin.settings.gitAuthorEmail = value.trim();
      await this.plugin.saveSettings();
    }));
    authorEmailSetting.settingEl.addClass("zoey-sync-setup-author-setting");
    if (!this.plugin.settings.setupComplete && preview.missingIgnoreRules.length > 0) {
      const rules = body.createEl("details", { cls: "zoey-sync-setup-files" });
      rules.createEl("summary", { text: `\u67E5\u770B\u5C06\u8865\u5145\u7684 ${preview.missingIgnoreRules.length} \u6761 .gitignore \u89C4\u5219` });
      rules.createEl("pre", { text: preview.missingIgnoreRules.join("\n") });
    }
    if (preview.overlaps.length) this.setupFileList(body, "\u5DF2\u9009\u62E9\u8FDC\u7AEF\u7248\u672C\u7684\u540C\u540D\u6587\u4EF6", preview.overlaps.filter((path2) => this.plugin.getSetupChoices()[path2] === "remote"));
    if (this.setupBusy || this.setupFailure) {
      body.createEl("p", {
        text: this.setupBusy ? "\u6B63\u5728\u5B8C\u6210\u63A5\u5165\uFF0C\u8BF7\u7A0D\u5019\u2026" : this.setupMessage,
        cls: `zoey-sync-setup-finish-progress ${this.setupFailure ? "zoey-sync-setup-error" : "zoey-sync-setup-feedback"}`,
        attr: { role: "status", "aria-live": "polite" }
      });
    }
    if (!this.plugin.settings.setupComplete) {
      const footer = body.createDiv({ cls: "zoey-sync-setup-footer" });
      const finish = footer.createEl("button", { text: "\u5B8C\u6210\u63A5\u5165\u5E76\u9996\u6B21\u63A8\u9001", cls: "mod-cta", attr: { type: "button" } });
      finish.disabled = this.setupBusy || this.plugin.getSetupTrackingChoice() === "rebuild" && !this.setupRebuildConfirmed;
      finish.addEventListener("click", () => void this.runSetup(() => this.plugin.finishSetup(this.setupRebuildConfirmed, (message, error) => {
        if (this.desktopPage !== "setup" || this.setupViewStep !== 4) return;
        this.setupMessage = message;
        const progress = this.containerEl.querySelector(".zoey-sync-setup-finish-progress");
        if (progress) {
          progress.textContent = message;
          progress.toggleClass("zoey-sync-setup-error", !!error);
          progress.toggleClass("zoey-sync-setup-feedback", !error);
        }
      }), "\u9996\u6B21\u63A8\u9001\u6210\u529F\uFF0C\u5411\u5BFC\u5DF2\u5B8C\u6210\u3002"));
    }
  }
  displayDesktopAdvanced(containerEl) {
    const preview = this.currentDevice() !== "git";
    containerEl.createEl("p", { text: "\u901A\u5E38\u4E0D\u9700\u8981\u4FEE\u6539", cls: "zoey-sync-advanced-intro" });
    const advancedBody = containerEl.createDiv({ cls: "zoey-sync-card zoey-sync-advanced__body" });
    new import_obsidian5.Setting(advancedBody).setName("\u754C\u9762\u8BBE\u7F6E").setHeading();
    const versionViewSetting = new import_obsidian5.Setting(advancedBody).setName("\u663E\u793A\u5F85 commit \u5217\u8868").setDesc("\u5728\u540C\u6B65\u6309\u94AE\u65C1\u663E\u793A\u5F85\u4E0A\u4F20\u548C\u5F85 commit \u5207\u6362\u3002\u5173\u95ED\u65F6\u53EA\u663E\u793A\u5F85\u4E0A\u4F20\u6587\u4EF6\u3002");
    const versionViewIcon = versionViewSetting.nameEl.createSpan({ cls: "zoey-sync-setting-mode-icon" });
    (0, import_obsidian5.addIcon)("simple-link-mode-setting", '<svg viewBox="0 0 32 18" aria-hidden="true"><g><circle cx="7.5" cy="9" r="5.25"/><path d="m4.9 9.1 1.7 1.7 3.5-3.8"/></g><path class="mode-divider" d="M16 3.25v11.5"/><g><path d="M23.75 11.75v-7.5"/><path d="m20.75 7.25 3-3 3 3"/><path d="M19.25 12.75v1.5h9v-1.5"/></g></svg>');
    (0, import_obsidian5.setIcon)(versionViewIcon, "simple-link-mode-setting");
    versionViewSetting.nameEl.prepend(versionViewIcon);
    versionViewSetting.addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.showVersionViewSwitcher).onChange((value) => void this.plugin.setVersionViewSwitcher(value))
    );
    new import_obsidian5.Setting(advancedBody).setName("\u6587\u4EF6\u8FFD\u8E2A").setHeading();
    new import_obsidian5.Setting(advancedBody).setName("\u6309\u5FFD\u7565\u89C4\u5219\u4FEE\u590D\u8FFD\u8E2A").setDesc("\u5148\u68C0\u67E5 .gitignore \u548C\u5DF2\u8FFD\u8E2A\u6587\u4EF6\uFF0C\u518D\u53EA\u8BA9\u5E94\u5FFD\u7565\u7684\u6587\u4EF6\u9000\u51FA Git \u8DDF\u8E2A\u3002\u672C\u673A\u6587\u4EF6\u4FDD\u7559\uFF1B\u4E0D\u4F1A\u7ACB\u5373 commit \u6216 push\u3002\u82E5\u6709\u672A\u89E3\u51B3\u7684\u5408\u5E76\u51B2\u7A81\uFF0C\u8BF7\u5148\u5904\u7406\u3002").addButton((button) => button.setButtonText("\u68C0\u67E5\u5E76\u4FEE\u590D\u6587\u4EF6\u8FFD\u8E2A").setDisabled(preview).onClick(async () => {
      button.setDisabled(true);
      button.setButtonText("\u6B63\u5728\u68C0\u67E5\u2026");
      try {
        const result = await this.plugin.inspectFileTracking();
        new FileTrackingModal(this.app, this.plugin, result).open();
      } catch (error) {
        new import_obsidian5.Notice(`Simple Link\uFF1A\u65E0\u6CD5\u68C0\u67E5\u6587\u4EF6\u8FFD\u8E2A\u3002${messageOf2(error)}`, 1e4);
      } finally {
        button.setDisabled(false);
        button.setButtonText("\u68C0\u67E5\u5E76\u4FEE\u590D\u6587\u4EF6\u8FFD\u8E2A");
      }
    }));
    new import_obsidian5.Setting(advancedBody).setName("\u540C\u6B65\u65F6\u95F4\u8BBE\u7F6E").setHeading();
    new import_obsidian5.Setting(advancedBody).setName("\u7A7A\u95F2\u540E\u6C47\u603B\u53D8\u5316\u6587\u4EF6\u5217\u8868\uFF08\u79D2\uFF09").setDesc("\u6301\u7EED\u591A\u4E45\u6CA1\u6709\u6587\u4EF6\u53D8\u5316\u540E\u6C47\u603B\u6240\u6709\u53D8\u5316\u6587\u4EF6\uFF0C\u751F\u6210\u5F85 commit\uFF0F\u4E0A\u4F20\u5217\u8868\u3002").addText((text) => {
      text.inputEl.type = "number";
      text.inputEl.min = "0.5";
      text.inputEl.step = "0.5";
      text.setValue(String(this.plugin.settings.viewRefreshDelaySeconds)).onChange(async (value) => {
        this.plugin.settings.viewRefreshDelaySeconds = Math.max(0.5, Number(value) || 7);
        await this.plugin.saveSettings();
      });
    });
    new import_obsidian5.Setting(advancedBody).setName("\u7A7A\u95F2\u540E\u81EA\u52A8 commit\uFF08\u5206\u949F\uFF09").setDesc("\u6301\u7EED\u591A\u4E45\u6CA1\u6709\u6587\u4EF6\u53D8\u5316\u540E\u521B\u5EFA commit\u3002\u8BBE\u4E3A 0 \u53EF\u5173\u95ED\u3002").addText((text) => this.addTimingInput(text, "autoCommitIdleMinutes", 5));
    new import_obsidian5.Setting(advancedBody).setName("\u7A7A\u95F2\u540E\u81EA\u52A8 push\uFF08\u5206\u949F\uFF09").setDesc("\u6709\u5F85\u4E0A\u4F20 commit \u65F6\uFF0C\u6301\u7EED\u591A\u4E45\u6CA1\u6709\u6587\u4EF6\u53D8\u5316\u540E fetch\u3001\u6309\u9700 merge \u5E76 push\uFF1B\u4E0D\u4F1A\u63D0\u524D\u81EA\u52A8 commit\u3002\u8BBE\u4E3A 0 \u53EF\u5173\u95ED\u3002").addText((text) => this.addTimingInput(text, "autoPushIdleMinutes", 30));
    new import_obsidian5.Setting(advancedBody).setName("\u5F3A\u5236 commit \u95F4\u9694\uFF08\u5206\u949F\uFF09").setDesc("\u4ECE\u9996\u6B21\u68C0\u6D4B\u5230\u672A\u63D0\u4EA4\u6539\u52A8\u8D77\uFF0C\u5230\u70B9\u5373 commit \u5F53\u524D\u6240\u6709\u672C\u673A\u6539\u52A8\uFF0C\u4E0D\u518D\u7B49\u5F85\u7A7A\u95F2\u3002\u8BBE\u4E3A 0 \u53EF\u5173\u95ED\u3002").addText((text) => this.addTimingInput(text, "maxUncommittedMinutes", 30));
    new import_obsidian5.Setting(advancedBody).setName("\u5F3A\u5236 push \u95F4\u9694\uFF08\u5206\u949F\uFF09").setDesc("\u6700\u65E9\u7684\u5F85\u4E0A\u4F20 commit \u5230\u70B9\u540E\uFF0C\u5148\u5F3A\u5236 commit \u5F53\u524D\u672C\u673A\u66F4\u6539\uFF08\u5305\u62EC\u6B63\u5728\u7F16\u8F91\u7684\u6587\u4EF6\uFF09\uFF0C\u518D fetch\u3001\u6309\u9700 merge \u5E76 push\u3002\u8BBE\u4E3A 0 \u53EF\u5173\u95ED\u3002").addText((text) => this.addTimingInput(text, "maxUnpushedMinutes", 60));
    new import_obsidian5.Setting(advancedBody).setName("\u542F\u52A8\u540E\u81EA\u52A8 commit\u3001fetch \u5E76 merge").setDesc("\u542F\u52A8\u540E\u5148 commit \u5F53\u524D\u672C\u673A\u6539\u52A8\uFF0C\u518D\u83B7\u53D6\u4E91\u7AEF\u6700\u65B0\u63D0\u4EA4\u5E76\u5408\u5E76\u5230\u672C\u673A\uFF1B\u4E0D\u4F1A\u7ACB\u5373 push\u3002").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.pullOnStartup).onChange(async (value) => {
        this.plugin.settings.pullOnStartup = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian5.Setting(advancedBody).setName("\u81EA\u52A8 fetch \u4E0E merge \u95F4\u9694\uFF08\u5206\u949F\uFF09").setDesc("\u6309\u6B64\u65F6\u95F4\u95F4\u9694\u83B7\u53D6\u4E91\u7AEF\u6700\u65B0\u63D0\u4EA4\u5E76\u5408\u5E76\u5230\u672C\u673A\uFF1B\u4E0D\u4F1A\u6267\u884C push\u3002\u8BBE\u4E3A 0 \u53EF\u5173\u95ED\u3002").addText((text) => this.addTimingInput(text, "autoPullIntervalMinutes", 5));
    new import_obsidian5.Setting(advancedBody).setName("Git \u8BBE\u7F6E").setHeading();
    new import_obsidian5.Setting(advancedBody).setName("\u5206\u652F").setDesc("\u9ED8\u8BA4\u4F7F\u7528 master\uFF1B\u53EA\u6709\u4ED3\u5E93\u4F7F\u7528\u5176\u4ED6\u5206\u652F\u65F6\u624D\u9700\u8981\u4FEE\u6539\u3002").addText(
      (text) => text.setValue(this.plugin.settings.gitBranch).onChange(async (value) => {
        this.plugin.settings.gitBranch = value.trim() || "master";
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian5.Setting(advancedBody).setName("\u63D0\u4EA4\u4F5C\u8005\u540D\u79F0").setDesc("Git \u521B\u5EFA\u7248\u672C\u8BB0\u5F55\u65F6\u4F7F\u7528\uFF1B\u901A\u5E38\u4F1A\u81EA\u52A8\u8BFB\u53D6\u672C\u673A\u5DF2\u6709\u7684 Git \u914D\u7F6E\u3002").addText(
      (text) => text.setValue(this.plugin.settings.gitAuthorName).onChange(async (value) => {
        this.plugin.settings.gitAuthorName = value.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian5.Setting(advancedBody).setName("\u63D0\u4EA4\u4F5C\u8005\u90AE\u7BB1").setDesc("\u7528\u4E8E\u6807\u8BC6 Git \u63D0\u4EA4\u4F5C\u8005\uFF0C\u4E0D\u662F\u767B\u5F55\u5BC6\u7801\uFF1B\u901A\u5E38\u4F1A\u81EA\u52A8\u8BFB\u53D6\u3002").addText(
      (text) => text.setValue(this.plugin.settings.gitAuthorEmail).onChange(async (value) => {
        this.plugin.settings.gitAuthorEmail = value.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian5.Setting(advancedBody).setName("\u6545\u969C\u6392\u67E5").setHeading();
    new import_obsidian5.Setting(advancedBody).setName("\u5F02\u5E38\u4FEE\u590D").setDesc("\u6062\u590D\u672A\u5B8C\u6210\u7684 rebase\u3001merge \u7B49 Git \u64CD\u4F5C\uFF0C\u4EE5\u5F53\u524D\u672C\u673A\u5185\u5BB9\u91CD\u65B0 commit\uFF0C\u518D fetch \u5E76 merge\uFF1B\u4E0D\u4F1A\u7ACB\u5373 push\u3002").addButton(
      (button) => button.setButtonText("\u6062\u590D\u6B63\u5E38\u540C\u6B65").setDisabled(preview).onClick(async () => {
        button.setDisabled(true);
        button.setButtonText("\u6B63\u5728\u68C0\u67E5\u2026");
        try {
          const operation = await this.plugin.getInterruptedGitOperationLabel();
          if (!operation) {
            new import_obsidian5.Notice("Simple Link\uFF1A\u6CA1\u6709\u68C0\u6D4B\u5230\u672A\u5B8C\u6210\u7684 rebase\u3001merge\u3001cherry-pick \u6216 revert");
            return;
          }
          new GitRepairModal(this.app, this.plugin, operation).open();
        } catch (error) {
          new import_obsidian5.Notice(`Simple Link\uFF1A\u65E0\u6CD5\u68C0\u67E5 Git \u72B6\u6001\u3002${messageOf2(error)}`, 1e4);
        } finally {
          button.setDisabled(false);
          button.setButtonText("\u6062\u590D\u6B63\u5E38\u540C\u6B65");
        }
      })
    );
    new import_obsidian5.Setting(advancedBody).setName("\u672C\u5730 Git \u5386\u53F2\u7626\u8EAB").setDesc("\u9ED8\u8BA4\u4FDD\u7559\u6700\u8FD1 30 \u5929\u7684\u672C\u5730\u5386\u53F2\u3002\u5148\u8054\u7F51\u786E\u8BA4\u5F53\u524D commit \u5DF2\u4E0A\u4F20\uFF0C\u518D\u6E05\u7406\u672C\u673A\u65E7\u5386\u53F2\uFF1B\u4E0D\u4F1A\u5220\u9664 GitHub \u4E0A\u7684\u7248\u672C\u3002").addButton(
      (button) => button.setButtonText("\u68C0\u67E5\u5E76\u9884\u89C8").setDisabled(preview).onClick(async () => {
        button.setDisabled(true);
        button.setButtonText("\u6B63\u5728\u6838\u9A8C\u2026");
        try {
          const result = await this.plugin.inspectLocalHistory();
          new LocalHistorySlimModal(this.app, this.plugin, result).open();
        } catch (error) {
          new import_obsidian5.Notice(`Simple Link\uFF1A\u65E0\u6CD5\u9884\u89C8\u672C\u5730\u5386\u53F2\u3002${messageOf2(error)}`, 12e3);
        } finally {
          button.setDisabled(false);
          button.setButtonText("\u68C0\u67E5\u5E76\u9884\u89C8");
        }
      })
    );
    const logs = this.plugin.getRecentErrorLogs();
    const errorCount = logs.filter((entry) => entry.status !== "success").length;
    new import_obsidian5.Setting(advancedBody).setName("\u6700\u8FD1\u540C\u6B65\u65E5\u5FD7").setDesc(
      errorCount > 0 ? `\u6700\u8FD1 24 \u5C0F\u65F6\u5171 ${logs.length} \u6761\u8BB0\u5F55\uFF0C\u5176\u4E2D ${errorCount} \u6761\u9519\u8BEF\u3002` : `\u6700\u8FD1 24 \u5C0F\u65F6\u5171 ${logs.length} \u6761\u8BB0\u5F55\uFF0C\u6CA1\u6709\u9519\u8BEF\u3002`
    ).addButton(
      (button) => button.setButtonText("\u67E5\u770B\u65E5\u5FD7").onClick(() => new ErrorLogModal(this.app, this.plugin).open())
    );
  }
  addTimingInput(text, key, fallback) {
    text.inputEl.type = "number";
    text.inputEl.min = "0";
    text.inputEl.step = "1";
    text.setValue(String(this.plugin.settings[key])).onChange(async (value) => {
      this.plugin.settings[key] = Math.max(0, Number(value) || (value.trim() === "0" ? 0 : fallback));
      await this.plugin.saveSettings();
      await this.plugin.restartDesktopAutomation();
    });
  }
};
function asyncAction(action) {
  return () => {
    void action().catch((error) => new import_obsidian5.Notice(messageOf2(error), 8e3));
  };
}
