// UpdateService.ts
import * as FileSystem from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
// import * as Device from 'expo-device';
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
   *  1️⃣ 远程版本检查（保持不变，只是把 fetch 包装成 async/await）
   * --------------------------------------------------------------- */
  async checkVersion(): Promise<VersionInfo> {
    if (!UPDATE_CONFIG) {
      logger.error('UPDATE_CONFIG is undefined');
      throw new Error('Update configuration is missing');
    }
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10_000);

        // 并行获取 package.json 和 apksize.json
        const pkgUrl = UPDATE_CONFIG.GITHUB_RAW_URL;
        const sizeUrl = pkgUrl.replace('package.json', 'apksize.json');

        const [pkgRes, sizeRes] = await Promise.all([
          fetch(pkgUrl, { signal: controller.signal }),
          fetch(sizeUrl, { signal: controller.signal }).catch(() => null)
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
            // 根据用户提供的生成方式，字段名为 apksize
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
        // 指数退避
        await new Promise(r => setTimeout(r, 2_000 * attempt));
      }
    }
    // 这句永远走不到，仅为 TypeScript 报错
    throw new Error('Unexpected');
  }

  /** --------------------------------------------------------------
   *  2️⃣ 清理旧的 APK 文件（使用 expo-file-system 的 API）
   * --------------------------------------------------------------- */
  private async cleanOldApkFiles(): Promise<void> {
    try {
      if (!FileSystem || !FileSystem.documentDirectory) {
        logger.warn('FileSystem or documentDirectory is not available');
        return;
      }
      const dirUri = FileSystem.documentDirectory;
      const listing = await FileSystem.readDirectoryAsync(dirUri);
      const apkFiles = listing.filter(name => name.startsWith('OrionTV_v') && name.endsWith('.apk'));

      if (apkFiles.length <= 2) return;

      const sorted = apkFiles.sort((a, b) => {
        const numA = parseInt(a.replace(/[^0-9]/g, ''), 10);
        const numB = parseInt(b.replace(/[^0-9]/g, ''), 10);
        return numB - numA; // 倒序（最新在前）
      });

      const stale = sorted.slice(2); // 保留最新的两个
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
   *  3️⃣ 下载 APK（使用 expo-file-system 的下载 API）
   * --------------------------------------------------------------- */
  async downloadApk(
    url: string,
    onProgress?: (written: number, total: number) => void,
  ): Promise<string> {
    const maxRetries = 3;
    await this.cleanOldApkFiles();

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const timestamp = Date.now();
        const fileName = `OrionTV_v${timestamp}.apk`;
        const fileUri = `${FileSystem.documentDirectory}${fileName}`;

        // Try to resolve the final download URL (follow redirects) and validate headers
        let finalUrl = url;
        try {
          const probe = await fetch(url, { method: 'GET' });
          if (probe && probe.ok && probe.url) {
            finalUrl = probe.url;
          }
        } catch (e) {
          logger.warn('Failed to probe download URL, proceeding with original URL', e);
        }

        const headers = {
          Accept: 'application/vnd.android.package-archive, application/octet-stream, */*',
          // Some proxies (like GitHub raw proxies) may require a UA
          'User-Agent': 'SuperTV-Updater/1.0',
        };

        const downloadResumable = FileSystem.createDownloadResumable(
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
        try {
          await FileSystem.deleteAsync(fileUri, { idempotent: true });
        } catch (cleanupError) {
          logger.warn('cleanup failed after download error', cleanupError);
        }
        logger.warn(`downloadApk attempt ${attempt}/${maxRetries}`, e);
        if (attempt === maxRetries) {
          Toast.show({
            type: 'error',
            text1: '下载失败',
            text2: 'APK 下载出现错误，请检查网络',
          });
          throw e;
        }
        // 指数退避
        await new Promise(r => setTimeout(r, 3_000 * attempt));
      }
    }
    // 同上，理论不会到这里
    throw new Error('Download failed');
  }

  /** --------------------------------------------------------------
   *  4️⃣ 安装 APK（只在 Android 可用，使用 expo-intent-launcher）
   * --------------------------------------------------------------- */
  async installApk(fileUri: string): Promise<void> {
    try {
      // ① 先确认文件存在
      const exists = await FileSystem.getInfoAsync(fileUri);
      if (!exists.exists) {
        throw new Error(`APK not found at ${fileUri}`);
      }

      // ② 只在 Android 里执行
      if (Platform.OS === 'android') {
        // 把 file:// 转成 content://
        const contentUri = await FileSystem.getContentUriAsync(fileUri);

        // Intent.FLAG_GRANT_READ_URI_PERMISSION = 1
        // Intent.FLAG_ACTIVITY_NEW_TASK = 0x10000000
        const flags = 1 | 0x10000000;

        await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
          data: contentUri,
          type: ANDROID_MIME_TYPE,
          flags: flags,
        });
      } else {
        throw new Error('APK install not supported on this platform');
      }
    } catch (e: any) {
      logger.error('installApk error', e);
      Toast.show({
        type: 'error',
        text1: '安装失败',
        text2: e.message || '未知错误',
      });
      throw e;
    }
  }

  /** --------------------------------------------------------------
   *  5️⃣ 版本比对工具（保持原来的实现）
   * --------------------------------------------------------------- */
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

/* 单例导出 */
export default UpdateService.getInstance();
