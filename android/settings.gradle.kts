// VantaFlow Android companion.
// :core is plain Kotlin (no Android SDK needed): shared models, compatibility engine, detection.
// :app is the Android UI. It needs the Android SDK, so it is included only when one is set up
// (Android Studio writes local.properties; on the command line set ANDROID_HOME).
pluginManagement {
    repositories { google(); mavenCentral(); gradlePluginPortal() }
}
dependencyResolutionManagement {
    repositories { google(); mavenCentral() }
}
rootProject.name = "vantaflow-companion"
include(":core")
if (System.getenv("ANDROID_HOME") != null || file("local.properties").exists()) include(":app")
