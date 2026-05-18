该项目为基于OrionTV 结合已有节点配置的私有化客户端，旨在方便作者及其好友使用
自定义带来了更智能的播放体验：

新版本设想
-手机端增加缓存功能
-同局域网手机控制电视端APP

📝 版本更新历史 (Changelog)
📱 v5.5.14.523 (Latest)
- 🔍 修复设置闪退
📱 v5.5.13.523 
- 🔍 修复搜索"未找到相关内容"的问题：放宽标题匹配为包含匹配（不区分大小写）
- 📡 增强 DLNA 投屏发现：支持多轮广播、延长等待时间至15秒、自动加入多播组
- 🎬 移动版播放页精简：仅保留集数选择、播放源、视频播放器和 DLNA 投屏按钮
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

📱 v5.5.8.523
🔧 性能优化：底层优化缓存下载模式，提升下载稳定性。

📱 v5.5.5
✨ 新增功能：上线缓存多选功能，支持批量操作。

📱 v5.5.4
✨ 新增功能：上线缓存分组功能，便于管理大批量剧集。

📱 v5.5.3
🔧 性能优化：优化下载线程数分配，平衡下载速度与系统资源。

🐛 问题修复：修复详情页获取视频失败的问题；修复首页偶发的动画显示错误。

📱 v5.5.2
🔧 界面优化：优化界面切换动画，提升流畅度。

📱 v5.5.1
🚀 核心功能：优化缓存合并机制，直接完美合成为 MP4 格式。

📱 v5.5.0
🧪 功能测试：全面测试全新架构的缓存功能。

📱 v5.4.4
🐛 问题修复：修复了几处已知的动画错位问题。

📱 v5.4.3
🔧 界面优化：优化 TV 端按钮点击动画。

🐛 问题修复：修复 DLNA 投屏占位符显示异常。

📱 v5.4.2
⚠️ 状态记录：修复尝试失败（此版本存在未解决异常）。

📱 v5.4.1 (Beta)
🔧 体验优化：大幅优化开屏动画性能。

✨ 功能迭代：优化 DLNA 投屏稳定性和兼容性。

📱 v5.4.0
✨ 新增功能：正式引入 DLNA 投屏支持，实现手机/电视联动。

📱 v5.3.4
🔧 全面优化：重构设置界面布局；优化 OTA 在线更新体验；微调全局界面切换动画。

📱 v5.3.3
🔧 界面优化：微调部分过渡动画。

📱 v5.3.2
🔧 界面优化：优化部分交互按钮的视觉样式。

📱 v5.3.1
🔧 界面优化：优化页面间的切换动画。

📱 v5.3.0
🐛 问题修复：修复了在部分电视设备上按键尺寸过大的 UI 适配问题。

📱 v5.2.9
✨ 界面更新：重构节点选择 UI 并新增交互动画。

🗑️ 功能调整：移除“播放记录删除”功能。

📱 v5.2.8
🐛 问题修复：紧急修复了导致应用闪退的核心严重 Bug。

📱 v5.2.7
⚠️ 缺陷版本：新增左右滑动交互与缓存清除功能。(注：此版本存在严重缺陷，无法正常使用)

📱 v5.2.6
✨ 功能调整：新增播放源缩减与自定义排序功能。

🐛 问题修复：修复 software 更新提示为“负百分比”的 UI Bug。(注：此版本无法正常使用)

📱 v5.2.5
🐛 问题修复：修复 OTA 软件下载后安装失败的问题。(注：此版本无法正常使用)

📱 v5.2.4
🔧 界面优化：更新并美化全局按钮 UI 样式。

📱 v5.2.3
🧪 功能测试：本地更新功能测试 2.0 阶段。

📱 v5.2.2
✨ 智能优化：根据 Gemini 的专业架构推荐，深度重构并优化了“节点选择”界面。

📱 v5.2.1
🚀 架构扩展：底层增加对 x86 和 x86_64 架构的支持，扩大设备兼容范围。

🧪 功能测试：测试自定义 OTA 固件更新流程。

🐛 问题修复：修复电视（TV）端由于遥控器焦点引发的“服务器节点无法选择”的顽固 Bug。

🗑️ 功能调整：为了界面整洁与安全，删除了显示节点具体 IP 地址的功能。

📱 v5.2.0
✨ 体验革新：引入全新智能化配置，用户无需再手动输入繁琐的服务器源。

⚡ 自动测速：新增后台自动测速机制，优先选择延迟最低的最快节点。

🔄 容灾切换：新增播放失败自动容灾逻辑，当前源失效时自动秒切到下一个可用源。

📺 TV 端优化：针对电视遥控器操作特征，进一步深度优化 TV 版原生 UI 布局。
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

## 📝 License

本项目采用 MIT 许可证。

## ⚠️ 免责声明

OrionTV 仅作为视频搜索工具，不存储、上传或分发 any 视频内容。所有视频均来自第三方 API 接口提供的搜索结果。如有侵权内容，请联系相应的内容提供方。

本项目开发者不对使用本项目产生的任何后果负责。使用本项目时，您必须遵守当地的法律法规。

## 🌟 Star History

[![Star History Chart](https://api.star-history.com/svg?repos=zimplexing/OrionTV&type=Date)](https://www.star-history.com/#zimplexing/OrionTV&Date)

## 🙏 致谢

本项目受到以下开源项目的启发：

- [MoonTV](https://github.com/senshinya/MoonTV) - 一个基于 Next.js 的视频聚合应用
- [LibreTV](https://github.com/LibreSpark/LibreTV) - 一个开源的视频流媒体应用

感谢以下项目提供 API Key 的赞助

- [gpt-load](https://github.com/tbphp/gpt-load) - 一个高性能的 OpenAI 格式 API 多密钥轮询代理服务器，支持负载均衡，使用 Go 语言开发
