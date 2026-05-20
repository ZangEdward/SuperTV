加速功能，# SuperTV 📺代码源自  zimplexing/oriontv

一个基于 React Native TVOS 和 Expo 构建的播放器，旨在提供流畅的视频观看体验。以下内容均为AI修改

请不要使用我编译好的版本，因为私人站点不开放注册，需要ota的请自行修改[UpdateConfig.ts](constants/UpdateConfig.ts)相关url
## ✨ 功能特性

- **框架跨平台支持**: 同时支持构建 Apple TV 和 Android TV。
- **现代化前端**: 使用 Expo、React Native TVOS 和 TypeScript 构建，性能卓越。
- **Expo Router**: 基于文件系统的路由，使导航逻辑清晰简单。
- **TV 优化的 UI**: 专为电视遥控器交互设计的用户界面。
- **缓存下载**: 支持 M3U8/MP4 视频离线缓存，多线程加速下载。
- **优选节点**: 智能测速并选择最佳 API 节点。

## 🚀 部署与开发配置

### 1. 服务器节点配置 (Secrets)

#### 线上环境 (GitHub Actions)
在 GitHub 仓库的 `Settings -> Secrets and variables -> Actions` 中添加以下 Secret：
- **Name**: `API_NODES_JSON`
- **Value**: JSON 格式的节点数组。
  ```json
  [
    { "key": "node1", "label": "服务器A", "url": "https://api.example.com" },
    { "key": "node2", "label": "服务器B", "url": "https://api.backup.com" }
  ]
  ```

#### 本地开发环境
在项目根目录创建 `.env.local` 文件（已加入 .gitignore），内容如下：
```env
EXPO_PUBLIC_API_NODES_JSON='[{"key":"local","label":"测试节点","url":"https://your-dev-api.com"}]'
```

### 2. 构建与运行
参考zimplexing/oriontv项目文件，直接运行对应的 `yarn` 脚本即可开始构建。
（建议还是使用action进行编译）
---

📝 版本更新历史 (Changelog)

📱 v5.5.27.523 (Latest)
- ⚙️ **编译修复**：修复了在某些环境下由于正则表达式转义问题导致的 `Task :app:createBundleReleaseJsAndAssets FAILED` 错误。
- ⬇️ **断点续传增强**：深度优化 M3U8 下载逻辑，支持从网络断开点精准续传，且失败的 TS 片段支持独立自动重试，大幅减少无效流量损耗。
- 🚀 **节点优选策略优化**：进入设置页面仅进行静默测速（仅显示延迟），不再自动切换节点。仅在手动点击“节点优选”按钮时，才会自动切换至延迟最低的服务器。
- 🛡️ **源代码安全增强**：敏感 API 节点数据改为通过 GitHub Actions Secrets 在编译时动态注入，防止服务器 URL 在公共源码库中直接泄露。
- 🗑️ **存储管理中心化**：将“清理已下载缓存”与“清理播放历史”功能模块从设置页整体迁移至“缓存管理”页面的底部，实现存储空间的一站式管理。

📱 v5.5.26.523

📱 v5.5.25.523

📱 v5.5.24.523

📱 v5.5.23.523

📱 v5.5.22.523

📱 v5.5.20.523

📱 v5.5.19.523
- 🚀 **M3U8 下载加速**：优化并发下载逻辑，支持多线程同时下载 TS 片段，显著提升下载速度。
- 📁 **缓存目录调整**：将默认缓存目录迁移至 `/Android/data/com.supertv.app/files/download`。
- 🗑️ **缓存管理增强**：修复详情页删除按钮失效问题，新增长按删除整部剧集及关联海报条目功能。
- 🎨 **图标修复**：修复应用图标丢失的问题，恢复标准的 Expo 配置。
- 🛠️ **Workflow 优化**：修复 `build-ota.yaml` 失败问题，完善自动化部署流程。

📱 v5.5.18.523
- 🐛 **修复缓存目录缺失**：`loadCache` 时自动调用 `ensureDownloadDirectory()`，确保 `videos/` 文件夹在首次使用时被创建。
- 🔄 **版本号同步统一**：`package.json` 和 `app.json` 版本同步。
- 🎨 **缓存详情页 UI 大改版**。

## 🛠️ 技术栈

- **前端**:
  - [React Native TVOS](https://github.com/react-native-tvos/react-native-tvos)
  - [Expo](https://expo.dev/) (~51.0)
  - [Expo Router](https://docs.expo.dev/router/introduction/)
  - [Expo AV](https://docs.expo.dev/versions/latest/sdk/av/)
  - TypeScript

## 📂 项目结构

```
.
├── app/              # Expo Router 路由和页面
├── assets/           # 静态资源 (字体, 图片, TV 图标)
├── components/       # React 组件
├── constants/        # 应用常量 (颜色, 样式)
├── hooks/            # 自定义 Hooks
├── services/         # 服务层 (API, 存储)
├── package.json      # 前端依赖和脚本
└── ...
```

## 🙏 致谢

本项目深受以下优秀开源项目的启发或基于其代码构建：

- [zimplexing/oriontv](https://github.com/zimplexing/oriontv) - 基础框架与核心逻辑来源
- [MoonTechLab/LunaTV](https://github.com/MoonTechLab/LunaTV)  - 优秀的电视端 UI 设计参考
- [4thline/cling](https://github.com/4thline/cling) - 经典的 UPnP/DLNA 协议栈参考
- [react-native-tvos/react-native-tvos](https://github.com/react-native-tvos/react-native-tvos) - 优秀的 TV 适配框架
- [expo/expo](https://github.com/expo/expo) - 强大的 React Native 开发工具链
- [lucide-icons/lucide](https://github.com/lucide-icons/lucide) - 优美的图标库

## 📜 License

本项目采用 MIT 许可证。
