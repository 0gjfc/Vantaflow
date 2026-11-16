# Installation, backups, recovery and cleanup (Stage 5)

VantaFlow can install and update itself on the desktop, update the Android companion on the phone, and copy its PS4 package to a USB drive.

Every change follows the same five steps:

1. **Confirmation** that explains it.
2. **Automatic backup**, before anything is replaced.
3. **Journal entry**, so an interruption is found later.
4. **Verified result.** Success is reported only after the result is checked.
5. **Recovery** that never erases settings or profiles.

Cleanup removes only VantaFlow's own temporary files, and only after you have seen a preview.

**What has been verified and how:**

| Workflow | Status |
|---|---|
| Desktop install, update, repair, removal, restore, recovery, cleanup | **Implemented and tested** with real files in temporary folders, mock packages and real interruptions (a process is stopped mid-operation). Works in the desktop app through the local agent. |
| Android companion update | **Implemented and compiled**. The checks, confirmations, backups, recovery decisions and cleanup are **tested with a simulated installer** (Robolectric). **Not yet run on a phone**: Android's real PackageInstaller has not installed a VantaFlow update yet. |
| PS4 package | **Package check and USB copy implemented and tested** with mock packages and a folder standing in for the USB drive. **Installation on the PS4 is not done or verified by VantaFlow**; you do it on the console. **No VantaFlow PS4 package exists yet**. |

## 1. The confirmation screen

Before any installation, replacement, removal, restore, recovery or cleanup, VantaFlow shows:

| Field | Content |
|---|---|
| What happens | One sentence (e.g. "Update VantaFlow from 0.5.0 to 0.6.0."), and for installs the counts of files added, replaced, removed and unchanged |
| Package, platform, requirements | Identified package (name, version or content ID), the checks it passed, the target platform, and requirements (Node.js, disk space, GoldHEN, USB format…) |
| Files affected | The files or components that change (first five, then "and N more") |
| Your data | Whether settings, profiles, backgrounds or saved consoles could change |
| Backup | Whether a backup is made first |
| Can be undone | Whether and how it can be reversed |

**Destructive actions** need two presses of ✕ (or two taps), and the dialog starts with Cancel selected. Destructive actions are: replacing a version with an older one, removal, restoring over current settings or files, deleting a backup, cleanup, and removing incomplete installations.

Nothing is ever overwritten silently:

- An existing file on a USB drive is kept, and the new copy gets another name.
- A valid backup is never replaced.
- Settings are replaced only after a confirmed restore, and only after they have been backed up.

## 2. Desktop

### Where VantaFlow keeps its files

The data folder is set by `VANTAFLOW_DATA_DIR`. If it is not set, it is:

- **Linux:** `~/.local/share/vantaflow`
- **macOS:** `~/Library/Application Support/VantaFlow`
- **Windows:** `%APPDATA%\VantaFlow`

The page lists the exact folders.

```
packages/           you put packages here; VantaFlow only reads them
app/                the installed VantaFlow desktop app
installation.json   installed version and the SHA-256 of every installed file
journal.json        the operation in progress, or the last one
backups/<id>/       complete, verified backups (kept apart from the app)
backups/.incomplete-<id>/   a backup being written; never restorable
tmp/<name>/         VantaFlow's temporary folders, each with a .vantaflow-temp marker
```

Your settings (both console profiles, the account, appearance, custom backgrounds, favourites, saved consoles) live in the browser's storage, not in these folders. Installation never touches them. Backups copy them.

### Desktop packages (`.vfpkg`)

A desktop package is a gzip-compressed JSON file. It holds a manifest (`id`, `name`, `version`, `platform`, `requires.node`, `created`) and every file with its size, SHA-256 and contents. To build one from this folder:

```bash
node tools/build-package.mjs 0.5.0            # → vantaflow-0.5.0.vfpkg (refuses to overwrite)
```

Before installing, VantaFlow checks:

- that the file exists, is a regular file and is not too large;
- that it decompresses and is in the expected format;
- that it is **VantaFlow's own package** (`app.vantaflow.desktop`, from `shared/packages.json`) and is for the **desktop** platform;
- that the version is valid;
- that the Node.js requirement is met;
- that no path is absolute, uses `..` or appears twice;
- that each file's size and checksum match;
- that the required parts are present (`index.html`, `js/main.js`, `desktop/server.mjs`).

Each check that fails gives a specific message. The package is checked again right before installing, in case the file changed.

### Installation and update (`desktop/setup/installer.mjs`)

| Situation | What VantaFlow offers |
|---|---|
| Nothing installed | **Install** |
| Newer version | **Update** |
| Same version, files intact | Nothing: "already installed". Repeated installations are prevented |
| Same version, files missing or changed | **Repair** |
| Older version | **Replace** (destructive, warned) |
| An earlier operation was interrupted | Nothing until Recovery has handled it |

Steps (each one is written to `journal.json` first):

1. Check the package again.
2. **Back up** the installed app files and your settings, then verify the backup.
3. Write the new files to a staging folder in `tmp/`.
4. Verify every staged file.
5. Move the old app aside, then move the staged app into place (folder renames).
6. Record what was installed.
7. **Verify every installed file**.

Progress is shown for each step. If any step fails, VantaFlow puts the previous version back, verifies it and reports the outcome, e.g. "The previous version (0.6.0) is in place and verified."

After an update of the app that is running, VantaFlow says to restart it. The running process keeps the old code until then.

**Removal** backs up the app and settings first, removes `app/` and the record, and checks that they are gone. Settings, backups and packages are kept, and removal can be undone from its backup.

### Backups (`desktop/setup/backups.mjs`)

```
backups/<id>/manifest.json   { format: "vantaflow-backup", formatVersion: 1, id, createdAt, description, reason,
                               platform, appVersion, contains: { settings, app, settingsEntries },
                               files: [{ path, size, sha256 }] }
backups/<id>/settings.json   { format: "vantaflow-settings", keys: { "vantaflow.…": "<stored text>" } }
backups/<id>/app/…           copy of the installed app (when there was one)
```

- **Automatic backups** are made before every install, update, repair, removal, restore and "Reset all settings". You can also choose **Back up settings now**.
- A backup is written to `.incomplete-<id>/`, verified, then renamed. So an interrupted backup is listed as **Incomplete**, can never be restored, and can never replace a valid one. Each backup gets a new id; nothing is ever overwritten.
- **Integrity check before every restore.** The manifest must be readable, every file must be present with the right size and checksum, and the settings must be readable VantaFlow entries. Otherwise the backup is **Damaged**: it is listed with its problems, never restored, and never offered for recovery.
- **Restoring settings:**
  1. VantaFlow backs up the current settings.
  2. It writes the backed-up entries.
  3. It reads every entry back and compares it with the backup.
  4. If anything differs (for example, storage is full), the previous settings are put back and the restore is reported as failed.
  5. If everything matches, VantaFlow reloads to use the restored settings.
- **Restoring app files** is staged, swapped and verified like an installation, and the current files are backed up first.
- **Deleting** a backup is never part of cleanup. It needs its own destructive confirmation.

### Recovery (`diagnose` / `recover`)

At every visit, the page checks two things:

- **An interrupted operation:** `journal.json` says "running".
- **Missing or changed app files:** every installed file is compared with `installation.json`.

The options depend on what is still there:

| Found | Options |
|---|---|
| Update stopped after the old app was moved aside | **Put the previous version back** (it was kept in `tmp/`), or **Restore the most recent valid backup** |
| Update stopped before anything was replaced, or after the new version was recorded | **Keep what is installed**, offered only when every file verifies |
| First installation stopped halfway | **Remove the incomplete installation** (destructive). Settings, backups and packages are untouched |
| Installed files missing or changed | **Restore the most recent valid backup**, or **Repair from a package** |
| PS4 copy stopped halfway | **Remove the unfinished copy**: only the `.vantaflow-partial` file VantaFlow was writing |

After recovery, VantaFlow checks the files again. "Recovered" is reported only when they verify. Otherwise it reports a clear failure: damaged backups are not offered, and an option that is not available is refused. Recovery never erases settings or profiles.

### Cleanup (`desktop/setup/cleanup.mjs`)

**Removed**, and only these:

- folders in `tmp/` that have a valid VantaFlow marker and do not belong to an unfinished operation;
- leftovers of interrupted atomic writes (`journal.json.<pid>.writing`);
- the unfinished PS4 copy recorded by a failed copy.

**Kept, with the reason shown:**

- anything without a marker, or with an unknown purpose;
- links (they are not followed);
- loose files;
- `backups/`, `packages/` and `app/`;
- browser settings.

The cleanup screen lists what will be removed and what is kept. The confirmed request carries a token for exactly that list. If anything changed in between, **nothing** is removed and a new preview is needed. Afterwards VantaFlow reports what was removed, what was kept, and anything it could not remove.

### How it runs

The page (`js/sections/setup.js`, opened from **Settings → System → Install, backups & recovery…**) talks to the local agent (`desktop/setup/api.mjs`). Each operation that changes files runs in its own process (`desktop/setup/run.mjs`), so a crash stops only that process and leaves the journal for Recovery.

The agent accepts a change only when the request carries `confirmed: true`. That flag is sent only after the confirmation screen. Packages are referred to by their name in `packages/`, never by an arbitrary path.

The same runner works from the command line, for example:

```bash
echo '{"file":"…/packages/vantaflow-0.6.0.vfpkg","confirmed":true}' | node desktop/setup/run.mjs install
```

## 3. Android companion

**Updating the companion** (Install & recovery → **Install update from APK file…**):

1. **Choosing the file.** You pick the APK with Android's file picker, which needs no storage permission. VantaFlow copies it into its own folder (`cache/install/vf-<id>.apk`) and reads it with `PackageManager`.
2. **Checks.** The APK must:
   - be the VantaFlow companion (`app.vantaflow.companion`);
   - be signed with **the same key** as the installed app;
   - be a **newer** version;
   - fit the phone's Android version.

   A different key or an older version is refused. The only way around either is uninstalling, which deletes the app's data, so VantaFlow does not offer it. The same version is refused as "already installed". An unreadable file is refused.
3. **Confirmation** with all the fields above, including the permission explanation.
4. **Permission.** If Android does not yet allow VantaFlow to "Install unknown apps", a dialog explains why and opens that setting. VantaFlow declares only `REQUEST_INSTALL_PACKAGES` for this, and uses it only for its own updates, each one confirmed. It requests nothing silently.
5. **Before installing.** VantaFlow backs up its settings (saved consoles, active console) and writes a journal entry. Then it hands the APK to Android's `PackageInstaller` with `USER_ACTION_REQUIRED`, so **Android always shows its own confirmation**.
6. **Results:**
   - **Cancelled** in Android's dialog: "nothing was changed".
   - **Failed** (blocked, conflict, incompatible, invalid, storage): the reason is shown, and the app and settings are unchanged.
   - **Success:** reported **only when Android reports the new version code**.
7. **Interrupted.** Android replaces the running app during a self-update, so the outcome may only be known at the next start. VantaFlow then compares the version with the journal:
   - if the version is now the new one, it shows "Update finished — verified";
   - if not, it shows "An update did not finish", with **Recover**. Recover closes Android's unfinished session and the record. Settings are not touched.

**Data during updates:** Android keeps an app's data when the same app, signed with the same key, is updated. The settings backup is an extra safety net, restorable from the same screen.

**Backups:** the same manifest format as the desktop (`platform: "android"`), stored in the app's private storage. They are verified, can be listed, are restored only when valid, and are read back after a restore. Damaged and incomplete backups are never restored. Note that Android deletes private storage when the app is uninstalled.

**Cleanup:**

- **Removed:** only `vf-*.apk` copies VantaFlow made that no installation still needs, and unfinished installer sessions owned by VantaFlow.
- **Kept:** other files, backups and settings.
- The cleanup screen lists what will be removed and kept, and a token check makes sure only that list is removed.

## 4. PS4 package (USB)

VantaFlow's role on the PS4 is limited to what it can do safely and check itself:

1. **Identify and check the package** (header only, read-only, big-endian). The layout comes from [LibOrbisPkg `PkgReader.ReadHeader`](https://github.com/maxton/LibOrbisPkg/blob/master/LibOrbisPkg/PKG/PkgReader.cs):

   | Offset | Field | Check |
   |---|---|---|
   | `0x00` | magic | Must be `\x7FCNT` |
   | `0x40` | content ID (36 characters) | Format `^[A-Z]{2}[0-9]{4}-[A-Z]{4}[0-9]{5}_00-[A-Z0-9]{16}$` (from LibOrbisPkg's GP4 validator) |
   | `0x70` | DRM type | Read |
   | `0x74` | content type | Must be `0x1A` (application) |
   | `0x430` | package size | Must equal the file size; otherwise the package is incomplete or damaged |

   The package must be **VantaFlow's own** (content ID `IV0000-VNTF00001_00-VANTAFLOWPS40000`, from `shared/packages.json`); other packages are refused. The package body is never opened or decrypted.
2. **Explain the prerequisites:**
   - a PS4 with GoldHEN running (its Debug Settings provide the Package Installer, per the [GoldHEN README](https://github.com/GoldHEN/GoldHEN) feature list);
   - a FAT32 or exFAT USB drive;
   - enough free space.
3. **Copy it to the USB folder you choose.** VantaFlow:
   - checks that the folder exists, is writable, is not inside VantaFlow's data, and has enough free space;
   - never replaces a file (a different file with the same name is kept, and the copy becomes `VantaFlow (2).pkg`);
   - refuses to copy the same package twice;
   - writes to `<name>.vantaflow-partial`, checks the SHA-256, renames, and checks again.

   If the copy fails, the partial file is removed. If it is interrupted, Recovery offers to remove it.
4. **Say exactly what is not verified.** The result reads "on the drive and verified … NOT installed yet". You install it on the PS4 (Settings → Debug Settings → Game → Package Installer). VantaFlow cannot see whether that worked and never claims it did.

The PS4 itself is not changed by VantaFlow, so Stage 3's console-operation gate (compatibility must be Compatible) does not apply. The copy is a local file operation. Existing VantaFlow data on the console is not touched by the copy. Whether the Package Installer keeps app data during an update is not verified.

**Not implemented:**

- sending the package to the console over the network (for example GoldHEN's Remote Package Install), which would be live console integration;
- exploit delivery, firmware modification, security bypass, payload execution.

**No VantaFlow PS4 package exists yet.** Building one needs a PS4 homebrew toolchain and is not part of this stage. The workflow is tested with mock packages that carry the reserved content ID.

## 5. Tests: simulated vs device

| Suite | Kind | Checks | Covers |
|---|---|---|---|
| `tests/install.test.mjs` | **Simulated** (temporary folders, mock packages; interruptions are real process stops) | 132 | Successful, cancelled (unconfirmed), failed (every step, with rollback) and interrupted (5 stop points + first install) installations; existing installation and repeated install; repair; downgrade; package validation (damaged, other app, Node.js version, path traversal, tampered file, missing parts); backup creation, integrity, restoration, corruption, interrupted backups never replacing valid ones; recovery after failed updates and missing files; removal; cleanup preview, confirmation token, user files, links, unfinished operations; preservation of settings and profiles; PS4 package checks, USB copy, duplicates, name clashes, failed and interrupted copies |
| `tests/ui-setup.cjs` | **Simulated**, real browser and agent | 15 | The desktop screens end to end: open from Settings (navigation unchanged), install confirmation and cancel, progress and verified install, repeated install prevented, update, failed update with rollback, interrupted update and recovery, back up and restore settings (two presses, read back, reload), damaged backup, cleanup preview, cancel and confirm, PS4 USB copy, removal, reset with backup, no agent |
| `android/core` `SetupTest` | **Simulated** (JVM) | 6 | Backups (valid, damaged, incomplete, unchanged valid ones), verified settings restore with rollback, APK checks, journal decisions, cleanup |
| `android/app` `SetupScreenTest` | **Simulated installer** (Robolectric) | 9 | Successful update verified by version (settings kept, backup made), cancel before install, cancel in Android's dialog, failure, wrong packages refused, permission explained, interrupted update recovered, update finished while closed, backup and restore, damaged backup, cleanup |
| **Desktop install on a real computer** | Real | — | The same code paths as the simulated tests, on this development machine only (Linux). Not run on Windows or macOS |
| **Android install on a phone** | Device | **0** | Pending: install an older debug build, then update it from a newer APK (see §6) |
| **PS4 installation** | Console | **0** | Pending: no VantaFlow PS4 package exists |

## 6. Still to verify on real devices

1. **Windows and macOS:**
   - data folder location;
   - folder renames while files are in use, especially Windows with a running VantaFlow;
   - the USB folder path.
2. **Android, on a phone:**
   - "Install unknown apps" flow;
   - Android's confirmation;
   - self-update with the process being replaced;
   - result after restart;
   - cancel in Android's dialog;
   - an APK signed with another key (expect refusal before Android);
   - `getPackageArchiveInfo` returning signing certificates (needs Android 9+; on some versions it needs the source-path fix in `AndroidInstaller.inspect`).
3. **PS4:** once a VantaFlow PS4 package exists:
   - USB copy, then Debug Settings → Package Installer;
   - update over an installed version (app data kept?).

## 7. Status categories

| Category | Items |
|---|---|
| Implemented and tested (simulated) | Desktop install, update, repair, downgrade warning, removal, backups, restore, recovery, cleanup, PS4 check and USB copy; Android checks, backups, restore, recovery decisions, cleanup |
| Implemented, not tested on a device | Android `PackageInstaller` installation; desktop on Windows and macOS |
| Not done by VantaFlow (by design) | Installing the PKG on the PS4 (you do it with GoldHEN's Package Installer); network delivery to the console |
| Does not exist yet | A VantaFlow PS4 package |
