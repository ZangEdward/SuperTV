// plugins/multicast-plugin.js

const { withAppBuildGradle, withMainApplication, withDangerousMod } = require("@expo/config-plugins");
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

      // 写入 MulticastModule.java
      fs.writeFileSync(
        path.join(androidSrcMainPath, "MulticastModule.java"),
        fs.readFileSync(path.join(__dirname, "MulticastModule.java"), "utf8")
      );

      // 写入 MulticastPackage.java
      fs.writeFileSync(
        path.join(androidSrcMainPath, "MulticastPackage.java"),
        fs.readFileSync(path.join(__dirname, "MulticastPackage.java"), "utf8")
      );

      return config;
    },
  ]);

  // 2. 修改 MainApplication.java，自动注册 MulticastPackage
  config = withMainApplication(config, (config) => {
    let src = config.modResults.contents;

    if (!src.includes("new MulticastPackage()")) {
      src = src.replace(
        "return packages;",
        "packages.add(new MulticastPackage());\n        return packages;"
      );
    }

    if (!src.includes("import com.supertv.app.MulticastPackage;")) {
      src = src.replace(
        "import com.facebook.react.ReactApplication;",
        "import com.facebook.react.ReactApplication;\nimport com.supertv.app.MulticastPackage;"
      );
    }

    config.modResults.contents = src;
    return config;
  });

  return config;
};
