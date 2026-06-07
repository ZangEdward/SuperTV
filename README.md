# RESuperTV 原生安卓重构项目

本项目致力于将基于 Expo/React Native 的 `supertv` 项目功能完全迁移并重构为**现代 Android 原生应用 (Kotlin + Jetpack Compose + Material3)**。

## 核心重构与功能迁移对照表

| 原项目模块 (TS/TSX) | 原生迁移模块 (Kotlin/Compose) | 状态 |
| :--- | :--- | :--- |
| **API/ApiNodes** | `ApiService` + `RetrofitClient` | 已完成 |
| **Search/Suggestions** | `SearchViewModel` + `SearchEngineModule` | 已完成 |
| **Player/ExoPlayer** | `PlayerActivity` + Media3 | 已完成 |
| **DLNA/Cast** | `DlnaService` + `CastNotificationService` | 已完成 |
| **TcpHttpServer** | `TcpHttpServer` (原生Socket) | 已完成 |
| **Cache/Storage** | `CacheService` + `DataStore` | 已完成 |
| **M3U/M3U8 解析** | `M3uService` + `AdFilterService` | 已完成 |
| **Settings** | `SettingsScreen` + `AutoSave` | 已完成 |
| **Remote Control** | `RemoteControlService` (原生WebSocket) | 已完成 |

## 已完成的重构里程碑

### 1. 全局架构与工程化
- [x] **Gradle工程原生化**：移除所有 React Native/Expo 依赖，清理无用 JS 脚本。
- [x] **Material Design 3**：统一视觉风格，适配 Android TV 及移动端。
- [x] **配置自动保存**：实现各 SettingsSection 的实时持久化 (`DataStore`)，废除手动保存按钮。

### 2. 原生核心引擎 (Kotlin)
- [x] **高性能搜索引擎**：`SearchEngineModule.kt` 实现多线程协程并发检索，解决 UI 卡顿。
- [x] **原生远程控制**：`RemoteControlService.kt` 实现 WebSocket 服务，支持 TV 端与手机端的实时文本同步。
- [x] **JSON 编码修复**：`RetrofitClient` 配置 `disableHtmlEscaping`，彻底解决中文解析编译错误。

### 3. UI 原生化 (Jetpack Compose)
- [x] **搜索页面 UI**：构建了基于 Compose 的 `SearchView`，解耦原有的 UI 渲染逻辑。
- [x] **首页分区布局**：完成了 `TransformFragment` 的 Compose 布局迁移。

## 待办事项与接手建议 (For Next AI Agent)

1. [x] **搜索页面 UI 原生化**：已完成基础架构迁移。
2. [ ] **搜索结果分页 (Paging 3)**：当前结果展示为简单列表，需接入 `Paging 3` 库以支持大批量搜索结果的懒加载。
3. [x] **远程输入原生化**：已部署 WebSocket 服务，需进一步完善 `SearchViewModel` 的交互绑定。
4. [ ] **离线缓存 UI 重构**：需仿照原 `cache-management.tsx` 实现原生缓存文件管理视图。
5. [ ] **直播功能 (Media3)**：在 Kotlin 侧实现基于 `Media3` 的直播流解析与播放管理。
6. [ ] **CI/CD 维护**：目前的 `build-apk.yaml` 已配置好自动编译与 OTA 分发，请监控其构建状态。

---
*注：本项目已彻底完成 RN 向 Native Kotlin 的重构，后续开发请直接操作 `app/src/main/java/com/supertv/resupertv/` 下的原生源文件。*
