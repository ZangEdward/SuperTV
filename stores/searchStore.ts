import { create } from "zustand";
import { SearchResult, api } from "@/services/api";
import { useSettingsStore } from "@/stores/settingsStore";
import Logger from "@/utils/Logger";

const logger = Logger.withTag("SearchStore");

// [内存级详情池]：用于实现搜索到详情的秒开过渡
// 存储多种 key 变体，提高详情页命中率
export const SearchDetailPool = new Map<string, SearchResult>();

/**
 * 生成搜索词的多种变体，用于模糊匹配
 * 例如 "海贼王第1季" -> ["海贼王第1季", "海贼王", "海贼王第1季"]
 */
export function generateFuzzyTerms(term: string): string[] {
  const variants: string[] = [];

  // 1. 原始精简版：去空格和常见符号
  const cleaned = term
    .replace(/[\s　+·./\\()（）【】\[\]《》{}：:、;；，,。！？!?""'『』«»\-—–—_*~`@#$%^&|<>]+/g, '')
    .trim();
  if (cleaned) variants.push(cleaned);

  // 2. 去除季/集后缀：人搜索通常会少打字（如"海贼王第1季"→"海贼王"）
  const seasonRemoved = cleaned.replace(/第[一二三四五六七八九十\d]+[季部期集].*$/g, '');
  if (seasonRemoved && seasonRemoved !== cleaned) variants.push(seasonRemoved);

  return variants;
}

/**
 * 向详情池填充结果，生成多个 key 变体以提高详情页命中率
 */
export function populateDetailPool(results: SearchResult[]) {
  results.forEach(r => {
    const coreTitle = r.title.trim().toLowerCase();
    // 标准 key
    SearchDetailPool.set(`${coreTitle}_${r.source}`, r);
    // 无符号 key
    const noSymbol = coreTitle.replace(/[\s+·./\\()（）【】\[\]《》{}：:、;；，,。！？!?""'『』«»\-—–—_*~`@#$%^&|<>]+/g, '');
    if (noSymbol !== coreTitle) {
      SearchDetailPool.set(`${noSymbol}_${r.source}`, r);
    }
    // 核心词 key（前6字）
    const core = coreTitle.substring(0, 6);
    if (core.length >= 3) {
      SearchDetailPool.set(`${core}_${r.source}`, r);
    }
  });
}

export interface SearchProgress {
  total: number;
  completed: number;
  currentSource: string | null;
  isComplete: boolean;
  /** 当前搜索阶段: 'precise' | 'fuzzy' */
  phase?: 'precise' | 'fuzzy';
}

interface SearchState {
  keyword: string;
  results: SearchResult[];
  loading: boolean;
  error: string | null;
  controller: AbortController | null;
  searchProgress: SearchProgress;
  useAggregatedView: boolean;

  // 筛选和排序
  selectedSource: string;
  selectedYear: string;
  selectedTitle: string;
  yearSortOrder: 'none' | 'asc' | 'desc';

  setKeyword: (keyword: string) => void;
  setUseAggregatedView: (use: boolean) => void;
  setFilters: (filters: Partial<Pick<SearchState, 'selectedSource' | 'selectedYear' | 'selectedTitle' | 'yearSortOrder'>>) => void;
  search: (keyword?: string) => Promise<void>;
  clearResults: () => void;
  abort: () => void;
}

const useSearchStore = create<SearchState>((set, get) => ({
  keyword: "",
  results: [],
  loading: false,
  error: null,
  controller: null,
  searchProgress: { total: 0, completed: 0, currentSource: null, isComplete: false },
  useAggregatedView: true,
  selectedSource: 'all',
  selectedYear: 'all',
  selectedTitle: 'all',
  yearSortOrder: 'none',

  setKeyword: (keyword) => set({ keyword }),
  setUseAggregatedView: (useAggregatedView) => set({ useAggregatedView }),
  setFilters: (filters) => set(filters),

  abort: () => {
    const { controller } = get();
    if (controller) {
      controller.abort();
      set({ controller: null });
    }
  },

  /**
   * 两阶段搜索：精准搜索 → 模糊搜索
   * Phase 1: 用原始精简词搜索（去除符号）
   * Phase 2: 若结果不足，用模糊词搜索（提取核心词）
   */
  search: async (searchText) => {
    let rawTerm = searchText || get().keyword;
    if (!rawTerm.trim()) return;

    // Step 1: 清理符号，生成精确词
    const preciseTerm = rawTerm
      .replace(/[\s　+·./\\()（）【】\[\]《》{}：:、;；，,。！？!?""'『』«»\-—–—_*~`@#$%^&|<>]+/g, '')
      .trim();

    // Step 2: 生成模糊词变体
    const fuzzyVariants = generateFuzzyTerms(rawTerm);

    // 用于搜索的 term 列表（先去重）
    const searchTerms = [preciseTerm, ...fuzzyVariants.filter(v => v !== preciseTerm)];

    // Abort previous search
    get().abort();
    const newController = new AbortController();
    const signal = newController.signal;

    set({
      loading: true,
      error: null,
      results: [],
      controller: newController,
      searchProgress: { total: 0, completed: 0, currentSource: null, isComplete: false, phase: 'precise' },
      // 重置筛选
      selectedSource: 'all',
      selectedYear: 'all',
      selectedTitle: 'all',
      yearSortOrder: 'none',
    });

    const updateProgress = (updates: Partial<SearchProgress>) => {
      if (signal.aborted) return;
      set(state => ({
        searchProgress: { ...state.searchProgress, ...updates }
      }));
    };

    // [防白屏] 节流器：将并发结果合并批量更新，避免 JS 线程被海量 set() 阻塞
    let _batchTimer: ReturnType<typeof setTimeout> | null = null;
    let _pendingResults: SearchResult[][] = [];

    const flushBatch = () => {
      if (_pendingResults.length === 0) return;
      const batch = _pendingResults.splice(0);
      // Hermes 不支持 Array.flat()，使用 reduce 展开
      const allResults = batch.reduce((acc: SearchResult[], val: SearchResult[]) => acc.concat(val), []);

      set((state) => {
        const newResults = [...state.results, ...allResults];
        const uniqueResults = Array.from(new Map(newResults.map(r => [`${r.source}_${r.id}`, r])).values());
        populateDetailPool(allResults);
        return { results: uniqueResults };
      });
    };

    const processAndAddResults = (results: SearchResult[]) => {
      if (signal.aborted || !results || results.length === 0) return;

      _pendingResults.push(results);

      if (_batchTimer) clearTimeout(_batchTimer);
      // 每 120ms 批量 flush 一次，避免高频 set() 阻塞 UI 线程
      _batchTimer = setTimeout(flushBatch, 120);
    };

    /**
     * 用指定的 term 执行一次完整搜索（32路并发）
     */
    const executeSearchPhase = async (term: string, phase: 'precise' | 'fuzzy'): Promise<boolean> => {
      if (signal.aborted) return false;

      updateProgress({ phase });

      const settingsStore = useSettingsStore.getState();
      const { videoSource } = settingsStore;
      let enabledResources = [];

      if (settingsStore.allSources && settingsStore.allSources.length > 0) {
        enabledResources = videoSource.enabledAll
          ? settingsStore.allSources
          : settingsStore.allSources.filter((r) => videoSource.sources[r.key]);
      } else {
        try {
          const allResources = await api.getResources(signal);
          enabledResources = videoSource.enabledAll
            ? allResources
            : allResources.filter((r) => videoSource.sources[r.key]);
        } catch { return false; }
      }

      if (enabledResources.length === 0 || signal.aborted) return false;

      updateProgress({ total: enabledResources.length, completed: 0 });

      let completed = 0;
      const MAX_CONCURRENT = 32;
      const queue = [...enabledResources];

      const runWorker = async () => {
        while (queue.length > 0 && !signal.aborted) {
          const resource = queue.shift();
          if (!resource) break;

          try {
            const timeoutPromise = new Promise<null>((_, reject) =>
              setTimeout(() => reject(new Error('TIMEOUT')), 8000)
            );

            const results = await Promise.race([
              api.searchVideo(term, resource.key, signal).then(r => r.results),
              timeoutPromise
            ]) as SearchResult[] | null;

            if (!signal.aborted && results && results.length > 0) {
              processAndAddResults(results);
            }
          } catch {
            // 单个源失败不影响其他源
          } finally {
            completed++;
            if (completed % 2 === 0 || completed === enabledResources.length) {
              updateProgress({ completed });
            }
          }
        }
      };

      const workers = Array(Math.min(MAX_CONCURRENT, enabledResources.length))
        .fill(null)
        .map(() => runWorker());

      // 额外同步全网搜索
      const globalSearchTask = api.searchVideos(term).then(res => {
        if (!signal.aborted && res?.results) {
          processAndAddResults(res.results);
        }
      }).catch(() => {});

      await Promise.all([...workers, globalSearchTask]);

      // 阶段结束时强制 flush 一次，确保所有结果已提交
      flushBatch();

      return !signal.aborted;
    };

    try {
      // ============ Phase 1: 精准搜索 ============
      await executeSearchPhase(preciseTerm, 'precise');
      if (signal.aborted) return;

      // ============ Phase 2: 模糊搜索（全量执行所有变体） ============
      // 剧名可能包含搜索词，所以始终执行模糊搜索以确保召回率
      // [防白屏] 每阶段之间暂停 500ms，让 UI 线程有时间刷新界面
      for (const fuzzyTerm of searchTerms) {
        if (signal.aborted) break;
        if (fuzzyTerm === preciseTerm) continue;
        // 检查该模糊词是否与精准词过于相似（防止重复搜索）
        if (preciseTerm.includes(fuzzyTerm) || fuzzyTerm.includes(preciseTerm)) continue;

        // 阶段间间隔，防止 JS 线程被连续阻塞
        await new Promise(r => setTimeout(r, 500));
        if (signal.aborted) return;

        await executeSearchPhase(fuzzyTerm, 'fuzzy');
        if (signal.aborted) return;
      }

      // 最终同步状态
      if (!signal.aborted) {
        const finalResults = get().results;
        set({ loading: false });
        updateProgress({ isComplete: true, completed: get().searchProgress.total });

        if (finalResults.length === 0) {
          set({ error: `未找到"${rawTerm}"相关内容，建议简化关键词后重试` });
        }
      }

    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        set({ error: "搜索失败，请稍后重试。", loading: false });
      }
    }
  },

  clearResults: () => {
    get().abort();
    set({ results: [], error: null, keyword: "" });
  },
}));

export default useSearchStore;
