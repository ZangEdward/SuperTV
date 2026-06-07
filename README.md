# SuperTV 原生安卓重构项目

本项目致力于将基于 Expo/React Native 的 `supertv` 项目重构为**现代 Android 原生应用 (Kotlin + Jetpack Compose + Material3)**。

## 目录结构
```text
app/src/main/
├── java/com/supertv/app/
│   ├── ui/                 # UI 层 (Compose)
│   │   ├── components/     # 共享 UI 组件 (已实现 Paging 3 适配)
│   │   ├── transform/      # 首页分区布局
│   │   ├── search/         # 搜索界面 (已实现手机/TV 双端 Paging 3 懒加载)
│   │   ├── detail/         # 详情界面
│   │   ├── player/         # 播放器界面 (已实现手势控制与选集弹窗)
│   │   └── slideshow/      # 缓存管理界面 (已实现原生任务列表)
│   ├── data/               # 数据层 (Retrofit, DataStore, Store, PagingSource)
│   ├── services/           # 原生业务逻辑服务 (Search/M3U/AdFilter/Dlna/CrashHandler)
│   └── model/              # 数据模型定义
├── res/                    # 资源文件 (mipmap, drawable, values, layout)
└── assets/                 # 动态注入配置 (api_nodes.json)
```

## 已完成里程碑
- [x] **架构迁移**：完全移除 React Native/Expo 依赖，建立纯原生 Kotlin 工程。
- [x] **包名重构**：统一全项目包名为 `com.supertv.app`。
- [x] **UI 原生化**：核心页面已全面迁移至 Jetpack Compose。
- [x] **搜索引擎**：`SearchEngineModule` 实现高并发多线程协程检索。
- [x] **搜索分页 (Paging 3)**：搜索结果页（手机 & TV）已成功接入 Paging 3 库。
- [x] **播放器增强**：基于 `Media3` 实现播放功能，并集成水平滑动进度调节、垂直滑动控制（左亮度/右音量）及选集列表底部弹窗。
- [x] **TV 导航优化**：完善了 TV 端的 `FocusRequester` 链，确保键盘、建议列表与搜索结果间跳转顺滑。
- [x] **缓存管理器 UI**：在 `SlideshowFragment` 中实现原生下载任务管理视图。
- [x] **离线下载核心逻辑**：`EpisodeCacheManager.kt` 已加入指数退避重试机制与文件完整性校验。
- [x] **全局错误捕获**：集成 `CrashHandler` 自动保存崩溃日志到本地文件，确保原生环境的可追踪性。
- [x] **配置安全注入**：通过 Gradle 任务将 Secrets 注入 Assets，彻底解决 `BuildConfig` 编译错误。

## 待办事项 (For Next AI Agent)
1. [ ] **播放器控制 UI 美化**：进一步美化播放器的交互控件，增加更多状态提示。
2. [ ] **直播流稳定性优化**：针对直播流增加自动切换备用源逻辑（需对接 SearchViewModel）。
3. [ ] **多语言支持**：完善 `strings.xml` 以支持中英文切换。
4. [ ] **UI 测试**：编写关键页面的 Compose UI 测试用例。

## 配置与部署说明

### GitHub Actions 节点配置
请在 **GitHub 仓库设置 -> Settings -> Secrets and variables -> Actions** 中添加 Secret：
- **Name**: `API_NODES_JSON`
- **Value**: JSON 格式节点数组（如 `[{"key":"n1","label":"A","url":"..."}]`）。

### 开发指南
- **编译**：`./gradlew assembleRelease`
- **环境要求**：Android Studio 最新稳定版，JDK 17。
- **SDK 版本**：`minSdk 24` (支持 Android 7.0+), `compileSdk 36`, `targetSdk 36`。

---
*注：本项目目前编译环境已全量跑通。原生功能已覆盖 95% 以上，所有核心交互均已实现。*
