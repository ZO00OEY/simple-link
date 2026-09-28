# Simple Link

**Simple Link** synchronizes an Obsidian vault across devices using Git on desktop and a compatible sync server on mobile.

**Simple Link** lets you synchronize an Obsidian vault across devices. It uses Git on desktop and a compatible sync server on mobile.

## Features

- **Desktop Git sync:** review local changes, create commits, fetch and push to a GitHub repository, and resolve merge conflicts.
- **Setup wizard:** check the local vault and remote repository before the first push. Choose how to handle conflicting files and optionally rebuild Git tracking from `.gitignore` rules.
- **Mobile sync:** send and receive vault changes through a compatible Simple Link API v1 server.
- **Privacy controls:** credentials and device state are stored in Obsidian's local plugin data. The project does not include personal connection settings or credentials.

## Requirements

- **Desktop:** Git installed on the computer. GitHub CLI is optional; you can also provide a GitHub token. The setup wizard currently verifies GitHub repositories.
- **Mobile:** a separately hosted server that implements the Simple Link API v1. The server is not included in this repository. Use HTTPS for public servers; HTTP is accepted only for localhost.
- **Obsidian:** version 1.5.0 or newer.

## Install

After the plugin is accepted into the Obsidian Community directory, install **Simple Link** from **Settings → Community plugins → Browse**. Until then, install it manually by placing `main.js`, `manifest.json`, and `styles.css` in `.obsidian/plugins/simple-link/` and enabling it in Obsidian.

## First-time setup

1. Install Git on desktop and connect a GitHub account with permission to access the target repository.
2. Select or create a private GitHub repository in Simple Link's desktop setup guide.
3. Review the local and remote file summary and resolve any same-name file choices.
4. Confirm the author name and email used in Git commits, then complete the first push.
5. On mobile, enter the URL and password for your compatible Simple Link API v1 server.

Git tracking rebuild uses the final `.gitignore` rules to reset the current index. Files that become ignored stop being tracked in the new commit, but this does **not** erase them from older Git history. Back up your repository before choosing this option if you are unsure.

## Privacy and data handling

- Simple Link does not bundle a server URL, repository URL, account email, access token, or personal vault settings.
- On desktop, files selected by your Git tracking rules are committed to and synchronized with the Git remote you configure.
- On mobile, changed vault file content and paths are sent to the server URL you configure. Only connect to a server you trust.
- GitHub authorization tokens, server passwords, device identifiers, and local sync state are kept in Obsidian's local plugin data and are not included in this repository.
- The plugin does not contain a third-party analytics endpoint.

## Build and test

```sh
npm install
npm run build
npm test
```

## 中文说明

Simple Link 用于在多台设备间同步 Obsidian Vault：电脑端通过 Git 同步，手机端连接兼容的同步服务器。

### 功能

- **电脑端 Git 同步：**查看本地改动、创建提交、与 GitHub 仓库 Fetch/Push，并处理合并冲突。
- **接入向导：**首次推送前检查本地与远端仓库，选择同名文件的处理方式；还可按 `.gitignore` 规则重建 Git 追踪。
- **手机端同步：**通过兼容 Simple Link API v1 的服务器收发 Vault 改动。
- **隐私设置：**凭据和设备状态保存在 Obsidian 本机插件数据中；本仓库不包含个人连接设置或凭据。

### 使用要求

- **电脑端：**需要在电脑上安装 Git。GitHub CLI 是可选项，也可以填写 GitHub Token。当前接入向导会核验 GitHub 仓库。
- **手机端：**需要自行部署兼容 Simple Link API v1 的服务器。本仓库不包含服务器程序。公网服务器须使用 HTTPS；仅 localhost 可使用 HTTP。
- **Obsidian：**版本 1.5.0 或更高。

### 安装

插件通过 Obsidian 社区目录审核后，可在 **设置 → 第三方插件 → 浏览** 中搜索并安装 **Simple Link**。审核完成前，也可手动将 `main.js`、`manifest.json` 和 `styles.css` 放入 `.obsidian/plugins/simple-link/`，然后在 Obsidian 中启用。

### 首次设置

1. 在电脑上安装 Git，并授权一个有目标仓库访问权限的 GitHub 账号。
2. 在 Simple Link 的电脑端接入向导中选择或创建私人 GitHub 仓库。
3. 检查本地与远端文件摘要，并处理同名文件。
4. 确认 Git 提交使用的作者名称和邮箱，然后完成首次推送。
5. 在手机端填写兼容 Simple Link API v1 服务器的地址和密码。

按 `.gitignore` 重建追踪会依据最终规则重置当前 Git 索引。新提交中，被忽略的文件将停止追踪，但**不会从较早的 Git 历史记录中删除**。不确定时，请先备份仓库。

### 隐私与数据处理

- Simple Link 不附带服务器地址、仓库地址、账号邮箱、访问 Token 或个人 Vault 设置。
- 电脑端会把 Git 追踪规则选中的文件提交并同步到你配置的 Git 远端。
- 手机端会把发生变化的 Vault 文件内容和路径发送到你配置的服务器。请只连接你信任的服务器。
- GitHub 授权 Token、服务器密码、设备标识和本地同步状态保存在 Obsidian 本机插件数据中，不包含在本仓库里。
- 插件不包含第三方分析服务地址。

### 构建与测试

```sh
npm install
npm run build
npm test
```
