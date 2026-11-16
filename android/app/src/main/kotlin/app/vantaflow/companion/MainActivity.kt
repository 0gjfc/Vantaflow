// VantaFlow Android companion: console screens. Same colours and wording as the desktop
// Consoles page (shared/design-tokens.json). Real consoles are checked read-only; demo consoles
// are always labelled as demonstration data.
package app.vantaflow.companion

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import app.vantaflow.core.detection.ConsoleRef
import app.vantaflow.core.model.CompatStatus
import app.vantaflow.core.model.ConnectionState
import app.vantaflow.core.model.DetectionResult
import app.vantaflow.core.model.Generation
import app.vantaflow.core.model.HenStatus
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle

// shared/design-tokens.json
private val Accent = Color(0xFF1D86F0)
private val Background = Color(0xFF1F1F1F)
private val PanelGrey = Color(0xFF424242)
private val Dim = Color(0xBFFFFFFF)
private val Faint = Color(0x80FFFFFF)
private val StatusColor = mapOf(
    CompatStatus.COMPATIBLE to Color(0xFF3ECF6E), CompatStatus.PARTIAL to Color(0xFFF0B429),
    CompatStatus.UNSUPPORTED to Color(0xFFE0434F), CompatStatus.UNKNOWN to Color(0xFF9AA4B2),
    CompatStatus.NOT_DETECTED to Color(0xFF8A8A8A),
)
private val HEN = mapOf(Generation.PS4 to "GoldHEN", Generation.PS5 to "etaHEN")
private val POWER = mapOf("on" to "On", "standby" to "Rest mode")

const val PRIVACY = "VantaFlow sends one discovery request (SRCH) for PS4 on UDP port 987 and one for PS5 on UDP port 9302 " +
    "to this network's broadcast address, and listens for 2 seconds. Consoles that answer report their type, name, " +
    "system version and whether they are on or in rest mode. Nothing leaves your local network, no ports are scanned, " +
    "and only the consoles you then pick are saved, on this phone. The running game and console ID in the replies are discarded."

private fun whenText(iso: String?) = iso?.let {
    runCatching { DateTimeFormatter.ofLocalizedDateTime(FormatStyle.MEDIUM).withZone(ZoneId.systemDefault()).format(Instant.parse(it)) }.getOrDefault(it)
} ?: "—"

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme(colorScheme = darkColorScheme(primary = Accent, background = Background, surface = Background, surfaceVariant = PanelGrey)) {
                Surface(Modifier.fillMaxSize(), color = Background) { App(viewModel()) }
            }
        }
    }
}

@Composable
private fun App(m: ConsolesModel) {
    var open by remember { mutableStateOf<String?>(null) }
    var consent by remember { mutableStateOf(false) }
    var addIp by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxSize()) {
        TopBar(m)
        m.busy?.let { Text(it, color = Dim, modifier = Modifier.padding(horizontal = 20.dp)); LinearProgressIndicator(Modifier.fillMaxWidth().padding(20.dp, 6.dp)) }
        val id = open
        if (id == null) ConsoleList(m, onOpen = { open = it }, onDiscover = { consent = true }, onAdd = { addIp = true })
        else {
            BackHandler { open = null }
            ConsoleDetail(m, id, onBack = { open = null })
        }
    }
    if (consent) AlertDialog(
        onDismissRequest = { consent = false },
        title = { Text("Discover consoles on this network?") },
        text = { Text(PRIVACY) },
        confirmButton = { Button({ consent = false; m.discoverConsoles() }) { Text("Search") } },
        dismissButton = { TextButton({ consent = false }) { Text("Cancel") } },
    )
    m.found?.let { devices ->
        AlertDialog(
            onDismissRequest = { m.found = null },
            title = { Text("${devices.size} console${if (devices.size > 1) "s" else ""} answered") },
            text = {
                Column {
                    Text("Pick the console to save. Only the one you pick is contacted again.", color = Dim)
                    devices.forEach { r ->
                        Column(Modifier.fillMaxWidth().clickable { m.addDiscovered(r) }.padding(vertical = 10.dp)) {
                            Text("${r.retrieved?.name ?: "Unnamed console"} — ${r.retrieved?.generation?.name}", fontWeight = FontWeight.Bold)
                            Text("${r.address} · ${POWER[r.retrieved?.power] ?: "power unknown"}", color = Faint, fontSize = 13.sp)
                        }
                    }
                }
            },
            confirmButton = {},
            dismissButton = { TextButton({ m.found = null }) { Text("Cancel") } },
        )
    }
    if (addIp) AddByIpDialog(onDismiss = { addIp = false }, onAdd = { addIp = false; m.addByAddress(it) })
    m.notice?.let { n ->
        AlertDialog(
            onDismissRequest = { m.notice = null },
            title = { Text(n.title, color = if (n.ok) Color.White else StatusColor.getValue(CompatStatus.PARTIAL)) },
            text = { Text(n.text) },
            confirmButton = { TextButton({ m.notice = null }) { Text("OK") } },
        )
    }
}

@Composable
private fun TopBar(m: ConsolesModel) {
    val id = m.active
    val d = id?.let { m.detection(it) }
    val status = when {
        d == null -> "No active console"
        d.connection.state != ConnectionState.CONNECTED -> "${d.console.name ?: d.console.generation?.name ?: "Console"} · Not connected"
        else -> "${d.console.generation?.name ?: "Console"}${d.console.name?.let { " “$it”" } ?: ""} · FW ${d.firmware.version ?: "?"}"
    }
    Row(Modifier.fillMaxWidth().padding(20.dp), verticalAlignment = Alignment.CenterVertically) {
        Text("VantaFlow", fontSize = 24.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
        Text(status + if (id != null && !m.isReal(id)) "  DEMO" else "", color = Dim, fontSize = 13.sp)
    }
}

@Composable
private fun Chip(status: CompatStatus) = Text(status.label, color = StatusColor.getValue(status), fontSize = 12.sp,
    modifier = Modifier.background(PanelGrey.copy(alpha = .5f), RoundedCornerShape(4.dp)).padding(8.dp, 3.dp))

@Composable
private fun Tag(text: String, color: Color) = Text(text, color = color, fontSize = 11.sp, fontWeight = FontWeight.Bold,
    modifier = Modifier.background(color.copy(alpha = .15f), RoundedCornerShape(3.dp)).padding(6.dp, 2.dp))

@Composable
private fun Group(title: String) = Text(title.uppercase(), color = Accent, fontSize = 13.sp, fontWeight = FontWeight.Bold, letterSpacing = 2.sp,
    modifier = Modifier.padding(start = 20.dp, top = 20.dp, bottom = 6.dp))

@Composable
private fun ConsoleRow(m: ConsolesModel, ref: ConsoleRef, onOpen: (String) -> Unit) {
    val d = m.detection(ref.id)
    val sub = if (!m.isReal(ref.id)) ref.scenario ?: "" else when (d?.connection?.state) {
        null -> "${ref.scenario} · not checked yet"
        ConnectionState.CONNECTED -> "${ref.scenario} · ${d!!.console.generation?.name} · connected"
        ConnectionState.DISCONNECTED -> "${ref.scenario} · disconnected"
        else -> "${ref.scenario} · no answer"
    }
    Row(Modifier.fillMaxWidth().clickable { onOpen(ref.id) }
        .background(if (ref.id == m.active) Accent.copy(alpha = .25f) else Color.Transparent)
        .padding(20.dp, 12.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(ref.label, fontSize = 18.sp)
            Text(sub, color = Faint, fontSize = 13.sp)
        }
        Chip(m.compatibility(ref.id).status)
    }
}

@Composable
private fun ConsoleList(m: ConsolesModel, onOpen: (String) -> Unit, onDiscover: () -> Unit, onAdd: () -> Unit) {
    LazyColumn(Modifier.fillMaxSize()) {
        item {
            Group("Your consoles")
            Row(Modifier.padding(horizontal = 20.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Button(onDiscover, enabled = m.busy == null) { Text("Discover consoles…") }
                OutlinedButton(onAdd, enabled = m.busy == null) { Text("Add by IP address…") }
            }
            Text("Local network only · asks first · read-only", color = Faint, fontSize = 12.sp, modifier = Modifier.padding(20.dp, 6.dp))
            if (m.realConsoles.isEmpty()) Text("No consoles saved yet.", color = Dim, modifier = Modifier.padding(20.dp, 8.dp))
        }
        items(m.realConsoles, key = { it.id }) { ConsoleRow(m, it, onOpen) }
        item { Group("Demo consoles — demonstration data, no console contacted") }
        items(m.demoConsoles, key = { it.id }) { ConsoleRow(m, it, onOpen) }
    }
}

@Composable
private fun Field(label: String, value: String) = Row(Modifier.padding(vertical = 4.dp)) {
    Text(label, color = Faint, modifier = Modifier.width(150.dp))
    Text(value)
}

@Composable
private fun Section(title: String, lines: List<String>) {
    if (lines.isEmpty()) return
    Text(title.uppercase(), color = Faint, fontSize = 13.sp, letterSpacing = 2.sp, modifier = Modifier.padding(top = 18.dp, bottom = 6.dp))
    lines.forEach { Text("• $it", color = Dim, fontSize = 14.sp, modifier = Modifier.padding(vertical = 2.dp)) }
}

private fun firmwareText(d: DetectionResult?) = when {
    d == null || d.connection.state != ConnectionState.CONNECTED -> "Not available — not connected"
    d.firmware.version != null -> "${d.firmware.version} — ${if (d.firmware.verified) "verified" else "not confirmed"} (system-version ${d.firmware.raw})"
    d.firmware.raw != null -> "Not available — system-version ${d.firmware.raw} has no documented decoding"
    else -> "Not available — the console did not report it"
}

@Composable
private fun ConsoleDetail(m: ConsolesModel, id: String, onBack: () -> Unit) {
    val real = m.isReal(id)
    val d = m.detection(id)
    val c = m.compatibility(id)
    val saved = if (real) m.lan.saved(id) else null
    var confirmRemove by remember { mutableStateOf(false) }
    val gen = d?.console?.generation ?: saved?.generation
    val connected = d?.connection?.state == ConnectionState.CONNECTED
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp)) {
        TextButton(onBack) { Text("‹ Consoles") }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(d?.console?.name ?: saved?.name ?: saved?.address ?: m.demoConsoles.firstOrNull { it.id == id }?.label ?: id, fontSize = 24.sp)
            Chip(c.status)
            if (real) Tag("READ-ONLY", StatusColor.getValue(CompatStatus.COMPATIBLE)) else Tag("DEMO", StatusColor.getValue(CompatStatus.PARTIAL))
        }
        Spacer(Modifier.padding(6.dp))
        if (real) Field("IP address", saved?.address ?: "—")
        Field("Generation", when {
            gen == null -> "Not identified"
            d?.console?.verified == true -> "${gen.name} — verified" + if (real) " (discovery reply)" else ""
            else -> "${gen.name} — not verified" + if (real) " (last known)" else ""
        })
        Field("Model", if (real) "Not available — no documented read-only method" else d?.console?.model ?: "Not reported")
        Field("Firmware", if (real) firmwareText(d) else d?.firmware?.let { f -> f.version?.let { "$it · ${if (f.verified) "verified" else "not verified"}" } } ?: "Not reported")
        Field("Connection", when (d?.connection?.state) {
            null -> "Not checked yet"
            ConnectionState.CONNECTED -> "Connected — answered at ${whenText(d!!.connection.lastSeen)}"
            ConnectionState.DISCONNECTED -> "Disconnected" + if (real) " by you — not contacted" else ""
            else -> "No answer" + (d?.errors?.firstOrNull()?.let { " — ${it.message}" } ?: "")
        })
        if (real) Field("Power", if (connected) POWER[d!!.network.power] ?: "Unknown" else "Unknown")
        Field("${gen?.let { HEN[it] } ?: "Homebrew"} status", HenStatus.of(d).label)
        Field("Compatibility", c.status.label)
        if (real) Field("Last successful check", saved?.lastVerified?.let(::whenText) ?: "Never")
        Field("Last detection", whenText(d?.detectedAt))

        if (real && connected) Section("Verified from the console", listOfNotNull(
            "Console type: ${d!!.console.generation?.name}",
            d.console.name?.let { "Name: $it (as the console reports it)" },
            POWER[d.network.power]?.let { "Power: $it" },
            d.firmware.version?.takeIf { d.firmware.verified }?.let { "Firmware: $it" },
        ))
        Section("Not available", d?.report?.unavailable.orEmpty().map { "${it.field} — ${it.reason}" })
        Section("Errors", d?.errors.orEmpty().map { e -> e.message + (e.action?.let { " — $it" } ?: "") })
        Section("Why “${c.status.label}”", c.reasons.map { it.message })
        d?.report?.let { r -> r.method?.let { Section("Method", listOf(it) + r.attempted.map { a -> "Sent: $a" }) } }
        HorizontalDivider(Modifier.padding(vertical = 16.dp), color = PanelGrey)

        val idle = m.busy == null
        if (real) {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                if (saved?.connected == true) OutlinedButton({ m.disconnect(id) }, enabled = idle) { Text("Disconnect") }
                else Button({ m.connect(id) }, enabled = idle) { Text("Connect") }
                OutlinedButton({ m.refresh(id) }, enabled = idle) { Text("Refresh") }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.padding(top = 8.dp)) {
                if (gen != null && m.active != id) OutlinedButton({ m.setActive(id) }, enabled = idle) { Text("Make active") }
                OutlinedButton({ confirmRemove = true }, enabled = idle,
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = StatusColor.getValue(CompatStatus.UNSUPPORTED))) { Text("Remove") }
            }
            Text("Read-only: VantaFlow only sends the discovery request (SRCH). It never wakes, controls or changes the console.",
                color = Faint, fontSize = 12.sp, modifier = Modifier.padding(top = 12.dp))
        } else {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                if (m.active != id) Button({ if (!m.setActive(id)) m.notice = Notice("Cannot use this device", "It is not identified as a PS4 or a PS5.", false) }) { Text("Use console") }
                OutlinedButton({ m.refresh(id) }) { Text("Detect again") }
            }
            Text("Demonstration data from shared/mock-consoles.json — no console was contacted. This is not proof that a real console behaves this way.",
                color = Faint, fontSize = 12.sp, modifier = Modifier.padding(top = 12.dp))
        }
    }
    if (confirmRemove) AlertDialog(
        onDismissRequest = { confirmRemove = false },
        title = { Text("Remove console") },
        text = { Text("Forget ${saved?.name ?: saved?.address}? Nothing is sent to the console.") },
        confirmButton = { Button({ confirmRemove = false; m.remove(id); onBack() }) { Text("Remove") } },
        dismissButton = { TextButton({ confirmRemove = false }) { Text("Cancel") } },
    )
}

@Composable
private fun AddByIpDialog(onDismiss: () -> Unit, onAdd: (String) -> Unit) {
    var text by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add console by IP address") },
        text = {
            Column {
                Text("The console's IPv4 address on your network, e.g. 192.168.1.20 (PS4/PS5: Settings → Network → View Connection Status). " +
                    "Only local network addresses are accepted. VantaFlow sends it one discovery request.", color = Dim, fontSize = 14.sp)
                OutlinedTextField(text, { text = it.take(15) }, singleLine = true, modifier = Modifier.padding(top = 12.dp), placeholder = { Text("192.168.1.20") })
            }
        },
        confirmButton = { Button({ onAdd(text) }, enabled = text.isNotBlank()) { Text("Add") } },
        dismissButton = { TextButton(onDismiss) { Text("Cancel") } },
    )
}
