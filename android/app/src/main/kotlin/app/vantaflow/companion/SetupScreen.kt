// Install & recovery screen of the companion: update from an APK file, backups, recovery and
// cleanup. Same visual language as the console screens (shared/design-tokens.json) and the
// same confirmation content as the desktop: what happens, what is affected, data, backup, undo.
package app.vantaflow.companion

import android.content.Intent
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.vantaflow.core.model.CompatStatus
import app.vantaflow.core.setup.Backup
import app.vantaflow.core.setup.StartupCheck

private val Good = StatusColor.getValue(CompatStatus.COMPATIBLE)
private val Warn = StatusColor.getValue(CompatStatus.PARTIAL)
private val Bad = StatusColor.getValue(CompatStatus.UNSUPPORTED)

// The confirmation shown before every change. Destructive actions need two taps.
@Composable
internal fun ConfirmSheet(
    title: String, summary: String, rows: List<Pair<String, String>>, warnings: List<String> = emptyList(),
    confirm: String, destructive: Boolean = false, onConfirm: () -> Unit, onDismiss: () -> Unit,
) {
    var armed by remember { mutableStateOf(false) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title, color = if (destructive) Color(0xFFFF9AA2) else Color.White) },
        text = {
            Column(Modifier.heightIn(max = 460.dp).verticalScroll(rememberScrollState())) {
                Text(summary, color = Dim)
                warnings.forEach { Text("• $it", color = Warn, fontSize = 13.sp, modifier = Modifier.padding(top = 8.dp)) }
                rows.forEach { (k, v) ->
                    Text(k.uppercase(), color = Faint, fontSize = 11.sp, letterSpacing = 1.sp, modifier = Modifier.padding(top = 12.dp))
                    Text(v, fontSize = 14.sp)
                }
            }
        },
        confirmButton = {
            Button({ if (destructive && !armed) armed = true else onConfirm() },
                colors = if (destructive) ButtonDefaults.buttonColors(containerColor = if (armed) Bad else Color(0xFFB8323C)) else ButtonDefaults.buttonColors()) {
                Text(if (armed) "Tap again to ${confirm.lowercase()}" else confirm)
            }
        },
        dismissButton = { TextButton(onDismiss) { Text("Cancel") } },
    )
}

@Composable
private fun Chip(text: String, color: Color) = Text(text, color = color, fontSize = 12.sp,
    modifier = Modifier.background(color.copy(alpha = .14f), RoundedCornerShape(4.dp)).padding(8.dp, 3.dp))

@Composable
private fun ActionRow(title: String, sub: String, chip: Pair<String, Color>? = null, onClick: (() -> Unit)?) =
    Row(Modifier.fillMaxWidth().let { if (onClick != null) it.clickable(onClick = onClick) else it }.padding(20.dp, 12.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) { Text(title, fontSize = 17.sp); Text(sub, color = Faint, fontSize = 13.sp) }
        chip?.let { Chip(it.first, it.second) }
    }

@Composable
internal fun SetupScreen(s: SetupModel, onBack: () -> Unit) {
    BackHandler(onBack = onBack)
    val context = LocalContext.current
    var confirmBackup by remember { mutableStateOf(false) }
    var selected by remember { mutableStateOf<Backup?>(null) }
    var confirmRestore by remember { mutableStateOf<Backup?>(null) }
    var confirmDelete by remember { mutableStateOf<Backup?>(null) }
    var confirmRecover by remember { mutableStateOf(false) }
    val pick = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri -> if (uri != null) s.pick(uri) }
    LaunchedEffect(Unit) { s.reload() }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        TextButton(onBack, Modifier.padding(horizontal = 8.dp)) { Text("‹ Consoles") }
        Text("Install & recovery", fontSize = 24.sp, modifier = Modifier.padding(horizontal = 20.dp))
        s.busy?.let { Text(it, color = Dim, modifier = Modifier.padding(20.dp, 8.dp)); LinearProgressIndicator(Modifier.fillMaxWidth().padding(horizontal = 20.dp)) }

        Group("This app")
        ActionRow("VantaFlow companion ${s.installed.versionName ?: ""}", "Version code ${s.installed.versionCode} · ${s.installed.packageName}", "Installed" to Good, null)
        when (val st = s.startup) {
            is StartupCheck.Updated -> ActionRow("Update finished", "Android reports version ${s.installed.versionName}: verified.", "Verified" to Good, null)
            is StartupCheck.Interrupted -> ActionRow("An update did not finish",
                "Started ${whenText(st.journal.startedAt)} (to ${st.journal.toVersionName ?: st.journal.toVersionCode}). The app is still ${s.installed.versionName}.${if (st.openSession) " An unfinished installer session is open." else ""} Tap to recover.",
                "Action needed" to Bad) { confirmRecover = true }
            StartupCheck.Nothing -> {}
        }

        Group("Install update")
        ActionRow("Install update from APK file…", "Checked first: same app, same signature, newer version", null) { pick.launch(arrayOf("application/vnd.android.package-archive")) }
        Text("Android asks once whether VantaFlow may install apps (\"Install unknown apps\") and then shows its own confirmation. Your data is kept during updates.",
            color = Faint, fontSize = 12.sp, modifier = Modifier.padding(horizontal = 20.dp))

        Group("Backups")
        ActionRow("Back up settings now…", "Saved consoles and active console", null) { confirmBackup = true }
        s.backupList.forEach { b ->
            val chip = when (b.status) { "valid" -> "Valid" to Good; "damaged" -> "Damaged" to Bad; else -> "Incomplete" to Warn }
            ActionRow(b.description, "${whenText(b.createdAt)} · ${b.settingsEntries} ${if (b.settingsEntries == 1) "entry" else "entries"}", chip) { selected = b }
        }
        if (s.backupList.isEmpty()) Text("No backups yet.", color = Dim, modifier = Modifier.padding(20.dp, 8.dp))

        Group("Clean up")
        ActionRow("Clean up temporary files…", "Preview first; backups and settings are never removed", null) { s.previewCleanup() }
    }

    s.plan?.let { p ->
        ConfirmSheet(
            title = "Install update", summary = p.summary ?: "", confirm = "Install",
            rows = listOf("Package" to "Checked: VantaFlow companion (app.vantaflow.companion), same signing key as the installed app, newer version", "Platform" to "Android (this phone)",
                "Permission" to p.permission, "What happens" to "Android replaces the app with the new version after you confirm in its dialog.",
                "Affected" to p.affects.joinToString("\n"), "Your data" to p.data, "Backup" to p.backup, "Can be undone" to p.reversible),
            onConfirm = s::install, onDismiss = s::dismissPlan,
        )
    }
    if (s.needsPermission) AlertDialog(
        onDismissRequest = { s.needsPermission = false },
        title = { Text("Allow VantaFlow to install updates") },
        text = { Text("Android needs your permission before an app may install apps: Settings → Apps → VantaFlow → Install unknown apps → Allow. VantaFlow uses it only to install its own updates, and only after you confirm each one. Then come back and tap Install again.") },
        confirmButton = { Button({ s.needsPermission = false; context.startActivity(s.permissionIntent().addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }) { Text("Open settings") } },
        dismissButton = { TextButton({ s.needsPermission = false }) { Text("Not now") } },
    )
    if (confirmBackup) ConfirmSheet(
        title = "Back up your settings", confirm = "Back up", summary = "Copies the companion's ${s.settingsStore.read().size} settings entries into a new backup on this phone.",
        rows = listOf("Affected" to "Nothing is changed.", "Your data" to "Not changed.", "Backup" to "This creates one. Earlier backups are kept.", "Can be undone" to "Nothing to undo."),
        onConfirm = { confirmBackup = false; s.backupNow() }, onDismiss = { confirmBackup = false },
    )
    selected?.let { b ->
        AlertDialog(
            onDismissRequest = { selected = null },
            title = { Text(b.description) },
            text = {
                Column {
                    Text("${b.status.replaceFirstChar { it.uppercase() }} · ${whenText(b.createdAt)}", color = Dim)
                    b.problems.take(3).forEach { Text("• $it", color = Bad, fontSize = 13.sp) }
                    if (b.status == "valid") Text("Restore these settings", modifier = Modifier.fillMaxWidth().clickable { selected = null; confirmRestore = b }.padding(vertical = 12.dp))
                    Text("Delete this backup", color = Bad, modifier = Modifier.fillMaxWidth().clickable { selected = null; confirmDelete = b }.padding(vertical = 12.dp))
                }
            },
            confirmButton = {}, dismissButton = { TextButton({ selected = null }) { Text("Cancel") } },
        )
    }
    confirmRestore?.let { b ->
        ConfirmSheet(
            title = "Restore settings", confirm = "Restore", destructive = true,
            summary = "Replace the companion's current settings with the ones saved ${whenText(b.createdAt)}. The backup was checked (checksums match).",
            rows = listOf("Affected" to "${b.settingsEntries} entries: saved consoles, active console", "Your data" to "Current settings are replaced.",
                "Backup" to "Yes: the current settings are backed up first.", "Can be undone" to "Yes: restore the backup made first."),
            onConfirm = { confirmRestore = null; s.restore(b) }, onDismiss = { confirmRestore = null },
        )
    }
    confirmDelete?.let { b ->
        ConfirmSheet(
            title = "Delete backup", confirm = "Delete", destructive = true, summary = "Delete \"${b.description}\" (${b.status}).",
            rows = listOf("Affected" to "This backup only.", "Your data" to "Settings are not changed. Other backups are kept.", "Backup" to "No.", "Can be undone" to "No."),
            onConfirm = { confirmDelete = null; s.delete(b) }, onDismiss = { confirmDelete = null },
        )
    }
    if (confirmRecover) ConfirmSheet(
        title = "Recover from the interrupted update", confirm = "Recover", summary = "Close the unfinished installation.",
        rows = listOf("What happens" to "Android's unfinished installer session (if any) is closed and the interrupted record is cleared. The app stays at ${s.installed.versionName}.",
            "Your data" to "Saved consoles and settings are not changed.", "Backup" to "A backup of your settings was made before the update started.",
            "Can be undone" to "Yes: install the update again.", "Result" to "Reported as recovered only after Android no longer lists the session."),
        onConfirm = { confirmRecover = false; s.recoverInterrupted() }, onDismiss = { confirmRecover = false },
    )
    s.cleanup?.let { c ->
        val sessions = s.leftoverSessions()
        if (c.remove.isEmpty() && sessions.isEmpty()) {
            AlertDialog(onDismissRequest = { s.cleanup = null }, title = { Text("Nothing to clean up") },
                text = { Text("There are no VantaFlow temporary files. Kept: ${c.keep.size}. Backups and settings are never removed.") },
                confirmButton = { TextButton({ s.cleanup = null }) { Text("OK") } })
        } else ConfirmSheet(
            title = "Clean up temporary files", confirm = "Clean up", destructive = true,
            summary = "Removes ${c.remove.size} APK cop${if (c.remove.size == 1) "y" else "ies"} VantaFlow made${if (sessions.isNotEmpty()) " and ${sessions.size} unfinished installer session${if (sessions.size == 1) "" else "s"}" else ""}. Only what is listed is removed.",
            rows = listOf("Will be removed" to (c.remove.map { "${it.file.name} (${it.size / 1024} KB)" } + sessions.map { "Installer session $it" }).joinToString("\n"),
                "Kept" to (c.keep.map { "${it.file.name} — ${it.reason}" } + "Backups — never removed by cleanup").joinToString("\n"),
                "Your data" to "Settings, saved consoles and backups are not touched.", "Backup" to "Not needed.", "Can be undone" to "No (they are not needed)."),
            onConfirm = s::runCleanup, onDismiss = { s.cleanup = null },
        )
    }
}
