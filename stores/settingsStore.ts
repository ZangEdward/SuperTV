import { create } from "zustand";
import { SettingsManager } from "@/services/storage";
import { api, ServerConfig } from "@/services/api";
import { storageConfig } from "@/services/storageConfig";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Logger from "@/utils/Logger";

const logger = Logger.withTag("SettingsStore");

const API_NODES = [
  "https://ltv.955598.xyz",
  "https://atv.955598.xyz",
  "https://ctv.955598.xyz",
  "https://ltv.lzsb.edu.eu.org",
];

interface SettingsState {
  apiBaseUrl: string;
  nodeLatencies: Record<string, number>;
  m3uUrl: string;
  remoteInputEnabled: boolean;
  videoSource: {
    enabledAll: boolean;
    sources: { [key: string]: boolean };
  };
  sourceLatencies: Record<string, number>;
  allSources: ApiSite[];
  isLoadingSources: boolean;
  isModalVisible: boolean;
  serverConfig: ServerConfig | null;
  isLoadingServerConfig: boolean;

  loadSettings: () => Promise<void>;
  fetchServerConfig: () => Promise<void>;
  setApiBaseUrl: (url: string) => void;
  setM3uUrl: (url: string) => void;
  setRemoteInputEnabled: (enabled: boolean) => void;
  saveSettings: () => Promise<void>;
  setVideoSource: (config: { enabledAll: boolean; sources: { [key: string]: boolean } }) => void;
  showModal: () => void;
  hideModal: () => void;

  autoSelectFastestApi: () => Promise<void>;
  fetchAllSources: () => Promise<void>;
  testSourceSpeeds: () => Promise<void>;
  toggleSource: (key: string, enabled: boolean) => void;
}

// 安全锁：仅允许按钮触发的节点测速
let _allowNodeTest = false;
export function __allowNodeTestOnce() { _allowNodeTest = true; }

export const useSettingsStore = create<SettingsState>((set, get) => ({
  apiBaseUrl: "",
  nodeLatencies: {},
  m3uUrl: "",
  remoteInputEnabled: false,
  isModalVisible: false,
  serverConfig: null,
  isLoadingServerConfig: false,
  videoSource: {
    enabledAll: true,
    sources: {},
  },
  sourceLatencies: {},
  allSources: [],
  isLoadingSources: false,

  loadSettings: async () => {
    const settings = await SettingsManager.get();

    set({
      apiBaseUrl: settings.apiBaseUrl,
      m3uUrl: settings.m3uUrl,
      remoteInputEnabled: settings.remoteInputEnabled || false,
      videoSource: settings.videoSource || { enabledAll: true, sources: {} },
    });

    if (settings.apiBaseUrl) {
      api.setBaseUrl(settings.apiBaseUrl);
      await get().fetchServerConfig();
    } else {
      // 首次启动：使用默认节点，保存到存储，绝不测速
      const defaultUrl = API_NODES[0];
      set({ apiBaseUrl: defaultUrl });
      api.setBaseUrl(defaultUrl);
      await SettingsManager.save({
        ...settings,
        apiBaseUrl: defaultUrl,
      });
      await get().fetchServerConfig();
    }
  },

  fetchAllSources: async () => {
    set({ isLoadingSources: true });
    try {
      const sources = await api.getResources();
      set({ allSources: sources });
      const { videoSource } = get();
      const newSources = { ...videoSource.sources };
      let changed = false;
      sources.forEach(s => {
        if (newSources[s.key] === undefined) {
          newSources[s.key] = true;
          changed = true;
        }
      });
      if (changed) {
        set({ videoSource: { ...videoSource, sources: newSources } });
      }
    } catch (error) {
      logger.error("Failed to fetch sources:", error);
    } finally {
      set({ isLoadingSources: false });
    }
  },

  testSourceSpeeds: async () => {
    const { allSources, videoSource } = get();
    const latencies: Record<string, number> = {};
    const newSources = { ...videoSource.sources };

    const testSpeed = async (sourceKey: string): Promise<number> => {
      const start = Date.now();
      try {
        const res = await api.searchVideo("1", sourceKey);
        return Date.now() - start;
      } catch {
        return Infinity;
      }
    };

    const results = await Promise.all(
      allSources.map(async (s) => ({
        key: s.key,
        time: await testSpeed(s.key),
      }))
    );

    results.forEach(r => {
      latencies[r.key] = r.time;
      if (r.time > 3000) {
        newSources[r.key] = false;
      } else {
        newSources[r.key] = true;
      }
    });

    set({
      sourceLatencies: latencies,
      videoSource: { ...videoSource, sources: newSources }
    });

    await get().saveSettings();
  },

  toggleSource: (key, enabled) => {
    const { videoSource } = get();
    const newSources = { ...videoSource.sources, [key]: enabled };
    set({ videoSource: { ...videoSource, sources: newSources } });
  },

  // 仅在按钮点击解锁后执行测速切换
  autoSelectFastestApi: async () => {
    if (!_allowNodeTest) {
      logger.warn("[autoSelectFastestApi] 忽略非按钮触发的测速调用");
      return;
    }
    _allowNodeTest = false;

    const testSpeed = async (baseUrl: string): Promise<number> => {
      const url = `${baseUrl}/icons/icon-512x512.png?t=${Date.now()}`;
      const start = Date.now();
      try {
        const res = await fetch(url, { method: "HEAD", cache: "no-store" });
        if (!res.ok) throw new Error("Bad response");
        return Date.now() - start;
      } catch {
        return Infinity;
      }
    };

    const results = await Promise.all(
      API_NODES.map(async (url) => ({
        url,
        time: await testSpeed(url),
      }))
    );

    const latencyMap: Record<string, number> = {};
    results.forEach(r => latencyMap[r.url] = r.time);
    set({ nodeLatencies: latencyMap });

    const fastest = results.reduce((a, b) => (a.time < b.time ? a : b));
    const finalUrl = fastest.time === Infinity ? API_NODES[0] : fastest.url;

    logger.info("Fastest API selected:", finalUrl);

    set({ apiBaseUrl: finalUrl });
    api.setBaseUrl(finalUrl);

    await SettingsManager.save({
      ...(await SettingsManager.get()),
      apiBaseUrl: finalUrl,
    });

    await get().fetchServerConfig();
  },

  fetchServerConfig: async () => {
    set({ isLoadingServerConfig: true });
    try {
      const config = await api.getServerConfig();
      if (config) {
        storageConfig.setStorageType(config.StorageType);
        set({ serverConfig: config });
      }
    } catch (error) {
      set({ serverConfig: null });
      logger.error("Failed to fetch server config:", error);
    } finally {
      set({ isLoadingServerConfig: false });
    }
  },

  setApiBaseUrl: (url) => set({ apiBaseUrl: url }),
  setM3uUrl: (url) => set({ m3uUrl: url }),
  setRemoteInputEnabled: (enabled) => set({ remoteInputEnabled: enabled }),
  setVideoSource: (config) => set({ videoSource: config }),

  saveSettings: async () => {
    const { apiBaseUrl, m3uUrl, remoteInputEnabled, videoSource } = get();
    const currentSettings = await SettingsManager.get();
    const currentApiBaseUrl = currentSettings.apiBaseUrl;

    let processedApiBaseUrl = apiBaseUrl.trim();
    if (processedApiBaseUrl.endsWith("/")) {
      processedApiBaseUrl = processedApiBaseUrl.slice(0, -1);
    }

    if (!/^https?:///i.test(processedApiBaseUrl)) {
      processedApiBaseUrl = "https://" + processedApiBaseUrl;
    }

    await SettingsManager.save({
      apiBaseUrl: processedApiBaseUrl,
      m3uUrl,
      remoteInputEnabled,
      videoSource,
    });

    if (currentApiBaseUrl !== processedApiBaseUrl) {
      await AsyncStorage.setItem("authCookies", "");
    }

    api.setBaseUrl(processedApiBaseUrl);
    set({ isModalVisible: false, apiBaseUrl: processedApiBaseUrl });
    await get().fetchServerConfig();
  },

  showModal: () => set({ isModalVisible: true }),
  hideModal: () => set({ isModalVisible: false }),
}));
