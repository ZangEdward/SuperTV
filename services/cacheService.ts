import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import { Platform, NativeModules, DeviceEventEmitter } from "react-native";
import Logger from "@/utils/Logger";
import CryptoJS from 'crypto-js';
import RNFetchBlob from 'react-native-blob-util';
import { filterM3U8Ads } from './m3u8';

const { NativeCryptoModule, NativeDownloadModule } = NativeModules;
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

export interface DetailedProgress {
  progress: number;
  speed: number;
  downloadedBytes: number;
  totalBytes: number;
  eta: number;
  segmentIndex: number;
  totalSegments: number;
}

export interface PauseController {
  pause: () => void;
  resume: () => void;
  isPaused: () => boolean;
}

// ================== 活动任务映射（支持暂停/继续） ==================
interface ActiveM3U8Task {
  controller: AbortController;
  isPaused: boolean;
  pausePromise: Promise<void> | null;
  resumeResolve: (() => void) | null;
  tempDir?: string;
}
const activeM3U8Tasks = new Map<string, ActiveM3U8Task>();

// ================== 临时文件管理（类似Chrome .crdownload / .tmp 机制） ==================
const TEMP_DIR = `${FileSystem.documentDirectory}m3u8_temp/`;
const TMP_EXTENSION = '.supertv.tmp';

/**
 * 确保临时目录存在
 */
async function ensureTempDir(): Promise<void> {
  await FileSystem.makeDirectoryAsync(TEMP_DIR, { intermediates: true });
}

/**
 * 清理指定任务的临时片段文件
 */
async function cleanupTaskTemp(taskId: string): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(TEMP_DIR);
    if (info.exists) {
      const files = await FileSystem.readDirectoryAsync(TEMP_DIR);
      for (const file of files) {
        if (file.startsWith(taskId) && file.endsWith(TMP_EXTENSION)) {
          await FileSystem.deleteAsync(`${TEMP_DIR}${file}`, { idempotent: true });
        }
      }
    }
  } catch (e) {
    logger.warn(`cleanupTaskTemp failed for ${taskId}`, e);
  }
}

/**
 * 全局清理：清理临时目录中所有 .supertv.tmp 文件
 */
async function cleanTempDir(): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(TEMP_DIR);
    if (info.exists) {
      const files = await FileSystem.readDirectoryAsync(TEMP_DIR);
      for (const file of files) {
        if (file.endsWith(TMP_EXTENSION)) {
          await FileSystem.deleteAsync(`${TEMP_DIR}${file}`, { idempotent: true });
        }
      }
    }
  } catch (e) {
    logger.warn('cleanTempDir failed', e);
  }
}

// ================== 辅助函数 ==================
/**
 * 使用 crypto-js 进行 AES-128-CBC 解密
 * @param encryptedBase64 加密数据的 Base64 字符串
 * @param key 16字节密钥 (WordArray)
 * @param iv 16字节初始向量 (WordArray)
 * @returns 解密后的 WordArray
 */
function aes128CbcDecrypt(encryptedBase64: string, key: CryptoJS.lib.WordArray, iv: CryptoJS.lib.WordArray): CryptoJS.lib.WordArray {
  const cipherParams = CryptoJS.lib.CipherParams.create({
    ciphertext: CryptoJS.enc.Base64.parse(encryptedBase64),
  });
  const decrypted = CryptoJS.AES.decrypt(
    cipherParams,
    key,
    {
      iv: iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    }
  );
  return decrypted;
}

/**
 * 解密单个 TS 片段
 * @param buffer 片段原始字节
 * @param key 密钥
 * @param iv 初始向量
 * @returns 解密后的 ArrayBuffer
 */
function decryptTSFragment(buffer: ArrayBuffer, key: Uint8Array, iv: Uint8Array): ArrayBuffer {
  try {
    const keyWordArray = CryptoJS.lib.WordArray.create(new Uint8Array(key) as any);
    const ivWordArray = CryptoJS.lib.WordArray.create(new Uint8Array(iv) as any);
    const contentWordArray = CryptoJS.lib.WordArray.create(new Uint8Array(buffer) as any);

    const decrypted = CryptoJS.AES.decrypt(
      { ciphertext: contentWordArray } as any,
      keyWordArray,
      {
        iv: ivWordArray,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
      }
    );
    return wordArrayToArrayBuffer(decrypted);
  } catch (err) {
    logger.warn('AES decrypt failed, returning original data', err);
    return buffer;
  }
}

function wordArrayToArrayBuffer(wordArray: CryptoJS.lib.WordArray): ArrayBuffer {
  const words = wordArray.words;
  const sigBytes = wordArray.sigBytes;
  const uint8 = new Uint8Array(sigBytes);
  for (let i = 0; i < sigBytes; i++) {
    uint8[i] = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
  }
  return uint8.buffer;
}

export class CacheService {
  /**
   * 下载单个 TS 片段，带自动重试和指数退避
   */
  private static async getAuthHeaders(): Promise<Record<string, string>> {
    try {
      const cookies = await AsyncStorage.getItem("authCookies");
      if (cookies) {
        return { 'Cookie': cookies };
      }
    } catch (e) {}
    return {};
  }

  /**
   * 下载单个 TS 片段，保存到磁盘临时文件并返回文件路径
   */
  private static async downloadSegment(
    url: string,
    index: number,
    encryption?: { key: Uint8Array; iv: Uint8Array } | null,
    retryCount: number = 5,
    taskId?: string
  ): Promise<string> {
    let lastError: Error | null = null;
    const authHeaders = await this.getAuthHeaders();

    // 构造更精确的 Referer 和 Origin
    let referer = '';
    let origin = '';
    try {
      const safeUrl = url.startsWith('//') ? `https:${url}` : url;
      const urlObj = new URL(safeUrl);
      origin = `${urlObj.protocol}//${urlObj.host}`;
      referer = safeUrl.substring(0, safeUrl.lastIndexOf('/') + 1);
    } catch (e) {
      referer = url;
    }

    const tempPath = taskId
      ? `${TEMP_DIR}${taskId}_seg_${index}${TMP_EXTENSION}`
      : `${TEMP_DIR}seg_${index}${TMP_EXTENSION}`;

    // 移除 file:// 前缀，并确保路径对原生层是干净的
    let normalizedTempPath = tempPath;
    if (Platform.OS === 'android') {
      normalizedTempPath = tempPath.startsWith('file://') ? tempPath.slice(7) : tempPath;
    }

    const tempDir = normalizedTempPath.substring(0, normalizedTempPath.lastIndexOf('/'));

    for (let attempt = 0; attempt <= retryCount; attempt++) {
      try {
        // 确保临时目录存在（双重保险）
        if (attempt === 0) {
          await RNFetchBlob.fs.mkdir(tempDir).catch(() => {});
        }

        const fetchHeaders: Record<string, string> = {
          ...DEFAULT_HEADERS,
          ...authHeaders,
          'Referer': referer,
        };
        if (origin) {
          fetchHeaders['Origin'] = origin;
        }

        // 1. 直接下载到指定的临时磁盘文件
        const res = await RNFetchBlob.config({
          path: normalizedTempPath,
          timeout: 60000,
        }).fetch('GET', url, fetchHeaders);

        const status = res.info().status;
        if (status === 403 || status === 401) {
          await RNFetchBlob.fs.unlink(normalizedTempPath).catch(() => {});
          throw new Error(`权限错误 (HTTP ${status})`);
        }
        if (status !== 200) {
          await RNFetchBlob.fs.unlink(normalizedTempPath).catch(() => {});
          throw new Error(`HTTP ${status}`);
        }

        // 2. 如果有加密，执行原生层异步解密（不阻塞 JS 线程）
        if (encryption) {
          try {
            if (NativeCryptoModule && Platform.OS === 'android') {
              // 将 Uint8Array 转换为原生层需要的格式 (使用 CryptoJS 避免依赖浏览器 btoa)
              const keyWordArray = CryptoJS.lib.WordArray.create(new Uint8Array(encryption.key) as any);
              const keyBase64 = CryptoJS.enc.Base64.stringify(keyWordArray);
              const ivHex = Array.from(encryption.iv).map(b => b.toString(16).padStart(2, '0')).join('');

              // 调用原生模块在后台线程执行解密，JS 线程此时完全空闲
              await NativeCryptoModule.decryptFileAES128CBC(normalizedTempPath, keyBase64, ivHex);
            } else {
              // 回退方案：如果原生模块未加载，使用之前的“分时”JS解密逻辑
              await new Promise(r => setTimeout(r, 10));
              const b64 = await RNFetchBlob.fs.readFile(normalizedTempPath, 'base64');
              const contentWordArray = CryptoJS.enc.Base64.parse(b64);
              const keyWordArray = CryptoJS.lib.WordArray.create(new Uint8Array(encryption.key) as any);
              const ivWordArray = CryptoJS.lib.WordArray.create(new Uint8Array(encryption.iv) as any);
              const decrypted = CryptoJS.AES.decrypt(
                { ciphertext: contentWordArray } as any,
                keyWordArray,
                { iv: ivWordArray, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 }
              );
              await RNFetchBlob.fs.writeFile(normalizedTempPath, CryptoJS.enc.Base64.stringify(decrypted), 'base64');
            }
          } catch (decryptErr) {
            logger.error(`Decryption failed for segment ${index}`, decryptErr);
            throw decryptErr;
          }
        }

        // 返回分片的本地路径
        return normalizedTempPath;
      } catch (err: any) {
        lastError = err;
        await RNFetchBlob.fs.unlink(normalizedTempPath).catch(() => {});
        if (attempt < retryCount) {
          const delay = 1000 * Math.pow(2, attempt);
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }
    throw lastError || new Error(`片段 ${index + 1} 下载失败`);
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
      NativeDownloadModule.stopDownload(itemId);
    }
  }

  /** 继续 M3U8 下载任务 */
  static resumeTask(itemId: string): void {
    CacheService.resumeM3U8Task(itemId);
  }

  static isTaskPaused(itemId: string): boolean {
    const task = activeM3U8Tasks.get(itemId);
    return task?.isPaused ?? false;
  }

  static removeTaskState(itemId: string): void {
    CacheService.cancelM3U8Task(itemId);
  }

  static buildFileName(source: string, id: string, episodeIndex: number, url: string): string {
    const extensionMatch = url.match(/\.(mp4|m3u8|ts|mov|webm)(?:[?#].*)?$/i);
    let extension = extensionMatch ? extensionMatch[1].toLowerCase() : "mp4";
    // 如果是 m3u8 下载，强制使用 .ts 后缀，避免系统 MediaScanner 将其误认为 mp4 导致硬件解码器崩溃
    if (extension === "m3u8") {
      extension = "ts";
    }
    const normalizedSource = source.replace(/[^a-zA-Z0-9_-]/g, "_");
    const normalizedId = id.toString().replace(/[^a-zA-Z0-9_-]/g, "_");
    // 移除 Date.now()，使文件名在多次运行间保持一致以支持断点续传
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

  /** 注册一个 M3U8 下载任务（供暂停/继续控制） */
  static registerM3U8Task(itemId: string): ActiveM3U8Task {
    const existing = activeM3U8Tasks.get(itemId);
    if (existing) {
      // 如果任务已存在但处于暂停状态，不要覆盖
      if (existing.isPaused) return existing;
      // 否则取消旧任务
      existing.controller.abort();
    }
    const task: ActiveM3U8Task = {
      controller: new AbortController(),
      isPaused: false,
      pausePromise: null,
      resumeResolve: null,
    };
    activeM3U8Tasks.set(itemId, task);
    return task;
  }

  static unregisterM3U8Task(itemId: string): void {
    activeM3U8Tasks.delete(itemId);
  }

  static async waitIfPaused(itemId: string): Promise<void> {
    const task = activeM3U8Tasks.get(itemId);
    while (task?.isPaused && task.pausePromise) {
      await task.pausePromise;
    }
  }

  static pauseTask(itemId: string): void {
    if (NativeDownloadModule) {
      NativeDownloadModule.stopDownload(itemId);
    }
  }

  static resumeM3U8Task(itemId: string): void {
    // 逻辑在 store 中调用 downloadQueuedEpisode 重新启动
  }

  static cancelM3U8Task(itemId: string, tempDir?: string): void {
    if (NativeDownloadModule) {
      NativeDownloadModule.stopDownload(itemId);
    }
    if (tempDir) {
      CacheService.cleanupTempDir(tempDir).catch(() => {});
    }
  }

  /** 清理临时目录 */
  private static async cleanupTempDir(tempDir: string): Promise<void> {
    try {
      const dirInfo = await FileSystem.getInfoAsync(tempDir);
      if (dirInfo.exists) {
        const files = await FileSystem.readDirectoryAsync(tempDir);
        for (const f of files) {
          await FileSystem.deleteAsync(`${tempDir}${f}`, { idempotent: true });
        }
        await FileSystem.deleteAsync(tempDir, { idempotent: true });
      }
    } catch (e) {
      logger.warn('清理临时目录失败', e);
    }
  }

  /**
   * 下载 M3U8 并合并为 MP4
   * 原生控制模式：JS 只负责 M3U8 解析，原生层接管下载循环、并发和暂停
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
    logger.info(`[CacheService] Starting Download (Native-Led): ${taskId}`);

    const authHeaders = await this.getAuthHeaders();
    const headers = { ...DEFAULT_HEADERS, ...authHeaders };

    // 1. 获取并解析 M3U8 (JS 层解析更灵活)
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
    if (segmentUrls.length === 0) throw new Error("未找到片段");

    // 2. 准备加密
    let keyBase64 = "";
    let ivHex = mediaParsed.encryption?.iv || "";
    if (mediaParsed.encryption?.method === 'AES-128' && !ivHex) {
      ivHex = `SEQ:${mediaParsed.mediaSequence}`;
    }
    if (mediaParsed.encryption?.method === 'AES-128') {
      const keyUrl = CacheService.resolveUrl(mediaParsed.encryption.uri, mediaPlaylistUrl);
      const keyRes = await RNFetchBlob.fetch('GET', keyUrl, headers);
      keyBase64 = await keyRes.base64();
    }

    // 3. 原生全速下载与监控
    if (NativeDownloadModule && Platform.OS === 'android') {
      const progressSub = DeviceEventEmitter.addListener('NativeDownloadProgress', (event) => {
        if (event.taskId === taskId) {
          progressCb?.(event.progress, event.completedCount);
        }
      });

      try {
        let normalizedDestPath = destinationPath;
        if (normalizedDestPath.startsWith('file://')) normalizedDestPath = normalizedDestPath.slice(7);

        // 调用原生层接管：内部包含下载池、暂停逻辑、IO 控制
        await NativeDownloadModule.startM3U8Download(
          taskId,
          segmentUrls,
          normalizedDestPath,
          keyBase64,
          ivHex,
          headers
        );
        return destinationPath;
      } finally {
        progressSub.remove();
      }
    } else {
      throw new Error("Android 原生下载模块不可用");
    }
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
