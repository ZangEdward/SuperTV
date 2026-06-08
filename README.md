# SuperTV 原生安卓重构项目 (LunaTV & Selene 增强版)

本项目致力于将基于 Expo/React Native 的 `supertv` 项目重构为**现代 Android 原生应用 (Kotlin + Jetpack Compose + Material3)**。

## 目录结构
```text
app/src/main/
├── java/com/supertv/app/
│   ├── ui/                 # UI 层 (Compose)
│   │   ├── components/     # 共享 UI 组件 (已实现 Paging 3, UserMenu, AI对话框)
│   │   ├── transform/      # 首页分区布局 (带 Lucide 分类导航)
│   │   ├── search/         # 搜索界面 (双模式：聚合 & 网盘)
│   │   ├── detail/         # 详情界面
│   │   ├── player/         # 播放器界面 (手势控制与选集弹窗)
│   │   └── slideshow/      # 缓存管理界面 (原生任务列表)
│   ├── data/               # 数据层 (Retrofit, Store, ApiNodeService)
│   ├── services/           # 原生业务逻辑服务 (Search/M3U/AdFilter/Dlna/AI/CrashHandler)
│   └── model/              # 数据模型定义 (集成 LunaTV 增强模型)
├── res/                    # 资源文件 (基于 Lucide 风格重制的图标系统)
└── assets/                 # 动态注入配置 (api_nodes.json)
```

## 最新更新与修复
- [x] **登录逻辑收紧**：移除了本地演示模式（跳过按钮），强制用户登录以访问受限资源。
- [x] **用户信息显示**：修复了点击头像后用户菜单中用户名显示不正确的问题，现在能正确显示当前登录用户。
- [x] **搜索稳定性提升**：
    - 修复了无网络环境下点击搜索按钮导致的闪退（Crash）。
    - 修复了搜索结果无法正常显示的问题，提升了搜索的响应率。
- [x] **API 链路优化**：解决了底部标签数据加载 404 的问题，统合了 API 路由规则。
- [x] **UI 极致精简**：移除了首页悬浮的信封按钮，界面更加清爽。
- [x] **导航逻辑修复**：全局适配物理返回键/手势返回，确保所有界面按返回键均能正确回退至上一级页面。
- [x] **服务器测速还原**：同步 `supertvold` 的测速逻辑，使用客户端原生 `HEAD` 探测，解决了节点提示“不可达”的问题，提供实时的延迟反馈。

## 已完成里程碑
- [x] **架构迁移**：完全移除 React Native/Expo 依赖，建立纯原生 Kotlin 工程。
- [x] **SDK 兼容性适配**：支持 Android 7.0+ (`minSdk 24`)。
- [x] **UI 图标系统深度还原 (Official Material Symbols Style)**：解决了图标风格不统一的问题，对齐 Selene 交互体验。
- [x] **TV 端布局重构 (SuperTV_old Style)**：针对电视端实现全新的交互布局。
- [x] **内容生态扩展 (LunaTV Integration)**：集成短剧分类、AI 智能推荐、即将上映日历。
- [x] **搜索系统升级**：支持“全网聚合”与“网盘资源”双模式搜索。
- [x] **自适应布局 (Tablet/Mobile)**：完美适配手机与平板的不同屏幕尺寸。
- [x] **乱码与认证修复**：彻底解决了 UTF-8 编码乱码与 401 自动拦截登录逻辑。

## 待办事项
1. [ ] **播放器控制进一步优化**：针对绿色主题进行微调。
2. [ ] **多源负载均衡**：对接更多的备用 API 自动切换逻辑。

## 配置与部署说明

### GitHub Actions 节点配置
请在 **GitHub 仓库设置 -> Settings -> Secrets and variables -> Actions** 中添加 Secret：
- **Name**: `API_NODES_JSON`
- **Value**: JSON 格式节点数组。

---
*注：本项目目前已完美集成 LunaTV 的强大后端能力与 Selene 的精致视觉体验。*
