// VantaFlow Android companion app (Jetpack Compose). Depends on :core for models, detection and
// the compatibility engine, and bundles ../shared as assets so it reads the same JSON files as
// the desktop app. NOTE: not compiled in the development environment (no Android SDK there);
// see ../README.md.
plugins {
    id("com.android.application")
    kotlin("android")
    id("org.jetbrains.kotlin.plugin.compose")
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
    // Screen tests run on the JVM with Robolectric (no emulator needed).
    testOptions { unitTests.isIncludeAndroidResources = true }
}

tasks.withType<Test>().configureEach {
    systemProperty("vantaflow.shared", rootProject.file("../shared").absolutePath)
}

dependencies {
    implementation(project(":core"))
    implementation(platform("androidx.compose:compose-bom:2024.12.01"))
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")

    testImplementation("junit:junit:4.13.2")
    testImplementation("org.robolectric:robolectric:4.14.1")
    testImplementation("androidx.compose.ui:ui-test-junit4")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
}
