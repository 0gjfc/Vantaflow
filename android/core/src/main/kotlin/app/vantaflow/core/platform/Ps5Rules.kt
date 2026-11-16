// PS5 platform: models and etaHEN compatibility rules — Kotlin mirror of js/platform/ps5/.
// Kept separate from the PS4 rules on purpose. etaHEN release notes only mention firmware a
// release adds, fixes or tests, so firmware a release does not mention is unknown for it.
package app.vantaflow.core.platform

import app.vantaflow.core.compat.EnvironmentData
import app.vantaflow.core.compat.PlatformRules
import app.vantaflow.core.compat.featuresFor
import app.vantaflow.core.compat.parseFirmware
import app.vantaflow.core.compat.statement
import app.vantaflow.core.model.CompatStatus
import app.vantaflow.core.model.CompatibilityResult
import app.vantaflow.core.model.DetectionResult
import app.vantaflow.core.model.EnvironmentKind
import app.vantaflow.core.model.EnvironmentState
import app.vantaflow.core.model.Reason

val PS5_MODELS = listOf(
    ConsoleModel("ps5", "PS5", "PlayStation 5", "CFI-1000 series, disc", "built-in"),
    ConsoleModel("ps5-digital", "PS5 Digital", "PlayStation 5 Digital Edition", "CFI-1000 series, digital", "none"),
    ConsoleModel("ps5-slim", "PS5 Slim", "PlayStation 5 (slim)", "CFI-2000 model group, disc", "built-in"),
    ConsoleModel("ps5-slim-digital", "PS5 Slim Digital", "PlayStation 5 Digital Edition (slim)", "CFI-2000 model group, digital", "optional"),
    ConsoleModel("ps5-pro", "PS5 Pro", "PlayStation 5 Pro", "CFI-7000 model group", "optional"),
)

private val COMPONENT_NAMES = mapOf("elfldr" to "Payload SDK ELF loader", "kstuff" to "kstuff")

class Ps5Rules(private val etahen: EnvironmentData) : PlatformRules {
    override fun assess(d: DetectionResult): CompatibilityResult {
        val reasons = mutableListOf<Reason>()
        fun add(s: CompatStatus, code: String, msg: String) { reasons += Reason(s, code, msg) }
        var result = CompatibilityResult(CompatStatus.COMPATIBLE, emptyList(), environment = "etaHEN", dataVerified = etahen.lastVerified)
        val limitations = mutableListOf<String>()

        val model = PS5_MODELS.firstOrNull { it.id == d.console.model }
        when {
            model == null -> add(CompatStatus.UNKNOWN, "model-unknown", d.console.model?.let { "\"$it\" is not a known PS5 model." } ?: "The PS5 model was not reported.")
            !d.console.verified -> add(CompatStatus.UNKNOWN, "model-unverified", "${model.name} was reported but not verified (source: ${d.console.source}).")
            else -> add(CompatStatus.COMPATIBLE, "model", "${model.name} (${model.group}). etaHEN documents no model-specific requirement.")
        }

        val fw = d.firmware.version
        val fwKnown = parseFirmware(fw) != null
        if (!fwKnown) add(CompatStatus.UNKNOWN, "firmware-unknown", fw?.let { "Firmware \"$it\" is not a valid PS5 version number." } ?: "The firmware version was not reported.")
        else if (!d.firmware.verified) add(CompatStatus.UNKNOWN, "firmware-unverified", "Firmware $fw was not verified (source: ${d.firmware.source}).")
        val mentionedBy = if (fwKnown) etahen.releasesMentioning(fw).map { it.version } else emptyList()
        val mentionedText = if (mentionedBy.isNotEmpty()) "Firmware $fw is mentioned by etaHEN ${mentionedBy.joinToString(", ")}." else "No etaHEN release mentions firmware $fw."
        if (fwKnown && mentionedBy.isEmpty()) add(CompatStatus.UNSUPPORTED, "firmware-not-documented", "No etaHEN release note (data verified ${etahen.lastVerified}) mentions firmware $fw.")

        val env = d.environment
        when {
            env.kind == EnvironmentKind.GOLDHEN -> add(CompatStatus.UNSUPPORTED, "environment-mismatch", "GoldHEN is a PS4 environment; it cannot run on a PS5.")
            env.state == EnvironmentState.ABSENT -> add(CompatStatus.UNSUPPORTED, "environment-absent",
                "etaHEN is not running. VantaFlow's console features need etaHEN on a PS5." + if (fwKnown) " $mentionedText" else "")
            env.state == EnvironmentState.UNSUPPORTED_METHOD -> add(CompatStatus.UNKNOWN, "environment-check-unsupported",
                "etaHEN status cannot be checked: ${env.evidence ?: "no documented read-only method exists."}")
            env.state == EnvironmentState.UNKNOWN -> add(CompatStatus.UNKNOWN, "environment-unknown", "Whether etaHEN is running could not be determined.")
            env.kind != EnvironmentKind.ETAHEN -> add(CompatStatus.UNKNOWN, "environment-unidentified", "A homebrew environment is running, but it was not identified as etaHEN.")
            !env.verified -> add(CompatStatus.UNKNOWN, "environment-unverified", "etaHEN is not verified: ${env.evidence ?: "source ${env.source}"}")
            else -> {
                val release = etahen.release(env.version)
                if (release == null) {
                    add(CompatStatus.UNKNOWN, "version-unknown", "etaHEN ${env.version ?: "(no version)"} is not in the researched release data (verified ${etahen.lastVerified}).")
                } else {
                    limitations += release.knownIssues
                    for (c in release.requiresComponents) {
                        if (env.components[c] == false) add(CompatStatus.UNKNOWN, "component-missing",
                            "etaHEN ${release.version} needs the ${COMPONENT_NAMES[c] ?: c} to load, but detection reports it missing. The detection result is inconsistent.")
                    }
                    if (env.components["kstuff"] == false) limitations += "kstuff is not loaded, so features that depend on it are unavailable."
                    val st = if (fwKnown) statement(release, fw) else null
                    when {
                        fwKnown && st == null && mentionedBy.isNotEmpty() -> add(CompatStatus.UNKNOWN, "firmware-not-restated",
                            "etaHEN ${release.version} release notes do not mention firmware $fw. $mentionedText Support is not assumed to carry over.")
                        st?.level == "limited" -> add(CompatStatus.PARTIAL, "firmware-limited", "etaHEN ${release.version} documents only limited support on $fw: ${st.evidence}.")
                        st != null -> add(CompatStatus.COMPATIBLE, "firmware-documented", "etaHEN ${release.version} documents firmware $fw: ${st.evidence}.")
                    }
                    result = result.copy(release = release.version, requirements = release.requires)
                    if (st != null) {
                        val f = featuresFor(etahen, release, fw, st, model?.name, model?.discDrive)
                        result = result.copy(supported = f.supported, unsupported = f.unsupported, unverified = f.unverified)
                        limitations += f.limitations
                        if (release.restrictions.any { r -> f.unsupported.any { it.why == r.text } }) {
                            add(CompatStatus.PARTIAL, "feature-restricted", "etaHEN ${release.version} disables some features on firmware $fw.")
                        }
                    }
                }
            }
        }
        return result.copy(reasons = reasons, limitations = limitations)
    }
}
