// Android core connectivity tests. Same DDP samples as the desktop (tests/connectivity.test.mjs),
// and a FAKE console on 127.0.0.1 for the network paths. These prove VantaFlow's logic, NOT that
// detection works with a physical console.
package app.vantaflow.core

import app.vantaflow.core.compat.CompatibilityEngine
import app.vantaflow.core.compat.EnvironmentData
import app.vantaflow.core.detection.ConsoleStore
import app.vantaflow.core.detection.Ddp
import app.vantaflow.core.detection.DetectionException
import app.vantaflow.core.detection.DetectionService
import app.vantaflow.core.detection.LanAddress
import app.vantaflow.core.detection.LanConsoles
import app.vantaflow.core.detection.Ps4Provider
import app.vantaflow.core.detection.Ps5Provider
import app.vantaflow.core.detection.UdpTransport
import app.vantaflow.core.detection.discover
import app.vantaflow.core.model.CompatStatus
import app.vantaflow.core.model.ConnectionState
import app.vantaflow.core.model.DetectionResult
import app.vantaflow.core.model.EnvironmentState
import app.vantaflow.core.model.Generation
import app.vantaflow.core.model.HenStatus
import app.vantaflow.core.model.objects
import app.vantaflow.core.platform.Ps4Rules
import app.vantaflow.core.platform.Ps5Rules
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import kotlin.concurrent.thread
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class ConnectivityTest {
    private val shared = File(System.getProperty("vantaflow.shared"))
    private fun json(path: String) = JSONObject(File(shared, path).readText())
    private val samples = json("ddp-samples.json").getJSONArray("samples").objects().associateBy { it.getString("id") }
    private fun sample(id: String) = samples.getValue(id).getString("reply")
    private val engine = CompatibilityEngine(mapOf(
        Generation.PS4 to Ps4Rules(EnvironmentData.fromJson(json("compatibility/goldhen.json"))),
        Generation.PS5 to Ps5Rules(EnvironmentData.fromJson(json("compatibility/etahen.json"))),
    ))

    // A fake console: answers on 127.0.0.1 with replyFor(message), or stays silent (null).
    private class FakeConsole(replyFor: (String) -> String?) {
        val socket = DatagramSocket(0, InetAddress.getByName("127.0.0.1"))
        val port get() = socket.localPort
        val received = mutableListOf<String>()
        init {
            thread(isDaemon = true) {
                val buf = ByteArray(2048)
                while (!socket.isClosed) {
                    val p = DatagramPacket(buf, buf.size)
                    try { socket.receive(p) } catch (e: IOException) { break }
                    val text = String(p.data, 0, p.length)
                    synchronized(received) { received += text }
                    replyFor(text)?.toByteArray()?.let { socket.send(DatagramPacket(it, it.size, p.address, p.port)) }
                }
            }
        }
    }
    private val fakes = mutableListOf<FakeConsole>()
    private fun fake(replyFor: (String) -> String?) = FakeConsole(replyFor).also { fakes += it }
    @AfterTest fun closeFakes() = fakes.forEach { it.socket.close() }

    private class MemoryStore : ConsoleStore {
        var json: String? = null
        override fun load() = json
        override fun save(json: String) { this.json = json }
    }

    @Test fun sharedSamplesParseLikeTheDesktop() {
        for ((id, s) in samples) {
            val asked = Generation.of(s.getString("askedAs"))!!
            val expect = s.getJSONObject("expect")
            val provider = if (asked == Generation.PS4) Ps4Provider() else Ps5Provider()
            val r = provider.read(s.getString("reply"), "192.168.1.20")
            val wantGen = if (expect.isNull("generation")) null else expect.getString("generation")
            assertEquals(wantGen, r.retrieved?.generation?.id, id)
            if (expect.optBoolean("notDdp")) assertEquals("not-ddp", r.errors.single().code, id)
            if (wantGen == null) continue
            assertEquals(expect.getString("power"), r.retrieved!!.power, id)
            assertEquals(expect.getString("name"), r.retrieved!!.name, id)
            val d = DetectionResult.fromJson(r.detection)
            assertEquals(if (expect.isNull("firmware")) null else expect.getString("firmware"), d.firmware.version, id)
            assertEquals(expect.getBoolean("firmwareConfirmed"), d.firmware.verified, id)
            if (expect.has("rawSystemVersion")) assertEquals(expect.getString("rawSystemVersion"), d.firmware.raw, id)
            assertNull(d.console.model, "$id: model is never guessed")
            assertEquals(EnvironmentState.UNSUPPORTED_METHOD, d.environment.state, id)
            assertEquals(HenStatus.UNSUPPORTED, HenStatus.of(d), id)
            assertTrue(d.report.unavailable.any { it.field == "model" }, id)
        }
        assertFalse(sample("ps4-running-app-dropped").let { Ddp.parseReply(it).toString() }.contains("running-app"))
    }

    @Test fun addressRulesMatchTheDesktop() {
        for (ok in listOf("192.168.1.20", "10.0.0.5", "172.16.0.9", "172.31.255.1", "169.254.3.4")) assertTrue(LanAddress.isLocal(ok), ok)
        for (bad in listOf("8.8.8.8", "172.32.0.1", "192.168.1.255", "192.168.1.0", "256.1.1.1", "127.0.0.1", "abc", "")) assertFalse(LanAddress.isLocal(bad), bad)
        assertTrue(LanAddress.isLocal("127.0.0.1", allowLoopback = true))
        assertTrue(LanAddress.validate("not-an-ip") is LanAddress.Check.Invalid)
        assertTrue((LanAddress.validate("8.8.8.8") as LanAddress.Check.Invalid).error.contains("not a local network address"))
        assertEquals(LanAddress.Check.Ok("192.168.1.20"), LanAddress.validate(" 192.168.1.20 "))
    }

    @Test fun ps4AndPs5ProvidersIdentifyFakeConsoles() {
        val ps4 = fake { if (it.contains("00020020")) sample("ps4-on-900") else null }
        val ps5 = fake { if (it.contains("00030010")) sample("ps5-on") else null }
        val r4 = Ps4Provider(port = ps4.port, timeoutMs = 500).probe("127.0.0.1")
        val r5 = Ps5Provider(port = ps5.port, timeoutMs = 500).probe("127.0.0.1")
        assertEquals(Generation.PS4, r4.retrieved?.generation)
        assertEquals("9.00", r4.retrieved?.firmware)
        assertEquals(Generation.PS5, r5.retrieved?.generation)
        assertNull(r5.retrieved?.firmware)
        assertEquals(listOf("SRCH * HTTP/1.1\ndevice-discovery-protocol-version:00020020\n"), ps4.received)
    }

    @Test fun silenceIsATimeoutNotAnAnswer() {
        val silent = fake { null }
        val r = Ps4Provider(port = silent.port, timeoutMs = 300).probe("127.0.0.1")
        assertNull(r.retrieved)
        assertEquals("timeout", r.errors.single().code)
        assertTrue(r.errors.single().action!!.contains("does not prove"))
    }

    @Test fun wrongReplyTypesAreRejected() {
        val ps4OnPs5Port = fake { sample("ps4-reply-on-ps5-port") }
        assertEquals("not-ps5", Ps5Provider(port = ps4OnPs5Port.port, timeoutMs = 500).probe("127.0.0.1").errors.single().code)
        val notDdp = fake { sample("not-ddp") }
        assertEquals("not-ddp", Ps4Provider(port = notDdp.port, timeoutMs = 500).probe("127.0.0.1").errors.single().code)
    }

    @Test fun networkErrorsAreReported() {
        val failing = UdpTransport { _, _, _, _, _, _, _ -> throw IOException("Network is unreachable") }
        val r = Ps4Provider(transport = failing).probe("192.168.1.20")
        assertEquals("network-error", r.errors.single().code)
        assertNull(r.retrieved)
    }

    @Test fun discoverySendsOneRequestPerGenerationAndIgnoresNonLocalReplies() {
        val ps4 = fake { sample("ps4-standby-755") }
        val ps5 = fake { sample("ps5-standby") }
        val providers = listOf(Ps4Provider(port = ps4.port), Ps5Provider(port = ps5.port))
        val found = discover(providers, listOf("127.0.0.1"), 500, allowLoopback = true)
        assertEquals(setOf(Generation.PS4, Generation.PS5), found.devices.map { it.retrieved!!.generation }.toSet())
        assertEquals(1, ps4.received.size)
        assertEquals(1, ps5.received.size)
        assertEquals(0, discover(providers, listOf("127.0.0.1"), 500, allowLoopback = false).devices.size)
    }

    @Test fun savedConsolesConnectDisconnectAndRemove() {
        val ps4 = fake { if (it.contains("00020020")) sample("ps4-on-900") else null }
        val ps5 = fake { null }
        val lan = LanConsoles(MemoryStore(), mapOf(
            Generation.PS4 to Ps4Provider(port = ps4.port, timeoutMs = 400),
            Generation.PS5 to Ps5Provider(port = ps5.port, timeoutMs = 400),
        ), allowLoopback = true)
        val service = DetectionService(lan)
        assertFailsWith<DetectionException> { lan.addByAddress("8.8.8.8") }
        assertTrue(lan.saved().isEmpty(), "an invalid address is not saved")

        val (id, report) = lan.addByAddress("127.0.0.1")
        assertEquals(Generation.PS4, report.retrieved?.generation)
        val d = service.detect(id)
        assertEquals(ConnectionState.CONNECTED, d.connection.state)
        assertEquals("Living room PS4", d.console.name)
        assertEquals(HenStatus.UNSUPPORTED, HenStatus.of(d))
        val compat = engine.evaluate(d)
        assertEquals(CompatStatus.UNKNOWN, compat.status, "a real console is never Compatible on DDP evidence alone")
        assertTrue(compat.reasons.any { it.code == "environment-check-unsupported" })

        lan.disconnect(id)
        val before = ps4.received.size
        val off = service.detect(id)
        assertEquals(ConnectionState.DISCONNECTED, off.connection.state)
        assertEquals(before, ps4.received.size, "a disconnected console is not contacted")
        assertEquals(HenStatus.NOT_DETECTED, HenStatus.of(off))
        assertEquals(CompatStatus.NOT_DETECTED, engine.evaluate(off).status)

        lan.connect(id)
        assertEquals(ConnectionState.CONNECTED, service.detect(id).connection.state)
        lan.remove(id)
        assertTrue(lan.list().isEmpty())
    }

    @Test fun anAddressThatDoesNotAnswerIsSavedAsNotIdentified() {
        val silent = fake { null }
        val lan = LanConsoles(MemoryStore(), mapOf(
            Generation.PS4 to Ps4Provider(port = silent.port, timeoutMs = 300),
            Generation.PS5 to Ps5Provider(port = silent.port, timeoutMs = 300),
        ), allowLoopback = true)
        val (id, report) = lan.addByAddress("127.0.0.1")
        assertNull(report.retrieved)
        assertNull(lan.saved(id)!!.lastVerified)
        val d = DetectionService(lan).detect(id)
        assertNotEquals(ConnectionState.CONNECTED, d.connection.state)
        assertNull(d.console.generation)
        assertEquals("timeout", d.errors.first().code)
        assertEquals(CompatStatus.NOT_DETECTED, engine.evaluate(d).status)
    }

    // Reliability (Stage 4.1): a probe of one address is never answered by another device.
    @Test fun aReplyFromAnotherAddressIsIgnored() {
        // The probe goes to 127.0.0.1; a different device (127.0.0.2) answers as a PS4.
        val listen = DatagramSocket(0, InetAddress.getByName("127.0.0.1"))
        val other = DatagramSocket(0, InetAddress.getByName("127.0.0.2"))
        thread(isDaemon = true) {
            val p = DatagramPacket(ByteArray(2048), 2048)
            try { listen.receive(p) } catch (e: IOException) { return@thread }
            val reply = sample("ps4-on-900").toByteArray()
            other.send(DatagramPacket(reply, reply.size, p.address, p.port))
        }
        val r = Ps4Provider(port = listen.localPort, timeoutMs = 600).probe("127.0.0.1")
        listen.close()
        other.close()
        assertNull(r.retrieved, "a PS4 reply from 127.0.0.2 must not identify 127.0.0.1")
        assertEquals("timeout", r.errors.single().code)
    }

    // Reliability (Stage 4.1): random and mutated replies never produce a false identification.
    @Test fun mutatedRepliesNeverIdentifyFalsely() {
        val rnd = java.util.Random(4)
        val replies = samples.values.map { it.getString("reply") }
        val lines = replies.flatMap { it.split("\n") }.filter { it.isNotBlank() }
        val alphabet = "HTTP/1.1 200 Ok620host-type:PS4PS5device-discovery-protocol-version:0002002000030010\n :-xyz"
        var identified = 0
        repeat(5000) { i ->
            // a real sample with lines dropped, replaced or mixed in · random sample lines · random characters
            val text = when (i % 3) {
                0 -> replies[rnd.nextInt(replies.size)].split("\n").joinToString("\n") { l ->
                    listOf(l, l, l, "", lines[rnd.nextInt(lines.size)], l.take(rnd.nextInt(l.length + 1)))[rnd.nextInt(6)]
                }
                1 -> (0 until rnd.nextInt(8)).joinToString("\n") { lines[rnd.nextInt(lines.size)] }
                else -> (0 until rnd.nextInt(200)).map { alphabet[rnd.nextInt(alphabet.length)] }.joinToString("")
            }
            for (provider in listOf(Ps4Provider(), Ps5Provider())) {
                val r = provider.read(text, "192.168.1.20")
                if (r.retrieved == null) {
                    assertNotEquals(ConnectionState.CONNECTED, DetectionResult.fromJson(LanConsoles.detectionOf(r)).connection.state)
                    continue
                }
                identified++
                val spec = Ddp.SPECS.getValue(provider.generation)
                val first = text.split(Regex("\\r?\\n")).map { it.trim() }.firstOrNull { it.isNotEmpty() }.orEmpty()
                assertTrue(first.startsWith("HTTP/1.1 "), "identified without a status line: $text")
                assertTrue(text.contains("host-type:${spec.hostType}") && text.contains("device-discovery-protocol-version:${spec.protocolVersion}"), text)
                assertEquals(provider.generation, r.retrieved!!.generation)
            }
        }
        assertTrue(identified > 100, "fuzz produced enough valid replies to be meaningful ($identified)")
    }

    // Demonstration consoles and real consoles never mix.
    @Test fun mockConsolesStaySeparateFromRealOnes() {
        val mock = app.vantaflow.core.detection.MockDetectionProvider(json("mock-consoles.json"))
        assertTrue(mock.list().none { LanConsoles.isLan(it.id) }, "no mock id looks like a saved real console")
        assertTrue(mock.list().all { DetectionResult.fromJson(mock.detect(it.id)).console.source in setOf("mock", "last-known") }, "demo data never claims a DDP source")
        val lan = LanConsoles(MemoryStore())
        assertTrue(lan.list().isEmpty(), "real consoles start empty; demo consoles are never saved as real")
        assertFailsWith<DetectionException> { lan.detect(mock.list().first().id) }
    }

    @Test fun henStatusUsesOnlyVerifiedEvidence() {
        fun env(state: String, verified: Boolean) = DetectionResult.fromJson(JSONObject("""
            {"connection":{"state":"connected"},"environment":{"kind":"goldhen","state":"$state","verified":$verified}}"""))
        assertEquals(HenStatus.INSTALLED, HenStatus.of(env("active", true)))
        assertEquals(HenStatus.UNKNOWN, HenStatus.of(env("active", false)))
        assertEquals(HenStatus.NOT_INSTALLED, HenStatus.of(env("absent", true)))
        assertEquals(HenStatus.UNKNOWN, HenStatus.of(env("absent", false)))
        assertEquals(HenStatus.UNSUPPORTED, HenStatus.of(env("unsupported-method", false)))
        assertEquals(HenStatus.NOT_DETECTED, HenStatus.of(null))
    }
}
