// UpdateService.ts
import * as FileSystem from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import RNFetchBlob from 'react-native-blob-util';
import Toast from 'react-native-toast-message';
import { version as currentVersion } from '../package.json';
import { UPDATE_CONFIG } from '../constants/UpdateConfig';
import Logger from '@/utils/Logger';
import { Platform } from 'react-native';

const logger = Logger.withTag('UpdateService');

interface VersionInfo {
  version: string;
  downloadUrl: string;
  apkSize?: number;
}

/**
 * 只在 Android 平台使用的常量（iOS 不会走到下载/安装流程）
 */
const ANDROID_MIME_TYPE = 'application/vnd.android.package-archive';

class UpdateService {
  private currentDownloadResumable: FileSystem.DownloadResumable | null = null;
  async cancelCurrentDownload(): Promise<void> {
    if (!this.currentDownloadResumable) return;
    try {
      await this.currentDownloadResumable.pauseAsync();
    } catch (e) {
      logger.warn('cancelCurrentDownload failed', e);
    }
    this.currentDownloadResumable = null;
  }
  private static instance: UpdateService;
  static getInstance(): UpdateService {
    if (!UpdateService.instance) {
      UpdateService.instance = new UpdateService();
    }
    return UpdateService.instance;
  }

  /** --------------------------------------------------------------
   *  1️⃣ 远程版本检查
   * --------------------------------------------------------------- */
  async checkVersion(): Promise<VersionInfo> {
    if (!UPDATE_CONFIG) {
      logger.error('UPDATE_CONFIG is undefined');
      throw new Error('Update configuration is missing');
    }
    const maxRetries = 3;
    let pkgUrl = UPDATE_CONFIG.getGithubRawUrl();
    let sizeUrl = pkgUrl.replace('package.json', 'apksize.json');

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10_000);

        const [pkgRes, sizeRes] = await Promise.all([
          fetch(pkgUrl, { signal: controller.signal }),
          fetch(sizeUrl, { signal: controller.signal }).catch(() => null),
        ]);

        clearTimeout(timeoutId);

        if (!pkgRes.ok) {
          throw new Error(`HTTP ${pkgRes.status}`);
        }

        const remotePackage = await pkgRes.json();
        const remoteVersion = remotePackage.version as string;

        let apkSize: number | undefined;
        if (sizeRes && sizeRes.ok) {
          try {
            const sizeData = await sizeRes.json();
            apkSize = Number(sizeData.apksize);
          } catch (e) {
            logger.warn('解析 apksize.json 失败', e);
          }
        }

        return {
          version: remoteVersion,
          downloadUrl: UPDATE_CONFIG.getDownloadUrl(remoteVersion),
          apkSize,
        };
      } catch (e) {
        logger.warn(`checkVersion attempt ${attempt}/${maxRetries}`, e);
        if (attempt === maxRetries) {
          Toast.show({
            type: 'error',
            text1: '检查更新失败',
            text2: '无法获取版本信息，请检查网络',
          });
          throw e;
        }

        if (attempt === 1 && pkgUrl.startsWith('https://ghfast.top/https://')) {
          pkgUrl = pkgUrl.replace('https://ghfast.top/https://', 'https://');
          sizeUrl = sizeUrl.replace('https://ghfast.top/https://', 'https://');
          logger.warn('切换到直接 GitHub raw URL 进行更新检查');
        }

        await new Promise(r => setTimeout(r, 2_000 * attempt));
      }
    }
    throw new Error('Unexpected');
  }

  /** --------------------------------------------------------------
   *  2️⃣ 清理旧的 APK 文件
   * --------------------------------------------------------------- */
  private async cleanOldApkFiles(): Promise<void> {
    try {
      if (!FileSystem || !FileSystem.cacheDirectory) {
        logger.warn('FileSystem or cacheDirectory is not available');
        return;
      }
      const dirUri = FileSystem.cacheDirectory;
      const listing = await FileSystem.readDirectoryAsync(dirUri);
      const apkFiles = listing.filter(name => name.startsWith('SuperTV_v') && name.endsWith('.apk'));

      if (apkFiles.length <= 2) return;

      const sorted = apkFiles.sort((a, b) => {
        const numA = parseInt(a.replace(/[^0-9]/g, ''), 10);
        const numB = parseInt(b.replace(/[^0-9]/g, ''), 10);
        return numB - numA;
      });

      const stale = sorted.slice(2);
      for (const file of stale) {
        const path = `${dirUri}${file}`;
        try {
          await FileSystem.deleteAsync(path, { idempotent: true });
          logger.debug(`Deleted old APK: ${file}`);
        } catch (e) {
          logger.warn(`Failed to delete ${file}`, e);
        }
      }
    } catch (e) {
      logger.warn('cleanOldApkFiles error', e);
    }
  }

  /** --------------------------------------------------------------
   *  3️⃣ 下载 APK（支持多线程下载）
   * --------------------------------------------------------------- */
  async downloadApk(
    url: string,
    onProgress?: (written: number, total: number) => void,
    totalSize?: number
  ): Promise<string> {
    const maxRetries = 3;
    await this.cleanOldApkFiles();

    const timestamp = Date.now();
    const fileName = `SuperTV_v${timestamp}.apk`;
    const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
    const filePath = fileUri.replace('file://', '');

    // 尝试多线程下载 (4线程)
    if (totalSize && totalSize > 5 * 1024 * 1024) {
      try {
        logger.info(`Starting multi-threaded download for APK: ${url}, size: ${totalSize}`);
        const segments = 4;
        const segmentSize = Math.ceil(totalSize / segments);
        const parts: string[] = [];

        await Promise.all(
          Array.from({ length: segments }).map(async (_, i) => {
            const start = i * segmentSize;
            const end = i === segments - 1 ? totalSize - 1 : (i + 1) * segmentSize - 1;
            const partPath = `${filePath}.part${i}`;
            parts.push(partPath);

            await RNFetchBlob.config({ path: partPath })
              .fetch('GET', url, {
                Range: `bytes=${start}-${end}`,
                'User-Agent': 'SuperTV-Updater/1.0'
              });
          })
        );

        // 合并文件
        await RNFetchBlob.fs.createFile(filePath, '', 'utf8');
        for (const part of parts) {
          await RNFetchBlob.fs.appendFile(filePath, part, 'uri');
          await RNFetchBlob.fs.unlink(part);
        }

        if (onProgress) onProgress(totalSize, totalSize);
        return fileUri;
      } catch (e) {
        logger.warn('Multi-threaded download failed, falling back to standard download', e);
      }
    }

    // 标准下载回退
    let downloadResumable: FileSystem.DownloadResumable | null = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        let finalUrl = url;
        try {
          const probe = await fetch(url, { method: 'HEAD' });
          if (probe && probe.ok && probe.url) finalUrl = probe.url;
        } catch (e) {}

        const headers = {
          Accept: 'application/vnd.android.package-archive, application/octet-stream, */*',
          'User-Agent': 'SuperTV-Updater/1.0',
        };

        downloadResumable = FileSystem.createDownloadResumable(
          finalUrl,
          fileUri,
          { headers },
          progress => {
            if (onProgress) {
              onProgress(progress.totalBytesWritten, progress.totalBytesExpectedToWrite);
            }
          },
        );
        this.currentDownloadResumable = downloadResumable;

        const result = await downloadResumable.downloadAsync();
        this.currentDownloadResumable = null;
        if (result && result.uri) {
          logger.debug(`APK downloaded to ${result.uri}`);
          return result.uri;
        } else {
          throw new Error('Download failed: No URI available');
        }
      } catch (e) {
        this.currentDownloadResumable = null;
        logger.warn(`downloadApk attempt ${attempt}/${maxRetries}`, e);
        if (attempt === maxRetries) throw e;
        await new Promise(r => setTimeout(r, 3_000 * attempt));
      }
    }
    throw new Error('Download failed');
  }

  /** --------------------------------------------------------------
   *  4️⃣ 安装 APK
   *  Android 14+ 专用修复：优先使用 ACTION_INSTALL_PACKAGE，
   *  并确保 FLAG_GRANT_READ_URI_PERMISSION 正确传递
   * --------------------------------------------------------------- */
  async installApk(fileUri: string): Promise<void> {
    try {
      const exists = await FileSystem.getInfoAsync(fileUri);
      if (!exists.exists) {
        throw new Error(`安装包文件不存在: ${fileUri}`);
      }

      if (Platform.OS === 'android') {
        const contentUri = await FileSystem.getContentUriAsync(fileUri);

        // Intent flags:
        // FLAG_ACTIVITY_NEW_TASK      = 0x10000000
        // FLAG_GRANT_READ_URI_PERMISSION = 0x00000001
        // FLAG_ACTIVITY_CLEAR_TOP    = 0x04000000
        const installFlags = 0x10000000 | 0x00000001 | 0x04000000;

        // Android 14+ (API 34) 优先使用 ACTION_INSTALL_PACKAGE
        const isAndroid14OrAbove = Platform.Version >= 34;
        const primaryAction = isAndroid14OrAbove
          ? 'android.intent.action.INSTALL_PACKAGE'
          : 'android.intent.action.VIEW';

        // 若 Android 14+ 尝试 ACTION_INSTALL_PACKAGE 失败，再回退到 ACTION_VIEW
        try {
          await IntentLauncher.startActivityAsync(primaryAction as any, {
            data: contentUri,
            type: ANDROID_MIME_TYPE,
            flags: installFlags,
          });
          logger.info(`[Install] APK install intent sent: ${primaryAction}`);
        } catch (launcherError) {
          logger.warn(`[Install] Primary action failed (${primaryAction}), trying fallback`, launcherError);
          // 尝试另一个 action
          const fallbackAction = isAndroid14OrAbove
            ? 'android.intent.action.VIEW'
            : 'android.intent.action.INSTALL_PACKAGE';
          await IntentLauncher.startActivityAsync(fallbackAction as any, {
            data: contentUri,
            type: ANDROID_MIME_TYPE,
            flags: installFlags,
          });
        }
      } else {
        throw new Error('当前平台不支持 APK 安装');
      }
    } catch (e: any) {
      logger.error('installApk error', e);
      Toast.show({
        type: 'error',
        text1: '无法唤起安装程序',
        text2: e.message || '请手动在文件管理器中安装',
      });
      throw e;
    }
  }

  compareVersions(v1: string, v2: string): number {
    const p1 = v1.split('.').map(Number);
    const p2 = v2.split('.').map(Number);
    for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
      const n1 = p1[i] ?? 0;
      const n2 = p2[i] ?? 0;
      if (n1 > n2) return 1;
      if (n1 < n2) return -1;
    }
    return 0;
  }
  getCurrentVersion(): string {
    return currentVersion;
  }
  isUpdateAvailable(remoteVersion: string): boolean {
    return this.compareVersions(remoteVersion, currentVersion) > 0;
  }
}

export default UpdateService.getInstance();
