// Stage 5 core tests (Android companion): backups, APK checks, the installation journal and
// cleanup. Temporary folders only; SIMULATED, not installations on a device.
package app.vantaflow.core

import app.vantaflow.core.setup.ApkInfo
import app.vantaflow.core.setup.BackupStore
import app.vantaflow.core.setup.InstallJournal
import app.vantaflow.core.setup.InstalledApp
import app.vantaflow.core.setup.SettingsStore
import app.vantaflow.core.setup.SetupException
import app.vantaflow.core.setup.StartupCheck
import app.vantaflow.core.setup.checkApk
import app.vantaflow.core.setup.checkAtStartup
import app.vantaflow.core.setup.newApkName
import app.vantaflow.core.setup.previewCleanup
import app.vantaflow.core.setup.restoreVerified
import app.vantaflow.core.setup.runCleanup
import java.io.File
import java.nio.file.Files
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue

class SetupTest {
    private fun temp() = Files.createTempDirectory("vantaflow-setup").toFile()
    private val settings = mapOf("lan-consoles" to """[{"id":"lan-192.168.1.20","address":"192.168.1.20","generation":"ps4"}]""", "active-console" to "lan-192.168.1.20")

    @Test fun backupsAreVerifiedAndRestorable() {
        val store = BackupStore(temp()) { "0.5.0" }
        val b = store.create(settings, "Before updating")
        assertEquals("valid", b.status)
        assertEquals(2, b.settingsEntries)
        assertTrue(store.verify(b.id).isEmpty())
        assertEquals(settings, store.settings(b.id))
    }

    @Test fun damagedAndIncompleteBackupsAreNeverRestored() {
        val dir = temp()
        val store = BackupStore(dir)
        val good = store.create(settings, "Good")
        val bad = store.create(settings, "Will be damaged")
        File(dir, "${bad.id}/settings.json").appendText(" ")
        assertEquals("damaged", store.list().first { it.id == bad.id }.status)
        assertFailsWith<SetupException> { store.settings(bad.id) }
        val gone = store.create(settings, "Loses its manifest")
        File(dir, "${gone.id}/manifest.json").delete()
        assertEquals("damaged", store.list().first { it.id == gone.id }.status)
        val before = File(dir, "${good.id}/manifest.json").readText()
        assertFailsWith<SetupException> { store.create(settings, "Interrupted", crashAt = "backup-files") }
        assertEquals(1, store.list().count { it.status == "incomplete" }, "an interrupted backup is listed as incomplete")
        assertEquals(before, File(dir, "${good.id}/manifest.json").readText(), "an existing valid backup is unchanged")
        assertEquals(good.id, store.latestValid()?.id, "the latest valid backup skips damaged and incomplete ones")
        assertFailsWith<SetupException> { store.delete(good.id, allowValid = false) }
        store.delete(store.list().first { it.status == "incomplete" }.id, allowValid = false)
        assertTrue(store.list().none { it.status == "incomplete" })
    }

    @Test fun restoredSettingsAreReadBackOrRolledBack() {
        val prefs = mutableMapOf("active-console" to "old")
        val ok = object : SettingsStore {
            override fun read() = prefs.toMap()
            override fun replace(entries: Map<String, String>) { prefs.clear(); prefs.putAll(entries) }
        }
        assertTrue(restoreVerified(ok, settings))
        assertEquals(settings, prefs)
        val lossy = object : SettingsStore { // drops one entry, like a full disk
            override fun read() = prefs.toMap()
            override fun replace(entries: Map<String, String>) { prefs.clear(); prefs.putAll(entries.entries.take(1).associate { it.toPair() }) }
        }
        prefs.clear(); prefs["active-console"] = "keep-me"
        assertFalse(restoreVerified(lossy, settings))
        assertEquals(mapOf("active-console" to "keep-me"), prefs, "previous settings are put back when the restore does not read back")
    }

    private val installed = InstalledApp("app.vantaflow.companion", 1, "0.4.0", setOf("aa"))

    @Test fun apkChecks() {
        val update = ApkInfo("app.vantaflow.companion", 2, "0.5.0", 26, setOf("aa"))
        val ok = checkApk(update, installed, 34, "update.apk")
        assertTrue(ok.ok && ok.action == "update" && ok.summary!!.contains("0.4.0 to 0.5.0"))
        assertTrue(ok.permission.contains("Install unknown apps") && ok.data.contains("kept") && ok.backup.startsWith("Yes"))
        assertFalse(checkApk(null, installed, 34, "x.apk").ok)
        assertTrue(checkApk(update.copy(packageName = "com.other"), installed, 34, "x.apk").errors.first().contains("only its own app"))
        assertTrue(checkApk(update.copy(signers = setOf("bb")), installed, 34, "x.apk").errors.first().contains("different key"))
        assertTrue(checkApk(update.copy(minSdk = 35), installed, 34, "x.apk").errors.first().contains("API 35"))
        assertTrue(checkApk(update.copy(versionCode = 1), installed, 34, "x.apk").errors.first().contains("already installed"))
        assertTrue(checkApk(update.copy(versionCode = 0), installed, 34, "x.apk").errors.first().contains("older"))
    }

    @Test fun interruptedInstallationIsDecidedFromFacts() {
        val j = InstallJournal("install-1", "running", 1, 2, "0.5.0", "backup-x", 7, "/cache/install/vf-install-1.apk")
        assertEquals(j, InstallJournal.fromJson(j.toJson()))
        assertIs<StartupCheck.Updated>(checkAtStartup(j, installedVersionCode = 2, sessionOpen = false))
        val stopped = checkAtStartup(j, installedVersionCode = 1, sessionOpen = true)
        assertIs<StartupCheck.Interrupted>(stopped)
        assertTrue(stopped.openSession)
        assertIs<StartupCheck.Nothing>(checkAtStartup(j.copy(state = "done"), 2, false))
        assertIs<StartupCheck.Nothing>(checkAtStartup(null, 2, false))
        assertNull(InstallJournal.fromJson("{broken"))
    }

    @Test fun cleanupRemovesOnlyFinishedVantaFlowCopies() {
        val dir = temp()
        val old = File(dir, newApkName("install-20260101000000-aaaaaa")).apply { writeText("apk") }
        val current = File(dir, newApkName("install-20260102000000-bbbbbb")).apply { writeText("apk") }
        val user = File(dir, "my-app.apk").apply { writeText("mine") }
        val sub = File(dir, "folder").apply { mkdirs() }
        val running = InstallJournal("install-2", "running", 1, 2, null, null, null, current.absolutePath)
        val preview = previewCleanup(dir, running)
        assertEquals(listOf(old), preview.remove.map { it.file })
        assertTrue(preview.keep.any { it.file == current && it.reason.contains("not finished") } && preview.keep.any { it.file == user } && preview.keep.any { it.file == sub })
        File(dir, newApkName("install-20260103000000-cccccc")).writeText("late")
        assertFailsWith<SetupException> { runCleanup(dir, running, preview.token) }
        assertTrue(old.exists(), "nothing removed when the files changed since the preview")
        val fresh = previewCleanup(dir, running)
        assertEquals(2, runCleanup(dir, running, fresh.token).size)
        assertTrue(!old.exists() && current.exists() && user.exists() && sub.exists())
    }
}
