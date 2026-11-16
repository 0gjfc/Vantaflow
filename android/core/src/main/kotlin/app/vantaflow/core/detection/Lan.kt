// Local-network detection (Android companion): UDP transport, address rules, discovery and the
// report every provider returns. Kotlin mirror of desktop/agent/{udp,discovery,report}.mjs.
// Network code lives here and in the providers only; the UI never touches sockets.
// Call these from a background thread (Dispatchers.IO on Android): they block until the timeout.
package app.vantaflow.core.detection

import app.vantaflow.core.model.ErrorInfo
import app.vantaflow.core.model.Generation
import app.vantaflow.core.model.ProviderReport
import app.vantaflow.core.model.Unavailable
import org.json.JSONArray
import org.json.JSONObject
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.Inet4Address
import java.net.InetAddress
import java.net.NetworkInterface
import java.net.SocketTimeoutException
import java.time.Instant
import java.util.concurrent.CompletableFuture

data class UdpReply(val text: String, val from: String)

fun interface UdpTransport {
    // Sends one datagram and returns every reply received before timeoutMs (or the first one).
    // onlyFrom: ignore replies from any other address, so a probe of one console can never be
    // answered by another device. Throws IOException on socket errors; no reply is an empty list.
    fun exchange(address: String, port: Int, message: String, timeoutMs: Int, broadcast: Boolean, first: Boolean, onlyFrom: String?): List<UdpReply>
}

object DatagramTransport : UdpTransport {
    override fun exchange(address: String, port: Int, message: String, timeoutMs: Int, broadcast: Boolean, first: Boolean, onlyFrom: String?): List<UdpReply> =
        DatagramSocket().use { socket ->
            socket.broadcast = broadcast
            val bytes = message.toByteArray(Charsets.UTF_8)
            socket.send(DatagramPacket(bytes, bytes.size, InetAddress.getByName(address), port)) // literal IPv4: no DNS lookup
            val replies = mutableListOf<UdpReply>()
            val deadline = System.nanoTime() + timeoutMs * 1_000_000L
            val buf = ByteArray(2048)
            while (true) {
                val left = ((deadline - System.nanoTime()) / 1_000_000L).toInt()
                if (left <= 0) break
                socket.soTimeout = left
                val packet = DatagramPacket(buf, buf.size)
                try { socket.receive(packet) } catch (e: SocketTimeoutException) { break }
                val from = packet.address.hostAddress ?: ""
                if (onlyFrom != null && from != onlyFrom) continue
                replies += UdpReply(String(packet.data, 0, packet.length, Charsets.UTF_8), from)
                if (first) break
            }
            replies
        }
}

data class Retrieved(val generation: Generation, val name: String?, val power: String, val systemVersion: String?, val firmware: String?)

// What a provider tried, what it got, how sure it is, and what it cannot get.
data class ProbeReport(
    val provider: String,
    val generation: Generation,
    val method: String,
    val address: String,
    val attempted: List<String>,
    val answered: Boolean = false,
    val retrieved: Retrieved? = null,
    val unavailable: List<Unavailable> = emptyList(),
    val errors: List<ErrorInfo> = emptyList(),
    val detection: JSONObject? = null, // DetectionResult JSON for the compatibility engine
    val at: String = Instant.now().toString(),
) {
    val providerReport get() = ProviderReport(provider, method, attempted, unavailable)
}

interface ConsoleProvider {
    val name: String
    val generation: Generation
    val port: Int
    val method: String
    fun read(text: String, address: String): ProbeReport // parses one reply (also used by discovery)
    fun probe(address: String): ProbeReport
}

// Shared by the PS4 and PS5 providers: the DetectionResult JSON for one DDP reply.
internal fun ddpDetection(
    address: String, generation: Generation?, reply: Ddp.Reply?, fw: Ddp.Firmware,
    henName: String, henWhy: String, errors: List<ErrorInfo>, report: ProviderReport, at: String,
): JSONObject {
    val ok = generation != null
    val power = if (ok && reply != null) Ddp.powerState(reply.code) else "unknown"
    return JSONObject()
        .put("connection", JSONObject().put("state", if (ok) "connected" else "unknown").put("transport", "ddp-udp").put("address", address).put("lastSeen", at))
        .put("network", JSONObject().put("state", if (ok) "online" else "unknown").put("power", power))
        .put("console", JSONObject().put("generation", generation?.id).put("model", null as Any?).put("name", if (ok) reply?.hostName else null).put("verified", ok).put("source", "ddp"))
        .put("firmware", JSONObject().put("version", fw.version).put("verified", fw.confirmed).put("source", "ddp").put("raw", fw.raw))
        .put("environment", JSONObject().put("state", "unsupported-method").put("verified", false).put("source", "none").put("evidence", henWhy).put("name", henName))
        .put("storage", JSONArray())
        .put("errors", JSONArray(errors.map { JSONObject().put("code", it.code).put("message", it.message).put("recoverable", it.recoverable).put("action", it.action) }))
        .put("report", JSONObject().put("provider", report.provider).put("method", report.method).put("attempted", JSONArray(report.attempted))
            .put("unavailable", JSONArray(report.unavailable.map { JSONObject().put("field", it.field).put("reason", it.reason) })))
}

object LanAddress {
    private val IPV4 = Regex("^\\d{1,3}(\\.\\d{1,3}){3}$")

    // Private (RFC 1918) and link-local IPv4 only: VantaFlow never contacts internet addresses.
    fun isLocal(ip: String, allowLoopback: Boolean = false): Boolean {
        if (!IPV4.matches(ip)) return false
        val (a, b, _, d) = ip.split('.').map { it.toInt() }
        if (ip.split('.').any { it.toInt() > 255 }) return false
        if (a == 127) return allowLoopback // tests only
        if (d == 0 || d == 255) return false // network / broadcast address, not a device
        return a == 10 || (a == 172 && b in 16..31) || (a == 192 && b == 168) || (a == 169 && b == 254)
    }

    sealed interface Check { data class Ok(val ip: String) : Check; data class Invalid(val error: String) : Check }

    fun validate(input: String?, allowLoopback: Boolean = false): Check {
        val ip = input?.trim().orEmpty()
        if (!IPV4.matches(ip)) return Check.Invalid("Enter an IPv4 address such as 192.168.1.20.")
        if (!isLocal(ip, allowLoopback)) return Check.Invalid("$ip is not a local network address. VantaFlow only connects to consoles on your own network (10.x, 172.16–31.x, 192.168.x, 169.254.x).")
        return Check.Ok(ip)
    }

    // Broadcast addresses of this device's IPv4 networks, plus the limited broadcast address.
    fun broadcastTargets(): List<String> {
        val targets = linkedSetOf("255.255.255.255")
        runCatching {
            NetworkInterface.getNetworkInterfaces()?.toList().orEmpty()
                .filter { it.isUp && !it.isLoopback }
                .flatMap { it.interfaceAddresses }
                .filter { it.address is Inet4Address }
                .mapNotNull { it.broadcast?.hostAddress }
                .forEach { targets += it }
        }
        return targets.toList()
    }
}

data class DiscoveryResult(val devices: List<ProbeReport>, val errors: List<ErrorInfo>, val sent: List<String>)

// User-initiated only (the app asks first). One SRCH per generation per broadcast target; no
// port scanning, no unicast sweeps. Replies from non-local addresses are ignored.
fun discover(
    providers: List<ConsoleProvider>,
    targets: List<String> = LanAddress.broadcastTargets(),
    timeoutMs: Int = 2500,
    transport: UdpTransport = DatagramTransport,
    allowLoopback: Boolean = false,
): DiscoveryResult {
    val jobs = providers.flatMap { p -> targets.map { t -> Triple(p, t, p.port) } }
    val results = jobs.map { (p, target, port) ->
        CompletableFuture.supplyAsync {
            runCatching { transport.exchange(target, port, Ddp.searchMessage(p.generation), timeoutMs, broadcast = true, first = false, onlyFrom = null) }
        }
    }.map { it.join() }
    val devices = linkedMapOf<String, ProbeReport>()
    val errors = mutableListOf<ErrorInfo>()
    jobs.zip(results).forEach { (job, result) ->
        val (p, target, port) = job
        result.onSuccess { replies ->
            replies.filter { LanAddress.isLocal(it.from, allowLoopback) }.forEach { reply ->
                val r = p.read(reply.text, reply.from)
                if (r.retrieved != null) devices["${p.generation.id}@${reply.from}"] = r
            }
        }.onFailure { errors += ErrorInfo("network-error", "$target:$port: ${it.message}") }
    }
    return DiscoveryResult(devices.values.toList(), errors, jobs.map { (p, t, port) -> "DDP SRCH (${p.generation.id}) to $t:$port" })
}
