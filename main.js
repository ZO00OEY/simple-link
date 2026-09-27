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
  default: () => SimpleSyncPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian3 = require("obsidian");

// src/dirty.ts
var DEFAULT_SYNC_IGNORE_PATTERNS = [
  ".git/",
  ".simple-sync/",
  ".obsidian/cache/",
  ".obsidian/workspace.json",
  ".obsidian/workspaces/",
  ".obsidian/trash/",
  ".obsidian/plugins/obsidian-git/data.json",
  ".DS_Store",
  "Thumbs.db",
  "desktop.ini",
  "*.bak",
  "*.tmp",
  "conflict-files-obsidian-git.md",
  ".smart-env/",
  ".obsidian/plugins/recent-files-obsidian/data.json",
  ".obsidian/workspace-mobile.json",
  ".obsidian/plugins/simple-sync/data.json",
  "node_modules/",
  ".trash/",
  ".claudian/sessions/",
  ".codex/AGENTS.md",
  ".codex/output/"
];
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
function matchesIgnorePattern(path, rawPattern) {
  let pattern = rawPattern.trim().replace(/\\/g, "/");
  if (!pattern || pattern.startsWith("#")) return false;
  if (pattern.startsWith("!")) pattern = pattern.slice(1);
  if (pattern.startsWith("/")) pattern = pattern.slice(1);
  const directoryOnly = pattern.endsWith("/");
  if (directoryOnly) pattern = pattern.slice(0, -1);
  if (!pattern) return false;
  const prefix = pattern.includes("/") ? "^" : "(?:^|/)";
  const suffix = directoryOnly ? "(?:/.*)?$" : "$";
  return new RegExp(`${prefix}${globToRegex(pattern)}${suffix}`).test(path);
}
function shouldIgnore(path, patterns = DEFAULT_SYNC_IGNORE_PATTERNS) {
  const normalized = path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/$/, "");
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
function partitionCommitChanges(changes, activePaths) {
  const included = [];
  const skipped = [];
  const skippedPaths = /* @__PURE__ */ new Set();
  for (const change of changes) {
    const paths = [change.path, change.oldPath].filter((path) => Boolean(path));
    if (paths.some((path) => activePaths.has(path))) {
      skipped.push(change);
      for (const path of paths) skippedPaths.add(path);
    } else {
      included.push(change);
    }
  }
  return { included, skipped, skippedPaths: [...skippedPaths] };
}
function findRemoteChangeOverlaps(localChanges, remoteChanges) {
  const localPaths = new Set(
    localChanges.flatMap((change) => [change.path, change.oldPath].filter((path) => Boolean(path)))
  );
  const remotePaths = new Set(
    remoteChanges.flatMap((change) => [change.path, change.oldPath].filter((path) => Boolean(path)))
  );
  return [...localPaths].filter((path) => remotePaths.has(path)).sort((a, b) => a.localeCompare(b));
}
function parseGitStatus(output) {
  const records = output.split("\0").filter(Boolean);
  const changes = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const code = record.slice(0, 2);
    const path = record.slice(3);
    if (!path) continue;
    if (code.includes("R") || code.includes("C")) {
      changes.push({ path, oldPath: records[++index], kind: "moved" });
    } else if (code === "??" || code.includes("A")) {
      changes.push({ path, kind: "added" });
    } else if (code.includes("D")) {
      changes.push({ path, kind: "deleted" });
    } else if (code.includes("M")) {
      changes.push({ path, kind: "modified" });
    } else {
      changes.push({ path, kind: "changed" });
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
      const path2 = fields[++index];
      if (path2 && oldPath) changes.push({ path: path2, oldPath, kind: "moved" });
      continue;
    }
    const path = fields[++index];
    if (!path) continue;
    if (kindCode === "A") changes.push({ path, kind: "added" });
    else if (kindCode === "D") changes.push({ path, kind: "deleted" });
    else if (kindCode === "M") changes.push({ path, kind: "modified" });
    else changes.push({ path, kind: "changed" });
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
var SimpleSyncConflictPreviewModal = class extends import_obsidian.Modal {
  constructor(app) {
    super(app);
    this.pending = new Set(SAMPLE_FILES.map((file) => file.path));
    this.fileChoices = /* @__PURE__ */ new Map();
    this.blockChoices = /* @__PURE__ */ new Map();
    this.appliedCount = 0;
  }
  onOpen() {
    this.modalEl.addClass("simple-sync-preview-modal");
    this.render(false);
  }
  onClose() {
    this.contentEl.empty();
  }
  render(preserveScroll = true) {
    const root = this.contentEl;
    const scrollTop = preserveScroll ? root.scrollTop : 0;
    root.empty();
    root.addClass("simple-sync-preview");
    const header = root.createDiv({ cls: "simple-sync-preview__header" });
    const heading = header.createDiv();
    heading.createDiv({ text: "\u754C\u9762\u9884\u89C8 \xB7 \u793A\u4F8B\u6570\u636E", cls: "simple-sync-preview__eyebrow" });
    heading.createEl("h2", { text: "\u5904\u7406\u6587\u4EF6\u5DEE\u5F02" });
    const reset = header.createEl("button", { text: "\u91CD\u7F6E\u793A\u4F8B" });
    reset.addEventListener("click", () => this.reset());
    root.createDiv({
      text: "\u4EC5\u6F14\u793A\u754C\u9762\u548C\u9009\u62E9\u65B9\u5F0F\uFF0C\u4E0D\u4F1A\u4FEE\u6539\u7B14\u8BB0\u6216\u6267\u884C\u540C\u6B65\u3002",
      cls: "simple-sync-preview__notice"
    });
    const toolbar = root.createDiv({ cls: "simple-sync-preview__toolbar" });
    toolbar.createSpan({ text: `\u5F85\u5904\u7406 ${this.pending.size} \u4E2A\u6587\u4EF6`, cls: "simple-sync-preview__count" });
    const bulk = toolbar.createDiv({ cls: "simple-sync-preview__bulk" });
    this.createButton(bulk, "\u5168\u9009\u6700\u65B0", () => this.selectAll("latest"), "simple-sync-preview__bulk-choice");
    this.createButton(bulk, "\u5168\u90E8\u9009\u672C\u673A", () => this.selectAll("local"), "simple-sync-preview__bulk-choice is-local");
    this.createButton(bulk, "\u5168\u90E8\u9009 GitHub", () => this.selectAll("remote"), "simple-sync-preview__bulk-choice is-remote");
    this.createButton(bulk, "\u6E05\u7A7A\u9009\u62E9", () => {
      this.fileChoices.clear();
      this.blockChoices.clear();
      this.render();
    });
    if (this.appliedCount > 0) {
      root.createDiv({ text: `\u793A\u4F8B\u4E2D\u5DF2\u5E94\u7528 ${this.appliedCount} \u4E2A\uFF0C\u5269\u4F59 ${this.pending.size} \u4E2A\u5F85\u5904\u7406\u3002`, cls: "simple-sync-preview__feedback" });
    }
    const list = root.createDiv({ cls: "simple-sync-preview__list" });
    for (const file of SAMPLE_FILES) {
      if (this.pending.has(file.path)) this.renderFile(list, file);
    }
    if (this.pending.size === 0) list.createDiv({ text: "\u793A\u4F8B\u6587\u4EF6\u5DF2\u5168\u90E8\u5904\u7406\u3002\u53EF\u4EE5\u70B9\u201C\u91CD\u7F6E\u793A\u4F8B\u201D\u91CD\u65B0\u67E5\u770B\u3002", cls: "simple-sync-preview__empty" });
    const ready = this.getReadyFiles();
    const footer = root.createDiv({ cls: "simple-sync-preview__footer" });
    footer.createSpan({ text: `\u5DF2\u9009\u597D ${ready.length} \u4E2A \xB7 \u5F85\u5904\u7406 ${this.pending.size} \u4E2A` });
    const apply = footer.createEl("button", { text: `\u5E94\u7528\u9009\u62E9${ready.length > 0 ? ` (${ready.length})` : ""}`, cls: "mod-cta" });
    apply.disabled = ready.length === 0;
    apply.addEventListener("click", () => this.applyReadyFiles());
    root.scrollTop = scrollTop;
  }
  renderFile(list, file) {
    const expanded = this.expandedPath === file.path;
    const row = list.createDiv({ cls: "simple-sync-preview__file" });
    row.toggleClass("is-expanded", expanded);
    const summary = row.createDiv({ cls: "simple-sync-preview__summary" });
    const toggle = summary.createEl("button", { cls: "simple-sync-preview__toggle" });
    toggle.setAttr("aria-expanded", String(expanded));
    toggle.setAttr("aria-label", `${expanded ? "\u6536\u8D77" : "\u5C55\u5F00"}${file.path}`);
    (0, import_obsidian.setIcon)(toggle.createSpan({ cls: "simple-sync-preview__chevron" }), "chevron-right");
    const name = toggle.createSpan({ cls: "simple-sync-preview__name" });
    name.createSpan({ text: file.path, cls: "simple-sync-preview__path" });
    name.createSpan({ text: `${file.blocks.length} \u5904\u5DEE\u5F02`, cls: "simple-sync-preview__meta" });
    const toggleFile = () => {
      this.expandedPath = expanded ? void 0 : file.path;
      this.render();
    };
    summary.addEventListener("click", (event) => {
      if (event.target instanceof Element && event.target.closest(".simple-sync-preview__choice-control")) return;
      toggleFile();
    });
    const times = summary.createEl("button", { cls: "simple-sync-preview__times" });
    times.setAttr("aria-expanded", String(expanded));
    times.setAttr("aria-label", `${expanded ? "\u6536\u8D77" : "\u5C55\u5F00"}${file.path}\uFF0C\u672C\u673A\u4E0E GitHub \u66F4\u65B0\u65F6\u95F4`);
    for (const [side, text, value] of [["local", "\u672C\u673A", file.localUpdatedAt], ["remote", "GitHub", file.remoteUpdatedAt]]) {
      const line = times.createSpan({ cls: "simple-sync-preview__time" });
      line.toggleClass("is-newer", this.latestSide(file) === side);
      line.createSpan({ text: `${text}\u66F4\u65B0` });
      const time = line.createEl("time", { text: this.formatTime(value) });
      time.setAttr("datetime", value);
    }
    const selected = this.fileChoices.get(file.path);
    const control = summary.createDiv({ cls: "simple-sync-preview__choice-control" });
    const selection = control.createEl("button", { text: this.fileStatus(file), cls: "simple-sync-preview__selection" });
    (0, import_obsidian.setIcon)(selection.createSpan({ cls: "simple-sync-preview__selection-icon" }), "chevron-down");
    const tone = this.selectionTone(file);
    if (tone) selection.addClass(`is-${tone}`);
    selection.setAttr("aria-label", `${file.path}\u5F53\u524D${this.fileStatus(file)}\uFF0C\u70B9\u51FB\u9009\u62E9\u6700\u65B0\u3001\u672C\u673A\u6216 GitHub`);
    const segments = control.createDiv({ cls: "simple-sync-preview__segments" });
    for (const [choice, label] of [["latest", "\u6700\u65B0"], ["local", "\u672C\u673A"], ["remote", "GitHub"]]) {
      const option = segments.createEl("button", { text: label, cls: `simple-sync-preview__segment is-${choice === "latest" ? this.latestSide(file) : choice}` });
      option.toggleClass("is-selected", selected === choice);
      option.setAttr("aria-label", `${file.path}\u9009\u62E9${label}`);
      option.setAttr("aria-pressed", String(selected === choice));
      option.addEventListener("click", () => this.selectFile(file, choice));
    }
    selection.addEventListener("click", () => {
      segments.querySelector("button")?.focus();
    });
    if (expanded) this.renderBlocks(row, file);
  }
  renderBlocks(row, file) {
    const details = row.createDiv({ cls: "simple-sync-preview__details" });
    details.toggleClass("is-mixed", this.selectionTone(file) === "mixed");
    const headings = details.createDiv({ cls: "simple-sync-preview__block-headers" });
    headings.createSpan({ text: "\u5DEE\u5F02", cls: "simple-sync-preview__block-heading" });
    headings.createSpan({ text: "\u672C\u673A\u533A\u5757", cls: "simple-sync-preview__block-heading" });
    headings.createSpan({ text: "Git \u533A\u5757", cls: "simple-sync-preview__block-heading" });
    file.blocks.forEach((block, index) => {
      const key = this.blockKey(file.path, index);
      const wholeChoice = this.fileChoices.get(file.path);
      const selection = this.blockChoices.get(key) ?? (wholeChoice ? { method: wholeChoice === "latest" ? this.latestSide(file) : wholeChoice } : void 0);
      const blockRow = details.createDiv({ cls: "simple-sync-preview__block" });
      const title = blockRow.createDiv({ cls: "simple-sync-preview__block-title" });
      const caption = title.createDiv({ cls: "simple-sync-preview__block-caption" });
      caption.createSpan({ text: `\u5DEE\u5F02 ${index + 1} / ${file.blocks.length}` });
      caption.createSpan({ text: `\u7EA6\u7B2C ${block.line} \u884C`, cls: "simple-sync-preview__line" });
      const merge = this.createButton(title, selection?.method === "merged" ? "\u53D6\u6D88\u5408\u5E76" : "\u5408\u5E76", () => this.toggleMerge(file, index), "simple-sync-preview__merge");
      merge.toggleClass("is-selected", selection?.method === "merged");
      merge.setAttr("aria-pressed", String(selection?.method === "merged"));
      if (selection?.method === "merged") {
        const result = blockRow.createDiv({ cls: "simple-sync-preview__result" });
        result.createDiv({ text: "\u5408\u5E76\u7ED3\u679C \xB7 \u53EF\u76F4\u63A5\u7F16\u8F91", cls: "simple-sync-preview__result-label" });
        const editor = result.createEl("textarea", { cls: "simple-sync-preview__editor" });
        editor.rows = Math.min(8, Math.max(4, (selection.text ?? "").split("\n").length + 1));
        editor.value = selection.text ?? "";
        editor.setAttr("aria-label", `${file.path}\u7B2C ${index + 1} \u5904\u6700\u7EC8\u5185\u5BB9`);
        editor.addEventListener("input", () => {
          selection.text = editor.value;
        });
      } else {
        this.renderSide(blockRow, "\u672C\u673A", block.local, "local", selection?.method === "local", () => this.selectBlock(file, index, "local"));
        this.renderSide(blockRow, "Git", block.remote, "remote", selection?.method === "remote", () => this.selectBlock(file, index, "remote"));
      }
    });
  }
  renderSide(parent, label, content, side, selected, choose) {
    const panel = parent.createEl("button", { cls: `simple-sync-preview__side is-${side}` });
    panel.toggleClass("is-selected", selected);
    panel.setAttr("aria-label", `\u91C7\u7528${label}\u533A\u5757`);
    panel.setAttr("aria-pressed", String(selected));
    panel.createSpan({ text: content, cls: "simple-sync-preview__side-content" });
    panel.addEventListener("click", choose);
  }
  createButton(parent, label, action, className) {
    const button = parent.createEl("button", { text: label, cls: className });
    button.addEventListener("click", action);
    return button;
  }
  blockKey(path, index) {
    return `${path}:${index}`;
  }
  latestSide(file) {
    return Date.parse(file.localUpdatedAt) >= Date.parse(file.remoteUpdatedAt) ? "local" : "remote";
  }
  selectionTone(file) {
    const whole = this.fileChoices.get(file.path);
    if (whole) return whole === "latest" ? this.latestSide(file) : whole;
    const methods = file.blocks.map((_, index) => this.blockChoices.get(this.blockKey(file.path, index))?.method);
    if (methods.some((method) => !method)) return void 0;
    return methods.every((method) => method === "local") ? "local" : methods.every((method) => method === "remote") ? "remote" : "mixed";
  }
  formatTime(value) {
    return new Date(value).toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
  }
  fileStatus(file) {
    const whole = this.fileChoices.get(file.path);
    if (whole) return whole === "latest" ? `\u6700\u65B0 \xB7 ${this.latestSide(file) === "local" ? "\u672C\u673A" : "GitHub"}` : whole === "local" ? "\u672C\u673A" : "GitHub";
    const chosen = file.blocks.filter((_, index) => this.blockChoices.has(this.blockKey(file.path, index))).length;
    return chosen === 0 ? "\u672A\u51B3\u5B9A" : chosen === file.blocks.length ? "\u533A\u5757\u5DF2\u9009\u597D" : `\u5DF2\u51B3\u5B9A ${chosen}/${file.blocks.length} \u5904`;
  }
  selectFile(file, choice) {
    this.fileChoices.set(file.path, choice);
    for (let index = 0; index < file.blocks.length; index += 1) this.blockChoices.delete(this.blockKey(file.path, index));
    this.render();
  }
  selectAll(choice) {
    for (const file of SAMPLE_FILES) {
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
      const side = wholeChoice === "latest" ? this.latestSide(file) : wholeChoice;
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
  getReadyFiles() {
    return SAMPLE_FILES.filter((file) => this.pending.has(file.path) && (this.fileChoices.has(file.path) || file.blocks.every((_, index) => this.blockChoices.has(this.blockKey(file.path, index)))));
  }
  applyReadyFiles() {
    const ready = this.getReadyFiles();
    for (const file of ready) {
      this.pending.delete(file.path);
      this.fileChoices.delete(file.path);
      for (let index = 0; index < file.blocks.length; index += 1) this.blockChoices.delete(this.blockKey(file.path, index));
    }
    this.appliedCount += ready.length;
    if (this.expandedPath && !this.pending.has(this.expandedPath)) this.expandedPath = void 0;
    this.render(false);
  }
  reset() {
    this.pending = new Set(SAMPLE_FILES.map((file) => file.path));
    this.expandedPath = void 0;
    this.fileChoices.clear();
    this.blockChoices.clear();
    this.appliedCount = 0;
    this.render(false);
  }
};

// src/onboarding.ts
var import_obsidian2 = require("obsidian");
var nodeRequire = globalThis.require;
var nodeFs = nodeRequire ? nodeRequire("fs").promises : null;
var nodeFsStream = nodeRequire ? nodeRequire("fs") : null;
var nodePath = nodeRequire ? nodeRequire("path") : null;
var nodeCrypto = nodeRequire ? nodeRequire("crypto") : null;
var SETUP_GITIGNORE = [
  "# Obsidian local state",
  ".obsidian/cache/",
  ".obsidian/workspace.json",
  ".obsidian/workspace-mobile.json",
  ".obsidian/workspaces/",
  ".obsidian/trash/",
  ".trash/",
  "# Local credentials and agent output",
  ".obsidian/plugins/simple-sync/data.json",
  ".obsidian/plugins/obsidian-git/data.json",
  ".obsidian/plugins/recent-files-obsidian/data.json",
  ".codex/output/",
  ".codex/AGENTS.md",
  ".claudian/sessions/",
  ".smart-env/",
  "conflict-files-obsidian-git.md",
  "# OS and temporary files",
  ".DS_Store",
  "Thumbs.db",
  "desktop.ini",
  "*.tmp",
  "*.bak",
  "node_modules/"
];
function missingSetupIgnoreRules(existing) {
  const patterns = new Set(existing.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#")));
  return SETUP_GITIGNORE.filter((line) => !line.startsWith("#") && !patterns.has(line) && !(line.endsWith("/") && patterns.has(line.slice(0, -1))));
}
function parseGithubRepoUrl(input) {
  const trimmed = input.trim();
  const match = /^https:\/\/github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?$/i.exec(trimmed);
  if (!match || match[2] === "." || match[2] === "..") {
    throw new Error("\u8BF7\u8F93\u5165 GitHub \u4ED3\u5E93\u7684 HTTPS \u5730\u5740\uFF0C\u4F8B\u5982 https://github.com/\u7528\u6237\u540D/\u4ED3\u5E93\u540D.git");
  }
  return { url: `https://github.com/${match[1]}/${match[2]}.git`, owner: match[1], name: match[2] };
}
function validateGithubRepositoryName(name) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("\u8BF7\u8F93\u5165 GitHub \u4ED3\u5E93\u540D\u3002");
  if (name !== trimmed || trimmed.length > 100 || !/^[A-Za-z0-9._-]+$/.test(trimmed)) {
    throw new Error("\u4ED3\u5E93\u540D\u6700\u591A 100 \u4E2A\u5B57\u7B26\uFF0C\u53EA\u80FD\u5305\u542B\u82F1\u6587\u5B57\u6BCD\u3001\u6570\u5B57\u3001\u70B9\u3001\u8FDE\u5B57\u7B26\u548C\u4E0B\u5212\u7EBF\uFF1B\u7A7A\u683C\u4E0E \u2713 \u5747\u4E0D\u5141\u8BB8\u3002");
  }
  return trimmed;
}
function explainSetupError(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (/spawn git\b|git is not recognized/i.test(message)) return "\u6CA1\u6709\u68C0\u6D4B\u5230 Git\u3002\u8BF7\u5148\u5B89\u88C5 Git \u540E\u91CD\u65B0\u68C0\u67E5\uFF1B\u521A\u5B89\u88C5\u65F6\u53EF\u80FD\u9700\u8981\u91CD\u542F Obsidian\u3002";
  if (/spawn gh\b|gh is not recognized/i.test(message)) return "\u6CA1\u6709\u68C0\u6D4B\u5230 GitHub CLI\u3002\u8BF7\u5148\u5B89\u88C5\u540E\u91CD\u8BD5\uFF0C\u6216\u5207\u6362\u5230 Token \u65B9\u6848\u3002";
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
function hasFileAsParent(path, otherFiles) {
  let slash = path.indexOf("/");
  while (slash >= 0) {
    if (otherFiles.has(path.slice(0, slash))) return true;
    slash = path.indexOf("/", slash + 1);
  }
  return false;
}
function pathBatches(paths) {
  const batches = [];
  let current = [];
  let length = 0;
  for (const path of paths) {
    if (current.length && (current.length >= 100 || length + path.length > 12e3)) {
      batches.push(current);
      current = [];
      length = 0;
    }
    current.push(path);
    length += path.length + 1;
  }
  if (current.length) batches.push(current);
  return batches;
}
var GitSetup = class {
  constructor(vaultPath, run, getToken = () => void 0) {
    this.vaultPath = vaultPath;
    this.run = run;
    this.getToken = getToken;
    if (!nodeFs || !nodePath) throw new Error("\u9996\u6B21\u4F7F\u7528\u5F15\u5BFC\u4EC5\u652F\u6301\u684C\u9762\u7AEF");
  }
  async checkGit() {
    return (await this.run("git", ["--version"])).trim();
  }
  async checkTools() {
    await this.checkGit();
    await this.run("gh", ["--version"]);
  }
  async githubApi(path) {
    const token = this.getToken()?.trim();
    if (!token) return JSON.parse(await this.run("gh", ["api", path]));
    const response = await (0, import_obsidian2.requestUrl)({
      url: `https://api.github.com/${path}`,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28"
      },
      throw: false
    });
    if (response.status < 200 || response.status >= 300) {
      const detail = typeof response.json?.message === "string" ? `\uFF1A${response.json.message}` : "";
      if (response.status === 401) throw new Error(`Token \u65E0\u6548\u6216\u5DF2\u8FC7\u671F${detail}`);
      if (response.status === 403) throw new Error(`Token \u6743\u9650\u4E0D\u8DB3\uFF0C\u6216 GitHub \u6682\u65F6\u9650\u5236\u4E86\u8BF7\u6C42${detail}`);
      if (response.status === 404) throw new Error("\u65E0\u6CD5\u8BBF\u95EE\u8BE5\u4ED3\u5E93\uFF1A\u8BF7\u68C0\u67E5\u5730\u5740\u3001Token \u7684\u4ED3\u5E93\u8303\u56F4\u548C\u6743\u9650\u3002");
      throw new Error(`GitHub API \u8BF7\u6C42\u5931\u8D25\uFF08HTTP ${response.status}\uFF09${detail}`);
    }
    return response.json;
  }
  async login(onCode, onCancelReady) {
    await this.checkTools();
    let output = "";
    let lastCode = "";
    await this.run("gh", ["auth", "login", "--hostname", "github.com", "--git-protocol", "https", "--web", "--clipboard"], 12e5, (chunk) => {
      output += chunk;
      const code = output.match(/\b[A-Z0-9]{4}-[A-Z0-9]{4}\b/)?.[0];
      if (code && code !== lastCode) {
        lastCode = code;
        onCode?.(code);
      }
    }, onCancelReady);
    await this.checkLogin();
    await this.run("gh", ["auth", "setup-git", "--hostname", "github.com"]);
  }
  async checkLogin() {
    await this.run("gh", ["auth", "status", "--active", "--hostname", "github.com"]);
  }
  async validateToken(token) {
    const response = await (0, import_obsidian2.requestUrl)({
      url: "https://api.github.com/user",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28"
      },
      throw: false
    });
    if (response.status === 401) throw new Error("Token \u65E0\u6548\u6216\u5DF2\u8FC7\u671F\u3002\u8BF7\u5728 GitHub \u91CD\u65B0\u521B\u5EFA Token\uFF0C\u518D\u7C98\u8D34\u5E76\u786E\u8BA4\u3002");
    if (response.status === 403) throw new Error("GitHub \u6682\u65F6\u62D2\u7EDD\u4E86 Token \u9A8C\u8BC1\u8BF7\u6C42\u3002\u8BF7\u7A0D\u540E\u91CD\u8BD5\uFF1B\u5982\u679C\u6301\u7EED\u5931\u8D25\uFF0C\u8BF7\u91CD\u65B0\u521B\u5EFA Token\u3002");
    if (response.status < 200 || response.status >= 300) throw new Error(`Token \u9A8C\u8BC1\u5931\u8D25\uFF08HTTP ${response.status}\uFF09\u3002\u8BF7\u68C0\u67E5 Token \u540E\u91CD\u8BD5\u3002`);
    const login = response.json?.login;
    if (typeof login !== "string" || !login) throw new Error("GitHub \u672A\u8FD4\u56DE Token \u6240\u5C5E\u8D26\u53F7\uFF0C\u8BF7\u91CD\u65B0\u521B\u5EFA\u5E76\u7C98\u8D34 Token\u3002");
    return login;
  }
  async createPrivateRepository(name) {
    const repositoryName = validateGithubRepositoryName(name);
    const token = this.getToken()?.trim();
    if (token) {
      const response = await (0, import_obsidian2.requestUrl)({
        url: "https://api.github.com/user/repos",
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ name: repositoryName, private: true, auto_init: false }),
        throw: false
      });
      if (response.status === 401) throw new Error("Token \u65E0\u6548\u6216\u5DF2\u8FC7\u671F\u3002\u8BF7\u91CD\u65B0\u7C98\u8D34 Token \u540E\u91CD\u8BD5\u3002");
      if (response.status === 403) throw new Error("\u5F53\u524D Token \u65E0\u6743\u521B\u5EFA\u4ED3\u5E93\u3002fine-grained Token \u9700\u8981 Administration \u4ED3\u5E93\u6743\u9650\uFF08write\uFF09\uFF1B\u4E5F\u53EF\u4EE5\u5148\u5728 GitHub \u521B\u5EFA\u4ED3\u5E93\uFF0C\u518D\u9009\u62E9\u201C\u4F7F\u7528\u5DF2\u6709\u4ED3\u5E93\u201D\u3002");
      if (response.status < 200 || response.status >= 300) {
        const detail = typeof response.json?.message === "string" ? `\uFF1A${response.json.message}` : "";
        throw new Error(`\u521B\u5EFA\u79C1\u4EBA\u4ED3\u5E93\u5931\u8D25\uFF08HTTP ${response.status}\uFF09${detail}`);
      }
      const url = response.json?.clone_url;
      if (typeof url !== "string" || !url) throw new Error("\u4ED3\u5E93\u5DF2\u521B\u5EFA\uFF0C\u4F46 GitHub \u672A\u8FD4\u56DE HTTPS \u5730\u5740\u3002\u8BF7\u6539\u7528\u201C\u4F7F\u7528\u5DF2\u6709\u4ED3\u5E93\u201D\u5E76\u586B\u5199\u4ED3\u5E93\u5730\u5740\u3002");
      return url;
    }
    await this.checkLogin();
    const user = await this.githubApi("user");
    await this.run("gh", ["repo", "create", repositoryName, "--private"]);
    return `https://github.com/${user.login}/${repositoryName}.git`;
  }
  async configureGitCredentials() {
    await this.checkLogin();
    await this.run("gh", ["auth", "setup-git", "--hostname", "github.com"]);
  }
  async verifyRepository(input) {
    const parsed = parseGithubRepoUrl(input);
    const token = this.getToken()?.trim();
    let data;
    if (token) {
      data = await this.githubApi(`repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.name)}`);
    } else {
      await this.checkLogin();
      const raw = await this.run("gh", ["repo", "view", `${parsed.owner}/${parsed.name}`, "--json", "isPrivate,viewerPermission,defaultBranchRef"]);
      data = JSON.parse(raw);
    }
    if ((data.private ?? data.isPrivate) !== true) throw new Error("\u8BE5\u4ED3\u5E93\u4E0D\u662F\u79C1\u4EBA\u4ED3\u5E93\u3002\u8BF7\u5728 GitHub \u4ED3\u5E93\u8BBE\u7F6E\u4E2D\u6539\u4E3A Private \u540E\u91CD\u8BD5\u3002");
    const canWrite = data.permissions?.admin || data.permissions?.maintain || data.permissions?.push || (/* @__PURE__ */ new Set(["ADMIN", "MAINTAIN", "WRITE"])).has(data.viewerPermission ?? "");
    if (!canWrite) {
      throw new Error("\u5F53\u524D GitHub \u8D26\u53F7\u6CA1\u6709\u6B64\u4ED3\u5E93\u7684\u5199\u5165\u6743\u9650\u3002");
    }
    const branch = data.default_branch || data.defaultBranchRef?.name || "main";
    const branchData = data.default_branch || data.defaultBranchRef?.name ? await this.githubApi(`repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.name)}/branches/${encodeURIComponent(branch)}`) : void 0;
    const remoteSha = branchData?.commit?.sha ?? "";
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
  async localFiles(root) {
    if (root) {
      const output = await this.run("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"]);
      const files = [];
      for (const name of new Set(output.split("\0").filter(Boolean))) {
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
    const patterns = [...DEFAULT_SYNC_IGNORE_PATTERNS, ...existingIgnore];
    const found = [];
    const visit = async (folder) => {
      for (const item of await nodeFs.readdir(folder, { withFileTypes: true })) {
        const absolute = nodePath.join(folder, item.name);
        const name = nodePath.relative(this.vaultPath, absolute).replace(/\\/g, "/");
        if (item.name === ".git") {
          if (folder !== this.vaultPath) throw new Error(`Vault \u5185\u5305\u542B\u53E6\u4E00\u4E2A Git \u4ED3\u5E93\uFF1A${nodePath.relative(this.vaultPath, folder)}\u3002\u8BF7\u5148\u5355\u72EC\u5904\u7406\u3002`);
          continue;
        }
        if (shouldIgnore(name, patterns)) continue;
        if (item.isDirectory()) await visit(absolute);
        else if (item.isFile()) found.push(name);
      }
    };
    await visit(this.vaultPath);
    return found.sort();
  }
  async assertNoNestedGit(folder) {
    for (const item of await nodeFs.readdir(folder, { withFileTypes: true })) {
      const absolute = nodePath.join(folder, item.name);
      const name = nodePath.relative(this.vaultPath, absolute).replace(/\\/g, "/");
      if (item.name === ".git") {
        if (folder !== this.vaultPath) throw new Error(`Vault \u5185\u5305\u542B\u53E6\u4E00\u4E2A Git \u4ED3\u5E93\uFF1A${nodePath.relative(this.vaultPath, folder)}\u3002\u8BF7\u5148\u5355\u72EC\u5904\u7406\u3002`);
        continue;
      }
      if (item.isDirectory() && !shouldIgnore(name, DEFAULT_SYNC_IGNORE_PATTERNS)) await this.assertNoNestedGit(absolute);
    }
  }
  async preview(repo) {
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
    const localFiles = await this.localFiles(localRoot);
    const trackedLocal = localRoot ? (await this.run("git", ["ls-files", "--cached", "-z"])).split("\0").filter(Boolean) : [];
    const trackedIgnoredLocal = localRoot ? (await this.run("git", ["ls-files", "--cached", "--ignored", "--exclude-standard", "-z"])).split("\0").filter(Boolean) : [];
    if (localRoot) await this.assertNoNestedGit(this.vaultPath);
    const localSignatures = {};
    const localGitBlobs = {};
    for (const file of localFiles) {
      const stat = await nodeFs.stat(nodePath.join(this.vaultPath, file));
      const hash = nodeCrypto.createHash("sha256");
      const gitHash = nodeCrypto.createHash("sha1").update(`blob ${stat.size}\0`);
      for await (const chunk of nodeFsStream.createReadStream(nodePath.join(this.vaultPath, file))) {
        hash.update(chunk);
        gitHash.update(chunk);
      }
      localSignatures[file] = `${stat.size}:${hash.digest("hex")}`;
      localGitBlobs[file] = gitHash.digest("hex");
    }
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
          await this.run("git", ["fetch", "--no-tags", "--no-write-fetch-head", repo.url, repo.branch]);
          await this.run("git", ["cat-file", "-e", `${repo.remoteSha}^{commit}`]);
        }
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
      if (trackedLocal.includes(".obsidian/plugins/simple-sync/data.json")) {
        throw new Error("\u672C\u5730 Git \u6B63\u5728\u8DDF\u8E2A\u63D2\u4EF6\u7684\u672C\u673A\u51ED\u636E\u6587\u4EF6 data.json\u3002\u8BF7\u5148\u505C\u6B62\u8DDF\u8E2A\u8BE5\u6587\u4EF6\uFF0C\u518D\u7EE7\u7EED\u63A5\u5165\u3002");
      }
      const staged = await this.run("git", ["ls-files", "--stage", "-z"]);
      if (staged.split("\0").some((line) => line.startsWith("160000 "))) {
        throw new Error("\u672C\u5730 Git \u5305\u542B\u5B50\u6A21\u5757\uFF0C\u5411\u5BFC\u6682\u4E0D\u652F\u6301\u81EA\u52A8\u63A5\u5165\u3002");
      }
    }
    let remoteFiles = [];
    const remoteBlobs = {};
    if (repo.remoteSha) {
      const tree = await this.githubApi(`repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/git/trees/${repo.remoteSha}?recursive=1`);
      if (tree.truncated) throw new Error("\u8FDC\u7AEF\u6587\u4EF6\u5217\u8868\u8FC7\u5927\uFF0CGitHub \u53EA\u8FD4\u56DE\u4E86\u90E8\u5206\u6587\u4EF6\uFF1B\u5411\u5BFC\u5DF2\u505C\u6B62\uFF0C\u8BF7\u5148\u7F29\u5C0F\u4ED3\u5E93\u6216\u624B\u52A8\u63A5\u5165\u3002");
      if (tree.tree?.some((item) => item.type === "commit")) throw new Error("\u8FDC\u7AEF\u4ED3\u5E93\u5305\u542B Git \u5B50\u6A21\u5757\uFF0C\u5411\u5BFC\u6682\u4E0D\u652F\u6301\u81EA\u52A8\u63A5\u5165\u3002");
      remoteFiles = (tree.tree ?? []).filter((item) => item.type === "blob").map((item) => {
        remoteBlobs[item.path] = { sha: item.sha ?? "", size: item.size ?? 0 };
        return item.path;
      }).sort();
      if (remoteFiles.includes(".obsidian/plugins/simple-sync/data.json")) {
        throw new Error("\u8FDC\u7AEF\u6B63\u5728\u8DDF\u8E2A\u63D2\u4EF6\u7684\u672C\u673A\u51ED\u636E\u6587\u4EF6 data.json\u3002\u8BF7\u5148\u4ECE\u8FDC\u7AEF\u5386\u53F2\u4E2D\u5904\u7406\u5B83\uFF0C\u518D\u7EE7\u7EED\u63A5\u5165\u3002");
      }
    }
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
    const overlaps = relatedHistory ? [] : localFiles.filter((name) => remoteSet.has(name) && (remoteBlobs[name]?.sha.length !== 40 || localGitBlobs[name] !== remoteBlobs[name].sha));
    const prefixCollision = localFiles.some((name) => hasFileAsParent(name, remoteSet)) || remoteFiles.some((name) => hasFileAsParent(name, localSet));
    if (prefixCollision) throw new Error("\u4E24\u7AEF\u5B58\u5728\u540C\u540D\u6587\u4EF6\u4E0E\u76EE\u5F55\u51B2\u7A81\uFF0C\u9700\u8981\u5148\u624B\u52A8\u6574\u7406\u540E\u518D\u63A5\u5165\u3002");
    const existingIgnore = await this.readIgnore();
    const effectiveIgnore = [...existingIgnore.split(/\r?\n/), ...SETUP_GITIGNORE];
    return {
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
      missingIgnoreRules: missingSetupIgnoreRules(existingIgnore),
      trackedExcludedLocal: [.../* @__PURE__ */ new Set([...trackedIgnoredLocal, ...trackedLocal.filter((name) => shouldIgnore(name, SETUP_GITIGNORE))])].sort(),
      trackedExcludedRemote: remoteFiles.filter((name) => shouldIgnore(name, effectiveIgnore))
    };
  }
  async readOverlap(repo, preview, file) {
    if (!preview.overlaps.includes(file)) throw new Error("\u8BE5\u6587\u4EF6\u4E0D\u5728\u540C\u540D\u6587\u4EF6\u5217\u8868\u4E2D\uFF0C\u8BF7\u91CD\u65B0\u68C0\u67E5\u7B2C 5 \u6B65\u3002");
    const absolute = nodePath.resolve(this.vaultPath, file);
    const vault = nodePath.resolve(this.vaultPath);
    if (!absolute.toLowerCase().startsWith(`${vault}${nodePath.sep}`.toLowerCase())) throw new Error("\u6587\u4EF6\u8DEF\u5F84\u8D85\u51FA Vault");
    const localStat = await nodeFs.stat(absolute);
    const local = localStat.size > 1e5 ? `\u6587\u4EF6\u8F83\u5927\uFF08${localStat.size} \u5B57\u8282\uFF09\uFF0C\u8BF7\u5728 Obsidian \u4E2D\u6253\u5F00\u672C\u673A\u6587\u4EF6\u67E5\u770B\u3002` : this.describeContent(await nodeFs.readFile(absolute));
    const blob = preview.remoteBlobs[file];
    if (!blob?.sha) throw new Error("\u7F3A\u5C11\u8FDC\u7AEF\u6587\u4EF6\u4FE1\u606F\uFF0C\u8BF7\u91CD\u65B0\u68C0\u67E5\u7B2C 5 \u6B65\u3002");
    if (blob.size > 1e5) return { path: file, local, remote: `\u8FDC\u7AEF\u6587\u4EF6\u8F83\u5927\uFF08${blob.size} \u5B57\u8282\uFF09\uFF0C\u8BF7\u5728 GitHub \u4ED3\u5E93\u7F51\u9875\u67E5\u770B\u3002` };
    const data = await this.githubApi(`repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/git/blobs/${blob.sha}`);
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
  async appendIgnore() {
    const file = nodePath.join(this.vaultPath, ".gitignore");
    const existing = await this.readIgnore();
    const missing = missingSetupIgnoreRules(existing);
    if (!missing.length) return;
    const eol = existing.includes("\r\n") ? "\r\n" : "\n";
    const separator = existing ? `${existing.endsWith("\n") ? "" : eol}${eol}` : "";
    await nodeFs.writeFile(file, `${existing}${separator}# Simple Sync recommended local exclusions${eol}${missing.join(eol)}${eol}`, "utf8");
  }
  async rebuildTrackingIndex(paths, skipped) {
    for (const path of paths) {
      try {
        await this.run("git", ["check-ignore", "--no-index", "-q", "--", path]);
      } catch {
        throw new Error(`\u4E0D\u80FD\u786E\u8BA4 .gitignore \u4F1A\u6392\u9664 ${path}\uFF0C\u5DF2\u505C\u6B62\u91CD\u5EFA Git \u8FFD\u8E2A\u3002\u8BF7\u68C0\u67E5\u6392\u9664\u89C4\u5219\u540E\u91CD\u65B0\u9884\u89C8\u3002`);
      }
    }
    await this.run("git", ["rm", "-r", "-f", "--cached", "--ignore-unmatch", "--", "."]);
    await this.run("git", ["add", "-A"]);
    if (skipped.size) {
      const staged = new Set((await this.run("git", ["diff", "--cached", "--name-only", "-z"])).split("\0").filter(Boolean));
      for (const batch of pathBatches([...skipped].filter((path) => staged.has(path)))) {
        await this.run("git", ["reset", "-q", "HEAD", "--", ...batch]);
      }
    }
    const remaining = (await this.run("git", ["ls-files", "-ci", "--exclude-standard", "-z"])).split("\0").filter(Boolean);
    if (remaining.length) throw new Error(`\u91CD\u5EFA\u540E\u4ECD\u6709 ${remaining.length} \u4E2A\u88AB\u5FFD\u7565\u7684\u6587\u4EF6\u53D7\u5230\u8FFD\u8E2A\uFF0C\u8BF7\u68C0\u67E5 .gitignore \u540E\u91CD\u8BD5\u3002`);
  }
  async finish(repo, prior, choices, author, onMutationStart, activelyChangingPaths = /* @__PURE__ */ new Set(), rebuildTracking = false) {
    const verified = await this.verifyRepository(repo.url);
    const latest = await this.preview(verified);
    if (verified.branch !== prior.branch || latest.alreadyLinked !== prior.alreadyLinked || latest.relatedHistory !== prior.relatedHistory || JSON.stringify(latest.remoteFiles) !== JSON.stringify(prior.remoteFiles) || latest.remoteSha !== prior.remoteSha || latest.origin !== prior.origin || latest.localBranch !== prior.localBranch) {
      throw new Error("\u8FDC\u7AEF\u6216\u4ED3\u5E93\u72B6\u6001\u5728\u9884\u89C8\u540E\u53D1\u751F\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u68C0\u67E5\u7B2C 5 \u6B65\u3002");
    }
    if (JSON.stringify(latest.trackedExcludedLocal) !== JSON.stringify(prior.trackedExcludedLocal) || JSON.stringify(latest.trackedExcludedRemote) !== JSON.stringify(prior.trackedExcludedRemote)) {
      throw new Error("\u5DF2\u88AB Git \u8DDF\u8E2A\u7684\u5FFD\u7565\u6587\u4EF6\u5728\u9884\u89C8\u540E\u53D1\u751F\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u68C0\u67E5\u7B2C 5 \u6B65\u3002");
    }
    const changedSincePreview = new Set([.../* @__PURE__ */ new Set([...prior.localFiles, ...latest.localFiles])].filter((file) => prior.localSignatures[file] !== latest.localSignatures[file]));
    if (changedSincePreview.has(".gitignore") || JSON.stringify(latest.missingIgnoreRules) !== JSON.stringify(prior.missingIgnoreRules)) {
      throw new Error(".gitignore \u5728\u9884\u89C8\u540E\u53D1\u751F\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u68C0\u67E5\u7B2C 5 \u6B65\u7684\u5F85\u8865\u89C4\u5219\u3002");
    }
    const active = /* @__PURE__ */ new Set([...changedSincePreview, ...activelyChangingPaths]);
    const pluginDirs = new Set([...active].map((file) => /^\.obsidian\/plugins\/[^/]+\//.exec(file)?.[0]).filter((dir) => !!dir));
    const changedOutsidePlugins = [...changedSincePreview].filter((file) => ![...pluginDirs].some((dir) => file.startsWith(dir)));
    if (!latest.alreadyLinked && changedOutsidePlugins.length > 0) {
      throw new Error("\u9996\u6B21\u5408\u5E76\u524D\u672C\u5730\u6587\u4EF6\u5728\u9884\u89C8\u540E\u53D1\u751F\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u68C0\u67E5\u7B2C 5 \u6B65\u3002");
    }
    const skipped = new Set(changedSincePreview);
    const changes = latest.localRoot ? parseGitStatus(await this.run("git", ["status", "--porcelain=v1", "--untracked-files=all", "-z"])) : [];
    const dirtyPaths = new Set(changes.flatMap((change) => [change.path, change.oldPath].filter((file) => !!file)));
    for (const file of latest.localFiles) {
      if ((!latest.localRoot || dirtyPaths.has(file)) && (active.has(file) || [...pluginDirs].some((dir) => file.startsWith(dir)))) skipped.add(file);
    }
    if (!latest.relatedHistory && latest.overlaps.some((file) => skipped.has(file))) {
      throw new Error("\u6B63\u5728\u7F16\u8F91\u7684\u63D2\u4EF6\u4E0E\u8FDC\u7AEF\u5B58\u5728\u540C\u540D\u6587\u4EF6\u3002\u8BF7\u6682\u505C\u7F16\u8F91\u5E76\u91CD\u65B0\u68C0\u67E5\u7B2C 5 \u6B65\uFF0C\u907F\u514D\u9996\u6B21\u5408\u5E76\u8986\u76D6\u672C\u673A\u6587\u4EF6\u3002");
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
      if (overlap) throw new Error(`\u8FDC\u7AEF\u4E5F\u4FEE\u6539\u4E86\u6B63\u5728\u7F16\u8F91\u7684\u6587\u4EF6 ${overlap}\u3002\u8BF7\u5148\u6682\u505C\u7F16\u8F91\u5E76\u5904\u7406\u8BE5\u6587\u4EF6\uFF0C\u518D\u91CD\u65B0\u68C0\u67E5\u7B2C 5 \u6B65\u3002`);
    }
    for (const file of latest.overlaps) if (!choices[file]) throw new Error(`\u8BF7\u9009\u62E9\u540C\u540D\u6587\u4EF6\u7684\u4FDD\u7559\u7248\u672C\uFF1A${file}`);
    if (!author.name.trim() || !author.email.trim() || author.name === "default" || author.email === "default@default.com") {
      throw new Error("\u8BF7\u586B\u5199 Git \u63D0\u4EA4\u4F5C\u8005\u540D\u79F0\u548C\u90AE\u7BB1\u3002");
    }
    await onMutationStart?.();
    if (!latest.localRoot) await this.run("git", ["init", "-b", repo.branch]);
    await this.run("git", ["config", "user.name", author.name]);
    await this.run("git", ["config", "user.email", author.email]);
    if (!latest.origin) await this.run("git", ["remote", "add", "origin", repo.url]);
    await this.appendIgnore();
    let hasHead = false;
    try {
      await this.run("git", ["rev-parse", "--verify", "HEAD"]);
      hasHead = true;
    } catch {
    }
    if (hasHead) await this.run("git", ["add", "-A"]);
    else {
      const included = [.../* @__PURE__ */ new Set([...latest.localFiles, ".gitignore"])].filter((file) => !skipped.has(file));
      for (const batch of pathBatches(included)) await this.run("git", ["add", "-A", "--", ...batch]);
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
          for await (const chunk of nodeFsStream.createReadStream(nodePath.join(this.vaultPath, file))) hash.update(chunk);
          if (`${stat.size}:${hash.digest("hex")}` !== latest.localSignatures[file] && file !== ".gitignore") changedDuringStage.push(file);
        } catch {
          if (latest.localSignatures[file]) changedDuringStage.push(file);
        }
      }
      for (const batch of pathBatches(changedDuringStage)) await this.run("git", ["reset", "-q", "HEAD", "--", ...batch]);
      for (const file of changedDuringStage) skipped.add(file);
    }
    if (rebuildTracking && hasHead) await this.rebuildTrackingIndex(latest.trackedExcludedLocal, skipped);
    try {
      await this.run("git", ["diff", "--cached", "--quiet"]);
    } catch {
      await this.run("git", ["commit", "-m", "Simple Sync initial vault snapshot"]);
    }
    if (repo.remoteSha) {
      await this.run("git", ["fetch", "origin", repo.branch]);
      const fetchedSha = await this.run("git", ["rev-parse", "FETCH_HEAD"]);
      if (fetchedSha !== repo.remoteSha) throw new Error("\u8FDC\u7AEF\u5206\u652F\u5728\u68C0\u67E5\u540E\u66F4\u65B0\u4E86\u3002\u5C1A\u672A\u5408\u5E76\u6216\u63A8\u9001\uFF0C\u8BF7\u91CD\u65B0\u9884\u89C8\u3002");
      let containsRemote = false;
      try {
        await this.run("git", ["merge-base", "--is-ancestor", "FETCH_HEAD", "HEAD"]);
        containsRemote = true;
      } catch {
      }
      if (!containsRemote) {
        try {
          await this.run("git", latest.relatedHistory ? ["merge", "--no-commit", "--no-ff", "FETCH_HEAD"] : ["merge", "--allow-unrelated-histories", "--no-commit", "--no-ff", "-s", "ours", "FETCH_HEAD"]);
        } catch (error) {
          try {
            await this.run("git", ["merge", "--abort"]);
          } catch {
          }
          throw new Error(latest.relatedHistory ? `\u540C\u6E90\u4ED3\u5E93\u5408\u5E76\u51FA\u73B0\u51B2\u7A81\uFF1B\u5DF2\u5C1D\u8BD5\u64A4\u9500\u672C\u6B21\u5408\u5E76\u3002\u8BF7\u5148\u5904\u7406\u51B2\u7A81\u540E\u91CD\u65B0\u68C0\u67E5\u7B2C 5 \u6B65\u3002${String(error)}` : String(error));
        }
        try {
          const fromRemote = latest.relatedHistory ? [] : [...latest.remoteOnly, ...latest.overlaps.filter((name) => choices[name] === "remote")];
          for (const batch of pathBatches(fromRemote)) await this.run("git", ["checkout", "FETCH_HEAD", "--", ...batch]);
          await this.appendIgnore();
          await this.run("git", ["add", "-A"]);
          if (skipped.size > 0) {
            const stagedPaths = new Set((await this.run("git", ["diff", "--cached", "--name-only", "-z"])).split("\0").filter(Boolean));
            for (const batch of pathBatches([...skipped].filter((file) => stagedPaths.has(file)))) {
              await this.run("git", ["reset", "-q", "HEAD", "--", ...batch]);
            }
          }
          if (rebuildTracking) await this.rebuildTrackingIndex(
            [.../* @__PURE__ */ new Set([...latest.trackedExcludedLocal, ...latest.trackedExcludedRemote])],
            skipped
          );
          await this.run("git", ["commit", "-m", "Simple Sync connect local and remote notes"]);
        } catch (error) {
          try {
            await this.run("git", ["merge", "--abort"]);
          } catch {
          }
          throw error;
        }
      }
    }
    await this.run("git", ["push", "-u", "origin", `HEAD:${repo.branch}`]);
    return [...skipped].sort();
  }
};

// src/main.ts
var SyncDeferredError = class extends Error {
};
var DEFAULT_GIT_AUTHOR_NAME = "default";
var DEFAULT_GIT_AUTHOR_EMAIL = "default@default.com";
var CHECKBOX_CHECKED_ICON = "simple-sync-square-check-contained";
var LAYOUT_SWITCH_ICON = "simple-sync-layout-panels";
var REFRESH_CHANGES_ICON = "simple-sync-refresh-changes";
(0, import_obsidian3.addIcon)(
  CHECKBOX_CHECKED_ICON,
  '<g fill="none" stroke="currentColor" stroke-width="8.333" stroke-linecap="round" stroke-linejoin="round"><rect x="12.5" y="12.5" width="75" height="75" rx="8.333"/><path d="m29.167 50.417 13.333 13.333 29.167-30"/></g>'
);
(0, import_obsidian3.addIcon)(
  LAYOUT_SWITCH_ICON,
  '<g fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"><rect x="12" y="15" width="76" height="70" rx="8"/><path d="M42 15v70M42 43h46"/></g>'
);
(0, import_obsidian3.addIcon)(
  REFRESH_CHANGES_ICON,
  '<g fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"><path d="M30 16H20a6 6 0 0 0-6 6v10M70 16h10a6 6 0 0 1 6 6v10M30 84H20a6 6 0 0 1-6-6V68M70 84h10a6 6 0 0 0 6-6V68"/><path d="M34 36h32M34 50h22M34 64h32"/></g>'
);
var DEFAULT_SETTINGS = {
  enabled: true,
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
  ignorePatterns: [...DEFAULT_SYNC_IGNORE_PATTERNS],
  mobileAutoSyncMinutes: 10,
  commandPollSeconds: 60,
  gitRemoteUrl: "",
  gitBranch: "master",
  gitAuthorName: DEFAULT_GIT_AUTHOR_NAME,
  gitAuthorEmail: DEFAULT_GIT_AUTHOR_EMAIL,
  gitAuthMode: "gh-cli",
  gitAuthKey: "",
  setupComplete: false,
  setupStep: 1,
  setupGitVersion: "",
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
var PLUGIN_EDIT_GRACE_MS = 30 * 60 * 1e3;
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
var SimpleSyncPlugin = class extends import_obsidian3.Plugin {
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
    this.recentFileChanges = /* @__PURE__ */ new Map();
    this.automaticPushQueued = false;
    this.startupPullScheduled = false;
    this.desktopGitQueue = Promise.resolve();
    this.desktopGitTrace = [];
    this.sharedSettingsWritable = true;
    this.deferredMergePaths = [];
    this.setupChoices = {};
  }
  async onload() {
    await this.loadSettings();
    if (!import_obsidian3.Platform.isMobile) await this.detectDesktopGitDefaults();
    this.statusEl = this.addStatusBarItem();
    this.registerView(SimpleSyncView.type, (leaf) => new SimpleSyncView(leaf, this));
    this.registerView(SimpleSyncConflictView.type, (leaf) => new SimpleSyncConflictView(leaf, this));
    this.addSettingTab(new SimpleSyncSettingTab(this.app, this));
    this.addCommand({ id: "sync-now", name: "\u540C\u6B65\u7B14\u8BB0", callback: () => void this.syncNow(true) });
    this.addCommand({ id: "test-connection", name: "\u6D4B\u8BD5\u540C\u6B65\u8FDE\u63A5", callback: () => void this.testConnection(true) });
    this.addCommand({ id: "open-sync-view", name: "\u6253\u5F00\u540C\u6B65\u9762\u677F", callback: () => void this.openSyncView() });
    this.addCommand({ id: "preview-conflict-ui", name: "\u9884\u89C8\u51B2\u7A81\u754C\u9762", callback: () => void this.openConflictPreview() });
    if (this.settings.enabled) {
      this.activateFeature();
      if (!import_obsidian3.Platform.isMobile) {
        this.app.workspace.onLayoutReady(() => void this.openSyncView());
      }
    } else if (this.statusEl) this.statusEl.style.display = "none";
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
  activateFeature() {
    if (this.featureActive) return;
    this.featureActive = true;
    if (this.statusEl) this.statusEl.style.display = "";
    this.ribbonEl = this.addRibbonIcon("refresh-cw", "\u6253\u5F00 Simple Sync", () => void this.openSyncView());
    this.registerViewRefreshEvents();
    if (import_obsidian3.Platform.isMobile) {
      this.registerMobileEvents();
      this.addFeatureInterval(
        window.setInterval(() => void this.pollCommands(), Math.max(15, this.settings.commandPollSeconds) * 1e3)
      );
      if (this.settings.mobileAutoSyncMinutes > 0) {
        this.addFeatureInterval(
          window.setInterval(
            () => void this.syncNow(false),
            Math.max(1, this.settings.mobileAutoSyncMinutes) * 60 * 1e3
          )
        );
      }
      this.setStatus("\u79FB\u52A8\u7AEF \xB7 \u7B49\u5F85\u540C\u6B65");
      window.setTimeout(() => void this.registerMobile(), 1e3);
    } else {
      this.configureDesktopAutomation();
      this.scheduleStartupPull();
      void this.resumeDesktopDirtyState();
      this.setStatus(this.settings.setupComplete ? "\u684C\u9762\u7AEF \xB7 Git \u6A21\u5F0F" : "\u7B49\u5F85\u9996\u6B21 Git \u914D\u7F6E");
    }
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
    if (this.statusEl) this.statusEl.style.display = "none";
    this.app.workspace.detachLeavesOfType(SimpleSyncView.type);
    this.app.workspace.detachLeavesOfType(SimpleSyncConflictView.type);
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
      if (!this.featureActive || import_obsidian3.Platform.isMobile) return;
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
    if (import_obsidian3.Platform.isMobile || !this.featureActive) return;
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
    delete this.settings.desktopAutoSyncMinutes;
    delete this.settings.autoPushIntervalMinutes;
    this.settings.dirty = Array.isArray(this.settings.dirty) ? this.settings.dirty : [];
    this.settings.inFlight = Array.isArray(this.settings.inFlight) ? this.settings.inFlight : [];
    this.settings.ignorePatterns = Array.isArray(this.settings.ignorePatterns) ? this.settings.ignorePatterns.filter((pattern) => typeof pattern === "string") : [...DEFAULT_SYNC_IGNORE_PATTERNS];
    this.settings.errorLogs = Array.isArray(this.settings.errorLogs) ? this.settings.errorLogs : [];
    this.pruneErrorLogs();
    if (!this.settings.lastPullAt) {
      this.settings.lastPullAt = this.settings.errorLogs.filter((entry) => entry.status === "success" && /Fetch|Pull/.test(entry.context)).reduce((latest, entry) => Math.max(latest, entry.timestamp), 0);
    }
    if (!this.settings.deviceId) this.settings.deviceId = crypto.randomUUID();
    if (!this.settings.deviceName) {
      this.settings.deviceName = import_obsidian3.Platform.isMobile ? "Simple Mobile" : "Simple Desktop";
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
    const path = this.sharedSettingsPath();
    if (!await this.app.vault.adapter.exists(path)) return null;
    try {
      const parsed = JSON.parse(await this.app.vault.adapter.read(path));
      return pickSharedSettings(parsed);
    } catch (error) {
      this.sharedSettingsWritable = false;
      console.error("Simple Sync shared settings", error);
      new import_obsidian3.Notice("Simple Sync\uFF1A\u540C\u6B65\u914D\u7F6E\u6587\u4EF6\u5B58\u5728\u51B2\u7A81\u6216\u683C\u5F0F\u9519\u8BEF\uFF0C\u5DF2\u505C\u6B62\u8986\u76D6\u8BE5\u6587\u4EF6", 1e4);
      return null;
    }
  }
  async saveSharedSettings() {
    const path = this.sharedSettingsPath();
    const content = `${JSON.stringify(pickSharedSettings(this.settings), null, 2)}
`;
    if (await this.app.vault.adapter.exists(path)) {
      const current = await this.app.vault.adapter.read(path);
      if (current === content) return;
    }
    await this.app.vault.adapter.write(path, content);
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
      console.error("Simple Sync error log", saveError);
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
    if (this.statusEl) this.statusEl.setText(`Simple Sync: ${text}`);
  }
  setSyncActivity(text, tone) {
    this.syncActivity = { text, tone };
    this.setStatus(text);
    for (const leaf of this.app.workspace.getLeavesOfType(SimpleSyncView.type)) {
      if (leaf.view instanceof SimpleSyncView) leaf.view.updateActivity(this.syncActivity);
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
    const relevantPaths = paths.filter((path) => !shouldIgnore(path, this.settings.ignorePatterns));
    if (relevantPaths.length === 0) return;
    const now = Date.now();
    this.lastFileChangeAt = now;
    for (const path of relevantPaths) this.recentFileChanges.set(path, now);
    this.scheduleViewRefresh();
    if (!import_obsidian3.Platform.isMobile && this.settings.setupComplete) {
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
        void this.runAutomaticPush();
      }, Math.max(0, idleThreshold - idleFor));
    }
    if (this.firstUnpushedAt === 0) this.firstUnpushedAt = Date.now();
    if (this.maxPushTimer === void 0 && this.settings.maxUnpushedMinutes > 0) {
      const maxThreshold = Math.max(1, this.settings.maxUnpushedMinutes) * 60 * 1e3;
      const pendingFor = Math.max(0, Date.now() - this.firstUnpushedAt);
      this.maxPushTimer = window.setTimeout(() => {
        this.maxPushTimer = void 0;
        void this.runAutomaticPush();
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
    let result = { committed: false, skippedPaths: [] };
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
  async runAutomaticPush() {
    if (this.automaticPushQueued) return;
    this.automaticPushQueued = true;
    try {
      await this.enqueueDesktopGit(async () => {
        return await this.desktopAutomaticPush();
      }, "\u81EA\u52A8 Push");
    } catch {
    } finally {
      this.automaticPushQueued = false;
    }
  }
  enqueueDesktopGit(task, errorContext) {
    if (!this.settings.setupComplete) return Promise.reject(new Error("\u8BF7\u5148\u5B8C\u6210\u9996\u6B21\u4F7F\u7528\u5F15\u5BFC"));
    const trackedTask = async () => {
      if (!this.settings.setupComplete) throw new SyncDeferredError("\u8BF7\u5148\u5B8C\u6210\u9996\u6B21\u4F7F\u7528\u5F15\u5BFC");
      const isFetchTask = !!errorContext && (errorContext.includes("Fetch") || errorContext.includes("Pull"));
      const isPushTask = !!errorContext && (errorContext.includes("Push") || errorContext.includes("\u540C\u6B65"));
      this.desktopGitTrace = isFetchTask || isPushTask ? [
        `\u8FDC\u7AEF\uFF1Aorigin/${this.settings.gitBranch}`,
        `\u51ED\u636E\u8DEF\u5F84\uFF1A${this.settings.gitAuthMode === "token" ? "\u63D2\u4EF6 Token" : "\u7CFB\u7EDF Git \u51ED\u636E\u7BA1\u7406\u5668"}`
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
      console.error("Simple Sync desktop task", error);
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
      for (const path of conflicts) {
        try {
          await this.git(["checkout", "--theirs", "--", path]);
          await this.git(["add", "--", path]);
        } catch (checkoutError) {
          try {
            await this.git(["cat-file", "-e", `:3:${path}`]);
          } catch {
            await this.git(["rm", "-f", "--", path]);
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
        const message = `Simple Sync repair backup ${(/* @__PURE__ */ new Date()).toISOString()}`;
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
  getActivelyChangingPaths() {
    const active = /* @__PURE__ */ new Set();
    const now = Date.now();
    const regularWindow = Math.max(0.5, this.settings.viewRefreshDelaySeconds) * 1e3;
    const pluginWindow = Math.max(PLUGIN_EDIT_GRACE_MS, this.settings.autoCommitIdleMinutes * 120 * 1e3);
    for (const [path, changedAt] of this.recentFileChanges) {
      const holdMs = path.startsWith(".obsidian/plugins/") ? pluginWindow : regularWindow;
      if (now - changedAt < holdMs) active.add(path);
      else this.recentFileChanges.delete(path);
    }
    return active;
  }
  async getSetupActivePaths(localFiles) {
    const active = this.getActivelyChangingPaths();
    const nodeRequire2 = globalThis.require;
    if (!nodeRequire2) return active;
    const fs = nodeRequire2("fs");
    const path = nodeRequire2("path");
    const holdMs = Math.max(PLUGIN_EDIT_GRACE_MS, this.settings.autoCommitIdleMinutes * 120 * 1e3);
    for (const file of localFiles) {
      if (!file.startsWith(".obsidian/plugins/")) continue;
      try {
        const stat = await fs.promises.stat(path.join(this.vaultBasePath(), file));
        if (Date.now() - stat.mtimeMs < holdMs) active.add(file);
      } catch {
      }
    }
    return active;
  }
  async openSyncView(refreshExisting = true) {
    if (!this.settings.enabled) {
      new import_obsidian3.Notice("Simple Sync \u5DF2\u5173\u95ED\uFF0C\u8BF7\u5148\u5728\u8BBE\u7F6E\u4E2D\u542F\u7528");
      return;
    }
    let leaf = this.app.workspace.getLeavesOfType(SimpleSyncView.type)[0] ?? null;
    const existing = !!leaf;
    if (!leaf) {
      leaf = this.app.workspace.getRightLeaf(false);
      if (!leaf) return;
      await leaf.setViewState({ type: SimpleSyncView.type, active: true });
    }
    await this.app.workspace.revealLeaf(leaf);
    if (existing && refreshExisting) await this.refreshSyncView();
  }
  async openConflictPreview() {
    new SimpleSyncConflictPreviewModal(this.app).open();
  }
  async refreshSyncView() {
    const views = this.app.workspace.getLeavesOfType(SimpleSyncView.type).map((leaf) => leaf.view).filter((view) => view instanceof SimpleSyncView);
    await Promise.all(views.map((view) => view.render()));
  }
  async toggleViewLayout() {
    this.settings.viewLayout = this.settings.viewLayout === "list" ? "tree" : "list";
    await this.saveSettings();
    await this.refreshSyncView();
  }
  getChangeViewMode() {
    return this.settings.showVersionViewSwitcher ? this.settings.changeViewMode : "upload";
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
  async getChanges(mode = this.getChangeViewMode()) {
    if (import_obsidian3.Platform.isMobile) {
      return [...this.settings.inFlight, ...this.settings.dirty].map((entry) => ({
        path: entry.path,
        oldPath: entry.fromPath,
        kind: entry.type === "add" ? "added" : entry.type === "delete" ? "deleted" : entry.type === "move" ? "moved" : "modified"
      }));
    }
    if (!this.settings.setupComplete) return [];
    if (mode === "commit") return parseGitStatus(await this.gitRaw(["status", "--porcelain=v1", "-z"]));
    return await this.getPendingUploadChanges();
  }
  async getLatestCommitAt() {
    if (import_obsidian3.Platform.isMobile || !this.settings.setupComplete) return 0;
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
    const untracked = (await this.gitRaw(["ls-files", "--others", "--exclude-standard", "-z"])).split("\0").filter(Boolean).filter((path) => !knownPaths.has(path)).map((path) => ({ path, kind: "added" }));
    return [...tracked, ...untracked].sort((a, b) => a.path.localeCompare(b.path));
  }
  async getInitialUploadChanges() {
    const deletedPaths = new Set(
      parseGitStatus(await this.gitRaw(["status", "--porcelain=v1", "-z"])).filter((change) => change.kind === "deleted").map((change) => change.path)
    );
    return (await this.gitRaw(["ls-files", "--cached", "-z"])).split("\0").filter(Boolean).filter((path) => !deletedPaths.has(path)).map((path) => ({ path, kind: "added" }));
  }
  isSyncing() {
    return this.syncing;
  }
  registerMobileEvents() {
    const record = (file, type) => {
      if (!(file instanceof import_obsidian3.TFile)) return;
      void this.recordDirty({ type, path: file.path });
    };
    this.trackFeatureEvent(this.app.vault.on("create", (file) => record(file, "add")));
    this.trackFeatureEvent(this.app.vault.on("modify", (file) => record(file, "modify")));
    this.trackFeatureEvent(this.app.vault.on("delete", (file) => record(file, "delete")));
    this.trackFeatureEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        if (!(file instanceof import_obsidian3.TFile)) return;
        void this.recordDirty({ type: "move", fromPath: oldPath, path: file.path });
      })
    );
  }
  async recordDirty(entry) {
    if (shouldIgnore(entry.path, this.settings.ignorePatterns) || entry.fromPath && shouldIgnore(entry.fromPath, this.settings.ignorePatterns)) return;
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
  async serverRequest(method, path, body) {
    this.validateServerSettings();
    const url = `${this.settings.serverUrl.replace(/\/$/, "")}${path}`;
    try {
      const response = await (0, import_obsidian3.requestUrl)({
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
    if (!import_obsidian3.Platform.isMobile) return "desktop";
    if (import_obsidian3.Platform.isIosApp) return "ios";
    if (import_obsidian3.Platform.isAndroidApp) return "android";
    return "unknown";
  }
  async registerMobile() {
    if (!this.settings.enabled || !import_obsidian3.Platform.isMobile || !this.settings.serverUrl || !this.settings.serverPassword) return;
    await this.serverRequest("POST", "/v1/devices/register", {
      deviceId: this.settings.deviceId,
      name: this.settings.deviceName,
      platform: this.platformName()
    });
    this.setStatus(`\u5DF2\u8FDE\u63A5 \xB7 v${this.settings.baseVersion}`);
  }
  async testConnection(showNotice) {
    try {
      if (import_obsidian3.Platform.isMobile) {
        await this.registerMobile();
      } else {
        if (!this.settings.setupComplete) throw new Error("\u8BF7\u5148\u5B8C\u6210\u9996\u6B21\u4F7F\u7528\u5F15\u5BFC");
        await this.testDesktopGit();
      }
      if (showNotice) new import_obsidian3.Notice(`Simple Sync\uFF1A${import_obsidian3.Platform.isMobile ? "\u670D\u52A1\u5668" : "Git"}\u8FDE\u63A5\u6B63\u5E38`);
    } catch (error) {
      await this.recordError("\u6D4B\u8BD5\u8FDE\u63A5", error);
      if (showNotice) new import_obsidian3.Notice(`Simple Sync\uFF1A${messageOf2(error)}`, 8e3);
      throw error;
    }
  }
  async syncNow(showNotice) {
    if (!import_obsidian3.Platform.isMobile && !this.settings.setupComplete) {
      if (showNotice) new import_obsidian3.Notice("\u8BF7\u5148\u5B8C\u6210\u300C\u4ECE\u96F6\u5F00\u59CB\u7684 Git \u540C\u6B65\u4F7F\u7528\u6307\u5357\u300D");
      return;
    }
    if (!this.settings.enabled) {
      if (showNotice) new import_obsidian3.Notice("Simple Sync \u5DF2\u5173\u95ED\uFF0C\u8BF7\u5148\u5728\u8BBE\u7F6E\u4E2D\u542F\u7528");
      return;
    }
    if (this.syncing) {
      if (showNotice) new import_obsidian3.Notice("Simple Sync\uFF1A\u5DF2\u6709\u540C\u6B65\u4EFB\u52A1\u6B63\u5728\u8FD0\u884C");
      return;
    }
    this.syncing = true;
    this.setStatus(import_obsidian3.Platform.isMobile ? "\u6B63\u5728\u540C\u6B65\u2026" : "\u51C6\u5907\u68C0\u67E5\u672C\u673A\u4FEE\u6539\u2026");
    try {
      if (import_obsidian3.Platform.isMobile) {
        await this.mobileSync();
        this.settings.lastSyncAt = Date.now();
        await this.saveSettings();
        this.setStatus(`\u5DF2\u540C\u6B65 \xB7 v${this.settings.baseVersion}`);
      } else {
        await this.enqueueDesktopGit(() => this.desktopGitSync());
        this.setStatus("\u540C\u6B65\u68C0\u67E5\u5B8C\u6210");
      }
      await this.recordSuccess(showNotice ? "\u624B\u52A8\u540C\u6B65" : "\u81EA\u52A8\u540C\u6B65", "\u540C\u6B65\u68C0\u67E5\u5B8C\u6210");
      if (showNotice) new import_obsidian3.Notice("Simple Sync\uFF1A\u540C\u6B65\u5B8C\u6210");
    } catch (error) {
      if (error instanceof SyncDeferredError) {
        this.setStatus(error.message);
        if (showNotice) new import_obsidian3.Notice(error.message);
        return;
      }
      if (!import_obsidian3.Platform.isMobile) await this.scheduleDesktopPushRetry();
      await this.recordError(showNotice ? "\u624B\u52A8\u540C\u6B65" : "\u81EA\u52A8\u540C\u6B65", error);
      this.setStatus(import_obsidian3.Platform.isMobile ? "\u540C\u6B65\u5931\u8D25" : "\u540C\u6B65\u5931\u8D25 \xB7 5 \u5206\u949F\u540E\u91CD\u8BD5");
      if (showNotice) new import_obsidian3.Notice(`Simple Sync\uFF1A${messageOf2(error)}`, 1e4);
      else console.error("Simple Sync", error);
    } finally {
      this.syncing = false;
      await this.refreshSyncView();
    }
  }
  async commitNow(showNotice) {
    if (!import_obsidian3.Platform.isMobile && !this.settings.setupComplete) {
      if (showNotice) new import_obsidian3.Notice("\u8BF7\u5148\u5B8C\u6210\u300C\u4ECE\u96F6\u5F00\u59CB\u7684 Git \u540C\u6B65\u4F7F\u7528\u6307\u5357\u300D");
      return;
    }
    if (!this.settings.enabled) {
      if (showNotice) new import_obsidian3.Notice("Simple Sync \u5DF2\u5173\u95ED\uFF0C\u8BF7\u5148\u5728\u8BBE\u7F6E\u4E2D\u542F\u7528");
      return;
    }
    if (import_obsidian3.Platform.isMobile) {
      if (showNotice) new import_obsidian3.Notice("\u79FB\u52A8\u7AEF\u4E0D\u652F\u6301\u672C\u673A Commit");
      return;
    }
    if (this.syncing) {
      if (showNotice) new import_obsidian3.Notice("Simple Sync\uFF1A\u5DF2\u6709\u4EFB\u52A1\u6B63\u5728\u8FD0\u884C");
      return;
    }
    this.syncing = true;
    this.setStatus("Commit \u4E2D\u2026");
    await this.refreshSyncView();
    try {
      let result = { committed: false, skippedPaths: [] };
      await this.enqueueDesktopGit(async () => {
        result = await this.desktopCommitOnly();
      });
      if (result.committed) this.scheduleDesktopPush();
      const skippedText = result.skippedPaths.length > 0 ? `\uFF0C\u8DF3\u8FC7 ${result.skippedPaths.length} \u4E2A\u6B63\u5728\u4FEE\u6539\u7684\u6587\u4EF6` : "";
      this.setStatus(result.committed ? `\u5DF2 Commit${skippedText}` : `\u6CA1\u6709\u53EF Commit \u6587\u4EF6${skippedText}`);
      if (showNotice) {
        new import_obsidian3.Notice(
          result.committed ? `Simple Sync\uFF1ACommit \u5B8C\u6210${skippedText}` : `Simple Sync\uFF1A\u6CA1\u6709\u53EF Commit \u6587\u4EF6${skippedText}`
        );
      }
    } catch (error) {
      await this.recordError("\u624B\u52A8 Commit", error);
      this.setStatus("Commit \u5931\u8D25");
      if (showNotice) new import_obsidian3.Notice(`Simple Sync\uFF1A${messageOf2(error)}`, 1e4);
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
    const overlap = response.actions.map((action) => action.path).filter((path) => newDirtyPaths.has(path));
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
    if (response.gitWarning) new import_obsidian3.Notice(`Simple Sync\uFF1AGitHub \u6682\u65F6\u4E0D\u53EF\u7528\uFF0C\u672C\u5730\u670D\u52A1\u5668\u540C\u6B65\u5DF2\u5B8C\u6210`, 7e3);
    if (triggerSync) window.setTimeout(() => void this.syncNow(false), 250);
  }
  async ensureParent(path) {
    const parts = path.split("/").slice(0, -1);
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
    if (!import_obsidian3.Platform.isMobile || !this.settings.serverUrl || !this.settings.serverPassword) return;
    try {
      const result = await this.serverRequest(
        "GET",
        `/v1/commands?deviceId=${encodeURIComponent(this.settings.deviceId)}`
      );
      const triggerSync = await this.handleCommands(result.commands);
      if (triggerSync) void this.syncNow(false);
    } catch (error) {
      console.error("Simple Sync command poll", error);
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
          new import_obsidian3.Notice(`${command.title}${command.body ? `
${command.body}` : ""}`, 8e3);
        } else if (command.kind === "sync") {
          new import_obsidian3.Notice(command.title || "\u670D\u52A1\u5668\u8981\u6C42\u540C\u6B65");
          triggerSync = true;
        } else if (command.kind === "open_file") {
          const path = command.payload.path;
          if (typeof path !== "string" || !path) throw new Error("open_file \u6307\u4EE4\u7F3A\u5C11 path");
          await this.app.workspace.openLinkText(path, "", false);
          new import_obsidian3.Notice(command.title || `\u5DF2\u6253\u5F00 ${path}`);
        }
        acknowledged.push(command.id);
      } catch (error) {
        new import_obsidian3.Notice(`Simple Sync \u6307\u4EE4\u5931\u8D25\uFF1A${messageOf2(error)}`, 8e3);
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
  setSetupChoice(path, choice) {
    this.setupChoices[path] = choice;
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
  async readSetupOverlap(path) {
    if (!this.settings.setupVerified || !this.setupPreview) throw new Error("\u8BF7\u5148\u68C0\u67E5\u672C\u5730\u4E0E\u8FDC\u7AEF\u6587\u4EF6");
    return this.setup().readOverlap(this.settings.setupVerified, this.setupPreview, path);
  }
  setup() {
    return new GitSetup(
      this.vaultBasePath(),
      (program, args, timeoutMs, onOutput, onCancelReady) => this.exec(
        program,
        args,
        program === "git" && this.settings.gitAuthMode === "token",
        true,
        timeoutMs,
        onOutput,
        onCancelReady
      ),
      () => this.settings.gitAuthMode === "token" ? this.settings.gitAuthKey : void 0
    );
  }
  async confirmSetupIntro() {
    this.settings.setupStep = 2;
    this.settings.setupGitVersion = "";
    await this.saveSettings();
  }
  async checkSetupGit() {
    const version = await this.setup().checkGit();
    this.settings.setupGitVersion = version;
    await this.saveSettings();
    return version;
  }
  async confirmSetupGit() {
    if (!this.settings.setupGitVersion) throw new Error("\u8BF7\u5148\u68C0\u67E5 Git \u662F\u5426\u5DF2\u5B89\u88C5\u3002");
    this.settings.setupStep = 3;
    await this.saveSettings();
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
  async authorizeSetup(onCode, onCancelReady) {
    await this.setup().login(onCode, onCancelReady);
    this.settings.gitAuthMode = "gh-cli";
    this.settings.setupStep = 4;
    await this.saveSettings();
  }
  async checkSetupAuthorization() {
    await this.setup().checkTools();
    await this.setup().configureGitCredentials();
    this.settings.gitAuthMode = "gh-cli";
    this.settings.setupStep = 4;
    await this.saveSettings();
  }
  async inspectSetupAuthorization() {
    try {
      await this.setup().checkLogin();
      await this.setup().configureGitCredentials();
      this.settings.gitAuthMode = "gh-cli";
      await this.saveSettings();
      return true;
    } catch {
      return false;
    }
  }
  async continueWithSetupAuthorization() {
    this.settings.gitAuthMode = "gh-cli";
    this.settings.setupStep = 4;
    await this.saveSettings();
  }
  async saveSetupToken(token) {
    const trimmed = token.trim();
    if (!trimmed) throw new Error("\u8BF7\u5148\u7C98\u8D34 GitHub Token\u3002");
    const login = await this.setup().validateToken(trimmed);
    this.settings.gitAuthMode = "token";
    this.settings.gitAuthKey = trimmed;
    this.settings.setupStep = 4;
    await this.saveSettings();
    return login;
  }
  async verifySetupRepository(url) {
    const verified = await this.setup().verifyRepository(url);
    this.settings.setupRepoUrl = verified.url;
    this.settings.setupVerified = verified;
    this.settings.setupStep = 5;
    this.setupPreview = void 0;
    this.setupChoices = {};
    this.setupTrackingChoice = void 0;
    await this.saveSettings();
  }
  async createSetupRepository(name) {
    const url = await this.setup().createPrivateRepository(name);
    this.settings.setupRepoUrl = url;
    await this.saveSettings();
    await this.verifySetupRepository(url);
    return url;
  }
  async inspectSetupRepository() {
    const repoUrl = this.settings.setupVerified?.url || this.settings.setupRepoUrl;
    if (!repoUrl) throw new Error("\u8BF7\u5148\u586B\u5199\u5E76\u6838\u9A8C\u79C1\u4EBA\u4ED3\u5E93\u5730\u5740");
    const verified = this.settings.setupComplete || !this.settings.setupVerified ? await this.setup().verifyRepository(repoUrl) : this.settings.setupVerified;
    this.settings.setupVerified = verified;
    this.setupPreview = await this.setup().preview(verified);
    if (!this.settings.setupComplete) {
      this.setupChoices = {};
      this.setupTrackingChoice = "keep";
      this.settings.setupStep = 5;
      await this.saveSettings();
    }
  }
  async confirmSetupPreview() {
    if (!this.setupPreview) throw new Error("\u8BF7\u5148\u68C0\u67E5\u672C\u5730\u4E0E\u8FDC\u7AEF\u6587\u4EF6");
    for (const path of this.setupPreview.overlaps) {
      if (!this.setupChoices[path]) throw new Error(`\u8BF7\u9009\u62E9\u540C\u540D\u6587\u4EF6\u7684\u4FDD\u7559\u7248\u672C\uFF1A${path}`);
    }
    if ((this.setupPreview.trackedExcludedLocal.length || this.setupPreview.trackedExcludedRemote.length) && !this.setupTrackingChoice) {
      throw new Error("\u8BF7\u5148\u9009\u62E9\u5982\u4F55\u5904\u7406\u5DF2\u88AB Git \u8DDF\u8E2A\u7684\u5FFD\u7565\u6587\u4EF6\u3002");
    }
    this.settings.setupStep = 6;
    await this.saveSettings();
  }
  async finishSetup(confirmedRebuildTracking = false) {
    const verified = this.settings.setupVerified;
    const preview = this.setupPreview;
    if (!verified || !preview) throw new Error("\u8BF7\u91CD\u65B0\u68C0\u67E5\u672C\u5730\u4E0E\u8FDC\u7AEF\u5185\u5BB9");
    if ((preview.trackedExcludedLocal.length || preview.trackedExcludedRemote.length) && !this.setupTrackingChoice) {
      throw new Error("\u8BF7\u5148\u9009\u62E9\u5982\u4F55\u5904\u7406\u5DF2\u88AB Git \u8DDF\u8E2A\u7684\u5FFD\u7565\u6587\u4EF6\u3002");
    }
    if (this.setupTrackingChoice === "rebuild" && !confirmedRebuildTracking) {
      throw new Error("\u8BF7\u5148\u786E\u8BA4\uFF1A\u505C\u6B62\u8DDF\u8E2A\u540E\uFF0C\u672C\u673A\u6587\u4EF6\u4FDD\u7559\uFF0C\u63A8\u9001\u4F1A\u4ECE\u8FDC\u7AEF\u5F53\u524D\u7248\u672C\u79FB\u9664\u8FD9\u4E9B\u6587\u4EF6\u3002");
    }
    const skippedPaths = await this.setup().finish(verified, preview, this.setupChoices, {
      name: this.settings.gitAuthorName,
      email: this.settings.gitAuthorEmail
    }, async () => {
      this.settings.setupMutationStarted = true;
      await this.saveSettings();
    }, await this.getSetupActivePaths(preview.localFiles), this.setupTrackingChoice === "rebuild");
    preview.missingIgnoreRules = [];
    this.settings.lastSyncAt = Date.now();
    this.settings.gitRemoteUrl = verified.url;
    this.settings.gitBranch = verified.branch;
    this.settings.setupComplete = true;
    this.settings.setupBackup = void 0;
    this.settings.setupMutationStarted = false;
    await this.saveSettings();
    await this.restartDesktopAutomation();
    this.setStatus(skippedPaths.length > 0 ? `\u9996\u6B21\u63A5\u5165\u5B8C\u6210 \xB7 ${skippedPaths.length} \u4E2A\u6B63\u5728\u7F16\u8F91\u7684\u6587\u4EF6\u7559\u5F85\u540E\u7EED Commit` : "\u9996\u6B21\u63A5\u5165\u5B8C\u6210");
    if (skippedPaths.length > 0) new import_obsidian3.Notice(`\u9996\u6B21\u63A8\u9001\u6210\u529F\uFF1B${skippedPaths.length} \u4E2A\u6B63\u5728\u7F16\u8F91\u7684\u6587\u4EF6\u672A\u63D0\u4EA4\uFF0C\u505C\u6B62\u4FEE\u6539\u540E\u5C06\u81EA\u52A8 Commit\u3002`, 1e4);
    await this.refreshSyncView();
  }
  vaultBasePath() {
    const adapter = this.app.vault.adapter;
    if (!(adapter instanceof import_obsidian3.FileSystemAdapter)) throw new Error("\u5F53\u524D\u5E73\u53F0\u6CA1\u6709\u53EF\u7528\u7684\u672C\u5730 Vault \u8DEF\u5F84");
    return adapter.getBasePath();
  }
  async detectDesktopGitDefaults() {
    const needsAuthorName = !this.settings.gitAuthorName || this.settings.gitAuthorName === DEFAULT_GIT_AUTHOR_NAME;
    const needsAuthorEmail = !this.settings.gitAuthorEmail || this.settings.gitAuthorEmail === DEFAULT_GIT_AUTHOR_EMAIL;
    if (this.settings.gitRemoteUrl && !needsAuthorName && !needsAuthorEmail) return;
    try {
      const remote = await this.git(["remote", "get-url", "origin"]);
      const branch = await this.git(["branch", "--show-current"]);
      const authorName = await this.git(["config", "user.name"]);
      const authorEmail = await this.git(["config", "user.email"]);
      if (!this.settings.gitRemoteUrl) this.settings.gitRemoteUrl = remote;
      if (branch) this.settings.gitBranch = branch;
      if (needsAuthorName && authorName) this.settings.gitAuthorName = authorName;
      if (needsAuthorEmail && authorEmail) this.settings.gitAuthorEmail = authorEmail;
      await this.saveSettings();
    } catch {
    }
  }
  async exec(program, args, authenticated = false, trim = true, timeoutMs = 12e4, onOutput, onCancelReady) {
    const nodeRequire2 = globalThis.require;
    if (!nodeRequire2) throw new Error("\u5F53\u524D\u5E73\u53F0\u4E0D\u652F\u6301\u684C\u9762\u547D\u4EE4");
    const childProcess = nodeRequire2("child_process");
    const env = { ...process.env };
    if (program === "git") env.GIT_TERMINAL_PROMPT = "0";
    if (authenticated && this.settings.gitAuthMode === "token") {
      if (!this.settings.gitAuthKey) throw new Error("\u8BF7\u586B\u5199 Author \u8BA4\u8BC1 Key / GitHub Token");
      env.GIT_CONFIG_COUNT = "1";
      env.GIT_CONFIG_KEY_0 = "http.https://github.com/.extraheader";
      env.GIT_CONFIG_VALUE_0 = `AUTHORIZATION: basic ${btoa(`x-access-token:${this.settings.gitAuthKey}`)}`;
    }
    return await new Promise((resolve, reject) => {
      const child = childProcess.execFile(
        program,
        args,
        { cwd: this.vaultBasePath(), env, windowsHide: true, timeout: timeoutMs, maxBuffer: 20 * 1024 * 1024 },
        (error, stdout, stderr) => {
          if (error) reject(new Error((stderr || stdout || error.message).trim()));
          else resolve(trim ? stdout.trim() : stdout);
        }
      );
      onCancelReady?.(() => {
        child.kill();
      });
      if (onOutput) {
        child.stdout?.on("data", (chunk) => onOutput(String(chunk)));
        child.stderr?.on("data", (chunk) => onOutput(String(chunk)));
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
  async desktopAutomaticPush() {
    await this.desktopCommitOnly();
    this.resetDesktopCommitTracking();
    if (await this.hasDesktopChanges()) this.scheduleDesktopCommit();
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
    const changes = parseGitStatus(await this.gitRaw(["status", "--porcelain=v1", "-z"]));
    const activePaths = this.getActivelyChangingPaths();
    const nodeRequire2 = globalThis.require;
    if (nodeRequire2) {
      const fs = nodeRequire2("fs");
      const path = nodeRequire2("path");
      const holdMs = Math.max(PLUGIN_EDIT_GRACE_MS, this.settings.autoCommitIdleMinutes * 120 * 1e3);
      for (const change of changes) {
        for (const file of [change.path, change.oldPath]) {
          if (!file?.startsWith(".obsidian/plugins/")) continue;
          try {
            const stat = await fs.promises.stat(path.join(this.vaultBasePath(), file));
            if (Date.now() - stat.mtimeMs < holdMs) activePaths.add(file);
          } catch {
          }
        }
      }
    }
    const activePluginDirs = [...activePaths].map((path) => /^\.obsidian\/plugins\/[^/]+\//.exec(path)?.[0]).filter((dir) => !!dir);
    for (const change of changes) {
      if (activePluginDirs.some((dir) => change.path.startsWith(dir) || change.oldPath?.startsWith(dir))) {
        activePaths.add(change.path);
        if (change.oldPath) activePaths.add(change.oldPath);
      }
    }
    const { included, skippedPaths } = partitionCommitChanges(changes, activePaths);
    if (included.length === 0) {
      this.setStatus(skippedPaths.length > 0 ? `\u7B49\u5F85 ${skippedPaths.length} \u4E2A\u6587\u4EF6\u505C\u6B62\u4FEE\u6539` : "\u672C\u673A\u6CA1\u6709\u9700\u8981 Commit \u7684\u4FEE\u6539");
      await this.refreshSyncView();
      return { committed: false, skippedPaths };
    }
    this.setSyncActivity(`\u6B63\u5728 Commit \xB7 ${included.length} \u4E2A\u6587\u4EF6`, "commit");
    if (await this.hasDesktopHead()) {
      await this.git(["add", "-A"]);
      if (skippedPaths.length > 0) await this.git(["reset", "-q", "HEAD", "--", ...skippedPaths]);
    } else {
      const includedPaths = [
        ...new Set(included.flatMap((change) => [change.path, change.oldPath].filter(Boolean)))
      ];
      await this.git(["add", "-A", "--", ...includedPaths]);
    }
    let committed = false;
    try {
      await this.git(["diff", "--cached", "--quiet"]);
    } catch {
      await this.git(["commit", "-m", `Simple Commit: ${(/* @__PURE__ */ new Date()).toISOString()}`]);
      committed = true;
    }
    this.setStatus(committed ? `\u5DF2 Commit \xB7 ${included.length} \u4E2A\u6587\u4EF6` : "\u672C\u673A\u6CA1\u6709\u9700\u8981 Commit \u7684\u4FEE\u6539");
    await this.refreshSyncView();
    return { committed, skippedPaths };
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
    if (import_obsidian3.Platform.isMobile) return [];
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
      new import_obsidian3.Notice(`Simple Sync\uFF1A\u65E0\u6CD5\u7EE7\u7EED\u5904\u7406\u51B2\u7A81\u3002${messageOf2(error)}`, 12e3);
    }
  }
  async openConflictView(paths) {
    let leaf = this.app.workspace.getLeavesOfType(SimpleSyncConflictView.type)[0] ?? null;
    if (!leaf) leaf = this.app.workspace.getRightLeaf(false);
    if (!leaf) throw new Error("\u65E0\u6CD5\u6253\u5F00\u53F3\u4FA7\u540C\u6B65\u51B2\u7A81\u5904\u7406\u9762\u677F");
    await leaf.setViewState({ type: SimpleSyncConflictView.type, active: true });
    if (!(leaf.view instanceof SimpleSyncConflictView)) throw new Error("\u65E0\u6CD5\u6253\u5F00\u540C\u6B65\u51B2\u7A81\u5904\u7406\u89C6\u56FE");
    const view = leaf.view;
    await this.app.workspace.revealLeaf(leaf);
    return await new Promise((resolve) => view.start(paths, resolve));
  }
  async readConflictFile(path) {
    try {
      return await this.app.vault.adapter.read(path);
    } catch {
      return null;
    }
  }
  async applyConflictText(path, content) {
    await this.app.vault.adapter.write(path, content);
    await this.git(["add", "--", path]);
  }
  async applyWholeConflictChoice(path, source) {
    const checkoutSide = source === "github" ? "--theirs" : "--ours";
    const stage = source === "github" ? 3 : 2;
    try {
      await this.git(["checkout", checkoutSide, "--", path]);
      await this.git(["add", "--", path]);
    } catch (error) {
      try {
        await this.git(["cat-file", "-e", `:${stage}:${path}`]);
      } catch {
        await this.git(["rm", "-f", "--", path]);
        return;
      }
      throw error;
    }
  }
};
var GitRepairModal = class extends import_obsidian3.Modal {
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
    list.createEl("li", { text: "\u4EE5\u6062\u590D\u540E\u7684\u672C\u673A\u5185\u5BB9\u5EFA\u7ACB\u4E00\u4E2A\u65B0\u7684 Commit\u3002" });
    list.createEl("li", { text: "Fetch \u4E91\u7AEF\u7248\u672C\u5E76\u5728\u672C\u673A Merge\uFF1B\u5982\u6709\u51B2\u7A81\uFF0C\u5728\u53F3\u4FA7\u9762\u677F\u9010\u9879\u9009\u62E9\u3002" });
    list.createEl("li", { text: "\u4FEE\u590D\u5B8C\u6210\u540E\u7B49\u5F85\u6B63\u5E38 Push \u8BA1\u65F6\uFF0C\u4E0D\u4F1A\u7ACB\u5373\u4E0A\u4F20\u3002" });
    container.createEl("p", {
      text: "\u64CD\u4F5C\u524D\u4F1A\u5EFA\u7ACB\u4E34\u65F6\u5B89\u5168\u5907\u4EFD\uFF1B\u6062\u590D\u6210\u529F\u540E\u81EA\u52A8\u6E05\u7406\uFF0C\u901A\u5E38\u4E0D\u9700\u8981\u4F60\u5904\u7406\u3002",
      cls: "simple-sync-conflict__warning"
    });
    const actions = container.createDiv({ cls: "modal-button-container" });
    const cancel = actions.createEl("button", { text: "\u6682\u4E0D\u4FEE\u590D" });
    cancel.addEventListener("click", () => this.close());
    const repair = actions.createEl("button", { text: "\u786E\u8BA4\u6062\u590D", cls: "mod-cta" });
    repair.addEventListener("click", () => {
      if (this.repairing) return;
      this.repairing = true;
      this.close();
      new import_obsidian3.Notice("Simple Sync\uFF1A\u6B63\u5728\u6062\u590D\u672C\u673A\u7248\u672C\u5E76\u68C0\u67E5\u4E91\u7AEF\u66F4\u65B0\u2026", 8e3);
      void this.plugin.repairInterruptedGitOperation().then((result) => {
        new import_obsidian3.Notice(
          `Simple Sync\uFF1A${result.operation} \u5F02\u5E38\u72B6\u6001\u5DF2\u9000\u51FA${result.restoredLocalChanges ? "\uFF0C\u672C\u673A\u4FEE\u6539\u5DF2\u6062\u590D" : ""}\uFF1B\u672C\u5730 Commit \u548C\u4E91\u7AEF\u5408\u5E76\u68C0\u67E5\u5DF2\u5B8C\u6210\uFF0C\u5C1A\u672A\u7ACB\u5373 Push`,
          1e4
        );
      }).catch((error) => {
        if (error instanceof SyncDeferredError) {
          new import_obsidian3.Notice("Simple Sync\uFF1A\u5F02\u5E38\u72B6\u6001\u5DF2\u9000\u51FA\uFF0C\u672C\u673A\u5185\u5BB9\u5DF2\u91CD\u65B0 Commit\uFF1B\u5408\u5E76\u51B2\u7A81\u5DF2\u4FDD\u7559\u5728\u540C\u6B65\u9762\u677F\u7B49\u5F85\u5904\u7406", 12e3);
        } else {
          new import_obsidian3.Notice(`Simple Sync\uFF1A\u5F02\u5E38\u4FEE\u590D\u672A\u5B8C\u6210\u3002${messageOf2(error)}`, 15e3);
        }
      });
    });
  }
};
var _SimpleSyncConflictView = class _SimpleSyncConflictView extends import_obsidian3.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.totalFiles = 0;
    this.settled = false;
    this.paths = [];
  }
  getViewType() {
    return _SimpleSyncConflictView.type;
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
    container.addClass("simple-sync-conflict-view");
    container.createDiv({ text: "\u6B63\u5728\u51C6\u5907\u51B2\u7A81\u5185\u5BB9\u2026", cls: "simple-sync-conflict__intro" });
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
    const path = this.paths[0];
    const content = await this.plugin.readConflictFile(path);
    const blocks = content === null ? [] : parseConflictBlocks(content);
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("simple-sync-conflict-view");
    container.createEl("h2", { text: "\u53D1\u73B0\u5185\u5BB9\u51B2\u7A81" });
    container.createEl("p", {
      text: "GitHub \u548C\u672C\u673A\u4FEE\u6539\u4E86\u540C\u4E00\u5904\u5185\u5BB9\u3002\u8BF7\u9010\u9879\u9009\u62E9\u6700\u7EC8\u4FDD\u7559\u4EC0\u4E48\uFF1B\u786E\u8BA4\u524D\u4E0D\u4F1A\u4E0A\u4F20\u5230 GitHub\u3002",
      cls: "simple-sync-conflict__intro"
    });
    const progress = container.createDiv({ cls: "simple-sync-conflict__progress" });
    progress.createSpan({ text: `\u5DF2\u5904\u7406 ${this.totalFiles - this.paths.length} / ${this.totalFiles}` });
    progress.createEl("code", { text: path });
    if (content === null || blocks.length === 0) {
      this.renderWholeFileChoice(container, path);
      return;
    }
    this.renderTextBlocks(container, path, content, blocks);
  }
  renderWholeFileChoice(container, path) {
    container.createEl("p", {
      text: "\u8FD9\u4E2A\u6587\u4EF6\u65E0\u6CD5\u6309\u6587\u5B57\u5206\u6BB5\u663E\u793A\uFF0C\u901A\u5E38\u662F\u9644\u4EF6\u51B2\u7A81\uFF0C\u6216\u4E00\u53F0\u8BBE\u5907\u5220\u9664\u4E86\u6587\u4EF6\u3001\u53E6\u4E00\u53F0\u8BBE\u5907\u4FEE\u6539\u4E86\u5B83\u3002\u8BF7\u9009\u62E9\u4FDD\u7559\u54EA\u4E00\u8FB9\u3002",
      cls: "simple-sync-conflict__warning"
    });
    const choices = container.createDiv({ cls: "simple-sync-conflict__whole-actions" });
    this.createActionButton(choices, "\u4FDD\u7559 GitHub \u7248\u672C", async () => {
      await this.plugin.applyWholeConflictChoice(path, "github");
      await this.advance();
    });
    this.createActionButton(choices, "\u4FDD\u7559\u672C\u673A\u7248\u672C", async () => {
      await this.plugin.applyWholeConflictChoice(path, "local");
      await this.advance();
    }, true);
    this.renderFooter(container);
  }
  renderTextBlocks(container, path, content, blocks) {
    const resolutions = new Array(blocks.length);
    let applyButton;
    blocks.forEach((block, index) => {
      const card = container.createDiv({ cls: "simple-sync-conflict__block" });
      card.createEl("h3", { text: `\u7B2C ${index + 1} \u5904\u5DEE\u5F02` });
      const comparison = card.createDiv({ cls: "simple-sync-conflict__comparison" });
      this.renderVersion(comparison, "GitHub \u4E0A\u7684\u5185\u5BB9", block.github, "is-github");
      this.renderVersion(comparison, "\u672C\u673A\u5185\u5BB9", block.local, "is-local");
      const actions = card.createDiv({ cls: "simple-sync-conflict__block-actions" });
      actions.createSpan({ text: "\u6700\u7EC8\u4FDD\u7559\uFF1A", cls: "simple-sync-conflict__action-label" });
      const result = card.createEl("textarea", { cls: "simple-sync-conflict__result" });
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
      cls: "mod-cta simple-sync-conflict__continue"
    });
    applyButton.disabled = true;
    applyButton.addEventListener("click", async () => {
      if (resolutions.some((item) => item === void 0)) return;
      applyButton.disabled = true;
      try {
        await this.plugin.applyConflictText(path, applyConflictResolutions(content, blocks, resolutions));
        await this.advance();
      } catch (error) {
        new import_obsidian3.Notice(`\u65E0\u6CD5\u5E94\u7528\u51B2\u7A81\u5904\u7406\u7ED3\u679C\uFF1A${messageOf2(error)}`, 8e3);
        applyButton.disabled = false;
      }
    });
    this.renderFooter(container);
  }
  renderVersion(container, label, value, className) {
    const version = container.createDiv({ cls: `simple-sync-conflict__version ${className}` });
    version.createDiv({ text: label, cls: "simple-sync-conflict__source" });
    version.createEl("pre", { text: value || "\uFF08\u8FD9\u4E00\u8FB9\u5220\u9664\u4E86\u8FD9\u6BB5\u5185\u5BB9\uFF09" });
  }
  createActionButton(container, label, action, cta = false) {
    const button = container.createEl("button", { text: label, cls: cta ? "mod-cta" : void 0 });
    button.addEventListener("click", () => void action());
    return button;
  }
  renderFooter(container) {
    const footer = container.createDiv({ cls: "simple-sync-conflict__footer" });
    const explanation = footer.createEl("span", {
      text: this.paths.length > 1 ? "\u53EF\u4EE5\u5148\u5904\u7406\u5176\u4ED6\u6587\u4EF6\uFF1B\u672A\u5904\u7406\u7684\u51B2\u7A81\u4F1A\u4E00\u76F4\u4FDD\u7559\u5728\u540C\u6B65\u9762\u677F\u3002" : "\u672A\u5904\u7406\u7684\u51B2\u7A81\u4F1A\u4E00\u76F4\u4FDD\u7559\u5728\u540C\u6B65\u9762\u677F\uFF0C\u7A0D\u540E\u53EF\u4EE5\u7EE7\u7EED\u3002"
    });
    const actions = footer.createDiv({ cls: "simple-sync-conflict__footer-actions" });
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
_SimpleSyncConflictView.type = "simple-sync-conflict-view";
var SimpleSyncConflictView = _SimpleSyncConflictView;
var ErrorLogModal = class extends import_obsidian3.Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
  }
  onOpen() {
    this.modalEl.addClass("simple-sync-error-modal");
    this.render();
  }
  async render() {
    const lastCommitAt = await this.plugin.getLatestCommitAt();
    const container = this.contentEl;
    container.empty();
    const overview = container.createDiv({ cls: "simple-sync-error-modal__overview" });
    const heading = overview.createDiv();
    heading.createEl("h2", { text: "\u6700\u8FD1\u540C\u6B65\u65E5\u5FD7" });
    heading.createEl("p", {
      text: "\u4EC5\u4FDD\u7559\u6700\u8FD1 24 \u5C0F\u65F6\u7684 Commit\u3001\u540C\u6B65\u548C\u8FDE\u63A5\u8BB0\u5F55\u3002",
      cls: "simple-sync-error-modal__intro"
    });
    const lastTimes = overview.createDiv({ cls: "simple-sync-error-modal__last-times" });
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
      const row = lastTimes.createDiv({ cls: "simple-sync-error-modal__last-time" });
      row.createSpan({ text: label });
      row.createEl("time", { text: formatTime(timestamp) });
    }
    const logs = this.plugin.getRecentErrorLogs();
    if (logs.length === 0) {
      container.createDiv({ text: "\u6700\u8FD1 24 \u5C0F\u65F6\u6CA1\u6709\u540C\u6B65\u8BB0\u5F55\u3002", cls: "simple-sync-error-modal__empty" });
    } else {
      const list = container.createDiv({ cls: "simple-sync-error-modal__list" });
      for (const entry of logs) {
        const isError = entry.status !== "success";
        const item = list.createEl("details", {
          cls: `simple-sync-error-modal__item ${isError ? "is-error" : "is-success"}`
        });
        const header = item.createEl("summary", { cls: "simple-sync-error-modal__header" });
        header.createSpan({ text: entry.context, cls: "simple-sync-error-modal__context" });
        header.createEl("time", {
          text: new Date(entry.timestamp).toLocaleString("zh-CN", { hour12: false }),
          cls: "simple-sync-error-modal__time"
        });
        item.createEl("pre", { text: entry.message || "\u8FD9\u6761\u65E7\u8BB0\u5F55\u672A\u4FDD\u5B58\u6267\u884C\u8BE6\u60C5\u3002" });
      }
    }
    const actions = container.createDiv({ cls: "simple-sync-error-modal__actions" });
    if (logs.length > 0) {
      const clearButton = actions.createEl("button", { text: "\u6E05\u7A7A\u65E5\u5FD7" });
      clearButton.addEventListener("click", async () => {
        await this.plugin.clearErrorLogs();
        await this.render();
      });
    }
    const closeButton = actions.createEl("button", { text: "\u5173\u95ED", cls: "mod-cta" });
    closeButton.addEventListener("click", () => this.close());
  }
};
var _SimpleSyncView = class _SimpleSyncView extends import_obsidian3.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.renderGeneration = 0;
  }
  getViewType() {
    return _SimpleSyncView.type;
  }
  getDisplayText() {
    return "Simple Sync";
  }
  getIcon() {
    return "refresh-cw";
  }
  async onOpen() {
    await this.render();
  }
  updateActivity(state) {
    const container = this.containerEl.children[1];
    const status = container.querySelector(".simple-sync-view__status");
    if (!status) return;
    status.className = `simple-sync-view__status is-${state.tone}`;
    status.querySelector(".simple-sync-view__status-text")?.setText(state.text);
  }
  async render() {
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
    container.addClass("simple-sync-view");
    const recentLogs = this.plugin.getRecentErrorLogs();
    const hasActiveError = !!this.plugin.getActiveSyncError() || recentLogs[0]?.status === "error";
    const header = container.createDiv({ cls: "simple-sync-view__header" });
    const actions = header.createDiv({ cls: "simple-sync-view__actions" });
    const layoutButton = actions.createDiv({ cls: "clickable-icon nav-action-button" });
    layoutButton.setAttr("role", "button");
    layoutButton.setAttr("tabindex", "0");
    layoutButton.setAttr("aria-label", "\u66F4\u6539\u5E03\u5C40");
    (0, import_obsidian3.setIcon)(layoutButton, LAYOUT_SWITCH_ICON);
    layoutButton.addEventListener("click", () => void this.plugin.toggleViewLayout());
    const refreshButton = actions.createDiv({ cls: "clickable-icon nav-action-button" });
    refreshButton.setAttr("role", "button");
    refreshButton.setAttr("tabindex", "0");
    refreshButton.setAttr("aria-label", "\u5237\u65B0\u66F4\u6539\u533A");
    (0, import_obsidian3.setIcon)(refreshButton, REFRESH_CHANGES_ICON);
    refreshButton.addEventListener("click", () => void this.render());
    if (recentLogs.length > 0) {
      const errorButton = actions.createDiv({
        cls: `clickable-icon nav-action-button simple-sync-view__error-button${hasActiveError ? " is-active" : ""}`
      });
      errorButton.setAttr("role", "button");
      errorButton.setAttr("tabindex", "0");
      errorButton.setAttr("aria-label", `\u67E5\u770B\u6700\u8FD1\u540C\u6B65\u65E5\u5FD7\uFF0C\u5171 ${recentLogs.length} \u6761`);
      (0, import_obsidian3.setIcon)(errorButton, hasActiveError ? "triangle-alert" : "history");
      (0, import_obsidian3.setTooltip)(errorButton, `\u67E5\u770B\u6700\u8FD1\u540C\u6B65\u65E5\u5FD7\uFF08${recentLogs.length}\uFF09`);
      errorButton.addEventListener("click", () => new ErrorLogModal(this.app, this.plugin).open());
    }
    const settingsButton = actions.createDiv({ cls: "clickable-icon nav-action-button" });
    settingsButton.setAttr("role", "button");
    settingsButton.setAttr("tabindex", "0");
    settingsButton.setAttr("aria-label", "\u540C\u6B65\u9762\u677F\u8BBE\u7F6E");
    (0, import_obsidian3.setIcon)(settingsButton, "settings");
    (0, import_obsidian3.setTooltip)(settingsButton, "\u540C\u6B65\u9762\u677F\u8BBE\u7F6E");
    settingsButton.addEventListener("click", (event) => this.openViewSettingsMenu(event));
    const status = container.createDiv({ cls: "simple-sync-view__status" });
    status.addClass(`is-${statusState.tone}`);
    const statusDot = status.createSpan({ cls: "simple-sync-view__status-dot" });
    status.createSpan({ text: statusState.text, cls: "simple-sync-view__status-text" });
    if (pendingConflictPaths.length > 0) {
      const reminder = container.createDiv({ cls: "simple-sync-view__conflict-reminder" });
      (0, import_obsidian3.setIcon)(reminder.createSpan({ cls: "simple-sync-view__conflict-reminder-icon" }), "triangle-alert");
      const copy = reminder.createDiv({ cls: "simple-sync-view__conflict-reminder-copy" });
      copy.createDiv({ text: "\u540C\u6B65\u5C1A\u672A\u5B8C\u6210", cls: "simple-sync-view__conflict-reminder-title" });
      copy.createDiv({
        text: `${pendingConflictPaths.length} \u4E2A\u5F02\u5E38\u6587\u4EF6\u7B49\u5F85\u786E\u8BA4\uFF1B\u5DF2\u80FD\u5408\u5E76\u7684\u5185\u5BB9\u4F1A\u4FDD\u7559\uFF0C\u4E0D\u4F1A\u88AB\u56DE\u6EDA\u3002`,
        cls: "simple-sync-view__conflict-reminder-desc"
      });
      const continueButton = reminder.createEl("button", { text: "\u7EE7\u7EED\u5904\u7406", cls: "mod-cta" });
      continueButton.addEventListener("click", () => void this.plugin.continuePendingMergeConflicts());
    } else if (deferredMergePaths.length > 0) {
      const reminder = container.createDiv({
        cls: "simple-sync-view__conflict-reminder simple-sync-view__conflict-reminder--deferred"
      });
      (0, import_obsidian3.setIcon)(reminder.createSpan({ cls: "simple-sync-view__conflict-reminder-icon" }), "triangle-alert");
      const copy = reminder.createDiv({ cls: "simple-sync-view__conflict-reminder-copy" });
      const fileLabel = deferredMergePaths.length === 1 ? `\u201C${deferredMergePaths[0]}\u201D` : `${deferredMergePaths.length} \u4E2A\u6587\u4EF6`;
      copy.createDiv({ text: "\u540C\u6B65\u6682\u7F13\uFF1A\u6587\u4EF6\u4ECD\u5728\u4FEE\u6539", cls: "simple-sync-view__conflict-reminder-title" });
      copy.createDiv({
        text: `${fileLabel}\u6B63\u5728\u4FEE\u6539\uFF0C\u4E91\u7AEF\u4E5F\u6709\u65B0\u7248\u672C\u3002\u4E3A\u907F\u514D\u8986\u76D6\u672C\u673A\u5185\u5BB9\uFF0C\u5DF2\u6682\u505C\u5408\u5E76\uFF1B\u505C\u6B62\u4FEE\u6539\u5E76\u5B8C\u6210\u672C\u5730 Commit \u540E\uFF0C\u5C06\u81EA\u52A8\u91CD\u65B0\u5C1D\u8BD5\u540C\u6B65\u3002`,
        cls: "simple-sync-view__conflict-reminder-desc"
      });
    }
    const section = container.createDiv({ cls: "simple-sync-view__section" });
    const sectionHeader = section.createDiv({ cls: "simple-sync-view__section-header" });
    const actionButton = sectionHeader.createEl("button", { cls: "simple-sync-view__section-action" });
    const actionSpinner = actionButton.createSpan({ cls: "simple-sync-view__section-action-spinner" });
    const actionLabel = actionButton.createSpan({
      text: this.plugin.isSyncing() ? mode === "commit" ? "Commit \u4E2D\u2026" : "\u540C\u6B65\u4E2D\u2026" : mode === "commit" ? "Commit" : "\u540C\u6B65"
    });
    (0, import_obsidian3.setIcon)(actionSpinner, "loader-circle");
    actionButton.toggleClass("is-loading", this.plugin.isSyncing());
    actionButton.disabled = this.plugin.isSyncing() || pendingConflictPaths.length > 0;
    actionButton.setAttr(
      "aria-label",
      mode === "commit" ? "Commit \u5F53\u524D\u5217\u8868\u4E2D\u7684\u672C\u673A\u66F4\u6539" : "\u4E0B\u8F7D\u8FDC\u7AEF\u66F4\u65B0\u5E76\u4E0A\u4F20\u672C\u673A\u66F4\u6539"
    );
    actionButton.addEventListener("click", async () => {
      actionButton.disabled = true;
      actionButton.addClass("is-loading");
      actionLabel.setText(mode === "commit" ? "Commit \u4E2D\u2026" : "\u540C\u6B65\u4E2D\u2026");
      if (mode === "commit") await this.plugin.commitNow(true);
      else await this.plugin.syncNow(true);
      await this.render();
    });
    if (this.plugin.settings.showVersionViewSwitcher) {
      sectionHeader.addClass("has-mode-control");
      this.createModeControl(sectionHeader, mode);
    }
    if (!changesError) {
      if (mode === "commit" && changes.length === 0) actionButton.disabled = true;
      if (changes.length === 0) {
        const empty = section.createDiv({ cls: "simple-sync-view__empty" });
        (0, import_obsidian3.setIcon)(empty.createSpan(), "check-circle-2");
        empty.createSpan({ text: mode === "upload" ? "\u6CA1\u6709\u5F85\u4E0A\u4F20\u6587\u4EF6" : "\u6CA1\u6709\u5F85 Commit \u6587\u4EF6" });
      } else if (this.plugin.settings.viewLayout === "tree") {
        this.renderTree(section, changes);
      } else {
        for (const change of changes) this.renderChange(section, change, true);
      }
    } else {
      if (mode === "commit") actionButton.disabled = true;
      section.createDiv({ text: `\u65E0\u6CD5\u8BFB\u53D6\u66F4\u6539\uFF1A${messageOf2(changesError)}`, cls: "simple-sync-view__empty is-error" });
    }
  }
  createModeControl(parent, current) {
    const control = parent.createDiv({ cls: "simple-sync-view__mode-control" });
    control.setAttr("role", "group");
    control.setAttr("aria-label", "\u9009\u62E9\u6587\u4EF6\u5217\u8868");
    const createChoice = (value, tooltip, svg) => {
      const button = control.createEl("button", { cls: "simple-sync-view__mode-choice" });
      button.toggleClass("is-active", value === current);
      button.setAttr("aria-pressed", String(value === current));
      button.setAttr("aria-label", tooltip);
      button.innerHTML = svg;
      (0, import_obsidian3.setTooltip)(button, tooltip);
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
    const menu = new import_obsidian3.Menu();
    menu.addItem(
      (item) => item.setTitle("\u663E\u793A\u5F85 Commit \u5217\u8868").setIcon(this.plugin.settings.showVersionViewSwitcher ? CHECKBOX_CHECKED_ICON : "square").onClick(() => void this.plugin.setVersionViewSwitcher(!this.plugin.settings.showVersionViewSwitcher))
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
    if (!import_obsidian3.Platform.isMobile && !this.plugin.settings.setupComplete) {
      return { tone: "pending", text: `\u9996\u6B21\u63A5\u5165\u672A\u5B8C\u6210 \xB7 \u8BF7\u5728\u8BBE\u7F6E\u4E2D\u7EE7\u7EED\u7B2C ${this.plugin.getSetupPreview() ? this.plugin.settings.setupStep : Math.min(this.plugin.settings.setupStep, 5)} \u6B65` };
    }
    const activity = this.plugin.getSyncActivity();
    if (activity) return activity;
    if (this.plugin.isSyncing()) {
      return { tone: "checking", text: mode === "commit" ? "\u6B63\u5728\u6574\u7406 Commit \u7ED3\u679C\u2026" : "\u6B63\u5728\u6574\u7406\u540C\u6B65\u7ED3\u679C\u2026" };
    }
    if (changesError) {
      return { tone: "error", text: `\u8BFB\u53D6\u72B6\u6001\u5931\u8D25 \xB7 ${formatStatusError(messageOf2(changesError))}` };
    }
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
    const lastSyncText = lastSyncAt ? `${import_obsidian3.Platform.isMobile ? "\u4E0A\u6B21\u540C\u6B65" : "\u4E0A\u6B21 Push"} ${formatRelativeTime(lastSyncAt)}` : import_obsidian3.Platform.isMobile ? "\u5C1A\u672A\u540C\u6B65" : "\u5C1A\u672A Push";
    const activeError = this.plugin.getActiveSyncError();
    if (activeError) {
      const detail = `${activeError.context}\uFF1A${formatStatusError(activeError.message)}`;
      return { tone: "error", text: `\u540C\u6B65\u5F02\u5E38 \xB7 ${detail} \xB7 ${formatRelativeTime(activeError.timestamp)}` };
    }
    if (changes.length > 0) {
      return { tone: "pending", text: `\u5F85\u4E0A\u4F20 \xB7 ${changes.length} \u4E2A\u6587\u4EF6 \xB7 ${lastSyncText}` };
    }
    return {
      tone: "success",
      text: import_obsidian3.Platform.isMobile ? lastSyncAt ? `\u5DF2\u540C\u6B65 \xB7 ${formatRelativeTime(lastSyncAt)}` : "\u5DF2\u540C\u6B65 \xB7 \u5C1A\u65E0\u65F6\u95F4\u8BB0\u5F55" : lastSyncAt ? `\u5DF2\u4E0A\u4F20 \xB7 ${formatRelativeTime(lastSyncAt)}` : "\u5DF2\u4E0A\u4F20 \xB7 \u5C1A\u65E0 Push \u8BB0\u5F55"
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
      const groupEl = parent.createDiv({ cls: "simple-sync-view__group" });
      const label = groupEl.createDiv({ cls: "simple-sync-view__group-label" });
      (0, import_obsidian3.setIcon)(label.createSpan(), "folder-closed");
      label.createSpan({ text: group });
      label.createSpan({ text: String(items.length), cls: "simple-sync-view__group-count" });
      for (const change of items) this.renderChange(groupEl, change, false);
    }
  }
  renderChange(parent, change, fullPath) {
    const row = parent.createDiv({ cls: "simple-sync-view__change" });
    row.setAttr("data-kind", change.kind);
    row.createSpan({ text: this.changeMark(change.kind), cls: "simple-sync-view__mark" });
    const text = row.createDiv({ cls: "simple-sync-view__change-text" });
    const label = fullPath ? change.path : change.path.split("/").slice(1).join("/") || change.path;
    text.createDiv({ text: label, cls: "simple-sync-view__path" });
    if (change.kind === "moved" && change.oldPath) {
      text.createDiv({ text: `\u4ECE ${change.oldPath}`, cls: "simple-sync-view__old-path" });
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
_SimpleSyncView.type = "simple-sync-view";
var SimpleSyncView = _SimpleSyncView;
var SimpleSyncSettingTab = class extends import_obsidian3.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.desktopPage = "root";
    this.setupViewStep = 1;
    this.setupRepoInput = "";
    this.setupRepoNameInput = "";
    this.setupRepoMode = "existing";
    this.setupTokenVisible = false;
    this.setupPlatform = "github";
    this.setupBusy = false;
    this.setupRebuildConfirmed = false;
    this.setupMessage = "";
    this.setupDeviceCode = "";
    this.setupDeviceExpiresAt = 0;
    this.refreshingSetupDeviceCode = false;
    this.setupAutoPreviewStarted = false;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("simple-sync-settings");
    if (this.desktopPage === "git") {
      this.displayDesktopGit(containerEl);
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
    if (this.desktopPage === "android-guide") {
      this.displayDevicePreview(containerEl, "\u4ECE\u96F6\u5F00\u59CB\u7684 Git \u540C\u6B65\u4F7F\u7528\u6307\u5357\uFF08Android\uFF09", "Android \u7AEF\u7684\u63A5\u5165\u6B65\u9AA4\u5C06\u5728\u8F7B\u91CF\u7248 Git \u540C\u6B65\u529F\u80FD\u5B8C\u6210\u540E\u8865\u5145\u3002", "mobile");
      return;
    }
    if (this.desktopPage === "ios-guide") {
      this.displayDevicePreview(containerEl, "\u4ECE\u96F6\u5F00\u59CB\u7684 Git \u540C\u6B65\u4F7F\u7528\u6307\u5357\uFF08iOS\uFF09", "iOS \u7AEF\u7684\u63A5\u5165\u6B65\u9AA4\u5C06\u5728\u8F7B\u91CF\u7248 Git \u540C\u6B65\u529F\u80FD\u5B8C\u6210\u540E\u8865\u5145\u3002", "mobile");
      return;
    }
    if (!import_obsidian3.Platform.isMobile && this.desktopPage === "setup") {
      this.displaySetup(containerEl);
      return;
    }
    containerEl.createEl("h2", { text: "Simple Sync" });
    this.addEnableSetting(containerEl);
    if (!import_obsidian3.Platform.isMobile) this.addSetupEntry(containerEl);
    this.displayDesktop(containerEl);
  }
  addEnableSetting(parent) {
    new import_obsidian3.Setting(parent).setName("\u542F\u7528 Simple Sync").setDesc("\u663E\u793A\u53F3\u4FA7\u540C\u6B65\u9762\u677F\uFF0C\u5E76\u5141\u8BB8\u624B\u52A8\u6216\u5B9A\u65F6\u540C\u6B65\u3002\u5173\u95ED\u540E\u4FDD\u7559\u914D\u7F6E\uFF0C\u4F46\u505C\u6B62\u672C\u63D2\u4EF6\u7684\u540C\u6B65\u5DE5\u4F5C\u3002").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.enabled).onChange(async (value) => {
        await this.plugin.setFeatureEnabled(value);
        this.display();
      })
    );
  }
  addSyncSetting(parent) {
    new import_obsidian3.Setting(parent).setName("\u540C\u6B65\u7B14\u8BB0").setDesc("\u4E0B\u8F7D\u8FDC\u7AEF\u66F4\u65B0\u5E76\u4E0A\u4F20\u672C\u673A\u66F4\u6539\u3002").addButton((button) => button.setButtonText("\u540C\u6B65\u7B14\u8BB0").setCta().onClick(() => void this.plugin.syncNow(true)));
  }
  addTestSetting(parent) {
    new import_obsidian3.Setting(parent).setName("\u6D4B\u8BD5\u8FDE\u63A5").setDesc("\u53EA\u9A8C\u8BC1\u5F53\u524D\u670D\u52A1\u5668\u6216 Git/GitHub \u914D\u7F6E\u3002").addButton((button) => button.setButtonText("\u6D4B\u8BD5").onClick(() => void this.plugin.testConnection(true)));
  }
  displayMobile(containerEl) {
    containerEl.createEl("h3", { text: "\u624B\u673A\u7AEF\u8BBE\u7F6E", cls: "simple-sync-section-title" });
    containerEl.createEl("p", {
      text: "\u79FB\u52A8\u7AEF\u517C\u5BB9\u4ECD\u5728\u5B8C\u5584\uFF0C\u4EE5\u4E0B\u4EC5\u4FDD\u7559\u5F53\u524D\u5DF2\u7ECF\u5B9E\u73B0\u7684\u670D\u52A1\u5668\u540C\u6B65\u8BBE\u7F6E\u3002",
      cls: "simple-sync-section-desc"
    });
    new import_obsidian3.Setting(containerEl).setName("\u670D\u52A1\u5668\u5730\u5740").setDesc("\u516C\u7F51\u5FC5\u987B\u4F7F\u7528 HTTPS\uFF0C\u4F8B\u5982 https://sync.example.com\u3002").addText(
      (text) => text.setPlaceholder("https://sync.example.com").setValue(this.plugin.settings.serverUrl).onChange(async (value) => {
        this.plugin.settings.serverUrl = value.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian3.Setting(containerEl).setName("\u8BA4\u8BC1\u5BC6\u7801").setDesc("\u4FDD\u5B58\u5728\u672C\u673A\u63D2\u4EF6\u6570\u636E\u4E2D\uFF1B\u8BE5\u6587\u4EF6\u5DF2\u52A0\u5165 Git \u5FFD\u7565\u3002").addText((text) => {
      text.inputEl.type = "password";
      text.setValue(this.plugin.settings.serverPassword).onChange(async (value) => {
        this.plugin.settings.serverPassword = value;
        await this.plugin.saveSettings();
      });
    });
    new import_obsidian3.Setting(containerEl).setName("\u8BBE\u5907\u540D\u79F0").addText(
      (text) => text.setValue(this.plugin.settings.deviceName).onChange(async (value) => {
        this.plugin.settings.deviceName = value.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian3.Setting(containerEl).setName("\u81EA\u52A8\u540C\u6B65\u95F4\u9694\uFF08\u5206\u949F\uFF09").addText(
      (text) => text.setValue(String(this.plugin.settings.mobileAutoSyncMinutes)).onChange(async (value) => {
        this.plugin.settings.mobileAutoSyncMinutes = Math.max(0, Number(value) || 0);
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian3.Setting(containerEl).setName("\u6307\u4EE4\u68C0\u67E5\u95F4\u9694\uFF08\u79D2\uFF09").addText(
      (text) => text.setValue(String(this.plugin.settings.commandPollSeconds)).onChange(async (value) => {
        this.plugin.settings.commandPollSeconds = Math.max(15, Number(value) || 60);
        await this.plugin.saveSettings();
      })
    );
  }
  currentDevice() {
    if (import_obsidian3.Platform.isMobile) return "mobile";
    return typeof process !== "undefined" && process.platform === "linux" ? "server" : "git";
  }
  displayDesktop(containerEl) {
    const currentDevice = this.currentDevice();
    containerEl.createEl("h3", { text: "\u8BBE\u5907\u540C\u6B65", cls: "simple-sync-section-title" });
    containerEl.createEl("p", { text: "\u5DF2\u81EA\u52A8\u8BC6\u522B\u5F53\u524D\u8BBE\u5907\uFF1B\u5176\u4ED6\u8BBE\u5907\u7684\u8BBE\u7F6E\u9875\u53EF\u70B9\u5F00\u9884\u89C8\u3002", cls: "simple-sync-section-desc" });
    const entries = [
      { page: "git", title: "\u7535\u8111\u7AEF\u540C\u6B65", desc: "\u4F7F\u7528\u672C\u673A Git \u4E0E GitHub \u4E0B\u8F7D\u3001\u5408\u5E76\u5E76\u4E0A\u4F20\u7B14\u8BB0\u3002", icon: "git-branch" },
      { page: "mobile", title: "\u624B\u673A\u7AEF\u540C\u6B65", desc: "Android / iOS \xB7 \u8F7B\u91CF\u7248 Git \u540C\u6B65", icon: "smartphone" },
      { page: "server", title: "\u670D\u52A1\u5668\u7AEF\u540C\u6B65", desc: "Linux \xB7 \u670D\u52A1\u5668\u540C\u6B65\u8BBE\u7F6E", icon: "server" }
    ];
    for (const entry of entries) {
      const isCurrent = currentDevice === entry.page;
      const button = containerEl.createEl("button", {
        cls: `simple-sync-page-link simple-sync-device-link${isCurrent ? "" : " is-preview"}`,
        attr: { type: "button" }
      });
      (0, import_obsidian3.setIcon)(button.createSpan({ cls: "simple-sync-page-link__icon" }), entry.icon);
      const copy = button.createSpan({ cls: "simple-sync-page-link__copy" });
      copy.createSpan({ text: `${entry.title}${isCurrent ? "\uFF08\u5F53\u524D\u8BBE\u5907\uFF09" : ""}`, cls: "simple-sync-page-link__title" });
      copy.createSpan({ text: entry.desc, cls: "simple-sync-page-link__desc" });
      (0, import_obsidian3.setIcon)(button.createSpan({ cls: "simple-sync-page-link__chevron" }), "chevron-right");
      button.addEventListener("click", () => {
        this.desktopPage = entry.page;
        this.display();
      });
    }
  }
  displayDevicePreview(containerEl, title, description, backPage = "root") {
    const header = containerEl.createDiv({ cls: "simple-sync-page-header" });
    header.createEl("h2", { text: title, cls: "simple-sync-page-title" });
    const back = header.createEl("button", { cls: "clickable-icon simple-sync-page-back", attr: { type: "button", "aria-label": "\u8FD4\u56DE\u8BBE\u5907\u540C\u6B65" } });
    (0, import_obsidian3.setIcon)(back, "arrow-left");
    back.addEventListener("click", () => {
      this.desktopPage = backPage;
      this.display();
    });
    containerEl.createEl("p", { text: description, cls: "simple-sync-section-desc" });
  }
  displayServerPreview(containerEl) {
    this.displayDevicePreview(containerEl, "\u670D\u52A1\u5668\u7AEF\u540C\u6B65", "Linux \u670D\u52A1\u5668\u7AEF\u7684\u540C\u6B65\u8BBE\u7F6E\u5C06\u5728\u8FD9\u91CC\u8865\u5145\u3002");
    containerEl.createEl("h3", { text: "\u5F85\u66F4\u65B0", cls: "simple-sync-section-title" });
    const todo = containerEl.createEl("ul");
    todo.createEl("li", { text: "\u672C\u5730 Git \u5386\u53F2\u7626\u8EAB\uFF1A\u4EC5\u6574\u7406\u670D\u52A1\u5668\u672C\u673A\u7684\u65E7\u5386\u53F2\uFF0C\u4FDD\u7559 GitHub \u4E0A\u7684\u5B8C\u6574\u5386\u53F2\uFF1B\u6267\u884C\u524D\u786E\u8BA4\u672C\u5730\u63D0\u4EA4\u5DF2\u4E0A\u4F20\u3002" });
    todo.createEl("li", { text: "\u6309 .gitignore \u91CD\u5EFA\u8FFD\u8E2A\uFF1A\u8BA9\u5DF2\u8FFD\u8E2A\u3001\u540E\u6765\u88AB\u5FFD\u7565\u7684\u6587\u4EF6\u9000\u51FA Git \u7D22\u5F15\uFF0C\u4FDD\u7559\u670D\u52A1\u5668\u672C\u673A\u6587\u4EF6\uFF1B\u4E0D\u6539\u53D8\u624B\u673A\u7AEF\u7684\u6587\u4EF6\u62C9\u53D6\u8BBE\u7F6E\u3002" });
    todo.createEl("li", { text: "\u7535\u8111\u7AEF\u548C\u624B\u673A\u7AEF\u540C\u6B65\u9875\u5F85\u589E\u52A0\u300C\u9AD8\u7EA7\u8BBE\u7F6E\u300D\uFF1A\u9876\u90E8\u653E\u4FBF\u6377\u5F00\u5173\uFF0C\u4E0B\u9762\u5148\u653E\u300C\u91CD\u5EFA\u8FFD\u8E2A\u300D\uFF0C\u6700\u540E\u653E\u300C\u9884\u89C8\u5F53\u524D\u7684\u300D\uFF1B\u5177\u4F53\u8FFD\u8E2A\u8303\u56F4\u5F85\u786E\u8BA4\u3002" });
    todo.createEl("li", { text: "\u5F85\u51B3\u5B9A .obsidian \u76EE\u5F55\u7684\u7B56\u7565\uFF1A\u6574\u76EE\u5F55\u9000\u51FA Git \u8FFD\u8E2A\uFF0C\u6216\u6309\u6838\u5FC3\u914D\u7F6E\u3001\u63D2\u4EF6\u3001\u4E3B\u9898\u5206\u7C7B\u4FDD\u7559\uFF1B\u6BCF\u53F0\u8BBE\u5907\u7684\u4E0B\u8F7D\u8303\u56F4\u53E6\u884C\u8BBE\u7F6E\u3002" });
    todo.createEl("li", { text: "\u7EF4\u62A4\u4EFB\u52A1\u4E0E\u540C\u6B65\u64CD\u4F5C\u9519\u5F00\u6267\u884C\uFF0C\u5E76\u5C55\u793A\u68C0\u67E5\u7ED3\u679C\u3001\u6267\u884C\u8BB0\u5F55\u548C\u64CD\u4F5C\u524D\u540E\u7684\u7A7A\u95F4\u5360\u7528\u3002" });
  }
  displayMobilePreview(containerEl) {
    this.displayDevicePreview(containerEl, "\u624B\u673A\u7AEF\u540C\u6B65", "Android / iOS \u8F7B\u91CF\u7248 Git \u540C\u6B65\u8BBE\u7F6E\u5C06\u5728\u8FD9\u91CC\u8865\u5145\u3002");
    for (const guide of [
      { page: "android-guide", title: "\u4ECE\u96F6\u5F00\u59CB\u7684 Git \u540C\u6B65\u4F7F\u7528\u6307\u5357\uFF08Android\uFF09" },
      { page: "ios-guide", title: "\u4ECE\u96F6\u5F00\u59CB\u7684 Git \u540C\u6B65\u4F7F\u7528\u6307\u5357\uFF08iOS\uFF09" }
    ]) {
      const button = containerEl.createEl("button", { cls: "simple-sync-page-link simple-sync-device-link is-preview", attr: { type: "button" } });
      (0, import_obsidian3.setIcon)(button.createSpan({ cls: "simple-sync-page-link__icon" }), "book-open");
      const copy = button.createSpan({ cls: "simple-sync-page-link__copy" });
      copy.createSpan({ text: guide.title, cls: "simple-sync-page-link__title" });
      copy.createSpan({ text: "\u5F85\u8865\u5145", cls: "simple-sync-page-link__desc" });
      (0, import_obsidian3.setIcon)(button.createSpan({ cls: "simple-sync-page-link__chevron" }), "chevron-right");
      button.addEventListener("click", () => {
        this.desktopPage = guide.page;
        this.display();
      });
    }
  }
  addSetupEntry(parent) {
    const button = parent.createEl("button", { cls: "simple-sync-page-link", attr: { type: "button" } });
    (0, import_obsidian3.setIcon)(button.createSpan({ cls: "simple-sync-page-link__icon" }), "book-open");
    const copy = button.createSpan({ cls: "simple-sync-page-link__copy" });
    copy.createSpan({ text: "\u4ECE\u96F6\u5F00\u59CB\u7684 Git \u540C\u6B65\u4F7F\u7528\u6307\u5357\uFF08\u7535\u8111\u7AEF\uFF09", cls: "simple-sync-page-link__title" });
    copy.createSpan({ text: this.plugin.settings.setupComplete ? "\u5DF2\u5B8C\u6210\u63A5\u5165 \xB7 \u53EF\u91CD\u65B0\u67E5\u770B\u6B65\u9AA4" : "\u6309\u6B65\u9AA4\u521B\u5EFA\u79C1\u4EBA\u4ED3\u5E93\u3001\u6388\u6743\u3001\u68C0\u67E5\u4E24\u7AEF\u6587\u4EF6\u5E76\u9996\u6B21\u540C\u6B65", cls: "simple-sync-page-link__desc" });
    (0, import_obsidian3.setIcon)(button.createSpan({ cls: "simple-sync-page-link__chevron" }), "chevron-right");
    button.addEventListener("click", () => {
      this.desktopPage = "setup";
      this.setupViewStep = this.plugin.settings.setupStep;
      this.setupRepoInput = this.plugin.settings.setupRepoUrl || this.plugin.settings.gitRemoteUrl;
      this.display();
    });
  }
  setupLink(parent, label, href) {
    parent.createEl("a", { text: label, href, attr: { target: "_blank", rel: "noopener noreferrer" } });
  }
  async runSetup(action, success, progress = "\u6B63\u5728\u5904\u7406\uFF0C\u8BF7\u7A0D\u5019\u2026") {
    if (this.setupBusy) return;
    this.setupBusy = true;
    this.setupMessage = progress;
    this.display();
    try {
      await action();
      this.setupMessage = typeof success === "function" ? success() : success;
      this.setupViewStep = this.plugin.settings.setupStep;
    } catch (error) {
      this.setupMessage = this.refreshingSetupDeviceCode ? "\u6B63\u5728\u5237\u65B0\u8BBE\u5907\u7801\u2026" : explainSetupError(error);
      if (!this.refreshingSetupDeviceCode) new import_obsidian3.Notice(`Simple Sync\uFF1A${this.setupMessage}`, 1e4);
    } finally {
      this.setupBusy = false;
      this.setupLoginCancel = void 0;
      if (this.plugin.settings.setupStep > 3 && this.setupDeviceTimer !== void 0) {
        window.clearInterval(this.setupDeviceTimer);
        this.setupDeviceTimer = void 0;
      }
      this.display();
    }
  }
  startBrowserLogin() {
    this.setupDeviceCode = "";
    this.setupDeviceExpiresAt = 0;
    this.setupDeviceCountdown = void 0;
    if (this.setupDeviceTimer !== void 0) window.clearInterval(this.setupDeviceTimer);
    this.setupMessage = "\u6B63\u5728\u542F\u52A8 GitHub \u8BBE\u5907\u6388\u6743\u2026";
    this.setupLoginTask = this.runSetup(() => this.plugin.authorizeSetup((code) => {
      this.setupDeviceCode = code;
      this.setupDeviceExpiresAt = Date.now() + 15 * 60 * 1e3;
      this.setupMessage = "\u8BBE\u5907\u7801\u5DF2\u590D\u5236\u3002\u8BF7\u5728 GitHub \u9875\u9762\u8F93\u5165\u4E0B\u65B9\u8BBE\u5907\u7801\uFF1B\u5B8C\u6210\u6388\u6743\u540E\u4F1A\u81EA\u52A8\u68C0\u67E5\u767B\u5F55\u72B6\u6001\u3002";
      this.setupDeviceTimer = window.setInterval(() => this.updateDeviceCountdown(), 1e3);
      this.display();
    }, (cancel) => {
      this.setupLoginCancel = cancel;
      this.display();
    }), "GitHub \u6388\u6743\u5B8C\u6210\uFF0C\u767B\u5F55\u72B6\u6001\u5DF2\u81EA\u52A8\u6838\u9A8C\u3002");
  }
  async refreshBrowserDeviceCode() {
    if (this.setupBusy && this.setupLoginCancel) {
      this.refreshingSetupDeviceCode = true;
      const task = this.setupLoginTask;
      this.setupLoginCancel();
      if (task) await task;
      this.refreshingSetupDeviceCode = false;
    }
    this.startBrowserLogin();
  }
  updateDeviceCountdown() {
    if (!this.setupDeviceCountdown) return;
    const remaining = Math.max(0, Math.ceil((this.setupDeviceExpiresAt - Date.now()) / 1e3));
    const minutes = Math.floor(remaining / 60);
    const seconds = remaining % 60;
    this.setupDeviceCountdown.setText(remaining ? `\u8BBE\u5907\u7801\u6709\u6548\u671F\uFF1A${minutes}:${String(seconds).padStart(2, "0")}` : "\u8BBE\u5907\u7801\u5DF2\u8FC7\u671F\uFF0C\u8BF7\u5237\u65B0\u540E\u91CD\u65B0\u586B\u5199\u3002");
  }
  displaySetup(containerEl) {
    const header = containerEl.createDiv({ cls: "simple-sync-page-header" });
    header.createEl("h2", { text: "\u4ECE\u96F6\u5F00\u59CB\u7684 Git \u540C\u6B65\u4F7F\u7528\u6307\u5357\uFF08\u7535\u8111\u7AEF\uFF09", cls: "simple-sync-page-title" });
    const back = header.createEl("button", { cls: "clickable-icon simple-sync-page-back", attr: { type: "button", "aria-label": "\u8FD4\u56DE\u8BBE\u7F6E" } });
    (0, import_obsidian3.setIcon)(back, "arrow-left");
    back.addEventListener("click", () => {
      this.desktopPage = "root";
      this.display();
    });
    containerEl.createEl("p", { text: "\u6309\u987A\u5E8F\u5B8C\u6210\u516D\u6B65\u3002\u5DF2\u5B8C\u6210\u6B65\u9AA4\u4EE5\u7EFF\u8272\u7EBF\u6761\u548C\u5BF9\u52FE\u6807\u8BB0\uFF0C\u53EF\u8FD4\u56DE\u67E5\u770B\u3002", cls: "simple-sync-section-desc" });
    const guidedDone = this.plugin.settings.setupComplete && !!this.plugin.settings.setupVerified;
    if (guidedDone) containerEl.createEl("p", { text: "\u2713 \u5DF2\u5B8C\u6210\u9996\u6B21\u63A5\u5165\uFF0C\u81EA\u52A8\u540C\u6B65\u5DF2\u542F\u7528\u3002", cls: "simple-sync-setup-done" });
    if (this.plugin.settings.setupComplete && !guidedDone) {
      containerEl.createEl("p", { text: "\u68C0\u6D4B\u5230\u65E7\u7248\u5DF2\u914D\u7F6E\u7684\u540C\u6B65\u8FDE\u63A5\uFF0C\u81EA\u52A8\u540C\u6B65\u7EE7\u7EED\u8FD0\u884C\uFF1B\u5C1A\u672A\u7ECF\u8FC7\u6B64\u5411\u5BFC\u7684\u79C1\u4EBA\u4ED3\u5E93\u6838\u9A8C\u3002", cls: "simple-sync-section-desc" });
      new import_obsidian3.Setting(containerEl).addButton((button) => button.setButtonText("\u4ECE\u7B2C\u4E00\u6B65\u91CD\u65B0\u68C0\u67E5\u63A5\u5165").onClick(() => void this.runSetup(() => this.plugin.beginSetup(), "\u5DF2\u6682\u505C\u81EA\u52A8 Git \u64CD\u4F5C\uFF0C\u8BF7\u4ECE\u7B2C 1 \u6B65\u5F00\u59CB\u3002")));
    }
    if (guidedDone) new import_obsidian3.Setting(containerEl).setDesc("\u91CD\u65B0\u8FD0\u884C\u5F15\u5BFC\uFF0C\u53EF\u6838\u5BF9\u5E76\u4FEE\u590D\u5DF2\u5FFD\u7565\u6587\u4EF6\u7684 Git \u8FFD\u8E2A\uFF1B\u8FDB\u5165\u540E\u81EA\u52A8\u540C\u6B65\u4F1A\u6682\u505C\uFF0C\u5B8C\u6210\u6216\u53D6\u6D88\u5411\u5BFC\u540E\u6062\u590D\u3002").addButton((button) => button.setButtonText("\u91CD\u65B0\u68C0\u67E5\u6216\u4FEE\u590D\u63A5\u5165").onClick(() => void this.runSetup(() => this.plugin.beginSetup(), "\u5DF2\u6682\u505C\u81EA\u52A8 Git \u64CD\u4F5C\uFF0C\u8BF7\u4ECE\u7B2C 1 \u6B65\u5F00\u59CB\u3002")));
    if (!this.plugin.settings.setupComplete && this.plugin.settings.setupBackup && !this.plugin.settings.setupMutationStarted) {
      new import_obsidian3.Setting(containerEl).setDesc("\u9000\u51FA\u5411\u5BFC\u5E76\u6062\u590D\u4E4B\u524D\u5DF2\u914D\u7F6E\u7684\u81EA\u52A8\u540C\u6B65\u3002").addButton((button) => button.setButtonText("\u53D6\u6D88\u5411\u5BFC\uFF0C\u6062\u590D\u65E7\u540C\u6B65").onClick(() => void this.runSetup(() => this.plugin.cancelSetup(), "\u5DF2\u6062\u590D\u4E4B\u524D\u7684\u540C\u6B65\u914D\u7F6E\u3002")));
    }
    if (!this.plugin.settings.setupComplete && this.plugin.settings.setupMutationStarted) {
      containerEl.createEl("p", { text: "\u9996\u6B21\u63A5\u5165\u5DF2\u5F00\u59CB\u4FEE\u6539\u672C\u5730 Git \u72B6\u6001\u3002\u82E5\u4E2D\u9014\u5931\u8D25\uFF0C\u81EA\u52A8\u540C\u6B65\u4FDD\u6301\u6682\u505C\uFF1B\u91CD\u65B0\u68C0\u67E5\u7B2C 5 \u6B65\u5E76\u5B8C\u6210\u63A5\u5165\u3002", cls: "simple-sync-section-desc" });
    }
    const steps = ["\u521B\u5EFA\u79C1\u4EBA\u4ED3\u5E93", "\u68C0\u67E5 Git \u5B89\u88C5", "\u6388\u6743 GitHub", "\u586B\u5199\u5E76\u6838\u9A8C\u4ED3\u5E93", "\u68C0\u67E5\u672C\u5730\u4E0E\u8FDC\u7AEF", "\u5B8C\u6210\u63A5\u5165"];
    const nav = containerEl.createDiv({ cls: "simple-sync-setup-nav" });
    steps.forEach((label, index) => {
      const number = index + 1;
      const done = guidedDone || number < this.plugin.settings.setupStep;
      const tab = nav.createEl("button", { text: `${done ? "\u2713" : number}. ${label}`, cls: `simple-sync-setup-nav__step${done ? " is-done" : ""}${this.setupViewStep === number ? " is-active" : ""}`, attr: { type: "button" } });
      tab.disabled = !this.plugin.settings.setupComplete && number > this.plugin.settings.setupStep;
      tab.addEventListener("click", () => {
        this.setupViewStep = number;
        this.setupMessage = "";
        if (number === 5 && !this.plugin.getSetupPreview()) this.setupAutoPreviewStarted = false;
        this.display();
      });
    });
    const body = containerEl.createDiv({ cls: "simple-sync-card simple-sync-setup-body" });
    body.createEl("h3", { text: `${this.setupViewStep}. ${steps[this.setupViewStep - 1]}` });
    if (this.setupViewStep === 1) this.displaySetupIntro(body);
    if (this.setupViewStep === 2) this.displaySetupGit(body);
    if (this.setupViewStep === 3) this.displaySetupAuth(body);
    if (this.setupViewStep === 4) this.displaySetupRepo(body);
    if (this.setupViewStep === 5) this.displaySetupPreview(body);
    if (this.setupViewStep === 6) this.displaySetupFinish(body);
    if (this.setupMessage) body.createEl("p", { text: this.setupMessage, cls: "simple-sync-setup-message" });
  }
  displaySetupIntro(body) {
    body.createEl("p", { text: "\u5F53\u524D\u6D41\u7A0B\u652F\u6301 GitHub\u3002\u8BF7\u5148\u51C6\u5907\u597D\u8D26\u53F7\u5E76\u5B8C\u6210\u540E\u7EED\u6388\u6743\uFF1B\u4E4B\u540E\u53EF\u5728\u5411\u5BFC\u4E2D\u586B\u5199\u5DF2\u6709\u4ED3\u5E93\uFF0C\u6216\u76F4\u63A5\u521B\u5EFA\u65B0\u7684\u79C1\u4EBA\u4ED3\u5E93\u3002" });
    body.createEl("p", { text: "Gitee\uFF08\u5C1A\u672A\u505A\u5B9E\u9645\u517C\u5BB9\uFF09\uFF1A\u76EE\u524D\u4EC5\u663E\u793A\u6B64\u9009\u9879\uFF0C\u4E0D\u4F1A\u8FDB\u5165\u6388\u6743\u6216\u540C\u6B65\u6D41\u7A0B\u3002" });
    new import_obsidian3.Setting(body).setName("\u5E73\u53F0").addDropdown((drop) => drop.addOption("github", "GitHub").addOption("gitee", "Gitee\uFF08\u5C1A\u672A\u505A\u5B9E\u9645\u517C\u5BB9\uFF09").setValue(this.setupPlatform).onChange((value) => {
      this.setupPlatform = value;
      this.setupMessage = value === "gitee" ? "Gitee \u76EE\u524D\u5C1A\u672A\u505A\u5B9E\u9645\u517C\u5BB9\uFF0C\u8BF7\u9009 GitHub \u7EE7\u7EED\u3002" : "";
      this.display();
    }));
    if (!this.plugin.settings.setupComplete && this.plugin.settings.setupStep === 1) {
      new import_obsidian3.Setting(body).addButton((button) => button.setButtonText("\u7EE7\u7EED\u8BBE\u7F6E").setCta().setDisabled(this.setupPlatform !== "github").onClick(() => void this.runSetup(() => this.plugin.confirmSetupIntro(), "\u5DF2\u8BB0\u5F55\u4F60\u7684\u9009\u62E9\u3002\u5B8C\u6210\u6388\u6743\u540E\u53EF\u586B\u5199\u6216\u521B\u5EFA\u79C1\u4EBA\u4ED3\u5E93\u3002")));
    }
  }
  displaySetupGit(body) {
    body.createEl("p", { text: "\u7535\u8111\u7AEF\u540C\u6B65\u5FC5\u987B\u5B89\u88C5 Git\uFF0C\u56E0\u4E3A\u63D2\u4EF6\u4F1A\u8C03\u7528 git \u547D\u4EE4\u6267\u884C Fetch\u3001Merge\u3001Commit \u548C Push\u3002\u8BF7\u68C0\u67E5\u5F53\u524D\u7535\u8111\u662F\u5426\u80FD\u8FD0\u884C Git\u3002" });
    const links = body.createDiv({ cls: "simple-sync-setup-links" });
    this.setupLink(links, "\u5B89\u88C5 Git \u2197", "https://git-scm.com/downloads");
    if (this.plugin.settings.setupGitVersion) {
      body.createEl("p", { text: `\u68C0\u67E5\u7ED3\u679C\uFF1A${this.plugin.settings.setupGitVersion}`, cls: "simple-sync-setup-done" });
    }
    if (!this.plugin.settings.setupComplete && this.plugin.settings.setupStep === 2) {
      new import_obsidian3.Setting(body).addButton((button) => button.setButtonText("\u68C0\u67E5 Git").setCta().setDisabled(this.setupBusy).onClick(() => void this.runSetup(async () => {
        const version = await this.plugin.checkSetupGit();
        this.setupMessage = `\u5DF2\u68C0\u6D4B\u5230 ${version}\u3002\u8BF7\u786E\u8BA4\u6B64\u7535\u8111\u5DF2\u5B89\u88C5 Git\uFF0C\u518D\u7EE7\u7EED\u3002`;
      }, "Git \u68C0\u67E5\u5B8C\u6210\u3002")));
      if (this.plugin.settings.setupGitVersion) {
        new import_obsidian3.Setting(body).addButton((button) => button.setButtonText("\u786E\u8BA4 Git \u5DF2\u5B89\u88C5\uFF0C\u7EE7\u7EED").setCta().setDisabled(this.setupBusy).onClick(() => void this.runSetup(() => this.plugin.confirmSetupGit(), "\u5DF2\u786E\u8BA4 Git \u53EF\u7528\u3002")));
      }
    }
  }
  displaySetupAuth(body) {
    const options = body.createDiv({ cls: "simple-sync-auth-options" });
    const addOption = (label, method) => {
      const button = options.createEl("button", { text: label, cls: "simple-sync-auth-option", attr: { type: "button" } });
      button.addEventListener("click", () => {
        this.setupAuthMethod = method;
        this.setupMessage = "";
        this.setupAuthorizationStatus = void 0;
        this.display();
        if (method === "gh-cli" && !this.plugin.settings.setupComplete && this.plugin.settings.setupStep === 3) this.startBrowserLogin();
        if (method === "check") void this.runSetup(async () => {
          this.setupAuthorizationStatus = await this.plugin.inspectSetupAuthorization();
        }, "\u767B\u5F55\u72B6\u6001\u68C0\u67E5\u5B8C\u6210\u3002").then(() => {
          this.setupMessage = "";
          this.display();
        });
      });
      return button;
    };
    if (!this.setupAuthMethod) {
      body.createEl("p", { text: "\u9009\u62E9\u4E00\u79CD\u65B9\u5F0F\uFF0C\u8BA9 Git \u53EF\u4EE5\u8BBF\u95EE\u4F60\u7684 GitHub \u79C1\u4EBA\u4ED3\u5E93\u3002" });
      addOption("\u6D4F\u89C8\u5668\u767B\u5F55", "gh-cli");
      addOption("\u7C98\u8D34 Token", "token");
      addOption("\u6211\u5DF2\u6388\u6743\uFF0C\u68C0\u67E5\u5F53\u524D\u767B\u5F55\u72B6\u6001", "check");
      return;
    }
    const back = body.createEl("button", { text: "\u66F4\u6362\u6388\u6743\u65B9\u5F0F", cls: "simple-sync-auth-back", attr: { type: "button" } });
    back.disabled = this.setupBusy;
    back.addEventListener("click", () => {
      if (this.setupBusy && this.setupLoginCancel) this.setupLoginCancel();
      this.setupAuthMethod = void 0;
      this.setupDeviceCode = "";
      this.setupAuthorizationStatus = void 0;
      this.setupMessage = "";
      this.display();
    });
    if (this.setupAuthMethod === "check") {
      body.createEl("p", { text: "\u68C0\u67E5\u6B64\u7535\u8111\u4E0A GitHub CLI \u7684\u5F53\u524D\u767B\u5F55\u72B6\u6001\u3002\u82E5\u5DF2\u767B\u5F55\uFF0C\u4F1A\u914D\u7F6E Git \u4F7F\u7528\u8BE5\u51ED\u636E\uFF1B\u68C0\u67E5\u4E0D\u4F1A\u66F4\u6539\u4ED3\u5E93\u5185\u5BB9\u3002" });
      if (this.setupBusy) {
        body.createEl("p", { text: "\u6B63\u5728\u68C0\u67E5 GitHub CLI \u767B\u5F55\u72B6\u6001\u2026", cls: "simple-sync-section-desc" });
      } else if (this.setupAuthorizationStatus === true) {
        body.createEl("p", { text: "\u2713 \u5DF2\u6388\u6743\uFF1A\u68C0\u6D4B\u5230\u6709\u6548\u7684 GitHub CLI \u767B\u5F55\u3002", cls: "simple-sync-setup-done" });
        new import_obsidian3.Setting(body).addButton((button) => button.setButtonText("\u4F7F\u7528\u6B64\u6388\u6743\u7EE7\u7EED").setCta().onClick(() => void this.runSetup(() => this.plugin.continueWithSetupAuthorization(), "\u5DF2\u786E\u8BA4\u4F7F\u7528\u5F53\u524D GitHub \u6388\u6743\u3002")));
      } else if (this.setupAuthorizationStatus === false) {
        body.createEl("p", { text: "\u672A\u6388\u6743\uFF1A\u5F53\u524D\u7535\u8111\u6CA1\u6709\u53EF\u7528\u7684 GitHub CLI \u767B\u5F55\u3002\u8BF7\u4F7F\u7528\u6D4F\u89C8\u5668\u767B\u5F55\uFF0C\u6216\u9009\u62E9\u7C98\u8D34 Token\u3002", cls: "simple-sync-setup-message" });
      }
      const actions = body.createDiv({ cls: "simple-sync-auth-actions" });
      const check = actions.createEl("button", { text: "\u91CD\u65B0\u68C0\u67E5\u767B\u5F55\u72B6\u6001", cls: "simple-sync-auth-option", attr: { type: "button" } });
      check.disabled = this.setupBusy;
      check.addEventListener("click", () => {
        this.setupAuthorizationStatus = void 0;
        this.setupMessage = "";
        this.display();
        void this.runSetup(async () => {
          this.setupAuthorizationStatus = await this.plugin.inspectSetupAuthorization();
        }, "\u767B\u5F55\u72B6\u6001\u68C0\u67E5\u5B8C\u6210\u3002").then(() => {
          this.setupMessage = "";
          this.display();
        });
      });
      const cli = body.createDiv({ cls: "simple-sync-setup-links" });
      this.setupLink(cli, "GitHub CLI \u4E0B\u8F7D \u2197", "https://cli.github.com/");
      return;
    }
    if (this.setupAuthMethod === "gh-cli") {
      body.createEl("p", { text: "\u5728 GitHub \u8BBE\u5907\u586B\u5199\u9875\u8F93\u5165\u5DF2\u590D\u5236\u7684\u8BBE\u5907\u7801\u3002\u6388\u6743\u5B8C\u6210\u540E\uFF0C\u63D2\u4EF6\u4F1A\u81EA\u52A8\u68C0\u67E5\u767B\u5F55\u72B6\u6001\u5E76\u914D\u7F6E Git\u3002" });
      const links = body.createDiv({ cls: "simple-sync-setup-links" });
      this.setupLink(links, "\u6253\u5F00 GitHub \u8BBE\u5907\u586B\u5199\u9875 \u2197", "https://github.com/login/device");
      if (this.setupDeviceCode) {
        body.createEl("p", { text: `\u8BBE\u5907\u7801\uFF1A${this.setupDeviceCode}`, cls: "simple-sync-device-code" });
        this.setupDeviceCountdown = body.createEl("p", { cls: "simple-sync-device-expiry" });
        this.updateDeviceCountdown();
      } else if (this.setupBusy) {
        body.createEl("p", { text: "\u6B63\u5728\u83B7\u53D6\u8BBE\u5907\u7801\u2026", cls: "simple-sync-section-desc" });
      }
      const actions = body.createDiv({ cls: "simple-sync-auth-actions" });
      const refresh = actions.createEl("button", { text: this.setupDeviceCode ? "\u5237\u65B0\u8BBE\u5907\u7801" : "\u91CD\u65B0\u5F00\u59CB\u6388\u6743", cls: "simple-sync-auth-option", attr: { type: "button" } });
      refresh.disabled = this.setupBusy && !this.setupLoginCancel;
      refresh.addEventListener("click", () => void this.refreshBrowserDeviceCode());
      if (!this.setupBusy && !this.setupDeviceCode) {
        const start = actions.createEl("button", { text: "\u5F00\u59CB\u6D4F\u89C8\u5668\u767B\u5F55", cls: "simple-sync-auth-option mod-cta", attr: { type: "button" } });
        start.addEventListener("click", () => this.startBrowserLogin());
      }
      const cli = body.createDiv({ cls: "simple-sync-setup-links" });
      this.setupLink(cli, "\u5C1A\u672A\u5B89\u88C5 GitHub CLI\uFF1F\u70B9\u51FB\u4E0B\u8F7D \u2197", "https://cli.github.com/");
    } else {
      if (this.setupTokenInput === void 0) this.setupTokenInput = this.plugin.settings.gitAuthMode === "token" ? this.plugin.settings.gitAuthKey : "";
      body.createEl("p", { text: "\u7C98\u8D34 Token \u540E\u70B9\u51FB\u53F3\u4FA7\u201C\u786E\u8BA4 Token\u201D\u3002\u63D2\u4EF6\u4F1A\u5148\u9A8C\u8BC1 Token \u548C\u6240\u5C5E\u8D26\u53F7\uFF1B\u9A8C\u8BC1\u6210\u529F\u540E\u624D\u4F1A\u4FDD\u5B58\u5728\u672C\u673A\u5E76\u7EE7\u7EED\u3002\u4F7F\u7528\u5DF2\u6709\u4ED3\u5E93\u65F6\uFF0Cfine-grained Token \u53EA\u9700\u9009\u8BE5\u4ED3\u5E93\u5E76\u6388\u4E88 Contents \u8BFB\u5199\u6743\u9650\uFF1B\u82E5\u8981\u5728\u5411\u5BFC\u4E2D\u521B\u5EFA\u4ED3\u5E93\uFF0C\u8FD8\u9700 Administration \u5199\u5165\u6743\u9650\u3002" });
      const links = body.createDiv({ cls: "simple-sync-setup-links" });
      this.setupLink(links, "\u6253\u5F00 GitHub Token \u521B\u5EFA\u8BF4\u660E \u2197", "https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens");
      let confirmTokenButton;
      const tokenSetting = new import_obsidian3.Setting(body).setName("GitHub Token").addText((text) => {
        text.inputEl.type = "password";
        text.inputEl.addClass("simple-sync-wide-input");
        this.setupTokenInputEl = text.inputEl;
        text.inputEl.type = this.setupTokenVisible ? "text" : "password";
        text.setPlaceholder("\u7C98\u8D34 fine-grained Token");
        text.setValue(this.setupTokenInput ?? "").onChange((value) => {
          this.setupTokenInput = value;
          if (confirmTokenButton) confirmTokenButton.disabled = this.setupBusy || !value.trim();
        });
      });
      if (!this.plugin.settings.setupComplete && this.plugin.settings.setupStep === 3) {
        tokenSetting.addButton((button) => button.setButtonText(this.setupTokenVisible ? "\u9690\u85CF" : "\u663E\u793A").setTooltip("\u5207\u6362 Token \u53EF\u89C1\u6027").onClick(() => {
          this.setupTokenVisible = !this.setupTokenVisible;
          if (this.setupTokenInputEl) this.setupTokenInputEl.type = this.setupTokenVisible ? "text" : "password";
          button.setButtonText(this.setupTokenVisible ? "\u9690\u85CF" : "\u663E\u793A");
        }));
        tokenSetting.addButton((button) => {
          button.setButtonText("\u786E\u8BA4 Token").setCta().setDisabled(this.setupBusy || !this.setupTokenInput?.trim());
          confirmTokenButton = button.buttonEl;
          button.onClick(() => {
            let login = "";
            void this.runSetup(async () => {
              login = await this.plugin.saveSetupToken(this.setupTokenInput ?? "");
            }, () => `Token \u6709\u6548\uFF0C\u5DF2\u9A8C\u8BC1\u8D26\u53F7 @${login}\u3002\u51ED\u636E\u5DF2\u4FDD\u5B58\u5728\u672C\u673A\uFF1B\u4E0B\u4E00\u6B65\u4F1A\u68C0\u67E5\u8BE5\u8D26\u53F7\u5BF9\u79C1\u4EBA\u4ED3\u5E93\u7684\u8BFB\u5199\u6743\u9650\u3002`);
          });
        });
      }
    }
  }
  displaySetupRepo(body) {
    const modes = body.createDiv({ cls: "simple-sync-repo-modes" });
    const existing = modes.createEl("button", { text: "\u4F7F\u7528\u5DF2\u6709 GitHub \u4ED3\u5E93", cls: "simple-sync-auth-option", attr: { type: "button" } });
    const create = modes.createEl("button", { text: "\u65B0\u5EFA GitHub \u79C1\u4EBA\u4ED3\u5E93", cls: "simple-sync-auth-option", attr: { type: "button" } });
    existing.toggleClass("is-selected", this.setupRepoMode === "existing");
    create.toggleClass("is-selected", this.setupRepoMode === "create");
    existing.addEventListener("click", () => {
      this.setupRepoMode = "existing";
      this.setupMessage = "";
      this.display();
    });
    create.addEventListener("click", () => {
      this.setupRepoMode = "create";
      this.setupMessage = "";
      this.display();
    });
    if (this.setupRepoMode === "existing") {
      body.createEl("h4", { text: "\u6838\u9A8C\u5DF2\u6709\u4ED3\u5E93" });
      body.createEl("p", { text: "\u586B\u5199\u4ED3\u5E93 HTTPS \u5730\u5740\uFF0C\u70B9\u51FB\u8F93\u5165\u6846\u53F3\u4FA7\u7684 \u2713 \u540E\u81EA\u52A8\u68C0\u67E5\u79C1\u4EBA\u5C5E\u6027\u548C\u5F53\u524D\u8D26\u53F7\u7684\u5199\u5165\u6743\u9650\u3002" });
      let verifyButton;
      const row = new import_obsidian3.Setting(body).setName("GitHub \u4ED3\u5E93\u5730\u5740").addText((text) => {
        text.inputEl.addClass("simple-sync-wide-input");
        text.setPlaceholder("https://github.com/user/vault.git").setValue(this.setupRepoInput).onChange((value) => {
          this.setupRepoInput = value.trim();
          if (verifyButton) verifyButton.disabled = this.setupBusy || !this.setupRepoInput;
        });
      });
      if (!this.plugin.settings.setupComplete && this.plugin.settings.setupStep >= 4) {
        row.addButton((button) => {
          button.setButtonText("\u2713").setTooltip("\u6838\u9A8C\u79C1\u4EBA\u4ED3\u5E93").setDisabled(this.setupBusy || !this.setupRepoInput);
          button.buttonEl.addClass("simple-sync-confirm-check");
          verifyButton = button.buttonEl;
          button.onClick(() => {
            this.setupAutoPreviewStarted = false;
            void this.runSetup(() => this.plugin.verifySetupRepository(this.setupRepoInput), "\u5DF2\u6838\u9A8C\uFF1A\u79C1\u4EBA\u4ED3\u5E93\uFF0C\u5F53\u524D\u8D26\u53F7\u6709\u5199\u5165\u6743\u9650\u3002");
          });
        });
      }
      body.createEl("p", { text: "\u652F\u6301 HTTPS \u5730\u5740\u3002\u4ED3\u5E93\u540D\u4E0D\u80FD\u5305\u542B\u7A7A\u683C\u6216 \u2713\uFF1B\u6709\u6548\u89C4\u5219\uFF1A\u6700\u591A 100 \u4E2A\u5B57\u7B26\uFF0C\u9650\u82F1\u6587\u5B57\u6BCD\u3001\u6570\u5B57\u3001\u70B9\u3001\u8FDE\u5B57\u7B26\u548C\u4E0B\u5212\u7EBF\u3002", cls: "simple-sync-section-desc" });
    } else {
      body.createEl("h4", { text: "\u65B0\u5EFA\u79C1\u4EBA\u4ED3\u5E93" });
      body.createEl("p", { text: "\u586B\u5199\u540D\u79F0\u5E76\u70B9\u51FB\u53F3\u4FA7 \u2713\uFF0C\u63D2\u4EF6\u4F1A\u5728\u5F53\u524D\u6388\u6743\u7684 GitHub \u8D26\u53F7\u4E0B\u521B\u5EFA Private \u4ED3\u5E93\uFF0C\u7136\u540E\u81EA\u52A8\u6838\u9A8C\u3002" });
      if (this.plugin.settings.gitAuthMode === "token") {
        body.createEl("p", { text: "\u4F7F\u7528 Token \u521B\u5EFA\u4ED3\u5E93\u9700\u8981 fine-grained Token \u7684 Administration \u4ED3\u5E93\u6743\u9650\uFF08write\uFF09\u3002", cls: "simple-sync-section-desc" });
      }
      let createButton;
      const row = new import_obsidian3.Setting(body).setName("\u4ED3\u5E93\u540D\u79F0").addText((text) => {
        text.inputEl.addClass("simple-sync-wide-input");
        text.setPlaceholder("\u4F8B\u5982\uFF1Amy-obsidian-vault").setValue(this.setupRepoNameInput).onChange((value) => {
          this.setupRepoNameInput = value;
          if (createButton) createButton.disabled = this.setupBusy || !value.trim();
        });
      });
      if (!this.plugin.settings.setupComplete && this.plugin.settings.setupStep >= 4) {
        row.addButton((button) => {
          button.setButtonText("\u2713").setTooltip("\u521B\u5EFA\u79C1\u4EBA\u4ED3\u5E93\u5E76\u6838\u9A8C").setDisabled(this.setupBusy || !this.setupRepoNameInput.trim());
          button.buttonEl.addClass("simple-sync-confirm-check");
          createButton = button.buttonEl;
          button.onClick(() => void this.runSetup(async () => {
            this.setupAutoPreviewStarted = false;
            this.setupRepoInput = await this.plugin.createSetupRepository(this.setupRepoNameInput);
            this.setupRepoMode = "existing";
          }, "\u79C1\u4EBA\u4ED3\u5E93\u5DF2\u521B\u5EFA\u5E76\u6838\u9A8C\u3002"));
        });
      }
      body.createEl("p", { text: "\u540D\u79F0\u6700\u591A 100 \u4E2A\u5B57\u7B26\uFF0C\u53EA\u80FD\u5305\u542B\u82F1\u6587\u5B57\u6BCD\u3001\u6570\u5B57\u3001\u70B9\uFF08.\uFF09\u3001\u8FDE\u5B57\u7B26\uFF08-\uFF09\u548C\u4E0B\u5212\u7EBF\uFF08_\uFF09\uFF1B\u7A7A\u683C\u4E0E \u2713 \u5747\u4E0D\u5141\u8BB8\u3002\u70B9\u51FB \u2713 \u4F1A\u7ACB\u5373\u521B\u5EFA\u79C1\u4EBA\u4ED3\u5E93\u3002", cls: "simple-sync-section-desc" });
    }
    if (this.plugin.settings.setupVerified) body.createEl("p", { text: `\u5DF2\u6838\u9A8C\uFF1A${this.plugin.settings.setupVerified.url} \xB7 \u5206\u652F ${this.plugin.settings.setupVerified.branch}`, cls: "simple-sync-setup-done" });
  }
  displaySetupPreview(body) {
    body.createEl("p", { text: `\u5F53\u524D Vault\uFF1A${this.plugin.getVaultBasePath()}` });
    if (this.plugin.settings.setupComplete && !this.plugin.settings.setupVerified) {
      body.createEl("p", { text: "\u5F53\u524D\u8FDE\u63A5\u6765\u81EA\u65E7\u7248\u8BBE\u7F6E\uFF0C\u5C1A\u672A\u7ECF\u8FC7\u6B64\u5411\u5BFC\u6838\u9A8C\u3002\u4F7F\u7528\u4E0A\u65B9\u300C\u4ECE\u7B2C\u4E00\u6B65\u91CD\u65B0\u68C0\u67E5\u63A5\u5165\u300D\u540E\u53EF\u67E5\u770B\u4E24\u7AEF\u6587\u4EF6\u3002" });
    }
    if (this.plugin.settings.setupComplete && this.plugin.settings.setupStep >= 5 && (this.plugin.settings.setupVerified || this.plugin.settings.setupRepoUrl)) {
      new import_obsidian3.Setting(body).addButton((button) => button.setButtonText(!this.plugin.settings.setupVerified ? "\u91CD\u65B0\u6838\u9A8C\u4ED3\u5E93\u5E76\u68C0\u67E5\u4E24\u7AEF" : this.plugin.settings.setupComplete ? "\u91CD\u65B0\u8BFB\u53D6\u4E24\u7AEF\u72B6\u6001" : "\u68C0\u67E5\u4E24\u7AEF\u6587\u4EF6").setCta().setDisabled(this.setupBusy).onClick(() => void this.runSetup(async () => {
        this.setupOverlapContent = void 0;
        this.setupRebuildConfirmed = false;
        await this.plugin.inspectSetupRepository();
      }, this.plugin.settings.setupComplete ? "\u5DF2\u91CD\u65B0\u8BFB\u53D6\u4E24\u7AEF\u72B6\u6001\u3002" : "\u68C0\u67E5\u5B8C\u6210\u3002\u8BF7\u9009\u62E9\u540C\u540D\u6587\u4EF6\u7684\u4FDD\u7559\u7248\u672C\uFF0C\u518D\u786E\u8BA4\u6B64\u6B65\u3002")));
    }
    const preview = this.plugin.getSetupPreview();
    if (!preview && !this.plugin.settings.setupComplete && this.plugin.settings.setupStep >= 5 && this.plugin.settings.setupVerified && !this.setupBusy && !this.setupAutoPreviewStarted) {
      this.setupAutoPreviewStarted = true;
      window.setTimeout(() => void this.runSetup(async () => {
        this.setupOverlapContent = void 0;
        this.setupRebuildConfirmed = false;
        await this.plugin.inspectSetupRepository();
      }, "\u68C0\u67E5\u5B8C\u6210\u3002\u8BF7\u9009\u62E9\u540C\u540D\u6587\u4EF6\u7684\u4FDD\u7559\u7248\u672C\uFF0C\u518D\u786E\u8BA4\u6B64\u6B65\u3002", "\u6B63\u5728\u68C0\u67E5\u672C\u5730\u4E0E\u8FDC\u7AEF\u6587\u4EF6\u2026"), 0);
    }
    if (preview) {
      if (preview.alreadyLinked) body.createEl("p", { text: "\u5F53\u524D Git \u5386\u53F2\u5DF2\u5305\u542B\u8FDC\u7AEF\u63D0\u4EA4\u3002\u63A5\u5165\u65F6\u53EA\u8865\u5145\u5FFD\u7565\u89C4\u5219\u5E76\u63A8\u9001\u672C\u673A\u672A\u4E0A\u4F20\u7684\u66F4\u6539\u3002", cls: "simple-sync-setup-done" });
      else if (preview.relatedHistory) body.createEl("p", { text: "\u672C\u673A\u4E0E\u8FDC\u7AEF\u6709\u5171\u540C\u5386\u53F2\uFF0C\u8FDC\u7AEF\u6709\u65B0\u63D0\u4EA4\u3002\u63A5\u5165\u65F6\u4F1A\u6B63\u5E38\u5408\u5E76\uFF1B\u82E5\u53D1\u751F\u51B2\u7A81\u4F1A\u505C\u6B62\u5E76\u63D0\u793A\u5904\u7406\uFF0C\u4E0D\u4F1A\u76F4\u63A5\u8986\u76D6\u540C\u540D\u6587\u4EF6\u3002", cls: "simple-sync-section-desc" });
      body.createEl("p", { text: `\u672C\u5730 ${preview.localFiles.length} \u4E2A\u6587\u4EF6\uFF0C\u8FDC\u7AEF ${preview.remoteFiles.length} \u4E2A\u6587\u4EF6\uFF1B\u4EC5\u672C\u5730 ${preview.localOnly.length}\uFF0C\u4EC5\u8FDC\u7AEF ${preview.remoteOnly.length}\uFF0C\u540C\u540D\u4E14\u5185\u5BB9\u76F8\u540C ${preview.identicalCount}\uFF0C\u9700\u4EBA\u5DE5\u9009\u62E9 ${preview.overlaps.length}\u3002` });
      body.createEl("p", { text: preview.localRoot ? `\u73B0\u6709 Git \u4ED3\u5E93\uFF1A${preview.localRoot}\uFF1B\u672C\u673A\u5206\u652F\uFF1A${preview.localBranch}\uFF1Borigin\uFF1A${preview.origin || "\u672A\u8BBE\u7F6E"}\uFF1B\u9996\u6B21\u63A8\u9001\u76EE\u6807\uFF1A${preview.branch}` : `Vault \u5C1A\u672A\u521D\u59CB\u5316 Git\uFF1B\u5B8C\u6210\u63A5\u5165\u65F6\u4F1A\u5728\u5F53\u524D Vault \u521B\u5EFA ${preview.branch} \u5206\u652F\u3002` });
      if (preview.localRoot && !preview.relatedHistory && preview.localBranch !== preview.branch) {
        body.createEl("p", { text: `\u672C\u673A\u5DF2\u6709\u72EC\u7ACB\u5386\u53F2\uFF0C\u5F53\u524D ${preview.localBranch} \u5206\u652F\u63A5\u5165\u540E\u4F1A\u63A8\u9001\u5230\u8FDC\u7AEF ${preview.branch} \u5206\u652F\u3002\u8BF7\u6838\u5BF9\u8FD9\u662F\u5426\u662F\u8981\u63A5\u5165\u7684\u4ED3\u5E93\u3002`, cls: "simple-sync-section-desc" });
      }
      if (preview.localRoot) {
        const ignoredTrackedCount = preview.trackedExcludedLocal.length + preview.trackedExcludedRemote.length;
        if (ignoredTrackedCount > 0) {
          body.createEl("p", { text: `\u672C\u5730 ${preview.trackedExcludedLocal.length} \u4E2A\u3001\u8FDC\u7AEF ${preview.trackedExcludedRemote.length} \u4E2A\u5DF2\u8DDF\u8E2A\u6587\u4EF6\u7B26\u5408\u5F53\u524D\u6216\u5EFA\u8BAE\u7684 .gitignore \u5FFD\u7565\u89C4\u5219\u3002\u9ED8\u8BA4\u4FDD\u7559\u73B0\u6709\u8FFD\u8E2A\uFF1B\u5982\u8981\u4FEE\u6B63\uFF0C\u53EF\u6309\u6700\u7EC8\u89C4\u5219\u91CD\u5EFA\u6574\u4E2A\u7D22\u5F15\u3002` });
          this.setupFileList(body, "\u672C\u5730\u5DF2\u8DDF\u8E2A\u4F46\u5EFA\u8BAE\u5FFD\u7565", preview.trackedExcludedLocal);
          this.setupFileList(body, "\u8FDC\u7AEF\u5DF2\u8DDF\u8E2A\u4F46\u5EFA\u8BAE\u5FFD\u7565", preview.trackedExcludedRemote);
        } else {
          body.createEl("p", { text: "\u672A\u53D1\u73B0\u5DF2\u8DDF\u8E2A\u4F46\u7B26\u5408\u5FFD\u7565\u89C4\u5219\u7684\u6587\u4EF6\uFF1B\u9ED8\u8BA4\u4FDD\u7559\u73B0\u6709 Git \u8FFD\u8E2A\u3002", cls: "simple-sync-setup-done" });
        }
        if (!this.plugin.settings.setupComplete && ignoredTrackedCount > 0) {
          new import_obsidian3.Setting(body).setName("Git \u8FFD\u8E2A\u65B9\u5F0F").setDesc("\u9ED8\u8BA4\u4FDD\u7559\u73B0\u6709\u8FFD\u8E2A\u3002\u9009\u62E9\u91CD\u5EFA\u4F1A\u6E05\u7A7A\u7D22\u5F15\u5E76\u6309\u6700\u7EC8 .gitignore \u91CD\u65B0\u52A0\u5165\u6587\u4EF6\uFF1B\u88AB\u5FFD\u7565\u7684\u6587\u4EF6\u5C06\u505C\u6B62\u8FFD\u8E2A\uFF0C\u63A8\u9001\u540E\u4ECE\u8FDC\u7AEF\u5F53\u524D\u7248\u672C\u79FB\u9664\u3002").addDropdown((dropdown) => dropdown.addOption("keep", "\u4FDD\u7559\u73B0\u6709 Git \u8FFD\u8E2A\uFF08\u9ED8\u8BA4\uFF09").addOption("rebuild", "\u6309\u6700\u7EC8 .gitignore \u91CD\u5EFA\u8FFD\u8E2A").setValue(this.plugin.getSetupTrackingChoice() || "keep").onChange((value) => {
            this.plugin.setSetupTrackingChoice(value ? value : void 0);
            this.setupRebuildConfirmed = false;
            this.display();
          }));
        }
      }
      this.setupFileList(body, "\u4EC5\u672C\u5730\u6587\u4EF6", preview.localOnly);
      this.setupFileList(body, "\u4EC5\u8FDC\u7AEF\u6587\u4EF6", preview.remoteOnly);
      this.setupFileList(body, "\u540C\u540D\u6587\u4EF6", preview.overlaps);
      if (preview.overlaps.length && !this.plugin.settings.setupComplete) {
        body.createEl("p", { text: "\u6BCF\u4E2A\u540C\u540D\u6587\u4EF6\u90FD\u8981\u660E\u786E\u9009\u62E9\u672C\u673A\u6216\u8FDC\u7AEF\u7248\u672C\u3002" });
        if (preview.overlaps.includes(".gitignore")) {
          body.createEl("p", { text: "\u6CE8\u610F\uFF1A\u82E5\u5BF9 .gitignore \u9009\u62E9\u300C\u91C7\u7528\u8FDC\u7AEF\u300D\uFF0C\u672C\u673A\u81EA\u5B9A\u4E49\u89C4\u5219\u4F1A\u88AB\u8FDC\u7AEF\u6587\u4EF6\u66FF\u6362\u3002\u5EFA\u8BAE\u4FDD\u7559\u672C\u673A\uFF0C\u5E76\u5728\u63A5\u5165\u540E\u624B\u52A8\u6838\u5BF9\u8FDC\u7AEF\u81EA\u5B9A\u4E49\u89C4\u5219\uFF1B\u5411\u5BFC\u53EA\u4F1A\u9010\u6761\u8865\u5145\u5EFA\u8BAE\u89C4\u5219\u3002" });
        }
        const choices = this.plugin.getSetupChoices();
        for (const path of preview.overlaps) {
          new import_obsidian3.Setting(body).setName(path).addDropdown((dropdown) => dropdown.addOption("", "\u8BF7\u9009\u62E9").addOption("local", "\u4FDD\u7559\u672C\u673A").addOption("remote", "\u91C7\u7528\u8FDC\u7AEF").setValue(choices[path] || "").onChange((value) => this.plugin.setSetupChoice(path, value))).addButton((button) => button.setButtonText("\u67E5\u770B\u5185\u5BB9").setDisabled(this.setupBusy).onClick(() => void this.runSetup(async () => {
            this.setupOverlapContent = await this.plugin.readSetupOverlap(path);
          }, `\u5DF2\u8BFB\u53D6 ${path} \u7684\u4E24\u7AEF\u5185\u5BB9\u3002`)));
        }
        if (this.setupOverlapContent && preview.overlaps.includes(this.setupOverlapContent.path)) {
          body.createEl("h4", { text: `\u5185\u5BB9\u5BF9\u7167\uFF1A${this.setupOverlapContent.path}` });
          const comparison = body.createDiv({ cls: "simple-sync-setup-comparison" });
          const local = comparison.createDiv();
          local.createEl("strong", { text: "\u672C\u673A" });
          local.createEl("pre", { text: this.setupOverlapContent.local });
          const remote = comparison.createDiv();
          remote.createEl("strong", { text: "\u8FDC\u7AEF" });
          remote.createEl("pre", { text: this.setupOverlapContent.remote });
        }
      }
      if (!this.plugin.settings.setupComplete) {
        new import_obsidian3.Setting(body).addButton((button) => button.setButtonText("\u786E\u8BA4\u68C0\u67E5\u7ED3\u679C\uFF0C\u8FDB\u5165\u63A5\u5165").setCta().onClick(() => void this.runSetup(() => this.plugin.confirmSetupPreview(), "\u5DF2\u786E\u8BA4\u4E24\u7AEF\u6587\u4EF6\u53CA\u540C\u540D\u6587\u4EF6\u9009\u62E9\u3002")));
      }
    }
  }
  setupFileList(body, title, paths) {
    const details = body.createEl("details", { cls: "simple-sync-setup-files" });
    details.createEl("summary", { text: `${title}\uFF08${paths.length}\uFF09` });
    for (const path of paths.slice(0, 200)) details.createEl("div", { text: path });
    if (paths.length > 200) details.createEl("p", { text: `\u8FD8\u6709 ${paths.length - 200} \u4E2A\u6587\u4EF6\u672A\u5728\u8FD9\u91CC\u5C55\u5F00\u3002` });
  }
  displaySetupFinish(body) {
    const preview = this.plugin.getSetupPreview();
    if (!preview) {
      body.createEl("p", { text: this.plugin.settings.setupComplete && this.plugin.settings.setupVerified ? `\u5DF2\u63A5\u5165 ${this.plugin.settings.setupVerified.url}\u3002\u5982\u9700\u67E5\u770B\u5F53\u524D\u4E24\u7AEF\u6587\u4EF6\uFF0C\u8BF7\u8FD4\u56DE\u7B2C 5 \u6B65\u91CD\u65B0\u8BFB\u53D6\u3002` : this.plugin.settings.setupComplete ? "\u5F53\u524D\u8FDE\u63A5\u6765\u81EA\u65E7\u7248\u8BBE\u7F6E\uFF0C\u5C1A\u672A\u7ECF\u8FC7\u6B64\u5411\u5BFC\uFF1B\u5982\u9700\u68C0\u67E5\u63A5\u5165\uFF0C\u8BF7\u4ECE\u7B2C\u4E00\u6B65\u91CD\u65B0\u5F00\u59CB\u3002" : "\u672C\u6B21\u6253\u5F00\u540E\u5C1A\u65E0\u68C0\u67E5\u7ED3\u679C\uFF0C\u8BF7\u8FD4\u56DE\u7B2C 5 \u6B65\u91CD\u65B0\u68C0\u67E5\u3002" });
      return;
    }
    const remoteIgnoreSelected = this.plugin.getSetupChoices()[".gitignore"] === "remote";
    const ignoreSummary = this.plugin.settings.setupComplete ? remoteIgnoreSelected ? "\u5DF2\u6309\u4F60\u7684\u9009\u62E9\u91C7\u7528\u8FDC\u7AEF .gitignore\uFF0C\u5E76\u9010\u6761\u8865\u5145\u7F3A\u5C11\u7684\u5EFA\u8BAE\u89C4\u5219\u3002" : "\u73B0\u6709\u672C\u673A .gitignore \u89C4\u5219\u5DF2\u4FDD\u7559\u3002" : remoteIgnoreSelected ? "\u4F60\u5DF2\u9009\u62E9\u8FDC\u7AEF .gitignore\uFF1A\u672C\u673A\u81EA\u5B9A\u4E49\u89C4\u5219\u5C06\u88AB\u66FF\u6362\uFF1B\u63A5\u5165\u65F6\u4F1A\u4EE5\u8FDC\u7AEF\u7248\u672C\u4E3A\u57FA\u7840\u91CD\u65B0\u9010\u6761\u68C0\u67E5\u5EFA\u8BAE\u89C4\u5219\u3002" : preview.missingIgnoreRules.length > 0 ? `\u9996\u6B21\u63D0\u4EA4\u524D\u53EA\u8865\u5145 .gitignore \u7F3A\u5C11\u7684 ${preview.missingIgnoreRules.length} \u6761\u89C4\u5219\uFF1B\u5DF2\u6709\u89C4\u5219\u4E0D\u4F1A\u88AB\u8986\u76D6\u3002` : "\u73B0\u6709 .gitignore \u5DF2\u6DB5\u76D6\u5EFA\u8BAE\u89C4\u5219\uFF0C\u4E0D\u4F1A\u8FFD\u52A0\u91CD\u590D\u89C4\u5219\u3002";
    body.createEl("p", { text: `\u5C06\u4FDD\u7559\u672C\u5730 ${preview.localFiles.length} \u4E2A\u6587\u4EF6\uFF0C\u5E76\u63A5\u5165\u8FDC\u7AEF ${preview.remoteFiles.length} \u4E2A\u6587\u4EF6\u3002${ignoreSummary}` });
    if (preview.localRoot) {
      const trackingChoice = this.plugin.getSetupTrackingChoice();
      body.createEl("p", { text: trackingChoice === "rebuild" ? `\u5C06\u53D6\u6D88\u5168\u90E8 Git \u8FFD\u8E2A\u5E76\u6309\u6700\u7EC8 .gitignore \u91CD\u5EFA\u7D22\u5F15\u3002\u672C\u673A\u6587\u4EF6\u4FDD\u7559\uFF1B\u88AB\u5FFD\u7565\u7684\u6587\u4EF6\u4E0D\u4F1A\u91CD\u65B0\u52A0\u5165\uFF0C\u63A8\u9001\u540E\u4ECE\u8FDC\u7AEF\u5F53\u524D\u7248\u672C\u79FB\u9664\uFF0C\u65E7\u63D0\u4EA4\u5386\u53F2\u4ECD\u4FDD\u7559\u3002\u6B63\u5728\u7F16\u8F91\u7684\u63D2\u4EF6\u6539\u52A8\u4F1A\u8DF3\u8FC7\u672C\u6B21\u63D0\u4EA4\u3002` : trackingChoice === "keep" ? "\u4F60\u5DF2\u9009\u62E9\u4FDD\u7559\u73B0\u6709\u8FFD\u8E2A\uFF1B\u5DF2\u8DDF\u8E2A\u7684\u5FFD\u7565\u6587\u4EF6\u4ECD\u4F1A\u7EE7\u7EED\u540C\u6B65\u3002" : preview.trackedExcludedLocal.length || preview.trackedExcludedRemote.length ? "\u8BF7\u8FD4\u56DE\u7B2C 5 \u6B65\uFF0C\u9009\u62E9\u5982\u4F55\u5904\u7406\u5DF2\u8DDF\u8E2A\u7684\u5FFD\u7565\u6587\u4EF6\u3002" : "\u672A\u9009\u62E9\u91CD\u5EFA\uFF1B\u5C06\u4FDD\u7559\u73B0\u6709\u8FFD\u8E2A\u3002\u5982\u9700\u7528\u91CD\u5EFA\u7EA0\u9519\uFF0C\u8BF7\u8FD4\u56DE\u7B2C 5 \u6B65\u9009\u62E9\u3002" });
      if (trackingChoice === "rebuild" && !this.plugin.settings.setupComplete) {
        new import_obsidian3.Setting(body).setName("\u786E\u8BA4\u91CD\u5EFA Git \u8FFD\u8E2A").setDesc("\u6211\u786E\u8BA4\u53D6\u6D88\u5168\u90E8\u8FFD\u8E2A\u5E76\u6309 .gitignore \u91CD\u5EFA\uFF1B\u672C\u673A\u6587\u4EF6\u4FDD\u7559\uFF0C\u88AB\u5FFD\u7565\u6587\u4EF6\u4F1A\u4ECE\u8FDC\u7AEF\u5F53\u524D\u7248\u672C\u79FB\u9664\u3002").addToggle((toggle) => toggle.setValue(this.setupRebuildConfirmed).onChange((value) => {
          this.setupRebuildConfirmed = value;
          this.display();
        }));
      }
    }
    new import_obsidian3.Setting(body).setName("\u63D0\u4EA4\u4F5C\u8005\u540D\u79F0").setDesc("\u663E\u793A\u5728 Git \u63D0\u4EA4\u8BB0\u5F55\u4E2D\uFF0C\u4E0D\u662F\u767B\u5F55\u8D26\u53F7\u3002\u5EFA\u8BAE\u4E3A\u4E0D\u540C\u540C\u6B65\u8BBE\u5907\u8BBE\u7F6E\u4E0D\u540C\u540D\u79F0\uFF0C\u65B9\u4FBF\u533A\u5206\u63D0\u4EA4\u6765\u81EA\u54EA\u53F0\u8BBE\u5907\u3002").addText((text) => text.setValue(this.plugin.settings.gitAuthorName === DEFAULT_GIT_AUTHOR_NAME ? "" : this.plugin.settings.gitAuthorName).onChange(async (value) => {
      this.plugin.settings.gitAuthorName = value.trim();
      await this.plugin.saveSettings();
    }));
    new import_obsidian3.Setting(body).setName("\u63D0\u4EA4\u4F5C\u8005\u90AE\u7BB1").setDesc("\u7528\u4E8E Git \u63D0\u4EA4\u8BB0\u5F55\uFF0C\u4E0D\u662F\u767B\u5F55\u5BC6\u7801\u3002").addText((text) => text.setValue(this.plugin.settings.gitAuthorEmail === DEFAULT_GIT_AUTHOR_EMAIL ? "" : this.plugin.settings.gitAuthorEmail).onChange(async (value) => {
      this.plugin.settings.gitAuthorEmail = value.trim();
      await this.plugin.saveSettings();
    }));
    if (!this.plugin.settings.setupComplete && !remoteIgnoreSelected && preview.missingIgnoreRules.length > 0) {
      const rules = body.createEl("details", { cls: "simple-sync-setup-files" });
      rules.createEl("summary", { text: `\u67E5\u770B\u5C06\u8865\u5145\u7684 ${preview.missingIgnoreRules.length} \u6761 .gitignore \u89C4\u5219` });
      rules.createEl("pre", { text: preview.missingIgnoreRules.join("\n") });
    }
    if (preview.overlaps.length) this.setupFileList(body, "\u5DF2\u9009\u62E9\u8FDC\u7AEF\u7248\u672C\u7684\u540C\u540D\u6587\u4EF6", preview.overlaps.filter((path) => this.plugin.getSetupChoices()[path] === "remote"));
    if (!this.plugin.settings.setupComplete) {
      new import_obsidian3.Setting(body).addButton((button) => button.setButtonText("\u5173\u8054\u5E76\u9996\u6B21\u63A8\u9001").setCta().setDisabled(this.setupBusy || this.plugin.getSetupTrackingChoice() === "rebuild" && !this.setupRebuildConfirmed).onClick(() => void this.runSetup(() => this.plugin.finishSetup(this.setupRebuildConfirmed), "\u9996\u6B21\u63A8\u9001\u6210\u529F\uFF0C\u5411\u5BFC\u5DF2\u5B8C\u6210\u3002", "\u6B63\u5728\u590D\u6838\u4ED3\u5E93\u548C\u6587\u4EF6\u72B6\u6001\uFF0C\u5E76\u5B8C\u6210\u9996\u6B21 Git \u63A8\u9001\u2026")));
    }
  }
  displayDesktopGit(containerEl) {
    const preview = this.currentDevice() !== "git";
    const pageHeader = containerEl.createDiv({ cls: "simple-sync-page-header" });
    pageHeader.createEl("h2", { text: "\u7535\u8111\u7AEF\u540C\u6B65", cls: "simple-sync-page-title" });
    const backButton = pageHeader.createEl("button", {
      cls: "clickable-icon simple-sync-page-back",
      attr: { type: "button", "aria-label": "\u8FD4\u56DE\u8BBE\u5907\u540C\u6B65" }
    });
    (0, import_obsidian3.setIcon)(backButton, "arrow-left");
    backButton.addEventListener("click", () => {
      this.desktopPage = "root";
      this.display();
    });
    containerEl.createEl("p", {
      text: "\u4F7F\u7528\u672C\u673A Git \u4E0E GitHub \u4E0B\u8F7D\u8FDC\u7AEF\u66F4\u65B0\u3001\u5408\u5E76\u7248\u672C\u5E76\u4E0A\u4F20\u672C\u673A\u66F4\u6539\u3002",
      cls: "simple-sync-section-desc"
    });
    if (preview) containerEl.createEl("p", { text: "\u5F53\u524D\u8BBE\u5907\u4EC5\u9884\u89C8\u548C\u7F16\u8F91\u7535\u8111\u7AEF\u8BBE\u7F6E\uFF1B\u540C\u6B65\u4E0E\u6545\u969C\u4FEE\u590D\u8BF7\u5728\u7535\u8111\u7AEF\u6267\u884C\u3002", cls: "simple-sync-section-desc" });
    if (!preview) {
      containerEl.createEl("h3", { text: "\u540C\u6B65\u64CD\u4F5C", cls: "simple-sync-section-title" });
      const syncCard = containerEl.createDiv({ cls: "simple-sync-card" });
      this.addSyncSetting(syncCard);
    }
    containerEl.createEl("h3", { text: "\u8FDE\u63A5", cls: "simple-sync-section-title" });
    const connectionCard = containerEl.createDiv({ cls: "simple-sync-card" });
    new import_obsidian3.Setting(connectionCard).setName("Git \u4ED3\u5E93\u5730\u5740").setDesc("\u586B\u5199\u7528\u4E8E\u4FDD\u5B58\u548C\u540C\u6B65\u7B14\u8BB0\u7684 GitHub \u4ED3\u5E93\u5730\u5740\u3002").addText(
      (text) => text.setPlaceholder("https://github.com/user/vault.git").setValue(this.plugin.settings.gitRemoteUrl).onChange(async (value) => {
        this.plugin.settings.gitRemoteUrl = value.trim();
        await this.plugin.saveSettings();
      })
    );
    const authSetting = new import_obsidian3.Setting(connectionCard).setName("\u8BA4\u8BC1\u65B9\u5F0F").setDesc(
      this.plugin.settings.gitAuthMode === "gh-cli" ? "\u4F7F\u7528\u672C\u673A Git Credential Manager\u3001SSH \u7B49\u5DF2\u6709\u51ED\u636E\u3002" : "Token \u53EA\u4FDD\u5B58\u5728\u672C\u673A\u63D2\u4EF6\u6570\u636E\u4E2D\uFF0C\u5E76\u901A\u8FC7\u5355\u6B21 Git \u8FDB\u7A0B\u4F7F\u7528\u3002"
    ).addDropdown(
      (dropdown) => dropdown.addOption("gh-cli", "\u7CFB\u7EDF Git \u51ED\u636E\uFF08\u63A8\u8350\uFF09").addOption("token", "Author \u8BA4\u8BC1 Key / Token").setValue(this.plugin.settings.gitAuthMode).onChange(async (value) => {
        this.plugin.settings.gitAuthMode = value;
        await this.plugin.saveSettings();
        this.display();
      })
    );
    authSetting.descEl.addClass("simple-sync-auth-note");
    if (this.plugin.settings.gitAuthMode === "token") {
      new import_obsidian3.Setting(connectionCard).setName("Author \u8BA4\u8BC1 Key / GitHub Token").setDesc("\u4E0D\u4F1A\u5199\u5165 Git Remote URL\uFF1B\u901A\u8FC7\u5355\u6B21 Git \u8FDB\u7A0B\u73AF\u5883\u4F20\u5165\u3002").addText((text) => {
        text.inputEl.type = "password";
        text.setValue(this.plugin.settings.gitAuthKey).onChange(async (value) => {
          this.plugin.settings.gitAuthKey = value;
          await this.plugin.saveSettings();
        });
      });
    }
    if (!preview) this.addTestSetting(connectionCard);
    const advanced = containerEl.createEl("details", { cls: "simple-sync-advanced" });
    const summary = advanced.createEl("summary");
    summary.createSpan({ text: "\u9AD8\u7EA7\u8BBE\u7F6E", cls: "simple-sync-advanced__title" });
    summary.createSpan({ text: "\u901A\u5E38\u4E0D\u9700\u8981\u4FEE\u6539", cls: "simple-sync-advanced__desc" });
    const advancedBody = advanced.createDiv({ cls: "simple-sync-card simple-sync-advanced__body" });
    advancedBody.createEl("h4", { text: "\u754C\u9762\u8BBE\u7F6E", cls: "simple-sync-subsection-title" });
    const versionViewSetting = new import_obsidian3.Setting(advancedBody).setName("\u663E\u793A\u5F85 Commit \u5217\u8868").setDesc("\u5728\u540C\u6B65\u6309\u94AE\u65C1\u663E\u793A\u5F85\u4E0A\u4F20\u548C\u5F85 Commit \u5207\u6362\u3002\u5173\u95ED\u65F6\u53EA\u663E\u793A\u5F85\u4E0A\u4F20\u6587\u4EF6\u3002");
    const versionViewIcon = versionViewSetting.nameEl.createSpan({ cls: "simple-sync-setting-mode-icon" });
    versionViewIcon.innerHTML = '<svg viewBox="0 0 32 18" aria-hidden="true"><g><circle cx="7.5" cy="9" r="5.25"/><path d="m4.9 9.1 1.7 1.7 3.5-3.8"/></g><path class="mode-divider" d="M16 3.25v11.5"/><g><path d="M23.75 11.75v-7.5"/><path d="m20.75 7.25 3-3 3 3"/><path d="M19.25 12.75v1.5h9v-1.5"/></g></svg>';
    versionViewSetting.nameEl.prepend(versionViewIcon);
    versionViewSetting.addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.showVersionViewSwitcher).onChange((value) => void this.plugin.setVersionViewSwitcher(value))
    );
    advancedBody.createEl("h4", { text: "\u540C\u6B65\u65F6\u95F4\u8BBE\u7F6E", cls: "simple-sync-subsection-title" });
    new import_obsidian3.Setting(advancedBody).setName("\u7A7A\u95F2\u540E\u6C47\u603B\u53D8\u5316\u6587\u4EF6\u5217\u8868\uFF08\u79D2\uFF09").setDesc("\u6301\u7EED\u591A\u4E45\u6CA1\u6709\u6587\u4EF6\u53D8\u5316\u540E\u6C47\u603B\u6240\u6709\u53D8\u5316\u6587\u4EF6\uFF0C\u751F\u6210\u5F85 Commit\uFF0F\u4E0A\u4F20\u5217\u8868\u3002").addText((text) => {
      text.inputEl.type = "number";
      text.inputEl.min = "0.5";
      text.inputEl.step = "0.5";
      text.setValue(String(this.plugin.settings.viewRefreshDelaySeconds)).onChange(async (value) => {
        this.plugin.settings.viewRefreshDelaySeconds = Math.max(0.5, Number(value) || 7);
        await this.plugin.saveSettings();
      });
    });
    new import_obsidian3.Setting(advancedBody).setName("\u7A7A\u95F2\u540E\u81EA\u52A8 Commit\uFF08\u5206\u949F\uFF09").setDesc("\u6301\u7EED\u591A\u4E45\u6CA1\u6709\u6587\u4EF6\u53D8\u5316\u540E\u521B\u5EFA Commit\u3002\u8BBE\u4E3A 0 \u53EF\u5173\u95ED\u3002").addText((text) => this.addTimingInput(text, "autoCommitIdleMinutes", 5));
    new import_obsidian3.Setting(advancedBody).setName("\u7A7A\u95F2\u540E\u81EA\u52A8 Push\uFF08\u5206\u949F\uFF09").setDesc("\u6301\u7EED\u591A\u4E45\u6CA1\u6709\u6587\u4EF6\u53D8\u5316\u540E\uFF0C\u5148\u8865\u4E00\u6B21 Commit\uFF0C\u518D Fetch\u3001\u6309\u9700 Merge \u5E76 Push\u3002\u8BBE\u4E3A 0 \u53EF\u5173\u95ED\u3002").addText((text) => this.addTimingInput(text, "autoPushIdleMinutes", 30));
    new import_obsidian3.Setting(advancedBody).setName("\u5F3A\u5236 Commit \u95F4\u9694\uFF08\u5206\u949F\uFF09").setDesc("\u5230\u70B9\u7ACB\u5373 Commit \u5176\u4ED6\u5DF2\u7A33\u5B9A\u6587\u4EF6\uFF1B\u6700\u8FD1\u4ECD\u5728\u4FEE\u6539\u7684\u6587\u4EF6\u4F1A\u8DF3\u8FC7\uFF0C\u7B49\u5F85\u4E0B\u4E00\u6B21\u81EA\u52A8 Commit\u3002\u8BBE\u4E3A 0 \u53EF\u5173\u95ED\u3002").addText((text) => this.addTimingInput(text, "maxUncommittedMinutes", 30));
    new import_obsidian3.Setting(advancedBody).setName("\u5F3A\u5236 Push \u95F4\u9694\uFF08\u5206\u949F\uFF09").setDesc("\u6700\u65E9\u7684\u5F85\u4E0A\u4F20 Commit \u5230\u70B9\u540E\uFF0C\u5148\u5F3A\u5236 Commit \u5F53\u524D\u672C\u673A\u66F4\u6539\uFF08\u5305\u62EC\u6B63\u5728\u7F16\u8F91\u7684\u6587\u4EF6\uFF09\uFF0C\u518D Fetch\u3001\u6309\u9700 Merge \u5E76 Push\u3002\u8BBE\u4E3A 0 \u53EF\u5173\u95ED\u3002").addText((text) => this.addTimingInput(text, "maxUnpushedMinutes", 60));
    new import_obsidian3.Setting(advancedBody).setName("\u542F\u52A8\u540E\u81EA\u52A8 Commit\u3001Fetch \u5E76 Merge").setDesc("\u542F\u52A8\u540E\u5148 Commit \u9664\u6B63\u5728\u4FEE\u6539\u5916\u7684\u6587\u4EF6\uFF0C\u518D\u83B7\u53D6\u4E91\u7AEF\u6700\u65B0\u63D0\u4EA4\u5E76\u5408\u5E76\u5230\u672C\u673A\uFF1B\u4E0D\u4F1A\u7ACB\u5373 Push\u3002").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.pullOnStartup).onChange(async (value) => {
        this.plugin.settings.pullOnStartup = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian3.Setting(advancedBody).setName("\u81EA\u52A8 Fetch \u4E0E Merge \u95F4\u9694\uFF08\u5206\u949F\uFF09").setDesc("\u6309\u6B64\u65F6\u95F4\u95F4\u9694\u83B7\u53D6\u4E91\u7AEF\u6700\u65B0\u63D0\u4EA4\u5E76\u5408\u5E76\u5230\u672C\u673A\uFF1B\u4E0D\u4F1A\u6267\u884C Push\u3002\u8BBE\u4E3A 0 \u53EF\u5173\u95ED\u3002").addText((text) => this.addTimingInput(text, "autoPullIntervalMinutes", 5));
    advancedBody.createEl("h4", { text: "Git \u8BBE\u7F6E", cls: "simple-sync-subsection-title" });
    new import_obsidian3.Setting(advancedBody).setName("\u5206\u652F").setDesc("\u9ED8\u8BA4\u4F7F\u7528 master\uFF1B\u53EA\u6709\u4ED3\u5E93\u4F7F\u7528\u5176\u4ED6\u5206\u652F\u65F6\u624D\u9700\u8981\u4FEE\u6539\u3002").addText(
      (text) => text.setValue(this.plugin.settings.gitBranch).onChange(async (value) => {
        this.plugin.settings.gitBranch = value.trim() || "master";
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian3.Setting(advancedBody).setName("\u63D0\u4EA4\u4F5C\u8005\u540D\u79F0").setDesc("Git \u521B\u5EFA\u7248\u672C\u8BB0\u5F55\u65F6\u4F7F\u7528\uFF1B\u901A\u5E38\u4F1A\u81EA\u52A8\u8BFB\u53D6\u672C\u673A\u5DF2\u6709\u7684 Git \u914D\u7F6E\u3002").addText(
      (text) => text.setValue(this.plugin.settings.gitAuthorName).onChange(async (value) => {
        this.plugin.settings.gitAuthorName = value.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian3.Setting(advancedBody).setName("\u63D0\u4EA4\u4F5C\u8005\u90AE\u7BB1").setDesc("\u7528\u4E8E\u6807\u8BC6 Git \u63D0\u4EA4\u4F5C\u8005\uFF0C\u4E0D\u662F\u767B\u5F55\u5BC6\u7801\uFF1B\u901A\u5E38\u4F1A\u81EA\u52A8\u8BFB\u53D6\u3002").addText(
      (text) => text.setValue(this.plugin.settings.gitAuthorEmail).onChange(async (value) => {
        this.plugin.settings.gitAuthorEmail = value.trim();
        await this.plugin.saveSettings();
      })
    );
    advancedBody.createEl("h4", { text: "\u6545\u969C\u6392\u67E5", cls: "simple-sync-subsection-title" });
    new import_obsidian3.Setting(advancedBody).setName("\u5F02\u5E38\u4FEE\u590D").setDesc("\u6062\u590D\u672A\u5B8C\u6210\u7684 Rebase\u3001Merge \u7B49 Git \u64CD\u4F5C\uFF0C\u4EE5\u5F53\u524D\u672C\u673A\u5185\u5BB9\u91CD\u65B0 Commit\uFF0C\u518D Fetch \u5E76 Merge\uFF1B\u4E0D\u4F1A\u7ACB\u5373 Push\u3002").addButton(
      (button) => button.setButtonText("\u6062\u590D\u6B63\u5E38\u540C\u6B65").setDisabled(preview).onClick(async () => {
        button.setDisabled(true);
        button.setButtonText("\u6B63\u5728\u68C0\u67E5\u2026");
        try {
          const operation = await this.plugin.getInterruptedGitOperationLabel();
          if (!operation) {
            new import_obsidian3.Notice("Simple Sync\uFF1A\u6CA1\u6709\u68C0\u6D4B\u5230\u672A\u5B8C\u6210\u7684 Rebase\u3001Merge\u3001Cherry-pick \u6216 Revert");
            return;
          }
          new GitRepairModal(this.app, this.plugin, operation).open();
        } catch (error) {
          new import_obsidian3.Notice(`Simple Sync\uFF1A\u65E0\u6CD5\u68C0\u67E5 Git \u72B6\u6001\u3002${messageOf2(error)}`, 1e4);
        } finally {
          button.setDisabled(false);
          button.setButtonText("\u6062\u590D\u6B63\u5E38\u540C\u6B65");
        }
      })
    );
    const logs = this.plugin.getRecentErrorLogs();
    const errorCount = logs.filter((entry) => entry.status !== "success").length;
    new import_obsidian3.Setting(advancedBody).setName("\u6700\u8FD1\u540C\u6B65\u65E5\u5FD7").setDesc(
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
