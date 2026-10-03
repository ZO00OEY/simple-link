# Simple Link

Simple Link synchronizes an Obsidian vault using Git on desktop, the GitHub API on mobile, or a compatible sync server. It includes guided setup, change previews, and conflict resolution. The current settings interface is in Chinese.

## Installation

Requires Obsidian 1.7.2 or later on Windows, macOS, Linux, Android, or iOS.

### Community plugins

Once the directory review is complete, open **Settings → Community plugins → Browse**, search for **Simple Link**, then select **Install** and **Enable**.

### Manual installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the same stable [GitHub release](https://github.com/ZO00OEY/simple-link/releases/latest).
2. Create a `plugins/simple-link` folder inside your vault's configuration directory (`.obsidian` by default, or the custom directory you configured).
3. Copy the three release files into that folder. Keep existing configuration and sync state files when upgrading.
4. Reload Obsidian and enable **Simple Link** in **Settings → Community plugins**. If you disabled community plugins, enable them first.

## Usage

Back up your vault and try synchronization with a test vault first. Mobile synchronization and background behavior still require validation on real devices.

- **Desktop Git:** Install Git and authenticate with GitHub. Open **Settings → Simple Link → 电脑端 Git 同步** and follow the setup wizard to select a repository and branch, review both sides, and confirm the first sync.
- **Mobile GitHub API:** Open the mobile setup guide, select GitHub API mode, and enter your token, repository HTTPS URL, and branch. Verify the connection, review the synchronization scope, and confirm the first sync. This mode does not require local Git.
- **Compatible server:** Configure the server address and credentials in the server setup page. Public server addresses must use HTTPS; HTTP is allowed only for localhost.
- Review changes in the sync panel. Resolve conflicting files or deletion choices before confirming synchronization. Canceling a preview does not apply those changes.
- Automatic synchronization is off by default. Mobile operating systems may suspend background work.

Credentials, device configuration, and synchronization state are stored locally. Do not upload `data.json`, `link-state.json`, recovery files, or `mobile-ignore.json` to a public repository or release.

## 0.2.3 更新说明

- 按社区插件要求提供英文简介、安装步骤与基本使用说明，保留原有中文文档。
- 将插件描述改为以英文句号结尾的英文说明。
- 正式发布包仍包含 `main.js`、`manifest.json`、`styles.css`。

## 中文说明

## 手机 GitHub API 与 Link Diff（2026-10-01）

手机可以选择 GitHub API 或原服务器模式。API 模式无需本机 Git：填写 Token、仓库 HTTPS 地址和分支，核验后确认同步范围，再绑定与首次同步。电脑端可在设置顶部关闭原生 Git，并开启「在电脑运行手机端轻量同步」，按照相同引导配置与实际执行 API 同步。两个引擎互斥，模式选择仅保存在本机；关闭轻量模式不会自动恢复原生 Git，需要手动开启。此方式可核对同步逻辑，手机性能与后台行为仍需真实设备确认。

- **首次接入**：“完成接入并启用同步”会打开首次双向同步审核。空库下载云端内容；两端均有文件时合并单侧文件，同名不同内容由用户选择。取消或失败不会宣告接入完成，保留连接便于继续同步。
- **Base**：共同基准 commit SHA，以及同步范围内的路径／blob SHA 清单。只有实际同步应用完成后才保存基准；两端原本一致时也会建立基准，不制造多余提交。同路径、同内容的文件自动认定一致，不进入确认列表；不同路径同内容仍确认保留路径。首次无基准时，仅本机或仅云端存在的文件先确认同步方向，选择后才列为上传、下载或删除。随后更新对齐后的本地哈希缓存；缓存关闭时不保留哈希缓存。改名／移动映射保存在本机 `link-state.json`，后续与云端 Compare 变化一起参与三方取舍。
- **Cached → Current**：缓存记录哈希、修改时间、大小、创建时间和核对时间。仅在同步流程中扫描目录并重算候选文件，不定时检查哈希；侧栏刷新只使用内存文件列表、已有缓存和事件记录。检查完成即保存本地缓存，取消预览或同步失败后仍可供重试复用；共同基准仅在同步完成后更新。关闭缓存后，同步时实时计算全范围哈希。手动完整校验不改变共同基准。同批下载中相同 blob 复用已校验的本地副本，减少重复 API 请求。
- **Path Changes → Link Diff**：Path 只保存移动／重命名映射（`moves`），不记录复制、创建和删除。复制件属于独立的新文件，由 Link Diff 按新增识别；之后的改名／移动正常追踪。连续移动折叠为原路径到最终路径，文件及目录移动后再编辑仍能关联基准身份。本地缺少路径事件时不凭相同哈希推断移动；远端仍使用 GitHub Compare 的重命名信息和无歧义的哈希匹配。旧状态加载时去掉删除标记与复制来源，保留基准和移动关系；成功对齐后清理本轮关系。可关闭路径追踪。同一路径删除后重建仍按最终路径和内容比较，不保存删除／创建历史。
- **远端变化**：已知基准时用 Compare 核对历史和重命名；远端 commit 与基准相同且范围未变时复用基准清单。远端 commit 变化或同步范围改变时获取完整 tree，准确验证文件属性。递归 tree 截断时分目录获取，未补齐不推断删除。
- **Merge**：按基准身份关联本地和远端变化，分别判断路径与内容。双方内容不同、删除与修改、双方不同目标路径交给预览页选择。相同目标被不同文件占用时停止，要求先调整文件名。不会直接采用未经确认的逐行合并；同步发现待选择项目时直接打开差异处理；整文件按钮固定显示，单边文件展开只查看正文，双方文本差异才支持逐块选择或编辑。轻量审核在右侧同步栏内分页显示，采用紧凑卡片及正文上下排列；路径不同才在展开后显示路径。单边文件统一选择保留／删除文件，按钮方向与颜色始终固定：左侧主题成功绿以本机为准，右侧天蓝以云端为准，柔紫表示混合选择；保留／删除只改变名称，不调换位置。实际同步方向不变。先确认文件存在或路径差异，再确认内容差异；文件环节支持“全部保留”，批量选择仅作用于当前环节，可返回修改文件选择。所有项目选好后点击“确认同步”，重新核对状态后直接执行，不再弹出第二次确认；取消或选择期间两端状态变化时不执行。没有待选择差异时，点击同步直接检查并执行。
- **执行**：上传先复用已有 blob；小文本按序列化字节数分批创建 tree，二进制逐个上传。最后生成一个以远端最新 commit 为父版本的真实 commit，非强制更新分支。远端提交及本地应用完成后推进共同基准；中断事务留在本机，下次先核对远端再恢复。预览后两端变化需要重新预览。
- **范围**：默认同步图片；关闭时红色“慎”提示并过滤常见图片扩展名。默认不同步插件；开启后只同步勾选插件的程序文件，不同步插件 data.json 或其他 Obsidian 设备配置。Simple Link 自身也可勾选，同步程序、源码及资源文件；本机 data.json、link-state.json、恢复／备份副本和 mobile-ignore.json 始终排除。下载自身程序更新后提示重载，不在同步事务中自动重启。排除文件保留远端，不解释为删除；扩大范围重新配对新增文件。
- **设备状态**：mobile 配置只写本机 data.json；link-state.json 保存基准、缓存、路径及事务，link-state.json.recovery 保存恢复副本；mobile-ignore.json 展示本机生成规则。这些本机状态文件不由手机同步器上传。Token 不进入共享配置，日志不打印 Token。
- **定时限制**：手机后台可能暂停任务。自动同步默认关闭；开启后遇到首次配对、冲突或删除仍等待手动确认。

构建及模拟 Android/iOS 浏览器运行测试已通过，真实设备同步及 UI 截图仍需用户确认。不要把“属性未变”视为内容绝对未变；外部工具保留大小与时间时需手动完整校验。

这是与 `simple-one` 分离的跨设备同步插件。插件 ID 为 `simple-link`，显示名称为 Simple Link。原本机版 `simple-one-sync` 的界面与同步内核已迁入此插件。

## 0.2.2 手机同步更新（已转为正式 Release）

- GitHub API 轻量同步支持 Android、iOS 及桌面试用；无共同基准时按文件树核对，后续使用共同基准处理修改、删除与移动。
- 轻量同步在右侧栏分为文件差异、内容差异两页确认；长内容独立滚动，选择保留，确认后重新核对两端状态。
- 侧栏刷新只读取内存候选，不进行后台哈希扫描；哈希核验随同步执行。修复隐藏文件被误报为删除候选的问题。
- 构建与自动化测试通过；Android、iOS 真机体验仍需验证，建议先在测试库使用。
- 安装附件：`main.js`、`manifest.json`、`styles.css`；不包含本机配置、凭据或同步状态。

## 0.2.1 更新说明

- 优化电脑端接入引导的“两端文件”检查：用摘要展示文件数量，并明确说明 Git 忽略规则何时补齐、已追踪文件何时需要重建追踪。
- 在电脑端 Git 同步高级设置中加入“检查并修复文件追踪”。先预览缺失规则和将停止追踪的文件，再按确认的清单修复；本机文件与 Git 历史保留，操作不会立即 Commit 或 Push。
- 将 Simple Link 的 `data.json` 作为本机状态加入推荐忽略规则，减少同步时间与日志造成的冲突。嵌套插件仓库的私人设置文件（如 Simple One 的 `data.json`）仍可由私人 Vault 追踪。
- 整理修复弹窗的标题、说明和文件列表字号与颜色。

## 平台行为

- iPhone / Android：可使用 GitHub API 轻量同步（无需本机 Git），或连接 Zoey Notes Server 并轮询服务器指令。
- Windows / macOS / Linux：填写 Git Remote、分支和 Git Author，直接使用本机 Git 与 GitHub 同步。
- 桌面认证默认让单次 Git 命令调用已登录的 GitHub CLI 取凭据，不改系统 Git 配置；也可使用 Author 认证 Key / Personal Access Token。
- 私有 Git 仓库的 Fetch/Push 都需要有效凭据，不能在未登录时匿名拉取。GitHub 凭据检查的“Token 无效”提示也可能来自暂时无法访问网络或系统钥匙串；插件会先重试，并在日志中保留原始错误供排查。

## 当前安全边界

- 服务器公网地址必须是 HTTPS；只有 localhost 允许 HTTP。
- 私密 Vault 仓库也应忽略 `.obsidian/plugins/simple-link/data.json`，避免同步本机日志、时间和设备状态；公开插件仓库及发布包不包含此文件。
- 可跨设备同步的非敏感设置单独保存在 `sync-settings.json`；Token、密码、设备状态、界面状态和日志保存在私密 Vault 的 `data.json`。
- Token 不会被拼进 Git Remote URL，只传给单次 Git 子进程。
- 服务器下发指令只支持提示、触发同步和打开 Vault 内文件，不执行任意 Shell 命令。

## 异常修复

「设备同步」按当前平台在对应入口右侧显示「系统识别 · 当前设备」标记，并禁用其他平台入口。电脑端的「电脑端 Git 同步」分为「接入引导」和「高级设置」两个标签页；高级设置首行提示「通常不需要修改」，同步操作位于插件的同步面板。向导按四步接入私人 GitHub 仓库：安装与授权、选择仓库、检查本地与远端、完成接入并首次推送。Gitee 目前只显示未兼容提示。第 3 步会比较两端文件和 Git 历史；需要时只获取提交对象，不修改工作文件。已有 `.gitignore` 会逐条补充缺失的建议规则。

如果现有或待补的忽略规则命中仍被 Git 跟踪的文件，第 3 步列出清单并要求选择保留追踪或重建追踪。重建需在第 4 步再次确认：先用 `git rm -r -f --cached` 取消整个索引的追踪，再按最终 `.gitignore` 用 `git add -A` 重新逐文件加入，最后跳过正在编辑的插件改动并核验没有被忽略文件留在索引中。本机文件保留；推送后被忽略文件从远端当前版本移除，旧提交历史仍保留。进入向导期间自动 Git 操作暂停。

已完成接入的电脑端可在高级设置中单独运行“检查并修复文件追踪”：它补齐缺失的推荐规则，并只让预览清单中的文件退出 Git 跟踪。嵌套插件公开仓库自身的 `.gitignore` 不会使私人 Vault 中需要同步的 `data.json` 自动退出追踪。

高级设置的“故障排查”中提供“异常修复”。它处理未完成的 Rebase、Merge、Cherry-pick 或 Revert：保护并恢复当前本机内容，退出异常操作，重新建立本地 Commit，然后 Fetch 并 Merge 云端版本；如有内容冲突，交给右侧冲突面板选择。修复不会立即 Push。内部临时备份会在成功恢复后自动清理；如果恢复失败，则保留备份并暂停自动 Git 操作。

Merge 冲突不会因为关闭右侧面板而取消或回滚。关闭只会暂时收起处理界面，已能合并的内容和剩余冲突都会保留；同步面板持续显示“合并冲突等待处理”，直到用户点击“继续处理”并完成全部冲突。等待期间自动 Commit、Merge 和 Push 会暂停。

桌面端 Fetch/Merge 失败后按设置的自动检查间隔再次运行；Push 失败后 5 分钟重试。待人工处理的 Git 冲突不会盲目重试。重启插件时会分别检查未 Commit 文件和领先远端的未 Push Commit，并恢复各自的计时。每次成功的 Fetch 检查和 Push 都写入日志，包括没有新提交或无需上传的情况。成功和失败记录都可展开，对比使用的凭据路径、`fetch`、`merge`、`push` 步骤及耗时；正常同步不再先执行一次 `ls-remote`。旧日志不会补出当时未保存的步骤。日志保留最近 24 小时，最多 500 条。

自动 Commit 只负责本地快照；自动 Push 的一小时上限从最早待上传 Commit 开始计时。自动 Push 到点时会先 Commit 当前可安全提交的更改，跳过仍在编辑的文件及其插件目录，再 Fetch、按需 Merge 并 Push；Push 失败后的重试也会重新检查待 Commit 文件。跳过的文件停止修改后留待下一轮提交。

## 构建

```powershell
npm install
npm run build
```

构建通过后，可在 Obsidian 社区插件中启用 `Simple Link`。涉及界面和真实同步的最终确认，需要在 Obsidian 与手机上实际验证。
