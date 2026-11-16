// Console detection — Kotlin mirror of js/detection/.
// Providers only observe: no exploits, no payloads, no writes. Every field carries evidence
// (verified + source); an open network port is never proof that GoldHEN or etaHEN is running.
package app.vantaflow.core.detection

import app.vantaflow.core.model.ConnectionState
import app.vantaflow.core.model.ConnectionStatus
import app.vantaflow.core.model.DetectionResult
import app.vantaflow.core.model.ErrorInfo
import app.vantaflow.core.model.objects
import app.vantaflow.core.model.text
import org.json.JSONObject
import java.time.Instant

data class ConsoleRef(val id: String, val label: String, val scenario: String?, val generation: String?)

class DetectionException(val code: String, message: String) : Exception(message)

interface DetectionProvider {
    val name: String
    fun list(): List<ConsoleRef>
    // Returns the raw detection JSON (same shape as shared/mock-consoles.json "detection").
    fun detect(id: String): JSONObject
}

// Runs a provider and always returns a DetectionResult: a failure becomes "not connected"
// with a recoverable error the UI can show. (Timeouts belong in the provider on Android,
// e.g. socket timeouts, so no thread is blocked here.)
class DetectionService(private val provider: DetectionProvider) {
    private val results = mutableMapOf<String, DetectionResult>()

    fun list() = provider.list()
    fun last(id: String) = results[id]

    fun detect(id: String): DetectionResult {
        val at = Instant.now().toString()
        val result = try {
            DetectionResult.fromJson(provider.detect(id), consoleId = id, detectedAt = at)
        } catch (e: DetectionException) {
            failed(id, at, e.code, e.message)
        } catch (e: Exception) {
            failed(id, at, "detection-failed", e.message)
        }
        results[id] = result
        return result
    }

    private fun failed(id: String, at: String, code: String, message: String?) = DetectionResult.NONE.copy(
        consoleId = id,
        detectedAt = at,
        connection = ConnectionStatus(ConnectionState.UNKNOWN, provider.name),
        errors = listOf(ErrorInfo(code, message ?: "Detection failed.", true, "Check that the console is on and on the same network, then detect again.")),
    )
}

// Demonstration consoles from shared/mock-consoles.json (bundled as an asset on Android).
class MockDetectionProvider(mockConsolesJson: JSONObject) : DetectionProvider {
    override val name = "mock"
    private val consoles = mockConsolesJson.getJSONArray("consoles").objects()

    override fun list() = consoles.map {
        ConsoleRef(it.getString("id"), it.getString("label"), it.text("scenario"), it.getJSONObject("detection").getJSONObject("console").text("generation"))
    }

    override fun detect(id: String): JSONObject {
        val c = consoles.firstOrNull { it.getString("id") == id } ?: throw DetectionException("not-found", "No console with id \"$id\".")
        return JSONObject(c.getJSONObject("detection").toString()) // copy
    }
}
