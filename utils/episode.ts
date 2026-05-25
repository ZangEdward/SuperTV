/**
 * 解析剧集字符串，提取标题和URL
 * 常见格式: "标题$URL" 或 "URL"
 */
export function parseEpisode(raw: string, index: number, providedTitle?: string): { title: string; url: string } {
  const defaultTitle = providedTitle || `第 ${index + 1} 集`;
  if (!raw) return { title: defaultTitle, url: "" };

  // 处理 "标题$URL" 格式
  if (raw.includes("$")) {
    const parts = raw.split("$");
    const title = parts[0].trim();
    const url = parts.slice(1).join("$").trim(); // 处理 URL 中可能包含 $ 的情况
    return { title: title || defaultTitle, url };
  }

  // 处理 "标题#URL" 格式 (某些源使用 # 分割)
  if (raw.includes("#") && !raw.startsWith("http") && !raw.startsWith("rtmp") && !raw.startsWith("file")) {
    const parts = raw.split("#");
    const title = parts[0].trim();
    const url = parts.slice(1).join("#").trim();
    return { title: title || defaultTitle, url };
  }

  // 兜底逻辑
  return { title: defaultTitle, url: raw };
}
