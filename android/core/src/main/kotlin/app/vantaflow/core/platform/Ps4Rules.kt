// PS4 platform: models and GoldHEN compatibility rules — Kotlin mirror of js/platform/ps4/.
// Kept separate from the PS5 rules on purpose. GoldHEN publishes a complete firmware list per
// release, so a firmware missing from a release's list is not supported by that release.
package app.vantaflow.core.platform

import app.vantaflow.core.compat.EnvironmentData
import app.vantaflow.core.compat.PlatformRules
import app.vantaflow.core.compat.describeFirmware
import app.vantaflow.core.compat.featuresFor
import app.vantaflow.core.compat.parseFirmware
import app.vantaflow.core.compat.statement
import app.vantaflow.core.model.CompatStatus
import app.vantaflow.core.model.CompatibilityResult
import app.vantaflow.core.model.DetectionResult
import app.vantaflow.core.model.EnvironmentKind
import app.vantaflow.core.model.EnvironmentState
import app.vantaflow.core.model.Reason

data class ConsoleModel(val id: String, val short: String, val name: String, val group: String, val discDrive: String)

val PS4_MODELS = listOf(
    ConsoleModel("ps4", "PS4", "PlayStation 4", "CUH-1000 series", "built-in"),
    ConsoleModel("ps4-slim", "PS4 Slim", "PlayStation 4 Slim", "CUH-2000 series", "built-in"),
    ConsoleModel("ps4-pro", "PS4 Pro", "PlayStation 4 Pro", "CUH-7000 series", "built-in"),
)

class Ps4Rules(private val goldhen: EnvironmentData) : PlatformRules {
    override fun assess(d: DetectionResult): CompatibilityResult {
        val reasons = mutableListOf<Reason>()
        fun add(s: CompatStatus, code: String, msg: String) { reasons += Reason(s, code, msg) }
        var result = CompatibilityResult(CompatStatus.COMPATIBLE, emptyList(), environment = "GoldHEN", dataVerified = goldhen.lastVerified)
        val limitations = mutableListOf<String>()

        val model = PS4_MODELS.firstOrNull { it.id == d.console.model }
        when {
            model == null -> add(CompatStatus.UNKNOWN, "model-unknown", d.console.model?.let { "\"$it\" is not a known PS4 model." } ?: "The PS4 model was not reported.")
            !d.console.verified -> add(CompatStatus.UNKNOWN, "model-unverified", "${model.name} was reported but not verified (source: ${d.console.source}).")
            else -> add(CompatStatus.COMPATIBLE, "model", "${model.name} (${model.group}). GoldHEN documents no model-specific requirement.")
        }

        val fw = d.firmware.version
        val fwKnown = parseFirmware(fw) != null
        if (!fwKnown) add(CompatStatus.UNKNOWN, "firmware-unknown", fw?.let { "Firmware \"$it\" is not a valid PS4 version number." } ?: "The firmware version was not reported.")
        else if (!d.firmware.verified) add(CompatStatus.UNKNOWN, "firmware-unverified", "Firmware $fw was not verified (source: ${d.firmware.source}).")
        val listedBy = if (fwKnown) goldhen.releasesMentioning(fw).map { it.version } else emptyList()
        val listedText = if (listedBy.isNotEmpty()) "Firmware $fw is listed by GoldHEN ${listedBy.joinToString(", ")}." else "No GoldHEN release lists firmware $fw."
        if (fwKnown && listedBy.isEmpty()) add(CompatStatus.UNSUPPORTED, "firmware-not-documented", "No GoldHEN release (data verified ${goldhen.lastVerified}) lists firmware $fw.")

        val env = d.environment
        when {
            env.kind == EnvironmentKind.ETAHEN -> add(CompatStatus.UNSUPPORTED, "environment-mismatch", "etaHEN is a PS5 environment; it cannot run on a PS4.")
            env.state == EnvironmentState.ABSENT -> add(CompatStatus.UNSUPPORTED, "environment-absent",
                "GoldHEN is not running. VantaFlow's console features need GoldHEN on a PS4." + if (fwKnown) " $listedText" else "")
            env.state == EnvironmentState.UNSUPPORTED_METHOD -> add(CompatStatus.UNKNOWN, "environment-check-unsupported",
                "GoldHEN status cannot be checked: ${env.evidence ?: "no documented read-only method exists."}")
            env.state == EnvironmentState.UNKNOWN -> add(CompatStatus.UNKNOWN, "environment-unknown", "Whether GoldHEN is running could not be determined.")
            env.kind != EnvironmentKind.GOLDHEN -> add(CompatStatus.UNKNOWN, "environment-unidentified", "A homebrew environment is running, but it was not identified as GoldHEN.")
            !env.verified -> add(CompatStatus.UNKNOWN, "environment-unverified", "GoldHEN is not verified: ${env.evidence ?: "source ${env.source}"}")
            else -> {
                val release = goldhen.release(env.version)
                if (release == null) {
                    add(CompatStatus.UNKNOWN, "version-unknown", "GoldHEN ${env.version ?: "(no version)"} is not in the researched release data (verified ${goldhen.lastVerified}).")
                } else {
                    limitations += release.knownIssues
                    if (release.channel == "pre-release") limitations += "GoldHEN ${release.version} is published as a pre-release."
                    val st = if (fwKnown) statement(release, fw) else null
                    if (fwKnown && st == null) add(CompatStatus.UNSUPPORTED, "firmware-not-in-release", "GoldHEN ${release.version} supports ${describeFirmware(release)}; $fw is not one of them. $listedText")
                    else if (st != null) add(CompatStatus.COMPATIBLE, "firmware-documented", "GoldHEN ${release.version} supports firmware $fw (${st.evidence}).")
                    result = result.copy(release = release.version, requirements = release.requires)
                    if (st != null) {
                        val f = featuresFor(goldhen, release, fw, st, model?.name, model?.discDrive)
                        result = result.copy(supported = f.supported, unsupported = f.unsupported, unverified = f.unverified)
                        limitations += f.limitations
                    }
                }
            }
        }
        return result.copy(reasons = reasons, limitations = limitations)
    }
}
