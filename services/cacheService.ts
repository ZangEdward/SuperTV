import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import { Platform } from "react-native";
import Logger from "@/utils/Logger";
import CryptoJS from 'crypto-js';
import RNFetchBlob from 'react-native-blob-util';

const logger = Logger.withTag("CacheService");
const STORAGE_KEY = "mytv_cached_videos";

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
    const keyWordArray = CryptoJS.lib.WordArray.create(key);
    const ivWordArray = CryptoJS.lib.WordArray.create(iv);
    const base64 = arrayBufferToBase64(buffer);
    const decrypted = aes128CbcDecrypt(base64, keyWordArray, ivWordArray);
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
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  // 使用 global.btoa 或兼容方案
  if (typeof btoa === 'function') {
    return btoa(binary);
  } else {
    // 兜底方案，如果环境没有 btoa
    const base64Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let res = '';
    for (let i = 0; i < len; i += 3) {
      const a = bytes[i];
      const b = i + 1 < len ? bytes[i + 1] : 0;
      const c = i + 2 < len ? bytes[i + 2] : 0;
      res += base64Chars[a >> 2];
      res += base64Chars[((a & 3) << 4) | (b >> 4)];
      res += i + 1 < len ? base64Chars[((b & 15) << 2) | (c >> 6)] : '=';
      res += i + 2 < len ? base64Chars[c & 63] : '=';
    }
    return res;
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
    if (extension === "m3u8") {
      extension = "mp4";
    }
    const normalizedSource = source.replace(/[^a-zA-Z0-9_-]/g, "_");
    const normalizedId = id.toString().replace(/[^a-zA-Z0-9_-]/g, "_");
    return `${normalizedSource}_${normalizedId}_${episodeIndex + 1}_${Date.now()}.${extension}`;
  }

  static resolveUrl(url: string, baseUrl: string): string {
    try {
      return new URL(url, baseUrl).href;
    } catch {
      if (/^https?:\/\//i.test(url)) return url;
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
   * 修复：使用 react-native-blob-util.appendFile 直接追加二进制数据，
   * 避免 base64 拼接损坏导致播放器提示"已取消"
   */
  static async downloadM3U8AsMp4(
    url: string,
    destinationPath: string,
    itemId?: string,
    signal?: AbortSignal,
    progressCb?: (progress: number) => void
  ): Promise<string> {
    const start = Date.now();
    logger.info(`[CacheService] downloadM3U8AsMp4 START - ${url}`);

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
      const fetchText = async (uri: string): Promise<string> => {
        const response = await fetch(uri, { signal: mergeSignal });
        if (!response.ok) throw new Error(`无法获取 M3U8 文件：${response.status}`);
        return await response.text();
      };

      await CacheService.waitIfPaused(taskId);
      if (mergeSignal.aborted) throw new Error("下载已取消");

      // 解析主 playlist
      logger.info(`[CacheService] Fetching playlist from ${url}`);
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
          const resp = await fetch(keyUrl, { signal: mergeSignal });
          const buf = await resp.arrayBuffer();
          encryptionKey = new Uint8Array(buf);
          if (mediaParsed.encryption.iv) {
            const hex = mediaParsed.encryption.iv.replace('0x', '');
            encryptionIV = new Uint8Array(hex.match(/.{1,2}/g)!.map(b => parseInt(b, 16)));
          }
        } catch (e) {
          logger.warn("获取加密密钥失败", e);
          throw new Error("获取解密密钥失败");
        }
      }

      if (!destinationPath.endsWith('.mp4')) {
        destinationPath = destinationPath.replace(/\.[^/.]+$/, '') + '.mp4';
      }

      // 确保目录存在并清理旧文件
      const destDir = destinationPath.substring(0, destinationPath.lastIndexOf('/'));
      await FileSystem.makeDirectoryAsync(destDir, { intermediates: true });
      try { await FileSystem.deleteAsync(destinationPath, { idempotent: true }); } catch (e) { }

      const segmentUrls = mediaParsed.segments.map(s => CacheService.resolveUrl(s, mediaPlaylistUrl));
      const total = segmentUrls.length;
      const CONCURRENCY = 16; // 提高并发数
      let completedCount = 0;

      // 修复：react-native-blob-util 在某些版本上对 file:// 前缀处理不一，建议移除
      const normalizedDestPath = Platform.OS === 'android' ? destinationPath.replace('file://', '') : destinationPath;

      logger.info(`[CacheService] Starting download to ${normalizedDestPath}, total segments: ${total}`);

      // 创建空的目标文件
      await RNFetchBlob.fs.writeFile(normalizedDestPath, '', 'utf8');

      // 结果缓冲区，按索引存储下载好的片段
      const resultsBuffer: { [index: number]: string } = {};
      let nextIndexToWrite = 0;
      let isWriting = false;

      // 顺序写入锁
      const tryWriteSequentially = async () => {
        if (isWriting) return;
        isWriting = true;
        try {
          while (resultsBuffer[nextIndexToWrite] !== undefined) {
            const data = resultsBuffer[nextIndexToWrite];
            await RNFetchBlob.fs.appendFile(normalizedDestPath, data, 'base64');
            delete resultsBuffer[nextIndexToWrite];
            nextIndexToWrite++;
            completedCount++;
            progressCb?.(completedCount / total);
          }
        } catch (err) {
          logger.warn("Sequentially writing failed", err);
        } finally {
          isWriting = false;
        }
      };

      // 下载并立即尝试顺序写入
      const downloadAndWrite = async (index: number) => {
        try {
          const segUrl = segmentUrls[index];
          const b64 = await downloadSegment(segUrl, index);
          resultsBuffer[index] = b64;
          await tryWriteSequentially();
        } catch (err) {
          logger.warn(`Segment ${index} download failed`, err);
          throw err;
        }
      };

      // 任务队列执行
      const indices = Array.from({ length: total }, (_, i) => i);
      const executePool = async () => {
        const workers = [];
        for (let i = 0; i < Math.min(CONCURRENCY, total); i++) {
          workers.push((async () => {
            while (indices.length > 0) {
              const idx = indices.shift();
              if (idx === undefined) break;
              await downloadAndWrite(idx);
            }
          })());
        }
        await Promise.all(workers);
      };

      await executePool();

      // 验证文件完整性
      const fileStat = await RNFetchBlob.fs.stat(normalizedDestPath);
      if (!fileStat || fileStat.size === 0) {
        throw new Error("合并后的文件为空，下载失败");
      }

      const elapsed = Date.now() - start;
      logger.info(`[CacheService] downloadM3U8AsMp4 COMPLETE - ${(fileStat.size / (1024*1024)).toFixed(2)}MB saved to ${destinationPath} in ${elapsed}ms`);

      return destinationPath;
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
        const defaultHeaders: Record<string, string> = {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': '*/*',
          'Connection': 'keep-alive',
        };
        const mergedOptions = {
          ...options || {},
          headers: { ...defaultHeaders, ...(options?.headers || {}) },
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
      } catch (err) {
        reject(err);
      }
    });
  }

  static getDownloadDirectory(): string {
    return DOWNLOAD_DIR;
  }
}
