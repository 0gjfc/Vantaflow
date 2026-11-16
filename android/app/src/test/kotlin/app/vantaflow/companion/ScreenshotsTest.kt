// Renders the companion screens to PNG files (app/build/screenshots) for visual review.
// Same fake console on 127.0.0.1 as ScreensTest; not a physical console.
package app.vantaflow.companion

import android.app.Application
import android.graphics.Bitmap
import android.graphics.Canvas
import androidx.activity.ComponentActivity
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import app.vantaflow.core.detection.Ps4Provider
import app.vantaflow.core.detection.Ps5Provider
import app.vantaflow.core.model.objects
import org.json.JSONObject
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import org.robolectric.shadows.ShadowDialog
import java.io.File
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import kotlin.concurrent.thread

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34], qualifiers = "w411dp-h891dp-xxhdpi")
class ScreenshotsTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()

    @Test fun captureScreens() {
        val shared = File(System.getProperty("vantaflow.shared")!!)
        val reply = JSONObject(File(shared, "ddp-samples.json").readText()).getJSONArray("samples").objects().first { it.getString("id") == "ps4-on-900" }.getString("reply")
        val fake = DatagramSocket(0, InetAddress.getByName("127.0.0.1"))
        thread(isDaemon = true) {
            while (!fake.isClosed) {
                val p = DatagramPacket(ByteArray(2048), 2048)
                runCatching { fake.receive(p) }.onFailure { return@thread }
                reply.toByteArray().let { fake.send(DatagramPacket(it, it.size, p.address, p.port)) }
            }
        }
        val m = ConsolesModel(RuntimeEnvironment.getApplication() as Application,
            Ps4Provider(port = fake.localPort, timeoutMs = 400), Ps5Provider(port = 9, timeoutMs = 400), { listOf("127.0.0.1") }, true)
        compose.setContent { VantaFlowApp(m) }
        val out = File("build/screenshots").apply { mkdirs() }
        // The activity window, then the open dialog (a separate window) centred on top with a dim.
        fun shot(name: String, dialog: Boolean = false) {
            compose.waitForIdle()
            val root = compose.activity.window.decorView
            val bmp = Bitmap.createBitmap(root.width, root.height, Bitmap.Config.ARGB_8888)
            val canvas = Canvas(bmp)
            root.draw(canvas)
            if (dialog) ShadowDialog.getLatestDialog()?.window?.decorView?.let { d ->
                canvas.drawARGB(150, 0, 0, 0)
                canvas.save()
                canvas.translate((root.width - d.width) / 2f, (root.height - d.height) / 2f)
                d.draw(canvas)
                canvas.restore()
            }
            File(out, "$name.png").outputStream().use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
        }
        fun waitFor(t: String) = compose.waitUntil(5000) { compose.onAllNodesWithText(t, substring = true).fetchSemanticsNodes().isNotEmpty() }
        shot("1-consoles")
        compose.onNodeWithText("Discover consoles…").performClick()
        shot("2-discovery-consent", dialog = true)
        compose.onNodeWithText("Cancel").performClick()
        // The add-by-IP dialog is not captured: its text field keeps the test from going idle in
        // native graphics mode. ScreensTest covers that dialog's behaviour.
        m.addByAddress("127.0.0.1")
        waitFor("Console added")
        shot("4-console-added", dialog = true)
        compose.onNodeWithText("OK").performClick()
        compose.onNodeWithText("Living room PS4").performClick()
        waitFor("PS4 — verified")
        shot("5-console-detail")
        compose.onNodeWithText("‹ Consoles").performClick()
        shot("6-consoles-with-real")
        fake.close()
    }
}
