import { DEFAULT_SYNC_IGNORE_PATTERNS, shouldIgnore } from "./dirty";
import { parseGitStatus } from "./gitStatus";
import { requestUrl } from "obsidian";

const nodeRequire = (globalThis as unknown as { require?: (name: string) => unknown }).require;
const nodeFs = nodeRequire ? (nodeRequire("fs") as typeof import("fs")).promises : null;
const nodeFsStream = nodeRequire ? nodeRequire("fs") as typeof import("fs") : null;
const nodePath = nodeRequire ? nodeRequire("path") as typeof import("path") : null;
const nodeCrypto = nodeRequire ? nodeRequire("crypto") as typeof import("crypto") : null;

export type OverlapChoice = "local" | "remote";
export interface SetupPreview {
  vaultPath: string;
  repoUrl: string;
  branch: string;
  remoteSha: string;
  alreadyLinked: boolean;
  relatedHistory: boolean;
  localRoot: string | null;
  localBranch: string | null;
  origin: string | null;
  localFiles: string[];
  localSignatures: Record<string, string>;
  remoteFiles: string[];
  remoteBlobs: Record<string, { sha: string; size: number }>;
  overlaps: string[];
  identicalCount: number;
  remoteOnly: string[];
  localOnly: string[];
  missingIgnoreRules: string[];
  trackedExcludedLocal: string[];
  trackedExcludedRemote: string[];
}

export interface SetupOverlapContent {
  path: string;
  local: string;
  remote: string;
}

export interface VerifiedRepo {
  url: string;
  owner: string;
  name: string;
  branch: string;
  remoteSha: string;
}

export type RunCommand = (program: string, args: string[], timeoutMs?: number, onOutput?: (chunk: string) => void, onCancelReady?: (cancel: () => void) => void) => Promise<string>;

export const SETUP_GITIGNORE = [
  "# Obsidian local state",
  ".obsidian/cache/",
  ".obsidian/workspace.json",
  ".obsidian/workspace-mobile.json",
  ".obsidian/workspaces/",
  ".obsidian/trash/",
  ".trash/",
  "# Local credentials and agent output",
  ".obsidian/plugins/simple-sync/data.json",
  ".obsidian/plugins/simple-link/data.json",
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

export function missingSetupIgnoreRules(existing: string): string[] {
  const patterns = new Set(existing.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#")));
  return SETUP_GITIGNORE.filter((line) => !line.startsWith("#") &&
    !patterns.has(line) && !(line.endsWith("/") && patterns.has(line.slice(0, -1))));
}

export function parseGithubRepoUrl(input: string): { url: string; owner: string; name: string } {
  const trimmed = input.trim();
  const match = /^https:\/\/github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?$/i.exec(trimmed);
  if (!match || match[2] === "." || match[2] === "..") {
    throw new Error("请输入 GitHub 仓库的 HTTPS 地址，例如 https://github.com/用户名/仓库名.git");
  }
  return { url: `https://github.com/${match[1]}/${match[2]}.git`, owner: match[1], name: match[2] };
}

export function validateGithubRepositoryName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("请输入 GitHub 仓库名。");
  if (name !== trimmed || trimmed.length > 100 || !/^[A-Za-z0-9._-]+$/.test(trimmed)) {
    throw new Error("仓库名最多 100 个字符，只能包含英文字母、数字、点、连字符和下划线；空格与 ✓ 均不允许。");
  }
  return trimmed;
}

export function explainSetupError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/spawn git\b|git is not recognized/i.test(message)) return "没有检测到 Git。请先安装 Git 后重新检查；刚安装时可能需要重启 Obsidian。";
  if (/spawn gh\b|gh is not recognized/i.test(message)) return "没有检测到 GitHub CLI。请先安装后重试，或切换到 Token 方案。";
  if (/timed? out|could not resolve|DNS|network|failed to connect|unable to access|ETIMEDOUT/i.test(message)) return "网络连接失败或超时，请检查网络与代理后重试。";
  if (/not logged|authentication|token|401|403|permission denied|no authentication/i.test(message)) return "GitHub 登录失效或当前账号没有仓库权限，请重新授权。";
  if (/404|not found|could not read from remote/i.test(message)) return "仓库地址错误，或当前账号无权访问该仓库。";
  return message;
}

function sameGithubRepo(a: string, b: string): boolean {
  const ssh = /^git@github\.com:([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?$/i.exec(a.trim());
  if (ssh) return `https://github.com/${ssh[1]}/${ssh[2]}.git`.toLowerCase() === b.toLowerCase();
  try { return parseGithubRepoUrl(a).url.toLowerCase() === parseGithubRepoUrl(b).url.toLowerCase(); }
  catch { return false; }
}

function hasFileAsParent(path: string, otherFiles: Set<string>): boolean {
  let slash = path.indexOf("/");
  while (slash >= 0) {
    if (otherFiles.has(path.slice(0, slash))) return true;
    slash = path.indexOf("/", slash + 1);
  }
  return false;
}

function pathBatches(paths: string[]): string[][] {
  const batches: string[][] = [];
  let current: string[] = [];
  let length = 0;
  for (const path of paths) {
    if (current.length && (current.length >= 100 || length + path.length > 12000)) {
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

export class GitSetup {
  constructor(
    private vaultPath: string,
    private run: RunCommand,
    private getToken: () => string | undefined = () => undefined
  ) {
    if (!nodeFs || !nodePath) throw new Error("首次使用引导仅支持桌面端");
  }

  async checkGit(): Promise<string> {
    return (await this.run("git", ["--version"])).trim();
  }

  async checkTools(): Promise<void> {
    await this.checkGit();
    await this.run("gh", ["--version"]);
  }

  private async githubApi(path: string): Promise<any> {
    const token = this.getToken()?.trim();
    if (!token) return JSON.parse(await this.run("gh", ["api", path]));
    const response = await requestUrl({
      url: `https://api.github.com/${path}`,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28"
      },
      throw: false
    });
    if (response.status < 200 || response.status >= 300) {
      const detail = typeof response.json?.message === "string" ? `：${response.json.message}` : "";
      if (response.status === 401) throw new Error(`Token 无效或已过期${detail}`);
      if (response.status === 403) throw new Error(`Token 权限不足，或 GitHub 暂时限制了请求${detail}`);
      if (response.status === 404) throw new Error("无法访问该仓库：请检查地址、Token 的仓库范围和权限。");
      throw new Error(`GitHub API 请求失败（HTTP ${response.status}）${detail}`);
    }
    return response.json;
  }

  async login(onCode?: (code: string) => void, onCancelReady?: (cancel: () => void) => void): Promise<void> {
    await this.checkTools();
    let output = "";
    let lastCode = "";
    await this.run("gh", ["auth", "login", "--hostname", "github.com", "--git-protocol", "https", "--web", "--clipboard"], 1200000, (chunk) => {
      output += chunk;
      const code = output.match(/\b[A-Z0-9]{4}-[A-Z0-9]{4}\b/)?.[0];
      if (code && code !== lastCode) { lastCode = code; onCode?.(code); }
    }, onCancelReady);
    await this.checkLogin();
    await this.run("gh", ["auth", "setup-git", "--hostname", "github.com"]);
  }

  async checkLogin(): Promise<void> {
    await this.run("gh", ["auth", "status", "--active", "--hostname", "github.com"]);
  }

  async validateToken(token: string): Promise<string> {
    const response = await requestUrl({
      url: "https://api.github.com/user",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28"
      },
      throw: false
    });
    if (response.status === 401) throw new Error("Token 无效或已过期。请在 GitHub 重新创建 Token，再粘贴并确认。");
    if (response.status === 403) throw new Error("GitHub 暂时拒绝了 Token 验证请求。请稍后重试；如果持续失败，请重新创建 Token。");
    if (response.status < 200 || response.status >= 300) throw new Error(`Token 验证失败（HTTP ${response.status}）。请检查 Token 后重试。`);
    const login = response.json?.login;
    if (typeof login !== "string" || !login) throw new Error("GitHub 未返回 Token 所属账号，请重新创建并粘贴 Token。");
    return login;
  }

  async createPrivateRepository(name: string): Promise<string> {
    const repositoryName = validateGithubRepositoryName(name);
    const token = this.getToken()?.trim();
    if (token) {
      const response = await requestUrl({
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
      if (response.status === 401) throw new Error("Token 无效或已过期。请重新粘贴 Token 后重试。");
      if (response.status === 403) throw new Error("当前 Token 无权创建仓库。fine-grained Token 需要 Administration 仓库权限（write）；也可以先在 GitHub 创建仓库，再选择“使用已有仓库”。");
      if (response.status < 200 || response.status >= 300) {
        const detail = typeof response.json?.message === "string" ? `：${response.json.message}` : "";
        throw new Error(`创建私人仓库失败（HTTP ${response.status}）${detail}`);
      }
      const url = response.json?.clone_url;
      if (typeof url !== "string" || !url) throw new Error("仓库已创建，但 GitHub 未返回 HTTPS 地址。请改用“使用已有仓库”并填写仓库地址。");
      return url;
    }

    await this.checkLogin();
    const user = await this.githubApi("user");
    await this.run("gh", ["repo", "create", repositoryName, "--private"]);
    return `https://github.com/${user.login}/${repositoryName}.git`;
  }

  async configureGitCredentials(): Promise<void> {
    await this.checkLogin();
    await this.run("gh", ["auth", "setup-git", "--hostname", "github.com"]);
  }

  async verifyRepository(input: string): Promise<VerifiedRepo> {
    const parsed = parseGithubRepoUrl(input);
    const token = this.getToken()?.trim();
    let data: {
      isPrivate?: boolean;
      private?: boolean;
      viewerPermission?: string;
      defaultBranchRef?: { name?: string } | null;
      default_branch?: string | null;
      permissions?: { admin?: boolean; maintain?: boolean; push?: boolean };
    };
    if (token) {
      data = await this.githubApi(`repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.name)}`);
    } else {
      await this.checkLogin();
      const raw = await this.run("gh", ["repo", "view", `${parsed.owner}/${parsed.name}`, "--json", "isPrivate,viewerPermission,defaultBranchRef"]);
      data = JSON.parse(raw) as typeof data;
    }
    if ((data.private ?? data.isPrivate) !== true) throw new Error("该仓库不是私人仓库。请在 GitHub 仓库设置中改为 Private 后重试。");
    const canWrite = data.permissions?.admin || data.permissions?.maintain || data.permissions?.push ||
      new Set(["ADMIN", "MAINTAIN", "WRITE"]).has(data.viewerPermission ?? "");
    if (!canWrite) {
      throw new Error("当前 GitHub 账号没有此仓库的写入权限。");
    }
    const branch = data.default_branch || data.defaultBranchRef?.name || "main";
    const branchData = (data.default_branch || data.defaultBranchRef?.name)
      ? await this.githubApi(`repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.name)}/branches/${encodeURIComponent(branch)}`)
      : undefined;
    const remoteSha = branchData?.commit?.sha ?? "";
    return { ...parsed, branch, remoteSha };
  }

  private async localRoot(): Promise<string | null> {
    try { return (await this.run("git", ["rev-parse", "--show-toplevel"])).trim(); }
    catch { return null; }
  }

  private async readIgnore(): Promise<string> {
    try { return await nodeFs!.readFile(nodePath!.join(this.vaultPath, ".gitignore"), "utf8"); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
      throw error;
    }
  }

  private async localFiles(root: string | null): Promise<string[]> {
    if (root) {
      const output = await this.run("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"]);
      const files: string[] = [];
      for (const name of new Set(output.split("\0").filter(Boolean))) {
        try {
          if ((await nodeFs!.stat(nodePath!.join(this.vaultPath, name))).isFile()) files.push(name);
        } catch { /* tracked file deleted locally */ }
      }
      return files.sort();
    }
    let existingIgnore: string[] = [];
    try {
      existingIgnore = (await nodeFs!.readFile(nodePath!.join(this.vaultPath, ".gitignore"), "utf8")).split(/\r?\n/);
    } catch { /* no existing .gitignore */ }
    const patterns = [...DEFAULT_SYNC_IGNORE_PATTERNS, ...existingIgnore];
    const found: string[] = [];
    const visit = async (folder: string): Promise<void> => {
      for (const item of await nodeFs!.readdir(folder, { withFileTypes: true })) {
        const absolute = nodePath!.join(folder, item.name);
        const name = nodePath!.relative(this.vaultPath, absolute).replace(/\\/g, "/");
        if (item.name === ".git") {
          if (folder !== this.vaultPath) throw new Error(`Vault 内包含另一个 Git 仓库：${nodePath!.relative(this.vaultPath, folder)}。请先单独处理。`);
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

  private async assertNoNestedGit(folder: string): Promise<void> {
    for (const item of await nodeFs!.readdir(folder, { withFileTypes: true })) {
      const absolute = nodePath!.join(folder, item.name);
      const name = nodePath!.relative(this.vaultPath, absolute).replace(/\\/g, "/");
      if (item.name === ".git") {
        if (folder !== this.vaultPath) throw new Error(`Vault 内包含另一个 Git 仓库：${nodePath!.relative(this.vaultPath, folder)}。请先单独处理。`);
        continue;
      }
      if (item.isDirectory() && !shouldIgnore(name, DEFAULT_SYNC_IGNORE_PATTERNS)) await this.assertNoNestedGit(absolute);
    }
  }

  async preview(repo: VerifiedRepo): Promise<SetupPreview> {
    const localRoot = await this.localRoot();
    if (localRoot && (await nodeFs!.realpath(localRoot)).toLowerCase() !== (await nodeFs!.realpath(this.vaultPath)).toLowerCase()) {
      throw new Error(`当前 Vault 位于另一个 Git 仓库内部：${localRoot}。请先独立设置 Vault 仓库。`);
    }
    let localBranch: string | null = null;
    if (localRoot) {
      try { localBranch = (await this.run("git", ["symbolic-ref", "--quiet", "--short", "HEAD"])).trim(); }
      catch { throw new Error("本机仓库当前处于 detached HEAD。请先切换到要同步的本地分支，再重新检查。"); }
      for (const ref of ["MERGE_HEAD", "REBASE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD"]) {
        let exists = false;
        try { await this.run("git", ["rev-parse", "--verify", "-q", ref]); exists = true; }
        catch { /* no interrupted operation */ }
        if (exists) throw new Error(`检测到未完成的 ${ref} 操作，请先在 Git 中处理后重新检查。`);
      }
    }
    let origin: string | null = null;
    if (localRoot) {
      try { origin = await this.run("git", ["config", "--get", "remote.origin.url"]); } catch { /* no origin */ }
      if (origin && !sameGithubRepo(origin, repo.url)) {
        throw new Error("现有 origin 指向其他仓库或包含凭据。向导不会覆盖它。");
      }
    }
    const localFiles = await this.localFiles(localRoot);
    const trackedLocal = localRoot
      ? (await this.run("git", ["ls-files", "--cached", "-z"])).split("\0").filter(Boolean)
      : [];
    const trackedIgnoredLocal = localRoot
      ? (await this.run("git", ["ls-files", "--cached", "--ignored", "--exclude-standard", "-z"])).split("\0").filter(Boolean)
      : [];
    if (localRoot) await this.assertNoNestedGit(this.vaultPath);
    const localSignatures: Record<string, string> = {};
    const localGitBlobs: Record<string, string> = {};
    for (const file of localFiles) {
      const stat = await nodeFs!.stat(nodePath!.join(this.vaultPath, file));
      const hash = nodeCrypto!.createHash("sha256");
      const gitHash = nodeCrypto!.createHash("sha1").update(`blob ${stat.size}\0`);
      for await (const chunk of nodeFsStream!.createReadStream(nodePath!.join(this.vaultPath, file))) {
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
      try { await this.run("git", ["rev-parse", "--verify", "HEAD"]); hasHead = true; }
      catch { /* local repository has no commits */ }
      if (hasHead) {
        try { await this.run("git", ["cat-file", "-e", `${repo.remoteSha}^{commit}`]); }
        catch {
          // Download commit objects only; leave refs, index, and working files untouched.
          await this.run("git", ["fetch", "--no-tags", "--no-write-fetch-head", repo.url, repo.branch]);
          await this.run("git", ["cat-file", "-e", `${repo.remoteSha}^{commit}`]);
        }
        try { await this.run("git", ["merge-base", "HEAD", repo.remoteSha]); relatedHistory = true; }
        catch { /* independently created repositories */ }
        if (relatedHistory) {
          try { await this.run("git", ["merge-base", "--is-ancestor", repo.remoteSha, "HEAD"]); alreadyLinked = true; }
          catch { /* remote has commits that are not yet local */ }
        }
      }
    }
    if (relatedHistory && localBranch !== repo.branch) {
      throw new Error(`本机当前分支是 ${localBranch}，远端默认分支是 ${repo.branch}。请先切换到要同步的 ${repo.branch} 分支，再重新检查。`);
    }
    if (localRoot) {
      if ([".obsidian/plugins/simple-sync/data.json", ".obsidian/plugins/simple-link/data.json"].some((path) => trackedLocal.includes(path))) {
        throw new Error("本地 Git 正在跟踪插件的本机凭据文件 data.json。请先停止跟踪该文件，再继续接入。");
      }
      const staged = await this.run("git", ["ls-files", "--stage", "-z"]);
      if (staged.split("\0").some((line) => line.startsWith("160000 "))) {
        throw new Error("本地 Git 包含子模块，向导暂不支持自动接入。");
      }
    }
    let remoteFiles: string[] = [];
    const remoteBlobs: Record<string, { sha: string; size: number }> = {};
    if (repo.remoteSha) {
      const tree = await this.githubApi(`repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/git/trees/${repo.remoteSha}?recursive=1`) as { truncated?: boolean; tree?: Array<{ path: string; type: string; sha?: string; size?: number }> };
      if (tree.truncated) throw new Error("远端文件列表过大，GitHub 只返回了部分文件；向导已停止，请先缩小仓库或手动接入。");
      if (tree.tree?.some((item) => item.type === "commit")) throw new Error("远端仓库包含 Git 子模块，向导暂不支持自动接入。");
      remoteFiles = (tree.tree ?? []).filter((item) => item.type === "blob").map((item) => {
        remoteBlobs[item.path] = { sha: item.sha ?? "", size: item.size ?? 0 };
        return item.path;
      }).sort();
      if ([".obsidian/plugins/simple-sync/data.json", ".obsidian/plugins/simple-link/data.json"].some((path) => remoteFiles.includes(path))) {
        throw new Error("远端正在跟踪插件的本机凭据文件 data.json。请先从远端历史中处理它，再继续接入。");
      }
    }
    const localSet = new Set(localFiles);
    const remoteSet = new Set(remoteFiles);
    const remoteOnly = remoteFiles.filter((name) => !localSet.has(name));
    const deletedTrackedRemote = !alreadyLinked ? remoteOnly.filter((name) => trackedLocal.includes(name)) : [];
    if (deletedTrackedRemote.length > 0) {
      throw new Error(`本机已删除但远端仍有同名文件：${deletedTrackedRemote.slice(0, 3).join("、")}。请先手动确认后重新检查。`);
    }
    const ignoredLocalCollisions: string[] = [];
    for (const name of remoteOnly) {
      try {
        await nodeFs!.lstat(nodePath!.join(this.vaultPath, name));
        ignoredLocalCollisions.push(name);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    if (ignoredLocalCollisions.length > 0) {
      throw new Error(`远端文件与本机已忽略的现有路径重名：${ignoredLocalCollisions.slice(0, 3).join("、")}。请先备份并手动整理后重新检查。`);
    }
    const identicalCount = localFiles.filter((name) => remoteBlobs[name]?.sha.length === 40 &&
      localGitBlobs[name] === remoteBlobs[name].sha).length;
    const overlaps = relatedHistory ? [] : localFiles.filter((name) => remoteSet.has(name) &&
      (remoteBlobs[name]?.sha.length !== 40 || localGitBlobs[name] !== remoteBlobs[name].sha));
    const prefixCollision = localFiles.some((name) => hasFileAsParent(name, remoteSet)) ||
      remoteFiles.some((name) => hasFileAsParent(name, localSet));
    if (prefixCollision) throw new Error("两端存在同名文件与目录冲突，需要先手动整理后再接入。");
    const existingIgnore = await this.readIgnore();
    const effectiveIgnore = [...existingIgnore.split(/\r?\n/), ...SETUP_GITIGNORE];
    return {
      vaultPath: this.vaultPath, repoUrl: repo.url, branch: repo.branch, remoteSha: repo.remoteSha, alreadyLinked, relatedHistory,
      localRoot, localBranch, origin, localFiles, localSignatures, remoteFiles, remoteBlobs, overlaps, identicalCount,
      remoteOnly,
      localOnly: localFiles.filter((name) => !remoteSet.has(name)),
      missingIgnoreRules: missingSetupIgnoreRules(existingIgnore),
      trackedExcludedLocal: [...new Set([...trackedIgnoredLocal, ...trackedLocal.filter((name) => shouldIgnore(name, SETUP_GITIGNORE))])].sort(),
      trackedExcludedRemote: remoteFiles.filter((name) => shouldIgnore(name, effectiveIgnore))
    };
  }

  async readOverlap(repo: VerifiedRepo, preview: SetupPreview, file: string): Promise<SetupOverlapContent> {
    if (!preview.overlaps.includes(file)) throw new Error("该文件不在同名文件列表中，请重新检查第 5 步。");
    const absolute = nodePath!.resolve(this.vaultPath, file);
    const vault = nodePath!.resolve(this.vaultPath);
    if (!absolute.toLowerCase().startsWith(`${vault}${nodePath!.sep}`.toLowerCase())) throw new Error("文件路径超出 Vault");
    const localStat = await nodeFs!.stat(absolute);
    const local = localStat.size > 100000
      ? `文件较大（${localStat.size} 字节），请在 Obsidian 中打开本机文件查看。`
      : this.describeContent(await nodeFs!.readFile(absolute));
    const blob = preview.remoteBlobs[file];
    if (!blob?.sha) throw new Error("缺少远端文件信息，请重新检查第 5 步。");
    if (blob.size > 100000) return { path: file, local, remote: `远端文件较大（${blob.size} 字节），请在 GitHub 仓库网页查看。` };
    const data = await this.githubApi(`repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/git/blobs/${blob.sha}`) as { content?: string; encoding?: string };
    if (data.encoding !== "base64" || !data.content) throw new Error("无法读取远端文件内容");
    return { path: file, local, remote: this.describeContent(Buffer.from(data.content.replace(/\s/g, ""), "base64")) };
  }

  private describeContent(buffer: Buffer): string {
    if (buffer.includes(0)) return `二进制文件（${buffer.length} 字节），请在对应位置查看原文件。`;
    try { return new TextDecoder("utf-8", { fatal: true }).decode(buffer).slice(0, 10000); }
    catch { return `非 UTF-8 文本或二进制文件（${buffer.length} 字节）。`; }
  }

  private async appendIgnore(): Promise<void> {
    const file = nodePath!.join(this.vaultPath, ".gitignore");
    const existing = await this.readIgnore();
    const missing = missingSetupIgnoreRules(existing);
    if (!missing.length) return;
    const eol = existing.includes("\r\n") ? "\r\n" : "\n";
    const separator = existing ? `${existing.endsWith("\n") ? "" : eol}${eol}` : "";
    await nodeFs!.writeFile(file, `${existing}${separator}# Simple Link recommended local exclusions${eol}${missing.join(eol)}${eol}`, "utf8");
  }

  private async rebuildTrackingIndex(paths: string[], skipped: ReadonlySet<string>): Promise<void> {
    for (const path of paths) {
      try { await this.run("git", ["check-ignore", "--no-index", "-q", "--", path]); }
      catch { throw new Error(`不能确认 .gitignore 会排除 ${path}，已停止重建 Git 追踪。请检查排除规则后重新预览。`); }
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
    if (remaining.length) throw new Error(`重建后仍有 ${remaining.length} 个被忽略的文件受到追踪，请检查 .gitignore 后重试。`);
  }

  async finish(
    repo: VerifiedRepo,
    prior: SetupPreview,
    choices: Record<string, OverlapChoice>,
    author: { name: string; email: string },
    onMutationStart?: () => Promise<void>,
    activelyChangingPaths: ReadonlySet<string> = new Set(),
    rebuildTracking = false
  ): Promise<string[]> {
    const verified = await this.verifyRepository(repo.url);
    const latest = await this.preview(verified);
    if (verified.branch !== prior.branch || latest.alreadyLinked !== prior.alreadyLinked ||
        latest.relatedHistory !== prior.relatedHistory ||
        JSON.stringify(latest.remoteFiles) !== JSON.stringify(prior.remoteFiles) ||
        latest.remoteSha !== prior.remoteSha || latest.origin !== prior.origin || latest.localBranch !== prior.localBranch) {
      throw new Error("远端或仓库状态在预览后发生变化，请重新检查第 5 步。");
    }
    if (JSON.stringify(latest.trackedExcludedLocal) !== JSON.stringify(prior.trackedExcludedLocal) ||
        JSON.stringify(latest.trackedExcludedRemote) !== JSON.stringify(prior.trackedExcludedRemote)) {
      throw new Error("已被 Git 跟踪的忽略文件在预览后发生变化，请重新检查第 5 步。");
    }
    const changedSincePreview = new Set([...new Set([...prior.localFiles, ...latest.localFiles])]
      .filter((file) => prior.localSignatures[file] !== latest.localSignatures[file]));
    if (changedSincePreview.has(".gitignore") ||
        JSON.stringify(latest.missingIgnoreRules) !== JSON.stringify(prior.missingIgnoreRules)) {
      throw new Error(".gitignore 在预览后发生变化，请重新检查第 5 步的待补规则。");
    }
    const active = new Set([...changedSincePreview, ...activelyChangingPaths]);
    const pluginDirs = new Set([...active].map((file) => /^\.obsidian\/plugins\/[^/]+\//.exec(file)?.[0]).filter((dir): dir is string => !!dir));
    const changedOutsidePlugins = [...changedSincePreview].filter((file) => ![...pluginDirs].some((dir) => file.startsWith(dir)));
    if (!latest.alreadyLinked && changedOutsidePlugins.length > 0) {
      throw new Error("首次合并前本地文件在预览后发生变化，请重新检查第 5 步。");
    }
    const skipped = new Set<string>(changedSincePreview);
    const changes = latest.localRoot
      ? parseGitStatus(await this.run("git", ["status", "--porcelain=v1", "--untracked-files=all", "-z"]))
      : [];
    const dirtyPaths = new Set(changes.flatMap((change) => [change.path, change.oldPath].filter((file): file is string => !!file)));
    for (const file of latest.localFiles) {
      if ((!latest.localRoot || dirtyPaths.has(file)) &&
          (active.has(file) || [...pluginDirs].some((dir) => file.startsWith(dir)))) skipped.add(file);
    }
    if (!latest.relatedHistory && latest.overlaps.some((file) => skipped.has(file))) {
      throw new Error("正在编辑的插件与远端存在同名文件。请暂停编辑并重新检查第 5 步，避免首次合并覆盖本机文件。");
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
      if (overlap) throw new Error(`远端也修改了正在编辑的文件 ${overlap}。请先暂停编辑并处理该文件，再重新检查第 5 步。`);
    }
    for (const file of latest.overlaps) if (!choices[file]) throw new Error(`请选择同名文件的保留版本：${file}`);
    if (!author.name.trim() || !author.email.trim() || author.name === "default" || author.email === "default@default.com") {
      throw new Error("请填写 Git 提交作者名称和邮箱。");
    }
    await onMutationStart?.();
    if (!latest.localRoot) await this.run("git", ["init", "-b", repo.branch]);
    await this.run("git", ["config", "user.name", author.name]);
    await this.run("git", ["config", "user.email", author.email]);
    if (!latest.origin) await this.run("git", ["remote", "add", "origin", repo.url]);
    await this.appendIgnore();
    let hasHead = false;
    try { await this.run("git", ["rev-parse", "--verify", "HEAD"]); hasHead = true; }
    catch { /* new repository */ }
    if (hasHead) await this.run("git", ["add", "-A"]);
    else {
      const included = [...new Set([...latest.localFiles, ".gitignore"])].filter((file) => !skipped.has(file));
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
      const changedDuringStage: string[] = [];
      for (const file of staged) {
        try {
          const stat = await nodeFs!.stat(nodePath!.join(this.vaultPath, file));
          const hash = nodeCrypto!.createHash("sha256");
          for await (const chunk of nodeFsStream!.createReadStream(nodePath!.join(this.vaultPath, file))) hash.update(chunk);
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
      await this.run("git", ["commit", "-m", "Simple Link initial vault snapshot"]);
    }
    if (repo.remoteSha) {
      await this.run("git", ["fetch", "origin", repo.branch]);
      const fetchedSha = await this.run("git", ["rev-parse", "FETCH_HEAD"]);
      if (fetchedSha !== repo.remoteSha) throw new Error("远端分支在检查后更新了。尚未合并或推送，请重新预览。");
      let containsRemote = false;
      try { await this.run("git", ["merge-base", "--is-ancestor", "FETCH_HEAD", "HEAD"]); containsRemote = true; } catch { /* needs merge */ }
      if (!containsRemote) {
        try {
          await this.run("git", latest.relatedHistory
            ? ["merge", "--no-commit", "--no-ff", "FETCH_HEAD"]
            : ["merge", "--allow-unrelated-histories", "--no-commit", "--no-ff", "-s", "ours", "FETCH_HEAD"]);
        } catch (error) {
          try { await this.run("git", ["merge", "--abort"]); } catch { /* retain Git's diagnostic */ }
          throw new Error(latest.relatedHistory
            ? `同源仓库合并出现冲突；已尝试撤销本次合并。请先处理冲突后重新检查第 5 步。${String(error)}`
            : String(error));
        }
        try {
          const fromRemote = latest.relatedHistory ? [] :
            [...latest.remoteOnly, ...latest.overlaps.filter((name) => choices[name] === "remote")];
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
            [...new Set([...latest.trackedExcludedLocal, ...latest.trackedExcludedRemote])], skipped);
          await this.run("git", ["commit", "-m", "Simple Link connect local and remote notes"]);
        } catch (error) {
          try { await this.run("git", ["merge", "--abort"]); } catch { /* keep Git's diagnostics */ }
          throw error;
        }
      }
    }
    await this.run("git", ["push", "-u", "origin", `HEAD:${repo.branch}`]);
    return [...skipped].sort();
  }
}
