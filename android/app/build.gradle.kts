plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.wpcrm.calllogger"
    compileSdk = 35
    defaultConfig {
        applicationId = "com.wpcrm.calllogger.offline"
        minSdk = 26
        targetSdk = 35
        versionCode = 29
        versionName = "29-offline-preview"
        ndk { abiFilters += listOf("arm64-v8a", "x86_64") }
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }
    signingConfigs {
        create("offline") {
            storeFile = file(System.getenv("WPCRM_KEYSTORE") ?: "../../.android-tools/wpcrm-offline.jks")
            storePassword = System.getenv("WPCRM_SIGNING_PASSWORD")
            keyAlias = "wpcrm-offline"
            keyPassword = System.getenv("WPCRM_SIGNING_PASSWORD")
        }
    }
    buildTypes { release { signingConfig = signingConfigs.getByName("offline"); isMinifyEnabled = false } }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
    androidResources { noCompress += "onnx" }
    sourceSets["main"].assets.srcDir(layout.buildDirectory.dir("generated/web-assets"))
}

val webFiles = listOf("index.html", "app.js", "entry-tools.js", "field-dictation.js", "native-offline.js",
    "styles.css", "papaparse.min.js", "icon.svg", "icon-192.png", "icon-512.png", "manifest.webmanifest", "START-HERE.html", "android-guide.html")
val bundleWeb by tasks.registering(Copy::class) {
    from("../..") { include(webFiles) }
    into(layout.buildDirectory.dir("generated/web-assets/www"))
}
val verifyOfflineAssets by tasks.registering {
    doLast {
        for (asset in listOf("encoder.onnx", "decoder.onnx", "joiner.onnx", "tokens.txt")) {
            check(file("src/main/assets/model/$asset").length() > 0) { "Run android/prepare.ps1 before building: missing $asset" }
        }
    }
}
tasks.named("preBuild") { dependsOn(bundleWeb, verifyOfflineAssets) }

dependencies {
    implementation(files("libs/sherpa-onnx-1.13.8.aar"))
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("androidx.core:core-ktx:1.15.0")
    androidTestImplementation("androidx.test:runner:1.6.2")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
}
