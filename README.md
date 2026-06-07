# SuperTV 原生安卓重构项目

本项目致力于将基于 Expo/React Native 的 `supertv` 项目重构为**现代 Android 原生应用 (Kotlin + Jetpack Compose + Material3)**。

## 目录结构
```text
app/src/main/
├── java/com/supertv/resupertv/
│   ├── ui/                 # UI 层 (Compose)
│   ├── data/               # 网络 (Retrofit) 与存储 (DataStore)
│   ├── services/           # 原生搜索引擎与服务
│   └── model/              # 数据模型定义
├── res/                    # 资源文件 (mipmap, drawable)
└── assets/                 # 资产配置 (api_nodes.json)
```

## 核心重构里程碑
1. [x] **原生架构迁移**：移除 React Native 环境，完全原生化工程结构。
2. [x] **搜索引擎原生化**：集成 `SearchEngineModule.kt`，通过 Kotlin Coroutines 并发检索。
3. [x] **配置即时持久化**：移除 `BuildConfig` 硬编码，改用 Assets 动态注入，解决了中文 JSON 转义编译错误。
4. [x] **自动化 OTA 构建**：GitHub Actions 全自动化构建与分发。

## 待办事项 (For Next AI Agent)
1. [ ] **搜索分页 (Paging 3)**：为搜索结果页接入 Paging 3 懒加载。
2. [ ] **直播流解析**：基于 `Media3` 实现直播/点播流的解析与广告过滤。
3. [ ] **缓存管理**：实现原生缓存任务管理界面。
4. [ ] **功能迁移**：完成其余 `ui/` 下所有 Fragment 的 Compose 迁移。

## 配置与部署说明

### GitHub Actions 节点配置
为了保障 API 节点的安全性与构建自动化，请在 **GitHub 仓库设置 -> Settings -> Secrets and variables -> Actions** 中添加以下 Secret：

- **Name**: `API_NODES_JSON`
- **Value**: JSON 格式的节点数组。
  ```json
  [
    { "key": "node1", "label": "服务器A", "url": "https://api.example.com" },
    { "key": "node2", "label": "服务器B", "url": "https://api.backup.com" }
  ]
  ```

### API 节点安全读取规范
本项目通过编译任务自动将 `API_NODES_JSON` 注入至 `assets/api_nodes.json`，严禁在 `build.gradle.kts` 中使用 `buildConfigField` 存储复杂 JSON 字符串。
**读取代码示例**：
```kotlin
val json = context.assets.open("api_nodes.json").bufferedReader().use { it.readText() }
val nodes = gson.fromJson(json, Array<ApiNode>::class.java)
```

## 开发工作流
- **编译**：`./gradlew assembleRelease`
- **自动化构建**：`.github/workflows/build-apk.yaml` 会在构建时自动根据 Secrets 注入 API 节点配置，无需手动修改代码。
- **编码约定**：
  - Kotlin 代码严格使用 UTF-8。
  - 网络层 Retrofit 必须配置 `GsonBuilder().disableHtmlEscaping()` 以处理中文字段。
  - 所有 UI 必须使用 `ComposeView` 进行迁移，严禁混用旧版 Fragment View 布局。
