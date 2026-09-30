export type DirtyType = "add" | "modify" | "delete" | "move";

export interface DirtyEntry {
  type: DirtyType;
  path: string;
  fromPath?: string;
}

export const DEFAULT_SYNC_IGNORE_PATTERNS = [
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

function globToRegex(pattern: string): string {
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

function matchesIgnorePattern(path: string, rawPattern: string): boolean {
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

export function shouldIgnore(
  path: string,
  patterns: readonly string[] = DEFAULT_SYNC_IGNORE_PATTERNS
): boolean {
  const normalized = path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/$/, "");
  if (normalized === ".obsidian/plugins/simple-link/data.json") return true;
  let ignored = false;
  for (const rawPattern of patterns) {
    const pattern = rawPattern.trim();
    if (!pattern || pattern.startsWith("#")) continue;
    if (matchesIgnorePattern(normalized, pattern)) ignored = !pattern.startsWith("!");
  }
  return ignored;
}

export function coalesceDirty(entries: DirtyEntry[], next: DirtyEntry): DirtyEntry[] {
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
    const added = result.findIndex((entry) => entry.path === next.path && entry.type === "add");
    if (added >= 0) {
      return result.filter((entry, index) => index !== added && entry.path !== next.path);
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
    const modified = result.find(
      (entry) => entry.path === next.fromPath && entry.type === "modify"
    );
    if (modified) modified.path = next.path;
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
