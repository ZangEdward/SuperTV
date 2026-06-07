# SuperTV 原生安卓重构项目

本项目致力于将基于 React Native 的项目完全重构为**现代 Android 原生应用 (Kotlin + Jetpack Compose + Material3)**。

## 目录结构
```text
app/src/main/
├── java/com/supertv/app/
│   ├── ui/                 # UI 层 (Compose)
│   ├── data/               # 网络 (Retrofit) 与存储 (DataStore)
│   ├── services/           # 原生搜索引擎/服务 (Search/Dlna/Cast/AdFilter)
│   └── model/              # 数据模型定义
├── res/                    # 资源文件 (mipmap, drawable, values)
└── assets/                 # 动态注入配置 (api_nodes.json)
```

## 已完成里程碑
- [x] **架构迁移**：移除 React Native 依赖，构建原生 Kotlin/Gradle 环境。
- [x] **搜索引擎**：`SearchEngineModule` 实现高并发多线程搜索。
- [x] **即时保存**：所有设置项集成 DataStore 自动同步，移除手动保存按钮。
- [x] **配置安全注入**：通过 Gradle 注入 Secrets 至 Assets，避免 BuildConfig 编译错误。
- [x] **主题统一**：基于 Material3 适配 `Theme.App` 及其别名，修复样式引用缺失。
- [x] **远程控制**：`RemoteControlService` 实现原生 WebSocket 服务。

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

## 开发指南
- **编译**：`./gradlew assembleRelease`
- **配置文件**：`api_nodes.json` 由构建流程自动生成，请通过 GitHub Secrets `API_NODES_JSON` 管理。
- **编码规范**：
  - Kotlin 代码使用 UTF-8。
  - Retrofit Client 配置 `disableHtmlEscaping` 以兼容中文。
  - 界面使用 `ComposeView` 挂载 Compose 组件。
- **发布**：GitHub Action `.github/workflows/build-apk.yaml` 自动处理 OTA 部署。

---
*注：本项目已彻底弃用 JS 环境，请在 Android Studio 原生环境下进行开发。*
