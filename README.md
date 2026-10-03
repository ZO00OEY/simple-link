# Simple Link

Simple Link synchronizes an Obsidian vault using Git on desktop, the GitHub API on mobile, or a compatible sync server. It includes guided setup, change previews, and conflict resolution. The current settings interface is in Chinese.

## Installation

Requires Obsidian 1.7.2 or later on Windows, macOS, Linux, Android, or iOS.

### Community plugins

Once the directory review is complete, open **Settings → Community plugins → Browse**, search for **Simple Link**, then select **Install** and **Enable**.

### Manual installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the same stable [GitHub release](https://github.com/ZO00OEY/simple-one-sync/releases/latest).
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

## Documentation

For the full Chinese guide and release history, see [中文说明](README.zh-CN.md).

## Release 0.2.4

- Provide the default README in English, including installation and usage instructions.
- Preserve the complete Chinese guide in README.zh-CN.md.
- Use an English manifest description with final punctuation.
