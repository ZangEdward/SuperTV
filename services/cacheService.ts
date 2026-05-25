import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import { Platform, NativeModules, DeviceEventEmitter } from "react-native";
import Logger from "@/utils/Logger";
import RNFetchBlob from 'react-native-blob-util';
import { filterM3U8Ads } from './m3u8';

const { NativeDownloadModule } = NativeModules;
const logger = Logger.withTag("CacheService");
const STORAGE_KEY = "mytv_cached_videos";
const QUEUE_STORAGE_KEY = "mytv_cache_queue";

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': '*/*',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
};

// 安卓使用 android/data/<package>/files/download/
const DOWNLOAD_DIR = Platform.OS === 'android'
  ? `${FileSystem.documentDirectory}download/`
  : `${FileSystem.documentDirectory}cached_videos/`;

interface M3U8Variant {
  uri: string;
  bandwidth?: number;
  resolution?: { width: number; height: number };
}

export interface CachedVideoItem {
  id: string;
  source: string;
  source_name: string;
  title: string;
  poster: string;
  episodeIndex: number;
  episodeTitle: string;
  fileUri: string;
  totalEpisodes: number;
  downloadedAt: number;
  resolution?: string | null;
}

export class CacheService {
  private static async getAuthHeaders(): Promise<Record<string, string>> {
    try {
      const cookies = await AsyncStorage.getItem("authCookies");
      if (cookies) {
        return { 'Cookie': cookies };
      }
    } catch (e) {}
    return {};
  }

  static async getAll(): Promise<CachedVideoItem[]> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      logger.info("Failed to load cached videos:", error);
      return [];
    }
  }

  static async saveAll(items: CachedVideoItem[]): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (error) {
      logger.warn("Failed to save cached videos:", error);
    }
  }

  static async getQueue(): Promise<any[]> {
    try {
      const data = await AsyncStorage.getItem(QUEUE_STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      logger.info("Failed to load cache queue:", error);
      return [];
    }
  }

  static async saveQueue(queue: any[]): Promise<void> {
    try {
      // 过滤掉正在下载的状态，转为暂停或等待，避免重启后状态不一致
      const persistedQueue = queue.map(group => ({
        ...group,
        episodes: group.episodes.map((ep: any) => ({
          ...ep,
          status: (ep.status === 'downloading' || ep.status === 'queued') ? 'paused' : ep.status
        }))
      }));
      await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(persistedQueue));
    } catch (error) {
      logger.warn("Failed to save cache queue:", error);
    }
  }

  static async add(item: CachedVideoItem): Promise<void> {
    const items = await this.getAll();
    const next = items.filter((entry) => entry.id !== item.id);
    next.unshift(item);
    await this.saveAll(next);
  }

  static async remove(id: string): Promise<void> {
    const items = await this.getAll();
    await this.saveAll(items.filter((entry) => entry.id !== id));
  }

  static async deleteFile(fileUri: string): Promise<void> {
    try {
      const info = await FileSystem.getInfoAsync(fileUri);
      if (info.exists) {
        await FileSystem.deleteAsync(fileUri, { idempotent: true });
      }
    } catch (error) {
      logger.warn("Failed to delete cached file:", error);
    }
  }

  static async ensureDownloadDirectory(): Promise<void> {
    try {
      await FileSystem.makeDirectoryAsync(DOWNLOAD_DIR, { intermediates: true });
    } catch (error) {
      logger.warn("Failed to create download directory:", error);
    }
  }

  static async clearAll(): Promise<void> {
    try {
      const items = await this.getAll();
      for (const item of items) {
        await this.deleteFile(item.fileUri);
      }
      await AsyncStorage.removeItem(STORAGE_KEY);
      const dirInfo = await FileSystem.getInfoAsync(DOWNLOAD_DIR);
      if (dirInfo.exists) {
        const listing = await FileSystem.readDirectoryAsync(DOWNLOAD_DIR);
        for (const file of listing) {
          await FileSystem.deleteAsync(`${DOWNLOAD_DIR}${file}`, { idempotent: true });
        }
      }
    } catch (error) {
      logger.warn("Failed to clear cached videos:", error);
    }
  }

  static async calculateCacheSize(): Promise<number> {
    try {
      let totalSize = 0;
      const dirInfo = await FileSystem.getInfoAsync(DOWNLOAD_DIR);
      if (dirInfo.exists) {
        const listing = await FileSystem.readDirectoryAsync(DOWNLOAD_DIR);
        for (const file of listing) {
          const info = await FileSystem.getInfoAsync(`${DOWNLOAD_DIR}${file}`);
          if (info.exists) {
            totalSize += (info.size || 0);
          }
        }
      }
      return totalSize;
    } catch (error) {
      logger.warn("Failed to calculate cache size:", error);
      return 0;
    }
  }

  static async getStorageStats(): Promise<{
    cacheSize: number;
    freeStorage?: number;
  }> {
    const cacheSize = await this.calculateCacheSize();
    let freeStorage: number | undefined;
    try {
      freeStorage = await FileSystem.getFreeDiskStorageAsync();
    } catch (e) {
      // ignore
    }
    return { cacheSize, freeStorage };
  }

  static formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /** 暂停 M3U8 下载任务 */
  static pauseTask(itemId: string): void {
    if (NativeDownloadModule) {
      if (itemId) {
        NativeDownloadModule.stopDownload(itemId);
      } else {
        NativeDownloadModule.stopAllCalls();
      }
    }
  }

  /** 继续 M3U8 下载任务 */
  static resumeTask(itemId: string): void {
    // 逻辑在 store 中通过 downloadQueuedEpisode 实现
  }

  static isTaskPaused(itemId: string): boolean {
    return false;
  }

  static removeTaskState(itemId: string): void {
    if (NativeDownloadModule) {
      NativeDownloadModule.stopDownload(itemId);
    }
  }

  static cancelM3U8Task(itemId: string): void {
    if (NativeDownloadModule) {
      NativeDownloadModule.stopDownload(itemId);
    }
  }

  static buildFileName(source: string, id: string, episodeIndex: number, url: string): string {
    const extensionMatch = url.match(/\.(mp4|m3u8|ts|mov|webm)(?:[?#].*)?$/i);
    let extension = extensionMatch ? extensionMatch[1].toLowerCase() : "mp4";
    if (extension === "m3u8") {
      extension = "ts";
    }
    const normalizedSource = source.replace(/[^a-zA-Z0-9_-]/g, "_");
    const normalizedId = id.toString().replace(/[^a-zA-Z0-9_-]/g, "_");
    return `${normalizedSource}_${normalizedId}_${episodeIndex + 1}.${extension}`;
  }

  static resolveUrl(url: string, baseUrl: string): string {
    try {
      return new URL(url, baseUrl).href;
    } catch {
      if (url.toLowerCase().startsWith("http://") || url.toLowerCase().startsWith("https://")) return url;
      const prefix = baseUrl.substring(0, baseUrl.lastIndexOf("/") + 1);
      return `${prefix}${url}`;
    }
  }

  static parseM3U8Playlist(playlist: string): {
    isMaster: boolean;
    variants: M3U8Variant[];
    segments: string[];
    encryption?: {
      method: string;
      uri: string;
      iv?: string;
    };
    mediaSequence: number;
  } {
    const lines = playlist.split(/\r?\n/).map((line) => line.trim());
    const variants: M3U8Variant[] = [];
    const segments: string[] = [];
    let currentVariant: Partial<M3U8Variant> | null = null;
    let encryption: { method: string; uri: string; iv?: string } | undefined;
    let mediaSequence = 0;

    for (const line of lines) {
      if (!line || line.startsWith("#EXTM3U")) continue;

      if (line.startsWith("#EXT-X-MEDIA-SEQUENCE")) {
        const match = line.match(/#EXT-X-MEDIA-SEQUENCE:(\d+)/i);
        if (match) mediaSequence = parseInt(match[1], 10);
      }
      if (line.startsWith("#EXT-X-KEY")) {
        const methodMatch = line.match(/METHOD=([^,\s]+)/i);
        const uriMatch = line.match(/URI="([^"]+)"/i);
        const ivMatch = line.match(/IV=0x([a-fA-F0-9]+)/i);
        if (methodMatch && methodMatch[1] !== "NONE" && uriMatch) {
          encryption = {
            method: methodMatch[1],
            uri: uriMatch[1],
            iv: ivMatch ? ivMatch[1] : undefined,
          };
        }
      }
      if (line.startsWith("#EXT-X-STREAM-INF")) {
        currentVariant = {};
        const bandwidthMatch = line.match(/BANDWIDTH=(\d+)/i);
        const resolutionMatch = line.match(/RESOLUTION=(\d+)x(\d+)/i);
        if (bandwidthMatch) {
          currentVariant.bandwidth = parseInt(bandwidthMatch[1], 10);
        }
        if (resolutionMatch) {
          currentVariant.resolution = {
            width: parseInt(resolutionMatch[1], 10),
            height: parseInt(resolutionMatch[2], 10),
          };
        }
      } else if (currentVariant && !line.startsWith("#")) {
        currentVariant.uri = line;
        variants.push(currentVariant as M3U8Variant);
        currentVariant = null;
      } else if (!line.startsWith("#")) {
        segments.push(line);
      }
    }

    return {
      isMaster: variants.length > 0,
      variants,
      segments,
      encryption,
      mediaSequence,
    };
  }

  static selectBestVariant(variants: M3U8Variant[]): M3U8Variant {
    return variants.sort((a, b) => {
      const heightA = a.resolution?.height ?? 0;
      const heightB = b.resolution?.height ?? 0;
      const bandwidthA = a.bandwidth ?? 0;
      const bandwidthB = b.bandwidth ?? 0;
      if (heightB !== heightA) return heightB - heightA;
      return bandwidthB - bandwidthA;
    })[0];
  }

  /**
   * 下载 M3U8 并合并为 MP4
   * 混合模式：React Native 指挥下载逻辑（利于控制和去广告），原生层负责高性能解密合并。
   */
  static async downloadM3U8AsMp4(
    url: string,
    destinationPath: string,
    itemId?: string,
    signal?: AbortSignal,
    progressCb?: (progress: number, completedCount: number) => void,
    options: { adFilter?: boolean } = {}
  ): Promise<string> {
    const taskId = itemId || `m3u8_${Date.now()}`;
    logger.info(`[CacheService] Starting RN-Led Download: ${taskId}`);

    const authHeaders = await this.getAuthHeaders();
    const headers = { ...DEFAULT_HEADERS, ...authHeaders };

    const fetchText = async (uri: string): Promise<string> => {
      const res = await RNFetchBlob.fetch('GET', uri, headers);
      return await res.text();
    };

    let playlistText = await fetchText(url);
    let parsed = CacheService.parseM3U8Playlist(playlistText);

    let mediaPlaylistUrl = url;
    let mediaParsed = parsed;
    if (parsed.isMaster) {
      const bestVariant = CacheService.selectBestVariant(parsed.variants);
      mediaPlaylistUrl = CacheService.resolveUrl(bestVariant.uri, url);
      const mediaText = await fetchText(mediaPlaylistUrl);
      const finalMediaText = options.adFilter ? filterM3U8Ads(mediaText) : mediaText;
      mediaParsed = CacheService.parseM3U8Playlist(finalMediaText);
    } else if (options.adFilter) {
      mediaParsed = CacheService.parseM3U8Playlist(filterM3U8Ads(playlistText));
    }

    const segmentUrls = mediaParsed.segments.map(s => CacheService.resolveUrl(s, mediaPlaylistUrl));
    const total = segmentUrls.length;
    if (total === 0) throw new Error("未找到分片");

    let keyBase64 = "";
    let ivHex = mediaParsed.encryption?.iv || "";
    if (mediaParsed.encryption?.method === 'AES-128') {
      const keyUrl = CacheService.resolveUrl(mediaParsed.encryption.uri, mediaPlaylistUrl);
      const keyRes = await RNFetchBlob.fetch('GET', keyUrl, headers);
      keyBase64 = await keyRes.base64();
    }

    const tempDir = `${FileSystem.cacheDirectory}m3u8_rn_${taskId.replace(/[^a-z0-9]/gi, '_')}/`;
    await FileSystem.makeDirectoryAsync(tempDir, { intermediates: true });

    const segmentFiles: string[] = [];
    let completedCount = 0;
    let isCancelled = false;
    const CONCURRENCY = 4;
    const queue = Array.from({ length: total }, (_, i) => i);
    const activeTasksCount = { val: 0 };
    const currentCalls = new Set<any>();

    if (signal) {
      signal.addEventListener('abort', () => {
        isCancelled = true;
        currentCalls.forEach(c => c.cancel?.());
      });
    }

    const processSegment = async (index: number) => {
      if (isCancelled) return;
      const segFile = `${tempDir}seg_${index}.ts`;
      const normalizedPath = Platform.OS === 'android' ? segFile.replace('file://', '') : segFile;

      const info = await FileSystem.getInfoAsync(segFile);
      if (!info.exists || info.size === 0) {
        const task = RNFetchBlob.config({ path: normalizedPath }).fetch('GET', segmentUrls[index], headers);
        currentCalls.add(task);
        try {
          const res = await task;
          currentCalls.delete(task);
          if (res.info().status !== 200) throw new Error(`HTTP ${res.info().status}`);

          if (keyBase64) {
            let segmentIv = ivHex;
            if (!ivHex) {
              segmentIv = (mediaParsed.mediaSequence + index).toString(16).padStart(32, '0');
            }
            await NativeDownloadModule.decryptFileInPlace(normalizedPath, keyBase64, segmentIv);
          }
        } catch (e) {
          currentCalls.delete(task);
          throw e;
        }
      }

      segmentFiles[index] = normalizedPath;
      completedCount++;
      if (completedCount % 5 === 0 || completedCount === total) {
        progressCb?.(completedCount / total, completedCount);
      }
    };

    await new Promise<void>((resolve, reject) => {
      const fillPool = () => {
        while (activeTasksCount.val < CONCURRENCY && queue.length > 0 && !isCancelled) {
          const idx = queue.shift()!;
          activeTasksCount.val++;
          processSegment(idx)
            .then(() => {
              activeTasksCount.val--;
              if (queue.length === 0 && activeTasksCount.val === 0) resolve();
              else fillPool();
            })
            .catch(err => {
              isCancelled = true;
              currentCalls.forEach(c => c.cancel?.());
              reject(err);
            });
        }
        if (queue.length === 0 && activeTasksCount.val === 0) resolve();
      };
      fillPool();
    });

    if (isCancelled) throw new Error("CANCELLED");

    logger.info(`[CacheService] Native merging ${total} segments...`);
    let normalizedDestPath = destinationPath;
    if (normalizedDestPath.startsWith('file://')) normalizedDestPath = normalizedDestPath.slice(7);

    await NativeDownloadModule.mergeFiles(segmentFiles.filter(p => !!p), normalizedDestPath);
    await FileSystem.deleteAsync(tempDir, { idempotent: true });
    return destinationPath;
  }

  static async saveToPublicStorage(fileUri: string, albumName: string = "SuperTV"): Promise<string | null> {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        throw new Error('未获得存储权限');
      }
      const asset = await MediaLibrary.createAssetAsync(fileUri);
      const album = await MediaLibrary.getAlbumAsync(albumName);
      if (album == null) {
        await MediaLibrary.createAlbumAsync(albumName, asset, false);
      } else {
        await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
      }
      return asset.uri;
    } catch (error) {
      logger.warn("saveToPublicStorage failed", error);
      return null;
    }
  }

  static async downloadFileWithProgress(
    url: string,
    destinationPath: string,
    progressCb?: (progress: number) => void,
    options?: FileSystem.DownloadOptions
  ): Promise<string> {
    return new Promise(async (resolve, reject) => {
      try {
        const mergedOptions = {
          ...options || {},
          headers: { ...DEFAULT_HEADERS, ...(options?.headers || {}) },
        };
        const resumable = FileSystem.createDownloadResumable(
          url,
          destinationPath,
          mergedOptions,
          (downloadProgress) => {
            const { totalBytesWritten, totalBytesExpectedToWrite } = downloadProgress;
            if (totalBytesExpectedToWrite > 0) {
              const p = totalBytesWritten / totalBytesExpectedToWrite;
              try {
                progressCb?.(p);
              } catch {}
            }
          }
        );
        const result = await resumable.downloadAsync();
        progressCb?.(1);
        if (!result || !result.uri) {
          throw new Error('下载失败，未获取到文件路径');
        }
        resolve(result.uri);
      } catch (err: any) {
        const msg = err.message || '未知错误';
        logger.error(`[CacheService] downloadFileWithProgress 失败: ${msg} (URL: ${url})`);
        reject(new Error(`下载失败: ${msg}`));
      }
    });
  }

  static getDownloadDirectory(): string {
    return DOWNLOAD_DIR;
  }
}
