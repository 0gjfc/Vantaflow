// PS5 provider (Android). Read-only: only the PS5 Device Discovery Protocol SRCH on UDP 9302.
// Separate from the PS4 provider on purpose: different port, protocol version and firmware
// encoding, and etaHEN instead of GoldHEN. Mirror of desktop/agent/providers/ps5.mjs.
package app.vantaflow.core.detection

import app.vantaflow.core.model.ErrorInfo
import app.vantaflow.core.model.Generation
import app.vantaflow.core.model.Unavailable
import java.io.IOException

class Ps5Provider(
    private val port: Int = Ddp.SPECS.getValue(Generation.PS5).port,
    private val timeoutMs: Int = 2000,
    private val transport: UdpTransport = DatagramTransport,
) : ConsoleProvider {
    override val name = "ps5-ddp"
    override val generation = Generation.PS5
    override val method = "PlayStation Device Discovery Protocol: SRCH request on UDP $port (read-only)"

    private val attempt get() = "DDP SRCH (protocol ${Ddp.SPECS.getValue(Generation.PS5).protocolVersion}) to %s:$port"

    override fun read(text: String, address: String): ProbeReport {
        val reply = Ddp.parseReply(text)
        val gen = Ddp.generationOf(reply, Generation.PS5)
        val errors = mutableListOf<ErrorInfo>()
        if (reply == null) errors += ErrorInfo("not-ddp", "The device answered, but not with a PlayStation discovery reply.", true, "Check the address.")
        else if (gen == null) errors += ErrorInfo("not-ps5", "The reply did not identify a PS5 (host-type \"${reply.hostType ?: "—"}\", protocol \"${reply.protocolVersion ?: "—"}\").")
        val fw = Ddp.ps5Firmware(reply?.systemVersion)
        val base = ProbeReport(name, generation, method, address, listOf(attempt.format(address)), answered = reply != null, unavailable = UNAVAILABLE, errors = errors)
        return base.copy(
            retrieved = gen?.let { Retrieved(it, reply?.hostName, Ddp.powerState(reply!!.code), fw.raw, null) },
            detection = ddpDetection(address, gen, reply, fw, "etaHEN", UNAVAILABLE[2].reason, errors, base.providerReport, base.at),
        )
    }

    override fun probe(address: String): ProbeReport = try {
        val replies = transport.exchange(address, port, Ddp.searchMessage(Generation.PS5), timeoutMs, broadcast = false, first = true)
        val reply = replies.firstOrNull { it.from == address } ?: replies.firstOrNull()
        reply?.let { read(it.text, address) } ?: ProbeReport(name, generation, method, address, listOf(attempt.format(address)), errors = listOf(
            ErrorInfo("timeout", "No PS5 discovery reply from $address within ${timeoutMs / 1000.0} s.", true,
                "Check the address, that the console is on, and that it is on this network. No reply does not prove the device is not a PS5."),
        ))
    } catch (e: IOException) {
        ProbeReport(name, generation, method, address, listOf("DDP SRCH to $address:$port"), errors = listOf(
            ErrorInfo("network-error", e.message ?: "Network error.", true, "Check this phone's Wi-Fi connection."),
        ))
    }

    companion object {
        val UNAVAILABLE = listOf(
            Unavailable("model", "The DDP reply does not say which PS5 this is (standard, Digital, Slim, Slim Digital or Pro), and no other documented read-only method was found."),
            Unavailable("firmware", "The PS5 reply has a system-version value, but no source documents how it maps to the firmware number shown on the console, so it is not converted."),
            Unavailable("etahen", "etaHEN documents no read-only status or version method. Its FTP, Klog or ELF-loader ports answering would not prove etaHEN is running, so they are not used."),
        )
    }
}
