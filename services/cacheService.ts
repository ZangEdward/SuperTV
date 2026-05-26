import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import { Platform, NativeModules } from "react-native";
import Logger from "@/utils/Logger";
import RNFetchBlob from 'react-native-blob-util';
import { filterM3U8Ads } from './m3u8';

const { NativeCryptoModule } = NativeModules;
const logger = Logger.withTag("CacheService");
const STORAGE_KEY = "mytv_cached_videos";
const QUEUE_STORAGE_KEY = "mytv_cache_queue";

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': '*/*',
};

const DOWNLOAD_DIR = Platform.OS === 'android'
  ? `${FileSystem.documentDirectory}download/`
  : `${FileSystem.documentDirectory}cached_videos/`;

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
}

export class CacheService {
  static async getAll(): Promise<CachedVideoItem[]> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      return [];
    }
  }

  static async saveAll(items: CachedVideoItem[]): Promise<void> {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }

  static async getQueue(): Promise<any[]> {
    const data = await AsyncStorage.getItem(QUEUE_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  }

  static async saveQueue(queue: any[]): Promise<void> {
    const persistedQueue = queue.map(group => ({
      ...group,
      episodes: group.episodes.map((ep: any) => ({
        ...ep,
        status: (ep.status === 'downloading' || ep.status === 'queued') ? 'paused' : ep.status
      }))
    }));
    await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(persistedQueue));
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
      const path = fileUri.replace('file://', '');
      if (await RNFetchBlob.fs.exists(path)) {
        await RNFetchBlob.fs.unlink(path);
      }
    } catch (error) {}
  }

  static async ensureDownloadDirectory(): Promise<void> {
    const path = DOWNLOAD_DIR.replace('file://', '');
    if (!(await RNFetchBlob.fs.isDir(path))) {
      await RNFetchBlob.fs.mkdir(path);
    }
  }

  static async clearAll(): Promise<void> {
    const items = await this.getAll();
    for (const item of items) {
      await this.deleteFile(item.fileUri);
    }
    await AsyncStorage.removeItem(STORAGE_KEY);
  }

  static buildFileName(source: string, id: string, episodeIndex: number, url: string): string {
    const extension = url.toLowerCase().includes('.m3u8') ? 'ts' : 'mp4';
    const normalizedSource = source.replace(/[^a-z0-9]/gi, '_');
    const normalizedId = id.replace(/[^a-z0-9]/gi, '_');
    return `${normalizedSource}_${normalizedId}_${episodeIndex + 1}.${extension}`;
  }

  static resolveUrl(url: string, baseUrl: string): string {
    if (url.startsWith('http')) return url;
    const base = baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1);
    if (url.startsWith('/')) {
      const origin = baseUrl.split('/').slice(0, 3).join('/');
      return origin + url;
    }
    return base + url;
  }

  /**
   * [核心恢复] JS 驱动的 M3U8 下载逻辑
   * 支持物理级取消、精准进度上报
   */
  static async downloadM3U8AsMp4(
    url: string,
    destinationPath: string,
    itemId: string,
    signal?: AbortSignal,
    progressCb?: (progress: number, completedCount: number) => void,
    options: { adFilter?: boolean } = {}
  ): Promise<string> {
    logger.info(`[Restored] Starting JS-Led Download: ${itemId}`);

    const fetchText = async (uri: string) => {
      const res = await RNFetchBlob.fetch('GET', uri, DEFAULT_HEADERS);
      return res.text();
    };

    // 1. 解析层
    let playlistText = await fetchText(url);
    if (options.adFilter) playlistText = filterM3U8Ads(playlistText);

    const lines = playlistText.split('\n');
    const segmentUrls: string[] = [];
    let encryption: any = null;
    let mediaSequence = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('#EXT-X-MEDIA-SEQUENCE:')) mediaSequence = parseInt(trimmed.split(':')[1]);
      if (trimmed.startsWith('#EXT-X-KEY:')) {
        const method = trimmed.match(/METHOD=([^,]+)/)?.[1];
        const uri = trimmed.match(/URI="([^"]+)"/)?.[1];
        if (method === 'AES-128' && uri) encryption = { uri: this.resolveUrl(uri, url) };
      }
      if (trimmed && !trimmed.startsWith('#')) {
        segmentUrls.push(this.resolveUrl(trimmed, url));
      }
    }

    const total = segmentUrls.length;
    if (total === 0) throw new Error("EMPTY_PLAYLIST");

    // 2. 密钥处理
    let keyBase64 = "";
    if (encryption) {
      const keyRes = await RNFetchBlob.fetch('GET', encryption.uri, DEFAULT_HEADERS);
      keyBase64 = await keyRes.base64();
    }

    // 3. 分片循环下载 (核心控制点)
    const tempDir = `${FileSystem.cacheDirectory}dl_${itemId.replace(/[^a-z0-9]/gi, '_')}/`;
    const tempDirPath = tempDir.replace('file://', '');
    await RNFetchBlob.fs.mkdir(tempDirPath).catch(() => {});

    const segmentFiles: string[] = [];
    let completed = 0;
    const CONCURRENCY = 3; // 保持适中并发，防止 UI 阻塞
    const queue = Array.from({ length: total }, (_, i) => i);
    const activeTasks = new Set<any>();

    // 物理取消监听
    if (signal) {
      signal.addEventListener('abort', () => {
        activeTasks.forEach(task => task.cancel?.());
        activeTasks.clear();
      });
    }

    const worker = async () => {
      while (queue.length > 0 && !signal?.aborted) {
        const idx = queue.shift();
        if (idx === undefined) break;

        const segPath = `${tempDirPath}seg_${idx}.ts`;
        if (!(await RNFetchBlob.fs.exists(segPath))) {
          const task = RNFetchBlob.config({ path: segPath }).fetch('GET', segmentUrls[idx], DEFAULT_HEADERS);
          activeTasks.add(task);
          try {
            const res = await task;
            if (res.info().status !== 200) throw new Error("HTTP_ERR");

            // 解密逻辑 (Native)
            if (keyBase64 && NativeCryptoModule) {
              const iv = (mediaSequence + idx).toString(16).padStart(32, '0');
              await NativeCryptoModule.decryptFileAES128CBC(segPath, keyBase64, iv);
            }
          } finally {
            activeTasks.delete(task);
          }
        }

        segmentFiles[idx] = segPath;
        completed++;
        progressCb?.(completed / total, completed);
      }
    };

    await Promise.all(Array(CONCURRENCY).fill(null).map(worker));

    if (signal?.aborted) throw new Error("CANCELLED");

    // 4. 合并层 (JS 流式追加)
    const destPath = destinationPath.replace('file://', '');
    if (await RNFetchBlob.fs.exists(destPath)) await RNFetchBlob.fs.unlink(destPath);

    for (let i = 0; i < total; i++) {
      if (signal?.aborted) break;
      if (segmentFiles[i]) {
        await RNFetchBlob.fs.appendFile(destPath, segmentFiles[i], 'uri');
        await RNFetchBlob.fs.unlink(segmentFiles[i]).catch(() => {});
      }
    }

    await RNFetchBlob.fs.unlink(tempDirPath).catch(() => {});
    return destinationPath;
  }

  static getDownloadDirectory(): string {
    return DOWNLOAD_DIR;
  }
}
