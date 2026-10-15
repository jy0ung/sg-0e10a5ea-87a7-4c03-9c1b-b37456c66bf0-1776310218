# Server recovery capture — 15 October 2026

## Recovery boundary

**Supabase database records and Storage objects have not been recovered.**
The original Lexar SSD NQ100 failed with `/srv` I/O errors and was removed.
Docker failed on 7 October with `chmod /srv/docker: input/output error`.
Before replacement, no PostgreSQL server was running; the fallback
`/var/lib/docker/volumes` on the OS disk was only 28 KiB and contained no
`PG_VERSION` file. The owner subsequently authorized a **fresh, empty Dev/UAT
Supabase rebuild**. That rebuild is described below and does not recover the
original database or uploads.

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
- `root-configuration-complete.tar.zst.gpg`: the preferred privileged archive,
  including the configuration above plus root's entire home, older system
  backups, the old `50.bak`, and fallback Docker volume metadata. Local
  checksum/decryption/decompression/tar validation and a fresh Drive download
  SHA-256 comparison passed. No database dump or PostgreSQL data directory
  was found in the added material.
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
- `post-replacement-root-configuration.tar.zst.gpg`: the latest privileged
  configuration capture, taken after the new SSD was mounted and the rebuilt
  Supabase systemd service was activated. Use this for the new `/srv` UUID,
  Docker mount guard, and current host configuration. The earlier captures
  remain available for historical recovery.
- `replacement-supabase.tar.zst.gpg`: the fresh Dev/UAT PostgreSQL custom dump,
  roles, Storage volume archive, Supabase config/migrations/functions,
  rebuilt web bundles/configuration, deployment command and verification
  records. **This contains the new empty instance, not the old Lexar data.**
  `pg_restore` catalog and complete SQL decoding passed; no isolated restore
  drill is claimed. Both post-replacement archives passed local full archive
  validation and fresh Google Drive download SHA-256 comparison.
- `SHA256SUMS` and `RECOVERY-README.txt`: encrypted-file checksums and the
  capture's verification record. Read the final record in Drive for exact
  files, exclusions, and remaining gaps.

The larger user archive has 39 uploaded parts, all at their expected sizes.
Full local decryption/decompression/tar validation passed. Fresh Drive downloads
matched SHA-256 for all 39 parts. The compact configuration archives and the
expanded root capture are independently verified. No local sudo capture is
pending. Supabase database and Storage recovery remain incomplete.

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
gpg --decrypt root-configuration-complete.tar.zst.gpg | zstd -d | tar -tf -
mkdir -m 700 root-review user-review
gpg --decrypt root-configuration-complete.tar.zst.gpg | zstd -d | tar -xpf - -C root-review
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

## Replacement SSD and empty Dev/UAT rebuild

The owner ran `scripts/prepare-replacement-data-ssd.py --execute` locally
with sudo. The helper checked the exact disk serial, capacity, SMART status,
mounts, holders, and separation from Ubuntu's root/boot devices before writing.
Its completion marker prevents repeating the format.

- Replacement: Kingston SA400S3, serial `50026B72837E6C5E`, 960,197,124,096
  bytes. SMART passed and a filesystem write/read/fsync check passed.
- One GPT/ext4 partition, label `flc-data`, mounted read/write at `/srv`.
  UUID: `b0c7da3c-caeb-4669-a1ee-a3ac21cd901b`.
  Approximately 871 GiB was available immediately after preparation.
- The Ubuntu NVMe and its root, boot, and EFI partitions were preserved.
  The pre-cutover OS-disk `/srv` directory remains at
  `/srv.before-replacement-20261015T023420Z`.
- `/etc/fstab` uses the new UUID with
  `defaults,noatime,nofail,x-systemd.device-timeout=10s`. The Docker systemd
  drop-in requires `/srv/docker` and asserts `/srv` is a mount point, so an
  absent data SSD does not silently place new Docker data on the OS disk.
- Docker's root is `/srv/docker`; PostgreSQL and Storage volumes resolve
  beneath it. Existing container image content under `/var/lib/containerd`
  remains on the OS disk.

Live Supabase/SMTP and Cloudflare configuration and the existing Supabase
service/scripts matched the verified encrypted configuration backup. They
were retained. Supabase CLI 2.98.2 rebuilt project `rbmsbppvpgcrmtkdfahy` and
applied all 187 repository migrations; the database migration ledger matched
the filenames exactly. Auth users, profiles, customers, vehicles, deals and
Storage objects were all zero. The migrations created one default company.
No initial administrator has been provisioned.

The UBS, HRMS subpath and dedicated HRMS frontend bundles were rebuilt from
preserved source commit `c76143754aa75c2c3b477fd2452f63c76a320f7b` after
`npm ci --no-audit --no-fund`. The restored `flc-bi-uat` nginx container binds
`127.0.0.1:80` for the existing Cloudflare ingress and restarts with Docker.
Static files and nginx configuration are mounted read-only from
`/srv/web-releases/recovery-20261015-c761437`. The cached application image
`sha-85b0251` supplies the nginx runtime; the mounted bundles/configuration
supply the rebuilt application. API requests proxy to host port 54321.
The optional recovery worker was not restored; its nginx include is empty.

Verification completed:

- Normal `supabase stop` / `supabase start` passed with all startup health
  checks enabled. An earlier diagnostic start used `--ignore-health-check`;
  the successful normal restart supersedes that diagnostic result.
- Local and public UBS/HRMS gateway, Auth health, Edge runtime health and
  REST OpenAPI checks returned HTTP 200. REST was checked with the service
  role privately; the existing anonymous permission boundary was preserved.
- Headless Chromium rendered both public `/login` pages, including their
  password fields, with no uncaught page errors. This is page-render evidence;
  successful login/email/business workflows were not tested with an empty
  Auth database.

The owner ran the prepared `finish-ssd-rebuild.sh` with local sudo to activate
the service and capture the updated host configuration. Docker, Cloudflare
and `flc-bi-supabase.service` were verified active; the Supabase unit is enabled
and retains its original startup script and SMTP environment file. No reboot
test is claimed. The post-replacement archives above are verified point-in-time
captures; recurring database/Storage backups are not established by this work.

## Recover original records on a separate instance

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
