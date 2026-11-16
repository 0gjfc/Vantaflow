// PS4 provider (Android). Read-only: only the PS4 Device Discovery Protocol SRCH on UDP 987.
// Mirror of desktop/agent/providers/ps4.mjs. What it can and cannot verify: docs/connectivity.md.
package app.vantaflow.core.detection

import app.vantaflow.core.model.ErrorInfo
import app.vantaflow.core.model.Generation
import app.vantaflow.core.model.Unavailable
import java.io.IOException

class Ps4Provider(
    private val port: Int = Ddp.SPECS.getValue(Generation.PS4).port,
    private val timeoutMs: Int = 2000,
    private val transport: UdpTransport = DatagramTransport,
) : ConsoleProvider {
    override val name = "ps4-ddp"
    override val generation = Generation.PS4
    override val method = "PlayStation Device Discovery Protocol: SRCH request on UDP $port (read-only)"

    private val attempt get() = "DDP SRCH (protocol ${Ddp.SPECS.getValue(Generation.PS4).protocolVersion}) to %s:$port"

    override fun read(text: String, address: String): ProbeReport {
        val reply = Ddp.parseReply(text)
        val gen = Ddp.generationOf(reply, Generation.PS4)
        val errors = mutableListOf<ErrorInfo>()
        if (reply == null) errors += ErrorInfo("not-ddp", "The device answered, but not with a PlayStation discovery reply.", true, "Check the address.")
        else if (gen == null) errors += ErrorInfo("not-ps4", "The reply did not identify a PS4 (host-type \"${reply.hostType ?: "—"}\", protocol \"${reply.protocolVersion ?: "—"}\").")
        val fw = if (gen != null) Ddp.ps4Firmware(reply?.systemVersion) else Ddp.Firmware(null, false, reply?.systemVersion)
        val unavailable = UNAVAILABLE.toMutableList()
        if (gen != null && fw.version == null) unavailable += Unavailable("firmware", "The reply had no readable system-version.")
        if (gen != null && fw.version != null && !fw.confirmed) {
            unavailable += Unavailable("firmware-confirmation", "Decoded ${fw.version} from system-version ${fw.raw}; the decoding is documented only for firmware below 10.00.")
        }
        val base = ProbeReport(name, generation, method, address, listOf(attempt.format(address)), answered = reply != null, unavailable = unavailable, errors = errors)
        return base.copy(
            retrieved = gen?.let { Retrieved(it, reply?.hostName, Ddp.powerState(reply!!.code), fw.raw, fw.version) },
            detection = ddpDetection(address, gen, reply, fw, "GoldHEN", UNAVAILABLE[1].reason, errors, base.providerReport, base.at),
        )
    }

    override fun probe(address: String): ProbeReport = try {
        val replies = transport.exchange(address, port, Ddp.searchMessage(Generation.PS4), timeoutMs, broadcast = false, first = true)
        val reply = replies.firstOrNull { it.from == address } ?: replies.firstOrNull()
        reply?.let { read(it.text, address) } ?: ProbeReport(name, generation, method, address, listOf(attempt.format(address)), errors = listOf(
            ErrorInfo("timeout", "No PS4 discovery reply from $address within ${timeoutMs / 1000.0} s.", true,
                "Check the address, that the console is on, and that it is on this network. No reply does not prove the device is not a PS4."),
        ))
    } catch (e: IOException) {
        ProbeReport(name, generation, method, address, listOf("DDP SRCH to $address:$port"), errors = listOf(
            ErrorInfo("network-error", e.message ?: "Network error.", true, "Check this phone's Wi-Fi connection."),
        ))
    }

    companion object {
        val UNAVAILABLE = listOf(
            Unavailable("model", "The DDP reply does not say whether this is a PS4, PS4 Slim or PS4 Pro, and no other documented read-only method was found."),
            Unavailable("goldhen", "GoldHEN documents no read-only status or version method. Its FTP/BinLoader/Klog ports answering would not prove GoldHEN is running, so they are not used."),
        )
    }
}
