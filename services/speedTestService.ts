import Logger from '@/utils/Logger';

const logger = Logger.withTag('SpeedTest');

export interface SpeedTestResult {
  latency: number;
  speed: number; // in MB/s
}

/**
 * 测速服务：针对 M3U8 视频源进行深度测速
 * 逻辑：下载 M3U8 -> 解析第一个 TS -> 下载前 2MB -> 计算延迟和平均速度
 */
export class SpeedTestService {
  private static readonly MAX_TEST_SIZE = 2 * 1024 * 1024; // 2MB
  private static readonly TIMEOUT = 2000; // 2s 超时

  /**
   * 测试单个 M3U8 链接的真实速度
   */
  static async testM3U8Speed(url: string, signal?: AbortSignal): Promise<SpeedTestResult> {
    const startTime = performance.now();
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), this.TIMEOUT);

    // 监听外部取消信号
    if (signal) {
        signal.addEventListener('abort', () => timeoutController.abort());
    }

    try {
      // 1. 获取 M3U8 内容
      const m3u8Res = await fetch(url, { signal: timeoutController.signal });
      if (!m3u8Res.ok) throw new Error('M3U8 fetch failed');

      const latency = Math.round(performance.now() - startTime);
      const content = await m3u8Res.text();

      // 2. 解析第一个有效 TS 链接
      const tsUrl = this.getFirstTsUrl(url, content);
      if (!tsUrl) {
        return { latency, speed: 0 };
      }

      // 3. 下载前 2MB 数据并计算速度
      const downloadStartTime = performance.now();
      const tsRes = await fetch(tsUrl, {
        signal: timeoutController.signal,
        headers: {
            'Range': `bytes=0-${this.MAX_TEST_SIZE - 1}`
        }
      });

      if (!tsRes.ok && tsRes.status !== 206) throw new Error('TS fetch failed');

      // 读取二进制数据以确保真实下载发生
      const buffer = await tsRes.arrayBuffer();
      const receivedLength = buffer.byteLength;

      const duration = (performance.now() - downloadStartTime) / 1000; // seconds
      const speed = receivedLength / (1024 * 1024) / (duration || 0.001); // MB/s

      return {
        latency,
        speed: parseFloat(speed.toFixed(2))
      };

    } catch (e) {
      if ((e as Error).name === 'AbortError') {
          // 判断是超时还是用户手动取消
          if (!signal?.aborted) {
              logger.debug(`Speed test timeout (2s) for ${url}`);
          }
          return { latency: Infinity, speed: 0 };
      }
      logger.warn(`Speed test failed for ${url}:`, e);
      return { latency: Infinity, speed: 0 };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * 从 M3U8 内容中提取第一个 TS 链接，处理相对路径
   */
  private static getFirstTsUrl(m3u8Url: string, content: string): string | null {
    const lines = content.split('\n');
    let tsPath = '';

    for (let line of lines) {
      line = line.trim();
      if (line && !line.startsWith('#')) {
        tsPath = line;
        break;
      }
    }

    if (!tsPath) return null;

    // 处理绝对路径
    if (tsPath.startsWith('http')) return tsPath;

    // 处理相对路径
    const baseUrl = m3u8Url.substring(0, m3u8Url.lastIndexOf('/') + 1);
    if (tsPath.startsWith('/')) {
      const origin = m3u8Url.split('/').slice(0, 3).join('/');
      return origin + tsPath;
    }

    return baseUrl + tsPath;
  }

  /**
   * 格式化速度显示
   */
  static formatSpeed(mbps: number): string {
    if (mbps === 0) return '不可用';
    if (mbps < 1) return `${(mbps * 1024).toFixed(0)} KB/s`;
    return `${mbps.toFixed(2)} MB/s`;
  }
}
