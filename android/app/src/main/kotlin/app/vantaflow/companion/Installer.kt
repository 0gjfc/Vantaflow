// Android's side of installing a companion update: reading an APK's facts, asking Android's
// PackageInstaller to install it, and its results. Android always shows its own confirmation
// (USER_ACTION_REQUIRED), and the user must have allowed VantaFlow to "Install unknown apps".
// Tests use a fake implementation of Installer; this file is the only one that touches
// PackageInstaller.
package app.vantaflow.companion

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.PackageInstaller
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import app.vantaflow.core.setup.ApkInfo
import app.vantaflow.core.setup.COMPANION
import app.vantaflow.core.setup.InstalledApp
import app.vantaflow.core.setup.sha256
import java.io.File

// What Android reported for an installation session.
sealed interface InstallResult {
    data object NeedsUserAction : InstallResult
    data object Success : InstallResult
    data object Cancelled : InstallResult
    data class Failed(val reason: String) : InstallResult
}

interface Installer {
    fun installed(): InstalledApp
    fun inspect(file: File): ApkInfo?
    fun canInstall(): Boolean
    fun permissionIntent(): Intent
    fun openSessions(): List<Int>
    fun abandon(sessionId: Int)
    // Starts the installation and returns the session id. Results arrive through InstallEvents.
    fun install(file: File): Int
}

// Results from InstallResultReceiver to whoever is listening (SetupModel).
object InstallEvents {
    @Volatile var listener: ((Int, InstallResult) -> Unit)? = null
    fun emit(sessionId: Int, result: InstallResult) = listener?.invoke(sessionId, result)
}

class InstallResultReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val session = intent.getIntExtra(PackageInstaller.EXTRA_SESSION_ID, -1)
        val message = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE)
        val result = when (val status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)) {
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                @Suppress("DEPRECATION")
                val confirm = intent.getParcelableExtra<Intent>(Intent.EXTRA_INTENT)
                confirm?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)?.let(context::startActivity) // Android's own confirmation screen
                InstallResult.NeedsUserAction
            }
            PackageInstaller.STATUS_SUCCESS -> InstallResult.Success
            PackageInstaller.STATUS_FAILURE_ABORTED -> InstallResult.Cancelled
            else -> InstallResult.Failed(failureText(status, message))
        }
        InstallEvents.emit(session, result)
    }

    private fun failureText(status: Int, message: String?) = when (status) {
        PackageInstaller.STATUS_FAILURE_BLOCKED -> "Android blocked the installation (a device policy or Play Protect)."
        PackageInstaller.STATUS_FAILURE_CONFLICT -> "The update conflicts with the installed app (for example a different signing key)."
        PackageInstaller.STATUS_FAILURE_INCOMPATIBLE -> "The update is not compatible with this phone."
        PackageInstaller.STATUS_FAILURE_INVALID -> "Android found the APK invalid or damaged."
        PackageInstaller.STATUS_FAILURE_STORAGE -> "There is not enough storage on the phone."
        else -> "Android reported a failure."
    } + (message?.let { " ($it)" } ?: "")
}

class AndroidInstaller(private val context: Context) : Installer {
    private val pm get() = context.packageManager
    private val flags = if (Build.VERSION.SDK_INT >= 28) PackageManager.GET_SIGNING_CERTIFICATES else @Suppress("DEPRECATION") PackageManager.GET_SIGNATURES

    @Suppress("DEPRECATION")
    private fun signers(info: PackageInfo): Set<String> =
        (if (Build.VERSION.SDK_INT >= 28) info.signingInfo?.apkContentsSigners else info.signatures)
            ?.map { sha256(it.toByteArray()) }?.toSet() ?: emptySet()

    @Suppress("DEPRECATION")
    private fun versionCode(info: PackageInfo) = if (Build.VERSION.SDK_INT >= 28) info.longVersionCode else info.versionCode.toLong()

    override fun installed(): InstalledApp {
        val info = pm.getPackageInfo(context.packageName, flags)
        return InstalledApp(info.packageName, versionCode(info), info.versionName, signers(info))
    }

    override fun inspect(file: File): ApkInfo? {
        val info = pm.getPackageArchiveInfo(file.path, flags) ?: return null
        info.applicationInfo?.let { it.sourceDir = file.path; it.publicSourceDir = file.path }
        return ApkInfo(info.packageName, versionCode(info), info.versionName, info.applicationInfo?.minSdkVersion ?: 1, signers(info))
    }

    override fun canInstall() = pm.canRequestPackageInstalls()

    override fun permissionIntent() = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context.packageName}"))

    override fun openSessions() = pm.packageInstaller.mySessions.map { it.sessionId }

    override fun abandon(sessionId: Int) = runCatching { pm.packageInstaller.abandonSession(sessionId) }.let { }

    override fun install(file: File): Int {
        val installer = pm.packageInstaller
        val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL).apply {
            setAppPackageName(COMPANION)
            if (Build.VERSION.SDK_INT >= 31) setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_REQUIRED)
        }
        val id = installer.createSession(params)
        try {
            installer.openSession(id).use { session ->
                file.inputStream().use { input ->
                    session.openWrite("vantaflow.apk", 0, file.length()).use { out -> input.copyTo(out); session.fsync(out) }
                }
                val intent = Intent(context, InstallResultReceiver::class.java).setPackage(context.packageName)
                val mutable = if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0
                session.commit(PendingIntent.getBroadcast(context, id, intent, PendingIntent.FLAG_UPDATE_CURRENT or mutable).intentSender)
            }
        } catch (e: Exception) {
            installer.abandonSession(id)
            throw e
        }
        return id
    }
}
