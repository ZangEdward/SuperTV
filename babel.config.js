module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // 如果你使用了 expo-router，通常需要这个
      'expo-router/babel',
      // 如果代码里用了装饰器（常见于某些 TV 端的库）
      ['@babel/plugin-proposal-decorators', { legacy: true }],
      'react-native-reanimated/plugin', // 如果用到了动画库，必须放在最后
    ],
  };
};
