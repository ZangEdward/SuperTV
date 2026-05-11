import { create } from "zustand";
import { SettingsManager } from "@/services/storage";
import { api, ServerConfig } from "@/services/api";
import { storageConfig } from "@/services/storageConfig";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Logger from "@/utils/Logger";

const logger = Logger.withTag("SettingsStore");

// 🚀 预设节点（不带 n.json）
const API_NODES = [
  "https://ltv.955598.xyz",
  "https://atv.955598.xyz",
  "https://ctv.955598.xyz",
  "https://ltv.lzsb.edu.eu.org",
];

interface SettingsState {
  apiBaseUrl: string;
  m3uUrl: string;
  remoteInputEnabled: boolean;
  videoSource: {
    enabledAll: boolean;
    sources: { [key: string]: boolean };
  };
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
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  apiBaseUrl: "",
  m3uUrl: "",
  remoteInputEnabled: false,
  isModalVisible: false,
  serverConfig: null,
  isLoadingServerConfig: false,
  videoSource: {
    enabledAll: true,
    sources: {},
  },

  // 🚀 APP 启动时加载设置 + 自动测速
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
      await get().autoSelectFastestApi();
    }
  },

  // 🚀 自动测速并选择最快节点（使用 favicon.ico）
  autoSelectFastestApi: async () => {
    const testSpeed = async (baseUrl: string): Promise<number> => {
      const url = `${baseUrl}/favicon.ico`;
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

    if (!/^https?:\/\//i.test(processedApiBaseUrl)) {
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