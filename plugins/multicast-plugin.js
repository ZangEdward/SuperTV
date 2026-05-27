const { withDangerousMod, withMainApplication, withAndroidManifest } = require("@expo/config-plugins");
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

      const filesToCopy = [
        "MulticastModule.java",
        "MulticastPackage.java",
        "NativeCryptoModule.java",
        "CastForegroundService.java",
        "CastNotificationModule.java",
      ];

      filesToCopy.forEach(fileName => {
        const srcPath = path.join(__dirname, fileName);
        if (fs.existsSync(srcPath)) {
          fs.writeFileSync(
            path.join(androidSrcMainPath, fileName),
            fs.readFileSync(srcPath, "utf8")
          );
        }
      });

      return config;
    },
  ]);

  // 2. 修改 Kotlin MainApplication.kt
  config = withMainApplication(config, (config) => {
    let src = config.modResults.contents;

    // 注入 import
    if (!src.includes("import com.supertv.app.MulticastPackage")) {
      src = src.replace(
        "import com.facebook.react.defaults.DefaultReactNativeHost",
        "import com.facebook.react.defaults.DefaultReactNativeHost\nimport com.supertv.app.MulticastPackage"
      );
    }

    // 注入 package
    if (!src.includes("MulticastPackage()")) {
      src = src.replace(
        "return PackageList(this).packages",
        "return PackageList(this).packages + MulticastPackage()"
      );
    }

    config.modResults.contents = src;
    return config;
  });

  // 3. 修改 AndroidManifest.xml - 添加前台服务权限和服务声明
  config = withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;

    // 添加 FOREGROUND_SERVICE 权限
    if (manifest["uses-permission"]) {
      const hasForegroundService = manifest["uses-permission"].some(
        (p) => p["$"]["android:name"] === "android.permission.FOREGROUND_SERVICE"
      );
      if (!hasForegroundService) {
        manifest["uses-permission"].push({
          "$": { "android:name": "android.permission.FOREGROUND_SERVICE" }
        });
      }
      // POST_NOTIFICATIONS for Android 13+
      const hasPostNotifications = manifest["uses-permission"].some(
        (p) => p["$"]["android:name"] === "android.permission.POST_NOTIFICATIONS"
      );
      if (!hasPostNotifications) {
        manifest["uses-permission"].push({
          "$": { "android:name": "android.permission.POST_NOTIFICATIONS" }
        });
      }
    }

    // 添加前台服务声明
    const application = manifest["application"];
    if (application && application.length > 0) {
      let services = application[0]["service"];
      if (!services) {
        services = [];
        application[0]["service"] = services;
      }

      const hasCastService = services.some(
        (s) => s["$"]["android:name"] === ".CastForegroundService"
      );
      if (!hasCastService) {
        services.push({
          "$": {
            "android:name": ".CastForegroundService",
            "android:exported": "false",
            "android:foregroundServiceType": "mediaPlayback"
          }
        });
      }
    }

    return config;
  });

  return config;
};
