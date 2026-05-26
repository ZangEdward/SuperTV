import * as FileSystem from "expo-file-system";
import Logger from "@/utils/Logger";
import CryptoJS from 'crypto-js';

const logger = Logger.withTag("ImageCache");
const CACHE_DIR = `${FileSystem.cacheDirectory}poster_cache/`;

/**
 * 极速海报缓存服务
 */
export class ImageCacheService {
  /**
   * 生成文件名的哈希值 (使用 crypto-js 替代 expo-crypto 以避免依赖缺失)
   */
  static getCachePath(remoteUrl: string): string {
    const hash = CryptoJS.SHA256(remoteUrl).toString();
    return `${CACHE_DIR}${hash}.img`;
  }

  /**
   * 智能预判：如果本地有，直接返回本地，否则后台触发下载并返回远程
   */
  static async getLocalOrRemote(remoteUrl: string): Promise<string> {
    if (!remoteUrl || !remoteUrl.startsWith('http')) return remoteUrl;

    try {
      const localUri = this.getCachePath(remoteUrl);
      const info = await FileSystem.getInfoAsync(localUri);

      if (info.exists) {
        return localUri;
      }

      // 本地没有，不阻塞渲染，直接返回远程地址，并在后台偷偷下载
      this.downloadToCache(remoteUrl, localUri);
      return remoteUrl;
    } catch (e) {
      return remoteUrl;
    }
  }

  /**
   * 后台下载任务
   */
  private static async downloadToCache(remoteUrl: string, localUri: string) {
    try {
      const dirInfo = await FileSystem.getInfoAsync(CACHE_DIR);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
      }

      await FileSystem.downloadAsync(remoteUrl, localUri);
      logger.debug(`Cached new poster: ${localUri}`);
    } catch (e) {
      // 失败不影响显示
    }
  }

  static async clearCache(): Promise<void> {
    try {
      await FileSystem.deleteAsync(CACHE_DIR, { idempotent: true });
    } catch (e) {}
  }
}
