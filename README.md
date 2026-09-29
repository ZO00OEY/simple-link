# Simple Link

这是与 `simple-one` 分离的跨设备同步插件。插件 ID 为 `simple-link`，显示名称为 Simple Link。原本机版 `simple-one-sync` 的界面与同步内核已迁入此插件。

## 平台行为

- iPhone / Android：填写 Zoey Notes Server 地址与认证密码，插件记录文件变更并与服务器同步，同时轮询并展示服务器指令。
- Windows / macOS / Linux：填写 Git Remote、分支和 Git Author，直接使用本机 Git 与 GitHub 同步。
- 桌面认证默认让单次 Git 命令调用已登录的 GitHub CLI 取凭据，不改系统 Git 配置；也可使用 Author 认证 Key / Personal Access Token。
- 私有 Git 仓库的 Fetch/Push 都需要有效凭据，不能在未登录时匿名拉取。GitHub 凭据检查的“Token 无效”提示也可能来自暂时无法访问网络或系统钥匙串；插件会先重试，并在日志中保留原始错误供排查。

## 当前安全边界

- 服务器公网地址必须是 HTTPS；只有 localhost 允许 HTTP。
- 私密 Vault 仓库可以追踪 `.obsidian/plugins/simple-link/data.json`；公开插件仓库及发布包不包含此文件。
- 可跨设备同步的非敏感设置单独保存在 `sync-settings.json`；Token、密码、设备状态、界面状态和日志保存在私密 Vault 的 `data.json`。
- Token 不会被拼进 Git Remote URL，只传给单次 Git 子进程。
- 服务器下发指令只支持提示、触发同步和打开 Vault 内文件，不执行任意 Shell 命令。

## 异常修复

「设备同步」按当前平台在对应入口右侧显示「系统识别 · 当前设备」标记，并禁用其他平台入口。电脑端的「电脑端 Git 同步」分为「接入引导」和「高级设置」两个标签页；高级设置首行提示「通常不需要修改」，同步操作位于插件的同步面板。向导按四步接入私人 GitHub 仓库：安装与授权、选择仓库、检查本地与远端、完成接入并首次推送。Gitee 目前只显示未兼容提示。第 3 步会比较两端文件和 Git 历史；需要时只获取提交对象，不修改工作文件。已有 `.gitignore` 会逐条补充缺失的建议规则。

如果现有或待补的忽略规则命中仍被 Git 跟踪的文件，第 3 步列出清单并要求选择保留追踪或重建追踪；没有命中项时仍可主动选择重建，作为纠错兜底。重建需在第 4 步再次确认：先用 `git rm -r -f --cached` 取消整个索引的追踪，再按最终 `.gitignore` 用 `git add -A` 重新逐文件加入，最后跳过正在编辑的插件改动并核验没有被忽略文件留在索引中。本机文件保留；推送后被忽略文件从远端当前版本移除，旧提交历史仍保留。进入向导期间自动 Git 操作暂停。

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
