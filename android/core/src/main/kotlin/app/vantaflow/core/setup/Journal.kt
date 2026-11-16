// The companion's record of an installation in progress. Android may end VantaFlow's process
// while it installs VantaFlow itself, so the result is decided at the next start from facts:
// the version Android reports now, and whether an installer session is still open.
package app.vantaflow.core.setup

import org.json.JSONObject
import java.time.Instant

data class InstallJournal(
    val opId: String,
    val state: String, // running | done | failed | cancelled | recovered
    val fromVersionCode: Long,
    val toVersionCode: Long,
    val toVersionName: String?,
    val backupId: String?,
    val sessionId: Int?,
    val apkFile: String?,
    val message: String? = null,
    val startedAt: String = Instant.now().toString(),
) {
    fun toJson(): String = JSONObject().put("opId", opId).put("state", state).put("fromVersionCode", fromVersionCode).put("toVersionCode", toVersionCode)
        .put("toVersionName", toVersionName).put("backupId", backupId).put("sessionId", sessionId).put("apkFile", apkFile).put("message", message).put("startedAt", startedAt).toString()

    companion object {
        fun fromJson(text: String?): InstallJournal? = runCatching {
            val o = JSONObject(text!!)
            InstallJournal(o.getString("opId"), o.getString("state"), o.getLong("fromVersionCode"), o.getLong("toVersionCode"), o.optString("toVersionName").ifEmpty { null },
                o.optString("backupId").ifEmpty { null }, if (o.has("sessionId")) o.getInt("sessionId") else null, o.optString("apkFile").ifEmpty { null },
                o.optString("message").ifEmpty { null }, o.optString("startedAt"))
        }.getOrNull()
    }
}

sealed interface StartupCheck {
    data object Nothing : StartupCheck
    // Android reports the new version: the update is verified.
    data class Updated(val journal: InstallJournal) : StartupCheck
    // The installation did not finish and nothing changed; an installer session may be left open.
    data class Interrupted(val journal: InstallJournal, val openSession: Boolean) : StartupCheck
}

fun checkAtStartup(journal: InstallJournal?, installedVersionCode: Long, sessionOpen: Boolean): StartupCheck = when {
    journal == null || journal.state != "running" -> StartupCheck.Nothing
    installedVersionCode == journal.toVersionCode -> StartupCheck.Updated(journal)
    else -> StartupCheck.Interrupted(journal, sessionOpen)
}
