plugins {
    alias(libs.plugins.android.application)
    kotlin("android")
    alias(libs.plugins.kotlin.compose)
}

android {
    namespace = "com.supertv.resupertv"
    compileSdk = 36

    signingConfigs {
        create("release") {
            storeFile = file(project.findProperty("MYAPP_UPLOAD_STORE_FILE") as? String ?: "release-key.jks")
            storePassword = project.findProperty("MYAPP_UPLOAD_STORE_PASSWORD") as? String
            keyAlias = project.findProperty("MYAPP_UPLOAD_KEY_ALIAS") as? String
            keyPassword = project.findProperty("MYAPP_UPLOAD_KEY_PASSWORD") as? String
        }
    }

    defaultConfig {
        applicationId = "com.supertv.app"
        minSdk = 24                     // Android 7.0，兼容老电视
        targetSdk = 36
        versionCode = 2                 // 递增，原为1
        versionName = "6.0.0.0"         // 新版本号

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        // API 节点列表 JSON — 构建时由 CI/Secrets 注入
        buildConfigField(
            "String",
            "API_NODES_JSON",
            "\"${project.findProperty("API_NODES_JSON") ?: "[]"}\""
        )
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            signingConfig = signingConfigs.getByName("release")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
    kotlinOptions {
        jvmTarget = "11"
    }
    buildFeatures {
        viewBinding = true
        compose = true
        buildConfig = true
    }
}

dependencies {
    implementation(libs.androidx.appcompat)
    implementation(libs.androidx.constraintlayout)
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.livedata.ktx)
    implementation(libs.androidx.lifecycle.viewmodel.ktx)
    implementation(libs.androidx.navigation.fragment.ktx)
    implementation(libs.androidx.navigation.ui.ktx)
    implementation(libs.androidx.recyclerview)
    implementation(libs.material)
    
    // Retrofit & Gson
    implementation("com.squareup.retrofit2:retrofit:2.9.0")
    implementation("com.squareup.retrofit2:converter-gson:2.9.0")

    // OkHttp Logging
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")

    // Jetpack Compose
    implementation(platform("androidx.compose:compose-bom:2024.02.00"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material3:material3-window-size-class")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.activity:activity-compose:1.8.2")

    // Media3 (ExoPlayer)
    implementation("androidx.media3:media3-exoplayer:1.10.1")
    implementation("androidx.media3:media3-ui:1.10.1")

    // Coil (图片加载库)
    implementation("io.coil-kt:coil-compose:2.6.0")

    // Lifecycle ViewModel Compose
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.7.0")

    // DataStore
    implementation("androidx.datastore:datastore-preferences:1.0.0")

    // 原生并发检索与远程控制依赖
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("org.nanohttpd:nanohttpd:2.3.1")

    testImplementation(libs.junit)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(libs.androidx.junit)
}