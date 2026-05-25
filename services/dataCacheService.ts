import AsyncStorage from "@react-native-async-storage/async-storage";
import Logger from "@/utils/Logger";

const logger = Logger.withTag("DataCache");
const CACHE_PREFIX = "@api_cache_";
const DEFAULT_TTL = 12 * 60 * 60 * 1000; // 默认缓存 12 小时

/**
 * 通用本地数据缓存服务 (借鉴 Selene 逻辑)
 */
export class DataCacheService {
  /**
   * 保存数据到缓存
   */
  static async set(key: string, data: any, ttl: number = DEFAULT_TTL): Promise<void> {
    const entry = {
      timestamp: Date.now(),
      ttl,
      data,
    };
    try {
      await AsyncStorage.setItem(`${CACHE_PREFIX}${key}`, JSON.stringify(entry));
    } catch (e) {
      logger.warn(`Failed to save cache for ${key}`, e);
    }
  }

  /**
   * 获取缓存数据
   */
  static async get<T>(key: string): Promise<T | null> {
    try {
      const stored = await AsyncStorage.getItem(`${CACHE_PREFIX}${key}`);
      if (!stored) return null;

      const entry = JSON.parse(stored);
      const isExpired = Date.now() - entry.timestamp > entry.ttl;

      if (isExpired) {
        await AsyncStorage.removeItem(`${CACHE_PREFIX}${key}`);
        return null;
      }

      return entry.data as T;
    } catch (e) {
      return null;
    }
  }

  /**
   * 清除特定搜索词相关的详情缓存（搜索时释放内存）
   */
  static async clearDetailCache(): Promise<void> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const detailKeys = keys.filter(k => k.startsWith(CACHE_PREFIX));
      if (detailKeys.length > 50) { // 限制详情缓存数量，防止占用过多空间
        await AsyncStorage.multiRemove(detailKeys);
        logger.info("Released old detail caches");
      }
    } catch (e) {}
  }
}
