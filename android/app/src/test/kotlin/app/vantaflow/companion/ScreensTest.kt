// Companion screen tests (Robolectric on the JVM, no emulator). They drive the real Compose
// screens and ConsolesModel with the shared JSON files bundled as assets, and FAKE consoles on
// 127.0.0.1. They prove the screens and data flow, NOT detection with a physical console.
package app.vantaflow.companion

import android.app.Application
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import app.vantaflow.core.detection.Ps4Provider
import app.vantaflow.core.detection.Ps5Provider
import app.vantaflow.core.model.HenStatus
import app.vantaflow.core.model.objects
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import java.io.File
import java.io.IOException
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import kotlin.concurrent.thread

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w600dp-h4000dp")
class ScreensTest {
    @get:Rule val compose = createComposeRule()

    private val shared = File(System.getProperty("vantaflow.shared")!!)
    private val samples = JSONObject(File(shared, "ddp-samples.json").readText()).getJSONArray("samples").objects().associate { it.getString("id") to it.getString("reply") }

    // Fake console on 127.0.0.1: answers with `reply` while `answering` is true.
    private inner class Fake(val reply: String) {
        val socket = DatagramSocket(0, InetAddress.getByName("127.0.0.1"))
        @Volatile var answering = true
        @Volatile var received = 0
        init {
            thread(isDaemon = true) {
                while (!socket.isClosed) {
                    val p = DatagramPacket(ByteArray(2048), 2048)
                    try { socket.receive(p) } catch (e: IOException) { break }
                    received++
                    if (answering) reply.toByteArray().let { socket.send(DatagramPacket(it, it.size, p.address, p.port)) }
                }
            }
        }
    }
    private val ps4 = Fake(samples.getValue("ps4-on-900"))
    private val ps5 = Fake(samples.getValue("ps5-on"))
    @After fun close() { ps4.socket.close(); ps5.socket.close() }

    private fun model() = ConsolesModel(
        RuntimeEnvironment.getApplication() as Application,
        Ps4Provider(port = ps4.socket.localPort, timeoutMs = 400),
        Ps5Provider(port = ps5.socket.localPort, timeoutMs = 400),
        discoveryTargets = { listOf("127.0.0.1") },
        allowLoopback = true,
    ).also { m -> compose.setContent { VantaFlowApp(m) } }

    private fun waitFor(text: String) = compose.waitUntil(5000) { compose.onAllNodesWithText(text, substring = true).fetchSemanticsNodes().isNotEmpty() }
    private fun click(text: String) = compose.onNodeWithText(text).performClick()
    private fun shows(text: String) = compose.onAllNodesWithText(text, substring = true).fetchSemanticsNodes().isNotEmpty()
    private fun dismiss() { click("OK"); compose.waitForIdle() }

    @Test fun demoConsolesUseTheSharedDataAndStayLabelled() {
        val m = model()
        val mock = JSONObject(File(shared, "mock-consoles.json").readText()).getJSONArray("consoles").objects()
        assertEquals(mock.map { it.getString("id") }, m.demoConsoles.map { it.id })
        for (c in mock) assertEquals(c.getString("id"), c.getString("expected"), m.compatibility(c.getString("id")).status.id)
        assertTrue(m.realConsoles.isEmpty())
        waitFor("DEMO CONSOLES — DEMONSTRATION DATA") // group titles are shown in capitals
        click(mock.first().getString("label"))
        waitFor("Demonstration data from shared/mock-consoles.json")
        compose.onNodeWithText("DEMO").assertExists()
        compose.onAllNodesWithText("READ-ONLY").assertCountEquals(0)
        assertTrue(shows(HenStatus.of(m.detection(mock.first().getString("id"))).label))
    }

    @Test fun addByIpIdentifiesAFakePs4ReadOnly() {
        val m = model()
        click("Add by IP address…")
        compose.onNode(hasText("192.168.1.20")).performTextInput("127.0.0.1")
        click("Add")
        waitFor("Console added")
        dismiss()
        click("Living room PS4")
        waitFor("PS4 — verified (discovery reply)")
        for (t in listOf("READ-ONLY", "9.00 — verified (system-version 09008001)", "Not available — no documented read-only method",
            "Unsupported detection method", "Make active")) assertTrue(t, shows(t))
        for (t in listOf("Verified installed", "Verified not installed", "DEMO")) assertTrue("must not show $t", !shows(t))
        assertEquals("unknown", m.compatibility(m.realConsoles.single().id).status.id)
    }

    @Test fun invalidAndInternetAddressesAreRefusedAndNotSaved() {
        val m = model()
        for (bad in listOf("8.8.8.8", "not-an-ip")) {
            click("Add by IP address…")
            compose.onNode(hasText("192.168.1.20")).performTextInput(bad)
            click("Add")
            waitFor("Invalid address")
            dismiss()
        }
        assertTrue(m.realConsoles.isEmpty())
        assertEquals(0, ps4.received + ps5.received)
    }

    @Test fun anAddressThatDoesNotAnswerIsNeverIdentified() {
        ps4.answering = false
        ps5.answering = false
        val m = model()
        click("Add by IP address…")
        compose.onNode(hasText("192.168.1.20")).performTextInput("127.0.0.1")
        click("Add")
        waitFor("Saved, not identified")
        dismiss()
        click("127.0.0.1")
        waitFor("Not identified")
        assertTrue(!shows("Make active"))
        assertTrue(!shows("verified (discovery reply)"))
        assertEquals("not-detected", m.compatibility(m.realConsoles.single().id).status.id)
    }

    @Test fun disconnectStopsAllTrafficUntilConnect() {
        model()
        click("Add by IP address…")
        compose.onNode(hasText("192.168.1.20")).performTextInput("127.0.0.1")
        click("Add")
        waitFor("Console added")
        dismiss()
        click("Living room PS4")
        waitFor("Disconnect")
        click("Disconnect")
        waitFor("will not contact it")
        dismiss()
        val before = ps4.received
        click("Refresh")
        waitFor("Connect this console first")
        dismiss()
        assertEquals(before, ps4.received)
        assertTrue(shows("Not detected"))
        click("Connect")
        waitFor("Console answered")
        assertTrue(ps4.received > before)
    }

    @Test fun discoveryAsksFirstThenSavesOnlyThePickedConsole() {
        val m = model()
        click("Discover consoles…")
        waitFor("UDP port 987")
        assertTrue(shows("Nothing leaves your local network"))
        click("Cancel")
        compose.waitForIdle()
        assertEquals(0, ps4.received + ps5.received)
        click("Discover consoles…")
        click("Search")
        waitFor("2 consoles answered")
        click("Living room PS5 — PS5")
        waitFor("Console answered")
        dismiss()
        assertEquals(1, m.realConsoles.size)
        assertEquals("ps5", m.detection(m.realConsoles.single().id)?.console?.generation?.id)
    }
}
