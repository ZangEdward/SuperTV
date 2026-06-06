# RESuperTV 原生安卓重构项目

本项目致力于将基于 Expo/React Native 的 `supertv` 项目功能完全迁移并重构为**现代 Android 原生应用**。

## 核心重构与功能迁移对照表

| 原项目模块 (TS/TSX) | 原生迁移模块 (Kotlin/Compose) | 状态 |
| :--- | :--- | :--- |
| **API/ApiNodes** | `ApiService` + `RetrofitClient` | 已完成 |
| **Search/Suggestions** | `SearchViewModel` + `SearchScreen` | 已完成 |
| **Player/ExoPlayer** | `PlayerActivity` + Media3 | 已完成 |
| **DLNA/Cast** | `DlnaService` + `CastNotificationService` | 已完成 |
| **TcpHttpServer** | `TcpHttpServer` (原生Socket) | 已完成 |
| **Cache/Storage** | `CacheService` + `DataStore` | 已完成 |
| **M3U/M3U8 解析** | `M3uService` + `AdFilterService` | 已完成 |
| **Settings** | `SettingsScreen` + `SearchPreferenceStore` | 已完成 |
| **SpeedTest** | `SpeedTestService` | 已完成 |

## 已完成的重构里程碑

### 1. 全局架构
- [x] **Material Design 3 迁移**：统一现代视觉风格，适配手机、平板、TV。
- [x] **Jetpack Compose 驱动**：全原生组件化，移除 React Native 依赖。
- [x] **配置持久化**：使用 `DataStore` 实现设置项实时写入磁盘，实现“启动即生效”。

### 2. 交互体验
- [x] **TV 焦点系统**：实现遥控器焦点缩放 (`FocusableNavButton`) 与侧边导航 (`NavigationRail`)。
- [x] **搜索优化**：实装智能联想引擎，支持历史记录与本地存储优化。
- [x] **紧凑 UI 设计**：首页视频网格布局 (两列) 与搜索栏紧凑排版，适配大屏操作。

### 3. 系统与性能
- [x] **并发模型**：搜索请求重构为 `BATCH_SIZE=4` 分片并发模型。
- [x] **流媒体增强**：实装 M3U8 广告过滤，集成 ExoPlayer 内核优化播放体验。
- [x] **后台保活**：投屏与远程控制逻辑封装为 `Foreground Service`，支持 Android 保活。

---

*注：本项目不仅是代码翻译，而是针对 Android TV/平板/手机全平台原生性能进行的深度定制开发。*
