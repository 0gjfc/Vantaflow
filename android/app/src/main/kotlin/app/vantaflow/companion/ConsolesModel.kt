// State and actions for the companion's console screens. All network work goes through :core
// (LanConsoles, Ps4Provider, Ps5Provider) on Dispatchers.IO; this class never opens sockets.
package app.vantaflow.companion

import android.app.Application
import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import app.vantaflow.core.compat.CompatibilityEngine
import app.vantaflow.core.compat.EnvironmentData
import app.vantaflow.core.detection.ConsoleRef
import app.vantaflow.core.detection.ConsoleStore
import app.vantaflow.core.detection.DetectionException
import app.vantaflow.core.detection.DetectionService
import app.vantaflow.core.detection.LanConsoles
import app.vantaflow.core.detection.MockDetectionProvider
import app.vantaflow.core.detection.Ps4Provider
import app.vantaflow.core.detection.Ps5Provider
import app.vantaflow.core.detection.ProbeReport
import app.vantaflow.core.detection.discover
import app.vantaflow.core.model.CompatibilityResult
import app.vantaflow.core.model.ConnectionState
import app.vantaflow.core.model.DetectionResult
import app.vantaflow.core.model.Generation
import app.vantaflow.core.platform.Ps4Rules
import app.vantaflow.core.platform.Ps5Rules
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject

data class Notice(val title: String, val text: String, val ok: Boolean)

class ConsolesModel(app: Application) : AndroidViewModel(app) {
    private val prefs = app.getSharedPreferences("vantaflow", Context.MODE_PRIVATE)
    private fun asset(path: String) = JSONObject(getApplication<Application>().assets.open(path).bufferedReader().use { it.readText() })

    // Saved consoles stay on this phone (SharedPreferences); nothing is sent anywhere else.
    private val store = object : ConsoleStore {
        override fun load() = prefs.getString("lan-consoles", null)
        override fun save(json: String) = prefs.edit().putString("lan-consoles", json).apply()
    }
    private val ps4 = Ps4Provider()
    private val ps5 = Ps5Provider()
    val lan = LanConsoles(store, mapOf(Generation.PS4 to ps4, Generation.PS5 to ps5))
    private val lanService = DetectionService(lan)
    private val demo = MockDetectionProvider(asset("mock-consoles.json"))
    private val demoService = DetectionService(demo)
    private val engine = CompatibilityEngine(mapOf(
        Generation.PS4 to Ps4Rules(EnvironmentData.fromJson(asset("compatibility/goldhen.json"))),
        Generation.PS5 to Ps5Rules(EnvironmentData.fromJson(asset("compatibility/etahen.json"))),
    ))

    var realConsoles by mutableStateOf(lan.list())
        private set
    val demoConsoles: List<ConsoleRef> = demo.list()
    var results by mutableStateOf(mapOf<String, DetectionResult>())
        private set
    var active by mutableStateOf(prefs.getString("active-console", null))
        private set
    var busy by mutableStateOf<String?>(null)
        private set
    var notice by mutableStateOf<Notice?>(null)
    var found by mutableStateOf<List<ProbeReport>?>(null) // discovery results waiting for a pick

    init {
        demoConsoles.forEach { results = results + (it.id to demoService.detect(it.id)) }
        // Disconnected consoles are not contacted; the ones the user left connected are re-checked once.
        val (connected, disconnected) = realConsoles.partition { lan.saved(it.id)?.connected == true }
        disconnected.forEach { results = results + (it.id to lanService.detect(it.id)) }
        if (connected.isNotEmpty()) work("Checking saved consoles…") { connected.forEach { runDetect(it.id) } }
    }

    fun isReal(id: String) = LanConsoles.isLan(id)
    fun detection(id: String) = results[id]
    fun compatibility(id: String): CompatibilityResult = engine.evaluate(results[id])

    private fun work(label: String, block: suspend () -> Unit) {
        if (busy != null) return
        busy = label
        viewModelScope.launch {
            try { block() } finally { busy = null; realConsoles = lan.list() }
        }
    }

    private suspend fun runDetect(id: String): DetectionResult {
        val d = withContext(Dispatchers.IO) { lanService.detect(id) }
        results = results + (id to d)
        return d
    }

    private fun report(label: String, d: DetectionResult) {
        notice = when (d.connection.state) {
            ConnectionState.CONNECTED -> Notice("Console answered", "$label: ${d.console.generation?.name}${d.console.name?.let { " “$it”" } ?: ""} — read-only check.", true)
            ConnectionState.DISCONNECTED -> Notice("Disconnected", "$label: VantaFlow will not contact it until you connect again.", true)
            else -> Notice("No answer", "$label: ${d.errors.firstOrNull()?.message ?: "the console did not answer."}", false)
        }
    }

    fun detect(id: String, quiet: Boolean = false) = work("Checking…") {
        val d = runDetect(id)
        if (!quiet) report(lan.saved(id)?.name ?: lan.saved(id)?.address ?: id, d)
    }

    // Only called after the user agreed to the explanation in DiscoveryConsent.
    fun discoverConsoles() = work("Searching this network…") {
        val result = withContext(Dispatchers.IO) { discover(listOf(ps4, ps5)) }
        if (result.devices.isEmpty()) {
            notice = Notice("No consoles answered", "No answer does not mean there is none: the console may be off, on another network, or have network features off in rest mode. Add it by IP address instead." +
                (result.errors.firstOrNull()?.let { " (${it.message})" } ?: ""), false)
        } else found = result.devices
    }

    fun addDiscovered(r: ProbeReport) = work("Checking…") {
        found = null
        val id = lan.addDiscovered(r)
        report(r.retrieved?.name ?: r.address, runDetect(id))
    }

    fun addByAddress(address: String) = work("Checking ${address.trim()}…") {
        try {
            val (id, r) = withContext(Dispatchers.IO) { lan.addByAddress(address) }
            val d = runDetect(id)
            notice = if (r.retrieved != null) Notice("Console added", "${r.address}: ${r.retrieved?.generation?.name} answered.", true)
            else Notice("Saved, not identified", "${r.address}: ${d.errors.firstOrNull()?.message ?: "no discovery reply."} You can refresh it later.", false)
        } catch (e: DetectionException) {
            notice = Notice(if (e.code == "invalid-address") "Invalid address" else "Could not add console", e.message ?: "", false)
        }
    }

    fun connect(id: String) { lan.connect(id); detect(id) }

    fun disconnect(id: String) = work("Disconnecting…") {
        lan.disconnect(id)
        report(lan.saved(id)?.name ?: id, runDetect(id)) // not contacted: returns "disconnected" without any network traffic
    }

    fun refresh(id: String) {
        if (isReal(id) && lan.saved(id)?.connected != true) {
            notice = Notice("Not connected", "Connect this console first; a disconnected console is not contacted.", false)
            return
        }
        if (isReal(id)) detect(id) else results = results + (id to demoService.detect(id))
    }

    fun remove(id: String) {
        lan.remove(id)
        results = results - id
        if (active == id) setActive(null)
        realConsoles = lan.list()
        notice = Notice("Console removed", "Nothing was sent to the console.", true)
    }

    // A console that is not identified as a PS4 or PS5 cannot become the active console.
    fun setActive(id: String?): Boolean {
        if (id != null && results[id]?.console?.generation == null) return false
        active = id
        prefs.edit().putString("active-console", id).apply()
        return true
    }
}
