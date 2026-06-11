# SuperTV 📺

一个基于 Flutter 构建的高性能视频播放器，旨在提供流畅的跨平台视频观看体验。本项目由 [zimplexing/oriontv](https://github.com/zimplexing/oriontv) 启发并演进。

## ✨ 功能特性

- **现代化 UI**: 简洁美观的界面，采用 Material 3 设计语言，适配手机、平板和电视。
  - **顶栏优化**: 移除了冗余的大标题，引入沉浸式搜索框，使界面更加协调、高效。
  - **主题切换**: 支持深浅模式平滑渐变切换，告别突兀的视觉跳变。
- **缓存下载**: 
  - **多线程下载**: 借鉴高性能下载技术，支持 M3U8 视频片段的 3 线程并发下载。
  - **任务持久化**: 基于 SharedPreferences 的任务管理，支持断点续存与状态自动恢复。
  - **全集缓存**: 播放页新增缓存按钮，支持对剧集进行单集选择或全集一键下载。
  - **下载中心**: 顶部导航集成下载中心，提供任务列表、进度追踪、暂停/删除等管理功能。
- **匹配增强**: 
  - **去尾模糊匹配**: 针对标签页（如番剧）进入的剧集，若精确匹配失败，将自动尝试“去除最后一个空格”后的标题进行模糊匹配，大幅提升资源搜索成功率。
- **动态动画**: 
  - **标签切换**: 支持方向感知的平滑滑动切换（从小号到大号向左滑入，大号到小号向右滑入）。
  - **搜索体验**: 搜索界面支持灵动的顶部滑入与滑出效果。
- **跨平台支持**: 支持 Android (com.supertv.app)、iOS、macOS 和 Windows。
- **原生体验**: 全面优化按钮样式与交互反馈，提供接近原生的使用感受。
- **节点切换**: 支持多 API 节点智能选择，确保连接稳定性。
- **本地模式**: 支持 M3U8/直播源订阅，灵活切换工作模式。
- **自动化构建**: 集成 GitHub Actions，实现自动化编译与 OTA 分发。

## 🚀 快速开始

### 1. 配置服务器节点

应用支持通过构建时注入 `API_NODES_JSON` 来配置下拉选择的服务器节点。

格式如下：
```json
[
  { "key": "node1", "label": "服务器A", "url": "https://api.example.com" },
  { "key": "node2", "label": "服务器B", "url": "https://api.backup.com" }
]
```

### 2. GitHub Actions 配置 (Secrets)

为了实现自动化构建，请在 GitHub 仓库的 `Settings -> Secrets and variables -> Actions` 中添加 `APP_SECRETS`。

`APP_SECRETS` 的内容应为如下 JSON 格式：

```json
{
  "api_nodes_json": "[{\"key\": \"node1\", \"label\": \"服务器A\", \"url\": \"https://api.example.com\"}]",
  "key_alias": "YOUR_KEY_ALIAS",
  "key_password": "YOUR_KEY_PASSWORD",
  "signing_key": "YOUR_BASE64_ENCODED_JKS_FILE",
  "pat": "YOUR_GITHUB_PERSONAL_ACCESS_TOKEN",
  "source_repo": "YourUsername/SuperTV",
  "sync_repo": "YourUsername/ota-sync-repo"
}
```

> [!TIP]
> `signing_key` 是你的 Android 签名文件 (.jks) 的 Base64 编码字符串。可以使用命令 `base64 -w 0 your-key.jks` 生成。

### 3. 本地编译

如果你想在本地编译，可以运行：

```bash
flutter build apk --release --dart-define=API_NODES_JSON='[{"key":"local","label":"测试","url":"https://test.com"}]'
```

## 🛠️ 技术栈

- **框架**: Flutter 3.24.x
- **状态管理**: Provider
- **网络请求**: Dio, Http
- **播放引擎**: Media Kit
- **持久化**: SharedPreferences

## 📂 项目结构

```
.
├── android/          # Android 平台特定代码
├── ios/              # iOS 平台特定代码
├── lib/
│   ├── screens/      # 页面 UI
│   ├── services/     # 业务逻辑与服务
│   ├── utils/        # 工具类
│   └── widgets/      # 可复用组件
├── pubspec.yaml      # 项目依赖配置
└── ...
```

## 📜 许可证

本项目采用 MIT 许可证。

---
*声明：本项目仅供学习交流使用，请勿用于商业用途。*
