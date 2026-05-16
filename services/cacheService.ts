import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system";
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
    encrypted: boolean;
  } {
    const lines = playlist.split(/\r?\n/).map((line) => line.trim());
    const variants: M3U8Variant[] = [];
    const segments: string[] = [];
    let currentVariant: Partial<M3U8Variant> | null = null;
    let encrypted = false;

    for (const line of lines) {
      if (!line || line.startsWith("#EXTM3U")) continue;
      if (line.startsWith("#EXT-X-KEY")) {
        encrypted = true;
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
      encrypted,
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

  static async downloadM3U8AsMp4(url: string, destinationPath: string, signal?: AbortSignal): Promise<string> {
    const start = Date.now();
    logger.info(`[CacheService] downloadM3U8AsMp4 START - ${url}`);
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
    if (parsed.encrypted) {
      throw new Error("加密的 m3u8 暂不支持缓存转换");
    }

    let mediaPlaylistUrl = url;
    let mediaParsed = parsed;
    if (parsed.isMaster) {
      const bestVariant = CacheService.selectBestVariant(parsed.variants);
      if (!bestVariant.uri) {
        throw new Error("无法解析 m3u8 播放列表中的子流");
      }
      mediaPlaylistUrl = CacheService.resolveUrl(bestVariant.uri, url);
      const loaded = await loadPlaylist(mediaPlaylistUrl);
      if (loaded.parsed.encrypted) {
        throw new Error("加密的 m3u8 暂不支持缓存转换");
      }
      mediaParsed = loaded.parsed;
    }

    if (mediaParsed.segments.length === 0) {
      throw new Error("m3u8 中未找到可下载的片段");
    }

    // 清理目标文件并准备写入
    if (await RNFetchBlob.fs.exists(destinationPath)) {
      await RNFetchBlob.fs.unlink(destinationPath);
    }
    const writeStream = await RNFetchBlob.fs.writeStream(destinationPath, "base64", true);

    let index = 0;
    for (const segment of mediaParsed.segments) {
      if (signal?.aborted) {
        await writeStream.close();
        throw new Error("下载已取消");
      }
      index += 1;
      const segmentUrl = CacheService.resolveUrl(segment, mediaPlaylistUrl);
      logger.info(`[CacheService] 下载片段 ${index}/${mediaParsed.segments.length}: ${segmentUrl}`);
      const response = await RNFetchBlob.fetch("GET", segmentUrl);
      const status = response.info().status;
      if (status !== 200) {
        await writeStream.close();
        throw new Error(`片段下载失败：${segmentUrl} (${status})`);
      }
      const base64 = response.base64();
      await writeStream.write(base64);
    }

    await writeStream.close();
    const elapsed = Date.now() - start;
    logger.info(`[CacheService] downloadM3U8AsMp4 COMPLETE - saved to ${destinationPath} in ${elapsed}ms`);
    return destinationPath;
  }

  static getDownloadDirectory(): string {
    return DOWNLOAD_DIR;
  }
}
