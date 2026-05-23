const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot);

// 添加 react-native-udp 的 polyfill
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  dgram: require.resolve("react-native-udp"),
};

module.exports = config;
