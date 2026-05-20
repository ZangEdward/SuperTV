// 从环境变量读取（编译时由 GitHub Secrets 注入）
// 注意：Expo 规定环境变量必须以 EXPO_PUBLIC_ 开头才能暴露给客户端
const envNodes = process.env.EXPO_PUBLIC_API_NODES_JSON;

// 默认节点仅作为结构参考，不包含真实敏感地址
const DEFAULT_NODES = [
  { key: "default", label: "官方节点", url: "https://api.example.com" },
];

const getNodes = () => {
  if (!envNodes) {
    // 如果没有环境变量（如本地开发且未配置 .env），返回默认占位节点
    return DEFAULT_NODES;
  }
  try {
    return JSON.parse(envNodes);
  } catch (e) {
    console.error("[apiNodes] Failed to parse API_NODES_JSON from env", e);
    return DEFAULT_NODES;
  }
};

export const API_NODES = getNodes();
