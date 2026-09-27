import assert from "node:assert/strict";
import { build } from "esbuild";

async function loadModule(entryPoint) {
  const output = await build({
    entryPoints: [entryPoint],
    bundle: true,
    format: "esm",
    platform: "node",
    write: false
  });
  const source = output.outputFiles[0].text;
  return await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
}

const module = await loadModule("src/dirty.ts");

assert.deepEqual(module.coalesceDirty([], { type: "add", path: "a.md" }), [
  { type: "add", path: "a.md" }
]);
assert.deepEqual(
  module.coalesceDirty([{ type: "add", path: "a.md" }], { type: "delete", path: "a.md" }),
  []
);
assert.deepEqual(
  module.coalesceDirty([{ type: "add", path: "a.md" }], {
    type: "move",
    fromPath: "a.md",
    path: "folder/a.md"
  }),
  [{ type: "add", path: "folder/a.md" }]
);
assert.deepEqual(
  module.coalesceDirty([{ type: "modify", path: "old.md" }], { type: "delete", path: "old.md" }),
  [{ type: "delete", path: "old.md" }]
);
assert.deepEqual(
  module.coalesceDirty([{ type: "modify", path: "old.md" }], {
    type: "move",
    fromPath: "old.md",
    path: "new.md"
  }),
  [
    { type: "move", fromPath: "old.md", path: "new.md" },
    { type: "modify", path: "new.md" }
  ]
);
assert.deepEqual(
  module.coalesceDirty([{ type: "move", fromPath: "old.md", path: "mid.md" }], {
    type: "move",
    fromPath: "mid.md",
    path: "new.md"
  }),
  [{ type: "move", fromPath: "old.md", path: "new.md" }]
);
assert.equal(module.shouldIgnore(".obsidian/plugins/simple-sync/data.json"), true);
assert.equal(module.shouldIgnore(".obsidian/cache/index.json"), true);
assert.equal(module.shouldIgnore("folder/draft.tmp"), true);
assert.equal(module.shouldIgnore("folder/node_modules/package/index.js"), true);
assert.equal(module.shouldIgnore(".codex/output/preview.png"), true);
assert.equal(module.shouldIgnore("attachments/image.png"), false);
assert.equal(module.shouldIgnore("private/keep.md", ["private/", "!private/keep.md"]), false);
assert.equal(module.shouldIgnore("Notes/a.md"), false);
const gitStatus = await loadModule("src/gitStatus.ts");
assert.deepEqual(gitStatus.parseGitStatus(" M changed.md\0?? new file.md\0D  old.md\0"), [
  { path: "changed.md", kind: "modified" },
  { path: "new file.md", kind: "added" },
  { path: "old.md", kind: "deleted" }
]);
assert.deepEqual(gitStatus.parseGitStatus("R  new.md\0old.md\0"), [
  { path: "new.md", oldPath: "old.md", kind: "moved" }
]);
assert.deepEqual(gitStatus.parseGitNameStatus("M\0changed.md\0A\0new.md\0D\0old.md\0"), [
  { path: "changed.md", kind: "modified" },
  { path: "new.md", kind: "added" },
  { path: "old.md", kind: "deleted" }
]);
assert.deepEqual(gitStatus.parseGitNameStatus("R100\0old.md\0new.md\0"), [
  { path: "new.md", oldPath: "old.md", kind: "moved" }
]);
assert.deepEqual(
  gitStatus.partitionCommitChanges(
    [
      { path: "stable.md", kind: "modified" },
      { path: "typing.md", kind: "modified" },
      { path: "renamed.md", oldPath: "old.md", kind: "moved" }
    ],
    new Set(["typing.md", "old.md"])
  ),
  {
    included: [{ path: "stable.md", kind: "modified" }],
    skipped: [
      { path: "typing.md", kind: "modified" },
      { path: "renamed.md", oldPath: "old.md", kind: "moved" }
    ],
    skippedPaths: ["typing.md", "renamed.md", "old.md"]
  }
);
assert.deepEqual(
  gitStatus.findRemoteChangeOverlaps(
    [
      { path: "typing.md", kind: "modified" },
      { path: "local-only.md", kind: "modified" },
      { path: "renamed.md", oldPath: "old.md", kind: "moved" }
    ],
    [
      { path: "typing.md", kind: "modified" },
      { path: "remote-only.md", kind: "modified" },
      { path: "old.md", kind: "deleted" }
    ]
  ),
  ["old.md", "typing.md"]
);
const conflict = await loadModule("src/conflict.ts");
const conflictText = `before\n<<<<<<< HEAD\nfrom local\n=======\nfrom github\n>>>>>>> FETCH_HEAD\nafter\n`;
const blocks = conflict.parseConflictBlocks(conflictText);
assert.equal(blocks.length, 1);
assert.equal(blocks[0].github, "from github\n");
assert.equal(blocks[0].local, "from local\n");
assert.equal(conflict.applyConflictResolutions(conflictText, blocks, ["merged\n"]), "before\nmerged\nafter\n");
const gitError = await loadModule("src/gitError.ts");
assert.equal(
  gitError.describeGitError("fatal: unable to access repository: schannel: SSL/TLS connection failed"),
  "与 GitHub 网络连接失败：fatal: unable to access repository: schannel: SSL/TLS connection failed"
);
const uncertainAuth = "X Failed to log in to github.com account sample-user (keyring)\n- The token in keyring is invalid.";
assert.equal(gitError.isUncertainGitAuthError(uncertainAuth), true);
assert.match(gitError.describeGitError(uncertainAuth), /^GitHub 认证状态检查失败（暂不能确认 Token 已失效/);
assert.equal(gitError.isUncertainGitAuthError("remote: Invalid username or password."), false);
assert.equal(gitError.isMissingRemoteRefError("fatal: couldn't find remote ref master"), true);
assert.equal(gitError.isMissingRemoteRefError("fatal: Authentication failed"), false);
assert.equal(
  gitError.describeGitError("remote: Repository not found"),
  "认证失败：remote: Repository not found"
);
assert.equal(gitError.describeGitError("fatal: bad revision"), "fatal: bad revision");
console.log("dirty queue, git status, conflict, and Git error checks passed");
