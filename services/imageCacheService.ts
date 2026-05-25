import * as FileSystem from "expo-file-system";
import Logger from "@/utils/Logger";

const logger = Logger.withTag("ImageCache");
const CACHE_DIR = `${FileSystem.cacheDirectory}poster_cache/`;

/**
 * 极速图片持久化缓存 (借鉴 Selene 逻辑)
 */
export class ImageCacheService {
  /**
   * 获取图片的本地路径，如果不存在则下载
   */
  static async getLocalPath(remoteUrl: string): Promise<string> {
    if (!remoteUrl) return "";

    // 只有 http 链接需要缓存
    if (!remoteUrl.startsWith('http')) return remoteUrl;

    try {
      // 1. 确保目录存在
      const dirInfo = await FileSystem.getInfoAsync(CACHE_DIR);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
      }

      // 2. 生成本地文件名 (哈希化处理特殊字符)
      const filename = remoteUrl.split('/').pop()?.split('?')[0] || `img_${Math.random()}`;
      const localUri = `${CACHE_DIR}${filename}`;

      // 3. 检查本地是否存在
      const fileInfo = await FileSystem.getInfoAsync(localUri);
      if (fileInfo.exists) {
        return localUri;
      }

      // 4. 后台静默下载并返回原始链接（本次渲染用原始链接，下次渲染用本地）
      FileSystem.downloadAsync(remoteUrl, localUri).catch(e => {
        logger.debug(`Background image download failed: ${remoteUrl}`);
      });

      return remoteUrl;
    } catch (e) {
      return remoteUrl;
    }
  }

  /**
   * 清理过期缓存
   */
  static async clearCache(): Promise<void> {
    try {
      await FileSystem.deleteAsync(CACHE_DIR, { idempotent: true });
    } catch (e) {}
  }
}
