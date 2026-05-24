import Logger from '@/utils/Logger';

const logger = Logger.withTag('M3U8');

interface CacheEntry {
  resolution: string | null;
  timestamp: number;
}

const resolutionCache: { [url: string]: CacheEntry } = {};
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export const getResolutionFromM3U8 = async (
  url: string,
  signal?: AbortSignal
): Promise<string | null> => {
  const perfStart = performance.now();
  logger.info(`[PERF] M3U8 resolution detection START - url: ${url.substring(0, 100)}...`);
  
  // 1. Check cache first
  const cachedEntry = resolutionCache[url];
  if (cachedEntry && Date.now() - cachedEntry.timestamp < CACHE_DURATION) {
    const perfEnd = performance.now();
    logger.info(`[PERF] M3U8 resolution detection CACHED - took ${(perfEnd - perfStart).toFixed(2)}ms, resolution: ${cachedEntry.resolution}`);
    return cachedEntry.resolution;
  }

  if (!url.toLowerCase().endsWith(".m3u8")) {
    logger.info(`[PERF] M3U8 resolution detection SKIPPED - not M3U8 file`);
    return null;
  }

  try {
    const fetchStart = performance.now();
    const response = await fetch(url, { signal });
    const fetchEnd = performance.now();
    logger.info(`[PERF] M3U8 fetch took ${(fetchEnd - fetchStart).toFixed(2)}ms, status: ${response.status}`);
    
    if (!response.ok) {
      return null;
    }
    
    const parseStart = performance.now();
    const playlist = await response.text();
    const lines = playlist.split("\n");
    let highestResolution = 0;
    let resolutionString: string | null = null;

    for (const line of lines) {
      if (line.startsWith("#EXT-X-STREAM-INF")) {
        const resolutionMatch = line.match(/RESOLUTION=(\d+)x(\d+)/);
        if (resolutionMatch) {
          const height = parseInt(resolutionMatch[2], 10);
          if (height > highestResolution) {
            highestResolution = height;
            resolutionString = `${height}p`;
          }
        }
      }
    }
    
    const parseEnd = performance.now();
    logger.info(`[PERF] M3U8 parsing took ${(parseEnd - parseStart).toFixed(2)}ms, lines: ${lines.length}`);

    // 2. Store result in cache
    resolutionCache[url] = {
      resolution: resolutionString,
      timestamp: Date.now(),
    };

    const perfEnd = performance.now();
    logger.info(`[PERF] M3U8 resolution detection COMPLETE - took ${(perfEnd - perfStart).toFixed(2)}ms, resolution: ${resolutionString}`);
    
    return resolutionString;
  } catch (error) {
    const perfEnd = performance.now();
    logger.info(`[PERF] M3U8 resolution detection ERROR - took ${(perfEnd - perfStart).toFixed(2)}ms, error: ${error}`);
    return null;
  }
};

/**
 * 广告过滤：屏蔽 M3U8 中的广告片段
 * 基于关键词和 Discontinuity 模式进行识别
 */
export const filterM3U8Ads = (content: string): string => {
  const lines = content.split('\n');
  const filteredLines: string[] = [];

  // 广告关键词黑名单
  const adKeywords = [
    'ads', 'adv', 'union', 'baidu', 'google', 'doubleclick', 'analytics',
    'ad-segment', '-ad-', 'segment-ad', 'promot', 'affiliate'
  ];

  let skipNext = false;
  let discontinuityBlock: string[] = [];
  let inDiscontinuity = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (!line) continue;

    // 处理 Discontinuity 块
    if (line.startsWith('#EXT-X-DISCONTINUITY')) {
      if (inDiscontinuity) {
        // 结束上一个块，判断是否为广告
        processDiscontinuityBlock(discontinuityBlock, filteredLines, adKeywords);
        discontinuityBlock = [];
      }
      inDiscontinuity = true;
      discontinuityBlock.push(line);
      continue;
    }

    if (inDiscontinuity) {
      discontinuityBlock.push(line);
      // 如果遇到下一个 EXTINF 或者文件结束，可能需要处理块
      // 实际上，我们等下一个 DISCONTINUITY 或者文件结束
      continue;
    }

    // 普通行过滤
    if (line.startsWith('#EXTINF')) {
      const nextLine = lines[i + 1]?.trim() || '';
      const isAdUrl = adKeywords.some(key => nextLine.toLowerCase().includes(key));

      if (isAdUrl) {
        i++; // 跳过地址行
        continue;
      }
    }

    filteredLines.push(line);
  }

  // 处理最后一个 Discontinuity 块
  if (inDiscontinuity) {
    processDiscontinuityBlock(discontinuityBlock, filteredLines, adKeywords);
  }

  return filteredLines.join('\n');
};

/**
 * 处理间隔块：如果块内包含广告特征，则整块移除
 */
function processDiscontinuityBlock(block: string[], output: string[], keywords: string[]) {
  const blockContent = block.join('\n');

  // 检查是否有广告关键词
  const hasAdKeyword = keywords.some(key => blockContent.toLowerCase().includes(key));

  // 检查片段时长：如果这一块由多个极短片段组成，通常也是广告
  let totalDuration = 0;
  block.forEach(line => {
    if (line.startsWith('#EXTINF:')) {
      const duration = parseFloat(line.split(':')[1]);
      if (!isNaN(duration)) totalDuration += duration;
    }
  });

  // 如果总时长小于 15 秒且包含 discontinuity，且块内片段很多（碎片化），大概率是广告
  const isSuspicious = totalDuration > 0 && totalDuration < 15 && block.length > 5;

  if (hasAdKeyword || isSuspicious) {
    logger.info(`[AD_FILTER] Block removed: duration=${totalDuration}s, reason=${hasAdKeyword ? 'keyword' : 'short_block'}`);
    return;
  }

  output.push(...block);
}

