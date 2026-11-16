// A SIMULATED Android installer for tests: no APK is installed. "APK" files are small JSON
// stand-ins describing the package; the fake answers like Android's PackageInstaller would.
package app.vantaflow.companion

import android.content.Intent
import android.os.Handler
import android.os.Looper
import app.vantaflow.core.setup.ApkInfo
import app.vantaflow.core.setup.COMPANION
import app.vantaflow.core.setup.InstalledApp
import org.json.JSONObject
import java.io.File

class FakeInstaller(var versionCode: Long = 1, var versionName: String = "0.4.0") : Installer {
    var permission = true
    val sessions = mutableListOf<Int>()
    var answer: InstallResult = InstallResult.Success
    var installs = 0

    override fun installed() = InstalledApp(COMPANION, versionCode, versionName, setOf("vantaflow-key"))
    override fun inspect(file: File): ApkInfo? = runCatching {
        val o = JSONObject(file.readText())
        ApkInfo(o.getString("package"), o.getLong("versionCode"), o.optString("versionName"), o.optInt("minSdk", 26), setOf(o.optString("signer", "vantaflow-key")))
    }.getOrNull()
    override fun canInstall() = permission
    override fun permissionIntent() = Intent("test.MANAGE_UNKNOWN_APP_SOURCES")
    override fun openSessions() = sessions.toList()
    override fun abandon(sessionId: Int) { sessions.remove(sessionId) }
    override fun install(file: File): Int {
        val apk = inspect(file)!!
        val id = 100 + ++installs
        sessions += id
        Handler(Looper.getMainLooper()).post {
            InstallEvents.emit(id, InstallResult.NeedsUserAction)
            if (answer == InstallResult.Success) { versionCode = apk.versionCode; versionName = apk.versionName ?: "" }
            sessions.remove(id)
            InstallEvents.emit(id, answer)
        }
        return id
    }

    companion object {
        fun apk(dir: File, name: String, versionCode: Long, versionName: String, pkg: String = COMPANION, signer: String = "vantaflow-key") =
            File(dir, name).apply { writeText(JSONObject().put("package", pkg).put("versionCode", versionCode).put("versionName", versionName).put("signer", signer).toString()) }
    }
}
