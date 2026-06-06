# SuperTV 原生安卓重构项目

本项目致力于将基于 Expo/React Native 的 [SuperTV_old](https://github.com/ZangEdward/SuperTV_old) 项目功能完全迁移并重构为**现代 Android 原生应用 (Kotlin + Jetpack Compose + Material3)**。

> 🔍 参考项目：
> - 原 React Native 项目：`.idea/SuperTV_old-master/`
> - Selene 参考项目：`.idea/Selene-Source-main/`

## 📋 当前进度总览 (2026-06-06)

| 模块 | 文件 | 状态 | 说明 |
| :--- | :--- | :--- | :--- |
| **Model 层** | `model/ApiNode.kt` | ✅ 已完成 | 全部数据模型定义 |
| **API 层** | `api/ApiService.kt` + `data/RetrofitClient.kt` | ✅ 已完成 | Retrofit 接口，多节点切换 |
| **Data 层** | `Store.kt`, `SearchPreferenceStore.kt`, `SearchRepository.kt`, `AppInitializer.kt` | ✅ 已完成 | SP + DataStore 双存储 |
| **搜索引擎** | `services/SearchEngine.kt` | ✅ 已完成 | Coroutines 并发搜索 |
| **搜索 ViewModel** | `viewmodel/SearchViewModel.kt` | ✅ 已完成 | 搜索/详情状态管理 |
| **搜索页面 UI** | `ui/search/SearchScreen.kt` (Compose) | ✅ 已完成 | 搜索建议、历史、结果网格 |
| **搜索 Fragment** | `ui/search/SearchFragment.kt` | ✅ 已完成 | Navigation 集成 |
| **详情页 UI** | `ui/detail/DetailScreen.kt` (Compose) | ✅ 已完成 | 封面、信息、剧集列表 |
| **播放器** | `ui/player/PlayerActivity.kt` (Media3) | ✅ 已完成 | ExoPlayer 全屏播放 |
| **设置页面** | `ui/settings/SettingsScreen.kt` + ViewModel + Fragment | ✅ 已完成 | 完整设置界面 |
| **缓存服务** | `services/CacheService.kt` | ✅ 已完成 | 缩略图二级缓存 + 视频下载 |
| **M3U8 解析** | `services/M3uService.kt` | ✅ 已完成 | 主/媒体播放列表解析 |
| **广告过滤** | `services/AdFilterService.kt` | ✅ 已完成 | 时长+URL模式过滤 |
| **测速服务** | `services/SpeedTestService.kt` | ✅ 已完成 | 并发 RTT 加权评分 |
| **DLNA 投屏** | `services/DlnaService.kt` | ✅ 已完成 | SSDP + SOAP 控制 |
| **投屏通知** | `services/CastNotificationService.kt` | ✅ 已完成 | 通知栏控制 |
| **远程服务器** | `services/TcpHttpServer.kt` | ✅ 已完成 | HTTP 远程控制 |
| **UI 组件** | `ui/components/VideoGrid.kt`, `FocusableNavButton.kt` | ✅ 已完成 | 响应式网格、可聚焦按钮 |
| **Fragment 页面** | Transform/Reflow/Slideshow + ViewModel | ✅ 已完成 | 基础骨架 |
| **导航框架** | `ui/AppNavigation.kt` + `MainActivity.kt` | ✅ 已完成 | Drawer + Bottom Nav |
| **资源文件** | strings/colors/themes | ✅ 已完成 | Material3 深色主题 |
| **导航图** | `navigation/mobile_navigation.xml` | ✅ 已完成 | 含搜索 Action |

## 🏗 项目架构

```
app/src/main/java/com/supertv/resupertv/
├── MainActivity.kt              # 主 Activity（双击返回退出）
├── model/
│   └── ApiNode.kt               # 全部数据模型
├── api/
│   └── ApiService.kt            # Retrofit API 接口
├── data/
│   ├── RetrofitClient.kt        # OkHttp + Retrofit
│   ├── Store.kt                 # SharedPreferences
│   ├── SearchPreferenceStore.kt # DataStore
│   ├── SearchRepository.kt      # 搜索仓库
│   └── AppInitializer.kt        # 初始化
├── services/
│   ├── SearchEngine.kt          # 搜索引擎
│   ├── CacheService.kt          # 缓存服务
│   ├── SpeedTestService.kt      # 测速
│   ├── M3uService.kt            # M3U8 解析
│   ├── AdFilterService.kt       # 广告过滤
│   ├── DlnaService.kt           # DLNA 投屏
│   ├── CastNotificationService.kt # 投屏通知
│   └── TcpHttpServer.kt         # 远程控制
├── viewmodel/
│   └── SearchViewModel.kt       # 搜索 ViewModel
└── ui/
    ├── AppNavigation.kt
    ├── components/
    │   ├── VideoGrid.kt
    │   └── FocusableNavButton.kt
    ├── search/
    │   ├── SearchScreen.kt
    │   └── SearchFragment.kt
    ├── detail/
    │   └── DetailScreen.kt
    ├── player/
    │   └── PlayerActivity.kt
    ├── settings/
    │   ├── SettingsScreen.kt
    │   ├── SettingsViewModel.kt
    │   └── SettingsFragment.kt
    ├── transform/
    ├── reflow/
    └── slideshow/
```

## 📱 缩略图缓存优化

参考 **Selene-Source-main** 的三层缓存架构实现：

### 缓存架构 (参考 `DoubanCacheService` + `LocalSearchCacheService` + `PageCacheService`)

```
┌─────────────┐    命中    ┌──────────────┐    命中    ┌──────────┐
│  内存缓存    │ ────────→ │   磁盘缓存     │ ────────→ │  网络加载  │
│ (LruCache)  │           │ (WEBP/JSON)   │           │ (Coil)    │
│  最大200张   │           │  带过期时间     │           │  防盗链头  │
└─────────────┘           └──────────────┘           └──────────┘
```

### 核心特性

| 特性 | 参考来源 | 实现 |
| :--- | :--- | :--- |
| **CacheItem<T>** | Selene `DoubanCacheService` | 数据+时间戳+TTL 的泛型包装 |
| **过期自动清理** | Selene `LocalSearchCacheService` | 启动时+每5分钟定时清理，移除过期和超限条目 |
| **LRU 淘汰** | Selene `LocalSearchCacheService` | LinkedHashMap 按访问顺序，超限自动移除最老的 |
| **缩略图 WEBP** | - | 下载后缩放为 200x300 WEBP 格式存储 |
| **CDN 域名替换** | Selene `image_url.dart` | `ImageUrlHelper` 自动替换豆瓣CDN域名 |
| **防盗链头** | Selene `getImageRequestHeaders` | 自动添加 Referer/UA 防盗链头 |
| **内存尺寸优化** | Selene `memCacheWidth/Height` | Coil 的 `size(200,300)` 限制解码尺寸 |
| **API 数据缓存** | Selene `PageCacheService` | 通用 API 响应缓存，带10分钟TTL |

### 核心代码 (`services/CacheService.kt` + `ImageUrlHelper`)

```kotlin
// 三级缓存获取缩略图（自动 CDN 替换 + 防盗链头）
suspend fun getThumbnail(url: String, source: String? = null, reqWidth: Int = 200, reqHeight: Int = 300): Bitmap?

// 批量预加载（进入列表页时调用）
fun preloadThumbnails(urls: List<String>, source: String? = null)

// API 数据缓存（带过期时间）
fun <T> getApiCache(key: String): CacheItem<T>?
fun <T> setApiCache(key: String, data: T, ttl: Long = TTL_API_DEFAULT)

// 缓存统计
fun getCacheStats(): CacheStats  // 缩略图数/API数/视频数/总大小
fun cleanupExpiredCache(): CleanupResult  // 清理结果

// 图片 URL 处理
ImageUrlHelper.processImageUrl(url, source)      // CDN 域名替换
ImageUrlHelper.getImageHeaders(url, source)       // 防盗链请求头
```

### Coil 图片加载配置 (`VideoGrid.kt`)

```kotlin
AsyncImage(
    model = ImageRequest.Builder(context)
        .data(processedUrl)
        .crossfade(true)
        .size(Size(200, 300))          // 内存优化
        .memoryCachePolicy(CachePolicy.ENABLED)
        .diskCachePolicy(CachePolicy.ENABLED)
        .addHeader("Referer", "...")   // 防盗链
        .addHeader("User-Agent", "...")
        .build(),
    ...
)
```

## 🔧 待办事项与接手指南

### 🔴 高优先级
1. [ ] **首页数据加载**：`TransformFragment` 接入豆瓣API、热门推荐（参考 `app/index.tsx` + `stores/homeStore.ts`）
2. [ ] **详情页完整化**：接入 `SearchViewModel.loadDetail()`，实现来源切换
3. [ ] **搜索结果对接**：`SearchScreen` 对接 `SearchEngine.searchResults: StateFlow`
4. [ ] **播放器功能补全**：速度控制、选集、手势控制（参考 `app/play.tsx` + `components/PlayerControls.tsx`）

### 🟡 中优先级
5. [ ] **Paging 3 分页加载**：替代一次性加载
6. [ ] **离线缓存 UI**：下载队列管理、缓存管理页面（参考 `app/cache.tsx` + `app/cache-management.tsx`）
7. [ ] **收藏功能**：`ReflowFragment` 接入 `Store.getFavorites()`
8. [ ] **播放记录**：首页"继续观看"列表
9. [ ] **OTA 更新**：版本检查、APK 下载安装（参考 `stores/updateStore.ts` + `services/updateService.ts`）
10. [ ] **网盘搜索**：移植 `app/netdisk-search.tsx`

### 🟢 低优先级
11. [ ] **多主题**：浅色/深色切换
12. [ ] **TV 遥控器优化**：FocusRequester + onKeyEvent
13. [ ] **直播功能**：参考 `app/live.tsx`
14. [ ] **国际化 (i18n)**
15. [ ] **单元测试**

## 🚀 编译指南

```bash
./gradlew assembleDebug    # 调试版
./gradlew assembleRelease  # 正式版
```

## 🛠 技术栈

| 技术 | 用途 |
| :--- | :--- |
| **Kotlin** | 开发语言 |
| **Jetpack Compose + Material3** | UI 框架 |
| **Media3 (ExoPlayer)** | 视频播放 |
| **Retrofit + OkHttp** | 网络请求 |
| **Coil** | 图片加载 |
| **DataStore** | 偏好存储 |
| **Coroutines + Flow** | 异步/响应式 |
| **Navigation Component** | 页面导航 |
