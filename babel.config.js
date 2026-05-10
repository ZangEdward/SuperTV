module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'], // SDK 51 只需要这一个 preset 即可自动处理 router
    plugins: [
      // 注意：如果你使用了 react-native-reanimated，请务必保留下面这一行
      // 且它必须放在插件列表的最后面
      'react-native-reanimated/plugin',
    ],
  };
};
