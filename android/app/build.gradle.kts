plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.xiaoxuhui.turing"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.xiaoxuhui.turing"
        minSdk = 24
        targetSdk = 34
        versionCode = 3
        versionName = "0.5.1"

        // 应用为单语言中文工具，去掉无用资源以减小体积
        resourceConfigurations += listOf("zh", "en")
    }

    /**
     * 固定 debug 签名。
     *
     * 不配这段的话，AGP 会在每台构建机上自动生成**随机** debug keystore：
     * GitHub Actions 每次都是全新 runner，于是每次发布出来的 APK 签名都不同，
     * 用户安装新包会被系统拒绝（INSTALL_FAILED_UPDATE_INCOMPATIBLE），
     * 现象是「明明有新版本，却一直更新不了」。
     * 只有用同一个 keystore 签出的后续版本才能覆盖安装。
     *
     * 这里的 `debug.keystore` 随仓库提交：debug key 的密码在 Android 文档里是公开的
     * （android / androiddebugkey），本身没有保密价值，唯一重要的是**它必须固定不变**。
     * 注意：v0.3.1 已经使用 CI 临时生成的另一把 debug key 发布，无法再找回，
     * 因此使用此 keystore 的**首个**版本（v0.5.0）需要用户卸载重装一次；
     * 从该版本起，这个文件就是固定的升级基线，绝不能替换。
     */
    signingConfigs {
        getByName("debug") {
            storeFile = file("debug.keystore")
            storeType = "PKCS12" // 文件名是 .keystore，不写这行 AGP 会按 JKS 猜
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
    }

    buildTypes {
        debug {
            // 首版使用 debug 签名，便于直接安装
            isMinifyEnabled = false
        }
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-ktx:1.9.2")
    implementation("androidx.webkit:webkit:1.11.0")
}
