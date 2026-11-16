// The user's own consoles on the local network (Android companion). Mirror of
// js/detection/lan-provider.js and the console actions in js/platform/index.js.
// Consoles are added only by the user (discovery result or typed IP address) and saved on this
// phone. A console the user disconnected is not contacted at all.
package app.vantaflow.core.detection

import app.vantaflow.core.model.ErrorInfo
import app.vantaflow.core.model.Generation
import app.vantaflow.core.model.objects
import app.vantaflow.core.model.text
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant

// Where the saved list lives (SharedPreferences on Android, a field in tests).
interface ConsoleStore {
    fun load(): String?
    fun save(json: String)
}

data class SavedConsole(
    val id: String,
    val address: String,
    val generation: Generation?,
    val name: String?,
    val connected: Boolean,
    val addedAt: String,
    val lastVerified: String?,
)

class LanConsoles(
    private val store: ConsoleStore,
    private val providers: Map<Generation, ConsoleProvider> = mapOf(Generation.PS4 to Ps4Provider(), Generation.PS5 to Ps5Provider()),
    private val allowLoopback: Boolean = false, // tests only
) : DetectionProvider {
    override val name = "lan"

    fun saved(): List<SavedConsole> = runCatching { JSONArray(store.load() ?: "[]").objects().map { o ->
        SavedConsole(o.getString("id"), o.getString("address"), Generation.of(o.text("generation")), o.text("name"),
            o.optBoolean("connected"), o.optString("addedAt"), o.text("lastVerified"))
    } }.getOrDefault(emptyList())

    fun saved(id: String) = saved().firstOrNull { it.id == id }

    private fun write(list: List<SavedConsole>) = store.save(JSONArray(list.map {
        JSONObject().put("id", it.id).put("address", it.address).put("generation", it.generation?.id).put("name", it.name)
            .put("connected", it.connected).put("addedAt", it.addedAt).put("lastVerified", it.lastVerified)
    }).toString())

    private fun put(c: SavedConsole) = write(saved().filter { it.id != c.id } + c)
    private fun update(id: String, f: (SavedConsole) -> SavedConsole) = saved(id)?.let { put(f(it)) }
    fun remove(id: String) = write(saved().filter { it.id != id })

    override fun list() = saved().map { ConsoleRef(it.id, it.name ?: it.address, it.address, it.generation?.id) }

    // Probe a user-chosen address with one provider (known generation) or both.
    fun probe(address: String, generation: Generation? = null): List<ProbeReport> {
        val ip = when (val check = LanAddress.validate(address, allowLoopback)) {
            is LanAddress.Check.Ok -> check.ip
            is LanAddress.Check.Invalid -> throw DetectionException("invalid-address", check.error)
        }
        val which = generation?.let { listOfNotNull(providers[it]) } ?: providers.values.toList()
        return which.map { p -> java.util.concurrent.CompletableFuture.supplyAsync { p.probe(ip) } }.map { it.join() }
    }

    override fun detect(id: String): JSONObject {
        val c = saved(id) ?: throw DetectionException("not-found", "This console is no longer saved.")
        if (!c.connected) return JSONObject()
            .put("connection", JSONObject().put("state", "disconnected").put("transport", "ddp-udp").put("address", c.address).put("lastSeen", c.lastVerified))
            .put("console", JSONObject().put("generation", c.generation?.id).put("name", c.name).put("verified", false).put("source", "last-known"))
            .put("firmware", JSONObject().put("verified", false).put("source", "last-known"))
            .put("environment", JSONObject().put("state", "unknown").put("verified", false).put("source", "none"))
            .put("report", JSONObject().put("provider", "lan").put("method", "Disconnected by you: VantaFlow does not contact this console until you connect again."))
        val r = best(probe(c.address, c.generation), c.generation)
        r.retrieved?.let { got -> update(id) { it.copy(generation = got.generation, name = got.name ?: it.name, lastVerified = r.at) } }
        return detectionOf(r)
    }

    // User actions. Each returns the raw detection of the console afterwards.
    fun addDiscovered(r: ProbeReport): String {
        val id = idOf(r.address)
        put(SavedConsole(id, r.address, r.retrieved?.generation, r.retrieved?.name, true, Instant.now().toString(), r.at))
        return id
    }

    // Saved even when nothing answers, so the user can retry; shown as not identified until a
    // reply proves what it is. Throws DetectionException("invalid-address") without saving.
    fun addByAddress(address: String): Pair<String, ProbeReport> {
        val r = best(probe(address))
        val id = idOf(r.address)
        put(SavedConsole(id, r.address, r.retrieved?.generation, r.retrieved?.name, true, Instant.now().toString(), r.retrieved?.let { r.at }))
        return id to r
    }

    fun connect(id: String) = update(id) { it.copy(connected = true) }
    fun disconnect(id: String) = update(id) { it.copy(connected = false) }

    companion object {
        fun idOf(address: String) = "lan-$address"
        fun isLan(id: String) = id.startsWith("lan-")

        // The report that identified a console; otherwise the most informative failure.
        fun best(reports: List<ProbeReport>, generation: Generation? = null) =
            reports.firstOrNull { it.retrieved != null && (generation == null || it.retrieved.generation == generation) }
                ?: reports.firstOrNull { it.retrieved != null }
                ?: reports.firstOrNull { r -> r.errors.any { it.code != "timeout" } }
                ?: reports.first()

        // A failed check is "not identified" with the provider's errors, never a success.
        fun detectionOf(r: ProbeReport): JSONObject = r.detection?.takeIf { r.retrieved != null } ?: JSONObject()
            .put("connection", JSONObject().put("state", "unknown").put("transport", "ddp-udp").put("address", r.address))
            .put("console", JSONObject().put("verified", false).put("source", "ddp"))
            .put("firmware", JSONObject().put("verified", false).put("source", "ddp"))
            .put("environment", JSONObject().put("state", "unknown").put("verified", false).put("source", "none"))
            .put("errors", JSONArray(r.errors.map { e: ErrorInfo -> JSONObject().put("code", e.code).put("message", e.message).put("action", e.action) }))
            .put("report", JSONObject().put("provider", r.provider).put("method", r.method).put("attempted", JSONArray(r.attempted))
                .put("unavailable", JSONArray(r.unavailable.map { JSONObject().put("field", it.field).put("reason", it.reason) })))
    }
}
