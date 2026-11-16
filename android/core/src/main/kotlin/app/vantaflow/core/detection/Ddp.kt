// PlayStation Device Discovery Protocol (DDP): message format only, no networking.
// Kotlin mirror of desktop/agent/ddp.mjs; both parse shared/ddp-samples.json in their tests.
//
// Sony does not publish DDP. This follows open-source implementations (docs/connectivity.md):
//   chiaki-ng  lib/include/chiaki/discovery.h, lib/src/discovery.c
//   pyremoteplay / pyps4-2ndscreen  ddp.py
//   Home Assistant core  components/ps4/media_player.py  (system-version to firmware)
// VantaFlow only sends the read-only SRCH request. WAKEUP and LAUNCH change the console's state
// and need the user's credential, so they are not implemented.
package app.vantaflow.core.detection

import app.vantaflow.core.model.Generation

object Ddp {
    data class Spec(val port: Int, val protocolVersion: String, val hostType: String)

    val SPECS = mapOf(
        Generation.PS4 to Spec(987, "00020020", "PS4"),
        Generation.PS5 to Spec(9302, "00030010", "PS5"),
    )

    // Fields VantaFlow does not need (running-app-titleid, running-app-name, host-id) are dropped.
    data class Reply(
        val code: Int,
        val status: String,
        val hostType: String?,
        val hostName: String?,
        val systemVersion: String?,
        val protocolVersion: String?,
        val requestPort: Int?,
    )

    data class Firmware(val version: String?, val confirmed: Boolean, val raw: String?)

    fun searchMessage(g: Generation) = "SRCH * HTTP/1.1\ndevice-discovery-protocol-version:${SPECS.getValue(g).protocolVersion}\n"

    // Returns null when the text is not a DDP reply at all.
    fun parseReply(text: String?): Reply? {
        if (text == null) return null
        val lines = text.split(Regex("\\r?\\n")).map { it.trim() }.filter { it.isNotEmpty() }
        val status = Regex("^HTTP/1\\.1 (\\d{3}) ?(.*)$").find(lines.firstOrNull() ?: "") ?: return null
        val fields = lines.drop(1).mapNotNull { line ->
            val i = line.indexOf(':')
            if (i > 0) line.substring(0, i).trim() to line.substring(i + 1).trim() else null
        }.toMap()
        return Reply(
            code = status.groupValues[1].toInt(),
            status = status.groupValues[2],
            hostType = fields["host-type"],
            hostName = fields["host-name"],
            systemVersion = fields["system-version"],
            protocolVersion = fields["device-discovery-protocol-version"],
            requestPort = fields["host-request-port"]?.toIntOrNull(),
        )
    }

    // 200 = on, 620 = rest mode ("Server Standby"); anything else is not interpreted.
    fun powerState(code: Int) = when (code) { 200 -> "on"; 620 -> "standby"; else -> "unknown" }

    // A reply proves a generation only if host-type AND protocol version both match the one asked.
    fun generationOf(reply: Reply?, asked: Generation): Generation? {
        val want = SPECS.getValue(asked)
        return if (reply != null && reply.hostType == want.hostType && reply.protocolVersion == want.protocolVersion) asked else null
    }

    // PS4: digits 1-4 of the 8-digit system-version read as XX.YZ ("09008001" -> "9.00").
    // Confirmed only with a leading "0" (firmware below 10.00); later values are unconfirmed.
    fun ps4Firmware(sv: String?): Firmware {
        if (sv == null || !Regex("^\\d{8}$").matches(sv)) return Firmware(null, false, sv)
        val major = sv.substring(0, 2).toInt()
        return Firmware(if (major >= 1) "$major.${sv.substring(2, 4)}" else null, sv[0] == '0' && major >= 1, sv)
    }

    // PS5: no source documents how system-version maps to the firmware number, so none is given.
    fun ps5Firmware(sv: String?) = Firmware(null, false, sv)
}
