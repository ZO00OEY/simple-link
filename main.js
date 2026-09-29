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
var import_obsidian2 = require("obsidian");

// src/dirty.ts
var DEFAULT_SYNC_IGNORE_PATTERNS = [
  ".git/",
  ".zoey-sync/",
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
  ".obsidian/plugins/zoey-sync-test/data.json",
  ".obsidian/plugins/simple-one-sync/data.json",
  ".obsidian/plugins/simple-sync/data.json",
  ".obsidian/plugins/simple-link/data.json",
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
function shouldIgnore(path2, patterns = DEFAULT_SYNC_IGNORE_PATTERNS) {
  const normalized = path2.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/$/, "");
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
  constructor(app) {
    super(app);
    this.pending = new Set(SAMPLE_FILES.map((file) => file.path));
    this.fileChoices = /* @__PURE__ */ new Map();
    this.blockChoices = /* @__PURE__ */ new Map();
    this.appliedCount = 0;
  }
  onOpen() {
    this.modalEl.addClass("zoey-sync-preview-modal");
    this.render(false);
  }
  onClose() {
    this.contentEl.empty();
  }
  render(preserveScroll = true) {
    const root = this.contentEl;
    const scrollTop = preserveScroll ? root.scrollTop : 0;
    root.empty();
    root.addClass("zoey-sync-preview");
    const header = root.createDiv({ cls: "zoey-sync-preview__header" });
    const heading = header.createDiv();
    heading.createDiv({ text: "\u754C\u9762\u9884\u89C8 \xB7 \u793A\u4F8B\u6570\u636E", cls: "zoey-sync-preview__eyebrow" });
    heading.createEl("h2", { text: "\u5904\u7406\u6587\u4EF6\u5DEE\u5F02" });
    const reset = header.createEl("button", { text: "\u91CD\u7F6E\u793A\u4F8B" });
    reset.addEventListener("click", () => this.reset());
    root.createDiv({
      text: "\u4EC5\u6F14\u793A\u754C\u9762\u548C\u9009\u62E9\u65B9\u5F0F\uFF0C\u4E0D\u4F1A\u4FEE\u6539\u7B14\u8BB0\u6216\u6267\u884C\u540C\u6B65\u3002",
      cls: "zoey-sync-preview__notice"
    });
    const toolbar = root.createDiv({ cls: "zoey-sync-preview__toolbar" });
    toolbar.createSpan({ text: `\u5F85\u5904\u7406 ${this.pending.size} \u4E2A\u6587\u4EF6`, cls: "zoey-sync-preview__count" });
    const bulk = toolbar.createDiv({ cls: "zoey-sync-preview__bulk" });
    this.createButton(bulk, "\u5168\u9009\u6700\u65B0", () => this.selectAll("latest"), "zoey-sync-preview__bulk-choice");
    this.createButton(bulk, "\u5168\u90E8\u9009\u672C\u673A", () => this.selectAll("local"), "zoey-sync-preview__bulk-choice is-local");
    this.createButton(bulk, "\u5168\u90E8\u9009 GitHub", () => this.selectAll("remote"), "zoey-sync-preview__bulk-choice is-remote");
    this.createButton(bulk, "\u6E05\u7A7A\u9009\u62E9", () => {
      this.fileChoices.clear();
      this.blockChoices.clear();
      this.render();
    });
    if (this.appliedCount > 0) {
      root.createDiv({ text: `\u793A\u4F8B\u4E2D\u5DF2\u5E94\u7528 ${this.appliedCount} \u4E2A\uFF0C\u5269\u4F59 ${this.pending.size} \u4E2A\u5F85\u5904\u7406\u3002`, cls: "zoey-sync-preview__feedback" });
    }
    const list = root.createDiv({ cls: "zoey-sync-preview__list" });
    for (const file of SAMPLE_FILES) {
      if (this.pending.has(file.path)) this.renderFile(list, file);
    }
    if (this.pending.size === 0) list.createDiv({ text: "\u793A\u4F8B\u6587\u4EF6\u5DF2\u5168\u90E8\u5904\u7406\u3002\u53EF\u4EE5\u70B9\u201C\u91CD\u7F6E\u793A\u4F8B\u201D\u91CD\u65B0\u67E5\u770B\u3002", cls: "zoey-sync-preview__empty" });
    const ready = this.getReadyFiles();
    const footer = root.createDiv({ cls: "zoey-sync-preview__footer" });
    footer.createSpan({ text: `\u5DF2\u9009\u597D ${ready.length} \u4E2A \xB7 \u5F85\u5904\u7406 ${this.pending.size} \u4E2A` });
    const apply = footer.createEl("button", { text: `\u5E94\u7528\u9009\u62E9${ready.length > 0 ? ` (${ready.length})` : ""}`, cls: "mod-cta" });
    apply.disabled = ready.length === 0;
    apply.addEventListener("click", () => this.applyReadyFiles());
    root.scrollTop = scrollTop;
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
    name.createSpan({ text: file.path, cls: "zoey-sync-preview__path" });
    name.createSpan({ text: `${file.blocks.length} \u5904\u5DEE\u5F02`, cls: "zoey-sync-preview__meta" });
    const toggleFile = () => {
      this.expandedPath = expanded ? void 0 : file.path;
      this.render();
    };
    summary.addEventListener("click", (event) => {
      if (event.target instanceof Element && event.target.closest(".zoey-sync-preview__choice-control")) return;
      toggleFile();
    });
    const times = summary.createEl("button", { cls: "zoey-sync-preview__times" });
    times.setAttr("aria-expanded", String(expanded));
    times.setAttr("aria-label", `${expanded ? "\u6536\u8D77" : "\u5C55\u5F00"}${file.path}\uFF0C\u672C\u673A\u4E0E GitHub \u66F4\u65B0\u65F6\u95F4`);
    for (const [side, text, value] of [["local", "\u672C\u673A", file.localUpdatedAt], ["remote", "GitHub", file.remoteUpdatedAt]]) {
      const line = times.createSpan({ cls: "zoey-sync-preview__time" });
      line.toggleClass("is-newer", this.latestSide(file) === side);
      line.createSpan({ text: `${text}\u66F4\u65B0` });
      const time = line.createEl("time", { text: this.formatTime(value) });
      time.setAttr("datetime", value);
    }
    const selected = this.fileChoices.get(file.path);
    const control = summary.createDiv({ cls: "zoey-sync-preview__choice-control" });
    const selection = control.createEl("button", { text: this.fileStatus(file), cls: "zoey-sync-preview__selection" });
    (0, import_obsidian.setIcon)(selection.createSpan({ cls: "zoey-sync-preview__selection-icon" }), "chevron-down");
    const tone = this.selectionTone(file);
    if (tone) selection.addClass(`is-${tone}`);
    selection.setAttr("aria-label", `${file.path}\u5F53\u524D${this.fileStatus(file)}\uFF0C\u70B9\u51FB\u9009\u62E9\u6700\u65B0\u3001\u672C\u673A\u6216 GitHub`);
    const segments = control.createDiv({ cls: "zoey-sync-preview__segments" });
    for (const [choice, label] of [["latest", "\u6700\u65B0"], ["local", "\u672C\u673A"], ["remote", "GitHub"]]) {
      const option = segments.createEl("button", { text: label, cls: `zoey-sync-preview__segment is-${choice === "latest" ? this.latestSide(file) : choice}` });
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
    const details = row.createDiv({ cls: "zoey-sync-preview__details" });
    details.toggleClass("is-mixed", this.selectionTone(file) === "mixed");
    const headings = details.createDiv({ cls: "zoey-sync-preview__block-headers" });
    headings.createSpan({ text: "\u5DEE\u5F02", cls: "zoey-sync-preview__block-heading" });
    headings.createSpan({ text: "\u672C\u673A\u533A\u5757", cls: "zoey-sync-preview__block-heading" });
    headings.createSpan({ text: "Git \u533A\u5757", cls: "zoey-sync-preview__block-heading" });
    file.blocks.forEach((block, index) => {
      const key = this.blockKey(file.path, index);
      const wholeChoice = this.fileChoices.get(file.path);
      const selection = this.blockChoices.get(key) ?? (wholeChoice ? { method: wholeChoice === "latest" ? this.latestSide(file) : wholeChoice } : void 0);
      const blockRow = details.createDiv({ cls: "zoey-sync-preview__block" });
      const title = blockRow.createDiv({ cls: "zoey-sync-preview__block-title" });
      const caption = title.createDiv({ cls: "zoey-sync-preview__block-caption" });
      caption.createSpan({ text: `\u5DEE\u5F02 ${index + 1} / ${file.blocks.length}` });
      caption.createSpan({ text: `\u7EA6\u7B2C ${block.line} \u884C`, cls: "zoey-sync-preview__line" });
      const merge = this.createButton(title, selection?.method === "merged" ? "\u53D6\u6D88\u5408\u5E76" : "\u5408\u5E76", () => this.toggleMerge(file, index), "zoey-sync-preview__merge");
      merge.toggleClass("is-selected", selection?.method === "merged");
      merge.setAttr("aria-pressed", String(selection?.method === "merged"));
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
      } else {
        this.renderSide(blockRow, "\u672C\u673A", block.local, "local", selection?.method === "local", () => this.selectBlock(file, index, "local"));
        this.renderSide(blockRow, "Git", block.remote, "remote", selection?.method === "remote", () => this.selectBlock(file, index, "remote"));
      }
    });
  }
  renderSide(parent, label, content, side, selected, choose) {
    const panel = parent.createEl("button", { cls: `zoey-sync-preview__side is-${side}` });
    panel.toggleClass("is-selected", selected);
    panel.setAttr("aria-label", `\u91C7\u7528${label}\u533A\u5757`);
    panel.setAttr("aria-pressed", String(selected));
    panel.createSpan({ text: content, cls: "zoey-sync-preview__side-content" });
    panel.addEventListener("click", choose);
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

// src/nestedRepos.ts
var nodeRequire = globalThis.require;
var fs = nodeRequire ? nodeRequire("fs").promises : null;
var path = nodeRequire ? nodeRequire("path") : null;
async function findNestedRepos(vaultPath) {
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
      if (!shouldIgnore(relative, DEFAULT_SYNC_IGNORE_PATTERNS)) await visit(absolute);
    }
  };
  await visit(vaultPath);
  return found;
}
function nestedGitIgnoreRules(repos) {
  return repos.map((repo) => `/${repo.directory}/.git${repo.gitIsDirectory ? "/" : ""}`);
}
async function nestedRepoFiles(vaultPath, repos, git) {
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
    if (/^\.obsidian\/plugins\/[^/]+$/.test(repo.directory) && !shouldIgnore(data, [...DEFAULT_SYNC_IGNORE_PATTERNS, ...vaultIgnore])) {
      try {
        if ((await fs.lstat(path.join(vaultPath, data))).isFile()) files.push(data);
      } catch {
      }
    }
  }
  return [...new Set(files)].sort();
}
async function seedNestedRepoFiles(vaultPath, repos, git, skip = /* @__PURE__ */ new Set()) {
  if (!fs || !path) throw new Error("\u5185\u5D4C\u4ED3\u5E93\u68C0\u67E5\u4EC5\u652F\u6301\u684C\u9762\u7AEF");
  const tracked = new Set((await git(["ls-files", "--cached", "-z"])).split("\0").filter(Boolean));
  const candidates = await nestedRepoFiles(vaultPath, repos, git);
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
async function rebuildNestedRepoTracking(vaultPath, repos, git) {
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
  await seedNestedRepoFiles(vaultPath, repos, git);
  const files = await nestedRepoFiles(vaultPath, repos, git);
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
var nodeRequire2 = globalThis.require;
var nodeFs = nodeRequire2 ? nodeRequire2("fs").promises : null;
var nodeFsStream = nodeRequire2 ? nodeRequire2("fs") : null;
var nodePath = nodeRequire2 ? nodeRequire2("path") : null;
var nodeCrypto = nodeRequire2 ? nodeRequire2("crypto") : null;
var SETUP_GITIGNORE = [
  "# Obsidian local state",
  ".obsidian/cache/",
  ".obsidian/workspace.json",
  ".obsidian/workspace-mobile.json",
  ".obsidian/workspaces/",
  ".obsidian/trash/",
  ".trash/",
  "# Local credentials and agent output",
  ".obsidian/plugins/zoey-sync-test/data.json",
  ".obsidian/plugins/simple-one-sync/data.json",
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
  constructor(vaultPath, run) {
    this.vaultPath = vaultPath;
    this.run = run;
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
      const nested = await nestedRepoFiles(this.vaultPath, nestedRepos, (args) => this.run("git", args));
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
    const patterns = [...DEFAULT_SYNC_IGNORE_PATTERNS, ...existingIgnore];
    const found = [];
    const visit = async (folder) => {
      for (const item of await nodeFs.readdir(folder, { withFileTypes: true })) {
        const absolute = nodePath.join(folder, item.name);
        const name = nodePath.relative(this.vaultPath, absolute).replace(/\\/g, "/");
        if (item.name === ".git") {
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
    const nestedRepos = await findNestedRepos(this.vaultPath);
    const nestedUserData = new Set((await nestedRepoFiles(this.vaultPath, nestedRepos, (args) => this.run("git", args))).filter((name) => nestedRepos.some((repo2) => name === `${repo2.directory}/data.json`)));
    const localFiles = await this.localFiles(localRoot, nestedRepos);
    const trackedLocal = localRoot ? (await this.run("git", ["ls-files", "--cached", "-z"])).split("\0").filter(Boolean) : [];
    const trackedIgnoredLocal = localRoot ? (await this.run("git", ["ls-files", "--cached", "--ignored", "--exclude-standard", "-z"])).split("\0").filter(Boolean) : [];
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
      if (trackedLocal.includes(".obsidian/plugins/simple-one-sync/data.json") || trackedLocal.includes(".obsidian/plugins/zoey-sync-test/data.json")) {
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
    if (repo.remoteSha) {
      const raw = await this.run("gh", ["api", `repos/${repo.owner}/${repo.name}/git/trees/${repo.remoteSha}?recursive=1`]);
      const tree = JSON.parse(raw);
      if (tree.truncated) throw new Error("\u8FDC\u7AEF\u6587\u4EF6\u5217\u8868\u8FC7\u5927\uFF0CGitHub \u53EA\u8FD4\u56DE\u4E86\u90E8\u5206\u6587\u4EF6\uFF1B\u5411\u5BFC\u5DF2\u505C\u6B62\uFF0C\u8BF7\u5148\u7F29\u5C0F\u4ED3\u5E93\u6216\u624B\u52A8\u63A5\u5165\u3002");
      if (tree.tree?.some((item) => item.type === "commit")) throw new Error("\u8FDC\u7AEF\u4ED3\u5E93\u5305\u542B Git \u5B50\u6A21\u5757\uFF0C\u5411\u5BFC\u6682\u4E0D\u652F\u6301\u81EA\u52A8\u63A5\u5165\u3002");
      remoteFiles = (tree.tree ?? []).filter((item) => item.type === "blob").map((item) => {
        remoteBlobs[item.path] = { sha: item.sha ?? "", size: item.size ?? 0 };
        return item.path;
      }).sort();
      if (remoteFiles.includes(".obsidian/plugins/simple-one-sync/data.json") || remoteFiles.includes(".obsidian/plugins/zoey-sync-test/data.json")) {
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
    const nestedRules = nestedGitIgnoreRules(nestedRepos);
    const effectiveIgnore = [...existingIgnore.split(/\r?\n/), ...SETUP_GITIGNORE, ...nestedRules];
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
      missingIgnoreRules: [...missingSetupIgnoreRules(existingIgnore), ...nestedRules.filter((rule) => !existingIgnore.split(/\r?\n/).includes(rule))],
      nestedRepos,
      trackedExcludedLocal: [.../* @__PURE__ */ new Set([...trackedIgnoredLocal.filter((name) => !nestedUserData.has(name)), ...trackedLocal.filter((name) => shouldIgnore(name, SETUP_GITIGNORE))])].sort(),
      trackedExcludedRemote: remoteFiles.filter((name) => shouldIgnore(name, effectiveIgnore))
    };
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
    const missing = [...missingSetupIgnoreRules(existing), ...nestedGitIgnoreRules(repos).filter((rule) => !existing.split(/\r?\n/).includes(rule))];
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
    await seedNestedRepoFiles(this.vaultPath, repos, (args) => this.run("git", args), skipped);
    await this.run("git", ["add", "-A"]);
    if (skipped.size) {
      const staged = new Set((await this.run("git", ["diff", "--cached", "--name-only", "-z"])).split("\0").filter(Boolean));
      for (const batch of pathBatches([...skipped].filter((path2) => staged.has(path2)))) {
        await this.run("git", ["reset", "-q", "HEAD", "--", ...batch]);
      }
    }
    const allowedData = new Set((await nestedRepoFiles(this.vaultPath, repos, (args) => this.run("git", args))).filter((name) => repos.some((repo) => name === `${repo.directory}/data.json`)));
    const remaining = (await this.run("git", ["ls-files", "-ci", "--exclude-standard", "-z"])).split("\0").filter((name) => name && !allowedData.has(name));
    if (remaining.length) throw new Error(`\u91CD\u5EFA\u540E\u4ECD\u6709 ${remaining.length} \u4E2A\u88AB\u5FFD\u7565\u7684\u6587\u4EF6\u53D7\u5230\u8FFD\u8E2A\uFF0C\u8BF7\u68C0\u67E5 .gitignore \u540E\u91CD\u8BD5\u3002`);
  }
  async finish(repo, prior, choices, author, onMutationStart, activelyChangingPaths = /* @__PURE__ */ new Set(), rebuildTracking = false) {
    const verified = await this.verifyRepository(repo.url);
    const latest = await this.preview(verified);
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
    if (!latest.localRoot) await this.run("git", ["init", "-b", repo.branch]);
    await this.run("git", ["config", "user.name", author.name]);
    await this.run("git", ["config", "user.email", author.email]);
    if (!latest.origin) await this.run("git", ["remote", "add", "origin", repo.url]);
    await this.appendIgnore(latest.nestedRepos);
    if (latest.localRoot) await rebuildNestedRepoTracking(this.vaultPath, latest.nestedRepos, (args) => this.run("git", args));
    let hasHead = false;
    try {
      await this.run("git", ["rev-parse", "--verify", "HEAD"]);
      hasHead = true;
    } catch {
    }
    await seedNestedRepoFiles(this.vaultPath, latest.nestedRepos, (args) => this.run("git", args), skipped);
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
    if (rebuildTracking && hasHead) await this.rebuildTrackingIndex(latest.trackedExcludedLocal, skipped, latest.nestedRepos);
    try {
      await this.run("git", ["diff", "--cached", "--quiet"]);
    } catch {
      await this.run("git", ["commit", "-m", "Simple Link initial vault snapshot"]);
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
          throw new Error(latest.relatedHistory ? `\u540C\u6E90\u4ED3\u5E93\u5408\u5E76\u51FA\u73B0\u51B2\u7A81\uFF1B\u5DF2\u5C1D\u8BD5\u64A4\u9500\u672C\u6B21\u5408\u5E76\u3002\u8BF7\u5148\u5904\u7406\u51B2\u7A81\u540E\u91CD\u65B0\u68C0\u67E5\u7B2C 3 \u6B65\u3002${String(error)}` : String(error));
        }
        try {
          const fromRemote = latest.relatedHistory ? [] : [...latest.remoteOnly, ...latest.overlaps.filter((name) => choices[name] === "remote")];
          for (const batch of pathBatches(fromRemote)) await this.run("git", ["checkout", "FETCH_HEAD", "--", ...batch]);
          await this.appendIgnore(latest.nestedRepos);
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
    await this.run("git", ["push", "-u", "origin", `HEAD:${repo.branch}`]);
    return [...skipped].sort();
  }
};

// assets/create-private-repository.png
var create_private_repository_default = "data:image/png;base64,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";

// src/main.ts
var SyncDeferredError = class extends Error {
};
var DEFAULT_GIT_AUTHOR_NAME = "default";
var DEFAULT_GIT_AUTHOR_EMAIL = "default@default.com";
var CHECKBOX_CHECKED_ICON = "zoey-sync-square-check-contained";
var LAYOUT_SWITCH_ICON = "zoey-sync-layout-panels";
var REFRESH_CHANGES_ICON = "zoey-sync-refresh-changes";
(0, import_obsidian2.addIcon)(
  CHECKBOX_CHECKED_ICON,
  '<g fill="none" stroke="currentColor" stroke-width="8.333" stroke-linecap="round" stroke-linejoin="round"><rect x="12.5" y="12.5" width="75" height="75" rx="8.333"/><path d="m29.167 50.417 13.333 13.333 29.167-30"/></g>'
);
(0, import_obsidian2.addIcon)(
  LAYOUT_SWITCH_ICON,
  '<g fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"><rect x="12" y="15" width="76" height="70" rx="8"/><path d="M42 15v70M42 43h46"/></g>'
);
(0, import_obsidian2.addIcon)(
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
var ZoeySyncPlugin = class extends import_obsidian2.Plugin {
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
  }
  async onload() {
    await this.migrateLegacyLocalSettings();
    await this.loadSettings();
    if (!import_obsidian2.Platform.isMobile) await this.detectDesktopGitDefaults();
    this.statusEl = this.addStatusBarItem();
    this.registerView(ZoeySyncView.type, (leaf) => new ZoeySyncView(leaf, this));
    this.registerView(ZoeySyncConflictView.type, (leaf) => new ZoeySyncConflictView(leaf, this));
    this.addSettingTab(new ZoeySyncSettingTab(this.app, this));
    this.addCommand({ id: "sync-now", name: "\u540C\u6B65\u7B14\u8BB0", callback: () => void this.syncNow(true) });
    this.addCommand({ id: "test-connection", name: "\u6D4B\u8BD5\u540C\u6B65\u8FDE\u63A5", callback: () => void this.testConnection(true) });
    this.addCommand({ id: "open-sync-view", name: "\u6253\u5F00\u540C\u6B65\u9762\u677F", callback: () => void this.openSyncView() });
    this.addCommand({ id: "preview-conflict-ui", name: "\u9884\u89C8\u51B2\u7A81\u754C\u9762", callback: () => void this.openConflictPreview() });
    if (this.settings.enabled) {
      this.activateFeature();
      if (!import_obsidian2.Platform.isMobile) {
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
    this.ribbonEl = this.addRibbonIcon("refresh-cw", "\u6253\u5F00 Simple Link", () => void this.openSyncView());
    this.registerViewRefreshEvents();
    if (import_obsidian2.Platform.isMobile) {
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
      if (!this.featureActive || import_obsidian2.Platform.isMobile) return;
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
    if (import_obsidian2.Platform.isMobile || !this.featureActive) return;
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
    this.settings.inFlight = Array.isArray(this.settings.inFlight) ? this.settings.inFlight : [];
    this.settings.ignorePatterns = Array.isArray(this.settings.ignorePatterns) ? this.settings.ignorePatterns.filter((pattern) => typeof pattern === "string") : [...DEFAULT_SYNC_IGNORE_PATTERNS];
    this.settings.errorLogs = Array.isArray(this.settings.errorLogs) ? this.settings.errorLogs : [];
    this.pruneErrorLogs();
    if (!this.settings.lastPullAt) {
      this.settings.lastPullAt = this.settings.errorLogs.filter((entry) => entry.status === "success" && /Fetch|Pull/.test(entry.context)).reduce((latest, entry) => Math.max(latest, entry.timestamp), 0);
    }
    if (!this.settings.deviceId) this.settings.deviceId = crypto.randomUUID();
    if (!this.settings.deviceName) {
      this.settings.deviceName = import_obsidian2.Platform.isMobile ? "Zoey Mobile" : "Zoey Desktop";
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
      new import_obsidian2.Notice("Simple Link\uFF1A\u540C\u6B65\u914D\u7F6E\u6587\u4EF6\u5B58\u5728\u51B2\u7A81\u6216\u683C\u5F0F\u9519\u8BEF\uFF0C\u5DF2\u505C\u6B62\u8986\u76D6\u8BE5\u6587\u4EF6", 1e4);
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
    const relevantPaths = paths.filter((path2) => !shouldIgnore(path2, this.settings.ignorePatterns));
    if (relevantPaths.length === 0) return;
    const now = Date.now();
    this.lastFileChangeAt = now;
    this.scheduleViewRefresh();
    if (!import_obsidian2.Platform.isMobile && this.settings.setupComplete) {
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
    if (!this.settings.setupComplete) return Promise.reject(new Error("\u8BF7\u5148\u5B8C\u6210\u9996\u6B21\u4F7F\u7528\u5F15\u5BFC"));
    const trackedTask = async () => {
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
    const nodeRequire3 = globalThis.require;
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
      new import_obsidian2.Notice("Simple Link \u5DF2\u5173\u95ED\uFF0C\u8BF7\u5148\u5728\u8BBE\u7F6E\u4E2D\u542F\u7528");
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
    if (import_obsidian2.Platform.isMobile) {
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
    if (import_obsidian2.Platform.isMobile || !this.settings.setupComplete) return 0;
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
    const record = (file, type) => {
      if (!(file instanceof import_obsidian2.TFile)) return;
      void this.recordDirty({ type, path: file.path });
    };
    this.trackFeatureEvent(this.app.vault.on("create", (file) => record(file, "add")));
    this.trackFeatureEvent(this.app.vault.on("modify", (file) => record(file, "modify")));
    this.trackFeatureEvent(this.app.vault.on("delete", (file) => record(file, "delete")));
    this.trackFeatureEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        if (!(file instanceof import_obsidian2.TFile)) return;
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
  async serverRequest(method, path2, body) {
    this.validateServerSettings();
    const url = `${this.settings.serverUrl.replace(/\/$/, "")}${path2}`;
    try {
      const response = await (0, import_obsidian2.requestUrl)({
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
    if (!import_obsidian2.Platform.isMobile) return "desktop";
    if (import_obsidian2.Platform.isIosApp) return "ios";
    if (import_obsidian2.Platform.isAndroidApp) return "android";
    return "unknown";
  }
  async registerMobile() {
    if (!this.settings.enabled || !import_obsidian2.Platform.isMobile || !this.settings.serverUrl || !this.settings.serverPassword) return;
    await this.serverRequest("POST", "/v1/devices/register", {
      deviceId: this.settings.deviceId,
      name: this.settings.deviceName,
      platform: this.platformName()
    });
    this.setStatus(`\u5DF2\u8FDE\u63A5 \xB7 v${this.settings.baseVersion}`);
  }
  async testConnection(showNotice) {
    try {
      if (import_obsidian2.Platform.isMobile) {
        await this.registerMobile();
      } else {
        if (!this.settings.setupComplete) throw new Error("\u8BF7\u5148\u5B8C\u6210\u9996\u6B21\u4F7F\u7528\u5F15\u5BFC");
        await this.testDesktopGit();
      }
      if (!import_obsidian2.Platform.isMobile) await this.recordSuccess("\u6D4B\u8BD5\u8FDE\u63A5", "\u8FDE\u63A5\u6B63\u5E38");
      if (showNotice) new import_obsidian2.Notice(`Simple Link\uFF1A${import_obsidian2.Platform.isMobile ? "\u670D\u52A1\u5668" : "Git"}\u8FDE\u63A5\u6B63\u5E38`);
    } catch (error) {
      await this.recordError("\u6D4B\u8BD5\u8FDE\u63A5", error);
      if (showNotice) new import_obsidian2.Notice(`Simple Link\uFF1A${messageOf2(error)}`, 8e3);
      throw error;
    }
  }
  async syncNow(showNotice) {
    if (!import_obsidian2.Platform.isMobile && !this.settings.setupComplete) {
      if (showNotice) new import_obsidian2.Notice("\u8BF7\u5148\u5B8C\u6210\u300C\u4ECE\u96F6\u5F00\u59CB\u7684 Git \u540C\u6B65\u5F15\u5BFC\u300D");
      return;
    }
    if (!this.settings.enabled) {
      if (showNotice) new import_obsidian2.Notice("Simple Link \u5DF2\u5173\u95ED\uFF0C\u8BF7\u5148\u5728\u8BBE\u7F6E\u4E2D\u542F\u7528");
      return;
    }
    if (this.syncing) {
      if (showNotice) new import_obsidian2.Notice("Simple Link\uFF1A\u5DF2\u6709\u540C\u6B65\u4EFB\u52A1\u6B63\u5728\u8FD0\u884C");
      return;
    }
    this.syncing = true;
    this.setStatus(import_obsidian2.Platform.isMobile ? "\u6B63\u5728\u540C\u6B65\u2026" : "\u51C6\u5907\u68C0\u67E5\u672C\u673A\u4FEE\u6539\u2026");
    try {
      if (import_obsidian2.Platform.isMobile) {
        await this.mobileSync();
        this.settings.lastSyncAt = Date.now();
        await this.saveSettings();
        this.setStatus(`\u5DF2\u540C\u6B65 \xB7 v${this.settings.baseVersion}`);
      } else {
        await this.enqueueDesktopGit(() => this.desktopGitSync());
        this.setStatus("\u540C\u6B65\u68C0\u67E5\u5B8C\u6210");
      }
      await this.recordSuccess(showNotice ? "\u624B\u52A8\u540C\u6B65" : "\u81EA\u52A8\u540C\u6B65", "\u540C\u6B65\u68C0\u67E5\u5B8C\u6210");
      if (showNotice) new import_obsidian2.Notice("Simple Link\uFF1A\u540C\u6B65\u5B8C\u6210");
    } catch (error) {
      if (error instanceof SyncDeferredError) {
        this.setStatus(error.message);
        if (showNotice) new import_obsidian2.Notice(error.message);
        return;
      }
      if (!import_obsidian2.Platform.isMobile) await this.scheduleDesktopPushRetry();
      await this.recordError(showNotice ? "\u624B\u52A8\u540C\u6B65" : "\u81EA\u52A8\u540C\u6B65", error);
      this.setStatus(import_obsidian2.Platform.isMobile ? "\u540C\u6B65\u5931\u8D25" : "\u540C\u6B65\u5931\u8D25 \xB7 5 \u5206\u949F\u540E\u91CD\u8BD5");
      if (showNotice) new import_obsidian2.Notice(`Simple Link\uFF1A${messageOf2(error)}`, 1e4);
      else console.error("Simple Link", error);
    } finally {
      this.syncing = false;
      await this.refreshSyncView();
    }
  }
  async commitNow(showNotice) {
    if (!import_obsidian2.Platform.isMobile && !this.settings.setupComplete) {
      if (showNotice) new import_obsidian2.Notice("\u8BF7\u5148\u5B8C\u6210\u300C\u4ECE\u96F6\u5F00\u59CB\u7684 Git \u540C\u6B65\u5F15\u5BFC\u300D");
      return;
    }
    if (!this.settings.enabled) {
      if (showNotice) new import_obsidian2.Notice("Simple Link \u5DF2\u5173\u95ED\uFF0C\u8BF7\u5148\u5728\u8BBE\u7F6E\u4E2D\u542F\u7528");
      return;
    }
    if (import_obsidian2.Platform.isMobile) {
      if (showNotice) new import_obsidian2.Notice("\u79FB\u52A8\u7AEF\u4E0D\u652F\u6301\u672C\u673A Commit");
      return;
    }
    if (this.syncing) {
      if (showNotice) new import_obsidian2.Notice("Simple Link\uFF1A\u5DF2\u6709\u4EFB\u52A1\u6B63\u5728\u8FD0\u884C");
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
        new import_obsidian2.Notice(result.committed ? "Simple Link\uFF1ACommit \u5B8C\u6210" : "Simple Link\uFF1A\u6CA1\u6709\u53EF Commit \u6587\u4EF6");
      }
    } catch (error) {
      await this.recordError("\u624B\u52A8 Commit", error);
      this.setStatus("Commit \u5931\u8D25");
      if (showNotice) new import_obsidian2.Notice(`Simple Link\uFF1A${messageOf2(error)}`, 1e4);
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
    if (response.gitWarning) new import_obsidian2.Notice(`Simple Link\uFF1AGitHub \u6682\u65F6\u4E0D\u53EF\u7528\uFF0C\u672C\u5730\u670D\u52A1\u5668\u540C\u6B65\u5DF2\u5B8C\u6210`, 7e3);
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
    if (!import_obsidian2.Platform.isMobile || !this.settings.serverUrl || !this.settings.serverPassword) return;
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
          new import_obsidian2.Notice(`${command.title}${command.body ? `
${command.body}` : ""}`, 8e3);
        } else if (command.kind === "sync") {
          new import_obsidian2.Notice(command.title || "\u670D\u52A1\u5668\u8981\u6C42\u540C\u6B65");
          triggerSync = true;
        } else if (command.kind === "open_file") {
          const path2 = command.payload.path;
          if (typeof path2 !== "string" || !path2) throw new Error("open_file \u6307\u4EE4\u7F3A\u5C11 path");
          await this.app.workspace.openLinkText(path2, "", false);
          new import_obsidian2.Notice(command.title || `\u5DF2\u6253\u5F00 ${path2}`);
        }
        acknowledged.push(command.id);
      } catch (error) {
        new import_obsidian2.Notice(`Simple Link \u6307\u4EE4\u5931\u8D25\uFF1A${messageOf2(error)}`, 8e3);
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
    return new GitSetup(this.vaultBasePath(), (program, args, timeoutMs, onOutput, stdinText, signal) => this.exec(program, args, program === "git" && (args[0] === "fetch" || args[0] === "push"), true, timeoutMs, onOutput, stdinText, signal));
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
  }
  async authorizeSetupWithToken(token) {
    await this.setup().loginWithToken(token);
    this.settings.setupStep = Math.max(this.settings.setupStep, 2);
    await this.saveSettings();
  }
  async checkSetupAuthorization() {
    await this.setup().checkTools();
    await this.setup().checkLogin();
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
  async inspectSetupRepository() {
    const repoUrl = this.settings.setupVerified?.url || this.settings.setupRepoUrl;
    if (!repoUrl) throw new Error("\u8BF7\u5148\u586B\u5199\u5E76\u6838\u9A8C\u79C1\u4EBA\u4ED3\u5E93\u5730\u5740");
    const verified = this.settings.setupComplete || !this.settings.setupVerified ? await this.setup().verifyRepository(repoUrl) : this.settings.setupVerified;
    this.settings.setupVerified = verified;
    this.setupPreview = await this.setup().preview(verified);
    if (!this.settings.setupComplete) {
      this.setupChoices = {};
      this.setupTrackingChoice = void 0;
      this.settings.setupStep = 3;
      await this.saveSettings();
    }
  }
  async confirmSetupPreview() {
    if (!this.setupPreview) throw new Error("\u8BF7\u5148\u68C0\u67E5\u672C\u5730\u4E0E\u8FDC\u7AEF\u6587\u4EF6");
    for (const path2 of this.setupPreview.overlaps) {
      if (!this.setupChoices[path2]) throw new Error(`\u8BF7\u9009\u62E9\u540C\u540D\u6587\u4EF6\u7684\u4FDD\u7559\u7248\u672C\uFF1A${path2}`);
    }
    if ((this.setupPreview.trackedExcludedLocal.length || this.setupPreview.trackedExcludedRemote.length) && !this.setupTrackingChoice) {
      throw new Error("\u8BF7\u5148\u9009\u62E9\u5982\u4F55\u5904\u7406\u5DF2\u88AB Git \u8DDF\u8E2A\u7684\u5FFD\u7565\u6587\u4EF6\u3002");
    }
    this.settings.setupStep = 4;
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
    }, /* @__PURE__ */ new Set(), this.setupTrackingChoice === "rebuild");
    preview.missingIgnoreRules = [];
    this.settings.gitRemoteUrl = verified.url;
    this.settings.gitBranch = verified.branch;
    this.settings.setupComplete = true;
    this.settings.setupBackup = void 0;
    this.settings.setupMutationStarted = false;
    await this.saveSettings();
    await this.restartDesktopAutomation();
    this.setStatus(skippedPaths.length > 0 ? `\u9996\u6B21\u63A5\u5165\u5B8C\u6210 \xB7 ${skippedPaths.length} \u4E2A\u9884\u89C8\u540E\u53D8\u5316\u7684\u6587\u4EF6\u7559\u5F85\u540E\u7EED Commit` : "\u9996\u6B21\u63A5\u5165\u5B8C\u6210");
    if (skippedPaths.length > 0) new import_obsidian2.Notice(`\u9996\u6B21\u63A8\u9001\u6210\u529F\uFF1B${skippedPaths.length} \u4E2A\u9884\u89C8\u540E\u53D8\u5316\u7684\u6587\u4EF6\u672A\u63D0\u4EA4\uFF0C\u540E\u7EED\u5C06\u81EA\u52A8 Commit\u3002`, 1e4);
    await this.refreshSyncView();
  }
  vaultBasePath() {
    const adapter = this.app.vault.adapter;
    if (!(adapter instanceof import_obsidian2.FileSystemAdapter)) throw new Error("\u5F53\u524D\u5E73\u53F0\u6CA1\u6709\u53EF\u7528\u7684\u672C\u5730 Vault \u8DEF\u5F84");
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
  async exec(program, args, authenticated = false, trim = true, timeoutMs = 12e4, onOutput, stdinText, signal) {
    const nodeRequire3 = globalThis.require;
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
    const repos = await findNestedRepos(vaultPath);
    if (!repos.length) return;
    const nodeRequire3 = globalThis.require;
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
    await rebuildNestedRepoTracking(vaultPath, repos, (args) => this.gitRaw(args));
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
    if (import_obsidian2.Platform.isMobile) return [];
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
      new import_obsidian2.Notice(`Simple Link\uFF1A\u65E0\u6CD5\u7EE7\u7EED\u5904\u7406\u51B2\u7A81\u3002${messageOf2(error)}`, 12e3);
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
var CreatePrivateRepositoryModal = class extends import_obsidian2.Modal {
  constructor(app) {
    super(app);
  }
  onOpen() {
    this.modalEl.addClass("zoey-sync-create-repo-modal");
    const body = this.contentEl;
    body.empty();
    body.createEl("h2", { text: "\u521B\u5EFA\u79C1\u4EBA\u4ED3\u5E93\u53C2\u8003" });
    body.createEl("a", {
      text: "\u624B\u52A8\u6253\u5F00 GitHub \u5EFA\u4ED3\u9875 \u2197",
      href: "https://github.com/new",
      attr: { target: "_blank", rel: "noopener noreferrer" }
    });
    body.createEl("p", { text: "\u82E5\u6539\u7528\u7F51\u9875\u5EFA\u4ED3\uFF0C\u5EFA\u8BAE\u4FDD\u6301\u4ED3\u5E93\u4E3A\u7A7A\uFF1B\u5EFA\u597D\u540E\u5207\u6362\u5230\u300C\u4F7F\u7528\u5DF2\u6709 GitHub \u4ED3\u5E93\u300D\u5E76\u6838\u9A8C\u5730\u5740\u3002" });
    const steps = body.createEl("ol");
    steps.createEl("li", { text: "\u9009\u62E9\u81EA\u5DF1\u7684\u8D26\u53F7\u4F5C\u4E3A Owner\uFF0C\u586B\u5199\u4ED3\u5E93\u540D\u79F0\u3002" });
    steps.createEl("li", { text: "\u5C06 Choose visibility \u8BBE\u4E3A Private\uFF08\u79C1\u4EBA\uFF09\u3002" });
    steps.createEl("li", { text: "\u4FDD\u6301 Add README \u4E3A Off\u3001Add .gitignore \u4E3A No .gitignore\u3001Add license \u4E3A No license\uFF0C\u521B\u5EFA\u7A7A\u4ED3\u5E93\u3002" });
    steps.createEl("li", { text: "\u70B9\u51FB Create repository\uFF1B\u521B\u5EFA\u540E\u590D\u5236\u4ED3\u5E93\u9875\u9762 Code \u83DC\u5355\u4E2D\u7684 HTTPS \u5730\u5740\uFF0C\u5728\u5411\u5BFC\u7B2C 2 \u6B65\u9009\u62E9\u5DF2\u6709\u4ED3\u5E93\u5E76\u6838\u9A8C\u3002" });
    const figure = body.createEl("figure", { cls: "zoey-sync-create-repo-modal__figure" });
    figure.createEl("img", {
      attr: {
        src: create_private_repository_default,
        alt: "GitHub \u521B\u5EFA\u4ED3\u5E93\u9875\u9762\u793A\u4F8B\uFF0C\u6807\u51FA\u4ED3\u5E93\u540D\u79F0\u8F93\u5165\u6846\u548C Private \u53EF\u89C1\u6027\u9009\u9879"
      }
    });
    figure.createEl("figcaption", { text: "\u56FE\u7247\u4EC5\u4F5C\u53C2\u8003\uFF1BGitHub \u9875\u9762\u5E03\u5C40\u53EF\u80FD\u66F4\u65B0\uFF0C\u8BF7\u4EE5\u9875\u9762\u4E0A\u7684\u5B57\u6BB5\u540D\u79F0\u4E3A\u51C6\u3002" });
  }
};
var GitRepairModal = class extends import_obsidian2.Modal {
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
      new import_obsidian2.Notice("Simple Link\uFF1A\u6B63\u5728\u6062\u590D\u672C\u673A\u7248\u672C\u5E76\u68C0\u67E5\u4E91\u7AEF\u66F4\u65B0\u2026", 8e3);
      void this.plugin.repairInterruptedGitOperation().then((result) => {
        new import_obsidian2.Notice(
          `Simple Link\uFF1A${result.operation} \u5F02\u5E38\u72B6\u6001\u5DF2\u9000\u51FA${result.restoredLocalChanges ? "\uFF0C\u672C\u673A\u4FEE\u6539\u5DF2\u6062\u590D" : ""}\uFF1B\u672C\u5730 Commit \u548C\u4E91\u7AEF\u5408\u5E76\u68C0\u67E5\u5DF2\u5B8C\u6210\uFF0C\u5C1A\u672A\u7ACB\u5373 Push`,
          1e4
        );
      }).catch((error) => {
        if (error instanceof SyncDeferredError) {
          new import_obsidian2.Notice("Simple Link\uFF1A\u5F02\u5E38\u72B6\u6001\u5DF2\u9000\u51FA\uFF0C\u672C\u673A\u5185\u5BB9\u5DF2\u91CD\u65B0 Commit\uFF1B\u5408\u5E76\u51B2\u7A81\u5DF2\u4FDD\u7559\u5728\u540C\u6B65\u9762\u677F\u7B49\u5F85\u5904\u7406", 12e3);
        } else {
          new import_obsidian2.Notice(`Simple Link\uFF1A\u5F02\u5E38\u4FEE\u590D\u672A\u5B8C\u6210\u3002${messageOf2(error)}`, 15e3);
        }
      });
    });
  }
};
var LocalHistorySlimModal = class extends import_obsidian2.Modal {
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
    body.createEl("p", { text: "\u5DF2\u5B9E\u65F6\u6838\u5BF9 GitHub \u5206\u652F\u4E0E\u672C\u673A HEAD \u4E00\u81F4\uFF0C\u5F53\u524D\u63D0\u4EA4\u5DF2\u4E0A\u4F20\u3002\u6267\u884C\u65F6\u4F1A\u518D\u6838\u5BF9\u4E00\u6B21\u3002" });
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
        new import_obsidian2.Notice(`Simple Link\uFF1A\u672C\u5730\u53EF\u89C1 Commit ${before.totalCommits} \u2192 ${after.totalCommits}\uFF1BGit \u5BF9\u8C61\u7EA6 ${before.localSizeMiB.toFixed(1)} \u2192 ${after.localSizeMiB.toFixed(1)} MiB\u3002`, 12e3);
      }).catch((error) => {
        this.running = false;
        confirm.disabled = false;
        confirm.setText("\u6E05\u7406\u672C\u673A\u65E7\u5386\u53F2");
        new import_obsidian2.Notice(`Simple Link\uFF1A\u6E05\u7406\u672A\u5B8C\u6210\u3002${messageOf2(error)}`, 15e3);
      });
    });
    if (this.preview.oldCommits === 0) {
      body.createEl("p", { text: "\u5F53\u524D\u6CA1\u6709\u65E9\u4E8E 30 \u5929\u7684\u53EF\u89C1 Commit\uFF0C\u65E0\u9700\u6E05\u7406\u3002" });
    }
  }
};
var _ZoeySyncConflictView = class _ZoeySyncConflictView extends import_obsidian2.ItemView {
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
    const resolutions = new Array(blocks.length);
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
    applyButton.addEventListener("click", async () => {
      if (resolutions.some((item) => item === void 0)) return;
      applyButton.disabled = true;
      try {
        await this.plugin.applyConflictText(path2, applyConflictResolutions(content, blocks, resolutions));
        await this.advance();
      } catch (error) {
        new import_obsidian2.Notice(`\u65E0\u6CD5\u5E94\u7528\u51B2\u7A81\u5904\u7406\u7ED3\u679C\uFF1A${messageOf2(error)}`, 8e3);
        applyButton.disabled = false;
      }
    });
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
    const explanation = footer.createEl("span", {
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
var ErrorLogModal = class extends import_obsidian2.Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
  }
  onOpen() {
    this.modalEl.addClass("zoey-sync-error-modal");
    this.render();
  }
  async render() {
    const lastCommitAt = await this.plugin.getLatestCommitAt();
    const container = this.contentEl;
    container.empty();
    const overview = container.createDiv({ cls: "zoey-sync-error-modal__overview" });
    const heading = overview.createDiv();
    heading.createEl("h2", { text: "\u6700\u8FD1\u540C\u6B65\u65E5\u5FD7" });
    heading.createEl("p", {
      text: "\u4EC5\u4FDD\u7559\u6700\u8FD1 24 \u5C0F\u65F6\u7684 Commit\u3001\u540C\u6B65\u548C\u8FDE\u63A5\u8BB0\u5F55\u3002",
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
      clearButton.addEventListener("click", async () => {
        await this.plugin.clearErrorLogs();
        await this.render();
      });
    }
    const closeButton = actions.createEl("button", { text: "\u5173\u95ED", cls: "mod-cta" });
    closeButton.addEventListener("click", () => this.close());
  }
};
var _ZoeySyncView = class _ZoeySyncView extends import_obsidian2.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.renderGeneration = 0;
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
    await this.render();
  }
  updateActivity(state) {
    const container = this.containerEl.children[1];
    const status = container.querySelector(".zoey-sync-view__status");
    if (!status) return;
    status.className = `zoey-sync-view__status is-${state.tone}`;
    status.querySelector(".zoey-sync-view__status-text")?.setText(state.text);
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
    container.addClass("zoey-sync-view");
    const recentLogs = this.plugin.getRecentErrorLogs();
    const hasActiveError = !!this.plugin.getActiveSyncError() || recentLogs[0]?.status === "error";
    const header = container.createDiv({ cls: "zoey-sync-view__header" });
    const actions = header.createDiv({ cls: "zoey-sync-view__actions" });
    const layoutButton = actions.createDiv({ cls: "clickable-icon nav-action-button" });
    layoutButton.setAttr("role", "button");
    layoutButton.setAttr("tabindex", "0");
    layoutButton.setAttr("aria-label", "\u66F4\u6539\u5E03\u5C40");
    (0, import_obsidian2.setIcon)(layoutButton, LAYOUT_SWITCH_ICON);
    layoutButton.addEventListener("click", () => void this.plugin.toggleViewLayout());
    const refreshButton = actions.createDiv({ cls: "clickable-icon nav-action-button" });
    refreshButton.setAttr("role", "button");
    refreshButton.setAttr("tabindex", "0");
    refreshButton.setAttr("aria-label", "\u5237\u65B0\u66F4\u6539\u533A");
    (0, import_obsidian2.setIcon)(refreshButton, REFRESH_CHANGES_ICON);
    refreshButton.addEventListener("click", () => void this.render());
    if (recentLogs.length > 0) {
      const errorButton = actions.createDiv({
        cls: `clickable-icon nav-action-button zoey-sync-view__error-button${hasActiveError ? " is-active" : ""}`
      });
      errorButton.setAttr("role", "button");
      errorButton.setAttr("tabindex", "0");
      errorButton.setAttr("aria-label", `\u67E5\u770B\u6700\u8FD1\u540C\u6B65\u65E5\u5FD7\uFF0C\u5171 ${recentLogs.length} \u6761`);
      (0, import_obsidian2.setIcon)(errorButton, hasActiveError ? "triangle-alert" : "history");
      (0, import_obsidian2.setTooltip)(errorButton, `\u67E5\u770B\u6700\u8FD1\u540C\u6B65\u65E5\u5FD7\uFF08${recentLogs.length}\uFF09`);
      errorButton.addEventListener("click", () => new ErrorLogModal(this.app, this.plugin).open());
    }
    const settingsButton = actions.createDiv({ cls: "clickable-icon nav-action-button" });
    settingsButton.setAttr("role", "button");
    settingsButton.setAttr("tabindex", "0");
    settingsButton.setAttr("aria-label", "\u540C\u6B65\u9762\u677F\u8BBE\u7F6E");
    (0, import_obsidian2.setIcon)(settingsButton, "settings");
    (0, import_obsidian2.setTooltip)(settingsButton, "\u540C\u6B65\u9762\u677F\u8BBE\u7F6E");
    settingsButton.addEventListener("click", (event) => this.openViewSettingsMenu(event));
    const status = container.createDiv({ cls: "zoey-sync-view__status" });
    status.addClass(`is-${statusState.tone}`);
    const statusDot = status.createSpan({ cls: "zoey-sync-view__status-dot" });
    status.createSpan({ text: statusState.text, cls: "zoey-sync-view__status-text" });
    if (pendingConflictPaths.length > 0) {
      const reminder = container.createDiv({ cls: "zoey-sync-view__conflict-reminder" });
      (0, import_obsidian2.setIcon)(reminder.createSpan({ cls: "zoey-sync-view__conflict-reminder-icon" }), "triangle-alert");
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
      (0, import_obsidian2.setIcon)(reminder.createSpan({ cls: "zoey-sync-view__conflict-reminder-icon" }), "triangle-alert");
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
    (0, import_obsidian2.setIcon)(actionSpinner, "loader-circle");
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
        const empty = section.createDiv({ cls: "zoey-sync-view__empty" });
        (0, import_obsidian2.setIcon)(empty.createSpan(), "check-circle-2");
        empty.createSpan({ text: mode === "upload" ? "\u6CA1\u6709\u5F85\u4E0A\u4F20\u6587\u4EF6" : "\u6CA1\u6709\u5F85 Commit \u6587\u4EF6" });
      } else if (this.plugin.settings.viewLayout === "tree") {
        this.renderTree(section, changes);
      } else {
        for (const change of changes) this.renderChange(section, change, true);
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
      button.innerHTML = svg;
      (0, import_obsidian2.setTooltip)(button, tooltip);
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
    const menu = new import_obsidian2.Menu();
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
    if (!import_obsidian2.Platform.isMobile && !this.plugin.settings.setupComplete) {
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
    const lastSyncText = lastSyncAt ? `${import_obsidian2.Platform.isMobile ? "\u4E0A\u6B21\u540C\u6B65" : "\u4E0A\u6B21 Push"} ${formatRelativeTime(lastSyncAt)}` : import_obsidian2.Platform.isMobile ? "\u5C1A\u672A\u540C\u6B65" : "\u5C1A\u672A Push";
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
      text: import_obsidian2.Platform.isMobile ? lastSyncAt ? `\u5DF2\u540C\u6B65 \xB7 ${formatRelativeTime(lastSyncAt)}` : "\u5DF2\u540C\u6B65 \xB7 \u5C1A\u65E0\u65F6\u95F4\u8BB0\u5F55" : lastSyncAt ? `\u5DF2\u4E0A\u4F20 \xB7 ${formatRelativeTime(lastSyncAt)}` : "\u5DF2\u4E0A\u4F20 \xB7 \u5C1A\u65E0 Push \u8BB0\u5F55"
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
      (0, import_obsidian2.setIcon)(label.createSpan(), "folder-closed");
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
var ZoeySyncSettingTab = class extends import_obsidian2.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.desktopPage = "root";
    this.setupPanel = "guide";
    this.setupViewStep = 1;
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
    this.setupMessage = "";
    this.setupFailure = false;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("zoey-sync-settings");
    containerEl.toggleClass("zoey-sync-setup-page", this.desktopPage === "setup" && !import_obsidian2.Platform.isMobile);
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
    if (!import_obsidian2.Platform.isMobile && this.desktopPage === "setup") {
      this.displaySetup(containerEl);
      return;
    }
    containerEl.createEl("h2", { text: "Simple Link" });
    this.addEnableSetting(containerEl);
    this.displayDesktop(containerEl);
  }
  addEnableSetting(parent) {
    new import_obsidian2.Setting(parent).setName("\u542F\u7528 Simple Link").setDesc("\u663E\u793A\u53F3\u4FA7\u540C\u6B65\u9762\u677F\uFF0C\u5E76\u5141\u8BB8\u624B\u52A8\u6216\u5B9A\u65F6\u540C\u6B65\u3002\u5173\u95ED\u540E\u4FDD\u7559\u914D\u7F6E\uFF0C\u4F46\u505C\u6B62\u672C\u63D2\u4EF6\u7684\u540C\u6B65\u5DE5\u4F5C\u3002").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.enabled).onChange(async (value) => {
        await this.plugin.setFeatureEnabled(value);
        this.display();
      })
    );
  }
  displayMobile(containerEl) {
    containerEl.createEl("h3", { text: "\u624B\u673A\u7AEF\u8BBE\u7F6E", cls: "zoey-sync-section-title" });
    containerEl.createEl("p", {
      text: "\u79FB\u52A8\u7AEF\u517C\u5BB9\u4ECD\u5728\u5B8C\u5584\uFF0C\u4EE5\u4E0B\u4EC5\u4FDD\u7559\u5F53\u524D\u5DF2\u7ECF\u5B9E\u73B0\u7684\u670D\u52A1\u5668\u540C\u6B65\u8BBE\u7F6E\u3002",
      cls: "zoey-sync-section-desc"
    });
    new import_obsidian2.Setting(containerEl).setName("\u670D\u52A1\u5668\u5730\u5740").setDesc("\u516C\u7F51\u5FC5\u987B\u4F7F\u7528 HTTPS\uFF0C\u4F8B\u5982 https://sync.example.com\u3002").addText(
      (text) => text.setPlaceholder("https://sync.example.com").setValue(this.plugin.settings.serverUrl).onChange(async (value) => {
        this.plugin.settings.serverUrl = value.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian2.Setting(containerEl).setName("\u8BA4\u8BC1\u5BC6\u7801").setDesc("\u4FDD\u5B58\u5728\u672C\u673A\u63D2\u4EF6\u6570\u636E\u4E2D\uFF1B\u8BE5\u6587\u4EF6\u5DF2\u52A0\u5165 Git \u5FFD\u7565\u3002").addText((text) => {
      text.inputEl.type = "password";
      text.setValue(this.plugin.settings.serverPassword).onChange(async (value) => {
        this.plugin.settings.serverPassword = value;
        await this.plugin.saveSettings();
      });
    });
    new import_obsidian2.Setting(containerEl).setName("\u8BBE\u5907\u540D\u79F0").addText(
      (text) => text.setValue(this.plugin.settings.deviceName).onChange(async (value) => {
        this.plugin.settings.deviceName = value.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian2.Setting(containerEl).setName("\u81EA\u52A8\u540C\u6B65\u95F4\u9694\uFF08\u5206\u949F\uFF09").addText(
      (text) => text.setValue(String(this.plugin.settings.mobileAutoSyncMinutes)).onChange(async (value) => {
        this.plugin.settings.mobileAutoSyncMinutes = Math.max(0, Number(value) || 0);
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian2.Setting(containerEl).setName("\u6307\u4EE4\u68C0\u67E5\u95F4\u9694\uFF08\u79D2\uFF09").addText(
      (text) => text.setValue(String(this.plugin.settings.commandPollSeconds)).onChange(async (value) => {
        this.plugin.settings.commandPollSeconds = Math.max(15, Number(value) || 60);
        await this.plugin.saveSettings();
      })
    );
  }
  currentDevice() {
    if (import_obsidian2.Platform.isMobile) return "mobile";
    return typeof process !== "undefined" && process.platform === "linux" ? "server" : "git";
  }
  addCurrentDeviceBadge(button) {
    button.createSpan({ text: "\u7CFB\u7EDF\u8BC6\u522B \xB7 \u5F53\u524D\u8BBE\u5907", cls: "zoey-sync-device-badge" });
  }
  displayDesktop(containerEl) {
    const currentDevice = this.currentDevice();
    containerEl.createEl("h3", { text: "\u8BBE\u5907\u540C\u6B65", cls: "zoey-sync-section-title" });
    containerEl.createEl("p", { text: "\u5DF2\u81EA\u52A8\u8BC6\u522B\u5F53\u524D\u8BBE\u5907\uFF0C\u5E76\u505C\u7528\u5176\u4ED6\u5E73\u53F0\u7684\u540C\u6B65\u8BBE\u7F6E\u3002", cls: "zoey-sync-section-desc" });
    this.addSetupEntry(containerEl, currentDevice === "git");
    const entries = [
      { page: "mobile", title: "\u624B\u673A\u7AEF\u540C\u6B65", desc: "Android / iOS \xB7 \u8F7B\u91CF\u7248 Git \u540C\u6B65", icon: "smartphone" },
      { page: "server", title: "\u670D\u52A1\u5668\u7AEF\u540C\u6B65", desc: "Linux \xB7 \u670D\u52A1\u5668\u540C\u6B65\u8BBE\u7F6E", icon: "server" }
    ];
    for (const entry of entries) {
      const isCurrent = currentDevice === entry.page;
      const button = containerEl.createEl("button", {
        cls: `zoey-sync-page-link zoey-sync-device-link${isCurrent ? "" : " is-disabled"}`,
        attr: { type: "button" }
      });
      button.disabled = !isCurrent;
      (0, import_obsidian2.setIcon)(button.createSpan({ cls: "zoey-sync-page-link__icon" }), entry.icon);
      const copy = button.createSpan({ cls: "zoey-sync-page-link__copy" });
      copy.createSpan({ text: entry.title, cls: "zoey-sync-page-link__title" });
      copy.createSpan({ text: entry.desc, cls: "zoey-sync-page-link__desc" });
      if (isCurrent) {
        this.addCurrentDeviceBadge(button);
        (0, import_obsidian2.setIcon)(button.createSpan({ cls: "zoey-sync-page-link__chevron" }), "chevron-right");
        button.addEventListener("click", () => {
          this.desktopPage = entry.page;
          this.display();
        });
      }
    }
  }
  displayDevicePreview(containerEl, title, description, backPage = "root") {
    const header = containerEl.createDiv({ cls: "zoey-sync-page-header" });
    const back = header.createEl("button", { cls: "clickable-icon zoey-sync-page-back", attr: { type: "button", "aria-label": "\u8FD4\u56DE\u8BBE\u5907\u540C\u6B65" } });
    (0, import_obsidian2.setIcon)(back, "arrow-left");
    back.addEventListener("click", () => {
      this.desktopPage = backPage;
      this.display();
    });
    header.createEl("h2", { text: title, cls: "zoey-sync-page-title" });
    containerEl.createEl("p", { text: description, cls: "zoey-sync-section-desc" });
  }
  displayServerPreview(containerEl) {
    this.displayDevicePreview(containerEl, "\u670D\u52A1\u5668\u7AEF\u540C\u6B65", "Linux \u670D\u52A1\u5668\u7AEF\u7684\u540C\u6B65\u8BBE\u7F6E\u5C06\u5728\u8FD9\u91CC\u8865\u5145\u3002");
    containerEl.createEl("h3", { text: "\u5F85\u66F4\u65B0", cls: "zoey-sync-section-title" });
    const todo = containerEl.createEl("ul");
    todo.createEl("li", { text: "\u672C\u5730 Git \u5386\u53F2\u7626\u8EAB\uFF1A\u4EC5\u6574\u7406\u670D\u52A1\u5668\u672C\u673A\u7684\u65E7\u5386\u53F2\uFF0C\u4FDD\u7559 GitHub \u4E0A\u7684\u5B8C\u6574\u5386\u53F2\uFF1B\u6267\u884C\u524D\u786E\u8BA4\u672C\u5730\u63D0\u4EA4\u5DF2\u4E0A\u4F20\u3002" });
    todo.createEl("li", { text: "\u6309 .gitignore \u91CD\u5EFA\u8FFD\u8E2A\uFF1A\u8BA9\u5DF2\u8FFD\u8E2A\u3001\u540E\u6765\u88AB\u5FFD\u7565\u7684\u6587\u4EF6\u9000\u51FA Git \u7D22\u5F15\uFF0C\u4FDD\u7559\u670D\u52A1\u5668\u672C\u673A\u6587\u4EF6\uFF1B\u4E0D\u6539\u53D8\u624B\u673A\u7AEF\u7684\u6587\u4EF6\u62C9\u53D6\u8BBE\u7F6E\u3002" });
    todo.createEl("li", { text: "\u7535\u8111\u7AEF\u548C\u624B\u673A\u7AEF\u540C\u6B65\u9875\u5F85\u589E\u52A0\u300C\u9AD8\u7EA7\u8BBE\u7F6E\u300D\uFF1A\u9876\u90E8\u653E\u4FBF\u6377\u5F00\u5173\uFF0C\u4E0B\u9762\u5148\u653E\u300C\u91CD\u5EFA\u8FFD\u8E2A\u300D\uFF0C\u6700\u540E\u653E\u300C\u9884\u89C8\u5F53\u524D\u7684\u300D\uFF1B\u5177\u4F53\u8FFD\u8E2A\u8303\u56F4\u5F85\u786E\u8BA4\u3002" });
    todo.createEl("li", { text: "\u5F85\u51B3\u5B9A .obsidian \u76EE\u5F55\u7684\u7B56\u7565\uFF1A\u6574\u76EE\u5F55\u9000\u51FA Git \u8FFD\u8E2A\uFF0C\u6216\u6309\u6838\u5FC3\u914D\u7F6E\u3001\u63D2\u4EF6\u3001\u4E3B\u9898\u5206\u7C7B\u4FDD\u7559\uFF1B\u6BCF\u53F0\u8BBE\u5907\u7684\u4E0B\u8F7D\u8303\u56F4\u53E6\u884C\u8BBE\u7F6E\u3002" });
    todo.createEl("li", { text: "\u7EF4\u62A4\u4EFB\u52A1\u4E0E\u540C\u6B65\u64CD\u4F5C\u9519\u5F00\u6267\u884C\uFF0C\u5E76\u5C55\u793A\u68C0\u67E5\u7ED3\u679C\u3001\u6267\u884C\u8BB0\u5F55\u548C\u64CD\u4F5C\u524D\u540E\u7684\u7A7A\u95F4\u5360\u7528\u3002" });
  }
  displayMobilePreview(containerEl) {
    if (this.currentDevice() === "mobile") {
      this.displayDevicePreview(containerEl, "\u624B\u673A\u7AEF\u540C\u6B65", "\u5F53\u524D\u8BBE\u5907\u7684\u670D\u52A1\u5668\u540C\u6B65\u8BBE\u7F6E\u3002");
      this.displayMobile(containerEl);
    } else {
      this.displayDevicePreview(containerEl, "\u624B\u673A\u7AEF\u540C\u6B65", "Android / iOS \u8F7B\u91CF\u7248 Git \u540C\u6B65\u8BBE\u7F6E\u5C06\u5728\u8FD9\u91CC\u8865\u5145\u3002");
    }
    for (const guide of [
      { page: "android-guide", title: "\u4ECE\u96F6\u5F00\u59CB\u7684 Git \u540C\u6B65\u4F7F\u7528\u6307\u5357\uFF08Android\uFF09" },
      { page: "ios-guide", title: "\u4ECE\u96F6\u5F00\u59CB\u7684 Git \u540C\u6B65\u4F7F\u7528\u6307\u5357\uFF08iOS\uFF09" }
    ]) {
      const button = containerEl.createEl("button", { cls: "zoey-sync-page-link zoey-sync-device-link is-preview", attr: { type: "button" } });
      (0, import_obsidian2.setIcon)(button.createSpan({ cls: "zoey-sync-page-link__icon" }), "book-open");
      const copy = button.createSpan({ cls: "zoey-sync-page-link__copy" });
      copy.createSpan({ text: guide.title, cls: "zoey-sync-page-link__title" });
      copy.createSpan({ text: "\u5F85\u8865\u5145", cls: "zoey-sync-page-link__desc" });
      (0, import_obsidian2.setIcon)(button.createSpan({ cls: "zoey-sync-page-link__chevron" }), "chevron-right");
      button.addEventListener("click", () => {
        this.desktopPage = guide.page;
        this.display();
      });
    }
  }
  addSetupEntry(parent, isCurrent) {
    const button = parent.createEl("button", { cls: `zoey-sync-page-link zoey-sync-device-link zoey-sync-device-link--desktop${isCurrent ? "" : " is-disabled"}`, attr: { type: "button" } });
    button.disabled = !isCurrent;
    (0, import_obsidian2.setIcon)(button.createSpan({ cls: "zoey-sync-page-link__icon" }), "monitor");
    const copy = button.createSpan({ cls: "zoey-sync-page-link__copy" });
    copy.createSpan({ text: "\u7535\u8111\u7AEF Git \u540C\u6B65", cls: "zoey-sync-page-link__title" });
    copy.createSpan({ text: this.desktopSetupStatusText(), cls: "zoey-sync-page-link__desc" });
    if (!isCurrent) return;
    this.addCurrentDeviceBadge(button);
    (0, import_obsidian2.setIcon)(button.createSpan({ cls: "zoey-sync-page-link__chevron" }), "chevron-right");
    button.addEventListener("click", () => {
      this.desktopPage = "setup";
      this.setupPanel = "guide";
      this.stopSetupBrowserAuthorization();
      this.setupAuthMode = null;
      this.setupAuthVerified = false;
      this.setupFailure = false;
      this.setupViewStep = !this.plugin.settings.setupComplete && this.plugin.settings.setupStep === 4 && !this.plugin.getSetupPreview() ? 3 : this.plugin.settings.setupStep;
      this.setupRepoInput = this.plugin.settings.setupRepoUrl || this.plugin.settings.gitRemoteUrl;
      this.setupRepoMode = "existing";
      this.display();
    });
  }
  desktopSetupStatusText() {
    const { setupComplete, setupVerified, setupMutationStarted, setupStep, setupBackup } = this.plugin.settings;
    if (setupMutationStarted) return "\u63A5\u5165\u672A\u5B8C\u6210\uFF0C\u8BF7\u7EE7\u7EED\u5F15\u5BFC";
    if (setupComplete) return setupVerified ? "\u5DF2\u5B8C\u6210\u63A5\u5165" : "\u5DF2\u6709\u8FDE\u63A5\uFF0C\u5F85\u6838\u9A8C";
    if (setupStep > 1 || setupBackup) return "\u63A5\u5165\u8FDB\u884C\u4E2D\uFF0C\u8BF7\u7EE7\u7EED\u5F15\u5BFC";
    return "\u5F53\u524D\u672A\u63A5\u5165\uFF0C\u53EF\u901A\u8FC7\u5F15\u5BFC\u4ECE0\u5F00\u59CB\u5C1D\u8BD5Git\u540C\u6B65";
  }
  setupLink(parent, label, href) {
    parent.createEl("a", { text: label, href, attr: { target: "_blank", rel: "noopener noreferrer" } });
  }
  async runSetup(action, success, advanceView = true) {
    if (this.setupBusy) return;
    this.setupBusy = true;
    this.setupFailure = false;
    this.setupMessage = "\u6B63\u5728\u68C0\u67E5\uFF0C\u8BF7\u7A0D\u5019\u2026";
    this.display();
    try {
      await action();
      this.setupMessage = success;
      if (advanceView) this.setupViewStep = this.plugin.settings.setupStep;
    } catch (error) {
      this.setupFailure = true;
      this.setupMessage = explainSetupError(error);
      new import_obsidian2.Notice(`Simple Link\uFF1A${this.setupMessage}`, 1e4);
    } finally {
      this.setupBusy = false;
      this.display();
    }
  }
  verifySetupAuthorization(action, success) {
    this.setupAuthVerified = false;
    void this.runSetup(async () => {
      await action();
      this.setupAuthVerified = true;
    }, success, false);
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
    const controller = new AbortController();
    this.setupBrowserController = controller;
    const request = ++this.setupBrowserRequest;
    this.setupBrowserPending = true;
    this.setupFailure = false;
    this.setupDeviceCode = "";
    this.setupMessage = "\u6B63\u5728\u83B7\u53D6\u8BBE\u5907\u7801\u2026";
    this.display();
    try {
      await this.plugin.authorizeSetup((code) => {
        if (request !== this.setupBrowserRequest) return;
        this.setupDeviceCode = code;
        this.setupMessage = "";
        this.display();
      }, controller.signal);
      if (request !== this.setupBrowserRequest) return;
    } catch (error) {
      if (request !== this.setupBrowserRequest || controller.signal.aborted) return;
      this.setupFailure = true;
      this.setupMessage = explainSetupError(error);
      new import_obsidian2.Notice(`Simple Link\uFF1A${this.setupMessage}`, 1e4);
    } finally {
      if (request === this.setupBrowserRequest) {
        this.setupBrowserPending = false;
        this.setupBrowserController = void 0;
        this.display();
      }
    }
  }
  displaySetup(containerEl) {
    const page = containerEl.createDiv({ cls: "zoey-sync-setup-layout" });
    const header = page.createDiv({ cls: "zoey-sync-page-header zoey-sync-setup-header" });
    const back = header.createEl("button", { cls: "clickable-icon zoey-sync-page-back", attr: { type: "button", title: "\u8FD4\u56DE", "aria-label": "\u8FD4\u56DE\u8BBE\u7F6E" } });
    (0, import_obsidian2.setIcon)(back, "arrow-left");
    back.addEventListener("click", () => {
      this.stopSetupBrowserAuthorization();
      this.desktopPage = "root";
      this.display();
    });
    header.createEl("h2", { text: "\u7535\u8111\u7AEF Git \u540C\u6B65", cls: "zoey-sync-page-title" });
    if (this.setupPanel === "guide") {
      page.createEl("p", { text: "\u6309\u987A\u5E8F\u5B8C\u6210\u56DB\u6B65\u3002\u5DF2\u6838\u9A8C\u7684\u6B65\u9AA4\u53EF\u4EE5\u968F\u65F6\u8FD4\u56DE\u67E5\u770B\u3002", cls: "zoey-sync-section-desc" });
    }
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
    (0, import_obsidian2.setIcon)(statusIcon, tone === "success" ? "check" : tone === "error" ? "triangle-alert" : "unplug");
    const copy = status.createDiv({ cls: "zoey-sync-setup-status__copy" });
    copy.createEl("strong", { text: title });
    copy.createEl("p", { text: description });
    if (guidedDone && this.plugin.settings.enabled) {
      const restart = status.createEl("button", { text: "\u91CD\u65B0\u68C0\u67E5\u6216\u4FEE\u590D\u63A5\u5165", attr: { type: "button" } });
      restart.addEventListener("click", () => {
        this.setupPanel = "guide";
        void this.runSetup(() => this.plugin.beginSetup(), "\u5DF2\u6682\u505C\u81EA\u52A8 Git \u64CD\u4F5C\uFF0C\u8BF7\u4ECE\u7B2C 1 \u6B65\u5F00\u59CB\u3002");
      });
    } else if (this.plugin.settings.setupComplete && !guidedDone) {
      const restart = status.createEl("button", { text: "\u4ECE\u7B2C\u4E00\u6B65\u91CD\u65B0\u68C0\u67E5\u63A5\u5165", attr: { type: "button" } });
      restart.addEventListener("click", () => {
        this.setupPanel = "guide";
        void this.runSetup(() => this.plugin.beginSetup(), "\u5DF2\u6682\u505C\u81EA\u52A8 Git \u64CD\u4F5C\uFF0C\u8BF7\u4ECE\u7B2C 1 \u6B65\u5F00\u59CB\u3002");
      });
    }
    const tabList = page.createDiv({ cls: "zoey-sync-setup-tabs", attr: { role: "tablist", "aria-label": "\u7535\u8111\u7AEF Git \u540C\u6B65\u8BBE\u7F6E" } });
    for (const panel2 of ["guide", "advanced"]) {
      const selected = this.setupPanel === panel2;
      const tab = tabList.createEl("button", {
        text: panel2 === "guide" ? "\u63A5\u5165\u5F15\u5BFC" : "\u9AD8\u7EA7\u8BBE\u7F6E",
        cls: `zoey-sync-setup-tab${selected ? " is-active" : ""}`,
        attr: {
          type: "button",
          id: `zoey-sync-setup-tab-${panel2}`,
          role: "tab",
          "aria-selected": String(selected),
          "aria-controls": "zoey-sync-setup-tab-panel"
        }
      });
      tab.addEventListener("click", () => {
        if (this.setupPanel === panel2) return;
        if (panel2 === "advanced") this.stopSetupBrowserAuthorization();
        this.setupPanel = panel2;
        this.display();
      });
    }
    const panel = page.createDiv({
      cls: "zoey-sync-setup-tab-panel",
      attr: { id: "zoey-sync-setup-tab-panel", role: "tabpanel", "aria-labelledby": `zoey-sync-setup-tab-${this.setupPanel}` }
    });
    if (this.setupPanel === "advanced") {
      this.displayDesktopAdvanced(panel);
      return;
    }
    if (!this.plugin.settings.setupComplete && this.plugin.settings.setupBackup && !this.plugin.settings.setupMutationStarted) {
      new import_obsidian2.Setting(panel).setDesc("\u9000\u51FA\u5411\u5BFC\u5E76\u6062\u590D\u4E4B\u524D\u5DF2\u914D\u7F6E\u7684\u81EA\u52A8\u540C\u6B65\u3002").addButton((button) => button.setButtonText("\u53D6\u6D88\u5411\u5BFC\uFF0C\u6062\u590D\u65E7\u540C\u6B65").onClick(() => void this.runSetup(() => this.plugin.cancelSetup(), "\u5DF2\u6062\u590D\u4E4B\u524D\u7684\u540C\u6B65\u914D\u7F6E\u3002")));
    }
    panel.createEl("div", { text: "\u63A5\u5165\u8FDB\u5EA6", cls: "zoey-sync-setup-progress-label" });
    const steps = ["\u5B89\u88C5\u4E0E\u6388\u6743", "\u9009\u62E9\u4ED3\u5E93", "\u68C0\u67E5\u4E24\u7AEF", "\u5B8C\u6210\u63A5\u5165"];
    const nav = panel.createDiv({ cls: "zoey-sync-setup-nav" });
    steps.forEach((label, index) => {
      const number = index + 1;
      const done = guidedDone || number < this.plugin.settings.setupStep;
      const tab = nav.createEl("button", { cls: `zoey-sync-setup-nav__step${done ? " is-done" : ""}${this.setupViewStep === number ? " is-active" : ""}`, attr: { type: "button", "aria-current": this.setupViewStep === number ? "step" : "false" } });
      tab.createSpan({ text: String(number), cls: "zoey-sync-setup-nav__marker" });
      tab.createSpan({ text: label, cls: "zoey-sync-setup-nav__label" });
      tab.disabled = !this.plugin.settings.setupComplete && number > this.plugin.settings.setupStep;
      tab.addEventListener("click", () => {
        this.setupViewStep = number;
        this.setupMessage = "";
        this.setupFailure = false;
        this.display();
      });
    });
    const body = panel.createDiv({ cls: "zoey-sync-card zoey-sync-setup-body" });
    const titles = ["\u5B89\u88C5\u4E0E\u6388\u6743", "\u9009\u62E9 GitHub \u79C1\u4EBA\u4ED3\u5E93", "\u68C0\u67E5\u672C\u5730\u4E0E\u8FDC\u7AEF", "\u5B8C\u6210\u63A5\u5165"];
    const descriptions = [
      "",
      "\u53EF\u4EE5\u6838\u9A8C\u5DF2\u6709\u4ED3\u5E93\uFF0C\u4E5F\u53EF\u4EE5\u7531\u63D2\u4EF6\u521B\u5EFA\u4E00\u4E2A\u65B0\u7684\u79C1\u4EBA\u4ED3\u5E93\u3002",
      "\u6838\u5BF9\u672C\u5730\u4E0E\u8FDC\u7AEF\u6587\u4EF6\uFF0C\u5E76\u51B3\u5B9A\u540C\u540D\u6587\u4EF6\u5982\u4F55\u5904\u7406\u3002",
      guidedDone ? "\u63A5\u5165\u5DF2\u5B8C\u6210\uFF0C\u53EF\u56DE\u770B\u6838\u9A8C\u7ED3\u679C\u6216\u91CD\u65B0\u68C0\u67E5\u4E24\u7AEF\u72B6\u6001\u3002" : "\u786E\u8BA4\u63A5\u5165\u4FE1\u606F\uFF0C\u7136\u540E\u6267\u884C\u9996\u6B21\u63A8\u9001\u3002"
    ];
    if (this.setupViewStep !== 1) {
      body.createEl("h3", { text: titles[this.setupViewStep - 1], cls: "zoey-sync-setup-step-title" });
      body.createEl("p", { text: descriptions[this.setupViewStep - 1], cls: "zoey-sync-setup-step-desc" });
    }
    if (this.setupViewStep === 1) this.displaySetupAuth(body);
    if (this.setupViewStep === 2) this.displaySetupRepo(body);
    if (this.setupViewStep === 3) this.displaySetupPreview(body);
    if (this.setupViewStep === 4) this.displaySetupFinish(body);
    if (this.setupMessage && this.setupViewStep !== 2) body.createEl("p", { text: this.setupMessage, cls: "zoey-sync-setup-message" });
  }
  displaySetupAuth(body) {
    body.addClass("zoey-sync-setup-intro", "zoey-sync-setup-platform-step");
    const heading = body.createDiv({ cls: "zoey-sync-setup-section-header" });
    heading.createEl("h4", { text: "\u9009\u62E9\u540C\u6B65\u5E73\u53F0" });
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
        this.display();
      });
    }
    if (this.setupPlatform === "gitee") body.createEl("p", { text: "Gitee \u5C1A\u672A\u505A\u5B9E\u9645\u517C\u5BB9\uFF0C\u8BF7\u9009\u62E9 GitHub \u7EE7\u7EED\u3002", cls: "zoey-sync-setup-intro__unavailable" });
    else {
      const platformContent = body.createDiv({ cls: "zoey-sync-setup-platform-content", attr: { role: "group", "aria-label": "GitHub \u63A5\u5165\u6B65\u9AA4" } });
      const toolsCard = platformContent.createDiv({ cls: "zoey-sync-setup-detail" });
      toolsCard.createEl("h4", { text: "\u5B89\u88C5\u5DE5\u5177" });
      toolsCard.createEl("p", { text: "\u7535\u8111\u7AEF\u9700\u8981 Git \u6267\u884C\u540C\u6B65\u547D\u4EE4\uFF0CGitHub CLI \u7528\u4E8E\u767B\u5F55\u3001\u5EFA\u4ED3\u548C\u4ED3\u5E93\u6838\u9A8C\u3002\u82E5\u6CA1\u6709 GitHub \u8D26\u53F7\uFF0C\u8BF7\u5148\u5B8C\u6210\u6CE8\u518C\u3002" });
      const downloadLinks = toolsCard.createDiv({ cls: "zoey-sync-setup-links" });
      this.setupLink(downloadLinks, "\u4E0B\u8F7D Git \u2197", "https://git-scm.com/downloads");
      this.setupLink(downloadLinks, "\u4E0B\u8F7D GitHub CLI \u2197", "https://cli.github.com/");
      const authCard = platformContent.createDiv({ cls: "zoey-sync-setup-detail zoey-sync-setup-auth" });
      authCard.createEl("h4", { text: "\u9009\u62E9 GitHub \u6388\u6743\u65B9\u5F0F" });
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
          else this.display();
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
          cls: `zoey-sync-setup-device-slot${this.setupDeviceCode ? " zoey-sync-setup-device-code" : ""}`,
          attr: { "aria-live": "polite" }
        });
        const copy = deviceAction.createEl("button", { cls: "zoey-sync-setup-device-icon-button", attr: { type: "button", "aria-label": "\u590D\u5236\u8BBE\u5907\u7801" } });
        (0, import_obsidian2.setIcon)(copy, "copy");
        (0, import_obsidian2.setTooltip)(copy, "\u590D\u5236\u8BBE\u5907\u7801");
        copy.disabled = !this.setupDeviceCode;
        copy.addEventListener("click", () => void navigator.clipboard.writeText(this.setupDeviceCode));
        const refresh = deviceAction.createEl("button", { cls: "zoey-sync-setup-device-icon-button", attr: { type: "button", "aria-label": "\u5237\u65B0\u8BBE\u5907\u7801" } });
        (0, import_obsidian2.setIcon)(refresh, "refresh-cw");
        (0, import_obsidian2.setTooltip)(refresh, "\u5237\u65B0\u8BBE\u5907\u7801");
        refresh.disabled = this.setupBusy;
        refresh.addEventListener("click", () => void this.startSetupBrowserAuthorization());
        new import_obsidian2.Setting(authCard).addButton((button) => button.setButtonText("\u5DF2\u586B\u5199\u8BBE\u5907\u7801\uFF0C\u9A8C\u8BC1\u6388\u6743").setCta().setDisabled(this.setupBusy || !this.setupDeviceCode).onClick(() => this.verifySetupAuthorization(() => this.plugin.checkSetupAuthorization(), "GitHub \u6388\u6743\u5DF2\u6838\u9A8C\u3002"))).settingEl.addClass("zoey-sync-setup-auth-action", "zoey-sync-setup-auth-submit");
      } else if (this.setupAuthMode === "token") {
        authCard.createEl("p", { text: "\u672C\u63D2\u4EF6\u4E0D\u5728\u8BBE\u7F6E\u4E2D\u4FDD\u5B58 Token\uFF1BToken \u4F1A\u4EA4\u7ED9\u672C\u673A GitHub CLI \u4FDD\u5B58\uFF0C\u7528\u4E8E\u767B\u5F55\u4E0E\u540E\u7EED\u540C\u6B65\u3002" });
        const tokenHint = authCard.createDiv({ cls: "zoey-sync-setup-token-hint" });
        const hintIcon = tokenHint.createSpan({ cls: "zoey-sync-setup-token-hint__icon", attr: { "aria-hidden": "true" } });
        (0, import_obsidian2.setIcon)(hintIcon, "circle-alert");
        tokenHint.createSpan({ text: "\u521B\u5EFA Classic Token \u65F6\uFF0C\u8BF7\u52FE\u9009 repo\u3001read:org \u548C gist\uFF1B\u4EC5\u5F53\u9700\u8981\u540C\u6B65 GitHub Actions \u5DE5\u4F5C\u6D41\u6587\u4EF6\u65F6\uFF0C\u518D\u52FE\u9009 workflow\u3002" });
        let tokenVerifyButton;
        const tokenSetting = new import_obsidian2.Setting(authCard).setName("GitHub Token").addText((text) => {
          text.setPlaceholder("\u7C98\u8D34 Token").setValue(this.setupTokenInput);
          text.inputEl.type = "password";
          text.inputEl.autocomplete = "off";
          text.onChange((value) => {
            this.setupTokenInput = value;
            if (tokenVerifyButton) tokenVerifyButton.disabled = this.setupBusy || !value.trim();
          });
        });
        tokenSetting.settingEl.addClass("zoey-sync-setup-token-setting");
        this.setupLink(tokenSetting.descEl, "\u524D\u5F80 GitHub \u521B\u5EFA Token \u2197", "https://github.com/settings/tokens");
        new import_obsidian2.Setting(authCard).addButton((button) => {
          tokenVerifyButton = button.buttonEl;
          button.setButtonText("\u5DF2\u586B\u5199 Token\uFF0C\u9A8C\u8BC1\u6388\u6743").setCta().setDisabled(this.setupBusy || !this.setupTokenInput.trim()).onClick(() => {
            const token = this.setupTokenInput;
            this.setupTokenInput = "";
            this.verifySetupAuthorization(() => this.plugin.authorizeSetupWithToken(token), "GitHub Token \u5DF2\u901A\u8FC7 GitHub CLI \u6838\u9A8C\u3002");
          });
        }).settingEl.addClass("zoey-sync-setup-auth-action", "zoey-sync-setup-auth-submit");
      } else if (this.setupAuthMode === "verify") {
        authCard.createEl("p", { text: "\u5982\u679C\u5DF2\u5728\u672C\u673A\u901A\u8FC7 GitHub CLI \u767B\u5F55\uFF0C\u53EF\u4EE5\u76F4\u63A5\u6838\u9A8C\u5F53\u524D\u6388\u6743\u72B6\u6001\u3002" });
        new import_obsidian2.Setting(authCard).addButton((button) => button.setButtonText("\u5DF2\u767B\u5F55 GitHub CLI\uFF0C\u9A8C\u8BC1\u6388\u6743").setCta().setDisabled(this.setupBusy).onClick(() => this.verifySetupAuthorization(() => this.plugin.checkSetupAuthorization(), "GitHub \u6388\u6743\u5DF2\u6838\u9A8C\u3002"))).settingEl.addClass("zoey-sync-setup-auth-action", "zoey-sync-setup-auth-submit");
      }
      if (this.setupAuthVerified) authCard.createEl("p", { text: "\u2713 GitHub \u6388\u6743\u5DF2\u6838\u9A8C", cls: "zoey-sync-setup-done" });
    }
    const footer = body.createDiv({ cls: "zoey-sync-setup-footer" });
    const next = footer.createEl("button", { text: "\u4E0B\u4E00\u6B65", cls: "mod-cta", attr: { type: "button" } });
    next.disabled = this.setupPlatform !== "github" || this.setupBusy || !this.setupAuthVerified;
    next.addEventListener("click", () => {
      this.setupViewStep = 2;
      this.setupMessage = "";
      this.display();
    });
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
        this.display();
      });
    }
    const card = body.createDiv({ cls: "zoey-sync-setup-detail" });
    if (this.setupRepoMode === "existing") {
      card.createEl("h4", { text: "\u6838\u9A8C\u5DF2\u6709 GitHub \u4ED3\u5E93" });
      card.createEl("p", { text: "\u5728\u5DF2\u6709 GitHub \u4ED3\u5E93\u9875\u9762\u70B9\u51FB\u300CCode\u300D\uFF0C\u590D\u5236 HTTPS \u5730\u5740\u5E76\u586B\u5165\u4E0B\u65B9\u3002" });
      card.createEl("p", { text: "\u6838\u9A8C\u4F1A\u68C0\u67E5\u4ED3\u5E93\u662F\u5426\u4E3A\u79C1\u6709\uFF0C\u4EE5\u53CA\u5F53\u524D\u767B\u5F55\u8D26\u53F7\u662F\u5426\u5177\u6709\u5199\u5165\u6743\u9650\u3002", cls: "zoey-sync-setup-helper" });
      const repoUrlSetting = new import_obsidian2.Setting(card).setName("GitHub \u4ED3\u5E93\u5730\u5740").addText((text) => text.setPlaceholder("https://github.com/user/vault.git").setValue(this.setupRepoInput).onChange((value) => {
        this.setupRepoInput = value.trim();
        this.updateSetupNextButton(body);
      }));
      repoUrlSetting.settingEl.addClass("zoey-sync-setup-repo-url");
      new import_obsidian2.Setting(card).addButton((button) => button.setButtonText("\u68C0\u67E5\u4ED3\u5E93").setCta().setDisabled(this.setupBusy).onClick(() => void this.runSetup(() => this.plugin.verifySetupRepository(this.setupRepoInput), "\u5DF2\u6838\u9A8C\uFF1A\u79C1\u6709\u4ED3\u5E93\uFF0C\u5F53\u524D\u8D26\u53F7\u6709\u5199\u5165\u6743\u9650\u3002", false))).settingEl.addClass("zoey-sync-setup-action", "zoey-sync-setup-check-action", "zoey-sync-setup-auth-submit");
    } else {
      const heading = card.createDiv({ cls: "zoey-sync-setup-section-header" });
      heading.createEl("h4", { text: "\u521B\u5EFA GitHub \u65B0\u4ED3\u5E93" });
      const guide = heading.createEl("button", { text: "\u67E5\u770B\u6559\u7A0B", cls: "zoey-sync-setup-guide-button", attr: { type: "button" } });
      guide.addEventListener("click", () => new CreatePrivateRepositoryModal(this.app).open());
      card.createEl("p", { text: "\u586B\u5199\u4ED3\u5E93\u540D\u79F0\u540E\uFF0C\u63D2\u4EF6\u4F1A\u5728\u5F53\u524D GitHub \u8D26\u53F7\u4E0B\u521B\u5EFA\u4E00\u4E2A\u7A7A\u7684 Private\uFF08\u79C1\u4EBA\uFF09\u4ED3\u5E93\u3002\u6B64\u65F6\u4E0D\u4F1A\u63A8\u9001\u672C\u5730\u6587\u4EF6\u3002" });
      new import_obsidian2.Setting(card).setName("\u65B0\u4ED3\u5E93\u540D\u79F0").addText((text) => text.setPlaceholder("\u4F8B\u5982 my-obsidian-vault").setValue(this.setupRepoNameInput).onChange((value) => {
        this.setupRepoNameInput = value.trim();
        this.updateSetupNextButton(body);
      }));
      new import_obsidian2.Setting(card).addButton((button) => button.setButtonText("\u521B\u5EFA\u79C1\u4EBA\u4ED3\u5E93").setCta().setDisabled(this.setupBusy).onClick(() => void this.runSetup(async () => {
        try {
          await this.plugin.createSetupRepository(this.setupRepoNameInput);
        } finally {
          this.setupRepoInput = this.plugin.settings.setupRepoUrl;
        }
      }, "\u79C1\u4EBA\u4ED3\u5E93\u5DF2\u521B\u5EFA\u5E76\u6838\u9A8C\uFF1B\u672C\u5730\u6587\u4EF6\u5C1A\u672A\u63A8\u9001\u3002", false))).settingEl.addClass("zoey-sync-setup-action");
    }
    if (this.setupMessage && (!this.plugin.settings.setupVerified || !this.setupMessage.startsWith("\u5DF2\u6838\u9A8C\uFF1A"))) {
      card.createEl("p", { text: this.setupMessage, cls: "zoey-sync-setup-repo-result" });
    }
    if (this.plugin.settings.setupVerified) card.createEl("p", { text: `\u2713 \u5DF2\u6838\u9A8C ${this.plugin.settings.setupVerified.url} \xB7 \u5206\u652F ${this.plugin.settings.setupVerified.branch}`, cls: "zoey-sync-setup-done" });
    const footer = body.createDiv({ cls: "zoey-sync-setup-footer" });
    const next = footer.createEl("button", { text: "\u4E0B\u4E00\u6B65", cls: "mod-cta zoey-sync-setup-next", attr: { type: "button" } });
    next.disabled = !this.setupRepoReady() || this.setupBusy;
    next.addEventListener("click", () => {
      this.setupViewStep = 3;
      this.setupMessage = "";
      this.display();
    });
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
  updateSetupNextButton(body) {
    const next = body.querySelector(".zoey-sync-setup-next");
    if (next) next.disabled = !this.setupRepoReady() || this.setupBusy;
  }
  displaySetupPreview(body) {
    body.createEl("p", { text: `\u5F53\u524D Vault\uFF1A${this.plugin.getVaultBasePath()}` });
    body.createEl("p", { text: "\u8FD9\u4E00\u6B65\u53EA\u68C0\u67E5\u4E24\u7AEF\u72B6\u6001\uFF1B\u53D1\u73B0\u5185\u5D4C\u4ED3\u5E93\u65F6\u4F1A\u5217\u51FA\u5F85\u8865\u7684 .git \u5FFD\u7565\u89C4\u5219\u548C\u5F85\u91CD\u5EFA\u7684\u6587\u4EF6\u8FFD\u8E2A\u3002\u5B8C\u6210\u63A5\u5165\u65F6\u6267\u884C\uFF1B\u5DF2\u63A5\u5165\u7684\u4ED3\u5E93\u4F1A\u5728\u4E0B\u6B21\u540C\u6B65\u65F6\u5904\u7406\u3002" });
    if (this.plugin.settings.setupComplete && !this.plugin.settings.setupVerified) {
      body.createEl("p", { text: "\u5F53\u524D\u8FDE\u63A5\u6765\u81EA\u65E7\u7248\u8BBE\u7F6E\uFF0C\u5C1A\u672A\u7ECF\u8FC7\u6B64\u5411\u5BFC\u6838\u9A8C\u3002\u4F7F\u7528\u4E0A\u65B9\u300C\u4ECE\u7B2C\u4E00\u6B65\u91CD\u65B0\u68C0\u67E5\u63A5\u5165\u300D\u540E\u53EF\u67E5\u770B\u4E24\u7AEF\u6587\u4EF6\u3002" });
    }
    if (this.plugin.settings.setupStep >= 3 && (this.plugin.settings.setupVerified || this.plugin.settings.setupRepoUrl)) {
      new import_obsidian2.Setting(body).addButton((button) => button.setButtonText(!this.plugin.settings.setupVerified ? "\u91CD\u65B0\u6838\u9A8C\u4ED3\u5E93\u5E76\u68C0\u67E5\u4E24\u7AEF" : this.plugin.settings.setupComplete ? "\u91CD\u65B0\u8BFB\u53D6\u4E24\u7AEF\u72B6\u6001" : "\u68C0\u67E5\u4E24\u7AEF\u6587\u4EF6").setCta().setDisabled(this.setupBusy).onClick(() => void this.runSetup(async () => {
        this.setupOverlapContent = void 0;
        this.setupRebuildConfirmed = false;
        await this.plugin.inspectSetupRepository();
      }, this.plugin.settings.setupComplete ? "\u5DF2\u91CD\u65B0\u8BFB\u53D6\u4E24\u7AEF\u72B6\u6001\u3002" : "\u68C0\u67E5\u5B8C\u6210\u3002\u8BF7\u6838\u5BF9\u7ED3\u679C\u5E76\u9009\u62E9\u540C\u540D\u6587\u4EF6\u7684\u4FDD\u7559\u7248\u672C\u3002", false)));
    }
    const preview = this.plugin.getSetupPreview();
    if (preview) {
      if (preview.nestedRepos.length) body.createEl("p", {
        text: `\u53D1\u73B0 ${preview.nestedRepos.length} \u4E2A\u5185\u5D4C Git \u4ED3\u5E93\u3002${this.plugin.settings.setupComplete ? "\u4E0B\u6B21\u540C\u6B65" : "\u5B8C\u6210\u63A5\u5165"}\u65F6\u4F1A\u5FFD\u7565\u5176 .git \u5143\u6570\u636E\uFF0C\u5E76\u91CD\u5EFA\u4E3B\u4ED3\u5E93\u5BF9\u5C0F\u5E93\u666E\u901A\u6587\u4EF6\u7684\u8FFD\u8E2A\uFF1B\u5C0F\u5E93\u81EA\u5DF1\u7684\u63D0\u4EA4\u5386\u53F2\u4E0D\u4F1A\u6539\u52A8\u3002`,
        cls: "zoey-sync-section-desc"
      });
      if (preview.alreadyLinked) body.createEl("p", { text: "\u5F53\u524D Git \u5386\u53F2\u5DF2\u5305\u542B\u8FDC\u7AEF\u63D0\u4EA4\u3002\u63A5\u5165\u65F6\u4F1A\u8865\u5145\u5FFD\u7565\u89C4\u5219\u3001\u5904\u7406\u5185\u5D4C\u4ED3\u5E93\u8FFD\u8E2A\uFF0C\u5E76\u63A8\u9001\u672C\u673A\u672A\u4E0A\u4F20\u7684\u66F4\u6539\u3002", cls: "zoey-sync-setup-done" });
      else if (preview.relatedHistory) body.createEl("p", { text: "\u672C\u673A\u4E0E\u8FDC\u7AEF\u6709\u5171\u540C\u5386\u53F2\uFF0C\u8FDC\u7AEF\u6709\u65B0\u63D0\u4EA4\u3002\u63A5\u5165\u65F6\u4F1A\u6B63\u5E38\u5408\u5E76\uFF1B\u82E5\u53D1\u751F\u51B2\u7A81\u4F1A\u505C\u6B62\u5E76\u63D0\u793A\u5904\u7406\uFF0C\u4E0D\u4F1A\u76F4\u63A5\u8986\u76D6\u540C\u540D\u6587\u4EF6\u3002", cls: "zoey-sync-section-desc" });
      body.createEl("p", { text: `\u672C\u5730 ${preview.localFiles.length} \u4E2A\u6587\u4EF6\uFF0C\u8FDC\u7AEF ${preview.remoteFiles.length} \u4E2A\u6587\u4EF6\uFF1B\u4EC5\u672C\u5730 ${preview.localOnly.length}\uFF0C\u4EC5\u8FDC\u7AEF ${preview.remoteOnly.length}\uFF0C\u540C\u540D\u4E14\u5185\u5BB9\u76F8\u540C ${preview.identicalCount}\uFF0C\u9700\u4EBA\u5DE5\u9009\u62E9 ${preview.overlaps.length}\u3002` });
      body.createEl("p", { text: preview.localRoot ? `\u73B0\u6709 Git \u4ED3\u5E93\uFF1A${preview.localRoot}\uFF1B\u672C\u673A\u5206\u652F\uFF1A${preview.localBranch}\uFF1Borigin\uFF1A${preview.origin || "\u672A\u8BBE\u7F6E"}\uFF1B\u9996\u6B21\u63A8\u9001\u76EE\u6807\uFF1A${preview.branch}` : `Vault \u5C1A\u672A\u521D\u59CB\u5316 Git\uFF1B\u5B8C\u6210\u63A5\u5165\u65F6\u4F1A\u5728\u5F53\u524D Vault \u521B\u5EFA ${preview.branch} \u5206\u652F\u3002` });
      if (preview.localRoot && !preview.relatedHistory && preview.localBranch !== preview.branch) {
        body.createEl("p", { text: `\u672C\u673A\u5DF2\u6709\u72EC\u7ACB\u5386\u53F2\uFF0C\u5F53\u524D ${preview.localBranch} \u5206\u652F\u63A5\u5165\u540E\u4F1A\u63A8\u9001\u5230\u8FDC\u7AEF ${preview.branch} \u5206\u652F\u3002\u8BF7\u6838\u5BF9\u8FD9\u662F\u5426\u662F\u8981\u63A5\u5165\u7684\u4ED3\u5E93\u3002`, cls: "zoey-sync-section-desc" });
      }
      if (preview.localRoot) {
        body.createEl("p", { text: `\u672C\u5730 ${preview.trackedExcludedLocal.length} \u4E2A\u3001\u8FDC\u7AEF ${preview.trackedExcludedRemote.length} \u4E2A\u5DF2\u8DDF\u8E2A\u6587\u4EF6\u7B26\u5408\u73B0\u6709\u6216\u5F85\u8865\u7684 .gitignore \u89C4\u5219\u3002\u53EF\u91CD\u5EFA\u6574\u4E2A Git \u8FFD\u8E2A\u7D22\u5F15\u4F5C\u4E3A\u7EA0\u9519\uFF1A\u5148\u53D6\u6D88\u5168\u90E8\u8FFD\u8E2A\uFF0C\u518D\u6309\u6700\u7EC8 .gitignore \u91CD\u65B0\u9010\u6587\u4EF6\u52A0\u5165\uFF1B\u672C\u673A\u6587\u4EF6\u4E0D\u4F1A\u5220\u9664\u3002` });
        this.setupFileList(body, "\u672C\u5730\u5DF2\u8DDF\u8E2A\u4F46\u5EFA\u8BAE\u5FFD\u7565", preview.trackedExcludedLocal);
        this.setupFileList(body, "\u8FDC\u7AEF\u5DF2\u8DDF\u8E2A\u4F46\u5EFA\u8BAE\u5FFD\u7565", preview.trackedExcludedRemote);
        if (!this.plugin.settings.setupComplete) {
          new import_obsidian2.Setting(body).setName("Git \u8FFD\u8E2A\u65B9\u5F0F").setDesc("\u91CD\u5EFA\u4F1A\u6E05\u7A7A Git \u7D22\u5F15\u5E76\u91CD\u65B0\u52A0\u5165\u672A\u5FFD\u7565\u7684\u6587\u4EF6\uFF1B\u5DF2\u5FFD\u7565\u6587\u4EF6\u5C06\u505C\u6B62\u8FFD\u8E2A\uFF0C\u63A8\u9001\u540E\u4ECE\u8FDC\u7AEF\u5F53\u524D\u7248\u672C\u79FB\u9664\u3002").addDropdown((dropdown) => dropdown.addOption("", "\u8BF7\u9009\u62E9").addOption("keep", "\u4FDD\u7559\u73B0\u6709\u8FFD\u8E2A").addOption("rebuild", "\u53D6\u6D88\u5168\u90E8\u8FFD\u8E2A\u5E76\u91CD\u5EFA").setValue(this.plugin.getSetupTrackingChoice() || "").onChange((value) => {
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
        for (const path2 of preview.overlaps) {
          new import_obsidian2.Setting(body).setName(path2).addDropdown((dropdown) => dropdown.addOption("", "\u8BF7\u9009\u62E9").addOption("local", "\u4FDD\u7559\u672C\u673A").addOption("remote", "\u91C7\u7528\u8FDC\u7AEF").setValue(choices[path2] || "").onChange((value) => {
            this.plugin.setSetupChoice(path2, value);
            this.updateSetupPreviewNextButton(body);
          })).addButton((button) => button.setButtonText("\u67E5\u770B\u5185\u5BB9").setDisabled(this.setupBusy).onClick(() => void this.runSetup(async () => {
            this.setupOverlapContent = await this.plugin.readSetupOverlap(path2);
          }, `\u5DF2\u8BFB\u53D6 ${path2} \u7684\u4E24\u7AEF\u5185\u5BB9\u3002`)));
        }
        if (this.setupOverlapContent && preview.overlaps.includes(this.setupOverlapContent.path)) {
          body.createEl("h4", { text: `\u5185\u5BB9\u5BF9\u7167\uFF1A${this.setupOverlapContent.path}` });
          const comparison = body.createDiv({ cls: "zoey-sync-setup-comparison" });
          const local = comparison.createDiv();
          local.createEl("strong", { text: "\u672C\u673A" });
          local.createEl("pre", { text: this.setupOverlapContent.local });
          const remote = comparison.createDiv();
          remote.createEl("strong", { text: "\u8FDC\u7AEF" });
          remote.createEl("pre", { text: this.setupOverlapContent.remote });
        }
      }
    }
    if (!this.plugin.settings.setupComplete) {
      const footer = body.createDiv({ cls: "zoey-sync-setup-footer" });
      const next = footer.createEl("button", { text: "\u4E0B\u4E00\u6B65", cls: "mod-cta zoey-sync-setup-preview-next", attr: { type: "button" } });
      next.disabled = !this.setupPreviewReady() || this.setupBusy;
      next.addEventListener("click", () => void this.runSetup(() => this.plugin.confirmSetupPreview(), "\u5DF2\u786E\u8BA4\u4E24\u7AEF\u6587\u4EF6\u53CA\u540C\u540D\u6587\u4EF6\u9009\u62E9\u3002"));
    }
  }
  setupPreviewReady() {
    const preview = this.plugin.getSetupPreview();
    if (!preview) return false;
    const choices = this.plugin.getSetupChoices();
    if (preview.overlaps.some((path2) => !choices[path2])) return false;
    return !(preview.trackedExcludedLocal.length || preview.trackedExcludedRemote.length) || !!this.plugin.getSetupTrackingChoice();
  }
  updateSetupPreviewNextButton(body) {
    const next = body.querySelector(".zoey-sync-setup-preview-next");
    if (next) next.disabled = !this.setupPreviewReady() || this.setupBusy;
  }
  setupFileList(body, title, paths) {
    const details = body.createEl("details", { cls: "zoey-sync-setup-files" });
    details.createEl("summary", { text: `${title}\uFF08${paths.length}\uFF09` });
    for (const path2 of paths.slice(0, 200)) details.createEl("div", { text: path2 });
    if (paths.length > 200) details.createEl("p", { text: `\u8FD8\u6709 ${paths.length - 200} \u4E2A\u6587\u4EF6\u672A\u5728\u8FD9\u91CC\u5C55\u5F00\u3002` });
  }
  displaySetupFinish(body) {
    const preview = this.plugin.getSetupPreview();
    if (!preview) {
      body.createEl("p", { text: this.plugin.settings.setupComplete && this.plugin.settings.setupVerified ? `\u5DF2\u63A5\u5165 ${this.plugin.settings.setupVerified.url}\u3002\u5982\u9700\u67E5\u770B\u5F53\u524D\u4E24\u7AEF\u6587\u4EF6\uFF0C\u8BF7\u8FD4\u56DE\u7B2C 3 \u6B65\u91CD\u65B0\u8BFB\u53D6\u3002` : this.plugin.settings.setupComplete ? "\u5F53\u524D\u8FDE\u63A5\u6765\u81EA\u65E7\u7248\u8BBE\u7F6E\uFF0C\u5C1A\u672A\u7ECF\u8FC7\u6B64\u5411\u5BFC\uFF1B\u5982\u9700\u68C0\u67E5\u63A5\u5165\uFF0C\u8BF7\u4ECE\u7B2C\u4E00\u6B65\u91CD\u65B0\u5F00\u59CB\u3002" : "\u672C\u6B21\u6253\u5F00\u540E\u5C1A\u65E0\u68C0\u67E5\u7ED3\u679C\uFF0C\u8BF7\u8FD4\u56DE\u7B2C 3 \u6B65\u91CD\u65B0\u68C0\u67E5\u3002" });
      return;
    }
    const remoteIgnoreSelected = this.plugin.getSetupChoices()[".gitignore"] === "remote";
    const ignoreSummary = this.plugin.settings.setupComplete ? remoteIgnoreSelected ? "\u5DF2\u6309\u4F60\u7684\u9009\u62E9\u91C7\u7528\u8FDC\u7AEF .gitignore\uFF0C\u5E76\u9010\u6761\u8865\u5145\u7F3A\u5C11\u7684\u5EFA\u8BAE\u89C4\u5219\u3002" : "\u73B0\u6709\u672C\u673A .gitignore \u89C4\u5219\u5DF2\u4FDD\u7559\u3002" : remoteIgnoreSelected ? "\u4F60\u5DF2\u9009\u62E9\u8FDC\u7AEF .gitignore\uFF1A\u672C\u673A\u81EA\u5B9A\u4E49\u89C4\u5219\u5C06\u88AB\u66FF\u6362\uFF1B\u63A5\u5165\u65F6\u4F1A\u4EE5\u8FDC\u7AEF\u7248\u672C\u4E3A\u57FA\u7840\u91CD\u65B0\u9010\u6761\u68C0\u67E5\u5EFA\u8BAE\u89C4\u5219\u3002" : preview.missingIgnoreRules.length > 0 ? `\u9996\u6B21\u63D0\u4EA4\u524D\u53EA\u8865\u5145 .gitignore \u7F3A\u5C11\u7684 ${preview.missingIgnoreRules.length} \u6761\u89C4\u5219\uFF1B\u5DF2\u6709\u89C4\u5219\u4E0D\u4F1A\u88AB\u8986\u76D6\u3002` : "\u73B0\u6709 .gitignore \u5DF2\u6DB5\u76D6\u5EFA\u8BAE\u89C4\u5219\uFF0C\u4E0D\u4F1A\u8FFD\u52A0\u91CD\u590D\u89C4\u5219\u3002";
    body.createEl("p", { text: `\u5C06\u4FDD\u7559\u672C\u5730 ${preview.localFiles.length} \u4E2A\u6587\u4EF6\uFF0C\u5E76\u63A5\u5165\u8FDC\u7AEF ${preview.remoteFiles.length} \u4E2A\u6587\u4EF6\u3002${ignoreSummary}` });
    if (preview.nestedRepos.length) body.createEl("p", {
      text: `\u5DF2\u8BC6\u522B ${preview.nestedRepos.length} \u4E2A\u5185\u5D4C\u4ED3\u5E93\uFF1B${this.plugin.settings.setupComplete ? "\u4E0B\u6B21\u540C\u6B65" : "\u5B8C\u6210\u63A5\u5165"}\u65F6\u5C06\u91CD\u5EFA\u4E3B\u4ED3\u5E93\u5BF9\u5C0F\u5E93\u6587\u4EF6\u7684\u8FFD\u8E2A\uFF0C\u5E76\u5FFD\u7565\u5C0F\u5E93\u7684 .git \u5143\u6570\u636E\u3002`,
      cls: "zoey-sync-section-desc"
    });
    if (preview.localRoot) {
      const trackingChoice = this.plugin.getSetupTrackingChoice();
      body.createEl("p", { text: trackingChoice === "rebuild" ? `\u5C06\u53D6\u6D88\u5168\u90E8 Git \u8FFD\u8E2A\u5E76\u6309\u6700\u7EC8 .gitignore \u91CD\u5EFA\u7D22\u5F15\u3002\u672C\u673A\u6587\u4EF6\u4FDD\u7559\uFF1B\u88AB\u5FFD\u7565\u7684\u6587\u4EF6\u4E0D\u4F1A\u91CD\u65B0\u52A0\u5165\uFF0C\u63A8\u9001\u540E\u4ECE\u8FDC\u7AEF\u5F53\u524D\u7248\u672C\u79FB\u9664\uFF0C\u65E7\u63D0\u4EA4\u5386\u53F2\u4ECD\u4FDD\u7559\u3002\u6B63\u5728\u7F16\u8F91\u7684\u63D2\u4EF6\u6539\u52A8\u4F1A\u8DF3\u8FC7\u672C\u6B21\u63D0\u4EA4\u3002` : trackingChoice === "keep" ? "\u4F60\u5DF2\u9009\u62E9\u4FDD\u7559\u73B0\u6709\u8FFD\u8E2A\uFF1B\u5DF2\u8DDF\u8E2A\u7684\u5FFD\u7565\u6587\u4EF6\u4ECD\u4F1A\u7EE7\u7EED\u540C\u6B65\u3002" : preview.trackedExcludedLocal.length || preview.trackedExcludedRemote.length ? "\u8BF7\u8FD4\u56DE\u7B2C 3 \u6B65\uFF0C\u9009\u62E9\u5982\u4F55\u5904\u7406\u5DF2\u8DDF\u8E2A\u7684\u5FFD\u7565\u6587\u4EF6\u3002" : "\u672A\u9009\u62E9\u91CD\u5EFA\uFF1B\u5C06\u4FDD\u7559\u73B0\u6709\u8FFD\u8E2A\u3002\u5982\u9700\u7528\u91CD\u5EFA\u7EA0\u9519\uFF0C\u8BF7\u8FD4\u56DE\u7B2C 3 \u6B65\u9009\u62E9\u3002" });
      if (trackingChoice === "rebuild" && !this.plugin.settings.setupComplete) {
        new import_obsidian2.Setting(body).setName("\u786E\u8BA4\u91CD\u5EFA Git \u8FFD\u8E2A").setDesc("\u6211\u786E\u8BA4\u53D6\u6D88\u5168\u90E8\u8FFD\u8E2A\u5E76\u6309 .gitignore \u91CD\u5EFA\uFF1B\u672C\u673A\u6587\u4EF6\u4FDD\u7559\uFF0C\u88AB\u5FFD\u7565\u6587\u4EF6\u4F1A\u4ECE\u8FDC\u7AEF\u5F53\u524D\u7248\u672C\u79FB\u9664\u3002").addToggle((toggle) => toggle.setValue(this.setupRebuildConfirmed).onChange((value) => {
          this.setupRebuildConfirmed = value;
          this.display();
        }));
      }
    }
    new import_obsidian2.Setting(body).setName("\u63D0\u4EA4\u4F5C\u8005\u540D\u79F0").setDesc("\u663E\u793A\u5728 Git \u63D0\u4EA4\u8BB0\u5F55\u4E2D\uFF0C\u4E0D\u662F\u767B\u5F55\u8D26\u53F7\u3002").addText((text) => text.setValue(this.plugin.settings.gitAuthorName === DEFAULT_GIT_AUTHOR_NAME ? "" : this.plugin.settings.gitAuthorName).onChange(async (value) => {
      this.plugin.settings.gitAuthorName = value.trim();
      await this.plugin.saveSettings();
    }));
    new import_obsidian2.Setting(body).setName("\u63D0\u4EA4\u4F5C\u8005\u90AE\u7BB1").setDesc("\u7528\u4E8E Git \u63D0\u4EA4\u8BB0\u5F55\uFF0C\u4E0D\u662F\u767B\u5F55\u5BC6\u7801\u3002").addText((text) => text.setValue(this.plugin.settings.gitAuthorEmail === DEFAULT_GIT_AUTHOR_EMAIL ? "" : this.plugin.settings.gitAuthorEmail).onChange(async (value) => {
      this.plugin.settings.gitAuthorEmail = value.trim();
      await this.plugin.saveSettings();
    }));
    if (!this.plugin.settings.setupComplete && !remoteIgnoreSelected && preview.missingIgnoreRules.length > 0) {
      const rules = body.createEl("details", { cls: "zoey-sync-setup-files" });
      rules.createEl("summary", { text: `\u67E5\u770B\u5C06\u8865\u5145\u7684 ${preview.missingIgnoreRules.length} \u6761 .gitignore \u89C4\u5219` });
      rules.createEl("pre", { text: preview.missingIgnoreRules.join("\n") });
    }
    if (preview.overlaps.length) this.setupFileList(body, "\u5DF2\u9009\u62E9\u8FDC\u7AEF\u7248\u672C\u7684\u540C\u540D\u6587\u4EF6", preview.overlaps.filter((path2) => this.plugin.getSetupChoices()[path2] === "remote"));
    if (!this.plugin.settings.setupComplete) {
      const footer = body.createDiv({ cls: "zoey-sync-setup-footer" });
      new import_obsidian2.Setting(footer).addButton((button) => button.setButtonText("\u5B8C\u6210\u63A5\u5165\u5E76\u9996\u6B21\u63A8\u9001").setCta().setDisabled(this.setupBusy || this.plugin.getSetupTrackingChoice() === "rebuild" && !this.setupRebuildConfirmed).onClick(() => void this.runSetup(() => this.plugin.finishSetup(this.setupRebuildConfirmed), "\u9996\u6B21\u63A8\u9001\u6210\u529F\uFF0C\u5411\u5BFC\u5DF2\u5B8C\u6210\u3002")));
    }
  }
  displayDesktopAdvanced(containerEl) {
    const preview = this.currentDevice() !== "git";
    containerEl.createEl("p", { text: "\u901A\u5E38\u4E0D\u9700\u8981\u4FEE\u6539", cls: "zoey-sync-advanced-intro" });
    const advancedBody = containerEl.createDiv({ cls: "zoey-sync-card zoey-sync-advanced__body" });
    advancedBody.createEl("h4", { text: "\u754C\u9762\u8BBE\u7F6E", cls: "zoey-sync-subsection-title" });
    const versionViewSetting = new import_obsidian2.Setting(advancedBody).setName("\u663E\u793A\u5F85 Commit \u5217\u8868").setDesc("\u5728\u540C\u6B65\u6309\u94AE\u65C1\u663E\u793A\u5F85\u4E0A\u4F20\u548C\u5F85 Commit \u5207\u6362\u3002\u5173\u95ED\u65F6\u53EA\u663E\u793A\u5F85\u4E0A\u4F20\u6587\u4EF6\u3002");
    const versionViewIcon = versionViewSetting.nameEl.createSpan({ cls: "zoey-sync-setting-mode-icon" });
    versionViewIcon.innerHTML = '<svg viewBox="0 0 32 18" aria-hidden="true"><g><circle cx="7.5" cy="9" r="5.25"/><path d="m4.9 9.1 1.7 1.7 3.5-3.8"/></g><path class="mode-divider" d="M16 3.25v11.5"/><g><path d="M23.75 11.75v-7.5"/><path d="m20.75 7.25 3-3 3 3"/><path d="M19.25 12.75v1.5h9v-1.5"/></g></svg>';
    versionViewSetting.nameEl.prepend(versionViewIcon);
    versionViewSetting.addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.showVersionViewSwitcher).onChange((value) => void this.plugin.setVersionViewSwitcher(value))
    );
    advancedBody.createEl("h4", { text: "\u540C\u6B65\u65F6\u95F4\u8BBE\u7F6E", cls: "zoey-sync-subsection-title" });
    new import_obsidian2.Setting(advancedBody).setName("\u7A7A\u95F2\u540E\u6C47\u603B\u53D8\u5316\u6587\u4EF6\u5217\u8868\uFF08\u79D2\uFF09").setDesc("\u6301\u7EED\u591A\u4E45\u6CA1\u6709\u6587\u4EF6\u53D8\u5316\u540E\u6C47\u603B\u6240\u6709\u53D8\u5316\u6587\u4EF6\uFF0C\u751F\u6210\u5F85 Commit\uFF0F\u4E0A\u4F20\u5217\u8868\u3002").addText((text) => {
      text.inputEl.type = "number";
      text.inputEl.min = "0.5";
      text.inputEl.step = "0.5";
      text.setValue(String(this.plugin.settings.viewRefreshDelaySeconds)).onChange(async (value) => {
        this.plugin.settings.viewRefreshDelaySeconds = Math.max(0.5, Number(value) || 7);
        await this.plugin.saveSettings();
      });
    });
    new import_obsidian2.Setting(advancedBody).setName("\u7A7A\u95F2\u540E\u81EA\u52A8 Commit\uFF08\u5206\u949F\uFF09").setDesc("\u6301\u7EED\u591A\u4E45\u6CA1\u6709\u6587\u4EF6\u53D8\u5316\u540E\u521B\u5EFA Commit\u3002\u8BBE\u4E3A 0 \u53EF\u5173\u95ED\u3002").addText((text) => this.addTimingInput(text, "autoCommitIdleMinutes", 5));
    new import_obsidian2.Setting(advancedBody).setName("\u7A7A\u95F2\u540E\u81EA\u52A8 Push\uFF08\u5206\u949F\uFF09").setDesc("\u6709\u5F85\u4E0A\u4F20 Commit \u65F6\uFF0C\u6301\u7EED\u591A\u4E45\u6CA1\u6709\u6587\u4EF6\u53D8\u5316\u540E Fetch\u3001\u6309\u9700 Merge \u5E76 Push\uFF1B\u4E0D\u4F1A\u63D0\u524D\u81EA\u52A8 Commit\u3002\u8BBE\u4E3A 0 \u53EF\u5173\u95ED\u3002").addText((text) => this.addTimingInput(text, "autoPushIdleMinutes", 30));
    new import_obsidian2.Setting(advancedBody).setName("\u5F3A\u5236 Commit \u95F4\u9694\uFF08\u5206\u949F\uFF09").setDesc("\u4ECE\u9996\u6B21\u68C0\u6D4B\u5230\u672A\u63D0\u4EA4\u6539\u52A8\u8D77\uFF0C\u5230\u70B9\u5373 Commit \u5F53\u524D\u6240\u6709\u672C\u673A\u6539\u52A8\uFF0C\u4E0D\u518D\u7B49\u5F85\u7A7A\u95F2\u3002\u8BBE\u4E3A 0 \u53EF\u5173\u95ED\u3002").addText((text) => this.addTimingInput(text, "maxUncommittedMinutes", 30));
    new import_obsidian2.Setting(advancedBody).setName("\u5F3A\u5236 Push \u95F4\u9694\uFF08\u5206\u949F\uFF09").setDesc("\u6700\u65E9\u7684\u5F85\u4E0A\u4F20 Commit \u5230\u70B9\u540E\uFF0C\u5148\u5F3A\u5236 Commit \u5F53\u524D\u672C\u673A\u66F4\u6539\uFF08\u5305\u62EC\u6B63\u5728\u7F16\u8F91\u7684\u6587\u4EF6\uFF09\uFF0C\u518D Fetch\u3001\u6309\u9700 Merge \u5E76 Push\u3002\u8BBE\u4E3A 0 \u53EF\u5173\u95ED\u3002").addText((text) => this.addTimingInput(text, "maxUnpushedMinutes", 60));
    new import_obsidian2.Setting(advancedBody).setName("\u542F\u52A8\u540E\u81EA\u52A8 Commit\u3001Fetch \u5E76 Merge").setDesc("\u542F\u52A8\u540E\u5148 Commit \u5F53\u524D\u672C\u673A\u6539\u52A8\uFF0C\u518D\u83B7\u53D6\u4E91\u7AEF\u6700\u65B0\u63D0\u4EA4\u5E76\u5408\u5E76\u5230\u672C\u673A\uFF1B\u4E0D\u4F1A\u7ACB\u5373 Push\u3002").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.pullOnStartup).onChange(async (value) => {
        this.plugin.settings.pullOnStartup = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian2.Setting(advancedBody).setName("\u81EA\u52A8 Fetch \u4E0E Merge \u95F4\u9694\uFF08\u5206\u949F\uFF09").setDesc("\u6309\u6B64\u65F6\u95F4\u95F4\u9694\u83B7\u53D6\u4E91\u7AEF\u6700\u65B0\u63D0\u4EA4\u5E76\u5408\u5E76\u5230\u672C\u673A\uFF1B\u4E0D\u4F1A\u6267\u884C Push\u3002\u8BBE\u4E3A 0 \u53EF\u5173\u95ED\u3002").addText((text) => this.addTimingInput(text, "autoPullIntervalMinutes", 5));
    advancedBody.createEl("h4", { text: "Git \u8BBE\u7F6E", cls: "zoey-sync-subsection-title" });
    new import_obsidian2.Setting(advancedBody).setName("\u5206\u652F").setDesc("\u9ED8\u8BA4\u4F7F\u7528 master\uFF1B\u53EA\u6709\u4ED3\u5E93\u4F7F\u7528\u5176\u4ED6\u5206\u652F\u65F6\u624D\u9700\u8981\u4FEE\u6539\u3002").addText(
      (text) => text.setValue(this.plugin.settings.gitBranch).onChange(async (value) => {
        this.plugin.settings.gitBranch = value.trim() || "master";
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian2.Setting(advancedBody).setName("\u63D0\u4EA4\u4F5C\u8005\u540D\u79F0").setDesc("Git \u521B\u5EFA\u7248\u672C\u8BB0\u5F55\u65F6\u4F7F\u7528\uFF1B\u901A\u5E38\u4F1A\u81EA\u52A8\u8BFB\u53D6\u672C\u673A\u5DF2\u6709\u7684 Git \u914D\u7F6E\u3002").addText(
      (text) => text.setValue(this.plugin.settings.gitAuthorName).onChange(async (value) => {
        this.plugin.settings.gitAuthorName = value.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian2.Setting(advancedBody).setName("\u63D0\u4EA4\u4F5C\u8005\u90AE\u7BB1").setDesc("\u7528\u4E8E\u6807\u8BC6 Git \u63D0\u4EA4\u4F5C\u8005\uFF0C\u4E0D\u662F\u767B\u5F55\u5BC6\u7801\uFF1B\u901A\u5E38\u4F1A\u81EA\u52A8\u8BFB\u53D6\u3002").addText(
      (text) => text.setValue(this.plugin.settings.gitAuthorEmail).onChange(async (value) => {
        this.plugin.settings.gitAuthorEmail = value.trim();
        await this.plugin.saveSettings();
      })
    );
    advancedBody.createEl("h4", { text: "\u6545\u969C\u6392\u67E5", cls: "zoey-sync-subsection-title" });
    new import_obsidian2.Setting(advancedBody).setName("\u5F02\u5E38\u4FEE\u590D").setDesc("\u6062\u590D\u672A\u5B8C\u6210\u7684 Rebase\u3001Merge \u7B49 Git \u64CD\u4F5C\uFF0C\u4EE5\u5F53\u524D\u672C\u673A\u5185\u5BB9\u91CD\u65B0 Commit\uFF0C\u518D Fetch \u5E76 Merge\uFF1B\u4E0D\u4F1A\u7ACB\u5373 Push\u3002").addButton(
      (button) => button.setButtonText("\u6062\u590D\u6B63\u5E38\u540C\u6B65").setDisabled(preview).onClick(async () => {
        button.setDisabled(true);
        button.setButtonText("\u6B63\u5728\u68C0\u67E5\u2026");
        try {
          const operation = await this.plugin.getInterruptedGitOperationLabel();
          if (!operation) {
            new import_obsidian2.Notice("Simple Link\uFF1A\u6CA1\u6709\u68C0\u6D4B\u5230\u672A\u5B8C\u6210\u7684 Rebase\u3001Merge\u3001Cherry-pick \u6216 Revert");
            return;
          }
          new GitRepairModal(this.app, this.plugin, operation).open();
        } catch (error) {
          new import_obsidian2.Notice(`Simple Link\uFF1A\u65E0\u6CD5\u68C0\u67E5 Git \u72B6\u6001\u3002${messageOf2(error)}`, 1e4);
        } finally {
          button.setDisabled(false);
          button.setButtonText("\u6062\u590D\u6B63\u5E38\u540C\u6B65");
        }
      })
    );
    new import_obsidian2.Setting(advancedBody).setName("\u672C\u5730 Git \u5386\u53F2\u7626\u8EAB").setDesc("\u9ED8\u8BA4\u4FDD\u7559\u6700\u8FD1 30 \u5929\u7684\u672C\u5730\u5386\u53F2\u3002\u5148\u8054\u7F51\u786E\u8BA4\u5F53\u524D Commit \u5DF2\u4E0A\u4F20\uFF0C\u518D\u6E05\u7406\u672C\u673A\u65E7\u5386\u53F2\uFF1B\u4E0D\u4F1A\u5220\u9664 GitHub \u4E0A\u7684\u7248\u672C\u3002").addButton(
      (button) => button.setButtonText("\u68C0\u67E5\u5E76\u9884\u89C8").setDisabled(preview).onClick(async () => {
        button.setDisabled(true);
        button.setButtonText("\u6B63\u5728\u6838\u9A8C\u2026");
        try {
          const result = await this.plugin.inspectLocalHistory();
          new LocalHistorySlimModal(this.app, this.plugin, result).open();
        } catch (error) {
          new import_obsidian2.Notice(`Simple Link\uFF1A\u65E0\u6CD5\u9884\u89C8\u672C\u5730\u5386\u53F2\u3002${messageOf2(error)}`, 12e3);
        } finally {
          button.setDisabled(false);
          button.setButtonText("\u68C0\u67E5\u5E76\u9884\u89C8");
        }
      })
    );
    const logs = this.plugin.getRecentErrorLogs();
    const errorCount = logs.filter((entry) => entry.status !== "success").length;
    new import_obsidian2.Setting(advancedBody).setName("\u6700\u8FD1\u540C\u6B65\u65E5\u5FD7").setDesc(
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
