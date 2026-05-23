import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import { Platform } from "react-native";
import Logger from "@/utils/Logger";
import CryptoJS from 'crypto-js';
import RNFetchBlob from 'react-native-blob-util';

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

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const len = bytes.byteLength;
  const CHUNK_SIZE = 8192;

  for (let i = 0; i < len; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, Math.min(i + CHUNK_SIZE, len));
    // @ts-ignore
    binary += String.fromCharCode.apply(null, Array.from(chunk) as any);
  }

  return btoa(binary);
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
   * 下载单个 TS 片段，带自动重试和指数退避
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

        // 使用 RNFetchBlob 下载到指定的临时文件（位于应用数据目录中）
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

        try {
          if (encryption) {
            const b64 = await RNFetchBlob.fs.readFile(normalizedTempPath, 'base64');
            const contentWordArray = CryptoJS.enc.Base64.parse(b64);

            const keyWordArray = CryptoJS.lib.WordArray.create(new Uint8Array(encryption.key) as any);
            const ivWordArray = CryptoJS.lib.WordArray.create(new Uint8Array(encryption.iv) as any);

            const decrypted = CryptoJS.AES.decrypt(
              { ciphertext: contentWordArray } as any,
              keyWordArray,
              {
                iv: ivWordArray,
                mode: CryptoJS.mode.CBC,
                padding: CryptoJS.pad.Pkcs7,
              }
            );
            return CryptoJS.enc.Base64.stringify(decrypted);
          } else {
            return await RNFetchBlob.fs.readFile(normalizedTempPath, 'base64');
          }
        } finally {
          await RNFetchBlob.fs.unlink(normalizedTempPath).catch(() => {});
        }
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
    CacheService.pauseM3U8Task(itemId);
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
  } {
    const lines = playlist.split(/\r?\n/).map((line) => line.trim());
    const variants: M3U8Variant[] = [];
    const segments: string[] = [];
    let currentVariant: Partial<M3U8Variant> | null = null;
    let encryption: { method: string; uri: string; iv?: string } | undefined;

    for (const line of lines) {
      if (!line || line.startsWith("#EXTM3U")) continue;
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

  static pauseM3U8Task(itemId: string): void {
    const task = activeM3U8Tasks.get(itemId);
    if (task && !task.isPaused) {
      task.isPaused = true;
      task.pausePromise = new Promise<void>((resolve) => {
        task.resumeResolve = resolve;
      });
      logger.info(`[CacheService] Paused M3U8 task: ${itemId}`);
    }
  }

  static resumeM3U8Task(itemId: string): void {
    const task = activeM3U8Tasks.get(itemId);
    if (task && task.isPaused && task.resumeResolve) {
      task.isPaused = false;
      task.resumeResolve();
      task.resumeResolve = null;
      task.pausePromise = null;
      logger.info(`[CacheService] Resumed M3U8 task: ${itemId}`);
    }
  }

  static cancelM3U8Task(itemId: string, tempDir?: string): void {
    const task = activeM3U8Tasks.get(itemId);
    if (task) {
      task.controller.abort();
      activeM3U8Tasks.delete(itemId);
      // 清理临时文件（优先使用传入的 tempDir，或用任务中保存的）
      const dirToClean = tempDir || task.tempDir;
      if (dirToClean) {
        CacheService.cleanupTempDir(dirToClean).catch(() => {});
      }
      logger.info(`[CacheService] Canceled M3U8 task: ${itemId}`);
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
   * 支持断点续传：通过 options.resumeIndex 指定起始片段索引
   */
  static async downloadM3U8AsMp4(
    url: string,
    destinationPath: string,
    itemId?: string,
    signal?: AbortSignal,
    progressCb?: (progress: number, completedCount: number) => void,
    options: { resumeIndex?: number } = {}
  ): Promise<string> {
    const start = Date.now();
    let resumeIndex = options.resumeIndex || 0;
    logger.info(`[CacheService] downloadM3U8AsMp4 START - ${url} (resume from ${resumeIndex})`);

    const taskId = itemId || `m3u8_${Date.now()}`;
    const activeTask = CacheService.registerM3U8Task(taskId);
    const mergeSignal = activeTask.controller.signal;

    if (signal) {
      const onAbort = () => {
        if (!activeTask.isPaused) {
          activeTask.controller.abort();
          activeM3U8Tasks.delete(taskId);
        }
      };
      signal.addEventListener('abort', onAbort, { once: true });
    }

    try {
      const authHeaders = await this.getAuthHeaders();
      const fetchText = async (uri: string): Promise<string> => {
        let referer = '';
        let origin = '';
        try {
          const safeUrl = uri.startsWith('//') ? `https:${uri}` : uri;
          const urlObj = new URL(safeUrl);
          origin = `${urlObj.protocol}//${urlObj.host}`;
          referer = safeUrl.substring(0, safeUrl.lastIndexOf('/') + 1);
        } catch (e) {
          referer = uri;
        }

        const headers: Record<string, string> = {
          ...DEFAULT_HEADERS,
          ...authHeaders,
          'Referer': referer,
        };
        if (origin) {
          headers['Origin'] = origin;
        }

        // 改用 RNFetchBlob 获取文本，因为 fetch 在某些设备上会报 network request failed
        const res = await RNFetchBlob.fetch('GET', uri, headers);
        const status = res.info().status;
        if (status !== 200) {
          throw new Error(`无法获取 M3U8 文件：${status}`);
        }
        return await res.text();
      };

      await CacheService.waitIfPaused(taskId);
      if (mergeSignal.aborted) throw new Error("下载已取消");

      // 解析主 playlist
      const playlistText = await fetchText(url);
      const parsed = CacheService.parseM3U8Playlist(playlistText);

      let mediaPlaylistUrl = url;
      let mediaParsed = parsed;
      if (parsed.isMaster) {
        const bestVariant = CacheService.selectBestVariant(parsed.variants);
        if (!bestVariant || !bestVariant.uri) throw new Error("无法解析 m3u8 子流");
        mediaPlaylistUrl = CacheService.resolveUrl(bestVariant.uri, url);
        await CacheService.waitIfPaused(taskId);
        if (mergeSignal.aborted) throw new Error("下载已取消");
        const mediaText = await fetchText(mediaPlaylistUrl);
        mediaParsed = CacheService.parseM3U8Playlist(mediaText);
      }

      if (mediaParsed.segments.length === 0) throw new Error("m3u8 中未找到可下载的片段");

      // AES 密钥
      let encryptionKey: Uint8Array | null = null;
      let encryptionIV: Uint8Array | null = null;
      if (mediaParsed.encryption?.method === 'AES-128') {
        const keyUrl = CacheService.resolveUrl(mediaParsed.encryption.uri, mediaPlaylistUrl);
        await CacheService.waitIfPaused(taskId);
        if (mergeSignal.aborted) throw new Error("下载已取消");
        try {
          const keyReferer = keyUrl.substring(0, keyUrl.lastIndexOf('/') + 1);
          const keyHeaders = { ...DEFAULT_HEADERS, 'Referer': keyReferer };
          const keyRes = await RNFetchBlob.fetch('GET', keyUrl, keyHeaders);
          if (keyRes.info().status !== 200) throw new Error(`Key HTTP ${keyRes.info().status}`);

          const base64Key = await keyRes.base64();
          const keyWordArray = CryptoJS.enc.Base64.parse(base64Key);
          encryptionKey = new Uint8Array(wordArrayToArrayBuffer(keyWordArray));

          if (mediaParsed.encryption.iv) {
            const hex = mediaParsed.encryption.iv.replace('0x', '');
            encryptionIV = new Uint8Array(hex.match(/.{1,2}/g)!.map(b => parseInt(b, 16)));
          }
        } catch (e) {
          logger.warn("获取加密密钥失败", e);
          throw new Error("获取解密密钥失败");
        }
      }

      if (!destinationPath.endsWith('.ts') && !destinationPath.endsWith('.mp4')) {
        destinationPath = destinationPath.replace(/\.[^/.]+$/, '') + '.ts';
      }

      // 确保目录存在
      const destDir = destinationPath.substring(0, destinationPath.lastIndexOf('/'));
      await FileSystem.makeDirectoryAsync(destDir, { intermediates: true });

      // 如果不是续传，则清理旧文件
      if (resumeIndex === 0) {
        try { await FileSystem.deleteAsync(destinationPath, { idempotent: true }); } catch (e) { }
      } else {
        // 验证文件是否存在，如果不存在则重置 resumeIndex
        const info = await FileSystem.getInfoAsync(destinationPath);
        if (!info.exists) {
          logger.warn(`Resume file not found at ${destinationPath}, starting from 0`);
          resumeIndex = 0;
        }
      }

      const segmentUrls = mediaParsed.segments.map(s => CacheService.resolveUrl(s, mediaPlaylistUrl));
      const total = segmentUrls.length;

      const CONCURRENCY = 4; // 提高并发数，加速下载
      let completedCount = resumeIndex;

      // 修复：react-native-blob-util 在某些版本上对 file:// 前缀处理不一
      let normalizedDestPath = destinationPath;
      if (Platform.OS === 'android') {
        normalizedDestPath = destinationPath.startsWith('file://') ? destinationPath.slice(7) : destinationPath;
      }

      await ensureTempDir();

      // 创建写入流，如果 resumeIndex > 0 则 append: true
      const writeStream = await RNFetchBlob.fs.writeStream(normalizedDestPath, 'base64', resumeIndex > 0);

      const resultsBuffer: { [index: number]: string } = {};
      const BUFFER_LIMIT = 6; // 限制缓冲中最大未写入片段数
      let nextIndexToWrite = resumeIndex;
      let isWriting = false;
      let writeError: Error | null = null;

      const flushWriter = async () => {
        if (isWriting || writeError) return;
        isWriting = true;
        try {
          while (resultsBuffer[nextIndexToWrite] !== undefined && !writeError) {
            const data = resultsBuffer[nextIndexToWrite];
            if (data) {
              await writeStream.write(data);
            }
            delete resultsBuffer[nextIndexToWrite];
            nextIndexToWrite++;
            completedCount++;
            progressCb?.(completedCount / total, completedCount);
          }
        } catch (err) {
          logger.error("Sequentially writing failed", err);
          writeError = err as Error;
        } finally {
          isWriting = false;
          if (resultsBuffer[nextIndexToWrite] !== undefined && !writeError) {
            setTimeout(flushWriter, 10);
          }
        }
      };

      const downloadAndWrite = async (index: number) => {
        try {
          await CacheService.waitIfPaused(taskId);
          if (mergeSignal.aborted) throw new Error("下载已取消");
          if (writeError) throw writeError;

          const segUrl = segmentUrls[index];
          const encryption = encryptionKey && encryptionIV ? { key: encryptionKey, iv: encryptionIV } : null;

          // 传参 retryCount=5，减少总等待时间
          const b64 = await CacheService.downloadSegment(segUrl, index, encryption, 5, taskId);
          resultsBuffer[index] = b64;

          // 触发顺序写入
          await flushWriter();

          // 如果缓冲区堆积超出限制，等待写入完成
          while (Object.keys(resultsBuffer).length > BUFFER_LIMIT && !writeError && !mergeSignal.aborted) {
            await new Promise(r => setTimeout(r, 100));
            await flushWriter();
          }
        } catch (err) {
          // 如果是写入错误或下载最终失败，提前终止整个下载
          if (!writeError) {
            writeError = err as Error;
            logger.error(`片段 ${index} 下载/写入失败，终止下载并等待后续断点续传:`, err);
            activeTask.controller.abort();
          }
          throw err;
        }
      };

      // 任务队列执行，从 resumeIndex 开始
      const indices = Array.from({ length: total - resumeIndex }, (_, i) => i + resumeIndex);
      const executePool = async () => {
        const workers = [];
        const poolSize = Math.min(CONCURRENCY, indices.length);
        for (let i = 0; i < poolSize; i++) {
          workers.push((async () => {
            while (indices.length > 0 && !mergeSignal.aborted) {
              const idx = indices.shift();
              if (idx === undefined) break;
              await downloadAndWrite(idx);
            }
          })());
        }
        await Promise.all(workers);
      };

      await executePool();

      if (mergeSignal.aborted) throw new Error("下载已取消");

      let retryCount = 0;
      while (nextIndexToWrite < total && retryCount < 20) {
        await flushWriter();
        if (nextIndexToWrite < total) {
          await new Promise(r => setTimeout(r, 200));
          retryCount++;
        }
      }
      await writeStream.close();
      await cleanupTaskTemp(taskId);

      const fileStat = await RNFetchBlob.fs.stat(normalizedDestPath);
      if (!fileStat || fileStat.size === 0) {
        throw new Error("合并后的文件为空，下载失败");
      }

      logger.info(`[CacheService] downloadM3U8AsMp4 COMPLETE - ${(fileStat.size / (1024*1024)).toFixed(2)}MB`);
      return destinationPath;
    } catch (err: any) {
      throw err;
    } finally {
      activeM3U8Tasks.delete(taskId);
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
