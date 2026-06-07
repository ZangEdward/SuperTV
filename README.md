# SuperTV 原生安卓重构项目

本项目致力于将基于 Expo/React Native 的 `supertv` 项目重构为**现代 Android 原生应用 (Kotlin + Jetpack Compose + Material3)**。

## 目录结构
```text
app/src/main/
├── java/com/supertv/app/
│   ├── ui/                 # UI 层 (Compose)
│   │   ├── components/     # 共享 UI 组件
│   │   ├── transform/      # 首页分区布局
│   │   ├── search/         # 搜索界面
│   │   ├── detail/         # 详情界面
│   │   ├── player/         # 播放器界面
│   │   └── settings/       # 设置页
│   ├── data/               # 数据层 (Retrofit, DataStore, Store)
│   ├── services/           # 原生业务逻辑服务
│   └── model/              # 数据模型定义
├── res/                    # 资源文件 (mipmap, drawable, values, layout)
└── assets/                 # 动态注入配置 (api_nodes.json)
```

## 已完成里程碑
- [x] **架构迁移**：完全移除 React Native/Expo 依赖，建立纯原生 Kotlin 工程。
- [x] **包名重构**：统一全项目包名为 `com.supertv.app`。
- [x] **UI 原生化**：核心页面（首页、搜索、详情、播放器、设置）已全面迁移至 Jetpack Compose。
- [x] **搜索引擎**：`SearchEngineModule` 实现高并发多线程协程检索。
- [x] **配置安全注入**：通过 Gradle 任务将 Secrets 注入 Assets，彻底解决 `BuildConfig` 编译转义错误。
- [x] **样式与主题**：统一为 Material3 `Theme.App`，并建立了完善的别名映射以兼容旧版布局引用。
- [x] **全量语法修正**：修复了 10+ 个核心文件中的字符串模板错误、未解析引用及 Compose 上下文语法错误。

## 待办事项 (For Next AI Agent)
1. [ ] **搜索分页 (Paging 3)**：为搜索结果页接入 Paging 3 库。
2. [ ] **直播流解析强化**：基于 `Media3` 进一步完善直播流播放稳定性。
3. [ ] **缓存管理器 UI 完善**：基于 `EpisodeCacheManager.kt` 实现下载任务管理视图。
4. [ ] **TV 遥控器深度优化**：优化 TV 端焦点路径导航。

## 配置与部署说明

### GitHub Actions 节点配置
请在 **GitHub 仓库设置 -> Settings -> Secrets and variables -> Actions** 中添加 Secret：
- **Name**: `API_NODES_JSON`
- **Value**: JSON 格式节点数组（如 `[{"key":"n1","label":"A","url":"..."}]`）。

### 开发指南
- **编译**：`./gradlew assembleRelease`
- **发布**：GitHub Action 会自动将 APK 上传至 Release 并同步至日志仓库。
- **编码约定**：保持 Composable 函数独立性，Retrofit 务必开启 `disableHtmlEscaping()`。

---
*注：本项目目前编译环境已完全跑通，没有任何阻塞构建的语法错误。*
