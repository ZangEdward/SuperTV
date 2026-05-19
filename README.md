# SuperTV 📺

一个基于 React Native TVOS 和 Expo 构建的播放器，旨在提供流畅的视频观看体验。

## ✨ 功能特性

- **框架跨平台支持**: 同时支持构建 Apple TV 和 Android TV。
- **现代化前端**: 使用 Expo、React Native TVOS 和 TypeScript 构建，性能卓越。
- **Expo Router**: 基于文件系统的路由，使导航逻辑清晰简单。
- **TV 优化的 UI**: 专为电视遥控器交互设计的用户界面。
- **缓存下载**: 支持 M3U8/MP4 视频离线缓存，多线程加速下载。
- **优选节点**: 智能测速并选择最佳 API 节点。

📝 版本更新历史 (Changelog)

📱 v5.5.23.523 (Latest)
- 🐛 **修复最近播放直达崩溃**：针对 direct-play 逻辑增加了多层防御性检查，防止在搜索未命中或延迟加载时触发 Native 崩溃（图标闪现问题）。
- ⬇️ **缓存下载稳定性增强**：重写了高性能 Base64 编码算法，规避了大文件下载时的内存栈溢出问题，提升了 M3U8 合并的成功率。
- 🏗️ **版本号升级**：全线同步至 `v5.5.23.523`。

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

## 📜 License

本项目采用 MIT 许可证。
