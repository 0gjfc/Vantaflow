// VantaFlow Android companion app (Jetpack Compose). Depends on :core for models, detection and
// the compatibility engine, and bundles ../shared as assets so it reads the same JSON files as
// the desktop app. NOTE: not compiled in the development environment (no Android SDK there);
// see ../README.md.
plugins {
    id("com.android.application") version "8.7.3"
    kotlin("android") version "2.0.21"
    id("org.jetbrains.kotlin.plugin.compose") version "2.0.21"
}

android {
    namespace = "app.vantaflow.companion"
    compileSdk = 35
    defaultConfig {
        applicationId = "app.vantaflow.companion"
        minSdk = 26 // java.time
        targetSdk = 35
        versionCode = 1
        versionName = "0.4.0"
    }
    sourceSets["main"].assets.srcDirs("../../shared")
    buildFeatures { compose = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation(project(":core"))
    implementation(platform("androidx.compose:compose-bom:2024.12.01"))
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
}
