// Compatibility engine — Kotlin mirror of js/compat/engine.js.
// connection → generation → that platform's own rules → worst check wins, and a final guard
// never lets an unverified configuration be reported as compatible.
package app.vantaflow.core.compat

import app.vantaflow.core.model.CompatStatus
import app.vantaflow.core.model.CompatibilityResult
import app.vantaflow.core.model.ConnectionState
import app.vantaflow.core.model.DetectionResult
import app.vantaflow.core.model.EnvironmentState
import app.vantaflow.core.model.Generation
import app.vantaflow.core.model.Reason

// Each console generation implements its own rules (platform/Ps4Rules.kt, platform/Ps5Rules.kt).
fun interface PlatformRules {
    fun assess(d: DetectionResult): CompatibilityResult
}

fun worstStatus(reasons: List<Reason>) = reasons.maxByOrNull { it.status.rank }?.status ?: CompatStatus.COMPATIBLE

private fun fullyVerified(d: DetectionResult) = d.console.verified && d.console.model != null && d.firmware.verified && d.firmware.version != null &&
    d.environment.verified && d.environment.state == EnvironmentState.ACTIVE && d.environment.kind != null && d.environment.version != null

class CompatibilityEngine(private val platforms: Map<Generation, PlatformRules>) {
    fun evaluate(input: DetectionResult?): CompatibilityResult {
        val d = input ?: DetectionResult.NONE
        if (d.connection.state != ConnectionState.CONNECTED) {
            val why = d.errors.firstOrNull()?.message
                ?: d.connection.lastSeen?.let { "The console is not connected (last seen $it). Nothing can be checked until it is detected again." }
                ?: "No console is connected."
            return CompatibilityResult(CompatStatus.NOT_DETECTED, listOf(Reason(CompatStatus.NOT_DETECTED, "not-connected", why)))
        }
        val rules = d.console.generation?.let { platforms[it] }
            ?: return CompatibilityResult(CompatStatus.UNKNOWN, listOf(Reason(CompatStatus.UNKNOWN, "generation-unknown",
                "The console could not be identified as a PS4 or a PS5, so no compatibility rules can be applied.")))
        val r = rules.assess(d)
        var status = worstStatus(r.reasons)
        var reasons = r.reasons
        if ((status == CompatStatus.COMPATIBLE || status == CompatStatus.PARTIAL) && !fullyVerified(d)) {
            reasons = reasons + Reason(CompatStatus.UNKNOWN, "not-verified", "Some console details are not verified, so compatibility cannot be confirmed.")
            status = CompatStatus.UNKNOWN
        }
        return r.copy(status = status, reasons = reasons)
    }
}
