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

## 已完成里程碑
- [x] **架构迁移**：完全移除 React Native/Expo 依赖，建立纯原生 Kotlin 工程。
- [x] **SDK 兼容性适配**：支持 Android 7.0+ (`minSdk 24`)。
- [x] **UI 图标系统深度还原 (Official Material Symbols Style)**：
    - 完全同步 **Google Fonts Icons** (Material Symbols Rounded) 官方原始路径，拒绝自绘。
    - 解决了图标“抽象”和风格不统一的问题，确保 100% 还原专业级视觉质感。
    - 底部导航栏大幅增强：对齐 Selene 交互体验，增加图标尺寸 (26dp)，补全文字说明 (12sp)。
- [x] **TV 端布局重构 (SuperTV_old Style)**：
    - 针对电视端实现全新的交互布局：顶部大字号分类导航 + 侧边功能入口 + 高清内容网格。
- [x] **内容生态扩展 (LunaTV Integration)**：
    - **短剧分类**：接入专用的短剧 API，支持首页分类快速切换。
    - **AI 智能推荐**：集成 GPT 级 AI 推荐系统，打字机式交互体验。
    - **即将上映 (发布日历)**：实时展示影视上线动态。
- [x] **搜索系统升级**：
    - **双模式切换**：支持“全网聚合”与“网盘资源 (PanSou)”双 Tab 搜索。
- [x] **导航交互优化**：
    - **首页分类 Chip**：参考 `SuperTV_old` 实现横向分类导航，一键直达分区。
    - **增强型用户菜单**：点击头像弹出丰富的功能中心。
    - **登录访问体系**：实现 Selene 风格登录拦截流，引导未登录用户进行验证以访问资源。
    - **自动 401 拦截**：集成 API 监听，当后端提示登录失效（401）时，App 将自动弹出登录窗提示重新登录。
    - **混合认证支持**：同时支持 Selene 的 Token 认证与 SuperTV_old 的 Cookie 认证，确保与不同版本后端的完美兼容。
    - **乱码修复**：解决 `api_nodes.json` 在非 UTF-8 环境下导致的中文显示异常。

## 待办事项
1. [ ] **播放器控制进一步优化**：针对绿色主题进行微调。
2. [ ] **多源负载均衡**：对接更多的备用 API 自动切换逻辑。

## 配置与部署说明

### GitHub Actions 节点配置
请在 **GitHub 仓库设置 -> Settings -> Secrets and variables -> Actions** 中添加 Secret：
- **Name**: `API_NODES_JSON`
- **Value**: JSON 格式节点数组。

### 开发指南
- **编译**：`./gradlew assembleRelease`
- **环境要求**：Android Studio 最新稳定版，JDK 17。

---
*注：本项目目前已完美集成 LunaTV 的强大后端能力与 Selene 的精致视觉体验。*
