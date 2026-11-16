# Safety, reliability and recovery

> **Stage 5:** installation, backups, the operation journal, recovery and cleanup for VantaFlow's own files are implemented. See [installation.md](installation.md). VantaFlow still changes nothing on a console. The PS4 workflow only copies VantaFlow's own package to a USB drive; you install it on the console.

## Stage 3 boundaries (kept)

VantaFlow does not modify a console. There is no code for exploits, firmware exploitation, payload execution, authentication or DRM bypass, unauthorised access, firmware or protected-file changes, package (PKG/APK) installation, Y2JB, or automatic updates and downgrades. Detection is mock-only; every console value shown is demonstration data and labelled as such.

## Rules for any future console operation

A later stage may add operations that change something on a console (for example, copying a VantaFlow theme file). Each such operation must pass all of these gates, in order:

1. **Compatibility gate.** The active console's compatibility result must be **Compatible** for that operation. Unknown, Unsupported, Partially compatible (unless the operation is listed as supported there) and Not detected all block it.
2. **Documented method.** The operation must use a method documented by the homebrew project (GoldHEN, etaHEN) or by Sony, cited in `docs/`. No undocumented system-file changes.
3. **Explicit authorisation.** A confirmation dialog that names the console, its firmware, what will change, and how to undo it. One confirmation covers one operation on one console; it is never remembered as blanket permission.
4. **Dry run first.** Show exactly which files or settings would change before doing anything.
5. **Backup before change.** Copy anything that will be overwritten to the console's USB/backup location or the PC first, and verify the copy.
6. **Small, reversible steps.** One change at a time, each with a recorded undo step.

## Error handling design

Errors use the shared `ErrorInfo` model: `code`, `message`, `recoverable`, `action`, `at`.

| Code | Where | What the user sees | Recovery |
|---|---|---|---|
| `timeout` | detection | "No answer within N s." | Detect again; check power and network |
| `not-found` | detection | Console no longer listed | Refresh the list |
| `detection-failed` | detection | Provider error message | Detect again |
| `component-missing` (reason) | compatibility | Detection inconsistent with the release's needs | Re-detect; check the environment loaded correctly |
| `version-unknown` (reason) | compatibility | Environment version not researched | Update the researched data (new release) |
| future: `operation-blocked` | operations | Compatibility gate refused | Shows which check failed |
| future: `operation-failed` | operations | Step N failed | Automatic undo of completed steps, then show the backup location |

Principles: a failure never leaves the app in a broken state (detection failures become **Not detected** results), every error says what to do next, and errors are kept in the result so they can be reported from the desktop and Android apps.

## Recovery plan for future operations

- **Operation journal.** Before each step, write `{ console, step, backupPath, undo }` to a local journal. On restart after a crash, VantaFlow reads the journal and offers to finish the undo.
- **Restore from backup.** A "Restore" action lists backups by console and date and restores them with the same gates as any other operation.
- **Safe defaults.** If VantaFlow's own settings or files are unreadable, it falls back to defaults (already true for settings: invalid stored values are dropped by `sanitize()`).
- **No silent retries** of operations that change a console.
