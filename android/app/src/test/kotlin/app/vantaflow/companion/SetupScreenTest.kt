// Install & recovery screen tests (Robolectric). The installer is SIMULATED (FakeInstaller):
// these prove the companion's checks, confirmations, backups and recovery decisions, NOT an
// installation on a real phone.
package app.vantaflow.companion

import android.app.Application
import android.content.Context
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import app.vantaflow.core.detection.Ps4Provider
import app.vantaflow.core.detection.Ps5Provider
import app.vantaflow.core.setup.InstallJournal
import app.vantaflow.core.setup.newApkName
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import java.io.File

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w600dp-h4000dp")
class SetupScreenTest {
    @get:Rule val compose = createComposeRule()
    private val app get() = RuntimeEnvironment.getApplication() as Application
    private val prefs get() = app.getSharedPreferences("vantaflow", Context.MODE_PRIVATE)
    private val saved = """[{"id":"lan-192.168.1.20","address":"192.168.1.20","generation":"ps4","name":"Living room PS4","connected":false,"addedAt":"2026-11-16T10:00:00Z"}]"""
    private val fake = FakeInstaller()

    private fun open(): SetupModel {
        val m = ConsolesModel(app, Ps4Provider(port = 9, timeoutMs = 200), Ps5Provider(port = 9, timeoutMs = 200), { emptyList() }, allowLoopback = true)
        val s = SetupModel(app, fake, 34)
        compose.setContent { VantaFlowApp(m, s) }
        compose.onNodeWithText("Install & recovery…").performScrollTo().performClick()
        compose.waitForIdle()
        return s
    }
    private fun shows(t: String) = compose.onAllNodesWithText(t, substring = true).fetchSemanticsNodes().isNotEmpty()
    private fun waitFor(t: String) = compose.waitUntil(5000) { shows(t) }
    private fun click(t: String) { compose.onNodeWithText(t).performClick(); compose.waitForIdle() }
    private fun pick(s: SetupModel, versionCode: Long, versionName: String, pkg: String = "app.vantaflow.companion", signer: String = "vantaflow-key") =
        compose.runOnIdle { s.check(FakeInstaller.apk(s.installDir, newApkName("install-test-$versionCode"), versionCode, versionName, pkg, signer), "companion-$versionName.apk") }

    @Test fun successfulUpdateIsVerifiedAndKeepsSettings() {
        prefs.edit().putString("lan-consoles", saved).commit()
        val s = open()
        pick(s, 2, "0.5.0")
        waitFor("Install update")
        for (t in listOf("Update the VantaFlow companion from 0.4.0 to 0.5.0", "PERMISSION", "Install unknown apps", "YOUR DATA", "kept", "BACKUP", "CAN BE UNDONE", "same signing key"))
            assertTrue(t, shows(t))
        click("Install")
        waitFor("Updated")
        assertEquals(2L, fake.versionCode)
        assertTrue(shows("Android reports the new version"))
        click("OK")
        assertEquals(saved, prefs.getString("lan-consoles", null))
        assertTrue(s.backupList.any { it.status == "valid" && it.description.startsWith("Before updating to 0.5.0") })
        assertTrue(prefs.getString(JOURNAL_KEY, null)!!.contains("\"state\":\"done\""))
    }

    @Test fun cancellingTheConfirmationChangesNothing() {
        val s = open()
        pick(s, 2, "0.5.0")
        waitFor("Install update")
        click("Cancel")
        waitFor("Nothing was changed")
        assertEquals(0, fake.installs)
        assertTrue(s.backupList.isEmpty())
        assertTrue(s.installDir.listFiles()!!.isEmpty())
    }

    @Test fun cancelledInAndroidsDialogAndFailedInstallsAreReportedHonestly() {
        val s = open()
        fake.answer = InstallResult.Cancelled
        pick(s, 2, "0.5.0"); waitFor("Install update"); click("Install")
        waitFor("The update was cancelled")
        assertEquals(1L, fake.versionCode)
        click("OK")
        fake.answer = InstallResult.Failed("The update is not compatible with this phone.")
        pick(s, 2, "0.5.0"); waitFor("Install update"); click("Install")
        waitFor("It did not work")
        assertTrue(shows("not compatible") && shows("unchanged"))
        assertEquals(1L, fake.versionCode)
        assertFalse(shows("Updated"))
    }

    @Test fun wrongPackagesAreRefusedBeforeAnythingHappens() {
        val s = open()
        for ((args, message) in listOf(
            Triple(2L, "com.example.other", "vantaflow-key") to "only its own app",
            Triple(2L, "app.vantaflow.companion", "someone-else") to "different key",
            Triple(1L, "app.vantaflow.companion", "vantaflow-key") to "already installed",
            Triple(0L, "app.vantaflow.companion", "vantaflow-key") to "older",
        )) {
            pick(s, args.first, "x", args.second, args.third)
            waitFor(message)
            click("OK")
        }
        assertEquals(0, fake.installs)
    }

    @Test fun installPermissionIsExplainedNotSilentlyRequested() {
        fake.permission = false
        val s = open()
        pick(s, 2, "0.5.0"); waitFor("Install update"); click("Install")
        waitFor("Allow VantaFlow to install updates")
        assertTrue(shows("Install unknown apps") && shows("only to install its own updates"))
        assertEquals(0, fake.installs)
    }

    @Test fun interruptedUpdateIsDetectedAndRecovered() {
        prefs.edit().putString(JOURNAL_KEY, InstallJournal("install-x", "running", 1, 2, "0.5.0", null, 7, null).toJson()).commit()
        fake.sessions += 7
        val s = open()
        waitFor("An update did not finish")
        assertTrue(shows("Action needed") && shows("unfinished installer session"))
        click("An update did not finish")
        waitFor("Reported as recovered only after")
        click("Recover")
        waitFor("Recovered")
        assertTrue(fake.sessions.isEmpty())
        assertTrue(prefs.getString(JOURNAL_KEY, null)!!.contains("recovered"))
        assertEquals(1L, s.installed.versionCode)
    }

    @Test fun updateThatFinishedWhileVantaFlowWasClosedIsVerifiedAtStart() {
        prefs.edit().putString(JOURNAL_KEY, InstallJournal("install-y", "running", 1, 2, "0.5.0", null, 8, null).toJson()).commit()
        fake.versionCode = 2; fake.versionName = "0.5.0"
        open()
        waitFor("Update finished")
        assertTrue(shows("Verified"))
    }

    @Test fun settingsAreBackedUpAndRestoredOnlyFromValidBackups() {
        prefs.edit().putString("lan-consoles", saved).putString("active-console", "lan-192.168.1.20").commit()
        val s = open()
        click("Back up settings now…")
        click("Back up")
        waitFor("Backed up")
        click("OK")
        prefs.edit().putString("active-console", "changed").remove("lan-consoles").commit()
        click("Backup of settings (made by you)")
        click("Restore these settings")
        click("Restore")
        waitFor("Tap again to restore")
        click("Tap again to restore")
        waitFor("Settings restored")
        click("OK")
        assertEquals(saved, prefs.getString("lan-consoles", null))
        assertEquals("lan-192.168.1.20", prefs.getString("active-console", null))
        assertTrue(s.backupList.any { it.description == "Before restoring settings" && it.status == "valid" })
        // A damaged backup can only be deleted.
        val b = s.backupList.first { it.description == "Backup of settings (made by you)" }
        File(s.backups.dir, "${b.id}/settings.json").appendText(" ")
        compose.runOnIdle { s.delete(s.backupList.first { it.description == "Before restoring settings" }) }
        click("OK")
        waitFor("Damaged")
        click("Backup of settings (made by you)")
        assertFalse(shows("Restore these settings"))
        assertTrue(shows("Delete this backup"))
    }

    @Test fun cleanupRemovesOnlyVantaFlowFilesAfterPreview() {
        val s = open()
        val ours = FakeInstaller.apk(s.installDir, newApkName("install-20260101000000-aaaaaa"), 2, "0.5.0")
        val mine = File(s.installDir, "my-download.apk").apply { writeText("mine") }
        fake.sessions += 42
        compose.runOnIdle { s.backupNow() }
        waitFor("Backed up"); click("OK")
        click("Clean up temporary files…")
        waitFor("Will be removed".uppercase())
        assertTrue(shows(ours.name) && shows("Installer session 42") && shows("my-download.apk — Not created by VantaFlow") && shows("Backups — never removed"))
        click("Cancel")
        assertTrue(ours.exists())
        click("Clean up temporary files…")
        click("Clean up"); click("Tap again to clean up")
        waitFor("Cleaned up")
        assertFalse(ours.exists())
        assertTrue(mine.exists() && fake.sessions.isEmpty() && s.backupList.single().status == "valid")
    }
}
