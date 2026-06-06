# SuperTV 原生安卓重构项目

本项目致力于将基于 Expo/React Native 的 `supertv` 项目功能完全迁移并重构为**现代 Android 原生应用**。

## 核心重构与功能迁移对照表

| 原项目模块 (TS/TSX) | 原生迁移模块 (Kotlin/Compose) | 状态 |
| :--- | :--- | :--- |
| **API/ApiNodes** | `ApiService` + `RetrofitClient` | 已完成 |
| **Search/Suggestions** | `SearchViewModel` + `SearchScreen` | 迁移中(Kotlin引擎已集成) |
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

### 2. 搜索引擎重构 (Kotlin 原生侧)
- [x] **多线程并发模型**：在 `SearchEngineModule.kt` 中实现 Kotlin Coroutines 高并发网络匹配。
- [x] **精准联想逻辑**：实现了“拼音首字母匹配 -> 后端库内验证 -> 去除空格去重 -> 限制九个”的高级联想链路。
- [x] **混合持久化**：搜索联想策略（精准/快速）与历史记录已整合进 Kotlin 原生 `DataStore`。

### 3. 系统与性能
- [x] **投屏跳转**：完善 `CastNotificationModule`，支持从系统通知直接启动控制页。
- [x] **流媒体增强**：实装 M3U8 广告过滤，集成 ExoPlayer 内核优化播放体验。
- [x] **生命周期管理**：实现全局双击返回键退出 (MainActivity)，提升 TV 端使用友好度。

## 待办事项与接手建议 (For Next AI Agent)

1. [x] **搜索页面 UI 原生化迁移**：基础 Compose 架构已建立 (`SearchView.kt`)，需完善 ViewModel 绑定与数据流对接。
2. [ ] **搜索结果自动加载优化**：原生侧需实现 `Paging 3` 分页加载，以替代当前的 `CustomScrollView` 逻辑。
3. [ ] **远程输入原生化**：目前远程输入依赖 `RemoteControlStore` (JS)，建议将其迁移至 `SearchEngineModule` 同一层的原生 WebSocket 服务中。
4. [ ] **离线缓存 UI 重构**：完善缓存管理界面的原生 Compose 实现，确保在离线状态下的搜索行为一致。

## 编译指南与原生环境配置

本项目已全面转型为 Android 原生 Kotlin 开发。

1. **Android Studio 环境**：建议使用最新稳定版。
2. **应用基础配置**：
   - **应用名称**：`SuperTV`
   - **包名**：`com.supertv.app`
   - **资源存放**：图标资源需放入 `android/app/src/main/res/mipmap-*`。
3. **编译流程**：
   - 使用 Android Studio 打开根目录下的 `android/` 目录。
   - 等待 Gradle 同步完成，确保 `build.gradle.kts` 已配置好原生依赖。
   - 通过 `./gradlew assembleRelease` 生成正式版安装包。

*注：项目已完成关键原生引擎的迁移，后续接手请优先关注 `android/app/src/main/java/com/supertv/app/` 下的原生模块开发。*
