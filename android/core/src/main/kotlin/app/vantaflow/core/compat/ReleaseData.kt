// Researched release data (shared/compatibility/*.json) and pure lookups on it.
// Kotlin mirror of js/compat/release-data.js.
package app.vantaflow.core.compat

import app.vantaflow.core.model.FeatureNote
import app.vantaflow.core.model.objects
import app.vantaflow.core.model.strings
import app.vantaflow.core.model.text
import org.json.JSONArray
import org.json.JSONObject

data class FirmwareStatement(val versions: List<String>?, val range: Pair<String, String>?, val level: String, val evidence: String)
data class Restriction(val feature: String, val range: Pair<String, String>, val text: String)
data class Feature(
    val id: String, val label: String, val since: String?, val experimental: Boolean, val note: String?,
    val firmware: Pair<String, String>?, val requires: List<String>,
)
data class Release(
    val version: String, val date: String, val channel: String, val firmware: List<FirmwareStatement>,
    val requires: List<String>, val requiresComponents: List<String>, val knownIssues: List<String>, val restrictions: List<Restriction>,
)
data class EnvironmentData(
    val environment: String, val name: String, val lastVerified: String, val firmwareListComplete: Boolean,
    val readmeDescribes: String, val features: List<Feature>, val releases: List<Release>,
) {
    fun release(version: String?) = releases.firstOrNull { it.version == version }
    fun releasesMentioning(fw: String?) = releases.filter { statement(it, fw) != null }

    companion object {
        private fun pair(a: JSONArray?) = a?.let { it.getString(0) to it.getString(1) }
        private fun list(o: JSONObject, key: String) = o.optJSONArray(key)?.strings() ?: emptyList()

        fun fromJson(o: JSONObject) = EnvironmentData(
            environment = o.getString("environment"),
            name = o.getString("name"),
            lastVerified = o.getString("lastVerified"),
            firmwareListComplete = o.getBoolean("firmwareListComplete"),
            readmeDescribes = o.getString("readmeDescribes"),
            features = o.getJSONArray("features").objects().map {
                Feature(it.getString("id"), it.getString("label"), it.text("since"), it.optBoolean("experimental"), it.text("note"),
                    pair(it.optJSONArray("firmware")), list(it, "requires"))
            },
            releases = o.getJSONArray("releases").objects().map { r ->
                Release(
                    r.getString("version"), r.getString("date"), r.getString("channel"),
                    r.getJSONArray("firmware").objects().map {
                        FirmwareStatement(it.optJSONArray("versions")?.strings(), pair(it.optJSONArray("range")), it.getString("level"), it.getString("evidence"))
                    },
                    list(r, "requires"), list(r, "requiresComponents"), list(r, "knownIssues"),
                    (r.optJSONArray("restrictions") ?: JSONArray()).objects().map { Restriction(it.getString("feature"), pair(it.getJSONArray("range"))!!, it.getString("text")) },
                )
            },
        )
    }
}

private val FW = Regex("""^(\d{1,2})\.(\d{2})$""")

// "9.00" → 900, "10.01" → 1001; null when it is not a firmware version.
fun parseFirmware(v: String?): Int? = v?.let { FW.matchEntire(it) }?.let { it.groupValues[1].toInt() * 100 + it.groupValues[2].toInt() }

private fun inRange(n: Int, r: Pair<String, String>) = n >= parseFirmware(r.first)!! && n <= parseFirmware(r.second)!!

// The statement in `release` that covers `fw`; "documented" beats "limited".
fun statement(release: Release, fw: String?): FirmwareStatement? {
    val n = parseFirmware(fw) ?: return null
    var best: FirmwareStatement? = null
    for (s in release.firmware) {
        val hit = s.versions?.any { parseFirmware(it) == n } ?: inRange(n, s.range!!)
        if (hit && (best == null || (best.level == "limited" && s.level == "documented"))) best = s
    }
    return best
}

fun describeFirmware(release: Release) = release.firmware.joinToString("; ") { s ->
    (s.versions?.joinToString(", ") ?: "${s.range!!.first}–${s.range.second}") + if (s.level == "limited") " (limited)" else ""
}.ifEmpty { "no firmware statement" }

data class FeatureSplit(val supported: List<String>, val unsupported: List<FeatureNote>, val unverified: List<FeatureNote>, val limitations: List<String>)

// discDrive: "built-in", "optional" or "none".
fun featuresFor(data: EnvironmentData, release: Release, firmware: String?, st: FirmwareStatement?, modelName: String?, discDrive: String?): FeatureSplit {
    val index = { v: String -> data.releases.indexOfFirst { it.version == v } } // newest first
    val n = parseFirmware(firmware)
    val supported = mutableListOf<String>()
    val unsupported = mutableListOf<FeatureNote>()
    val unverified = mutableListOf<FeatureNote>()
    val limitations = mutableListOf<String>()
    for (f in data.features) {
        val restriction = release.restrictions.firstOrNull { it.feature == f.id && n != null && inRange(n, it.range) }
        when {
            f.since != null && index(release.version) > index(f.since) -> unsupported += FeatureNote(f.label, "Added in ${data.name} ${f.since}.")
            f.firmware != null && (n == null || !inRange(n, f.firmware)) -> unsupported += FeatureNote(f.label, "Only on firmware ${f.firmware.first}–${f.firmware.second}.")
            restriction != null -> unsupported += FeatureNote(f.label, restriction.text)
            "disc-drive" in f.requires && discDrive == "none" -> unsupported += FeatureNote(f.label, "$modelName has no disc drive.")
            f.since == null && release.version != data.readmeDescribes ->
                unverified += FeatureNote(f.label, "Listed in the current README (${data.name} ${data.readmeDescribes}); the release that added it is not documented.")
            st?.level == "limited" -> unverified += FeatureNote(f.label, "Support on firmware $firmware is documented as limited: ${st.evidence}.")
            else -> {
                supported += f.label
                if (f.experimental) limitations += "${f.label}: experimental. ${f.note ?: ""}".trim()
                if ("disc-drive" in f.requires && discDrive == "optional") limitations += "${f.label}: needs the detachable disc drive attached."
            }
        }
    }
    return FeatureSplit(supported, unsupported, unverified, limitations)
}
