// Backups of the companion's settings (Android). Same manifest format as the desktop
// (desktop/setup/backups.mjs, docs/installation.md), with platform "android".
// A backup is written to .incomplete-<id>/, verified, then renamed to <id>/: a backup that
// exists under its own id is always complete, and an existing backup is never overwritten.
package app.vantaflow.core.setup

import app.vantaflow.core.model.objects
import app.vantaflow.core.model.text
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest
import java.security.SecureRandom
import java.text.SimpleDateFormat
import java.time.Instant
import java.util.Date
import java.util.TimeZone

class SetupException(val code: String, message: String) : Exception(message)

fun sha256(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }

fun newId(prefix: String): String {
    val stamp = SimpleDateFormat("yyyyMMddHHmmss").apply { timeZone = TimeZone.getTimeZone("UTC") }.format(Date())
    val rnd = ByteArray(3).also { SecureRandom().nextBytes(it) }.joinToString("") { "%02x".format(it) }
    return "$prefix-$stamp-$rnd"
}

// Writes to a temporary name, then renames, so a crash leaves the old file or the new one.
fun File.writeAtomic(text: String) {
    val tmp = File(parentFile, "$name.writing")
    tmp.writeText(text)
    if (!tmp.renameTo(this)) { delete(); if (!tmp.renameTo(this)) throw SetupException("write-failed", "Could not write $name.") }
}

data class FileEntry(val path: String, val size: Long, val sha256: String)

data class Backup(
    val id: String,
    val status: String, // valid | damaged | incomplete
    val description: String,
    val reason: String?,
    val createdAt: String?,
    val appVersion: String?,
    val settingsEntries: Int,
    val problems: List<String>,
)

class BackupStore(val dir: File, private val appVersion: () -> String? = { null }) {
    private val incomplete = ".incomplete-"

    init { dir.mkdirs() }

    // Settings are the companion's SharedPreferences entries, stored as text.
    fun create(settings: Map<String, String>, description: String, reason: String = "manual", crashAt: String? = null): Backup {
        if (settings.keys.any { it.isBlank() }) throw SetupException("invalid-settings", "The settings to back up are not valid.")
        val id = newId("backup")
        val work = File(dir, "$incomplete$id").apply { mkdirs() }
        val settingsJson = JSONObject().put("format", "vantaflow-settings").put("keys", JSONObject(settings as Map<*, *>)).toString(2)
        File(work, "settings.json").writeAtomic(settingsJson)
        if (crashAt == "backup-files") throw SetupException("simulated-failure", "Simulated interruption (test).")
        val bytes = File(work, "settings.json").readBytes()
        val manifest = JSONObject()
            .put("format", "vantaflow-backup").put("formatVersion", 1).put("id", id).put("createdAt", Instant.now().toString())
            .put("description", description).put("reason", reason).put("platform", "android").put("appVersion", appVersion())
            .put("contains", JSONObject().put("settings", true).put("app", false).put("settingsEntries", settings.size))
            .put("files", JSONArray().put(JSONObject().put("path", "settings.json").put("size", bytes.size).put("sha256", sha256(bytes))))
        File(work, "manifest.json").writeAtomic(manifest.toString(2))
        val check = verifyDir(work)
        if (check.isNotEmpty()) throw SetupException("backup-unverified", "The new backup did not verify: ${check.first()}")
        val final = File(dir, id)
        if (final.exists()) throw SetupException("backup-exists", "A backup with this id already exists; it is not overwritten.")
        if (!work.renameTo(final)) throw SetupException("write-failed", "Could not finish the backup.")
        return list().first { it.id == id }
    }

    private fun verifyDir(d: File): List<String> {
        val m = runCatching { JSONObject(File(d, "manifest.json").readText()) }.getOrNull() ?: return listOf("The backup has no readable manifest.")
        if (m.optString("format") != "vantaflow-backup" || m.optInt("formatVersion") != 1) return listOf("The manifest is not a VantaFlow backup manifest.")
        val problems = mutableListOf<String>()
        for (f in (m.optJSONArray("files") ?: JSONArray()).objects()) {
            val path = f.optString("path")
            if (path.isEmpty() || path.contains("..") || path.startsWith("/")) { problems += "Unsafe path in the manifest."; continue }
            val file = File(d, path)
            when {
                !file.isFile -> problems += "$path: missing"
                file.length() != f.optLong("size") -> problems += "$path: size ${file.length()}, expected ${f.optLong("size")}"
                sha256(file.readBytes()) != f.optString("sha256") -> problems += "$path: content changed (checksum)"
            }
        }
        if (m.optJSONObject("contains")?.optBoolean("settings") == true) {
            val s = runCatching { JSONObject(File(d, "settings.json").readText()) }.getOrNull()
            if (s?.optString("format") != "vantaflow-settings" || s.optJSONObject("keys") == null) problems += "settings.json is not readable."
            else s.getJSONObject("keys").let { k -> if (k.keySet().any { k.opt(it) !is String }) problems += "settings.json holds entries that are not text." }
        }
        return problems
    }

    fun list(): List<Backup> = (dir.listFiles() ?: emptyArray()).filter { it.isDirectory }.map { d ->
        if (d.name.startsWith(incomplete)) return@map Backup(d.name.removePrefix(incomplete), "incomplete", "Unfinished backup (interrupted)", null, null, null, 0, listOf("It was never completed and cannot be restored."))
        val problems = verifyDir(d)
        val m = runCatching { JSONObject(File(d, "manifest.json").readText()) }.getOrNull()
        Backup(d.name, if (problems.isEmpty()) "valid" else "damaged", m?.text("description") ?: "(no description)", m?.text("reason"), m?.text("createdAt"),
            m?.text("appVersion"), m?.optJSONObject("contains")?.optInt("settingsEntries") ?: 0, problems)
    }.sortedByDescending { it.createdAt ?: "" }

    fun verify(id: String): List<String> {
        if (!Regex("^backup-[0-9a-z-]+$").matches(id)) return listOf("Unknown backup.")
        val d = File(dir, id)
        return if (!d.isDirectory) listOf("This backup does not exist.") else verifyDir(d)
    }

    // The stored settings, only after the whole backup verified.
    fun settings(id: String): Map<String, String> {
        val problems = verify(id)
        if (problems.isNotEmpty()) throw SetupException("backup-damaged", "This backup cannot be restored: ${problems.first()}")
        val keys = JSONObject(File(dir, "$id/settings.json").readText()).getJSONObject("keys")
        return keys.keySet().associateWith { keys.getString(it) }
    }

    fun latestValid(): Backup? = list().firstOrNull { it.status == "valid" }

    // Never part of cleanup. A valid backup is deleted only when the user asked for exactly that.
    fun delete(id: String, allowValid: Boolean) {
        val b = list().firstOrNull { it.id == id } ?: throw SetupException("not-found", "Unknown backup.")
        if (b.status == "valid" && !allowValid) throw SetupException("backup-valid", "This backup is valid; it is not deleted without an explicit request.")
        File(dir, if (b.status == "incomplete") "$incomplete$id" else id).deleteRecursively()
    }
}

// Writes settings, reads them back, and puts the previous ones back if they differ.
interface SettingsStore {
    fun read(): Map<String, String>
    fun replace(entries: Map<String, String>)
}

fun restoreVerified(store: SettingsStore, entries: Map<String, String>): Boolean {
    val before = store.read()
    return try {
        store.replace(entries)
        if (store.read() == entries) true else { store.replace(before); false }
    } catch (e: Exception) {
        runCatching { store.replace(before) }
        false
    }
}
