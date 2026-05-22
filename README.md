加速功能，# SuperTV 📺代码源自  zimplexing/oriontv

一个基于 React Native TVOS 和 Expo 构建的播放器，旨在提供流畅的视频观看体验。以下内容均为AI修改

请不要使用我编译好的版本，因为私人站点不开放注册。
## ✨ 功能特性

- **框架跨平台支持**: 同时支持构建 Apple TV 和 Android TV。
- **现代化前端**: 使用 Expo、React Native TVOS 和 TypeScript 构建，性能卓越。
- **Expo Router**: 基于文件系统的路由，使导航逻辑清晰简单。
- **TV 优化的 UI**: 专为电视遥控器交互设计的用户界面。
- **缓存下载**: 支持 M3U8/MP4 视频离线缓存，多线程加速下载。
- **优选节点**: 智能测速并选择最佳 API 节点。
- 
- 
📝 版本更新历史 (Changelog)


📱 v5.5.30.0(Latest)

测试中

📱 v5.5.29.523

- 📺 **TV端精简**：移除了 TV 端的缓存下载相关功能，仅保留在手机和平板端使用。
- 🛠️ **详情页修复**：修复了播放已缓存集数时播放页面选集索引显示错误的 Bug。
- 🎨 **缓存状态可视化**：详情页集数列表新增缓存中/已缓存角标提醒，一目了然。
- 🛡️ **下载防重逻辑**：下载管理页面自动检测并禁用已在队列或已完成集数的重复下载选择，并以颜色标识状态。
- 🐛 **编译稳定性**：修复了 `detail.tsx` 中由于代码重复导致的 Babel 编译错误。

📱 v5.5.28.523

📱 v5.5.27.523

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


### 3. OTA 异库同步设置

如果你需要自己搭建 OTA 更新链路（即构建仓库与版本分发仓库分离），请按以下步骤操作：

#### 3.1 创建同步仓库
1. 在 GitHub 上**新建一个空仓库**（建议设为私有），例如 `my-ota-sync`。
2. 记录仓库名，格式为 `你的用户名/my-ota-sync`。

#### 3.2 设置 Repository Secrets
在你的主仓库（即 SuperTV 仓库）的 `Settings -> Secrets and variables -> Actions` 中添加：

| Secret 名称 | 说明 | 示例值 |
|---|---|---|
| `SOURCE_REPO` | 主仓库名（用于 Release 创建） | `你的用户名/SuperTV` |
| `SYNC_REPO` | OTA 同步仓库名（存放版本元数据和 APK 分发） | `你的用户名/my-ota-sync` |
| `PAT` | 个人访问令牌，需具有 `repo` 和 `workflow` 权限 | `ghp_xxxxxxxxxxxxxxxxxxxx` |

> **`SYNC_REPO` 是 OTA 更新的核心仓库**，构建后会自动将版本号（`package.json`）、APK 大小（`apksize.json`）以及 APK 文件（通过 Release 分发）同步到这个仓库，供客户端检查更新。

#### 3.3 运行 Workflow
- 每次代码 push 到 `main`/`master` 分支，或手动触发 `build-ota.yaml` 时，构建完成后会自动：
  1. 将 `package.json` 和 `apksize.json` 推送到 `my-ota-sync/log/vision/` 目录。
  2. 在 `my-ota-sync` 仓库下创建一个对应版本的 Release，并将 APK 文件上传作为附件。
  3. 生成一个随机外星风格日志文件，记录构建时间戳和版本。

#### 3.4 客户端版本检查流程
应用内检查更新时会：
1. 读取 `https://raw.githubusercontent.com/{SYNC_REPO}/refs/heads/main/log/vision/package.json` 获取远程版本号。
2. 对比当前本地版本，如果远程版本更新则弹出更新弹窗。
3. 用户点击更新时，从 `https://github.com/{SYNC_REPO}/releases/download/v{version}/SuperTV-{version}.apk` 下载 APK。
4. 下载完成后调用系统安装器安装。

#### 3.5 自定义更新行为
在 `constants/UpdateConfig.ts` 中可调整以下参数：

| 参数 | 默认值 | 说明 |
|---|---|---|
| `AUTO_CHECK` | `true` | 是否自动检查更新 |
| `CHECK_INTERVAL` | `12 * 60 * 60 * 1000` (12小时) | 检查间隔（毫秒） |
| `ALLOW_SKIP_VERSION` | `true` | 是否允许用户跳过某个版本 |
| `AUTO_DOWNLOAD_ON_WIFI` | `false` | 是否在 WIFI 下自动下载 |
| `DOWNLOAD_TIMEOUT` | `10 * 60 * 1000` (10分钟) | 下载超时时间 |

#### 3.6 本地开发调试
在项目根目录创建 `.env.local` 文件（已加入 .gitignore）：
```env
EXPO_PUBLIC_API_NODES_JSON='[{"key":"local","label":"测试节点","url":"https://your-dev-api.com"}]'
EXPO_PUBLIC_SYNC_REPO='你的用户名/my-ota-sync'
```

> ⚠️ **安全提示**：所有 GitHub 仓库名均通过 Secrets 注入构建环境变量 `EXPO_PUBLIC_SYNC_REPO`，源码中不包含任何仓库明文地址。如果环境变量为空，URL 将生成无效地址，确保不会意外泄露。
------



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
