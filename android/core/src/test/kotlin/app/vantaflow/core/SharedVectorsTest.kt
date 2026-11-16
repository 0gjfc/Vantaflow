// Runs the same shared test vectors as the desktop app (tests/compat.test.mjs), so both
// implementations of the compatibility engine must agree.
package app.vantaflow.core

import app.vantaflow.core.compat.CompatibilityEngine
import app.vantaflow.core.compat.EnvironmentData
import app.vantaflow.core.detection.DetectionService
import app.vantaflow.core.detection.MockDetectionProvider
import app.vantaflow.core.model.AccountPrefs
import app.vantaflow.core.model.CompatStatus
import app.vantaflow.core.model.CustomizationPrefs
import app.vantaflow.core.model.DetectionResult
import app.vantaflow.core.model.Generation
import app.vantaflow.core.model.Profiles
import app.vantaflow.core.model.objects
import app.vantaflow.core.platform.Ps4Rules
import app.vantaflow.core.platform.Ps5Rules
import org.json.JSONObject
import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class SharedVectorsTest {
    private val shared = File(System.getProperty("vantaflow.shared"))
    private fun json(path: String) = JSONObject(File(shared, path).readText())
    private val engine = CompatibilityEngine(mapOf(
        Generation.PS4 to Ps4Rules(EnvironmentData.fromJson(json("compatibility/goldhen.json"))),
        Generation.PS5 to Ps5Rules(EnvironmentData.fromJson(json("compatibility/etahen.json"))),
    ))
    private val mock = json("mock-consoles.json")

    @Test fun everyMockConsoleGetsItsExpectedStatus() {
        for (c in mock.getJSONArray("consoles").objects()) {
            val r = engine.evaluate(DetectionResult.fromJson(c.getJSONObject("detection")))
            assertEquals(c.getString("expected"), r.status.id, "${c.getString("id")}: ${r.reasons.joinToString { it.message }}")
            assertTrue(r.reasons.isNotEmpty() && r.reasons.all { it.message.length > 10 }, "${c.getString("id")} explains itself")
        }
    }

    private fun detect(gen: String, model: String, fw: String, kind: String, version: String, components: String = "{}") = DetectionResult.fromJson(JSONObject("""
        {"connection":{"state":"connected"},"console":{"generation":"$gen","model":"$model","verified":true},
         "firmware":{"version":"$fw","verified":true},
         "environment":{"kind":"$kind","state":"active","version":"$version","verified":true,"components":$components}}"""))

    @Test fun targetedRulesMatchTheDesktop() {
        assertEquals(CompatStatus.UNSUPPORTED, engine.evaluate(detect("ps4", "ps4", "11.00", "goldhen", "2.3")).status)
        assertEquals(CompatStatus.COMPATIBLE, engine.evaluate(detect("ps4", "ps4", "9.60", "goldhen", "2.4b17.3")).status)
        assertEquals(CompatStatus.UNKNOWN, engine.evaluate(detect("ps5", "ps5", "8.20", "etahen", "2.4B", """{"elfldr":true}""")).status)
        assertEquals(CompatStatus.UNKNOWN, engine.evaluate(detect("ps5", "ps5", "9.60", "etahen", "2.5B", """{"elfldr":true}""")).status)
        assertEquals(CompatStatus.COMPATIBLE, engine.evaluate(detect("ps5", "ps5", "9.60", "etahen", "2.4B", """{"elfldr":true}""")).status)
        assertEquals(CompatStatus.PARTIAL, engine.evaluate(detect("ps5", "ps5", "5.10", "etahen", "2.0b")).status)
        assertEquals(CompatStatus.UNKNOWN, engine.evaluate(detect("ps4", "ps4-pro", "6.72", "mira", "2.0b2")).status)
        assertEquals(CompatStatus.NOT_DETECTED, engine.evaluate(null).status)
    }

    @Test fun detectionServiceTurnsFailuresIntoNotDetected() {
        val service = DetectionService(MockDetectionProvider(mock))
        assertEquals(mock.getJSONArray("consoles").length(), service.list().size)
        val missing = service.detect("no-such-console")
        assertEquals("not-found", missing.errors.first().code)
        assertEquals(CompatStatus.NOT_DETECTED, engine.evaluate(missing).status)
        val found = service.detect("ps4-goldhen-supported")
        assertTrue(found.detectedAt != null && service.last("ps4-goldhen-supported") == found)
    }

    @Test fun accountIsSharedUnlessSeparateAccountsAreOn() {
        val shared = AccountPrefs("Kai")
        val ps5 = AccountPrefs("PS5_Player")
        val consoles = mapOf(Generation.PS4 to CustomizationPrefs(Generation.PS4, accent = "#e0434f"))
        val p = Profiles(shared = shared, perConsole = mapOf(Generation.PS5 to ps5), consoles = consoles)
        assertEquals(shared, p.accountFor(Generation.PS5))
        assertEquals(ps5, p.copy(separateAccounts = true).accountFor(Generation.PS5))
        assertEquals(shared, p.copy(separateAccounts = true).accountFor(Generation.PS4))
        assertEquals("#e0434f", p.prefsFor(Generation.PS4).accent)
        assertEquals("#1d86f0", p.prefsFor(Generation.PS5).accent)
    }
}
