// Checks an APK before it is handed to Android's installer (companion self-update).
// Pure rules: the Android app reads the facts with PackageManager and passes them in.
package app.vantaflow.core.setup

data class ApkInfo(val packageName: String, val versionCode: Long, val versionName: String?, val minSdk: Int, val signers: Set<String>)
data class InstalledApp(val packageName: String, val versionCode: Long, val versionName: String?, val signers: Set<String>)

data class ApkPlan(
    val ok: Boolean,
    val action: String?, // update | same-version | downgrade
    val errors: List<String>,
    val summary: String?,
    val affects: List<String> = emptyList(),
    val data: String = "Your saved consoles and settings are kept: Android keeps an app's data when the same app is updated.",
    val backup: String = "Yes: the companion's settings are backed up first.",
    val reversible: String = "Partly: Android does not install an older version over a newer one, so the update itself cannot be undone; your settings can be restored from the backup.",
    val permission: String = "Android asks once whether VantaFlow may install apps (\"Install unknown apps\"), then shows its own confirmation for this update. VantaFlow asks for no other permission.",
)

const val COMPANION = "app.vantaflow.companion"

fun checkApk(apk: ApkInfo?, installed: InstalledApp, deviceSdk: Int, fileName: String): ApkPlan {
    if (apk == null) return ApkPlan(false, null, listOf("This file is not a readable Android package (it is damaged, incomplete or not an APK)."), null)
    val errors = mutableListOf<String>()
    if (apk.packageName != COMPANION) errors += "This is \"${apk.packageName}\", not the VantaFlow companion. VantaFlow installs only its own app."
    if (apk.packageName == COMPANION && apk.signers != installed.signers) {
        errors += "This APK is signed with a different key than the installed app. Android would refuse it, and the only way around is uninstalling, which deletes the app's data. Not offered."
    }
    if (apk.minSdk > deviceSdk) errors += "It needs Android API ${apk.minSdk}; this phone has API $deviceSdk."
    val action = when {
        apk.versionCode > installed.versionCode -> "update"
        apk.versionCode == installed.versionCode -> "same-version"
        else -> "downgrade"
    }
    if (errors.isEmpty() && action == "same-version") errors += "Version ${apk.versionName ?: apk.versionCode} is already installed. Nothing to do."
    if (errors.isEmpty() && action == "downgrade") errors += "Version ${apk.versionName ?: apk.versionCode} is older than the installed ${installed.versionName ?: installed.versionCode}. Android installs older versions only after uninstalling, which deletes the app's data. Not offered."
    return ApkPlan(
        ok = errors.isEmpty(), action = action, errors = errors,
        summary = "Update the VantaFlow companion from ${installed.versionName ?: installed.versionCode} to ${apk.versionName ?: apk.versionCode} ($fileName).",
        affects = listOf("The VantaFlow companion app (${installed.versionName ?: installed.versionCode} → ${apk.versionName ?: apk.versionCode})"),
    )
}
