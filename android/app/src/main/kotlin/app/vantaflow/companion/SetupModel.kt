// State and actions for the companion's Install & recovery screen: checking an APK, backing up
// settings, handing the update to Android, deciding the outcome after an interruption,
// restoring backups and cleaning up. Every change is confirmed in the UI first.
package app.vantaflow.companion

import android.app.Application
import android.content.Context
import android.net.Uri
import android.os.Build
import android.provider.OpenableColumns
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import app.vantaflow.core.setup.ApkPlan
import app.vantaflow.core.setup.Backup
import app.vantaflow.core.setup.BackupStore
import app.vantaflow.core.setup.CleanupPreview
import app.vantaflow.core.setup.InstallJournal
import app.vantaflow.core.setup.SettingsStore
import app.vantaflow.core.setup.SetupException
import app.vantaflow.core.setup.StartupCheck
import app.vantaflow.core.setup.checkApk
import app.vantaflow.core.setup.checkAtStartup
import app.vantaflow.core.setup.newApkName
import app.vantaflow.core.setup.newId
import app.vantaflow.core.setup.previewCleanup
import app.vantaflow.core.setup.restoreVerified
import app.vantaflow.core.setup.runCleanup
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

const val JOURNAL_KEY = "install-journal" // never part of a settings backup

class SetupModel internal constructor(app: Application, private val installer: Installer, private val sdk: Int) : AndroidViewModel(app) {
    constructor(app: Application) : this(app, AndroidInstaller(app), Build.VERSION.SDK_INT)

    private val prefs = app.getSharedPreferences("vantaflow", Context.MODE_PRIVATE)
    val installDir = File(app.cacheDir, "install").apply { mkdirs() } // VantaFlow's own temporary folder
    val backups = BackupStore(File(app.filesDir, "backups")) { installer.installed().versionName }

    // The companion's settings: every SharedPreferences entry except the installation journal.
    val settingsStore = object : SettingsStore {
        override fun read(): Map<String, String> = prefs.all.filterKeys { it != JOURNAL_KEY }.mapNotNull { (k, v) -> (v as? String)?.let { k to it } }.toMap()
        override fun replace(entries: Map<String, String>) {
            val e = prefs.edit()
            prefs.all.keys.filter { it != JOURNAL_KEY }.forEach { e.remove(it) }
            entries.forEach { (k, v) -> e.putString(k, v) }
            check(e.commit()) { "Could not write the settings." }
        }
    }

    var installed by mutableStateOf(installer.installed())
        private set
    var backupList by mutableStateOf(backups.list())
        private set
    var startup by mutableStateOf<StartupCheck>(StartupCheck.Nothing)
        private set
    var plan by mutableStateOf<ApkPlan?>(null)
        private set
    var apkFile by mutableStateOf<File?>(null)
        private set
    var needsPermission by mutableStateOf(false)
    var busy by mutableStateOf<String?>(null)
        private set
    var notice by mutableStateOf<Notice?>(null)
    var cleanup by mutableStateOf<CleanupPreview?>(null)
    var onSettingsRestored: () -> Unit = {}

    private var journal: InstallJournal?
        get() = InstallJournal.fromJson(prefs.getString(JOURNAL_KEY, null))
        set(value) { prefs.edit().putString(JOURNAL_KEY, value?.toJson()).commit() }

    init {
        InstallEvents.listener = { session, result -> viewModelScope.launch { onResult(session, result) } }
        checkStartup()
    }

    override fun onCleared() { InstallEvents.listener = null }

    // Decides an earlier installation's outcome from facts (version now installed, open sessions).
    fun checkStartup() {
        installed = installer.installed()
        val j = journal
        startup = checkAtStartup(j, installed.versionCode, j?.sessionId?.let { it in installer.openSessions() } ?: false)
        (startup as? StartupCheck.Updated)?.let { journal = it.journal.copy(state = "done", message = "Updated and verified: Android reports version ${installed.versionName}.") }
    }

    private fun refresh() { installed = installer.installed(); backupList = backups.list() }

    // Called when the screen opens, so it shows the current files and installation state.
    fun reload() { if (journal?.state == "running") checkStartup() else installed = installer.installed(); backupList = backups.list() }

    // 1. The user picked an APK: copy it into VantaFlow's folder and check it. Nothing is installed.
    fun pick(uri: Uri) {
        val ctx = getApplication<Application>()
        val name = ctx.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c -> if (c.moveToFirst()) c.getString(0) else null } ?: "update.apk"
        val target = File(installDir, newApkName(newId("install")))
        runCatching { ctx.contentResolver.openInputStream(uri)!!.use { input -> target.outputStream().use { input.copyTo(it) } } }
            .onFailure { notice = Notice("Could not read the file", it.message ?: "", false); return }
        check(target, name)
    }

    fun check(file: File, displayName: String = file.name) {
        val p = checkApk(installer.inspect(file), installer.installed(), sdk, displayName)
        if (!p.ok) {
            file.delete() // our own copy; the user's original file is untouched
            notice = Notice("Cannot install", p.errors.joinToString(" "), false)
            return
        }
        apkFile = file
        plan = p
    }

    fun dismissPlan() {
        apkFile?.delete()
        apkFile = null
        plan = null
        notice = Notice("Cancelled", "Nothing was changed.", true)
    }

    // 2. Confirmed: back up settings, record the operation, hand the APK to Android.
    fun install() {
        val file = apkFile ?: return
        val p = plan ?: return
        if (!installer.canInstall()) { needsPermission = true; return }
        val apk = installer.inspect(file)
        if (apk == null || !file.exists()) { notice = Notice("Cannot install", "The APK is no longer readable. Choose it again.", false); plan = null; return }
        busy = "Backing up your settings…"
        viewModelScope.launch {
            try {
                val backup = withContext(Dispatchers.IO) { backups.create(settingsStore.read(), "Before updating to ${apk.versionName ?: apk.versionCode}", "before-update") }
                val opId = file.name.removePrefix("vf-").removeSuffix(".apk")
                journal = InstallJournal(opId, "running", installed.versionCode, apk.versionCode, apk.versionName, backup.id, null, file.absolutePath)
                busy = "Waiting for Android's confirmation…"
                val session = withContext(Dispatchers.IO) { installer.install(file) }
                journal = journal?.copy(sessionId = session)
                plan = null
            } catch (e: Exception) {
                journal = journal?.copy(state = "failed", message = e.message)
                busy = null
                notice = Notice("It did not work", "${e.message ?: "The installation could not start."} Nothing was installed; your settings are unchanged.", false)
            }
            backupList = backups.list()
        }
    }

    // 3. Android's answer. Success is reported only when Android reports the new version.
    private fun onResult(session: Int, result: InstallResult) {
        val j = journal?.takeIf { it.sessionId == session || it.sessionId == null } ?: return
        when (result) {
            InstallResult.NeedsUserAction -> busy = "Confirm the update in Android's dialog…"
            InstallResult.Success -> {
                busy = null
                installed = installer.installed()
                if (installed.versionCode == j.toVersionCode) {
                    journal = j.copy(state = "done", message = "Updated and verified.")
                    notice = Notice("Updated", "The companion is now ${installed.versionName}; Android reports the new version. Your settings were kept.", true)
                } else {
                    journal = j.copy(state = "failed", message = "Android reported success but the version did not change.")
                    notice = Notice("Not verified", "Android reported success, but the installed version is still ${installed.versionName}. Nothing is claimed.", false)
                }
                apkFile = null
            }
            InstallResult.Cancelled -> {
                busy = null
                journal = j.copy(state = "cancelled", message = "Cancelled in Android's dialog.")
                notice = Notice("Cancelled", "The update was cancelled. Nothing was changed; your settings are as before.", true)
            }
            is InstallResult.Failed -> {
                busy = null
                journal = j.copy(state = "failed", message = result.reason)
                notice = Notice("It did not work", "${result.reason} The installed app and your settings are unchanged. A backup of your settings was made before.", false)
            }
        }
        refresh()
    }

    // Recovery after an interruption: close Android's unfinished session and the record.
    fun recoverInterrupted() {
        val s = startup as? StartupCheck.Interrupted ?: return
        s.journal.sessionId?.let { if (it in installer.openSessions()) installer.abandon(it) }
        val left = s.journal.sessionId?.let { it in installer.openSessions() } ?: false
        journal = s.journal.copy(state = "recovered", message = "Interrupted; the unfinished session was closed.")
        startup = StartupCheck.Nothing
        refresh()
        notice = if (left) Notice("Not finished", "Android still lists the unfinished installation session. Restart the phone and check again.", false)
        else Notice("Recovered", "The unfinished installation was closed. The companion is still ${installed.versionName}; your settings were not changed.", true)
    }

    fun backupNow() = viewModelScope.launch {
        busy = "Backing up…"
        notice = try {
            val b = withContext(Dispatchers.IO) { backups.create(settingsStore.read(), "Backup of settings (made by you)") }
            Notice("Backed up", "${b.settingsEntries} settings entries saved and verified.", true)
        } catch (e: SetupException) { Notice("Backup failed", e.message ?: "", false) }
        busy = null
        backupList = backups.list()
    }

    // Restores settings only from a verified backup; the current ones are backed up first and
    // put back if the restored ones do not read back exactly.
    fun restore(b: Backup) = viewModelScope.launch {
        busy = "Restoring…"
        notice = try {
            val entries = backups.settings(b.id)
            withContext(Dispatchers.IO) { backups.create(settingsStore.read(), "Before restoring settings", "before-restore") }
            if (restoreVerified(settingsStore, entries)) { onSettingsRestored(); Notice("Settings restored", "Every entry was written and read back unchanged.", true) }
            else Notice("Not restored", "The settings did not read back exactly; your previous settings were put back.", false)
        } catch (e: SetupException) { Notice("Not restored", e.message ?: "", false) }
        busy = null
        backupList = backups.list()
    }

    fun delete(b: Backup) {
        notice = try { backups.delete(b.id, allowValid = true); Notice("Backup deleted", b.description, true) } catch (e: SetupException) { Notice("Not deleted", e.message ?: "", false) }
        backupList = backups.list()
    }

    fun permissionIntent() = installer.permissionIntent()
    fun previewCleanup() { cleanup = previewCleanup(installDir, journal) }
    fun leftoverSessions() = installer.openSessions().filter { it != journal?.takeIf { j -> j.state == "running" }?.sessionId }

    fun runCleanup() {
        val preview = cleanup ?: return
        cleanup = null
        notice = try {
            val removed = runCleanup(installDir, journal, preview.token)
            val open = leftoverSessions()
            open.forEach(installer::abandon)
            Notice("Cleaned up", "Removed ${removed.size} temporary file${if (removed.size == 1) "" else "s"}${if (open.isNotEmpty()) " and ${open.size} unfinished installer session${if (open.size == 1) "" else "s"}" else ""}. Kept ${preview.keep.size}. Backups and settings were not touched.", true)
        } catch (e: SetupException) { Notice("Nothing removed", e.message ?: "", false) }
    }
}
