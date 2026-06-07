# SuperTV 原生安卓重构项目

本项目致力于将基于 Expo/React Native 的 `supertv` 项目重构为**现代 Android 原生应用 (Kotlin + Jetpack Compose + Material3)**。

## 目录结构
```text
app/src/main/
├── java/com/supertv/app/
│   ├── ui/                 # UI 层 (Compose)
│   │   ├── components/     # 共享 UI 组件 (已实现 Paging 3 适配)
│   │   ├── transform/      # 首页分区布局 (包含 Selene 风格 Header)
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
- [x] **SDK 兼容性适配**：设置 `minSdk 24` (Android 7.0+)，并将 `core-ktx` 降级至 `1.15.0` 以完美适配 `compileSdk 35`。
- [x] **权限与 TV 特性**：补全了网络、多播、存储、前台服务等权限，并添加了电视端 `LEANBACK_LAUNCHER` 支持。
- [x] **UI 风格全面重构 (Selene Style)**：
    - **图标还原**：还原了原始项目的 `icon.png` 和启动图 `icon-boot.png`。
    - **主题变色**：全量移除紫色，切换为**原生绿色主题 (#00BB5E)**，背景采用纯黑/深灰。
    - **导航重组**：底部入口更新为：**首页、电影、剧集、动漫、综艺、直播**。
    - **Header 定制**：首页实现 Selene 风格 Header（左搜索、中 Logo、右用户）。
- [x] **包名重构**：统一全项目包名为 `com.supertv.app`。
- [x] **UI 原生化**：核心页面已全面迁移至 Jetpack Compose。
- [x] **搜索引擎**：`SearchEngineModule` 实现高并发多线程协程检索。
- [x] **搜索分页 (Paging 3)**：搜索结果页（手机 & TV）已成功接入 Paging 3 库。
- [x] **播放器增强**：基于 `Media3` 实现播放功能，并集成水平滑动进度调节、垂直滑动控制（左亮度/右音量）及选集列表底部弹窗。
- [x] **TV 导航优化**：完善了 TV 端的 `FocusRequester` 链，确保键盘、建议列表与搜索结果间跳转顺滑。
- [x] **缓存管理器 UI**：在 `SlideshowFragment` 中实现原生下载任务管理视图。
- [x] **配置安全注入**：通过 Gradle 任务将 Secrets 注入 Assets，彻底解决 `BuildConfig` 编译错误。

## 待办事项 (For Next AI Agent)
1. [ ] **播放器控制 UI 进一步美化**：根据绿色主题深度定制播放器内部控件。
2. [ ] **直播流稳定性优化**：针对直播流增加自动切换备用源逻辑（需对接 SearchViewModel）。
3. [ ] **数据源接入**：当前分类入口（电影、剧集等）需进一步对接具体的后端 API。
4. [ ] **UI 测试**：编写关键页面的 Compose UI 测试用例。

## 配置与部署说明

### GitHub Actions 节点配置
请在 **GitHub 仓库设置 -> Settings -> Secrets and variables -> Actions** 中添加 Secret：
- **Name**: `API_NODES_JSON`
- **Value**: JSON 格式节点数组（如 `[{"key":"n1","label":"A","url":"..."}]`）。

### 开发指南
- **编译**：`./gradlew assembleRelease`
- **环境要求**：Android Studio 最新稳定版，JDK 17。
- **SDK 版本**：`minSdk 24` (支持 Android 7.0+), `compileSdk 35`, `targetSdk 34`。

---
*注：本项目目前编译环境已全量跑通，已解决 compileSdk 36 与 core-ktx 1.18.0 的依赖冲突。*
