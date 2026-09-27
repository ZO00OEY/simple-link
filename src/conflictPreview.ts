import { App, Modal, setIcon } from "obsidian";

type Side = "local" | "remote";
type FileChoice = Side | "latest";
type BlockMethod = Side | "merged";
type ChoiceTone = Side | "mixed";

interface PreviewBlock {
  line: number;
  local: string;
  remote: string;
}

interface PreviewFile {
  path: string;
  totalLines: number;
  localUpdatedAt: string;
  remoteUpdatedAt: string;
  blocks: PreviewBlock[];
}

interface BlockSelection {
  method: BlockMethod;
  text?: string;
}

const SAMPLE_FILES: PreviewFile[] = [
  {
    path: "示例/项目方案.md",
    totalLines: 1218,
    localUpdatedAt: "2026-09-27T00:41:00+08:00",
    remoteUpdatedAt: "2026-09-26T23:58:00+08:00",
    blocks: [
      { line: 318, local: "先整理现有笔记，再逐步调整分类。", remote: "先完成分类规则，再批量整理现有笔记。" },
      { line: 742, local: "1. 检查重复笔记\n2. 确认链接\n3. 归档", remote: "1. 确认链接\n2. 归档\n3. 检查重复笔记" }
    ]
  },
  { path: "示例/阅读记录.md", totalLines: 864, localUpdatedAt: "2026-09-26T21:12:00+08:00", remoteUpdatedAt: "2026-09-27T00:18:00+08:00", blocks: [{ line: 205, local: "保留原文摘录，之后补充想法。", remote: "整理为三条要点，方便之后检索。" }] },
  { path: "示例/周会纪要.md", totalLines: 176, localUpdatedAt: "2026-09-27T00:22:00+08:00", remoteUpdatedAt: "2026-09-26T22:46:00+08:00", blocks: [{ line: 86, local: "周三完成初稿。", remote: "周五完成初稿，并邀请大家核对。" }] },
  {
    path: "示例/写作提纲.md",
    totalLines: 392,
    localUpdatedAt: "2026-09-26T20:30:00+08:00",
    remoteUpdatedAt: "2026-09-27T00:36:00+08:00",
    blocks: [
      { line: 34, local: "第一章从主人公的回忆开始。", remote: "第一章从一封来信开始。" },
      { line: 112, local: "结尾保留悬念。", remote: "结尾交代故事的时间线。" }
    ]
  },
  { path: "示例/工具清单.md", totalLines: 98, localUpdatedAt: "2026-09-26T23:44:00+08:00", remoteUpdatedAt: "2026-09-26T22:16:00+08:00", blocks: [{ line: 52, local: "- 本地备份：每周一次", remote: "- 本地备份：每天一次" }] },
  { path: "示例/日记.md", totalLines: 64, localUpdatedAt: "2026-09-26T19:50:00+08:00", remoteUpdatedAt: "2026-09-27T00:07:00+08:00", blocks: [{ line: 29, local: "今天先整理旧项目。", remote: "今天先完成新项目的准备。" }] },
  { path: "示例/分类规则.md", totalLines: 631, localUpdatedAt: "2026-09-27T00:29:00+08:00", remoteUpdatedAt: "2026-09-26T23:20:00+08:00", blocks: [{ line: 441, local: "待整理内容先放入收集箱。", remote: "待整理内容按主题直接归类。" }] },
  { path: "示例/旅行清单.md", totalLines: 82, localUpdatedAt: "2026-09-26T22:02:00+08:00", remoteUpdatedAt: "2026-09-27T00:25:00+08:00", blocks: [{ line: 63, local: "- 带充电器和雨伞", remote: "- 带充电器、雨伞和备用眼镜" }] }
];

export class SimpleSyncConflictPreviewModal extends Modal {
  private pending = new Set(SAMPLE_FILES.map((file) => file.path));
  private expandedPath?: string;
  private fileChoices = new Map<string, FileChoice>();
  private blockChoices = new Map<string, BlockSelection>();
  private appliedCount = 0;

  constructor(app: App) {
    super(app);
  }

  onOpen(): void {
    this.modalEl.addClass("simple-sync-preview-modal");
    this.render(false);
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private render(preserveScroll = true): void {
    const root = this.contentEl;
    const scrollTop = preserveScroll ? root.scrollTop : 0;
    root.empty();
    root.addClass("simple-sync-preview");

    const header = root.createDiv({ cls: "simple-sync-preview__header" });
    const heading = header.createDiv();
    heading.createDiv({ text: "界面预览 · 示例数据", cls: "simple-sync-preview__eyebrow" });
    heading.createEl("h2", { text: "处理文件差异" });
    const reset = header.createEl("button", { text: "重置示例" });
    reset.addEventListener("click", () => this.reset());

    root.createDiv({
      text: "仅演示界面和选择方式，不会修改笔记或执行同步。",
      cls: "simple-sync-preview__notice"
    });

    const toolbar = root.createDiv({ cls: "simple-sync-preview__toolbar" });
    toolbar.createSpan({ text: `待处理 ${this.pending.size} 个文件`, cls: "simple-sync-preview__count" });
    const bulk = toolbar.createDiv({ cls: "simple-sync-preview__bulk" });
    this.createButton(bulk, "全选最新", () => this.selectAll("latest"), "simple-sync-preview__bulk-choice");
    this.createButton(bulk, "全部选本机", () => this.selectAll("local"), "simple-sync-preview__bulk-choice is-local");
    this.createButton(bulk, "全部选 GitHub", () => this.selectAll("remote"), "simple-sync-preview__bulk-choice is-remote");
    this.createButton(bulk, "清空选择", () => {
      this.fileChoices.clear();
      this.blockChoices.clear();
      this.render();
    });

    if (this.appliedCount > 0) {
      root.createDiv({ text: `示例中已应用 ${this.appliedCount} 个，剩余 ${this.pending.size} 个待处理。`, cls: "simple-sync-preview__feedback" });
    }

    const list = root.createDiv({ cls: "simple-sync-preview__list" });
    for (const file of SAMPLE_FILES) {
      if (this.pending.has(file.path)) this.renderFile(list, file);
    }
    if (this.pending.size === 0) list.createDiv({ text: "示例文件已全部处理。可以点“重置示例”重新查看。", cls: "simple-sync-preview__empty" });

    const ready = this.getReadyFiles();
    const footer = root.createDiv({ cls: "simple-sync-preview__footer" });
    footer.createSpan({ text: `已选好 ${ready.length} 个 · 待处理 ${this.pending.size} 个` });
    const apply = footer.createEl("button", { text: `应用选择${ready.length > 0 ? ` (${ready.length})` : ""}`, cls: "mod-cta" });
    apply.disabled = ready.length === 0;
    apply.addEventListener("click", () => this.applyReadyFiles());
    root.scrollTop = scrollTop;
  }

  private renderFile(list: HTMLElement, file: PreviewFile): void {
    const expanded = this.expandedPath === file.path;
    const row = list.createDiv({ cls: "simple-sync-preview__file" });
    row.toggleClass("is-expanded", expanded);
    const summary = row.createDiv({ cls: "simple-sync-preview__summary" });
    const toggle = summary.createEl("button", { cls: "simple-sync-preview__toggle" });
    toggle.setAttr("aria-expanded", String(expanded));
    toggle.setAttr("aria-label", `${expanded ? "收起" : "展开"}${file.path}`);
    setIcon(toggle.createSpan({ cls: "simple-sync-preview__chevron" }), "chevron-right");
    const name = toggle.createSpan({ cls: "simple-sync-preview__name" });
    name.createSpan({ text: file.path, cls: "simple-sync-preview__path" });
    name.createSpan({ text: `${file.blocks.length} 处差异`, cls: "simple-sync-preview__meta" });
    const toggleFile = () => {
      this.expandedPath = expanded ? undefined : file.path;
      this.render();
    };
    summary.addEventListener("click", (event) => {
      if (event.target instanceof Element && event.target.closest(".simple-sync-preview__choice-control")) return;
      toggleFile();
    });

    const times = summary.createEl("button", { cls: "simple-sync-preview__times" });
    times.setAttr("aria-expanded", String(expanded));
    times.setAttr("aria-label", `${expanded ? "收起" : "展开"}${file.path}，本机与 GitHub 更新时间`);
    for (const [side, text, value] of [["local", "本机", file.localUpdatedAt], ["remote", "GitHub", file.remoteUpdatedAt]] as const) {
      const line = times.createSpan({ cls: "simple-sync-preview__time" });
      line.toggleClass("is-newer", this.latestSide(file) === side);
      line.createSpan({ text: `${text}更新` });
      const time = line.createEl("time", { text: this.formatTime(value) });
      time.setAttr("datetime", value);
    }
    const selected = this.fileChoices.get(file.path);
    const control = summary.createDiv({ cls: "simple-sync-preview__choice-control" });
    const selection = control.createEl("button", { text: this.fileStatus(file), cls: "simple-sync-preview__selection" });
    setIcon(selection.createSpan({ cls: "simple-sync-preview__selection-icon" }), "chevron-down");
    const tone = this.selectionTone(file);
    if (tone) selection.addClass(`is-${tone}`);
    selection.setAttr("aria-label", `${file.path}当前${this.fileStatus(file)}，点击选择最新、本机或 GitHub`);
    const segments = control.createDiv({ cls: "simple-sync-preview__segments" });
    for (const [choice, label] of [["latest", "最新"], ["local", "本机"], ["remote", "GitHub"]] as const) {
      const option = segments.createEl("button", { text: label, cls: `simple-sync-preview__segment is-${choice === "latest" ? this.latestSide(file) : choice}` });
      option.toggleClass("is-selected", selected === choice);
      option.setAttr("aria-label", `${file.path}选择${label}`);
      option.setAttr("aria-pressed", String(selected === choice));
      option.addEventListener("click", () => this.selectFile(file, choice));
    }
    selection.addEventListener("click", () => {
      segments.querySelector("button")?.focus();
    });
    if (expanded) this.renderBlocks(row, file);
  }

  private renderBlocks(row: HTMLElement, file: PreviewFile): void {
    const details = row.createDiv({ cls: "simple-sync-preview__details" });
    details.toggleClass("is-mixed", this.selectionTone(file) === "mixed");
    const headings = details.createDiv({ cls: "simple-sync-preview__block-headers" });
    headings.createSpan({ text: "差异", cls: "simple-sync-preview__block-heading" });
    headings.createSpan({ text: "本机区块", cls: "simple-sync-preview__block-heading" });
    headings.createSpan({ text: "Git 区块", cls: "simple-sync-preview__block-heading" });
    file.blocks.forEach((block, index) => {
      const key = this.blockKey(file.path, index);
      const wholeChoice = this.fileChoices.get(file.path);
      const selection: BlockSelection | undefined = this.blockChoices.get(key) ?? (wholeChoice ? { method: wholeChoice === "latest" ? this.latestSide(file) : wholeChoice } : undefined);
      const blockRow = details.createDiv({ cls: "simple-sync-preview__block" });
      const title = blockRow.createDiv({ cls: "simple-sync-preview__block-title" });
      const caption = title.createDiv({ cls: "simple-sync-preview__block-caption" });
      caption.createSpan({ text: `差异 ${index + 1} / ${file.blocks.length}` });
      caption.createSpan({ text: `约第 ${block.line} 行`, cls: "simple-sync-preview__line" });
      const merge = this.createButton(title, selection?.method === "merged" ? "取消合并" : "合并", () => this.toggleMerge(file, index), "simple-sync-preview__merge");
      merge.toggleClass("is-selected", selection?.method === "merged");
      merge.setAttr("aria-pressed", String(selection?.method === "merged"));

      if (selection?.method === "merged") {
        const result = blockRow.createDiv({ cls: "simple-sync-preview__result" });
        result.createDiv({ text: "合并结果 · 可直接编辑", cls: "simple-sync-preview__result-label" });
        const editor = result.createEl("textarea", { cls: "simple-sync-preview__editor" });
        editor.rows = Math.min(8, Math.max(4, (selection.text ?? "").split("\n").length + 1));
        editor.value = selection.text ?? "";
        editor.setAttr("aria-label", `${file.path}第 ${index + 1} 处最终内容`);
        editor.addEventListener("input", () => { selection.text = editor.value; });
      } else {
        this.renderSide(blockRow, "本机", block.local, "local", selection?.method === "local", () => this.selectBlock(file, index, "local"));
        this.renderSide(blockRow, "Git", block.remote, "remote", selection?.method === "remote", () => this.selectBlock(file, index, "remote"));
      }
    });
  }

  private renderSide(parent: HTMLElement, label: string, content: string, side: Side, selected: boolean, choose: () => void): void {
    const panel = parent.createEl("button", { cls: `simple-sync-preview__side is-${side}` });
    panel.toggleClass("is-selected", selected);
    panel.setAttr("aria-label", `采用${label}区块`);
    panel.setAttr("aria-pressed", String(selected));
    panel.createSpan({ text: content, cls: "simple-sync-preview__side-content" });
    panel.addEventListener("click", choose);
  }

  private createButton(parent: HTMLElement, label: string, action: () => void, className?: string): HTMLButtonElement {
    const button = parent.createEl("button", { text: label, cls: className });
    button.addEventListener("click", action);
    return button;
  }

  private blockKey(path: string, index: number): string {
    return `${path}:${index}`;
  }

  private latestSide(file: PreviewFile): Side {
    return Date.parse(file.localUpdatedAt) >= Date.parse(file.remoteUpdatedAt) ? "local" : "remote";
  }

  private selectionTone(file: PreviewFile): ChoiceTone | undefined {
    const whole = this.fileChoices.get(file.path);
    if (whole) return whole === "latest" ? this.latestSide(file) : whole;
    const methods = file.blocks.map((_, index) => this.blockChoices.get(this.blockKey(file.path, index))?.method);
    if (methods.some((method) => !method)) return undefined;
    return methods.every((method) => method === "local") ? "local" : methods.every((method) => method === "remote") ? "remote" : "mixed";
  }

  private formatTime(value: string): string {
    return new Date(value).toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
  }

  private fileStatus(file: PreviewFile): string {
    const whole = this.fileChoices.get(file.path);
    if (whole) return whole === "latest" ? `最新 · ${this.latestSide(file) === "local" ? "本机" : "GitHub"}` : whole === "local" ? "本机" : "GitHub";
    const chosen = file.blocks.filter((_, index) => this.blockChoices.has(this.blockKey(file.path, index))).length;
    return chosen === 0 ? "未决定" : chosen === file.blocks.length ? "区块已选好" : `已决定 ${chosen}/${file.blocks.length} 处`;
  }

  private selectFile(file: PreviewFile, choice: FileChoice): void {
    this.fileChoices.set(file.path, choice);
    for (let index = 0; index < file.blocks.length; index += 1) this.blockChoices.delete(this.blockKey(file.path, index));
    this.render();
  }

  private selectAll(choice: FileChoice): void {
    for (const file of SAMPLE_FILES) {
      if (this.pending.has(file.path)) {
        this.fileChoices.set(file.path, choice);
        for (let index = 0; index < file.blocks.length; index += 1) this.blockChoices.delete(this.blockKey(file.path, index));
      }
    }
    this.render();
  }

  private selectBlock(file: PreviewFile, index: number, method: BlockMethod): void {
    const key = this.blockKey(file.path, index);
    const previous = this.blockChoices.get(key);
    const block = file.blocks[index];
    const text = method === "merged"
      ? previous?.method === "merged" ? previous.text : `${block.local}\n\n${block.remote}`
      : undefined;
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

  private toggleMerge(file: PreviewFile, index: number): void {
    const key = this.blockKey(file.path, index);
    if (this.blockChoices.get(key)?.method === "merged") {
      this.blockChoices.delete(key);
      this.render();
      return;
    }
    this.selectBlock(file, index, "merged");
  }

  private getReadyFiles(): PreviewFile[] {
    return SAMPLE_FILES.filter((file) => this.pending.has(file.path) && (
      this.fileChoices.has(file.path) || file.blocks.every((_, index) => this.blockChoices.has(this.blockKey(file.path, index)))
    ));
  }

  private applyReadyFiles(): void {
    const ready = this.getReadyFiles();
    for (const file of ready) {
      this.pending.delete(file.path);
      this.fileChoices.delete(file.path);
      for (let index = 0; index < file.blocks.length; index += 1) this.blockChoices.delete(this.blockKey(file.path, index));
    }
    this.appliedCount += ready.length;
    if (this.expandedPath && !this.pending.has(this.expandedPath)) this.expandedPath = undefined;
    this.render(false);
  }

  private reset(): void {
    this.pending = new Set(SAMPLE_FILES.map((file) => file.path));
    this.expandedPath = undefined;
    this.fileChoices.clear();
    this.blockChoices.clear();
    this.appliedCount = 0;
    this.render(false);
  }
}
