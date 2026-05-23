const { withDangerousMod, withMainApplication } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

module.exports = function withMulticastPlugin(config) {
  // 1. 注入 Java 文件
  config = withDangerousMod(config, [
    "android",
    async (config) => {
      const androidSrcMainPath = path.join(
        config.modRequest.platformProjectRoot,
        "app/src/main/java/com/supertv/app"
      );

      if (!fs.existsSync(androidSrcMainPath)) {
        fs.mkdirSync(androidSrcMainPath, { recursive: true });
      }

      fs.writeFileSync(
        path.join(androidSrcMainPath, "MulticastModule.java"),
        fs.readFileSync(path.join(__dirname, "MulticastModule.java"), "utf8")
      );

      fs.writeFileSync(
        path.join(androidSrcMainPath, "MulticastPackage.java"),
        fs.readFileSync(path.join(__dirname, "MulticastPackage.java"), "utf8")
      );

      return config;
    },
  ]);

  // 2. 修改 MainApplication.java（适配 RN 0.74）
  config = withMainApplication(config, (config) => {
    let src = config.modResults.contents;

    // 注入 import
    if (!src.includes("import com.supertv.app.MulticastPackage;")) {
      src = src.replace(
        "import com.facebook.react.defaults.DefaultReactNativeHost;",
        "import com.facebook.react.defaults.DefaultReactNativeHost;\nimport com.supertv.app.MulticastPackage;"
      );
    }

    // 注入 package
    if (!src.includes("new MulticastPackage()")) {
      src = src.replace(
        "return new PackageList(this).getPackages();",
        "return new PackageList(this).getPackages().concat(new MulticastPackage());"
      );
    }

    config.modResults.contents = src;
    return config;
  });

  return config;
};
