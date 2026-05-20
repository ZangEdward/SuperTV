export const UPDATE_CONFIG = {
  // 自动检查更新
  AUTO_CHECK: true,

  // 检查更新间隔（毫秒）
  CHECK_INTERVAL: 12 * 60 * 60 * 1000, // 12小时

  // 同步仓库名（通过构建时环境变量注入，避免泄露）
  SYNC_REPO: process.env.EXPO_PUBLIC_SYNC_REPO || '',

  // GitHub原始文件URL（函数形式，避免直接暴露仓库名）
  getGithubRawUrl(): string {
    const repo = process.env.EXPO_PUBLIC_SYNC_REPO || '';
    return `https://ghfast.top/https://raw.githubusercontent.com/${repo}/refs/heads/main/log/vision/package.json?t=${Date.now()}`;
  },

  // 获取平台特定的下载URL
  getDownloadUrl(version: string): string {
    const repo = process.env.EXPO_PUBLIC_SYNC_REPO || '';
    return `https://ghfast.top/https://github.com/${repo}/releases/download/v${version}/SuperTV-${version}.apk`;
  },

  // 是否显示更新日志
  SHOW_RELEASE_NOTES: true,

  // 是否允许跳过版本
  ALLOW_SKIP_VERSION: true,

  // 下载超时时间（毫秒）
  DOWNLOAD_TIMEOUT: 10 * 60 * 1000, // 10分钟

  // 是否在WIFI下自动下载
  AUTO_DOWNLOAD_ON_WIFI: false,

  // 更新通知设置
  NOTIFICATION: {
    ENABLED: true,
    TITLE: "SuperTV 更新",
    DOWNLOADING_TEXT: "正在下载新版本...",
    DOWNLOAD_COMPLETE_TEXT: "下载完成，点击安装",
  },
};
