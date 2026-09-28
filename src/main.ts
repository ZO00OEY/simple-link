import {
  addIcon,
  App,
  EventRef,
  FileSystemAdapter,
  ItemView,
  Menu,
  Modal,
  Notice,
  Platform,
  Plugin,
  PluginSettingTab,
  requestUrl,
  setIcon,
  setTooltip,
  Setting,
  TAbstractFile,
  TFile,
  WorkspaceLeaf
} from "obsidian";
import { coalesceDirty, DEFAULT_SYNC_IGNORE_PATTERNS, DirtyEntry, shouldIgnore } from "./dirty";
import {
  ChangeItem,
  findRemoteChangeOverlaps,
  parseGitNameStatus,
  parseGitStatus,
  partitionCommitChanges
} from "./gitStatus";
import { applyConflictResolutions, ConflictBlock, parseConflictBlocks } from "./conflict";
import { describeGitError, isMissingRemoteRefError, isTransientGitNetworkError, isUncertainGitAuthError } from "./gitError";
import { SimpleSyncConflictPreviewModal } from "./conflictPreview";
import { GitSetup, OverlapChoice, SetupOverlapContent, SetupPreview, VerifiedRepo, explainSetupError } from "./onboarding";

type AuthMode = "gh-cli" | "token";
type ChangeViewMode = "upload" | "commit";
type ViewStatusTone = "success" | "pending" | "error" | "checking" | "commit" | "fetch" | "merge" | "push";

interface ViewStatusState {
  text: string;
  tone: ViewStatusTone;
}

interface DesktopCommitResult {
  committed: boolean;
  skippedPaths: string[];
}

interface InterruptedGitOperation {
  ref: string;
  label: string;
  abortArgs: string[];
}

interface GitRepairResult {
  operation: string;
  restoredLocalChanges: boolean;
}

class SyncDeferredError extends Error {}

const DEFAULT_GIT_AUTHOR_NAME = "default";
const DEFAULT_GIT_AUTHOR_EMAIL = "default@default.com";
const CHECKBOX_CHECKED_ICON = "simple-sync-square-check-contained";
const LAYOUT_SWITCH_ICON = "simple-sync-layout-panels";
const REFRESH_CHANGES_ICON = "simple-sync-refresh-changes";

addIcon(
  CHECKBOX_CHECKED_ICON,
  '<g fill="none" stroke="currentColor" stroke-width="8.333" stroke-linecap="round" stroke-linejoin="round"><rect x="12.5" y="12.5" width="75" height="75" rx="8.333"/><path d="m29.167 50.417 13.333 13.333 29.167-30"/></g>'
);
addIcon(
  LAYOUT_SWITCH_ICON,
  '<g fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"><rect x="12" y="15" width="76" height="70" rx="8"/><path d="M42 15v70M42 43h46"/></g>'
);
addIcon(
  REFRESH_CHANGES_ICON,
  '<g fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"><path d="M30 16H20a6 6 0 0 0-6 6v10M70 16h10a6 6 0 0 1 6 6v10M30 84H20a6 6 0 0 1-6-6V68M70 84h10a6 6 0 0 0 6-6V68"/><path d="M34 36h32M34 50h22M34 64h32"/></g>'
);

interface ServerAction {
  type: "upsert" | "delete";
  path: string;
  contentBase64?: string;
}

interface ServerCommand {
  id: string;
  kind: "notice" | "sync" | "open_file";
  title: string;
  body: string;
  payload: Record<string, unknown>;
}

interface ErrorLogEntry {
  timestamp: number;
  context: string;
  message: string;
  status?: "success" | "error";
}

interface PluginSettings {
  enabled: boolean;
  viewLayout: "list" | "tree";
  showVersionViewSwitcher: boolean;
  changeViewMode: ChangeViewMode;
  lastSyncAt: number;
  lastPullAt: number;
  serverUrl: string;
  serverPassword: string;
  deviceId: string;
  deviceName: string;
  baseVersion: number;
  dirty: DirtyEntry[];
  inFlight: DirtyEntry[];
  pendingRequestId: string;
  ignorePatterns: string[];
  mobileAutoSyncMinutes: number;
  commandPollSeconds: number;
  gitRemoteUrl: string;
  gitBranch: string;
  gitAuthorName: string;
  gitAuthorEmail: string;
  gitAuthMode: AuthMode;
  gitAuthKey: string;
  setupComplete: boolean;
  setupStep: number;
  setupGitVersion: string;
  setupRepoUrl: string;
  setupVerified?: VerifiedRepo;
  setupBackup?: { step: number; repoUrl: string; verified?: VerifiedRepo };
  setupMutationStarted: boolean;
  viewRefreshDelaySeconds: number;
  autoCommitIdleMinutes: number;
  autoPushIdleMinutes: number;
  maxUncommittedMinutes: number;
  maxUnpushedMinutes: number;
  pullOnStartup: boolean;
  autoPullIntervalMinutes: number;
  pendingMergePushAfterResolve: boolean;
  errorLogs: ErrorLogEntry[];
}

const DEFAULT_SETTINGS: PluginSettings = {
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
  autoCommitIdleMinutes: 30,
  autoPushIdleMinutes: 5,
  maxUncommittedMinutes: 60,
  maxUnpushedMinutes: 120,
  pullOnStartup: true,
  autoPullIntervalMinutes: 5,
  pendingMergePushAfterResolve: false,
  errorLogs: []
};

const SHARED_SETTING_KEYS = new Set<keyof PluginSettings>([
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

function pickLocalSettings(source: Partial<PluginSettings>): Partial<PluginSettings> {
  const result: Partial<PluginSettings> = {};
  for (const key of Object.keys(DEFAULT_SETTINGS) as Array<keyof PluginSettings>) {
    if (!SHARED_SETTING_KEYS.has(key) && source[key] !== undefined) {
      (result as Record<string, unknown>)[key] = source[key];
    }
  }
  for (const key of ["setupVerified", "setupBackup"] as const) {
    if (source[key] !== undefined) (result as Record<string, unknown>)[key] = source[key];
  }
  return result;
}

function pickSharedSettings(source: Partial<PluginSettings>): Partial<PluginSettings> {
  const result: Partial<PluginSettings> = {};
  for (const key of SHARED_SETTING_KEYS) {
    if (source[key] !== undefined) (result as Record<string, unknown>)[key] = source[key];
  }
  return result;
}

const ERROR_LOG_RETENTION_MS = 24 * 60 * 60 * 1000;
const MAX_ERROR_LOGS = 500;
const DESKTOP_RETRY_DELAY_MS = 5 * 60 * 1000;
const DESKTOP_STARTUP_NETWORK_RETRY_DELAY_MS = 5 * 1000;
const PLUGIN_EDIT_GRACE_MS = 30 * 60 * 1000;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, Math.min(index + chunkSize, bytes.length)));
  }
  return btoa(binary);
}

function base64ToArrayBuffer(value: string): ArrayBuffer {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatRelativeTime(timestamp: number): string {
  const elapsed = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} 天前`;
  return new Date(timestamp).toLocaleString();
}

function formatStatusError(message: string): string {
  const compact = message.replace(/\s+/g, " ").trim();
  if (!compact) return "未知错误";
  return compact.length > 160 ? `${compact.slice(0, 157)}…` : compact;
}

export default class SimpleSyncPlugin extends Plugin {
  settings: PluginSettings = { ...DEFAULT_SETTINGS };
  private syncing = false;
  private featureActive = false;
  private suppressPaths = new Set<string>();
  private statusEl?: HTMLElement;
  private ribbonEl?: HTMLElement;
  private featureEvents: EventRef[] = [];
  private featureIntervals: number[] = [];
  private viewRefreshTimer?: number;
  private idleCommitTimer?: number;
  private idlePushTimer?: number;
  private maxCommitTimer?: number;
  private maxPushTimer?: number;
  private desktopPushRetryTimer?: number;
  private firstUncommittedAt = 0;
  private firstUnpushedAt = 0;
  private lastFileChangeAt = 0;
  private recentFileChanges = new Map<string, number>();
  private automaticPushQueued = false;
  private startupPullScheduled = false;
  private desktopGitQueue: Promise<void> = Promise.resolve();
  private desktopGitTrace: string[] = [];
  private sharedSettingsWritable = true;
  private deferredMergePaths: string[] = [];
  private syncActivity?: ViewStatusState;
  private setupPreview?: SetupPreview;
  private setupChoices: Record<string, OverlapChoice> = {};
  private setupTrackingChoice?: "keep" | "rebuild";

  async onload(): Promise<void> {
    await this.loadSettings();
    if (!Platform.isMobile) await this.detectDesktopGitDefaults();
    this.statusEl = this.addStatusBarItem();
    this.registerView(SimpleSyncView.type, (leaf) => new SimpleSyncView(leaf, this));
    this.registerView(SimpleSyncConflictView.type, (leaf) => new SimpleSyncConflictView(leaf, this));
    this.addSettingTab(new SimpleSyncSettingTab(this.app, this));
    this.addCommand({ id: "sync-now", name: "同步笔记", callback: () => void this.syncNow(true) });
    this.addCommand({ id: "test-connection", name: "测试同步连接", callback: () => void this.testConnection(true) });
    this.addCommand({ id: "open-sync-view", name: "打开同步面板", callback: () => void this.openSyncView() });
    this.addCommand({ id: "preview-conflict-ui", name: "预览冲突界面", callback: () => void this.openConflictPreview() });
    if (this.settings.enabled) {
      this.activateFeature();
      if (!Platform.isMobile) {
        this.app.workspace.onLayoutReady(() => void this.openSyncView());
      }
    } else if (this.statusEl) this.statusEl.hidden = true;
  }

  onunload(): void {
    this.deactivateFeature();
  }

  async setFeatureEnabled(enabled: boolean): Promise<void> {
    this.settings.enabled = enabled;
    await this.saveSettings();
    if (enabled) {
      this.activateFeature();
      await this.openSyncView();
    } else {
      this.deactivateFeature();
    }
  }

  private activateFeature(): void {
    if (this.featureActive) return;
    this.featureActive = true;
    if (this.statusEl) this.statusEl.hidden = false;
    this.ribbonEl = this.addRibbonIcon("refresh-cw", "打开 Simple Link", () => void this.openSyncView());
    this.registerViewRefreshEvents();
    if (Platform.isMobile) {
      this.registerMobileEvents();
      this.addFeatureInterval(
        window.setInterval(() => void this.pollCommands(), Math.max(15, this.settings.commandPollSeconds) * 1000)
      );
      if (this.settings.mobileAutoSyncMinutes > 0) {
        this.addFeatureInterval(
          window.setInterval(
            () => void this.syncNow(false),
            Math.max(1, this.settings.mobileAutoSyncMinutes) * 60 * 1000
          )
        );
      }
      this.setStatus("移动端 · 等待同步");
      window.setTimeout(() => void this.registerMobile(), 1000);
    } else {
      this.configureDesktopAutomation();
      this.scheduleStartupPull();
      void this.resumeDesktopDirtyState();
      this.setStatus(this.settings.setupComplete ? "桌面端 · Git 模式" : "等待首次 Git 配置");
    }
  }

  private deactivateFeature(): void {
    this.featureActive = false;
    for (const ref of this.featureEvents) this.app.vault.offref(ref);
    this.featureEvents = [];
    for (const interval of this.featureIntervals) window.clearInterval(interval);
    this.featureIntervals = [];
    this.clearDesktopTimeouts();
    this.ribbonEl?.remove();
    this.ribbonEl = undefined;
    if (this.statusEl) this.statusEl.hidden = true;
    this.app.workspace.detachLeavesOfType(SimpleSyncView.type);
    this.app.workspace.detachLeavesOfType(SimpleSyncConflictView.type);
  }

  private addFeatureInterval(interval: number): void {
    this.featureIntervals.push(interval);
    this.registerInterval(interval);
  }

  private clearDesktopTimeouts(): void {
    if (this.viewRefreshTimer !== undefined) window.clearTimeout(this.viewRefreshTimer);
    if (this.idleCommitTimer !== undefined) window.clearTimeout(this.idleCommitTimer);
    if (this.idlePushTimer !== undefined) window.clearTimeout(this.idlePushTimer);
    if (this.maxCommitTimer !== undefined) window.clearTimeout(this.maxCommitTimer);
    if (this.maxPushTimer !== undefined) window.clearTimeout(this.maxPushTimer);
    if (this.desktopPushRetryTimer !== undefined) window.clearTimeout(this.desktopPushRetryTimer);
    this.viewRefreshTimer = undefined;
    this.idleCommitTimer = undefined;
    this.idlePushTimer = undefined;
    this.maxCommitTimer = undefined;
    this.maxPushTimer = undefined;
    this.desktopPushRetryTimer = undefined;
    this.firstUncommittedAt = 0;
    this.firstUnpushedAt = 0;
  }

  private configureDesktopAutomation(): void {
    if (!this.settings.setupComplete) return;
    if (this.settings.autoPullIntervalMinutes > 0) {
      this.addFeatureInterval(
        window.setInterval(
          () => void this.enqueueDesktopGit(() => this.desktopFetchAndMerge(), "自动 Fetch + Merge").catch(() => undefined),
          Math.max(1, this.settings.autoPullIntervalMinutes) * 60 * 1000
        )
      );
    }
  }

  private scheduleStartupPull(): void {
    if (!this.settings.setupComplete) return;
    if (!this.settings.pullOnStartup || this.startupPullScheduled) return;
    this.startupPullScheduled = true;
    this.app.workspace.onLayoutReady(() => {
      if (!this.featureActive || Platform.isMobile) return;
      void this.enqueueDesktopGit(
        async () => {
          const conflicts = await this.getUnmergedPaths();
          if (conflicts.length > 0) {
            throw new SyncDeferredError(`有 ${conflicts.length} 个合并冲突等待处理`);
          }
          try {
            return await this.desktopStartupSync();
          } catch (error) {
            if (!isTransientGitNetworkError(error) && !isUncertainGitAuthError(error)) throw error;
            this.setStatus("GitHub 连接或认证暂时异常 · 正在重试");
            await new Promise((resolve) => window.setTimeout(resolve, DESKTOP_STARTUP_NETWORK_RETRY_DELAY_MS));
            if (!this.featureActive) return false;
            return await this.desktopStartupSync();
          }
        },
        "启动时 Commit + Fetch + Merge"
      ).catch(() => undefined);
    });
  }

  async restartDesktopAutomation(): Promise<void> {
    if (Platform.isMobile || !this.featureActive) return;
    for (const interval of this.featureIntervals) window.clearInterval(interval);
    this.featureIntervals = [];
    if (this.idleCommitTimer !== undefined) window.clearTimeout(this.idleCommitTimer);
    if (this.idlePushTimer !== undefined) window.clearTimeout(this.idlePushTimer);
    if (this.maxCommitTimer !== undefined) window.clearTimeout(this.maxCommitTimer);
    if (this.maxPushTimer !== undefined) window.clearTimeout(this.maxPushTimer);
    if (this.desktopPushRetryTimer !== undefined) window.clearTimeout(this.desktopPushRetryTimer);
    this.idleCommitTimer = undefined;
    this.idlePushTimer = undefined;
    this.maxCommitTimer = undefined;
    this.maxPushTimer = undefined;
    this.desktopPushRetryTimer = undefined;
    this.firstUncommittedAt = 0;
    this.firstUnpushedAt = 0;
    this.configureDesktopAutomation();
    await this.resumeDesktopDirtyState();
  }

  async loadSettings(): Promise<void> {
    const saved = (await this.loadData()) as
      | (Partial<PluginSettings> & { desktopAutoSyncMinutes?: number; autoPushIntervalMinutes?: number })
      | null;
    const shared = await this.loadSharedSettings();
    const legacyShared = pickSharedSettings(saved ?? {});
    this.settings = Object.assign(
      {},
      DEFAULT_SETTINGS,
      shared ?? legacyShared,
      pickLocalSettings(saved ?? {})
    );
    // Preserve the active sync flow for installations configured before the guide existed.
    if (saved?.setupComplete === undefined && this.settings.gitRemoteUrl) this.settings.setupComplete = true;
    delete (this.settings as unknown as { desktopAutoSyncMinutes?: number }).desktopAutoSyncMinutes;
    delete (this.settings as unknown as { autoPushIntervalMinutes?: number }).autoPushIntervalMinutes;
    this.settings.dirty = Array.isArray(this.settings.dirty) ? this.settings.dirty : [];
    this.settings.inFlight = Array.isArray(this.settings.inFlight) ? this.settings.inFlight : [];
    this.settings.ignorePatterns = Array.isArray(this.settings.ignorePatterns)
      ? this.settings.ignorePatterns.filter((pattern): pattern is string => typeof pattern === "string")
      : [...DEFAULT_SYNC_IGNORE_PATTERNS];
    this.settings.errorLogs = Array.isArray(this.settings.errorLogs) ? this.settings.errorLogs : [];
    this.pruneErrorLogs();
    if (!this.settings.lastPullAt) {
      this.settings.lastPullAt = this.settings.errorLogs
        .filter((entry) => entry.status === "success" && /Fetch|Pull/.test(entry.context))
        .reduce((latest, entry) => Math.max(latest, entry.timestamp), 0);
    }
    if (!this.settings.deviceId) this.settings.deviceId = crypto.randomUUID();
    if (!this.settings.deviceName) {
      this.settings.deviceName = Platform.isMobile ? "Simple Mobile" : "Simple Desktop";
    }
    await this.saveSettings();
  }

  async saveSettings(): Promise<void> {
    await this.saveData(pickLocalSettings(this.settings));
    if (this.sharedSettingsWritable) await this.saveSharedSettings();
  }

  private sharedSettingsPath(): string {
    return `${this.app.vault.configDir}/plugins/${this.manifest.id}/sync-settings.json`;
  }

  private async loadSharedSettings(): Promise<Partial<PluginSettings> | null> {
    const path = this.sharedSettingsPath();
    if (!(await this.app.vault.adapter.exists(path))) return null;
    try {
      const parsed = JSON.parse(await this.app.vault.adapter.read(path)) as Partial<PluginSettings>;
      return pickSharedSettings(parsed);
    } catch (error) {
      this.sharedSettingsWritable = false;
      console.error("Simple Link shared settings", error);
      new Notice("Simple Link：同步配置文件存在冲突或格式错误，已停止覆盖该文件", 10000);
      return null;
    }
  }

  private async saveSharedSettings(): Promise<void> {
    const path = this.sharedSettingsPath();
    const content = `${JSON.stringify(pickSharedSettings(this.settings), null, 2)}\n`;
    if (await this.app.vault.adapter.exists(path)) {
      const current = await this.app.vault.adapter.read(path);
      if (current === content) return;
    }
    await this.app.vault.adapter.write(path, content);
  }

  private pruneErrorLogs(): void {
    const cutoff = Date.now() - ERROR_LOG_RETENTION_MS;
    this.settings.errorLogs = this.settings.errorLogs
      .filter((entry) => entry.timestamp >= cutoff && (entry.status === "success" || entry.message))
      .slice(-MAX_ERROR_LOGS);
  }

  private async recordError(context: string, error: unknown): Promise<void> {
    await this.recordLog(context, "error", messageOf(error));
  }

  private async recordSuccess(context: string, message = ""): Promise<void> {
    await this.recordLog(context, "success", message);
  }

  private async recordLog(context: string, status: "success" | "error", message = ""): Promise<void> {
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

  getRecentErrorLogs(): ErrorLogEntry[] {
    this.pruneErrorLogs();
    return [...this.settings.errorLogs].reverse();
  }

  getActiveSyncError(): ErrorLogEntry | undefined {
    const logs = this.getRecentErrorLogs();
    const latestFetch = logs.find((entry) => /Fetch|Pull|Push|同步/.test(entry.context));
    const latestPush = logs.find((entry) => /Push|同步/.test(entry.context));
    return [latestFetch, latestPush]
      .filter((entry): entry is ErrorLogEntry => !!entry && entry.status === "error")
      .sort((a, b) => b.timestamp - a.timestamp)[0];
  }

  async clearErrorLogs(): Promise<void> {
    this.settings.errorLogs = [];
    await this.saveSettings();
    await this.refreshSyncView();
  }

  private setStatus(text: string): void {
    if (this.statusEl) this.statusEl.setText(`Simple Link: ${text}`);
  }

  private setSyncActivity(text: string, tone: ViewStatusTone): void {
    this.syncActivity = { text, tone };
    this.setStatus(text);
    for (const leaf of this.app.workspace.getLeavesOfType(SimpleSyncView.type)) {
      if (leaf.view instanceof SimpleSyncView) leaf.view.updateActivity(this.syncActivity);
    }
  }

  private clearSyncActivity(): void {
    this.syncActivity = undefined;
  }

  getSyncActivity(): ViewStatusState | undefined {
    return this.syncActivity ? { ...this.syncActivity } : undefined;
  }

  private trackFeatureEvent(ref: EventRef): void {
    this.featureEvents.push(ref);
    this.registerEvent(ref);
  }

  private registerViewRefreshEvents(): void {
    const changed = (file: TAbstractFile): void => this.handleVaultChange([file.path]);
    this.trackFeatureEvent(this.app.vault.on("create", changed));
    this.trackFeatureEvent(this.app.vault.on("modify", changed));
    this.trackFeatureEvent(this.app.vault.on("delete", changed));
    this.trackFeatureEvent(
      this.app.vault.on("rename", (file, oldPath) => this.handleVaultChange([file.path, oldPath]))
    );
  }

  private handleVaultChange(paths: string[]): void {
    const relevantPaths = paths.filter((path) => !shouldIgnore(path, this.settings.ignorePatterns));
    if (relevantPaths.length === 0) return;
    const now = Date.now();
    this.lastFileChangeAt = now;
    for (const path of relevantPaths) this.recentFileChanges.set(path, now);
    this.scheduleViewRefresh();
    if (!Platform.isMobile && this.settings.setupComplete) {
      this.scheduleDesktopCommit();
      if (this.firstUnpushedAt > 0) this.scheduleDesktopPush();
    }
  }

  private scheduleViewRefresh(): void {
    if (this.viewRefreshTimer !== undefined) window.clearTimeout(this.viewRefreshTimer);
    this.viewRefreshTimer = window.setTimeout(() => {
      this.viewRefreshTimer = undefined;
      void this.refreshSyncView();
    }, Math.max(0.5, this.settings.viewRefreshDelaySeconds) * 1000);
  }

  private scheduleDesktopCommit(): void {
    if (!this.settings.setupComplete) return;
    if (this.settings.autoCommitIdleMinutes > 0) {
      if (this.idleCommitTimer !== undefined) window.clearTimeout(this.idleCommitTimer);
      this.idleCommitTimer = window.setTimeout(
        () => void this.runAutomaticCommit(),
        Math.max(0.1, this.settings.autoCommitIdleMinutes) * 60 * 1000
      );
    }
    if (this.firstUncommittedAt === 0) {
      this.firstUncommittedAt = Date.now();
      if (this.settings.maxUncommittedMinutes > 0) {
        this.maxCommitTimer = window.setTimeout(() => {
          void this.runAutomaticCommit();
        }, Math.max(1, this.settings.maxUncommittedMinutes) * 60 * 1000);
      }
    }
  }

  private scheduleDesktopPush(): void {
    if (!this.settings.setupComplete) return;
    if (this.desktopPushRetryTimer !== undefined) return;
    if (this.lastFileChangeAt === 0) this.lastFileChangeAt = Date.now();
    if (this.settings.autoPushIdleMinutes > 0) {
      if (this.idlePushTimer !== undefined) window.clearTimeout(this.idlePushTimer);
      const idleThreshold = Math.max(0.1, this.settings.autoPushIdleMinutes) * 60 * 1000;
      const idleFor = Math.max(0, Date.now() - this.lastFileChangeAt);
      this.idlePushTimer = window.setTimeout(() => {
        this.idlePushTimer = undefined;
        void this.runAutomaticPush();
      }, Math.max(0, idleThreshold - idleFor));
    }
    if (this.firstUnpushedAt === 0) this.firstUnpushedAt = Date.now();
    if (this.maxPushTimer === undefined && this.settings.maxUnpushedMinutes > 0) {
      const maxThreshold = Math.max(1, this.settings.maxUnpushedMinutes) * 60 * 1000;
      const pendingFor = Math.max(0, Date.now() - this.firstUnpushedAt);
      this.maxPushTimer = window.setTimeout(() => {
        this.maxPushTimer = undefined;
        void this.runAutomaticPush();
      }, Math.max(0, maxThreshold - pendingFor));
    }
  }

  private clearDesktopPushRetry(): void {
    if (this.desktopPushRetryTimer !== undefined) window.clearTimeout(this.desktopPushRetryTimer);
    this.desktopPushRetryTimer = undefined;
  }

  private async scheduleDesktopPushRetry(statusText?: string): Promise<void> {
    try {
      const interrupted = await this.getInterruptedGitOperation();
      const conflicts = await this.getUnmergedPaths();
      if (interrupted || conflicts.length > 0) return;
    } catch {
      // Git 暂时不可用时仍安排一次重试。
    }
    if (this.desktopPushRetryTimer !== undefined) window.clearTimeout(this.desktopPushRetryTimer);
    this.desktopPushRetryTimer = window.setTimeout(() => {
      this.desktopPushRetryTimer = undefined;
      void this.enqueueDesktopGit(() => this.desktopAutomaticPush(), "Push 重试").catch(() => undefined);
    }, DESKTOP_RETRY_DELAY_MS);
    this.setStatus(statusText ?? "Push 失败 · 5 分钟后重试");
  }

  private resetDesktopCommitTracking(): void {
    if (this.idleCommitTimer !== undefined) window.clearTimeout(this.idleCommitTimer);
    if (this.maxCommitTimer !== undefined) window.clearTimeout(this.maxCommitTimer);
    this.idleCommitTimer = undefined;
    this.maxCommitTimer = undefined;
    this.firstUncommittedAt = 0;
  }

  private async runAutomaticCommit(): Promise<void> {
    let result: DesktopCommitResult = { committed: false, skippedPaths: [] };
    try {
      await this.enqueueDesktopGit(async () => {
        result = await this.desktopCommitOnly();
        this.resetDesktopCommitTracking();
        if (await this.hasDesktopChanges()) {
          this.scheduleDesktopCommit();
        }
      }, "自动 Commit");
      if (result.committed) {
        this.scheduleDesktopPush();
      }
    } catch {
      // 队列会记录错误；保留未提交状态，等待下一次文件变化重新安排。
    }
  }

  private async runAutomaticPush(): Promise<void> {
    if (this.automaticPushQueued) return;
    this.automaticPushQueued = true;
    try {
      await this.enqueueDesktopGit(async () => {
        return await this.desktopAutomaticPush();
      }, "自动 Push");
    } catch {
      // 队列会记录错误；后续文件变化会再次尝试。
    } finally {
      this.automaticPushQueued = false;
    }
  }

  private enqueueDesktopGit(task: () => Promise<void | boolean>, errorContext?: string): Promise<void> {
    if (!this.settings.setupComplete) return Promise.reject(new Error("请先完成首次使用引导"));
    const trackedTask = async (): Promise<void> => {
      if (!this.settings.setupComplete) throw new SyncDeferredError("请先完成首次使用引导");
      const isFetchTask = !!errorContext && (errorContext.includes("Fetch") || errorContext.includes("Pull"));
      const isPushTask = !!errorContext && (errorContext.includes("Push") || errorContext.includes("同步"));
      this.desktopGitTrace = isFetchTask || isPushTask
        ? [
            `远端：origin/${this.settings.gitBranch}`,
            `凭据路径：${this.settings.gitAuthMode === "token" ? "插件 Token" : "系统 Git 凭据管理器"}`
          ]
        : [];
      const meaningfulChange = await task();
      if (errorContext && (meaningfulChange !== false || isFetchTask || isPushTask)) {
        const resultMessage = isPushTask
          ? meaningfulChange === false ? "GitHub 连接成功；无需上传" : "GitHub 连接成功；上传完成"
          : isFetchTask
            ? meaningfulChange === false ? "GitHub 连接成功；无需合并" : "GitHub 连接成功；检查或合并完成"
            : "本机操作完成；未执行 GitHub 远端连接检查";
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
        if (errorContext.includes("Push") || errorContext.includes("同步")) {
          await this.scheduleDesktopPushRetry();
        } else if (errorContext.includes("Fetch") || errorContext.includes("Pull")) {
          this.setStatus(this.settings.autoPullIntervalMinutes > 0 ? "Fetch 失败 · 等待下次自动检查" : "Fetch 失败");
        }
        await this.refreshSyncView();
      }
    });
    return run;
  }

  private async traceDesktopGitStep<T>(label: string, action: () => Promise<T>): Promise<T> {
    const startedAt = Date.now();
    try {
      const result = await action();
      this.desktopGitTrace.push(`${label}：成功（${Date.now() - startedAt} ms）`);
      return result;
    } catch (error) {
      this.desktopGitTrace.push(`${label}：失败（${Date.now() - startedAt} ms）`);
      throw error;
    }
  }

  private async hasDesktopChanges(): Promise<boolean> {
    return (await this.gitRaw(["status", "--porcelain=v1", "-z"])).length > 0;
  }

  private async hasDesktopHead(): Promise<boolean> {
    try {
      await this.gitRaw(["rev-parse", "--verify", "HEAD"]);
      return true;
    } catch {
      return false;
    }
  }

  private async getUnpushedCommitWindow(): Promise<{ oldestAt: number; latestAt: number } | null> {
    if (!(await this.hasDesktopHead())) return null;
    const remoteRef = `refs/remotes/origin/${this.settings.gitBranch}`;
    let range = "HEAD";
    try {
      await this.git(["show-ref", "--verify", "--quiet", remoteRef]);
      range = `${remoteRef}..HEAD`;
    } catch {
      // 远端分支尚不存在时，本机全部 Commit 都属于待 Push。
    }
    const output = (await this.gitRaw(["log", "--reverse", "--format=%ct", range])).trim();
    if (!output) return null;
    const timestamps = output
      .split(/\r?\n/)
      .map((value) => Number(value) * 1000)
      .filter((value) => Number.isFinite(value) && value > 0);
    if (timestamps.length === 0) return null;
    return { oldestAt: timestamps[0], latestAt: timestamps[timestamps.length - 1] };
  }

  private resetDesktopPushTracking(): void {
    if (this.idlePushTimer !== undefined) window.clearTimeout(this.idlePushTimer);
    if (this.maxPushTimer !== undefined) window.clearTimeout(this.maxPushTimer);
    this.idlePushTimer = undefined;
    this.maxPushTimer = undefined;
    this.firstUnpushedAt = 0;
  }

  private async resumeDesktopDirtyState(): Promise<void> {
    try {
      const interrupted = await this.getInterruptedGitOperation();
      const conflicts = await this.getUnmergedPaths();
      if (interrupted || conflicts.length > 0) {
        this.setStatus(
          conflicts.length > 0
            ? `有 ${conflicts.length} 个合并冲突等待处理`
            : `检测到未完成的 ${interrupted?.label ?? "Git 操作"}`
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
        if (this.idlePushTimer !== undefined) window.clearTimeout(this.idlePushTimer);
        if (this.maxPushTimer !== undefined) window.clearTimeout(this.maxPushTimer);
        this.idlePushTimer = undefined;
        this.maxPushTimer = undefined;
        this.firstUnpushedAt = unpushed.oldestAt;
        if (!hasChanges) this.lastFileChangeAt = unpushed.latestAt;
        this.scheduleDesktopPush();
      }
    } catch {
      // 仓库尚未完成配置时，不启动自动 Commit 计时。
    }
  }

  private async getInterruptedGitOperation(): Promise<InterruptedGitOperation | null> {
    const operations: InterruptedGitOperation[] = [
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
        // 该操作没有处于进行中。
      }
    }
    return null;
  }

  async getInterruptedGitOperationLabel(): Promise<string | null> {
    if (!this.settings.setupComplete) throw new Error("请先完成首次使用引导");
    await this.ensureDesktopGit();
    return (await this.getInterruptedGitOperation())?.label ?? null;
  }

  private async restoreRecoveryStash(recoveryStash: string): Promise<void> {
    try {
      await this.git(["stash", "apply", recoveryStash]);
    } catch (error) {
      const conflicts = await this.getUnmergedPaths();
      if (conflicts.length === 0) throw error;
      for (const path of conflicts) {
        try {
          // Stash Apply 中 theirs 是修复前保存的最新本机内容。
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
        throw new Error(`仍有 ${remaining.length} 个本机恢复冲突无法自动处理；备份保留在 ${recoveryStash}`);
      }
    }
    await this.git(["stash", "drop", recoveryStash]);
  }

  async repairInterruptedGitOperation(): Promise<GitRepairResult> {
    let result: GitRepairResult | undefined;
    await this.enqueueDesktopGit(async () => {
      await this.ensureDesktopGit();
      const operation = await this.getInterruptedGitOperation();
      if (!operation) throw new Error("没有检测到可自动修复的未完成 Git 操作");

      const hadChanges = await this.hasDesktopChanges();
      let recoveryStash = "";
      if (hadChanges) {
        const message = `Simple Link repair backup ${new Date().toISOString()}`;
        await this.git(["stash", "push", "--include-untracked", "-m", message]);
        recoveryStash = (await this.git(["stash", "list", "-1", "--format=%gd"])).trim();
        if (!recoveryStash) throw new Error("无法建立本机修改的恢复备份，已停止修复");
      }

      try {
        await this.git(operation.abortArgs);
      } catch (error) {
        if (recoveryStash) {
          try {
            await this.restoreRecoveryStash(recoveryStash);
          } catch {
            throw new Error(
              `${operation.label} 退出失败；本机修改仍保存在 ${recoveryStash}，请不要手动删除该备份。原始错误：${messageOf(error)}`
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
            `${operation.label} 已退出，但恢复本机修改时需要人工处理；完整备份仍保存在 ${recoveryStash}。${messageOf(error)}`
          );
        }
      }

      if (await this.hasDesktopHead()) {
        try {
          await this.git(["symbolic-ref", "--quiet", "HEAD"]);
        } catch {
          throw new Error(`${operation.label} 已退出，但仓库仍处于 detached HEAD，请人工检查后再同步`);
        }
      }
      const commitResult = await this.desktopCommitOnly();
      if (commitResult.committed) this.scheduleDesktopPush();
      await this.desktopFetchAndMerge();
      result = { operation: operation.label, restoredLocalChanges: hadChanges };
      await this.refreshSyncView();
    }, "异常修复");
    if (!result) throw new Error("异常修复没有返回结果");
    return result;
  }

  private async ensureNormalGitState(): Promise<void> {
    const operation = await this.getInterruptedGitOperation();
    if (operation) {
      throw new Error(`检测到未完成的 ${operation.label}，自动 Commit、Merge 和 Push 已暂停`);
    }
    const unmergedPaths = await this.getUnmergedPaths();
    if (unmergedPaths.length > 0) {
      throw new Error(`检测到 ${unmergedPaths.length} 个尚未解决的 Git 冲突，自动 Commit、Merge 和 Push 已暂停`);
    }
    if (await this.hasDesktopHead()) {
      try {
        await this.git(["symbolic-ref", "--quiet", "HEAD"]);
      } catch {
        throw new Error("当前处于 detached HEAD，自动 Commit、Merge 和 Push 已暂停");
      }
    }
  }

  private getActivelyChangingPaths(): Set<string> {
    const active = new Set<string>();
    const now = Date.now();
    const regularWindow = Math.max(0.5, this.settings.viewRefreshDelaySeconds) * 1000;
    const pluginWindow = Math.max(PLUGIN_EDIT_GRACE_MS, this.settings.autoCommitIdleMinutes * 120 * 1000);
    for (const [path, changedAt] of this.recentFileChanges) {
      const holdMs = path.startsWith(".obsidian/plugins/") ? pluginWindow : regularWindow;
      if (now - changedAt < holdMs) active.add(path);
      else this.recentFileChanges.delete(path);
    }
    return active;
  }

  private async getSetupActivePaths(localFiles: string[]): Promise<Set<string>> {
    const active = this.getActivelyChangingPaths();
    const nodeRequire = (globalThis as unknown as { require?: (name: string) => unknown }).require;
    if (!nodeRequire) return active;
    const fs = nodeRequire("fs") as typeof import("fs");
    const path = nodeRequire("path") as typeof import("path");
    const holdMs = Math.max(PLUGIN_EDIT_GRACE_MS, this.settings.autoCommitIdleMinutes * 120 * 1000);
    for (const file of localFiles) {
      if (!file.startsWith(".obsidian/plugins/")) continue;
      try {
        const stat = await fs.promises.stat(path.join(this.vaultBasePath(), file));
        if (Date.now() - stat.mtimeMs < holdMs) active.add(file);
      } catch { /* Deleted files have no modification time. */ }
    }
    return active;
  }

  async openSyncView(refreshExisting = true): Promise<void> {
    if (!this.settings.enabled) {
      new Notice("Simple Link 已关闭，请先在设置中启用");
      return;
    }
    let leaf: WorkspaceLeaf | null = this.app.workspace.getLeavesOfType(SimpleSyncView.type)[0] ?? null;
    const existing = !!leaf;
    if (!leaf) {
      leaf = this.app.workspace.getRightLeaf(false);
      if (!leaf) return;
      await leaf.setViewState({ type: SimpleSyncView.type, active: true });
    }
    await this.app.workspace.revealLeaf(leaf);
    if (existing && refreshExisting) await this.refreshSyncView();
  }

  async openConflictPreview(): Promise<void> {
    new SimpleSyncConflictPreviewModal(this.app).open();
  }

  async refreshSyncView(): Promise<void> {
    const views = this.app.workspace
      .getLeavesOfType(SimpleSyncView.type)
      .map((leaf) => leaf.view)
      .filter((view): view is SimpleSyncView => view instanceof SimpleSyncView);
    await Promise.all(views.map((view) => view.render()));
  }

  async toggleViewLayout(): Promise<void> {
    this.settings.viewLayout = this.settings.viewLayout === "list" ? "tree" : "list";
    await this.saveSettings();
    await this.refreshSyncView();
  }

  getChangeViewMode(): ChangeViewMode {
    return this.settings.showVersionViewSwitcher ? this.settings.changeViewMode : "upload";
  }

  async setChangeViewMode(mode: ChangeViewMode): Promise<void> {
    this.settings.changeViewMode = mode;
    await this.saveSettings();
    await this.refreshSyncView();
  }

  async setVersionViewSwitcher(visible: boolean): Promise<void> {
    this.settings.showVersionViewSwitcher = visible;
    if (!visible) this.settings.changeViewMode = "upload";
    await this.saveSettings();
    await this.refreshSyncView();
  }

  openPluginSettings(): void {
    const appWithSettings = this.app as App & {
      setting: {
        open(): void;
        openTabById(id: string): void;
      };
    };
    appWithSettings.setting.open();
    appWithSettings.setting.openTabById(this.manifest.id);
  }

  async getChanges(mode: ChangeViewMode = this.getChangeViewMode()): Promise<ChangeItem[]> {
    if (Platform.isMobile) {
      return [...this.settings.inFlight, ...this.settings.dirty].map((entry) => ({
        path: entry.path,
        oldPath: entry.fromPath,
        kind:
          entry.type === "add"
            ? "added"
            : entry.type === "delete"
              ? "deleted"
              : entry.type === "move"
                ? "moved"
                : "modified"
      }));
    }
    if (!this.settings.setupComplete) return [];
    if (mode === "commit") return parseGitStatus(await this.gitRaw(["status", "--porcelain=v1", "-z"]));
    return await this.getPendingUploadChanges();
  }

  async getLatestCommitAt(): Promise<number> {
    if (Platform.isMobile || !this.settings.setupComplete) return 0;
    try {
      const seconds = Number((await this.gitRaw(["log", "-1", "--format=%ct"])).trim());
      return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0;
    } catch {
      return 0;
    }
  }

  private async getPendingUploadChanges(): Promise<ChangeItem[]> {
    const remoteRef = `refs/remotes/origin/${this.settings.gitBranch}`;
    let hasRemoteRef = false;
    try {
      await this.git(["show-ref", "--verify", "--quiet", remoteRef]);
      hasRemoteRef = true;
    } catch {
      // 远端分支尚不存在时，所有当前本机文件都属于待上传内容。
    }
    const tracked = hasRemoteRef
      ? parseGitNameStatus(await this.gitRaw(["diff", "--name-status", "-z", "--find-renames", remoteRef]))
      : await this.getInitialUploadChanges();
    const knownPaths = new Set(tracked.map((change) => change.path));
    const untracked = (await this.gitRaw(["ls-files", "--others", "--exclude-standard", "-z"]))
      .split("\0")
      .filter(Boolean)
      .filter((path) => !knownPaths.has(path))
      .map((path): ChangeItem => ({ path, kind: "added" }));
    return [...tracked, ...untracked].sort((a, b) => a.path.localeCompare(b.path));
  }

  private async getInitialUploadChanges(): Promise<ChangeItem[]> {
    const deletedPaths = new Set(
      parseGitStatus(await this.gitRaw(["status", "--porcelain=v1", "-z"]))
        .filter((change) => change.kind === "deleted")
        .map((change) => change.path)
    );
    return (await this.gitRaw(["ls-files", "--cached", "-z"]))
      .split("\0")
      .filter(Boolean)
      .filter((path) => !deletedPaths.has(path))
      .map((path) => ({ path, kind: "added" }));
  }

  isSyncing(): boolean {
    return this.syncing;
  }

  private registerMobileEvents(): void {
    const record = (file: TAbstractFile, type: "add" | "modify" | "delete") => {
      if (!(file instanceof TFile)) return;
      void this.recordDirty({ type, path: file.path });
    };
    this.trackFeatureEvent(this.app.vault.on("create", (file) => record(file, "add")));
    this.trackFeatureEvent(this.app.vault.on("modify", (file) => record(file, "modify")));
    this.trackFeatureEvent(this.app.vault.on("delete", (file) => record(file, "delete")));
    this.trackFeatureEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        if (!(file instanceof TFile)) return;
        void this.recordDirty({ type: "move", fromPath: oldPath, path: file.path });
      })
    );
  }

  private async recordDirty(entry: DirtyEntry): Promise<void> {
    if (
      shouldIgnore(entry.path, this.settings.ignorePatterns) ||
      (entry.fromPath && shouldIgnore(entry.fromPath, this.settings.ignorePatterns))
    ) return;
    if (this.suppressPaths.has(entry.path) || (entry.fromPath && this.suppressPaths.has(entry.fromPath))) return;
    this.settings.dirty = coalesceDirty(this.settings.dirty, entry);
    await this.saveSettings();
    this.setStatus(`${this.settings.dirty.length} 项待同步`);
    await this.refreshSyncView();
  }

  private validateServerSettings(): void {
    if (!this.settings.serverUrl || !this.settings.serverPassword) {
      throw new Error("请先填写服务器地址和认证密码");
    }
    const url = new URL(this.settings.serverUrl);
    const local = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
    if (url.protocol !== "https:" && !local) throw new Error("公网服务器必须使用 HTTPS");
  }

  private async serverRequest<T>(method: string, path: string, body?: Record<string, unknown>): Promise<T> {
    this.validateServerSettings();
    const url = `${this.settings.serverUrl.replace(/\/$/, "")}${path}`;
    try {
      const response = await requestUrl({
        url,
        method,
        headers: {
          Authorization: `Bearer ${this.settings.serverPassword}`,
          "Content-Type": "application/json"
        },
        body: body ? JSON.stringify(body) : undefined,
        throw: false
      });
      const data = response.json as T & { error?: string; details?: unknown };
      if (response.status < 200 || response.status >= 300) {
        const details = data.details ? `：${JSON.stringify(data.details)}` : "";
        throw new Error(`${data.error ?? `HTTP ${response.status}`}${details}`);
      }
      return data;
    } catch (error) {
      throw new Error(`服务器请求失败：${messageOf(error)}`);
    }
  }

  private platformName(): "ios" | "android" | "desktop" | "unknown" {
    if (!Platform.isMobile) return "desktop";
    if (Platform.isIosApp) return "ios";
    if (Platform.isAndroidApp) return "android";
    return "unknown";
  }

  async registerMobile(): Promise<void> {
    if (!this.settings.enabled || !Platform.isMobile || !this.settings.serverUrl || !this.settings.serverPassword) return;
    await this.serverRequest<{ currentVersion: number }>("POST", "/v1/devices/register", {
      deviceId: this.settings.deviceId,
      name: this.settings.deviceName,
      platform: this.platformName()
    });
    this.setStatus(`已连接 · v${this.settings.baseVersion}`);
  }

  async testConnection(showNotice: boolean): Promise<void> {
    try {
      if (Platform.isMobile) {
        await this.registerMobile();
      } else {
        if (!this.settings.setupComplete) throw new Error("请先完成首次使用引导");
        await this.testDesktopGit();
      }
      if (showNotice) new Notice(`Simple Link：${Platform.isMobile ? "服务器" : "Git"}连接正常`);
    } catch (error) {
      await this.recordError("测试连接", error);
      if (showNotice) new Notice(`Simple Link：${messageOf(error)}`, 8000);
      throw error;
    }
  }

  async syncNow(showNotice: boolean): Promise<void> {
    if (!Platform.isMobile && !this.settings.setupComplete) {
      if (showNotice) new Notice("请先完成「从零开始的 Git 同步使用指南」");
      return;
    }
    if (!this.settings.enabled) {
      if (showNotice) new Notice("Simple Link 已关闭，请先在设置中启用");
      return;
    }
    if (this.syncing) {
      if (showNotice) new Notice("Simple Link：已有同步任务正在运行");
      return;
    }
    this.syncing = true;
    this.setStatus(Platform.isMobile ? "正在同步…" : "准备检查本机修改…");
    try {
      if (Platform.isMobile) {
        await this.mobileSync();
        this.settings.lastSyncAt = Date.now();
        await this.saveSettings();
        this.setStatus(`已同步 · v${this.settings.baseVersion}`);
      } else {
        await this.enqueueDesktopGit(() => this.desktopGitSync());
        this.setStatus("同步检查完成");
      }
      await this.recordSuccess(showNotice ? "手动同步" : "自动同步", "同步检查完成");
      if (showNotice) new Notice("Simple Link：同步完成");
    } catch (error) {
      if (error instanceof SyncDeferredError) {
        this.setStatus(error.message);
        if (showNotice) new Notice(error.message);
        return;
      }
      if (!Platform.isMobile) await this.scheduleDesktopPushRetry();
      await this.recordError(showNotice ? "手动同步" : "自动同步", error);
      this.setStatus(Platform.isMobile ? "同步失败" : "同步失败 · 5 分钟后重试");
      if (showNotice) new Notice(`Simple Link：${messageOf(error)}`, 10000);
      else console.error("Simple Link", error);
    } finally {
      this.syncing = false;
      await this.refreshSyncView();
    }
  }

  async commitNow(showNotice: boolean): Promise<void> {
    if (!Platform.isMobile && !this.settings.setupComplete) {
      if (showNotice) new Notice("请先完成「从零开始的 Git 同步使用指南」");
      return;
    }
    if (!this.settings.enabled) {
      if (showNotice) new Notice("Simple Link 已关闭，请先在设置中启用");
      return;
    }
    if (Platform.isMobile) {
      if (showNotice) new Notice("移动端不支持本机 Commit");
      return;
    }
    if (this.syncing) {
      if (showNotice) new Notice("Simple Link：已有任务正在运行");
      return;
    }
    this.syncing = true;
    this.setStatus("Commit 中…");
    await this.refreshSyncView();
    try {
      let result: DesktopCommitResult = { committed: false, skippedPaths: [] };
      await this.enqueueDesktopGit(async () => {
        result = await this.desktopCommitOnly();
      });
      if (result.committed) this.scheduleDesktopPush();
      const skippedText = result.skippedPaths.length > 0 ? `，跳过 ${result.skippedPaths.length} 个正在修改的文件` : "";
      this.setStatus(result.committed ? `已 Commit${skippedText}` : `没有可 Commit 文件${skippedText}`);
      if (showNotice) {
        new Notice(
          result.committed ? `Simple Link：Commit 完成${skippedText}` : `Simple Link：没有可 Commit 文件${skippedText}`
        );
      }
    } catch (error) {
      await this.recordError("手动 Commit", error);
      this.setStatus("Commit 失败");
      if (showNotice) new Notice(`Simple Link：${messageOf(error)}`, 10000);
    } finally {
      this.syncing = false;
      await this.refreshSyncView();
    }
  }

  private async buildOperations(entries: DirtyEntry[]): Promise<Record<string, unknown>[]> {
    const operations: Record<string, unknown>[] = [];
    for (const entry of entries) {
      if (entry.type === "add" || entry.type === "modify") {
        if (!(await this.app.vault.adapter.exists(entry.path))) {
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

  private async mobileSync(): Promise<void> {
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
    const response = await this.serverRequest<{
      baseVersion: number;
      actions: ServerAction[];
      commands: ServerCommand[];
      gitWarning?: string;
    }>("POST", "/v1/sync", {
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
      throw new Error(`同步期间这些文件又被修改，请再次同步处理冲突：${overlap.join(", ")}`);
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
    if (response.gitWarning) new Notice(`Simple Link：GitHub 暂时不可用，本地服务器同步已完成`, 7000);
    if (triggerSync) window.setTimeout(() => void this.syncNow(false), 250);
  }

  private async ensureParent(path: string): Promise<void> {
    const parts = path.split("/").slice(0, -1);
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (!(await this.app.vault.adapter.exists(current))) {
        await this.app.vault.adapter.mkdir(current);
      }
    }
  }

  private async applyServerActions(actions: ServerAction[]): Promise<void> {
    for (const action of actions) this.suppressPaths.add(action.path);
    try {
      for (const action of actions) {
        if (action.type === "delete") {
          if (await this.app.vault.adapter.exists(action.path)) await this.app.vault.adapter.remove(action.path);
        } else {
          if (!action.contentBase64) throw new Error(`服务器缺少文件内容：${action.path}`);
          await this.ensureParent(action.path);
          await this.app.vault.adapter.writeBinary(action.path, base64ToArrayBuffer(action.contentBase64));
        }
      }
    } finally {
      window.setTimeout(() => {
        for (const action of actions) this.suppressPaths.delete(action.path);
      }, 2000);
    }
  }

  private async pollCommands(): Promise<void> {
    if (!Platform.isMobile || !this.settings.serverUrl || !this.settings.serverPassword) return;
    try {
      const result = await this.serverRequest<{ commands: ServerCommand[] }>(
        "GET",
        `/v1/commands?deviceId=${encodeURIComponent(this.settings.deviceId)}`
      );
      const triggerSync = await this.handleCommands(result.commands);
      if (triggerSync) void this.syncNow(false);
    } catch (error) {
      console.error("Simple Link command poll", error);
      await this.recordError("指令检查", error);
    }
  }

  private async handleCommands(commands: ServerCommand[]): Promise<boolean> {
    if (!commands.length) return false;
    const acknowledged: string[] = [];
    let triggerSync = false;
    for (const command of commands) {
      try {
        if (command.kind === "notice") {
          new Notice(`${command.title}${command.body ? `\n${command.body}` : ""}`, 8000);
        } else if (command.kind === "sync") {
          new Notice(command.title || "服务器要求同步");
          triggerSync = true;
        } else if (command.kind === "open_file") {
          const path = command.payload.path;
          if (typeof path !== "string" || !path) throw new Error("open_file 指令缺少 path");
          await this.app.workspace.openLinkText(path, "", false);
          new Notice(command.title || `已打开 ${path}`);
        }
        acknowledged.push(command.id);
      } catch (error) {
        new Notice(`Simple Link 指令失败：${messageOf(error)}`, 8000);
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

  getSetupPreview(): SetupPreview | undefined { return this.setupPreview; }
  getSetupChoices(): Record<string, OverlapChoice> { return { ...this.setupChoices }; }
  setSetupChoice(path: string, choice: OverlapChoice): void { this.setupChoices[path] = choice; }
  getSetupTrackingChoice(): "keep" | "rebuild" | undefined { return this.setupTrackingChoice; }
  setSetupTrackingChoice(choice: "keep" | "rebuild" | undefined): void { this.setupTrackingChoice = choice; }
  getVaultBasePath(): string { return this.vaultBasePath(); }
  async readSetupOverlap(path: string): Promise<SetupOverlapContent> {
    if (!this.settings.setupVerified || !this.setupPreview) throw new Error("请先检查本地与远端文件");
    return this.setup().readOverlap(this.settings.setupVerified, this.setupPreview, path);
  }

  private setup(): GitSetup {
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
      () => this.settings.gitAuthMode === "token" ? this.settings.gitAuthKey : undefined
    );
  }

  async confirmSetupIntro(): Promise<void> {
    this.settings.setupStep = 2;
    this.settings.setupGitVersion = "";
    await this.saveSettings();
  }

  async checkSetupGit(): Promise<string> {
    const version = await this.setup().checkGit();
    this.settings.setupGitVersion = version;
    await this.saveSettings();
    return version;
  }

  async confirmSetupGit(): Promise<void> {
    if (!this.settings.setupGitVersion) throw new Error("请先检查 Git 是否已安装。");
    this.settings.setupStep = 3;
    await this.saveSettings();
  }

  async beginSetup(): Promise<void> {
    if (this.syncing) throw new Error("当前有同步任务正在运行，请稍后重试");
    await this.desktopGitQueue;
    this.settings.setupBackup = {
      step: this.settings.setupStep,
      repoUrl: this.settings.setupRepoUrl,
      verified: this.settings.setupVerified
    };
    this.settings.setupComplete = false;
    this.settings.setupMutationStarted = false;
    this.settings.setupStep = 1;
    this.settings.setupVerified = undefined;
    this.setupPreview = undefined;
    this.setupChoices = {};
    this.setupTrackingChoice = undefined;
    this.clearDesktopTimeouts();
    for (const interval of this.featureIntervals) window.clearInterval(interval);
    this.featureIntervals = [];
    await this.saveSettings();
    await this.refreshSyncView();
  }

  async cancelSetup(): Promise<void> {
    const backup = this.settings.setupBackup;
    if (!backup) throw new Error("没有可恢复的旧同步配置");
    if (this.settings.setupMutationStarted) throw new Error("接入已开始修改本地 Git 状态；请完成接入或先手动检查 Git 状态，不能直接恢复自动同步。");
    this.settings.setupStep = backup.step;
    this.settings.setupRepoUrl = backup.repoUrl;
    this.settings.setupVerified = backup.verified;
    this.settings.setupComplete = true;
    this.settings.setupBackup = undefined;
    this.settings.setupMutationStarted = false;
    this.setupPreview = undefined;
    this.setupChoices = {};
    this.setupTrackingChoice = undefined;
    await this.saveSettings();
    await this.restartDesktopAutomation();
    this.setStatus("桌面端 · Git 模式");
    await this.refreshSyncView();
  }

  async authorizeSetup(onCode?: (code: string) => void, onCancelReady?: (cancel: () => void) => void): Promise<void> {
    await this.setup().login(onCode, onCancelReady);
    this.settings.gitAuthMode = "gh-cli";
    this.settings.setupStep = 4;
    await this.saveSettings();
  }

  async checkSetupAuthorization(): Promise<void> {
    await this.setup().checkTools();
    await this.setup().configureGitCredentials();
    this.settings.gitAuthMode = "gh-cli";
    this.settings.setupStep = 4;
    await this.saveSettings();
  }

  async inspectSetupAuthorization(): Promise<boolean> {
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

  async continueWithSetupAuthorization(): Promise<void> {
    this.settings.gitAuthMode = "gh-cli";
    this.settings.setupStep = 4;
    await this.saveSettings();
  }

  async saveSetupToken(token: string): Promise<string> {
    const trimmed = token.trim();
    if (!trimmed) throw new Error("请先粘贴 GitHub Token。");
    const login = await this.setup().validateToken(trimmed);
    this.settings.gitAuthMode = "token";
    this.settings.gitAuthKey = trimmed;
    this.settings.setupStep = 4;
    await this.saveSettings();
    return login;
  }

  async verifySetupRepository(url: string): Promise<void> {
    const verified = await this.setup().verifyRepository(url);
    this.settings.setupRepoUrl = verified.url;
    this.settings.setupVerified = verified;
    this.settings.setupStep = 5;
    this.setupPreview = undefined;
    this.setupChoices = {};
    this.setupTrackingChoice = undefined;
    await this.saveSettings();
  }

  async createSetupRepository(name: string): Promise<string> {
    const url = await this.setup().createPrivateRepository(name);
    this.settings.setupRepoUrl = url;
    await this.saveSettings();
    await this.verifySetupRepository(url);
    return url;
  }

  async inspectSetupRepository(): Promise<void> {
    const repoUrl = this.settings.setupVerified?.url || this.settings.setupRepoUrl;
    if (!repoUrl) throw new Error("请先填写并核验私人仓库地址");
    const verified = this.settings.setupComplete || !this.settings.setupVerified
      ? await this.setup().verifyRepository(repoUrl)
      : this.settings.setupVerified;
    this.settings.setupVerified = verified;
    this.setupPreview = await this.setup().preview(verified);
    if (!this.settings.setupComplete) {
      this.setupChoices = {};
      this.setupTrackingChoice = "keep";
      this.settings.setupStep = 5;
      await this.saveSettings();
    }
  }

  async confirmSetupPreview(): Promise<void> {
    if (!this.setupPreview) throw new Error("请先检查本地与远端文件");
    for (const path of this.setupPreview.overlaps) {
      if (!this.setupChoices[path]) throw new Error(`请选择同名文件的保留版本：${path}`);
    }
    if ((this.setupPreview.trackedExcludedLocal.length || this.setupPreview.trackedExcludedRemote.length) && !this.setupTrackingChoice) {
      throw new Error("请先选择如何处理已被 Git 跟踪的忽略文件。");
    }
    this.settings.setupStep = 6;
    await this.saveSettings();
  }

  async finishSetup(confirmedRebuildTracking = false): Promise<void> {
    const verified = this.settings.setupVerified;
    const preview = this.setupPreview;
    if (!verified || !preview) throw new Error("请重新检查本地与远端内容");
    if ((preview.trackedExcludedLocal.length || preview.trackedExcludedRemote.length) && !this.setupTrackingChoice) {
      throw new Error("请先选择如何处理已被 Git 跟踪的忽略文件。");
    }
    if (this.setupTrackingChoice === "rebuild" && !confirmedRebuildTracking) {
      throw new Error("请先确认：停止跟踪后，本机文件保留，推送会从远端当前版本移除这些文件。");
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
    this.settings.setupBackup = undefined;
    this.settings.setupMutationStarted = false;
    await this.saveSettings();
    await this.restartDesktopAutomation();
    this.setStatus(skippedPaths.length > 0
      ? `首次接入完成 · ${skippedPaths.length} 个正在编辑的文件留待后续 Commit`
      : "首次接入完成");
    if (skippedPaths.length > 0) new Notice(`首次推送成功；${skippedPaths.length} 个正在编辑的文件未提交，停止修改后将自动 Commit。`, 10000);
    await this.refreshSyncView();
  }

  private vaultBasePath(): string {
    const adapter = this.app.vault.adapter;
    if (!(adapter instanceof FileSystemAdapter)) throw new Error("当前平台没有可用的本地 Vault 路径");
    return adapter.getBasePath();
  }

  private async detectDesktopGitDefaults(): Promise<void> {
    const needsAuthorName =
      !this.settings.gitAuthorName || this.settings.gitAuthorName === DEFAULT_GIT_AUTHOR_NAME;
    const needsAuthorEmail =
      !this.settings.gitAuthorEmail || this.settings.gitAuthorEmail === DEFAULT_GIT_AUTHOR_EMAIL;
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
      // 尚未初始化 Git 时保留设置页默认值，由用户填写后再同步。
    }
  }

  private async exec(program: string, args: string[], authenticated = false, trim = true, timeoutMs = 120000, onOutput?: (chunk: string) => void, onCancelReady?: (cancel: () => void) => void): Promise<string> {
    const nodeRequire = (globalThis as unknown as { require?: (name: string) => unknown }).require;
    if (!nodeRequire) throw new Error("当前平台不支持桌面命令");
    const childProcess = nodeRequire("child_process") as typeof import("child_process");
    const env: NodeJS.ProcessEnv = { ...process.env };
    if (program === "git") env.GIT_TERMINAL_PROMPT = "0";
    if (authenticated && this.settings.gitAuthMode === "token") {
      if (!this.settings.gitAuthKey) throw new Error("请填写 Author 认证 Key / GitHub Token");
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
      onCancelReady?.(() => { child.kill(); });
      if (onOutput) {
        child.stdout?.on("data", (chunk: string | Buffer) => onOutput(String(chunk)));
        child.stderr?.on("data", (chunk: string | Buffer) => onOutput(String(chunk)));
      }
    });
  }

  private git(args: string[], authenticated = false): Promise<string> {
    return this.exec("git", args, authenticated);
  }

  private gitRaw(args: string[]): Promise<string> {
    return this.exec("git", args, false, false);
  }

  private async ensureDesktopGit(): Promise<void> {
    if (!this.settings.gitRemoteUrl) throw new Error("请填写 Git 仓库地址");
    if (!this.settings.gitAuthorName || !this.settings.gitAuthorEmail) {
      throw new Error("请填写 Git Author 名称和邮箱");
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

  private async testDesktopGit(): Promise<void> {
    await this.exec("git", ["--version"]);
    await this.ensureDesktopGit();
    await this.git(["ls-remote", "--heads", "origin", this.settings.gitBranch], true);
  }

  private async desktopGitSync(): Promise<void> {
    await this.desktopCommitOnly();
    await this.desktopFetchAndMerge(true);
    await this.desktopPushOnly(false);
  }

  private async desktopAutomaticPush(): Promise<boolean> {
    await this.desktopCommitOnly();
    this.resetDesktopCommitTracking();
    if (await this.hasDesktopChanges()) this.scheduleDesktopCommit();
    return await this.desktopPushOnly();
  }

  private async desktopStartupSync(): Promise<boolean> {
    const result = await this.desktopCommitOnly();
    if (result.committed) this.scheduleDesktopPush();
    const merged = await this.desktopFetchAndMerge();
    await this.resumeDesktopDirtyState();
    return result.committed || merged;
  }

  private async desktopCommitOnly(): Promise<DesktopCommitResult> {
    this.setSyncActivity("正在检查本机修改…", "checking");
    await this.ensureDesktopGit();
    await this.ensureNormalGitState();
    const changes = parseGitStatus(await this.gitRaw(["status", "--porcelain=v1", "-z"]));
    const activePaths = this.getActivelyChangingPaths();
    const nodeRequire = (globalThis as unknown as { require?: (name: string) => unknown }).require;
    if (nodeRequire) {
      const fs = nodeRequire("fs") as typeof import("fs");
      const path = nodeRequire("path") as typeof import("path");
      const holdMs = Math.max(PLUGIN_EDIT_GRACE_MS, this.settings.autoCommitIdleMinutes * 120 * 1000);
      for (const change of changes) {
        for (const file of [change.path, change.oldPath]) {
          if (!file?.startsWith(".obsidian/plugins/")) continue;
          try {
            const stat = await fs.promises.stat(path.join(this.vaultBasePath(), file));
            if (Date.now() - stat.mtimeMs < holdMs) activePaths.add(file);
          } catch { /* Deleted files have no modification time. */ }
        }
      }
    }
    const activePluginDirs = [...activePaths].map((path) => /^\.obsidian\/plugins\/[^/]+\//.exec(path)?.[0]).filter((dir): dir is string => !!dir);
    for (const change of changes) {
      if (activePluginDirs.some((dir) => change.path.startsWith(dir) || change.oldPath?.startsWith(dir))) {
        activePaths.add(change.path);
        if (change.oldPath) activePaths.add(change.oldPath);
      }
    }
    const { included, skippedPaths } = partitionCommitChanges(changes, activePaths);
    if (included.length === 0) {
      this.setStatus(skippedPaths.length > 0 ? `等待 ${skippedPaths.length} 个文件停止修改` : "本机没有需要 Commit 的修改");
      await this.refreshSyncView();
      return { committed: false, skippedPaths };
    }
    this.setSyncActivity(`正在 Commit · ${included.length} 个文件`, "commit");
    if (await this.hasDesktopHead()) {
      await this.git(["add", "-A"]);
      if (skippedPaths.length > 0) await this.git(["reset", "-q", "HEAD", "--", ...skippedPaths]);
    } else {
      const includedPaths = [
        ...new Set(included.flatMap((change) => [change.path, change.oldPath].filter(Boolean) as string[]))
      ];
      await this.git(["add", "-A", "--", ...includedPaths]);
    }
    let committed = false;
    try {
      await this.git(["diff", "--cached", "--quiet"]);
    } catch {
      await this.git(["commit", "-m", `Simple Commit: ${new Date().toISOString()}`]);
      committed = true;
    }
    this.setStatus(committed ? `已 Commit · ${included.length} 个文件` : "本机没有需要 Commit 的修改");
    await this.refreshSyncView();
    return { committed, skippedPaths };
  }

  private async desktopFetchAndMerge(pushAfterResolve = false): Promise<boolean> {
    this.setSyncActivity("正在检查云端更新…", "checking");
    await this.ensureDesktopGit();
    await this.ensureNormalGitState();
    this.setSyncActivity("正在 Fetch 云端更新…", "fetch");
    try {
      await this.traceDesktopGitStep("Git fetch（连接并下载远端分支）", () =>
        this.git(["fetch", "origin", this.settings.gitBranch], true)
      );
    } catch (error) {
      if (!isMissingRemoteRefError(error)) throw error;
      this.desktopGitTrace[this.desktopGitTrace.length - 1] = "Git fetch：远端分支不存在";
      this.setStatus("云端尚无分支 · 等待首次 Push");
      return false;
    }
    if (!(await this.hasDesktopHead())) {
      this.desktopGitTrace.push("合并检查：本机尚无 Commit");
      this.setStatus("已获取云端信息 · 等待首次 Commit");
      await this.recordSuccessfulPull();
      return false;
    }
    try {
      await this.git(["merge-base", "--is-ancestor", "FETCH_HEAD", "HEAD"]);
      this.desktopGitTrace.push("合并检查：远端提交已包含在本机");
      this.deferredMergePaths = [];
      this.setStatus("云端已是最新");
      await this.recordSuccessfulPull();
      return false;
    } catch {
      // 远端有本机尚未包含的提交，只有此时才需要 Merge。
      this.desktopGitTrace.push("合并检查：远端有新提交");
    }
    const mergeBase = (await this.gitRaw(["merge-base", "HEAD", "FETCH_HEAD"])).trim();
    const localChanges = parseGitStatus(await this.gitRaw(["status", "--porcelain=v1", "-z"]));
    const remoteChanges = parseGitNameStatus(
      await this.gitRaw(["diff", "--name-status", "-z", "--find-renames", mergeBase, "FETCH_HEAD"])
    );
    const overlappingPaths = findRemoteChangeOverlaps(localChanges, remoteChanges);
    if (overlappingPaths.length > 0) {
      this.deferredMergePaths = overlappingPaths;
      const message = `同步暂缓 · ${overlappingPaths.length} 个文件仍在修改`;
      if (pushAfterResolve) await this.scheduleDesktopPushRetry(message);
      throw new SyncDeferredError(message);
    }
    this.deferredMergePaths = [];
    this.setSyncActivity("正在 Merge 云端更新…", "merge");
    try {
      await this.traceDesktopGitStep("Git merge（合并远端提交）", () => this.git(["merge", "--no-edit", "FETCH_HEAD"]));
    } catch (error) {
      const conflicts = await this.getUnmergedPaths();
      if (conflicts.length === 0) throw error;
      if (pushAfterResolve) {
        this.settings.pendingMergePushAfterResolve = true;
        await this.saveSettings();
      }
      await this.resolveMergeConflicts(conflicts);
    }
    this.setStatus("云端更新已合并");
    await this.recordSuccessfulPull();
    return true;
  }

  private async recordSuccessfulPull(): Promise<void> {
    this.settings.lastPullAt = Date.now();
    await this.saveSettings();
  }

  private async desktopPushOnly(fetchBeforePush = true): Promise<boolean> {
    await this.ensureDesktopGit();
    await this.ensureNormalGitState();
    if (fetchBeforePush) await this.desktopFetchAndMerge(true);
    await this.ensureNormalGitState();
    if (!(await this.getUnpushedCommitWindow())) {
      this.desktopGitTrace.push("上传检查：没有待上传 Commit");
      this.clearDesktopPushRetry();
      this.setStatus("已是最新 · 无需上传");
      await this.refreshSyncView();
      return false;
    }
    this.desktopGitTrace.push("上传检查：存在待上传 Commit");
    this.setSyncActivity("正在 Push 本机 Commit…", "push");
    await this.traceDesktopGitStep("Git push（上传本机提交）", () =>
      this.git(["push", "-u", "origin", `HEAD:${this.settings.gitBranch}`], true)
    );
    this.clearDesktopPushRetry();
    this.settings.pendingMergePushAfterResolve = false;
    this.resetDesktopPushTracking();
    this.settings.lastSyncAt = Date.now();
    await this.saveSettings();
    this.setStatus("已上传 · 刚刚");
    await this.refreshSyncView();
    return true;
  }

  async getPendingConflictPaths(): Promise<string[]> {
    if (Platform.isMobile) return [];
    try {
      return await this.getUnmergedPaths();
    } catch {
      return [];
    }
  }

  getDeferredMergePaths(): string[] {
    return [...this.deferredMergePaths];
  }

  private async getUnmergedPaths(): Promise<string[]> {
    const output = await this.gitRaw(["diff", "--name-only", "--diff-filter=U", "-z"]);
    return output.split("\0").filter(Boolean);
  }

  private async resolveMergeConflicts(initialPaths: string[]): Promise<void> {
    let paths = initialPaths;
    while (paths.length > 0) {
      const outcome = await this.openConflictView(paths);
      if (outcome === "deferred") {
        const remaining = await this.getUnmergedPaths();
        throw new SyncDeferredError(`有 ${remaining.length} 个合并冲突等待处理`);
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

  async continuePendingMergeConflicts(): Promise<void> {
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
      }, pushAfterResolve ? "继续处理合并冲突 + Push" : "继续处理合并冲突");
    } catch (error) {
      if (error instanceof SyncDeferredError) return;
      if (this.settings.pendingMergePushAfterResolve) await this.scheduleDesktopPushRetry();
      new Notice(`Simple Link：无法继续处理冲突。${messageOf(error)}`, 12000);
    }
  }

  private async openConflictView(paths: string[]): Promise<"resolved" | "deferred"> {
    let leaf: WorkspaceLeaf | null = this.app.workspace.getLeavesOfType(SimpleSyncConflictView.type)[0] ?? null;
    if (!leaf) leaf = this.app.workspace.getRightLeaf(false);
    if (!leaf) throw new Error("无法打开右侧同步冲突处理面板");
    await leaf.setViewState({ type: SimpleSyncConflictView.type, active: true });
    if (!(leaf.view instanceof SimpleSyncConflictView)) throw new Error("无法打开同步冲突处理视图");
    const view = leaf.view;
    await this.app.workspace.revealLeaf(leaf);
    return await new Promise<"resolved" | "deferred">((resolve) => view.start(paths, resolve));
  }

  async readConflictFile(path: string): Promise<string | null> {
    try {
      return await this.app.vault.adapter.read(path);
    } catch {
      return null;
    }
  }

  async applyConflictText(path: string, content: string): Promise<void> {
    await this.app.vault.adapter.write(path, content);
    await this.git(["add", "--", path]);
  }

  async applyWholeConflictChoice(path: string, source: "github" | "local"): Promise<void> {
    const checkoutSide = source === "github" ? "--theirs" : "--ours";
    const stage = source === "github" ? 3 : 2;
    try {
      await this.git(["checkout", checkoutSide, "--", path]);
      await this.git(["add", "--", path]);
    } catch (error) {
      try {
        await this.git(["cat-file", "-e", `:${stage}:${path}`]);
      } catch {
        // 删除/修改冲突中，被选择的一侧代表删除该文件。
        await this.git(["rm", "-f", "--", path]);
        return;
      }
      throw error;
    }
  }
}

class GitRepairModal extends Modal {
  private repairing = false;

  constructor(
    app: App,
    private plugin: SimpleSyncPlugin,
    private operation: string
  ) {
    super(app);
  }

  onOpen(): void {
    const container = this.contentEl;
    container.empty();
    container.createEl("h2", { text: "恢复正常同步" });
    container.createEl("p", {
      text: `检测到上一次 ${this.operation} 没有完成，因此自动 Commit、Merge 和 Push 已暂停。`
    });
    const list = container.createEl("ul");
    list.createEl("li", { text: "保护当前本机内容，并退出未完成的异常操作。" });
    list.createEl("li", { text: "以恢复后的本机内容建立一个新的 Commit。" });
    list.createEl("li", { text: "Fetch 云端版本并在本机 Merge；如有冲突，在右侧面板逐项选择。" });
    list.createEl("li", { text: "修复完成后等待正常 Push 计时，不会立即上传。" });
    container.createEl("p", {
      text: "操作前会建立临时安全备份；恢复成功后自动清理，通常不需要你处理。",
      cls: "simple-sync-conflict__warning"
    });

    const actions = container.createDiv({ cls: "modal-button-container" });
    const cancel = actions.createEl("button", { text: "暂不修复" });
    cancel.addEventListener("click", () => this.close());
    const repair = actions.createEl("button", { text: "确认恢复", cls: "mod-cta" });
    repair.addEventListener("click", () => {
      if (this.repairing) return;
      this.repairing = true;
      this.close();
      new Notice("Simple Link：正在恢复本机版本并检查云端更新…", 8000);
      void this.plugin
        .repairInterruptedGitOperation()
        .then((result) => {
          new Notice(
            `Simple Link：${result.operation} 异常状态已退出${
              result.restoredLocalChanges ? "，本机修改已恢复" : ""
            }；本地 Commit 和云端合并检查已完成，尚未立即 Push`,
            10000
          );
        })
        .catch((error) => {
          if (error instanceof SyncDeferredError) {
            new Notice("Simple Link：异常状态已退出，本机内容已重新 Commit；合并冲突已保留在同步面板等待处理", 12000);
          } else {
            new Notice(`Simple Link：异常修复未完成。${messageOf(error)}`, 15000);
          }
        });
    });
  }
}

class SimpleSyncConflictView extends ItemView {
  static readonly type = "simple-sync-conflict-view";
  private totalFiles = 0;
  private settled = false;
  private paths: string[] = [];
  private done?: (outcome: "resolved" | "deferred") => void;

  constructor(leaf: WorkspaceLeaf, private plugin: SimpleSyncPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return SimpleSyncConflictView.type;
  }

  getDisplayText(): string {
    return "处理同步冲突";
  }

  getIcon(): string {
    return "git-merge";
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("simple-sync-conflict-view");
    container.createDiv({ text: "正在准备冲突内容…", cls: "simple-sync-conflict__intro" });
  }

  onClose(): Promise<void> {
    if (!this.settled) this.finish("deferred", false);
    return Promise.resolve();
  }

  start(paths: string[], done: (outcome: "resolved" | "deferred") => void): void {
    this.paths = [...paths];
    this.totalFiles = paths.length;
    this.done = done;
    this.settled = false;
    void this.renderCurrentFile();
  }

  private finish(outcome: "resolved" | "deferred", detach = true): void {
    if (this.settled) return;
    this.settled = true;
    this.done?.(outcome);
    this.done = undefined;
    if (detach) this.leaf.detach();
  }

  private async renderCurrentFile(): Promise<void> {
    const path = this.paths[0];
    const content = await this.plugin.readConflictFile(path);
    const blocks = content === null ? [] : parseConflictBlocks(content);
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("simple-sync-conflict-view");

    container.createEl("h2", { text: "发现内容冲突" });
    container.createEl("p", {
      text: "GitHub 和本机修改了同一处内容。请逐项选择最终保留什么；确认前不会上传到 GitHub。",
      cls: "simple-sync-conflict__intro"
    });
    const progress = container.createDiv({ cls: "simple-sync-conflict__progress" });
    progress.createSpan({ text: `已处理 ${this.totalFiles - this.paths.length} / ${this.totalFiles}` });
    progress.createEl("code", { text: path });

    if (content === null || blocks.length === 0) {
      this.renderWholeFileChoice(container, path);
      return;
    }
    this.renderTextBlocks(container, path, content, blocks);
  }

  private renderWholeFileChoice(container: HTMLElement, path: string): void {
    container.createEl("p", {
      text: "这个文件无法按文字分段显示，通常是附件冲突，或一台设备删除了文件、另一台设备修改了它。请选择保留哪一边。",
      cls: "simple-sync-conflict__warning"
    });
    const choices = container.createDiv({ cls: "simple-sync-conflict__whole-actions" });
    this.createActionButton(choices, "保留 GitHub 版本", async () => {
      await this.plugin.applyWholeConflictChoice(path, "github");
      await this.advance();
    });
    this.createActionButton(choices, "保留本机版本", async () => {
      await this.plugin.applyWholeConflictChoice(path, "local");
      await this.advance();
    }, true);
    this.renderFooter(container);
  }

  private renderTextBlocks(container: HTMLElement, path: string, content: string, blocks: ConflictBlock[]): void {
    const resolutions: Array<string | undefined> = new Array(blocks.length);
    let applyButton: HTMLButtonElement;

    blocks.forEach((block, index) => {
      const card = container.createDiv({ cls: "simple-sync-conflict__block" });
      card.createEl("h3", { text: `第 ${index + 1} 处差异` });
      const comparison = card.createDiv({ cls: "simple-sync-conflict__comparison" });
      this.renderVersion(comparison, "GitHub 上的内容", block.github, "is-github");
      this.renderVersion(comparison, "本机内容", block.local, "is-local");

      const actions = card.createDiv({ cls: "simple-sync-conflict__block-actions" });
      actions.createSpan({ text: "最终保留：", cls: "simple-sync-conflict__action-label" });
      const result = card.createEl("textarea", { cls: "simple-sync-conflict__result" });
      result.placeholder = "先点击下面的选择，也可以直接在这里编辑最终内容";
      result.rows = Math.min(14, Math.max(4, block.github.split("\n").length, block.local.split("\n").length));
      const setResolution = (value: string): void => {
        resolutions[index] = value;
        result.value = value;
        applyButton.disabled = resolutions.some((item) => item === undefined);
      };
      this.createActionButton(actions, "使用 GitHub 内容", () => setResolution(block.github));
      this.createActionButton(actions, "使用本机内容", () => setResolution(block.local));
      this.createActionButton(actions, "两份都保留", () => setResolution(block.github + block.local));
      result.addEventListener("input", () => {
        resolutions[index] = result.value;
        applyButton.disabled = resolutions.some((item) => item === undefined);
      });
    });

    applyButton = container.createEl("button", {
      text: this.paths.length === 1 ? "应用并继续同步" : "应用并处理下一个文件",
      cls: "mod-cta simple-sync-conflict__continue"
    });
    applyButton.disabled = true;
    applyButton.addEventListener("click", async () => {
      if (resolutions.some((item) => item === undefined)) return;
      applyButton.disabled = true;
      try {
        await this.plugin.applyConflictText(path, applyConflictResolutions(content, blocks, resolutions as string[]));
        await this.advance();
      } catch (error) {
        new Notice(`无法应用冲突处理结果：${messageOf(error)}`, 8000);
        applyButton.disabled = false;
      }
    });
    this.renderFooter(container);
  }

  private renderVersion(container: HTMLElement, label: string, value: string, className: string): void {
    const version = container.createDiv({ cls: `simple-sync-conflict__version ${className}` });
    version.createDiv({ text: label, cls: "simple-sync-conflict__source" });
    version.createEl("pre", { text: value || "（这一边删除了这段内容）" });
  }

  private createActionButton(
    container: HTMLElement,
    label: string,
    action: () => void | Promise<void>,
    cta = false
  ): HTMLButtonElement {
    const button = container.createEl("button", { text: label, cls: cta ? "mod-cta" : undefined });
    button.addEventListener("click", () => void action());
    return button;
  }

  private renderFooter(container: HTMLElement): void {
    const footer = container.createDiv({ cls: "simple-sync-conflict__footer" });
    const explanation = footer.createEl("span", {
      text: this.paths.length > 1
        ? "可以先处理其他文件；未处理的冲突会一直保留在同步面板。"
        : "未处理的冲突会一直保留在同步面板，稍后可以继续。"
    });
    const actions = footer.createDiv({ cls: "simple-sync-conflict__footer-actions" });
    if (this.paths.length > 1) {
      this.createActionButton(actions, "稍后处理此文件", () => void this.deferCurrentFile());
    }
    this.createActionButton(actions, "暂时收起", () => this.finish("deferred"));
    explanation.setAttr("aria-live", "polite");
  }

  private async advance(): Promise<void> {
    this.paths.shift();
    if (this.paths.length > 0) {
      await this.renderCurrentFile();
    } else {
      this.finish("resolved");
    }
  }

  private async deferCurrentFile(): Promise<void> {
    const current = this.paths.shift();
    if (!current) return;
    this.paths.push(current);
    await this.renderCurrentFile();
  }
}

class ErrorLogModal extends Modal {
  constructor(app: App, private plugin: SimpleSyncPlugin) {
    super(app);
  }

  onOpen(): void {
    this.modalEl.addClass("simple-sync-error-modal");
    this.render();
  }

  private async render(): Promise<void> {
    const lastCommitAt = await this.plugin.getLatestCommitAt();
    const container = this.contentEl;
    container.empty();
    const overview = container.createDiv({ cls: "simple-sync-error-modal__overview" });
    const heading = overview.createDiv();
    heading.createEl("h2", { text: "最近同步日志" });
    heading.createEl("p", {
      text: "仅保留最近 24 小时的 Commit、同步和连接记录。",
      cls: "simple-sync-error-modal__intro"
    });
    const lastTimes = overview.createDiv({ cls: "simple-sync-error-modal__last-times" });
    const formatTime = (timestamp: number): string => {
      if (!timestamp) return "暂无记录";
      const absolute = new Date(timestamp).toLocaleString("zh-CN", { hour12: false });
      const days = Math.floor(Math.max(0, Date.now() - timestamp) / 86400000);
      const relative = days >= 7 ? `${days} 天前` : formatRelativeTime(timestamp);
      return `${absolute}（${relative}）`;
    };
    for (const [label, timestamp] of [
      ["上次 Commit", lastCommitAt],
      ["上次 Push", this.plugin.settings.lastSyncAt],
      ["上次 Pull", this.plugin.settings.lastPullAt]
    ] as const) {
      const row = lastTimes.createDiv({ cls: "simple-sync-error-modal__last-time" });
      row.createSpan({ text: label });
      row.createEl("time", { text: formatTime(timestamp) });
    }

    const logs = this.plugin.getRecentErrorLogs();
    if (logs.length === 0) {
      container.createDiv({ text: "最近 24 小时没有同步记录。", cls: "simple-sync-error-modal__empty" });
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
        item.createEl("pre", { text: entry.message || "这条旧记录未保存执行详情。" });
      }
    }

    const actions = container.createDiv({ cls: "simple-sync-error-modal__actions" });
    if (logs.length > 0) {
      const clearButton = actions.createEl("button", { text: "清空日志" });
      clearButton.addEventListener("click", async () => {
        await this.plugin.clearErrorLogs();
        await this.render();
      });
    }
    const closeButton = actions.createEl("button", { text: "关闭", cls: "mod-cta" });
    closeButton.addEventListener("click", () => this.close());
  }
}

class SimpleSyncView extends ItemView {
  static readonly type = "simple-sync-view";
  private renderGeneration = 0;

  constructor(leaf: WorkspaceLeaf, private plugin: SimpleSyncPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return SimpleSyncView.type;
  }

  getDisplayText(): string {
    return "Simple Link";
  }

  getIcon(): string {
    return "refresh-cw";
  }

  async onOpen(): Promise<void> {
    await this.render();
  }

  updateActivity(state: ViewStatusState): void {
    const container = this.containerEl.children[1] as HTMLElement;
    const status = container.querySelector<HTMLElement>(".simple-sync-view__status");
    if (!status) return;
    status.className = `simple-sync-view__status is-${state.tone}`;
    status.querySelector<HTMLElement>(".simple-sync-view__status-text")?.setText(state.text);
  }

  async render(): Promise<void> {
    const generation = ++this.renderGeneration;
    const container = this.containerEl.children[1] as HTMLElement;
    const mode = this.plugin.getChangeViewMode();

    let changes: ChangeItem[] = [];
    let changesError: unknown;
    const pendingConflictPaths = await this.plugin.getPendingConflictPaths();
    const deferredMergePaths = this.plugin.getDeferredMergePaths();
    try {
      changes = await this.plugin.getChanges(mode);
    } catch (error) {
      changesError = error;
    }
    let statusState = await this.getStatusState(mode, changes, changesError);
    if (pendingConflictPaths.length > 0) {
      statusState = { tone: "error", text: `有 ${pendingConflictPaths.length} 个合并冲突等待处理` };
    } else if (deferredMergePaths.length > 0) {
      statusState = { tone: "error", text: `同步暂缓 · ${deferredMergePaths.length} 个文件仍在修改` };
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
    layoutButton.setAttr("aria-label", "更改布局");
    setIcon(layoutButton, LAYOUT_SWITCH_ICON);
    layoutButton.addEventListener("click", () => void this.plugin.toggleViewLayout());
    const refreshButton = actions.createDiv({ cls: "clickable-icon nav-action-button" });
    refreshButton.setAttr("role", "button");
    refreshButton.setAttr("tabindex", "0");
    refreshButton.setAttr("aria-label", "刷新更改区");
    setIcon(refreshButton, REFRESH_CHANGES_ICON);
    refreshButton.addEventListener("click", () => void this.render());
    if (recentLogs.length > 0) {
      const errorButton = actions.createDiv({
        cls: `clickable-icon nav-action-button simple-sync-view__error-button${hasActiveError ? " is-active" : ""}`
      });
      errorButton.setAttr("role", "button");
      errorButton.setAttr("tabindex", "0");
      errorButton.setAttr("aria-label", `查看最近同步日志，共 ${recentLogs.length} 条`);
      setIcon(errorButton, hasActiveError ? "triangle-alert" : "history");
      setTooltip(errorButton, `查看最近同步日志（${recentLogs.length}）`);
      errorButton.addEventListener("click", () => new ErrorLogModal(this.app, this.plugin).open());
    }
    const settingsButton = actions.createDiv({ cls: "clickable-icon nav-action-button" });
    settingsButton.setAttr("role", "button");
    settingsButton.setAttr("tabindex", "0");
    settingsButton.setAttr("aria-label", "同步面板设置");
    setIcon(settingsButton, "settings");
    setTooltip(settingsButton, "同步面板设置");
    settingsButton.addEventListener("click", (event) => this.openViewSettingsMenu(event));

    const status = container.createDiv({ cls: "simple-sync-view__status" });
    status.addClass(`is-${statusState.tone}`);
    const statusDot = status.createSpan({ cls: "simple-sync-view__status-dot" });
    status.createSpan({ text: statusState.text, cls: "simple-sync-view__status-text" });

    if (pendingConflictPaths.length > 0) {
      const reminder = container.createDiv({ cls: "simple-sync-view__conflict-reminder" });
      setIcon(reminder.createSpan({ cls: "simple-sync-view__conflict-reminder-icon" }), "triangle-alert");
      const copy = reminder.createDiv({ cls: "simple-sync-view__conflict-reminder-copy" });
      copy.createDiv({ text: "同步尚未完成", cls: "simple-sync-view__conflict-reminder-title" });
      copy.createDiv({
        text: `${pendingConflictPaths.length} 个异常文件等待确认；已能合并的内容会保留，不会被回滚。`,
        cls: "simple-sync-view__conflict-reminder-desc"
      });
      const continueButton = reminder.createEl("button", { text: "继续处理", cls: "mod-cta" });
      continueButton.addEventListener("click", () => void this.plugin.continuePendingMergeConflicts());
    } else if (deferredMergePaths.length > 0) {
      const reminder = container.createDiv({
        cls: "simple-sync-view__conflict-reminder simple-sync-view__conflict-reminder--deferred"
      });
      setIcon(reminder.createSpan({ cls: "simple-sync-view__conflict-reminder-icon" }), "triangle-alert");
      const copy = reminder.createDiv({ cls: "simple-sync-view__conflict-reminder-copy" });
      const fileLabel =
        deferredMergePaths.length === 1 ? `“${deferredMergePaths[0]}”` : `${deferredMergePaths.length} 个文件`;
      copy.createDiv({ text: "同步暂缓：文件仍在修改", cls: "simple-sync-view__conflict-reminder-title" });
      copy.createDiv({
        text: `${fileLabel}正在修改，云端也有新版本。为避免覆盖本机内容，已暂停合并；停止修改并完成本地 Commit 后，将自动重新尝试同步。`,
        cls: "simple-sync-view__conflict-reminder-desc"
      });
    }

    const section = container.createDiv({ cls: "simple-sync-view__section" });
    const sectionHeader = section.createDiv({ cls: "simple-sync-view__section-header" });
    const actionButton = sectionHeader.createEl("button", { cls: "simple-sync-view__section-action" });
    const actionSpinner = actionButton.createSpan({ cls: "simple-sync-view__section-action-spinner" });
    const actionLabel = actionButton.createSpan({
      text: this.plugin.isSyncing() ? (mode === "commit" ? "Commit 中…" : "同步中…") : mode === "commit" ? "Commit" : "同步"
    });
    setIcon(actionSpinner, "loader-circle");
    actionButton.toggleClass("is-loading", this.plugin.isSyncing());
    actionButton.disabled = this.plugin.isSyncing() || pendingConflictPaths.length > 0;
    actionButton.setAttr(
      "aria-label",
      mode === "commit" ? "Commit 当前列表中的本机更改" : "下载远端更新并上传本机更改"
    );
    actionButton.addEventListener("click", async () => {
      actionButton.disabled = true;
      actionButton.addClass("is-loading");
      actionLabel.setText(mode === "commit" ? "Commit 中…" : "同步中…");
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
        setIcon(empty.createSpan(), "check-circle-2");
        empty.createSpan({ text: mode === "upload" ? "没有待上传文件" : "没有待 Commit 文件" });
      } else if (this.plugin.settings.viewLayout === "tree") {
        this.renderTree(section, changes);
      } else {
        for (const change of changes) this.renderChange(section, change, true);
      }
    } else {
      if (mode === "commit") actionButton.disabled = true;
      section.createDiv({ text: `无法读取更改：${messageOf(changesError)}`, cls: "simple-sync-view__empty is-error" });
    }
  }

  private createModeControl(parent: HTMLElement, current: ChangeViewMode): void {
    const control = parent.createDiv({ cls: "simple-sync-view__mode-control" });
    control.setAttr("role", "group");
    control.setAttr("aria-label", "选择文件列表");
    const createChoice = (value: ChangeViewMode, tooltip: string, icon: string): void => {
      const button = control.createEl("button", { cls: "simple-sync-view__mode-choice" });
      button.toggleClass("is-active", value === current);
      button.setAttr("aria-pressed", String(value === current));
      button.setAttr("aria-label", tooltip);
      setIcon(button, icon);
      setTooltip(button, tooltip);
      button.addEventListener("click", () => void this.plugin.setChangeViewMode(value));
    };
    createChoice(
      "commit",
      "显示待 Commit 文件",
      "git-commit"
    );
    createChoice(
      "upload",
      "显示待上传文件",
      "upload"
    );
  }

  private openViewSettingsMenu(event: MouseEvent): void {
    const menu = new Menu();
    menu.addItem((item) =>
      item
        .setTitle("显示待 Commit 列表")
        .setIcon(this.plugin.settings.showVersionViewSwitcher ? CHECKBOX_CHECKED_ICON : "square")
        .onClick(() => void this.plugin.setVersionViewSwitcher(!this.plugin.settings.showVersionViewSwitcher))
    );
    menu.addSeparator();
    menu.addItem((item) =>
      item.setTitle("预览冲突界面").setIcon("git-merge").onClick(() => void this.plugin.openConflictPreview())
    );
    menu.addSeparator();
    menu.addItem((item) =>
      item.setTitle("打开高级设置").setIcon("settings").onClick(() => this.plugin.openPluginSettings())
    );
    menu.showAtMouseEvent(event);
  }

  private async getStatusState(
    mode: ChangeViewMode,
    changes: ChangeItem[],
    changesError: unknown
  ): Promise<ViewStatusState> {
    if (!Platform.isMobile && !this.plugin.settings.setupComplete) {
      return { tone: "pending", text: `首次接入未完成 · 请在设置中继续第 ${this.plugin.getSetupPreview() ? this.plugin.settings.setupStep : Math.min(this.plugin.settings.setupStep, 5)} 步` };
    }
    const activity = this.plugin.getSyncActivity();
    if (activity) return activity;
    if (this.plugin.isSyncing()) {
      return { tone: "checking", text: mode === "commit" ? "正在整理 Commit 结果…" : "正在整理同步结果…" };
    }
    if (changesError) {
      return { tone: "error", text: `读取状态失败 · ${formatStatusError(messageOf(changesError))}` };
    }

    if (mode === "commit") {
      const lastCommitAt = await this.plugin.getLatestCommitAt();
      const lastCommitText = lastCommitAt ? `上次确认 ${formatRelativeTime(lastCommitAt)}` : "尚未确认";
      if (changes.length > 0) {
        return { tone: "pending", text: `待确认 · ${changes.length} 个文件 · ${lastCommitText}` };
      }
      return {
        tone: "success",
        text: lastCommitAt ? `已确认 · ${formatRelativeTime(lastCommitAt)}` : "已确认 · 尚无 Commit 记录"
      };
    }

    const { lastSyncAt } = this.plugin.settings;
    const lastSyncText = lastSyncAt
      ? `${Platform.isMobile ? "上次同步" : "上次 Push"} ${formatRelativeTime(lastSyncAt)}`
      : Platform.isMobile
        ? "尚未同步"
        : "尚未 Push";
    const activeError = this.plugin.getActiveSyncError();
    if (activeError) {
      const detail = `${activeError.context}：${formatStatusError(activeError.message)}`;
      return { tone: "error", text: `同步异常 · ${detail} · ${formatRelativeTime(activeError.timestamp)}` };
    }
    if (changes.length > 0) {
      return { tone: "pending", text: `待上传 · ${changes.length} 个文件 · ${lastSyncText}` };
    }
    return {
      tone: "success",
      text: Platform.isMobile
        ? lastSyncAt
          ? `已同步 · ${formatRelativeTime(lastSyncAt)}`
          : "已同步 · 尚无时间记录"
        : lastSyncAt
          ? `已上传 · ${formatRelativeTime(lastSyncAt)}`
          : "已上传 · 尚无 Push 记录"
    };
  }

  private renderTree(parent: HTMLElement, changes: ChangeItem[]): void {
    const groups = new Map<string, ChangeItem[]>();
    for (const change of changes) {
      const slash = change.path.indexOf("/");
      const group = slash === -1 ? "Vault 根目录" : change.path.slice(0, slash);
      const current = groups.get(group) ?? [];
      current.push(change);
      groups.set(group, current);
    }
    for (const [group, items] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const groupEl = parent.createDiv({ cls: "simple-sync-view__group" });
      const label = groupEl.createDiv({ cls: "simple-sync-view__group-label" });
      setIcon(label.createSpan(), "folder-closed");
      label.createSpan({ text: group });
      label.createSpan({ text: String(items.length), cls: "simple-sync-view__group-count" });
      for (const change of items) this.renderChange(groupEl, change, false);
    }
  }

  private renderChange(parent: HTMLElement, change: ChangeItem, fullPath: boolean): void {
    const row = parent.createDiv({ cls: "simple-sync-view__change" });
    row.setAttr("data-kind", change.kind);
    row.createSpan({ text: this.changeMark(change.kind), cls: "simple-sync-view__mark" });
    const text = row.createDiv({ cls: "simple-sync-view__change-text" });
    const label = fullPath ? change.path : change.path.split("/").slice(1).join("/") || change.path;
    text.createDiv({ text: label, cls: "simple-sync-view__path" });
    if (change.kind === "moved" && change.oldPath) {
      text.createDiv({ text: `从 ${change.oldPath}`, cls: "simple-sync-view__old-path" });
    }
    if (change.kind !== "deleted") {
      row.addClass("is-clickable");
      row.addEventListener("click", () => void this.app.workspace.openLinkText(change.path, "", false));
    }
  }

  private changeMark(kind: ChangeItem["kind"]): string {
    if (kind === "added") return "+";
    if (kind === "deleted") return "−";
    if (kind === "moved") return "→";
    return "M";
  }
}

class SimpleSyncSettingTab extends PluginSettingTab {
  private desktopPage: "root" | "git" | "mobile" | "server" | "setup" | "android-guide" | "ios-guide" = "root";
  private setupViewStep = 1;
  private setupRepoInput = "";
  private setupRepoNameInput = "";
  private setupRepoMode: "existing" | "create" = "existing";
  private setupTokenInput?: string;
  private setupTokenVisible = false;
  private setupTokenInputEl?: HTMLInputElement;
  private setupAuthMethod?: AuthMode | "check";
  private setupAuthorizationStatus?: boolean;
  private setupPlatform: "github" | "gitee" = "github";
  private setupOverlapContent?: SetupOverlapContent;
  private setupBusy = false;
  private setupRebuildConfirmed = false;
  private setupMessage = "";
  private setupLoginCancel?: () => void;
  private setupLoginTask?: Promise<void>;
  private setupDeviceCode = "";
  private setupDeviceExpiresAt = 0;
  private setupDeviceCountdown?: HTMLElement;
  private setupDeviceTimer?: number;
  private refreshingSetupDeviceCode = false;
  private setupAutoPreviewStarted = false;

  constructor(app: App, private plugin: SimpleSyncPlugin) {
    super(app, plugin);
  }

  private addHeading(parent: HTMLElement, title: string, cls?: string): void {
    const heading = new Setting(parent).setName(title).setHeading();
    if (cls) heading.settingEl.addClass(cls);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("simple-sync-settings");

    if (this.desktopPage === "git") { this.displayDesktopGit(containerEl); return; }
    if (this.desktopPage === "mobile") { this.displayMobilePreview(containerEl); return; }
    if (this.desktopPage === "server") { this.displayServerPreview(containerEl); return; }
    if (this.desktopPage === "android-guide") { this.displayDevicePreview(containerEl, "从零开始的 Git 同步使用指南（Android）", "Android 端的接入步骤将在轻量版 Git 同步功能完成后补充。", "mobile"); return; }
    if (this.desktopPage === "ios-guide") { this.displayDevicePreview(containerEl, "从零开始的 Git 同步使用指南（iOS）", "iOS 端的接入步骤将在轻量版 Git 同步功能完成后补充。", "mobile"); return; }
    if (!Platform.isMobile && this.desktopPage === "setup") { this.displaySetup(containerEl); return; }

    this.addHeading(containerEl, "Simple Link");
    this.addEnableSetting(containerEl);
    if (!Platform.isMobile) this.addSetupEntry(containerEl);

    this.displayDesktop(containerEl);
  }

  private addEnableSetting(parent: HTMLElement): void {
    new Setting(parent)
      .setName("启用 Simple Link")
      .setDesc("显示右侧同步面板，并允许手动或定时同步。关闭后保留配置，但停止本插件的同步工作。")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.enabled).onChange(async (value) => {
          await this.plugin.setFeatureEnabled(value);
          this.display();
        })
      );
  }

  private addSyncSetting(parent: HTMLElement): void {
    new Setting(parent)
      .setName("同步笔记")
      .setDesc("下载远端更新并上传本机更改。")
      .addButton((button) => button.setButtonText("同步笔记").setCta().onClick(() => void this.plugin.syncNow(true)));
  }

  private addTestSetting(parent: HTMLElement): void {
    new Setting(parent)
      .setName("测试连接")
      .setDesc("只验证当前服务器或 Git/GitHub 配置。")
      .addButton((button) => button.setButtonText("测试").onClick(() => void this.plugin.testConnection(true)));
  }

  private displayMobile(containerEl: HTMLElement): void {
    this.addHeading(containerEl, "手机端设置", "simple-sync-section-title");
    containerEl.createEl("p", {
      text: "移动端兼容仍在完善，以下仅保留当前已经实现的服务器同步设置。",
      cls: "simple-sync-section-desc"
    });
    new Setting(containerEl)
      .setName("服务器地址")
      .setDesc("公网必须使用 HTTPS，例如 https://sync.example.com。")
      .addText((text) =>
        text
          .setPlaceholder("https://sync.example.com")
          .setValue(this.plugin.settings.serverUrl)
          .onChange(async (value) => {
            this.plugin.settings.serverUrl = value.trim();
            await this.plugin.saveSettings();
          })
      );
    new Setting(containerEl)
      .setName("认证密码")
      .setDesc("保存在本机插件数据中；该文件已加入 Git 忽略。")
      .addText((text) => {
        text.inputEl.type = "password";
        text.setValue(this.plugin.settings.serverPassword).onChange(async (value) => {
          this.plugin.settings.serverPassword = value;
          await this.plugin.saveSettings();
        });
      });
    new Setting(containerEl).setName("设备名称").addText((text) =>
      text.setValue(this.plugin.settings.deviceName).onChange(async (value) => {
        this.plugin.settings.deviceName = value.trim();
        await this.plugin.saveSettings();
      })
    );
    new Setting(containerEl).setName("自动同步间隔（分钟）").addText((text) =>
      text.setValue(String(this.plugin.settings.mobileAutoSyncMinutes)).onChange(async (value) => {
        this.plugin.settings.mobileAutoSyncMinutes = Math.max(0, Number(value) || 0);
        await this.plugin.saveSettings();
      })
    );
    new Setting(containerEl).setName("指令检查间隔（秒）").addText((text) =>
      text.setValue(String(this.plugin.settings.commandPollSeconds)).onChange(async (value) => {
        this.plugin.settings.commandPollSeconds = Math.max(15, Number(value) || 60);
        await this.plugin.saveSettings();
      })
    );
  }

  private currentDevice(): "git" | "mobile" | "server" {
    if (Platform.isMobile) return "mobile";
    return typeof process !== "undefined" && process.platform === "linux" ? "server" : "git";
  }

  private displayDesktop(containerEl: HTMLElement): void {
    const currentDevice = this.currentDevice();
    this.addHeading(containerEl, "设备同步", "simple-sync-section-title");
    containerEl.createEl("p", { text: "已自动识别当前设备；其他设备的设置页可点开预览。", cls: "simple-sync-section-desc" });
    const entries = [
      { page: "git", title: "电脑端同步", desc: "使用本机 Git 与 GitHub 下载、合并并上传笔记。", icon: "git-branch" },
      { page: "mobile", title: "手机端同步", desc: "Android / iOS · 轻量版 Git 同步", icon: "smartphone" },
      { page: "server", title: "服务器端同步", desc: "Linux · 服务器同步设置", icon: "server" }
    ] as const;
    for (const entry of entries) {
      const isCurrent = currentDevice === entry.page;
      const button = containerEl.createEl("button", {
        cls: `simple-sync-page-link simple-sync-device-link${isCurrent ? "" : " is-preview"}`,
        attr: { type: "button" }
      });
      setIcon(button.createSpan({ cls: "simple-sync-page-link__icon" }), entry.icon);
      const copy = button.createSpan({ cls: "simple-sync-page-link__copy" });
      copy.createSpan({ text: `${entry.title}${isCurrent ? "（当前设备）" : ""}`, cls: "simple-sync-page-link__title" });
      copy.createSpan({ text: entry.desc, cls: "simple-sync-page-link__desc" });
      setIcon(button.createSpan({ cls: "simple-sync-page-link__chevron" }), "chevron-right");
      button.addEventListener("click", () => { this.desktopPage = entry.page; this.display(); });
    }
  }

  private displayDevicePreview(containerEl: HTMLElement, title: string, description: string, backPage: "root" | "mobile" = "root"): void {
    const header = containerEl.createDiv({ cls: "simple-sync-page-header" });
    this.addHeading(header, title, "simple-sync-page-title");
    const back = header.createEl("button", { cls: "clickable-icon simple-sync-page-back", attr: { type: "button", "aria-label": "返回设备同步" } });
    setIcon(back, "arrow-left");
    back.addEventListener("click", () => { this.desktopPage = backPage; this.display(); });
    containerEl.createEl("p", { text: description, cls: "simple-sync-section-desc" });
  }

  private displayServerPreview(containerEl: HTMLElement): void {
    this.displayDevicePreview(containerEl, "服务器端同步", "Linux 服务器端的同步设置将在这里补充。");
    this.addHeading(containerEl, "待更新", "simple-sync-section-title");
    const todo = containerEl.createEl("ul");
    todo.createEl("li", { text: "本地 Git 历史瘦身：仅整理服务器本机的旧历史，保留 GitHub 上的完整历史；执行前确认本地提交已上传。" });
    todo.createEl("li", { text: "按 .gitignore 重建追踪：让已追踪、后来被忽略的文件退出 Git 索引，保留服务器本机文件；不改变手机端的文件拉取设置。" });
    todo.createEl("li", { text: "电脑端和手机端同步页待增加「高级设置」：顶部放便捷开关，下面先放「重建追踪」，最后放「预览当前的」；具体追踪范围待确认。" });
    todo.createEl("li", { text: "待决定 .obsidian 目录的策略：整目录退出 Git 追踪，或按核心配置、插件、主题分类保留；每台设备的下载范围另行设置。" });
    todo.createEl("li", { text: "维护任务与同步操作错开执行，并展示检查结果、执行记录和操作前后的空间占用。" });
  }

  private displayMobilePreview(containerEl: HTMLElement): void {
    this.displayDevicePreview(containerEl, "手机端同步", "Android / iOS 轻量版 Git 同步设置将在这里补充。");
    for (const guide of [
      { page: "android-guide", title: "从零开始的 Git 同步使用指南（Android）" },
      { page: "ios-guide", title: "从零开始的 Git 同步使用指南（iOS）" }
    ] as const) {
      const button = containerEl.createEl("button", { cls: "simple-sync-page-link simple-sync-device-link is-preview", attr: { type: "button" } });
      setIcon(button.createSpan({ cls: "simple-sync-page-link__icon" }), "book-open");
      const copy = button.createSpan({ cls: "simple-sync-page-link__copy" });
      copy.createSpan({ text: guide.title, cls: "simple-sync-page-link__title" });
      copy.createSpan({ text: "待补充", cls: "simple-sync-page-link__desc" });
      setIcon(button.createSpan({ cls: "simple-sync-page-link__chevron" }), "chevron-right");
      button.addEventListener("click", () => { this.desktopPage = guide.page; this.display(); });
    }
  }

  private addSetupEntry(parent: HTMLElement): void {
    const button = parent.createEl("button", { cls: "simple-sync-page-link", attr: { type: "button" } });
    setIcon(button.createSpan({ cls: "simple-sync-page-link__icon" }), "book-open");
    const copy = button.createSpan({ cls: "simple-sync-page-link__copy" });
    copy.createSpan({ text: "从零开始的 Git 同步使用指南（电脑端）", cls: "simple-sync-page-link__title" });
    copy.createSpan({ text: this.plugin.settings.setupComplete ? "已完成接入 · 可重新查看步骤" : "按步骤创建私人仓库、授权、检查两端文件并首次同步", cls: "simple-sync-page-link__desc" });
    setIcon(button.createSpan({ cls: "simple-sync-page-link__chevron" }), "chevron-right");
    button.addEventListener("click", () => {
      this.desktopPage = "setup";
      this.setupViewStep = this.plugin.settings.setupStep;
      this.setupRepoInput = this.plugin.settings.setupRepoUrl || this.plugin.settings.gitRemoteUrl;
      this.display();
    });
  }

  private setupLink(parent: HTMLElement, label: string, href: string): void {
    parent.createEl("a", { text: label, href, attr: { target: "_blank", rel: "noopener noreferrer" } });
  }

  private async runSetup(action: () => Promise<void>, success: string | (() => string), progress = "正在处理，请稍候…"): Promise<void> {
    if (this.setupBusy) return;
    this.setupBusy = true;
    this.setupMessage = progress;
    this.display();
    try {
      await action();
      this.setupMessage = typeof success === "function" ? success() : success;
      this.setupViewStep = this.plugin.settings.setupStep;
    } catch (error) {
      this.setupMessage = this.refreshingSetupDeviceCode ? "正在刷新设备码…" : explainSetupError(error);
      if (!this.refreshingSetupDeviceCode) new Notice(`Simple Link：${this.setupMessage}`, 10000);
    } finally {
      this.setupBusy = false;
      this.setupLoginCancel = undefined;
      if (this.plugin.settings.setupStep > 3 && this.setupDeviceTimer !== undefined) {
        window.clearInterval(this.setupDeviceTimer);
        this.setupDeviceTimer = undefined;
      }
      this.display();
    }
  }

  private startBrowserLogin(): void {
    this.setupDeviceCode = "";
    this.setupDeviceExpiresAt = 0;
    this.setupDeviceCountdown = undefined;
    if (this.setupDeviceTimer !== undefined) window.clearInterval(this.setupDeviceTimer);
    this.setupMessage = "正在启动 GitHub 设备授权…";
    this.setupLoginTask = this.runSetup(() => this.plugin.authorizeSetup((code) => {
      this.setupDeviceCode = code;
      this.setupDeviceExpiresAt = Date.now() + 15 * 60 * 1000;
      this.setupMessage = "设备码已复制。请在 GitHub 页面输入下方设备码；完成授权后会自动检查登录状态。";
      this.setupDeviceTimer = window.setInterval(() => this.updateDeviceCountdown(), 1000);
      this.display();
    }, (cancel) => { this.setupLoginCancel = cancel; this.display(); }), "GitHub 授权完成，登录状态已自动核验。");
  }

  private async refreshBrowserDeviceCode(): Promise<void> {
    if (this.setupBusy && this.setupLoginCancel) {
      this.refreshingSetupDeviceCode = true;
      const task = this.setupLoginTask;
      this.setupLoginCancel();
      if (task) await task;
      this.refreshingSetupDeviceCode = false;
    }
    this.startBrowserLogin();
  }

  private updateDeviceCountdown(): void {
    if (!this.setupDeviceCountdown) return;
    const remaining = Math.max(0, Math.ceil((this.setupDeviceExpiresAt - Date.now()) / 1000));
    const minutes = Math.floor(remaining / 60);
    const seconds = remaining % 60;
    this.setupDeviceCountdown.setText(remaining ? `设备码有效期：${minutes}:${String(seconds).padStart(2, "0")}` : "设备码已过期，请刷新后重新填写。");
  }

  private displaySetup(containerEl: HTMLElement): void {
    const header = containerEl.createDiv({ cls: "simple-sync-page-header" });
    this.addHeading(header, "从零开始的 Git 同步使用指南（电脑端）", "simple-sync-page-title");
    const back = header.createEl("button", { cls: "clickable-icon simple-sync-page-back", attr: { type: "button", "aria-label": "返回设置" } });
    setIcon(back, "arrow-left");
    back.addEventListener("click", () => { this.desktopPage = "root"; this.display(); });
    containerEl.createEl("p", { text: "按顺序完成六步。已完成步骤以绿色线条和对勾标记，可返回查看。", cls: "simple-sync-section-desc" });
    const guidedDone = this.plugin.settings.setupComplete && !!this.plugin.settings.setupVerified;
    if (guidedDone) containerEl.createEl("p", { text: "✓ 已完成首次接入，自动同步已启用。", cls: "simple-sync-setup-done" });
    if (this.plugin.settings.setupComplete && !guidedDone) {
      containerEl.createEl("p", { text: "检测到旧版已配置的同步连接，自动同步继续运行；尚未经过此向导的私人仓库核验。", cls: "simple-sync-section-desc" });
      new Setting(containerEl).addButton((button) => button.setButtonText("从第一步重新检查接入").onClick(() => void this.runSetup(() => this.plugin.beginSetup(), "已暂停自动 Git 操作，请从第 1 步开始。")));
    }
    if (guidedDone) new Setting(containerEl).setDesc("重新运行引导，可核对并修复已忽略文件的 Git 追踪；进入后自动同步会暂停，完成或取消向导后恢复。")
      .addButton((button) => button.setButtonText("重新检查或修复接入").onClick(() => void this.runSetup(() => this.plugin.beginSetup(), "已暂停自动 Git 操作，请从第 1 步开始。")));
    if (!this.plugin.settings.setupComplete && this.plugin.settings.setupBackup && !this.plugin.settings.setupMutationStarted) {
      new Setting(containerEl).setDesc("退出向导并恢复之前已配置的自动同步。")
        .addButton((button) => button.setButtonText("取消向导，恢复旧同步").onClick(() => void this.runSetup(() => this.plugin.cancelSetup(), "已恢复之前的同步配置。")));
    }
    if (!this.plugin.settings.setupComplete && this.plugin.settings.setupMutationStarted) {
      containerEl.createEl("p", { text: "首次接入已开始修改本地 Git 状态。若中途失败，自动同步保持暂停；重新检查第 5 步并完成接入。", cls: "simple-sync-section-desc" });
    }
    const steps = ["创建私人仓库", "检查 Git 安装", "授权 GitHub", "填写并核验仓库", "检查本地与远端", "完成接入"];
    const nav = containerEl.createDiv({ cls: "simple-sync-setup-nav" });
    steps.forEach((label, index) => {
      const number = index + 1;
      const done = guidedDone || number < this.plugin.settings.setupStep;
      const tab = nav.createEl("button", { text: `${done ? "✓" : number}. ${label}`, cls: `simple-sync-setup-nav__step${done ? " is-done" : ""}${this.setupViewStep === number ? " is-active" : ""}`, attr: { type: "button" } });
      tab.disabled = !this.plugin.settings.setupComplete && number > this.plugin.settings.setupStep;
      tab.addEventListener("click", () => {
        this.setupViewStep = number;
        this.setupMessage = "";
        if (number === 5 && !this.plugin.getSetupPreview()) this.setupAutoPreviewStarted = false;
        this.display();
      });
    });
    const body = containerEl.createDiv({ cls: "simple-sync-card simple-sync-setup-body" });
    this.addHeading(body, `${this.setupViewStep}. ${steps[this.setupViewStep - 1]}`);
    if (this.setupViewStep === 1) this.displaySetupIntro(body);
    if (this.setupViewStep === 2) this.displaySetupGit(body);
    if (this.setupViewStep === 3) this.displaySetupAuth(body);
    if (this.setupViewStep === 4) this.displaySetupRepo(body);
    if (this.setupViewStep === 5) this.displaySetupPreview(body);
    if (this.setupViewStep === 6) this.displaySetupFinish(body);
    if (this.setupMessage) body.createEl("p", { text: this.setupMessage, cls: "simple-sync-setup-message" });
  }

  private displaySetupIntro(body: HTMLElement): void {
    body.createEl("p", { text: "当前流程支持 GitHub。请先准备好账号并完成后续授权；之后可在向导中填写已有仓库，或直接创建新的私人仓库。" });
    body.createEl("p", { text: "Gitee（尚未做实际兼容）：目前仅显示此选项，不会进入授权或同步流程。" });
    new Setting(body).setName("平台").addDropdown((drop) => drop.addOption("github", "GitHub").addOption("gitee", "Gitee（尚未做实际兼容）").setValue(this.setupPlatform).onChange((value) => {
      this.setupPlatform = value as "github" | "gitee";
      this.setupMessage = value === "gitee" ? "Gitee 目前尚未做实际兼容，请选 GitHub 继续。" : "";
      this.display();
    }));
    if (!this.plugin.settings.setupComplete && this.plugin.settings.setupStep === 1) {
      new Setting(body).addButton((button) => button.setButtonText("继续设置").setCta().setDisabled(this.setupPlatform !== "github").onClick(() => void this.runSetup(() => this.plugin.confirmSetupIntro(), "已记录你的选择。完成授权后可填写或创建私人仓库。")));
    }
  }

  private displaySetupGit(body: HTMLElement): void {
    body.createEl("p", { text: "电脑端同步必须安装 Git，因为插件会调用 git 命令执行 Fetch、Merge、Commit 和 Push。请检查当前电脑是否能运行 Git。" });
    const links = body.createDiv({ cls: "simple-sync-setup-links" });
    this.setupLink(links, "安装 Git ↗", "https://git-scm.com/downloads");
    if (this.plugin.settings.setupGitVersion) {
      body.createEl("p", { text: `检查结果：${this.plugin.settings.setupGitVersion}`, cls: "simple-sync-setup-done" });
    }
    if (!this.plugin.settings.setupComplete && this.plugin.settings.setupStep === 2) {
      new Setting(body).addButton((button) => button.setButtonText("检查 Git").setCta().setDisabled(this.setupBusy).onClick(() => void this.runSetup(async () => {
        const version = await this.plugin.checkSetupGit();
        this.setupMessage = `已检测到 ${version}。请确认此电脑已安装 Git，再继续。`;
      }, "Git 检查完成。")));
      if (this.plugin.settings.setupGitVersion) {
        new Setting(body).addButton((button) => button.setButtonText("确认 Git 已安装，继续").setCta().setDisabled(this.setupBusy).onClick(() => void this.runSetup(() => this.plugin.confirmSetupGit(), "已确认 Git 可用。")));
      }
    }
  }

  private displaySetupAuth(body: HTMLElement): void {
    const options = body.createDiv({ cls: "simple-sync-auth-options" });
    const addOption = (label: string, method: AuthMode | "check"): HTMLButtonElement => {
      const button = options.createEl("button", { text: label, cls: "simple-sync-auth-option", attr: { type: "button" } });
      button.addEventListener("click", () => {
        this.setupAuthMethod = method;
        this.setupMessage = "";
        this.setupAuthorizationStatus = undefined;
        this.display();
        if (method === "gh-cli" && !this.plugin.settings.setupComplete && this.plugin.settings.setupStep === 3) this.startBrowserLogin();
        if (method === "check") void this.runSetup(async () => {
          this.setupAuthorizationStatus = await this.plugin.inspectSetupAuthorization();
        }, "登录状态检查完成。").then(() => {
          this.setupMessage = "";
          this.display();
        });
      });
      return button;
    };
    if (!this.setupAuthMethod) {
      body.createEl("p", { text: "选择一种方式，让 Git 可以访问你的 GitHub 私人仓库。" });
      addOption("浏览器登录", "gh-cli");
      addOption("粘贴 Token", "token");
      addOption("我已授权，检查当前登录状态", "check");
      return;
    }
    const back = body.createEl("button", { text: "更换授权方式", cls: "simple-sync-auth-back", attr: { type: "button" } });
    back.disabled = this.setupBusy;
    back.addEventListener("click", () => {
      if (this.setupBusy && this.setupLoginCancel) this.setupLoginCancel();
      this.setupAuthMethod = undefined;
      this.setupDeviceCode = "";
      this.setupAuthorizationStatus = undefined;
      this.setupMessage = "";
      this.display();
    });

    if (this.setupAuthMethod === "check") {
      body.createEl("p", { text: "检查此电脑上 GitHub CLI 的当前登录状态。若已登录，会配置 Git 使用该凭据；检查不会更改仓库内容。" });
      if (this.setupBusy) {
        body.createEl("p", { text: "正在检查 GitHub CLI 登录状态…", cls: "simple-sync-section-desc" });
      } else if (this.setupAuthorizationStatus === true) {
        body.createEl("p", { text: "✓ 已授权：检测到有效的 GitHub CLI 登录。", cls: "simple-sync-setup-done" });
        new Setting(body).addButton((button) => button.setButtonText("使用此授权继续").setCta().onClick(() => void this.runSetup(() => this.plugin.continueWithSetupAuthorization(), "已确认使用当前 GitHub 授权。")));
      } else if (this.setupAuthorizationStatus === false) {
        body.createEl("p", { text: "未授权：当前电脑没有可用的 GitHub CLI 登录。请使用浏览器登录，或选择粘贴 Token。", cls: "simple-sync-setup-message" });
      }
      const actions = body.createDiv({ cls: "simple-sync-auth-actions" });
      const check = actions.createEl("button", { text: "重新检查登录状态", cls: "simple-sync-auth-option", attr: { type: "button" } });
      check.disabled = this.setupBusy;
      check.addEventListener("click", () => {
        this.setupAuthorizationStatus = undefined;
        this.setupMessage = "";
        this.display();
        void this.runSetup(async () => { this.setupAuthorizationStatus = await this.plugin.inspectSetupAuthorization(); }, "登录状态检查完成。").then(() => { this.setupMessage = ""; this.display(); });
      });
      const cli = body.createDiv({ cls: "simple-sync-setup-links" });
      this.setupLink(cli, "GitHub CLI 下载 ↗", "https://cli.github.com/");
      return;
    }

    if (this.setupAuthMethod === "gh-cli") {
      body.createEl("p", { text: "在 GitHub 设备填写页输入已复制的设备码。授权完成后，插件会自动检查登录状态并配置 Git。" });
      const links = body.createDiv({ cls: "simple-sync-setup-links" });
      this.setupLink(links, "打开 GitHub 设备填写页 ↗", "https://github.com/login/device");
      if (this.setupDeviceCode) {
        body.createEl("p", { text: `设备码：${this.setupDeviceCode}`, cls: "simple-sync-device-code" });
        this.setupDeviceCountdown = body.createEl("p", { cls: "simple-sync-device-expiry" });
        this.updateDeviceCountdown();
      } else if (this.setupBusy) {
        body.createEl("p", { text: "正在获取设备码…", cls: "simple-sync-section-desc" });
      }
      const actions = body.createDiv({ cls: "simple-sync-auth-actions" });
      const refresh = actions.createEl("button", { text: this.setupDeviceCode ? "刷新设备码" : "重新开始授权", cls: "simple-sync-auth-option", attr: { type: "button" } });
      refresh.disabled = this.setupBusy && !this.setupLoginCancel;
      refresh.addEventListener("click", () => void this.refreshBrowserDeviceCode());
      if (!this.setupBusy && !this.setupDeviceCode) {
        const start = actions.createEl("button", { text: "开始浏览器登录", cls: "simple-sync-auth-option mod-cta", attr: { type: "button" } });
        start.addEventListener("click", () => this.startBrowserLogin());
      }
      const cli = body.createDiv({ cls: "simple-sync-setup-links" });
      this.setupLink(cli, "尚未安装 GitHub CLI？点击下载 ↗", "https://cli.github.com/");
    } else {
      if (this.setupTokenInput === undefined) this.setupTokenInput = this.plugin.settings.gitAuthMode === "token" ? this.plugin.settings.gitAuthKey : "";
      body.createEl("p", { text: "粘贴 Token 后点击右侧“确认 Token”。插件会先验证 Token 和所属账号；验证成功后才会保存在本机并继续。使用已有仓库时，fine-grained Token 只需选该仓库并授予 Contents 读写权限；若要在向导中创建仓库，还需 Administration 写入权限。" });
      const links = body.createDiv({ cls: "simple-sync-setup-links" });
      this.setupLink(links, "打开 GitHub Token 创建说明 ↗", "https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens");
      let confirmTokenButton: HTMLButtonElement | undefined;
      const tokenSetting = new Setting(body).setName("GitHub Token")
        .addText((text) => {
          text.inputEl.type = "password";
          text.inputEl.addClass("simple-sync-wide-input");
          this.setupTokenInputEl = text.inputEl;
          text.inputEl.type = this.setupTokenVisible ? "text" : "password";
          text.setPlaceholder("粘贴 fine-grained Token");
          text.setValue(this.setupTokenInput ?? "").onChange((value) => {
            this.setupTokenInput = value;
            if (confirmTokenButton) confirmTokenButton.disabled = this.setupBusy || !value.trim();
          });
        });
      if (!this.plugin.settings.setupComplete && this.plugin.settings.setupStep === 3) {
        tokenSetting.addButton((button) => button.setButtonText(this.setupTokenVisible ? "隐藏" : "显示").setTooltip("切换 Token 可见性").onClick(() => {
          this.setupTokenVisible = !this.setupTokenVisible;
          if (this.setupTokenInputEl) this.setupTokenInputEl.type = this.setupTokenVisible ? "text" : "password";
          button.setButtonText(this.setupTokenVisible ? "隐藏" : "显示");
        }));
        tokenSetting.addButton((button) => {
          button.setButtonText("确认 Token").setCta().setDisabled(this.setupBusy || !this.setupTokenInput?.trim());
          confirmTokenButton = button.buttonEl;
          button.onClick(() => {
            let login = "";
            void this.runSetup(async () => { login = await this.plugin.saveSetupToken(this.setupTokenInput ?? ""); }, () => `Token 有效，已验证账号 @${login}。凭据已保存在本机；下一步会检查该账号对私人仓库的读写权限。`);
          });
        });
      }
    }
  }

  private displaySetupRepo(body: HTMLElement): void {
    const modes = body.createDiv({ cls: "simple-sync-repo-modes" });
    const existing = modes.createEl("button", { text: "使用已有 GitHub 仓库", cls: "simple-sync-auth-option", attr: { type: "button" } });
    const create = modes.createEl("button", { text: "新建 GitHub 私人仓库", cls: "simple-sync-auth-option", attr: { type: "button" } });
    existing.toggleClass("is-selected", this.setupRepoMode === "existing");
    create.toggleClass("is-selected", this.setupRepoMode === "create");
    existing.addEventListener("click", () => { this.setupRepoMode = "existing"; this.setupMessage = ""; this.display(); });
    create.addEventListener("click", () => { this.setupRepoMode = "create"; this.setupMessage = ""; this.display(); });

    if (this.setupRepoMode === "existing") {
      this.addHeading(body, "核验已有仓库");
      body.createEl("p", { text: "填写仓库 HTTPS 地址，点击输入框右侧的 ✓ 后自动检查私人属性和当前账号的写入权限。" });
      let verifyButton: HTMLButtonElement | undefined;
      const row = new Setting(body).setName("GitHub 仓库地址")
        .addText((text) => {
          text.inputEl.addClass("simple-sync-wide-input");
          text.setPlaceholder("https://github.com/user/vault.git")
            .setValue(this.setupRepoInput)
            .onChange((value) => {
              this.setupRepoInput = value.trim();
              if (verifyButton) verifyButton.disabled = this.setupBusy || !this.setupRepoInput;
            });
        });
      if (!this.plugin.settings.setupComplete && this.plugin.settings.setupStep >= 4) {
        row.addButton((button) => {
          button.setButtonText("✓").setTooltip("核验私人仓库").setDisabled(this.setupBusy || !this.setupRepoInput);
          button.buttonEl.addClass("simple-sync-confirm-check");
          verifyButton = button.buttonEl;
          button.onClick(() => {
            this.setupAutoPreviewStarted = false;
            void this.runSetup(() => this.plugin.verifySetupRepository(this.setupRepoInput), "已核验：私人仓库，当前账号有写入权限。");
          });
        });
      }
      body.createEl("p", { text: "支持 HTTPS 地址。仓库名不能包含空格或 ✓；有效规则：最多 100 个字符，限英文字母、数字、点、连字符和下划线。", cls: "simple-sync-section-desc" });
    } else {
      this.addHeading(body, "新建私人仓库");
      body.createEl("p", { text: "填写名称并点击右侧 ✓，插件会在当前授权的 GitHub 账号下创建 Private 仓库，然后自动核验。" });
      if (this.plugin.settings.gitAuthMode === "token") {
        body.createEl("p", { text: "使用 Token 创建仓库需要 fine-grained Token 的 Administration 仓库权限（write）。" , cls: "simple-sync-section-desc" });
      }
      let createButton: HTMLButtonElement | undefined;
      const row = new Setting(body).setName("仓库名称")
        .addText((text) => {
          text.inputEl.addClass("simple-sync-wide-input");
          text.setPlaceholder("例如：my-obsidian-vault")
            .setValue(this.setupRepoNameInput)
            .onChange((value) => {
              this.setupRepoNameInput = value;
              if (createButton) createButton.disabled = this.setupBusy || !value.trim();
            });
        });
      if (!this.plugin.settings.setupComplete && this.plugin.settings.setupStep >= 4) {
        row.addButton((button) => {
          button.setButtonText("✓").setTooltip("创建私人仓库并核验").setDisabled(this.setupBusy || !this.setupRepoNameInput.trim());
          button.buttonEl.addClass("simple-sync-confirm-check");
          createButton = button.buttonEl;
          button.onClick(() => void this.runSetup(async () => {
            this.setupAutoPreviewStarted = false;
            this.setupRepoInput = await this.plugin.createSetupRepository(this.setupRepoNameInput);
            this.setupRepoMode = "existing";
          }, "私人仓库已创建并核验。"));
        });
      }
      body.createEl("p", { text: "名称最多 100 个字符，只能包含英文字母、数字、点（.）、连字符（-）和下划线（_）；空格与 ✓ 均不允许。点击 ✓ 会立即创建私人仓库。", cls: "simple-sync-section-desc" });
    }
    if (this.plugin.settings.setupVerified) body.createEl("p", { text: `已核验：${this.plugin.settings.setupVerified.url} · 分支 ${this.plugin.settings.setupVerified.branch}`, cls: "simple-sync-setup-done" });
  }

  private displaySetupPreview(body: HTMLElement): void {
    body.createEl("p", { text: `当前 Vault：${this.plugin.getVaultBasePath()}` });
    if (this.plugin.settings.setupComplete && !this.plugin.settings.setupVerified) {
      body.createEl("p", { text: "当前连接来自旧版设置，尚未经过此向导核验。使用上方「从第一步重新检查接入」后可查看两端文件。" });
    }
    if (this.plugin.settings.setupComplete && this.plugin.settings.setupStep >= 5 && (this.plugin.settings.setupVerified || this.plugin.settings.setupRepoUrl)) {
      new Setting(body).addButton((button) => button.setButtonText(!this.plugin.settings.setupVerified ? "重新核验仓库并检查两端" : this.plugin.settings.setupComplete ? "重新读取两端状态" : "检查两端文件").setCta().setDisabled(this.setupBusy).onClick(() => void this.runSetup(async () => {
        this.setupOverlapContent = undefined;
        this.setupRebuildConfirmed = false;
        await this.plugin.inspectSetupRepository();
      }, this.plugin.settings.setupComplete ? "已重新读取两端状态。" : "检查完成。请选择同名文件的保留版本，再确认此步。")));
    }
    const preview = this.plugin.getSetupPreview();
    if (!preview && !this.plugin.settings.setupComplete && this.plugin.settings.setupStep >= 5 && this.plugin.settings.setupVerified && !this.setupBusy && !this.setupAutoPreviewStarted) {
      this.setupAutoPreviewStarted = true;
      window.setTimeout(() => void this.runSetup(async () => {
        this.setupOverlapContent = undefined;
        this.setupRebuildConfirmed = false;
        await this.plugin.inspectSetupRepository();
      }, "检查完成。请选择同名文件的保留版本，再确认此步。", "正在检查本地与远端文件…"), 0);
    }
    if (preview) {
      if (preview.alreadyLinked) body.createEl("p", { text: "当前 Git 历史已包含远端提交。接入时只补充忽略规则并推送本机未上传的更改。", cls: "simple-sync-setup-done" });
      else if (preview.relatedHistory) body.createEl("p", { text: "本机与远端有共同历史，远端有新提交。接入时会正常合并；若发生冲突会停止并提示处理，不会直接覆盖同名文件。", cls: "simple-sync-section-desc" });
      body.createEl("p", { text: `本地 ${preview.localFiles.length} 个文件，远端 ${preview.remoteFiles.length} 个文件；仅本地 ${preview.localOnly.length}，仅远端 ${preview.remoteOnly.length}，同名且内容相同 ${preview.identicalCount}，需人工选择 ${preview.overlaps.length}。` });
      body.createEl("p", { text: preview.localRoot
        ? `现有 Git 仓库：${preview.localRoot}；本机分支：${preview.localBranch}；origin：${preview.origin || "未设置"}；首次推送目标：${preview.branch}`
        : `Vault 尚未初始化 Git；完成接入时会在当前 Vault 创建 ${preview.branch} 分支。` });
      if (preview.localRoot && !preview.relatedHistory && preview.localBranch !== preview.branch) {
        body.createEl("p", { text: `本机已有独立历史，当前 ${preview.localBranch} 分支接入后会推送到远端 ${preview.branch} 分支。请核对这是否是要接入的仓库。`, cls: "simple-sync-section-desc" });
      }
      if (preview.localRoot) {
        const ignoredTrackedCount = preview.trackedExcludedLocal.length + preview.trackedExcludedRemote.length;
        if (ignoredTrackedCount > 0) {
          body.createEl("p", { text: `本地 ${preview.trackedExcludedLocal.length} 个、远端 ${preview.trackedExcludedRemote.length} 个已跟踪文件符合当前或建议的 .gitignore 忽略规则。默认保留现有追踪；如要修正，可按最终规则重建整个索引。` });
          this.setupFileList(body, "本地已跟踪但建议忽略", preview.trackedExcludedLocal);
          this.setupFileList(body, "远端已跟踪但建议忽略", preview.trackedExcludedRemote);
        } else {
          body.createEl("p", { text: "未发现已跟踪但符合忽略规则的文件；默认保留现有 Git 追踪。", cls: "simple-sync-setup-done" });
        }
        if (!this.plugin.settings.setupComplete && ignoredTrackedCount > 0) {
          new Setting(body).setName("Git 追踪方式")
            .setDesc("默认保留现有追踪。选择重建会清空索引并按最终 .gitignore 重新加入文件；被忽略的文件将停止追踪，推送后从远端当前版本移除。")
            .addDropdown((dropdown) => dropdown
              .addOption("keep", "保留现有 Git 追踪（默认）")
              .addOption("rebuild", "按最终 .gitignore 重建追踪")
              .setValue(this.plugin.getSetupTrackingChoice() || "keep")
              .onChange((value) => {
                this.plugin.setSetupTrackingChoice(value ? value as "keep" | "rebuild" : undefined);
                this.setupRebuildConfirmed = false;
                this.display();
              }));
        }
      }
      this.setupFileList(body, "仅本地文件", preview.localOnly);
      this.setupFileList(body, "仅远端文件", preview.remoteOnly);
      this.setupFileList(body, "同名文件", preview.overlaps);
      if (preview.overlaps.length && !this.plugin.settings.setupComplete) {
        body.createEl("p", { text: "每个同名文件都要明确选择本机或远端版本。" });
        if (preview.overlaps.includes(".gitignore")) {
          body.createEl("p", { text: "注意：若对 .gitignore 选择「采用远端」，本机自定义规则会被远端文件替换。建议保留本机，并在接入后手动核对远端自定义规则；向导只会逐条补充建议规则。" });
        }
        const choices = this.plugin.getSetupChoices();
        for (const path of preview.overlaps) {
          new Setting(body).setName(path).addDropdown((dropdown) => dropdown
            .addOption("", "请选择")
            .addOption("local", "保留本机")
            .addOption("remote", "采用远端")
            .setValue(choices[path] || "")
            .onChange((value) => this.plugin.setSetupChoice(path, value as OverlapChoice)))
            .addButton((button) => button.setButtonText("查看内容").setDisabled(this.setupBusy).onClick(() => void this.runSetup(async () => {
              this.setupOverlapContent = await this.plugin.readSetupOverlap(path);
            }, `已读取 ${path} 的两端内容。`)));
        }
        if (this.setupOverlapContent && preview.overlaps.includes(this.setupOverlapContent.path)) {
          this.addHeading(body, `内容对照：${this.setupOverlapContent.path}`);
          const comparison = body.createDiv({ cls: "simple-sync-setup-comparison" });
          const local = comparison.createDiv();
          local.createEl("strong", { text: "本机" });
          local.createEl("pre", { text: this.setupOverlapContent.local });
          const remote = comparison.createDiv();
          remote.createEl("strong", { text: "远端" });
          remote.createEl("pre", { text: this.setupOverlapContent.remote });
        }
      }
      if (!this.plugin.settings.setupComplete) {
        new Setting(body).addButton((button) => button.setButtonText("确认检查结果，进入接入").setCta().onClick(() => void this.runSetup(() => this.plugin.confirmSetupPreview(), "已确认两端文件及同名文件选择。")));
      }
    }
  }

  private setupFileList(body: HTMLElement, title: string, paths: string[]): void {
    const details = body.createEl("details", { cls: "simple-sync-setup-files" });
    details.createEl("summary", { text: `${title}（${paths.length}）` });
    for (const path of paths.slice(0, 200)) details.createEl("div", { text: path });
    if (paths.length > 200) details.createEl("p", { text: `还有 ${paths.length - 200} 个文件未在这里展开。` });
  }

  private displaySetupFinish(body: HTMLElement): void {
    const preview = this.plugin.getSetupPreview();
    if (!preview) {
      body.createEl("p", { text: this.plugin.settings.setupComplete && this.plugin.settings.setupVerified
        ? `已接入 ${this.plugin.settings.setupVerified.url}。如需查看当前两端文件，请返回第 5 步重新读取。`
        : this.plugin.settings.setupComplete
          ? "当前连接来自旧版设置，尚未经过此向导；如需检查接入，请从第一步重新开始。"
        : "本次打开后尚无检查结果，请返回第 5 步重新检查。" });
      return;
    }
    const remoteIgnoreSelected = this.plugin.getSetupChoices()[".gitignore"] === "remote";
    const ignoreSummary = this.plugin.settings.setupComplete
      ? remoteIgnoreSelected ? "已按你的选择采用远端 .gitignore，并逐条补充缺少的建议规则。" : "现有本机 .gitignore 规则已保留。"
      : remoteIgnoreSelected
        ? "你已选择远端 .gitignore：本机自定义规则将被替换；接入时会以远端版本为基础重新逐条检查建议规则。"
      : preview.missingIgnoreRules.length > 0
        ? `首次提交前只补充 .gitignore 缺少的 ${preview.missingIgnoreRules.length} 条规则；已有规则不会被覆盖。`
        : "现有 .gitignore 已涵盖建议规则，不会追加重复规则。";
    body.createEl("p", { text: `将保留本地 ${preview.localFiles.length} 个文件，并接入远端 ${preview.remoteFiles.length} 个文件。${ignoreSummary}` });
    if (preview.localRoot) {
      const trackingChoice = this.plugin.getSetupTrackingChoice();
      body.createEl("p", { text: trackingChoice === "rebuild"
        ? `将取消全部 Git 追踪并按最终 .gitignore 重建索引。本机文件保留；被忽略的文件不会重新加入，推送后从远端当前版本移除，旧提交历史仍保留。正在编辑的插件改动会跳过本次提交。`
        : trackingChoice === "keep"
          ? "你已选择保留现有追踪；已跟踪的忽略文件仍会继续同步。"
          : preview.trackedExcludedLocal.length || preview.trackedExcludedRemote.length
            ? "请返回第 5 步，选择如何处理已跟踪的忽略文件。"
            : "未选择重建；将保留现有追踪。如需用重建纠错，请返回第 5 步选择。" });
      if (trackingChoice === "rebuild" && !this.plugin.settings.setupComplete) {
        new Setting(body).setName("确认重建 Git 追踪")
          .setDesc("我确认取消全部追踪并按 .gitignore 重建；本机文件保留，被忽略文件会从远端当前版本移除。")
          .addToggle((toggle) => toggle.setValue(this.setupRebuildConfirmed).onChange((value) => {
            this.setupRebuildConfirmed = value;
            this.display();
          }));
      }
    }
    new Setting(body).setName("提交作者名称").setDesc("显示在 Git 提交记录中，不是登录账号。建议为不同同步设备设置不同名称，方便区分提交来自哪台设备。")
      .addText((text) => text.setValue(this.plugin.settings.gitAuthorName === DEFAULT_GIT_AUTHOR_NAME ? "" : this.plugin.settings.gitAuthorName).onChange(async (value) => {
        this.plugin.settings.gitAuthorName = value.trim();
        await this.plugin.saveSettings();
      }));
    new Setting(body).setName("提交作者邮箱").setDesc("用于 Git 提交记录，不是登录密码。")
      .addText((text) => text.setValue(this.plugin.settings.gitAuthorEmail === DEFAULT_GIT_AUTHOR_EMAIL ? "" : this.plugin.settings.gitAuthorEmail).onChange(async (value) => {
        this.plugin.settings.gitAuthorEmail = value.trim();
        await this.plugin.saveSettings();
      }));
    if (!this.plugin.settings.setupComplete && !remoteIgnoreSelected && preview.missingIgnoreRules.length > 0) {
      const rules = body.createEl("details", { cls: "simple-sync-setup-files" });
      rules.createEl("summary", { text: `查看将补充的 ${preview.missingIgnoreRules.length} 条 .gitignore 规则` });
      rules.createEl("pre", { text: preview.missingIgnoreRules.join("\n") });
    }
    if (preview.overlaps.length) this.setupFileList(body, "已选择远端版本的同名文件", preview.overlaps.filter((path) => this.plugin.getSetupChoices()[path] === "remote"));
    if (!this.plugin.settings.setupComplete) {
      new Setting(body).addButton((button) => button.setButtonText("关联并首次推送").setCta()
        .setDisabled(this.setupBusy || (this.plugin.getSetupTrackingChoice() === "rebuild" && !this.setupRebuildConfirmed))
        .onClick(() => void this.runSetup(() => this.plugin.finishSetup(this.setupRebuildConfirmed), "首次推送成功，向导已完成。", "正在复核仓库和文件状态，并完成首次 Git 推送…")));
    }
  }

  private displayDesktopGit(containerEl: HTMLElement): void {
    const preview = this.currentDevice() !== "git";
    const pageHeader = containerEl.createDiv({ cls: "simple-sync-page-header" });
    this.addHeading(pageHeader, "电脑端同步", "simple-sync-page-title");
    const backButton = pageHeader.createEl("button", {
      cls: "clickable-icon simple-sync-page-back",
      attr: { type: "button", "aria-label": "返回设备同步" }
    });
    setIcon(backButton, "arrow-left");
    backButton.addEventListener("click", () => {
      this.desktopPage = "root";
      this.display();
    });

    containerEl.createEl("p", {
      text: "使用本机 Git 与 GitHub 下载远端更新、合并版本并上传本机更改。",
      cls: "simple-sync-section-desc"
    });
    if (preview) containerEl.createEl("p", { text: "当前设备仅预览和编辑电脑端设置；同步与故障修复请在电脑端执行。", cls: "simple-sync-section-desc" });

    if (!preview) {
      this.addHeading(containerEl, "同步操作", "simple-sync-section-title");
      const syncCard = containerEl.createDiv({ cls: "simple-sync-card" });
      this.addSyncSetting(syncCard);
    }

    this.addHeading(containerEl, "连接", "simple-sync-section-title");
    const connectionCard = containerEl.createDiv({ cls: "simple-sync-card" });
    new Setting(connectionCard)
      .setName("Git 仓库地址")
      .setDesc("填写用于保存和同步笔记的 GitHub 仓库地址。")
      .addText((text) =>
        text.setPlaceholder("https://github.com/user/vault.git").setValue(this.plugin.settings.gitRemoteUrl).onChange(async (value) => {
          this.plugin.settings.gitRemoteUrl = value.trim();
          await this.plugin.saveSettings();
        })
      );
    const authSetting = new Setting(connectionCard)
      .setName("认证方式")
      .setDesc(
        this.plugin.settings.gitAuthMode === "gh-cli"
          ? "使用本机 Git Credential Manager、SSH 等已有凭据。"
          : "Token 只保存在本机插件数据中，并通过单次 Git 进程使用。"
      )
      .addDropdown((dropdown) =>
        dropdown
          .addOption("gh-cli", "系统 Git 凭据（推荐）")
          .addOption("token", "Author 认证 Key / Token")
          .setValue(this.plugin.settings.gitAuthMode)
          .onChange(async (value) => {
            this.plugin.settings.gitAuthMode = value as AuthMode;
            await this.plugin.saveSettings();
            this.display();
          })
      );
    authSetting.descEl.addClass("simple-sync-auth-note");
    if (this.plugin.settings.gitAuthMode === "token") {
      new Setting(connectionCard)
        .setName("Author 认证 Key / GitHub Token")
        .setDesc("不会写入 Git Remote URL；通过单次 Git 进程环境传入。")
        .addText((text) => {
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
    summary.createSpan({ text: "高级设置", cls: "simple-sync-advanced__title" });
    summary.createSpan({ text: "通常不需要修改", cls: "simple-sync-advanced__desc" });
    const advancedBody = advanced.createDiv({ cls: "simple-sync-card simple-sync-advanced__body" });
    this.addHeading(advancedBody, "界面设置", "simple-sync-subsection-title");
    const versionViewSetting = new Setting(advancedBody)
      .setName("显示待 Commit 列表")
      .setDesc("在同步按钮旁显示待上传和待 Commit 切换。关闭时只显示待上传文件。");
    const versionViewIcon = versionViewSetting.nameEl.createSpan({ cls: "simple-sync-setting-mode-icon" });
    setIcon(versionViewIcon, "git-commit");
    versionViewSetting.nameEl.prepend(versionViewIcon);
    versionViewSetting.addToggle((toggle) =>
      toggle
        .setValue(this.plugin.settings.showVersionViewSwitcher)
        .onChange((value) => void this.plugin.setVersionViewSwitcher(value))
    );

    this.addHeading(advancedBody, "同步时间设置", "simple-sync-subsection-title");
    new Setting(advancedBody)
      .setName("空闲后汇总变化文件列表（秒）")
      .setDesc("持续多久没有文件变化后汇总所有变化文件，生成待 Commit／上传列表。")
      .addText((text) => {
        text.inputEl.type = "number";
        text.inputEl.min = "0.5";
        text.inputEl.step = "0.5";
        text.setValue(String(this.plugin.settings.viewRefreshDelaySeconds)).onChange(async (value) => {
          this.plugin.settings.viewRefreshDelaySeconds = Math.max(0.5, Number(value) || 7);
          await this.plugin.saveSettings();
        });
      });
    new Setting(advancedBody)
      .setName("空闲后自动 Commit（分钟）")
      .setDesc("持续多久没有文件变化后创建 Commit。设为 0 可关闭。")
      .addText((text) => this.addTimingInput(text, "autoCommitIdleMinutes", 30));
    new Setting(advancedBody)
      .setName("空闲后自动 Push（分钟）")
      .setDesc("已有待上传 Commit 且文件停止变化多久后执行；开始时会先补一次 Commit，再 Fetch、按需 Merge 并 Push。设为 0 可关闭。")
      .addText((text) => this.addTimingInput(text, "autoPushIdleMinutes", 5));
    new Setting(advancedBody)
      .setName("强制 Commit 间隔（分钟）")
      .setDesc("到点立即 Commit 其他已稳定文件；最近仍在修改的文件会跳过，等待下一次自动 Commit。设为 0 可关闭。")
      .addText((text) => this.addTimingInput(text, "maxUncommittedMinutes", 60));
    new Setting(advancedBody)
      .setName("强制 Push 间隔（分钟）")
      .setDesc("最早的待上传 Commit 到点后，先强制 Commit 当前本机更改（包括正在编辑的文件），再 Fetch、按需 Merge 并 Push。设为 0 可关闭。")
      .addText((text) => this.addTimingInput(text, "maxUnpushedMinutes", 120));
    new Setting(advancedBody)
      .setName("启动后自动 Commit、Fetch 并 Merge")
      .setDesc("启动后先 Commit 除正在修改外的文件，再获取云端最新提交并合并到本机；不会立即 Push。")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.pullOnStartup).onChange(async (value) => {
          this.plugin.settings.pullOnStartup = value;
          await this.plugin.saveSettings();
        })
      );
    new Setting(advancedBody)
      .setName("自动 Fetch 与 Merge 间隔（分钟）")
      .setDesc("按此时间间隔获取云端最新提交并合并到本机；不会执行 Push。设为 0 可关闭。")
      .addText((text) => this.addTimingInput(text, "autoPullIntervalMinutes", 5));

    this.addHeading(advancedBody, "Git 设置", "simple-sync-subsection-title");
    new Setting(advancedBody)
      .setName("分支")
      .setDesc("默认使用 master；只有仓库使用其他分支时才需要修改。")
      .addText((text) =>
        text.setValue(this.plugin.settings.gitBranch).onChange(async (value) => {
          this.plugin.settings.gitBranch = value.trim() || "master";
          await this.plugin.saveSettings();
        })
      );
    new Setting(advancedBody)
      .setName("提交作者名称")
      .setDesc("Git 创建版本记录时使用；通常会自动读取本机已有的 Git 配置。")
      .addText((text) =>
        text.setValue(this.plugin.settings.gitAuthorName).onChange(async (value) => {
          this.plugin.settings.gitAuthorName = value.trim();
          await this.plugin.saveSettings();
        })
      );
    new Setting(advancedBody)
      .setName("提交作者邮箱")
      .setDesc("用于标识 Git 提交作者，不是登录密码；通常会自动读取。")
      .addText((text) =>
        text.setValue(this.plugin.settings.gitAuthorEmail).onChange(async (value) => {
          this.plugin.settings.gitAuthorEmail = value.trim();
          await this.plugin.saveSettings();
        })
      );

    this.addHeading(advancedBody, "故障排查", "simple-sync-subsection-title");
    new Setting(advancedBody)
      .setName("异常修复")
      .setDesc("恢复未完成的 Rebase、Merge 等 Git 操作，以当前本机内容重新 Commit，再 Fetch 并 Merge；不会立即 Push。")
      .addButton((button) =>
        button.setButtonText("恢复正常同步").setDisabled(preview).onClick(async () => {
          button.setDisabled(true);
          button.setButtonText("正在检查…");
          try {
            const operation = await this.plugin.getInterruptedGitOperationLabel();
            if (!operation) {
              new Notice("Simple Link：没有检测到未完成的 Rebase、Merge、Cherry-pick 或 Revert");
              return;
            }
            new GitRepairModal(this.app, this.plugin, operation).open();
          } catch (error) {
            new Notice(`Simple Link：无法检查 Git 状态。${messageOf(error)}`, 10000);
          } finally {
            button.setDisabled(false);
            button.setButtonText("恢复正常同步");
          }
        })
      );
    const logs = this.plugin.getRecentErrorLogs();
    const errorCount = logs.filter((entry) => entry.status !== "success").length;
    new Setting(advancedBody)
      .setName("最近同步日志")
      .setDesc(
        errorCount > 0
          ? `最近 24 小时共 ${logs.length} 条记录，其中 ${errorCount} 条错误。`
          : `最近 24 小时共 ${logs.length} 条记录，没有错误。`
      )
      .addButton((button) =>
        button.setButtonText("查看日志").onClick(() => new ErrorLogModal(this.app, this.plugin).open())
      );
  }

  private addTimingInput(
    text: import("obsidian").TextComponent,
    key:
      | "autoCommitIdleMinutes"
      | "autoPushIdleMinutes"
      | "maxUncommittedMinutes"
      | "maxUnpushedMinutes"
      | "autoPullIntervalMinutes",
    fallback: number
  ): void {
    text.inputEl.type = "number";
    text.inputEl.min = "0";
    text.inputEl.step = "1";
    text.setValue(String(this.plugin.settings[key])).onChange(async (value) => {
      this.plugin.settings[key] = Math.max(0, Number(value) || (value.trim() === "0" ? 0 : fallback));
      await this.plugin.saveSettings();
      await this.plugin.restartDesktopAutomation();
    });
  }
}
