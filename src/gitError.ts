function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function isTransientGitNetworkError(error: unknown): boolean {
  return /timed? out|timeout|schannel|ssl|tls|could not resolve host|failed to connect|connection (?:was )?(?:reset|closed)|network is unreachable|unable to access/i.test(
    messageOf(error)
  );
}

export function isUncertainGitAuthError(error: unknown): boolean {
  return /the token in (?:keyring|default) is invalid/i.test(messageOf(error));
}

export function isMissingRemoteRefError(error: unknown): boolean {
  return /couldn.t find remote ref/i.test(messageOf(error));
}

export function describeGitError(error: unknown): string {
  const message = messageOf(error);
  if (isUncertainGitAuthError(message)) {
    return `GitHub 认证状态检查失败（暂不能确认 Token 已失效，可能是网络或系统凭据暂时不可用）：${message}`;
  }
  if (
    /authentication failed|could not read username|http (?:401|403)|access denied|permission denied|repository not found/i.test(
      message
    )
  ) {
    return `认证失败：${message}`;
  }
  if (isTransientGitNetworkError(message)) return `与 GitHub 网络连接失败：${message}`;
  return message;
}
