// Cleanup of the companion's temporary installation files. Only files in VantaFlow's own
// install folder (app cache) whose names VantaFlow gives them ("vf-<opId>.apk") are removed,
// and never the one an unfinished installation still needs. Backups are never touched.
package app.vantaflow.core.setup

import java.io.File

data class CleanupItem(val file: File, val reason: String, val size: Long)
data class CleanupPreview(val remove: List<CleanupItem>, val keep: List<CleanupItem>, val token: String)

private val OURS = Regex("^vf-[0-9a-z-]+\\.apk$")

fun previewCleanup(installDir: File, journal: InstallJournal?): CleanupPreview {
    val running = journal?.takeIf { it.state == "running" }?.apkFile
    val remove = mutableListOf<CleanupItem>()
    val keep = mutableListOf<CleanupItem>()
    for (f in (installDir.listFiles() ?: emptyArray()).sortedBy { it.name }) {
        when {
            !f.isFile -> keep += CleanupItem(f, "Not a VantaFlow temporary file.", 0)
            !OURS.matches(f.name) -> keep += CleanupItem(f, "Not created by VantaFlow, or its purpose is unknown.", f.length())
            f.absolutePath == running -> keep += CleanupItem(f, "Needed by an installation that has not finished.", f.length())
            else -> remove += CleanupItem(f, "Copy of an APK from an earlier installation.", f.length())
        }
    }
    return CleanupPreview(remove, keep, sha256(remove.joinToString("\n") { it.file.absolutePath }.toByteArray()))
}

// Removes exactly what the confirmed preview listed; if anything changed, removes nothing.
fun runCleanup(installDir: File, journal: InstallJournal?, token: String): List<CleanupItem> {
    val preview = previewCleanup(installDir, journal)
    if (token != preview.token) throw SetupException("stale-preview", "The files changed since the preview. Nothing was removed; review the cleanup again.")
    return preview.remove.filter { it.file.delete() }
}

fun newApkName(opId: String) = "vf-$opId.apk"
