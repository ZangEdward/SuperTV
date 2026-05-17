import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import RNFetchBlob from "react-native-blob-util";
import Logger from "@/utils/Logger";

const logger = Logger.withTag("CacheService");
const STORAGE_KEY = "mytv_cached_videos";
const DOWNLOAD_DIR = `${FileSystem.documentDirectory}cached_videos/`;

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
            totalSize += info.size;
          }
        }
      }
      return totalSize;
    } catch (error) {
      logger.warn("Failed to calculate cache size:", error);
      return 0;
    }
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

  static async downloadM3U8AsMp4(
    url: string,
    destinationPath: string,
    signal?: AbortSignal,
    progressCb?: (progress: number) => void
  ): Promise<string> {
    const start = Date.now();
    logger.info(`[CacheService] downloadAndMergeM3U8 START - ${url}`);
    const fetchText = async (uri: string): Promise<string> => {
      const response = await fetch(uri, { signal });
      if (!response.ok) {
        throw new Error(`无法获取 M3U8 文件：${response.status}`);
      }
      return await response.text();
    };

    const loadPlaylist = async (uri: string) => {
      const playlistText = await fetchText(uri);
      const parsed = CacheService.parseM3U8Playlist(playlistText);
      return { playlistText, parsed };
    };

    const { playlistText, parsed } = await loadPlaylist(url);

    let mediaPlaylistUrl = url;
    let mediaParsed = parsed;
    if (parsed.isMaster) {
      const bestVariant = CacheService.selectBestVariant(parsed.variants);
      if (!bestVariant.uri) {
        throw new Error("无法解析 m3u8 播放列表中的子流");
      }
      mediaPlaylistUrl = CacheService.resolveUrl(bestVariant.uri, url);
      const loaded = await loadPlaylist(mediaPlaylistUrl);
      mediaParsed = loaded.parsed;
    }

    if (mediaParsed.segments.length === 0) {
      throw new Error("m3u8 中未找到可下载的片段");
    }

    let encryptionKey: Uint8Array | null = null;
    let encryptionIV: Uint8Array | null = null;

    if (mediaParsed.encryption && mediaParsed.encryption.method === 'AES-128') {
      const keyUrl = CacheService.resolveUrl(mediaParsed.encryption.uri, mediaPlaylistUrl);
      try {
        const resp = await fetch(keyUrl, { signal });
        const buf = await resp.arrayBuffer();
        encryptionKey = new Uint8Array(buf);

        if (mediaParsed.encryption.iv) {
          encryptionIV = new Uint8Array(mediaParsed.encryption.iv.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
        }
      } catch (e) {
        logger.warn("获取加密密钥失败", e);
        throw new Error("获取解密密钥失败");
      }
    }

    // 直接准备写入最终目标文件
    if (await RNFetchBlob.fs.exists(destinationPath)) {
      await RNFetchBlob.fs.unlink(destinationPath);
    }
    // 创建一个空文件
    await RNFetchBlob.fs.createFile(destinationPath, '', 'utf8');

    let index = 0;
    const total = mediaParsed.segments.length;
    const CONCURRENCY = 5; // 并发下载片段数

    const downloadSegment = async (segment: string, segmentIndex: number) => {
      if (signal?.aborted) return;

      const segmentUrl = CacheService.resolveUrl(segment, mediaPlaylistUrl);
      const segmentTempPath = `${destinationPath}_part_${segmentIndex}`;

      try {
        const response = await RNFetchBlob.config({
          path: segmentTempPath,
          // 增加超时设置
          timeout: 60000,
          // 允许在没有网络连接时排队
          fileCache: true,
        }).fetch("GET", segmentUrl, {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        });

        if (response.info().status !== 200) {
          throw new Error(`片段 ${segmentIndex} 下载失败: ${response.info().status}`);
        }

        if (encryptionKey) {
          let data = await RNFetchBlob.fs.readFile(segmentTempPath, "base64");
          // TODO: AES-128-CBC 解密
          return { index: segmentIndex, data, isRaw: false, path: segmentTempPath };
        }

        return { index: segmentIndex, isRaw: true, path: segmentTempPath };
      } catch (err) {
        logger.warn(`片段 ${segmentIndex} 下载异常`, err);
        throw err;
      }
    };

    // 分批次并发下载并顺序合并
    for (let i = 0; i < total; i += CONCURRENCY) {
      if (signal?.aborted) {
        throw new Error("下载已取消");
      }

      const batch = mediaParsed.segments.slice(i, i + CONCURRENCY);
      try {
        const results = await Promise.all(
          batch.map((seg, batchIndex) => downloadSegment(seg, i + batchIndex))
        );

        // 按顺序将下载好的片段追加到主文件
        for (const res of results) {
          if (!res) continue;
          if (res.isRaw) {
            await RNFetchBlob.fs.appendFile(destinationPath, res.path, "uri");
          } else {
            await RNFetchBlob.fs.appendFile(destinationPath, res.data as string, "base64");
          }
          await RNFetchBlob.fs.unlink(res.path);

          index += 1;
          // 只有进度发生显著变化时才回调，减少 UI 刷新压力
          if (index % 5 === 0 || index === total) {
            try {
              progressCb?.(index / total);
            } catch {}
          }
        }
      } catch (err) {
        logger.warn(`Batch download failed at index ${i}`, err);
        // 如果是终止信号则退出
        if (signal?.aborted) throw new Error("下载已取消");
        // 否则可以尝试重试逻辑，这里先简单抛出
        throw err;
      }
    }

    const elapsed = Date.now() - start;
    logger.info(`[CacheService] downloadAndMergeM3U8 COMPLETE - saved to ${destinationPath} in ${elapsed}ms`);

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
        const resumable = FileSystem.createDownloadResumable(
          url,
          destinationPath,
          options || {},
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
