import { create } from "zustand";
import { SearchResult, api } from "@/services/api";
import { getResolutionFromM3U8 } from "@/services/m3u8";
import { useSettingsStore } from "@/stores/settingsStore";
import { FavoriteManager } from "@/services/storage";
import Logger from "@/utils/Logger";

const logger = Logger.withTag('DetailStore');

export type SearchResultWithResolution = SearchResult & {
  resolution?: string | null;
  latency?: number;
};

interface DetailState {
  q: string | null;
  searchResults: SearchResultWithResolution[];
  sources: { source: string; source_name: string; resolution: string | null | undefined }[];
  detail: SearchResultWithResolution | null;
  loading: boolean;
  error: string | null;
  allSourcesLoaded: boolean;
  controller: AbortController | null;
  isFavorited: boolean;
  failedSources: Set<string>;

  init: (q: string, preferredSource?: string, id?: string) => Promise<void>;
  setDetail: (detail: SearchResultWithResolution) => Promise<void>;
  abort: () => void;
  toggleFavorite: () => Promise<void>;
  markSourceAsFailed: (source: string, reason: string) => void;
  getNextAvailableSource: (currentSource: string, episodeIndex: number) => SearchResultWithResolution | null;
  optimizeSources: () => Promise<void>;
}

const useDetailStore = create<DetailState>((set, get) => ({
  q: null,
  searchResults: [],
  sources: [],
  detail: null,
  loading: true,
  error: null,
  allSourcesLoaded: false,
  controller: null,
  isFavorited: false,
  failedSources: new Set(),

  init: async (q, preferredSource, id) => {
    const perfStart = performance.now();
    logger.info(`[PERF] DetailStore.init START - q: ${q}, preferredSource: ${preferredSource}, id: ${id}`);
    
    const { controller: oldController } = get();
    if (oldController) {
      oldController.abort();
    }
    const newController = new AbortController();
    const signal = newController.signal;

    set({
      q,
      loading: true,
      searchResults: [],
      detail: null,
      error: null,
      allSourcesLoaded: false,
      controller: newController,
    });

    const { videoSource } = useSettingsStore.getState();

    const processAndSetResults = async (results: SearchResult[], latency?: number, merge = false) => {
      const resultsWithResolution = await Promise.all(
        results.map(async (searchResult) => {
          let resolution;
          try {
            if (searchResult.episodes && searchResult.episodes.length > 0) {
              resolution = await getResolutionFromM3U8(searchResult.episodes[0], signal);
            }
          } catch (e) {
            if ((e as Error).name !== "AbortError") {
              logger.info(`Failed to get resolution for ${searchResult.source_name}`, e);
            }
          }
          return { ...searchResult, resolution, latency };
        })
      );
      
      if (signal.aborted) return;

      set((state) => {
        const existingSources = new Set(state.searchResults.map((r) => r.source));
        const newResults = resultsWithResolution.filter((r) => !existingSources.has(r.source));
        const combinedResults = merge ? [...state.searchResults, ...newResults] : resultsWithResolution;

        const finalResults = combinedResults.sort((a, b) => {
          if (b.episodes.length !== a.episodes.length) {
            return b.episodes.length - a.episodes.length;
          }
          return (a.latency || 0) - (b.latency || 0);
        });

        const preferredId = id?.toString();
        const preferredMatch = preferredId
          ? finalResults.find(
              (result) => result.id.toString() === preferredId && result.source === preferredSource
            )
          : null;

        return {
          searchResults: finalResults,
          sources: finalResults.map((r) => ({
            source: r.source,
            source_name: r.source_name,
            resolution: r.resolution,
          })),
          detail: state.detail ?? preferredMatch ?? finalResults[0] ?? null,
        };
      });
    };

    try {
      if (preferredSource && id) {
        let preferredResult: SearchResult[] = [];
        try {
          const response = await api.searchVideo(q, preferredSource, signal);
          preferredResult = response.results;
        } catch (error) {
          logger.error(`[ERROR] API searchVideo (preferred) FAILED`, error);
        }

        if (signal.aborted) return;
        
        if (preferredResult.length > 0) {
          await processAndSetResults(preferredResult, 0, false);
          set({ loading: false });
        } else {
          // Fallback
          try {
            const { results: allResults } = await api.searchVideos(q);
            if (signal.aborted) return;
            const filteredResults = allResults.filter(item => item.title && q && item.title.toLowerCase().includes(q.toLowerCase()));
            if (filteredResults.length > 0) {
              await processAndSetResults(filteredResults, 0, false);
              set({ loading: false });
            } else {
              set({ error: `未找到 "${q}" 的播放源`, loading: false });
            }
          } catch (fallbackError) {
            set({ error: "搜索失败", loading: false });
          }
        }
        
        if (preferredResult.length > 0) {
          try {
            const { results: allResults } = await api.searchVideos(q);
            if (signal.aborted) return;
            await processAndSetResults(allResults.filter(item => item.title && q && item.title.toLowerCase().includes(q.toLowerCase())), 0, true);
          } catch {}
        }
      } else {
        const allResources = await api.getResources(signal);
        const enabledResources = videoSource.enabledAll ? allResources : allResources.filter((r) => videoSource.sources[r.key]);

        if (enabledResources.length === 0) {
          set({ error: "没有可用的视频源", loading: false });
          return;
        }

        let firstResultFound = false;
        const searchPromises = enabledResources.map(async (resource) => {
          try {
            const searchStart = performance.now();
            const { results } = await api.searchVideo(q, resource.key, signal);
            const latency = performance.now() - searchStart;

            if (results.length > 0) {
              await processAndSetResults(results, latency, true);
              if (!firstResultFound) {
                set({ loading: false });
                firstResultFound = true;
              }
            }
          } catch {}
        });

        await Promise.all(searchPromises);
      }

      const finalState = get();
      if (finalState.detail) {
        const { source, id } = finalState.detail;
        const isFavorited = await FavoriteManager.isFavorited(source, id.toString());
        set({ isFavorited });
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        set({ error: "搜索失败" });
      }
    } finally {
      if (!signal.aborted) {
        set({ loading: false, allSourcesLoaded: true });
      }
    }
  },

  optimizeSources: async () => {
    const { testSourceSpeeds, sourceLatencies } = useSettingsStore.getState();
    await testSourceSpeeds();

    set((state) => {
      const updatedResults = state.searchResults.map(result => ({
        ...result,
        latency: sourceLatencies[result.source] ?? result.latency
      }));

      const finalResults = updatedResults.sort((a, b) => {
        if (b.episodes.length !== a.episodes.length) {
          return b.episodes.length - a.episodes.length;
        }
        return (a.latency || Infinity) - (b.latency || Infinity);
      });

      return {
        searchResults: finalResults,
        sources: finalResults.map((r) => ({
          source: r.source,
          source_name: r.source_name,
          resolution: r.resolution,
        })),
        // Update detail if current one is now considered "slow" or if we want to reprioritize
        detail: finalResults[0] || state.detail
      };
    });
  },

  setDetail: async (detail) => {
    set({ detail });
    const { source, id } = detail;
    const isFavorited = await FavoriteManager.isFavorited(source, id.toString());
    set({ isFavorited });
  },

  abort: () => {
    get().controller?.abort();
  },

  toggleFavorite: async () => {
    const { detail } = get();
    if (!detail) return;

    const { source, id, title, poster, source_name, episodes, year } = detail;
    const favoriteItem = {
      cover: poster,
      title,
      poster,
      source_name,
      total_episodes: episodes.length,
      search_title: get().q!,
      year: year || "",
    };

    const newIsFavorited = await FavoriteManager.toggle(source, id.toString(), favoriteItem);
    set({ isFavorited: newIsFavorited });
  },

  markSourceAsFailed: (source: string, reason: string) => {
    const { failedSources } = get();
    const newFailedSources = new Set(failedSources);
    newFailedSources.add(source);
    set({ failedSources: newFailedSources });
  },

  getNextAvailableSource: (currentSource: string, episodeIndex: number) => {
    const { searchResults, failedSources } = get();
    const availableSources = searchResults.filter(result =>
      result.source !== currentSource && 
      !failedSources.has(result.source) &&
      result.episodes && 
      result.episodes.length > episodeIndex
    );

    if (availableSources.length === 0) return null;
    
    const sortedSources = availableSources.sort((a, b) => {
      const aRes = a.resolution || '';
      const bRes = b.resolution || '';
      const priority = (res: string) => {
        if (res.includes('1080')) return 4;
        if (res.includes('720')) return 3;
        if (res.includes('480')) return 2;
        return 1;
      };
      return priority(bRes) - priority(aRes);
    });

    return sortedSources[0];
  },
}));

export default useDetailStore;
