// Shared data models — Kotlin mirror of js/models/index.js (see docs/data-models.md).
// Same field names and the same normalisation rules: unknown enum values become null/UNKNOWN,
// and nothing counts as verified unless the source says verified = true.
package app.vantaflow.core.model

import org.json.JSONArray
import org.json.JSONObject

enum class Generation(val id: String) {
    PS4("ps4"), PS5("ps5");
    companion object { fun of(v: String?) = entries.firstOrNull { it.id == v } }
}

enum class ConnectionState(val id: String) {
    CONNECTED("connected"), DISCONNECTED("disconnected"), UNKNOWN("unknown");
    companion object { fun of(v: String?) = entries.firstOrNull { it.id == v } ?: UNKNOWN }
}

enum class EnvironmentKind(val id: String, val label: String) {
    GOLDHEN("goldhen", "GoldHEN"), ETAHEN("etahen", "etaHEN");
    companion object { fun of(v: String?) = entries.firstOrNull { it.id == v } }
}

enum class EnvironmentState(val id: String) {
    ACTIVE("active"), ABSENT("absent"), UNKNOWN("unknown");
    companion object { fun of(v: String?) = entries.firstOrNull { it.id == v } ?: UNKNOWN }
}

// rank: the worst check decides the overall status.
enum class CompatStatus(val id: String, val label: String, val rank: Int) {
    COMPATIBLE("compatible", "Compatible", 0),
    PARTIAL("partial", "Partially compatible", 1),
    UNKNOWN("unknown", "Unknown", 2),
    UNSUPPORTED("unsupported", "Unsupported", 3),
    NOT_DETECTED("not-detected", "Not detected", 4);
    companion object { fun of(v: String?) = entries.firstOrNull { it.id == v } }
}

data class ConnectionStatus(val state: ConnectionState, val transport: String = "none", val address: String? = null, val lastSeen: String? = null)
data class ConsoleInfo(val generation: Generation?, val model: String?, val verified: Boolean, val source: String)
data class FirmwareInfo(val version: String?, val verified: Boolean, val source: String)

// components: true = reported present, false = reported missing, key absent = not reported.
data class EnvironmentInfo(
    val kind: EnvironmentKind?,
    val state: EnvironmentState,
    val version: String?,
    val verified: Boolean,
    val source: String,
    val evidence: String? = null,
    val components: Map<String, Boolean> = emptyMap(),
)

data class StorageDrive(val name: String, val total: Double, val holds: Generation?, val categories: Map<String, Double>)
data class ErrorInfo(val code: String, val message: String, val recoverable: Boolean = true, val action: String? = null)

data class DetectionResult(
    val consoleId: String?,
    val connection: ConnectionStatus,
    val console: ConsoleInfo,
    val firmware: FirmwareInfo,
    val environment: EnvironmentInfo,
    val storage: List<StorageDrive> = emptyList(),
    val detectedAt: String? = null,
    val errors: List<ErrorInfo> = emptyList(),
) {
    companion object {
        val NONE = fromJson(null)

        fun fromJson(json: JSONObject?, consoleId: String? = null, detectedAt: String? = null): DetectionResult {
            val d = json ?: JSONObject()
            val c = d.optJSONObject("connection") ?: JSONObject()
            val con = d.optJSONObject("console") ?: JSONObject()
            val fw = d.optJSONObject("firmware") ?: JSONObject()
            val env = d.optJSONObject("environment") ?: JSONObject()
            val components = env.optJSONObject("components")?.let { o -> o.keySet().associateWith { o.optBoolean(it) } } ?: emptyMap()
            return DetectionResult(
                consoleId = consoleId ?: d.text("consoleId"),
                connection = ConnectionStatus(ConnectionState.of(c.text("state")), c.text("transport") ?: "none", c.text("address"), c.text("lastSeen")),
                console = ConsoleInfo(Generation.of(con.text("generation")), con.text("model"), con.opt("verified") == true, con.text("source") ?: "unknown"),
                firmware = FirmwareInfo(fw.text("version"), fw.opt("verified") == true, fw.text("source") ?: "unknown"),
                environment = EnvironmentInfo(
                    EnvironmentKind.of(env.text("kind")), EnvironmentState.of(env.text("state")), env.text("version"),
                    env.opt("verified") == true, env.text("source") ?: "unknown", env.text("evidence"), components,
                ),
                storage = (d.optJSONArray("storage") ?: JSONArray()).objects().map { s ->
                    val cats = s.optJSONObject("categories")
                    StorageDrive(s.text("name") ?: "Drive", s.optDouble("total", 0.0), Generation.of(s.text("holds")),
                        cats?.keySet()?.associateWith { cats.optDouble(it) } ?: emptyMap())
                },
                detectedAt = detectedAt ?: d.text("detectedAt"),
                errors = (d.optJSONArray("errors") ?: JSONArray()).objects().map {
                    ErrorInfo(it.text("code") ?: "unknown-error", it.text("message") ?: "Something went wrong.", it.optBoolean("recoverable", true), it.text("action"))
                },
            )
        }
    }
}

data class Reason(val status: CompatStatus, val code: String, val message: String)
data class FeatureNote(val label: String, val why: String)

data class CompatibilityResult(
    val status: CompatStatus,
    val reasons: List<Reason>,
    val environment: String? = null,
    val release: String? = null,
    val supported: List<String> = emptyList(),
    val unsupported: List<FeatureNote> = emptyList(),
    val unverified: List<FeatureNote> = emptyList(),
    val requirements: List<String> = emptyList(),
    val limitations: List<String> = emptyList(),
    val dataVerified: String? = null,
)

// Per-console preferences (subset of js/core/settings.js): always separate for PS4 and PS5.
data class CustomizationPrefs(
    val profile: Generation,
    val accent: String = "#1d86f0",
    val highlight: String = "#1d86f0",
    val background: String = "shader",
    val animations: Boolean = true,
    val reflections: Boolean = true,
)

// The VantaFlow account: shared by both console profiles unless separate accounts are turned on
// (for people who use different PlayStation accounts on PS4 and PS5).
data class AccountPrefs(val username: String = "Player One", val avatarColor: String = "#1d86f0", val presence: String = "online")

data class Profiles(
    val separateAccounts: Boolean = false,
    val shared: AccountPrefs = AccountPrefs(),
    val perConsole: Map<Generation, AccountPrefs> = emptyMap(),
    val consoles: Map<Generation, CustomizationPrefs> = emptyMap(),
) {
    fun accountFor(g: Generation) = if (separateAccounts) perConsole[g] ?: shared else shared
    fun prefsFor(g: Generation) = consoles[g] ?: CustomizationPrefs(g)
}

// --- small org.json helpers (org.json is built into Android) ---
fun JSONObject.text(key: String): String? = if (has(key) && !isNull(key)) optString(key).trim().ifEmpty { null } else null
fun JSONArray.objects(): List<JSONObject> = (0 until length()).mapNotNull { optJSONObject(it) }
fun JSONArray.strings(): List<String> = (0 until length()).map { getString(it) }
