import Logger from '@/utils/Logger';

const logger = Logger.withTag('SpeedTest');

export interface SpeedTestResult {
  latency: number; // 延迟 (ms)
  speed: number;   // 速度 (MB/s)
}

/**
 * 测速服务：模仿 Selene-Source 的高性能并发测速逻辑
 */
export class SpeedTestService {
  private static readonly SAMPLE_SIZE = 512 * 1024; // 512KB 样本即可，2MB 太慢了
  private static readonly GLOBAL_TIMEOUT = 5000;    // 整体 5s 限制
  private static readonly RTT_TIMEOUT = 2000;      // 延迟测量 2s 限制

  /**
   * 测试单个 M3U8 链接的真实速度
   * 采用并发测速方案：同步测量 RTT 和 样本下载
   */
  static async testM3U8Speed(url: string, signal?: AbortSignal): Promise<SpeedTestResult> {
    const mainController = new AbortController();
    const timeoutId = setTimeout(() => mainController.abort(), this.GLOBAL_TIMEOUT);

    if (signal) {
      signal.addEventListener('abort', () => mainController.abort());
    }

    try {
      // 1. 获取 M3U8 内容 (同时作为第一次 RTT 参考)
      // 加时间戳参数防止 CDN 缓存干扰测速
      const cacheBustUrl = url.includes('?') ? `${url}&t=${Date.now()}` : `${url}?t=${Date.now()}`;
      const m3u8StartTime = performance.now();
      const m3u8Res = await fetch(cacheBustUrl, {
        signal: mainController.signal,
        headers: { 'Range': 'bytes=0-1024' } // 仅请求开头，大幅提速
      });

      if (!m3u8Res.ok) throw new Error('M3U8 fetch failed');
      const latency = Math.round(performance.now() - m3u8StartTime);
      const content = await m3u8Res.text();

      // 2. 解析 TS 链接
      const tsUrls = this.getTsUrls(url, content, 2);
      if (tsUrls.length === 0) {
        return { latency, speed: 0 };
      }

      // 3. 并发测速 (模仿 Selene 的多段采样)
      const downloadStartTime = performance.now();

      const downloadTasks = tsUrls.map(async (tsUrl) => {
        try {
          const res = await fetch(tsUrl, {
            signal: mainController.signal,
            headers: { 'Range': `bytes=0-${this.SAMPLE_SIZE - 1}` }
          });
          if (!res.ok && res.status !== 206) return 0;
          const buffer = await res.arrayBuffer();
          return buffer.byteLength;
        } catch {
          return 0;
        }
      });

      const results = await Promise.all(downloadTasks);
      const totalBytes = results.reduce((a, b) => a + b, 0);
      const duration = (performance.now() - downloadStartTime) / 1000; // 秒

      if (totalBytes === 0) return { latency, speed: 0 };

      const speed = (totalBytes / (1024 * 1024)) / (duration || 0.001);

      return {
        latency,
        speed: parseFloat(speed.toFixed(2))
      };

    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        return { latency: Infinity, speed: 0 };
      }
      return { latency: Infinity, speed: 0 };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * 获取前 N 个 TS 链接
   */
  private static getTsUrls(m3u8Url: string, content: string, count: number): string[] {
    const lines = content.split('\n');
    const urls: string[] = [];
    const baseUrl = m3u8Url.substring(0, m3u8Url.lastIndexOf('/') + 1);
    const origin = m3u8Url.split('/').slice(0, 3).join('/');

    for (let line of lines) {
      line = line.trim();
      if (line && !line.startsWith('#')) {
        let fullUrl = line;
        if (!line.startsWith('http')) {
          if (line.startsWith('/')) {
            fullUrl = origin + line;
          } else {
            fullUrl = baseUrl + line;
          }
        }
        urls.push(fullUrl);
        if (urls.length >= count) break;
      }
    }
    return urls;
  }

  /**
   * 格式化速度显示
   */
  static formatSpeed(mbps: number): string {
    if (mbps === 0 || mbps === Infinity) return '超时';
    if (mbps < 0.01) return '极慢';
    if (mbps < 1) return `${(mbps * 1024).toFixed(0)} KB/s`;
    return `${mbps.toFixed(1)} MB/s`;
  }
}
