# Server recovery capture — 15 October 2026

## Recovery boundary

**Supabase database records and Storage objects have not been recovered.**
The Lexar SSD NQ100 (`/dev/sda`, approximately 894 GiB) is unavailable; its
`/srv` filesystem is not mounted. Docker's configured data root is
`/srv/docker`. Docker failed on 7 October with
`chmod /srv/docker: input/output error`. No PostgreSQL server is running.
The fallback `/var/lib/docker/volumes` on the OS disk is only 28 KiB and
contains no `PG_VERSION` file. Do not treat an empty reinstall as recovery.

The GitHub Database Backup workflow returned no successful runs when queried
on 15 October. No database backup artifacts were returned, and searches for
`supabase` and `flc-bi` in the connected Google Drive returned no files.
These checks do not establish that no other backup exists.

Keep the old SSD intact until the database and uploaded files are recovered
or a usable independent backup is located. Do not format it or run repairs
against the original. Replacing the OS disk also requires the separate
configuration backup described below.

## Backup location and contents

Google Drive folder:
<https://drive.google.com/drive/folders/1KQrC5M8i_Dcxs9cwjkWUIJJrpfQX7lK5>

Local staging: `/home/flitadmin/recovery-backups/2026-10-15`.
Only the Google Drive copy survives replacing the OS disk.

- `root-configuration.tar.zst.gpg`: `/etc`, custom `/usr/local/bin` and
  `/usr/local/sbin` files, cron configuration, deployment account files,
  root SSH authorization, and privileged inventory. This includes the
  Supabase environment file, Cloudflare credentials/configuration, SSH host
  keys, network configuration, and the Supabase service startup scripts.
  It is a configuration backup, not a database backup.
- `user-home.tar.zst.gpg` or its numbered chunks: project and Git metadata,
  ignored local configuration, SSH and Cloudflare user credentials,
  developer settings, custom skills, agent history/memories, local evidence,
  and consistent snapshots of local SQLite application databases.
  Reinstallable dependencies, editor binaries/extensions, browser test
  profiles, caches, and the backup directory itself are excluded.
- `essential-user-configuration.tar.zst.gpg`: a separate compact copy of user
  SSH/Cloudflare/Supabase configuration, authentication files, Git settings,
  custom skills, and developer settings. It passed local archive validation
  and a fresh Drive download SHA-256 comparison, as did the root configuration
  archive.
- `SHA256SUMS` and `RECOVERY-README.txt`: encrypted-file checksums and the
  capture's verification record. Read the final record in Drive for exact
  files, exclusions, and remaining gaps.

The larger user archive has 39 uploaded parts, all at their expected sizes.
Full local decryption/decompression/tar validation passed. Fresh downloads
matched SHA-256 for 27 parts; the other 12 encountered proxy read timeouts, so
full remote readback verification remains incomplete. The two compact
configuration archives above are independently verified. The expanded capture
of root's entire home and older system backups still requires local sudo and
has not yet been received; this is recorded in the Drive recovery README.

The randomly generated encryption passphrase is in `RECOVERY-KEY.txt` in
local staging and is supplied separately to the owner. **It is deliberately
absent from Git and Google Drive. Save it in a password manager on another
device before replacing the disk.**

Unfinished work from two detached worktrees was committed separately to:

- `backup/disk-replacement-2026-10-15/sb-baseline` (`73891bd`).
- `backup/disk-replacement-2026-10-15/sb-source-control` (`caa9cff`).

All existing local branches were pushed without force or merging unfinished
work into `main`. The existing stash changes only the Supabase CLI version
cache; the private archive and Git bundle preserve it. These are preservation
commits; they do not establish new browser or production validation.

## Verify and open the backup

On the replacement host, install `gnupg`, `zstd`, and `tar`, download every
file from the Drive folder into one private directory, and verify checksums:

```bash
sha256sum -c SHA256SUMS
```

If the user archive is split, join the parts in filename order first:

```bash
cat user-home.tar.zst.gpg.part-* > user-home.tar.zst.gpg
```

Use an interactive GPG prompt for the separately saved passphrase. First list
the contents, then extract into a private review directory:

```bash
gpg --decrypt root-configuration.tar.zst.gpg | zstd -d | tar -tf -
mkdir -m 700 root-review user-review
gpg --decrypt root-configuration.tar.zst.gpg | zstd -d | tar -xpf - -C root-review
gpg --decrypt user-home.tar.zst.gpg | zstd -d | tar -xpf - -C user-review
```

Review and selectively restore configuration. Do not copy the old `fstab`,
network configuration, account databases, or SSH daemon configuration over a
new installation wholesale. New disk UUIDs and network interfaces can differ.
Preserve file ownership and restrictive permissions when restoring secrets.
The backup's inventory records installed package and tool versions.

The code can also be cloned directly:

```bash
git clone https://github.com/jy0ung/sg-0e10a5ea-87a7-4c03-9c1b-b37456c66bf0-1776310218.git
```

The encrypted user archive includes a separate `repository.bundle` and a
manifest of local branches, worktrees, and stashes. Raw Git/worktree metadata
retains the original absolute paths; restore to the same paths or recreate
worktrees from their saved branches.

## Bring services back only after data recovery

1. Reinstall the OS and required versions of Docker, Node/npm, Supabase CLI,
   and cloudflared from the captured inventory.
2. Review the preserved service scripts and restore the Supabase environment,
   Cloudflare tunnel configuration/credentials, and SSH access.
3. Recover or locate the PostgreSQL data and Storage files from the old disk.
   Restore a physical PostgreSQL copy with the matching major version and
   required extensions, or use a verified logical dump with its roles.
   Replaying Git migrations alone does not restore business or Auth records.
4. Validate the recovered database, migration ledger, Auth users, Storage
   metadata and actual objects, Edge Functions, and application behavior in
   isolation before reconnecting public traffic.
5. Establish an encrypted off-host database and Storage backup, then perform
   a restore drill before treating the recovered service as protected.

`scripts/collect-host-recovery-config.sh` was used with local sudo to capture
the privileged configuration. It does not mount or repair disks and does not
start or stop services.
