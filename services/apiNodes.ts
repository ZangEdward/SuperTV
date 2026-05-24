// 从环境变量读取（编译时由 GitHub Secrets 注入）
const envNodes = process.env.EXPO_PUBLIC_API_NODES_JSON;

// 默认节点仅作为结构参考
const DEFAULT_NODES = [
  { key: "default", label: "演示节点", url: "https://api.example.com" },
];

const getNodes = () => {
  if (!envNodes || envNodes === "[]") {
    // 如果没有环境变量或为空数组，返回默认占位节点并标记为非预设
    return { nodes: DEFAULT_NODES, hasPreset: false };
  }
  try {
    const parsed = JSON.parse(envNodes);
    return { nodes: parsed, hasPreset: true };
  } catch (e) {
    console.error("[apiNodes] Failed to parse API_NODES_JSON from env", e);
    return { nodes: DEFAULT_NODES, hasPreset: false };
  }
};

const result = getNodes();
export const API_NODES = result.nodes;
export const HAS_PRESET_NODES = result.hasPreset;
