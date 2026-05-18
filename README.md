该项目为基于OrionTV 结合已有节点配置的私有化客户端，旨在方便作者及其好友使用
自定义带来了更智能的播放体验：

新版本设想
-手机端增加缓存功能
-同局域网手机控制电视端APP

📝 版本更新历史 (Changelog)

📱 v5.5.15.523 (Latest)
- 🆔 **环境与配置更新**：应用包名正式更改为 `com.supertv`，版本号同步升级。
- 📂 **缓存路径重定向**：将视频缓存目录迁移至系统规范存储路径：`Android/data/com.supertv/files/videos/`。
- ⬇️ **下载 UI 深度优化**：
  - 详情页及管理页新增多集并行下载列表。
  - 每行实时显示下载进度条及百分比。
  - 新增 [播放] | [暂停/继续] | [删除] 快捷控制按钮。
  - 优化缓存源选择界面，“显示全部”支持展开/收起切换。
- ⚡ **播放源动态优化**：
  - 详情页支持首个可用源秒开渲染，其余源后台异步加载，消除等待焦虑。
  - 引入“一键优化”功能（播放源管理及详情页）：并发对所有源进行 Ping/带宽测试。
  - 自动排序算法：根据延迟升序排列，并自动禁用响应超过 3000ms 的超时源。
- 🎨 **视觉与体验打磨**：
  - 底部导航栏实现毛玻璃（Frosted Glass）磨砂质感特效，提升应用精致度。
  - 修复 DLNA 投屏模块：参考 `HPlayer` 方案重构发现与播放核心，大幅提升电视兼容性。

📱 v5.5.14.523
- 🔍 修复设置闪退

📱 v5.5.13.523 
- 🔍 修复搜索"未找到相关内容"的问题：放宽标题匹配为包含匹配（不区分大小写）
- 📡 增强 DLNA 投屏发现：支持多轮广播、延长等待时间至15秒、自动加入多播组
- 🎬 移动版播放页精简：仅保留集数选择播放源、视频播放器和 DLNA 投屏按钮
- 🐛 修复设置页闪退：补全缺失的 SettingsSection 组件导入
- ⬇️ 优化缓存下载：添加标准 HTTP 请求头以提高下载兼容性

📱 v5.5.12.523
- 🎬 缓存详情页点击播放按钮可唤起播放页
- 🐛 修复 Metro 打包时无法解析 Expo 风格路径别名 `@/components/ThemedText` 的问题，改为相对路径
- 优化投屏设备选择面板大小，宽度适配为屏幕的 30%。
- 深度优化首页、搜索、收藏、设置页面的滑动切换体验。
- 重构设置页：缩小服务器节点间距，新增“优选”功能并实时显示节点延迟。
- 增加播放源管理功能：支持测速优选，自动禁用超时（>3000ms）的数据源。
- 移动端播放页大改版：新增选集与换源面板，支持正反序切换与视频源测速。
- 优化跨平台体验：针对 TV 端精简了缓存与投屏功能。
- 增强搜索与详情页体验：支持播放源动态加载，检索到一个源即刻显示，无需等待全部完成。
- 全局播放源控制：所有搜索与详情检索均遵循“播放源管理”中的开关设置。
- 详情页 UI 精修：统一视觉风格，优化信息层级，支持选集正反序。

📱 v5.5.11.523
- 修复缓存详情页点击按钮闪退的问题。
- 优化缓存状态显示：
  - 下载中：第*集 已缓存**% 暂停 取消
  - 已完成：第*集 缓存完成 播放 删除
- 🚀 优化 M3U8 核心下载逻辑，改用原生文件追加模式，显著提升下载速度并大幅降低内存占用。

📱 v5.5.10.523
- 重构视频详情页 UI（参考 LunaTV 移动端风格）
- 集成 orangeplayer & VlcDlnaPlayer (https://github.com/sifacaii/VlcDlnaPlayer) 相关 DLNA 逻辑优化
  - 增强 SSDP 多目标搜索能力
  - 优化 AVTransport 服务识别，支持版本 1 和 2
  - 改进 DIDL-Lite Metadata 封装，提高投屏成功率
- 增加选集排序、换源测速及排序功能

📱 v5.5.9.523
✨ 界面更新：重构缓存详情页 UI，正式支持删除缓存功能。

🔧 体验优化：优化下载列表显示逻辑，界面精简为仅显示海报和剧名。

🚀 核心升级：集成 m3u8-downloader 核心逻辑，大幅改进 M3U8 的解析与解密预设能力。

# OrionTV 📺

一个基于 React Native TVOS 和 Expo 构建的播放器，旨在提供流畅的视频观看体验。

## ✨ 功能特性

- **框架跨平台支持**: 同时支持构建 Apple TV 和 Android TV。
- **现代化前端**: 使用 Expo、React Native TVOS 和 TypeScript 构建，性能卓越。
- **Expo Router**: 基于文件系统的路由，使导航逻辑清晰简单。
- **TV 优化的 UI**: 专为电视遥控器交互设计的用户界面。

## 🛠️ 技术栈

- **前端**:
  - [React Native TVOS](https://github.com/react-native-tvos/react-native-tvos)
  - [Expo](https://expo.dev/) (~51.0)
  - [Expo Router](https://docs.expo.dev/router/introduction/)
  - [Expo AV](https://docs.expo.dev/versions/latest/sdk/av/)
  - TypeScript

## 📂 项目结构

本项目采用类似 monorepo 的结构：

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

## 🚀 快速开始

### 环境准备

请确保您的开发环境中已安装以下软件：

- [Node.js](https://nodejs.org/) (LTS 版本)
- [Yarn](https://yarnpkg.com/)
- [Expo CLI](https://docs.expo.dev/get-started/installation/)
- [Xcode](https://developer.apple.com/xcode/) (用于 Apple TV 开发)
- [Android Studio](https://developer.android.com/studio) (用于 Android TV 开发)

### 项目启动

接下来，在项目根目录运行前端应用：

```sh

# 安装依赖
yarn

# [首次运行或依赖更新后] 生成原生项目文件
# 这会根据 app.json 中的配置修改原生代码以支持 TV
yarn prebuild-tv

# 运行在 Apple TV 模拟器或真机上
yarn ios-tv

# 运行在 Android TV 模拟器或真机上
yarn android-tv
```

## 使用

- 1.2.x 以上版本需配合 [MoonTV](https://github.com/senshinya/MoonTV) 使用。


## 📜 主要脚本

- `yarn start`: 在手机模式下启动 Metro Bundler。
- `yarn start-tv`: 在 TV 模式下启动 Metro Bundler。
- `yarn ios-tv`: 在 Apple TV 上构建并运行应用。
- `yarn android-tv`: 在 Android TV 上构建并运行应用。
- `yarn prebuild-tv`: 为 TV 构建生成原生项目文件。
- `yarn lint`: 检查代码风格

## 📜 License

本项目采用 MIT 许可证。

## ⚠️ 免责声明

OrionTV 仅作为视频搜索工具，不存储、上传或分发 any 视频内容。所有视频均来自第三方 API 接口提供的搜索结果。如有侵权内容，请联系相应的内容提供方。

本项目开发者不对使用本项目产生的任何后果负责。使用本项目时，您必须遵守当地的法律法规。

## 🙏 致谢

本项目受到以下开源项目的启发：

- [MoonTV](https://github.com/senshinya/MoonTV) - 一个基于 Next.js 的视频聚合应用
- [LibreTV](https://github.com/LibreSpark/LibreTV) - 一个开源的视频流媒体应用

感谢以下项目提供 API Key 的赞助

- [gpt-load](https://github.com/tbphp/gpt-load) - 一个高性能的 OpenAI 格式 API 多密钥轮询代理服务器，支持负载均衡，使用 Go 语言开发
