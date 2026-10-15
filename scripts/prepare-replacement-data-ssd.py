#!/usr/bin/env python3
"""Prepare the specifically authorized Kingston replacement SSD on flc-ubs.

Run as root with --check first, then --execute. This is host-specific: it
refuses any other serial/size, mounted device, or Ubuntu boot/root device.
It does not start Supabase or restore business records.
"""

import argparse
import datetime
import json
import os
from pathlib import Path
import shutil
import subprocess
import time


DEVICE = Path('/dev/disk/by-id/ata-KINGSTON_SA400S37960G_50026B72837E6C5E')
SERIAL = '50026B72837E6C5E'
SIZE = 960197124096
OUTPUT = Path('/home/flitadmin/recovery-backups/2026-10-15/replacement-ssd')
OLD_UUID = '36aad22b-1776-4a8c-bc8a-bdd90e3f5150'
OWNER = (1000, 1000)


def run(*args, **kwargs):
    return subprocess.run(args, check=True, text=True, **kwargs)


def capture(*args):
    return subprocess.check_output(args, text=True).strip()


def save(name, value):
    target = OUTPUT / name
    target.write_text(json.dumps(value, indent=2) + '\n')
    target.chmod(0o600)
    os.chown(target, *OWNER)


def flatten(row):
    yield row
    for child in row.get('children', []):
        yield from flatten(child)


def check():
    disk = DEVICE.resolve(strict=True)
    data = json.loads(capture('lsblk', '--bytes', '--json', '--output',
                              'NAME,PATH,SIZE,TYPE,FSTYPE,MOUNTPOINTS,MODEL,SERIAL', str(disk)))
    row = data['blockdevices'][0]
    assert row['type'] == 'disk', 'Target is not a whole disk'
    assert row['serial'] == SERIAL and row['size'] == SIZE, 'Device identity changed'
    assert row['model'].strip() == 'KINGSTON SA400S3', 'Unexpected device model'
    for item in flatten(row):
        assert not any(item.get('mountpoints') or []), f"Mounted target: {item['path']}"
        holders = Path('/sys/class/block') / item['name'] / 'holders'
        assert not list(holders.iterdir()), f"Device has active holders: {item['path']}"
    for mount in ['/', '/boot', '/boot/efi']:
        source = capture('findmnt', '--noheadings', '--output', 'SOURCE', '--target', mount)
        ancestors = capture('lsblk', '--inverse', '--noheadings', '--raw', '--output', 'PATH', source).splitlines()
        assert str(disk) not in ancestors, f'Target backs {mount}'
    swaps = Path('/proc/swaps').read_text().splitlines()[1:]
    assert all(not line.split()[0].startswith(str(disk)) for line in swaps), 'Target has active swap'
    assert not os.path.ismount('/srv'), '/srv is already mounted; do not reformat'
    fstab = Path('/etc/fstab').read_text()
    srv_lines = [line for line in fstab.splitlines() if not line.lstrip().startswith('#')
                 and len(line.split()) >= 2 and line.split()[1] == '/srv']
    assert len(srv_lines) == 1 and srv_lines[0].split()[0] == 'UUID=' + OLD_UUID, 'Unexpected /srv fstab entry'
    smart = subprocess.run(['smartctl', '--health', '--attributes', '--json', str(disk)],
                           capture_output=True, text=True)
    health = json.loads(smart.stdout)
    assert health.get('smart_status', {}).get('passed') is True, 'SSD SMART health is not passing'
    save('smart-before.json', health)
    save('preflight.json', {'device': str(disk), 'serial': SERIAL, 'bytes': SIZE,
                            'layout_before': data, 'smart_passed': True})
    print(f'Validated Kingston {SERIAL}: {SIZE} bytes, unmounted, SMART passed.', flush=True)
    return disk


def main():
    if not __debug__:
        raise SystemExit('Refusing optimized Python: disk safety assertions must be enabled')
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--execute', action='store_true')
    args = parser.parse_args()
    assert os.geteuid() == 0, 'Run through an authorized root session'
    assert args.check != args.execute, 'Select --check or --execute'
    OUTPUT.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chown(OUTPUT, *OWNER)
    completed = OUTPUT / 'completed.json'
    if completed.exists():
        previous = json.loads(completed.read_text())
        assert capture('findmnt', '--noheadings', '--output', 'UUID', '--target', '/srv') == previous['uuid']
        print('This SSD is already prepared; no formatting repeated.', flush=True)
        return
    disk = check()
    if args.check:
        return
    assert not (OUTPUT / 'started.json').exists(), 'Prior execution started; inspect state before resuming'
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    save('started.json', {'device': str(disk), 'serial': SERIAL, 'started_utc': stamp})
    (OUTPUT / 'partition-table-before.txt').write_text(capture('sfdisk', '--dump', str(disk)) + '\n')
    shutil.copy2('/etc/fstab', OUTPUT / 'fstab.before')
    run('dd', 'if=' + str(disk), 'of=' + str(OUTPUT / 'partition-header-before.bin'),
        'bs=1M', 'count=4', 'status=none')
    for item in OUTPUT.iterdir():
        item.chmod(0o600)
        os.chown(item, *OWNER)

    # The user explicitly authorized formatting this replacement SSD.
    run('parted', '--script', '--align', 'optimal', str(disk), 'mklabel', 'gpt',
        'mkpart', 'primary', 'ext4', '1MiB', '100%')
    run('udevadm', 'settle')
    partition = Path(str(DEVICE) + '-part1')
    for _ in range(20):
        if partition.exists():
            break
        time.sleep(0.2)
    assert partition.exists(), 'New partition did not appear'
    assert capture('lsblk', '--noheadings', '--output', 'PKNAME', str(partition)) == disk.name
    run('wipefs', '--all', str(partition))
    run('mkfs.ext4', '-L', 'flc-data', '-m', '1', str(partition))
    uuid = capture('blkid', '-s', 'UUID', '-o', 'value', str(partition))
    assert uuid and capture('blkid', '-s', 'TYPE', '-o', 'value', str(partition)) == 'ext4'
    temporary_mount = Path('/mnt/flc-replacement-ssd-20261015')
    temporary_mount.mkdir(mode=0o755, exist_ok=True)
    assert not os.path.ismount(temporary_mount) and not list(temporary_mount.iterdir())
    run('mount', '-t', 'ext4', 'UUID=' + uuid, str(temporary_mount))
    probe = temporary_mount / '.write-verification'
    probe.write_text('Kingston replacement write verification\n')
    with probe.open('r+') as handle:
        os.fsync(handle.fileno())
    assert probe.read_text() == 'Kingston replacement write verification\n'
    probe.unlink()
    save('formatted.json', {'uuid': uuid, 'partition': str(partition), 'filesystem': 'ext4'})

    # Cut over only after formatting, mounting, and writing to the new SSD work.
    run('systemctl', 'stop', 'flc-bi-supabase.service')
    run('systemctl', 'stop', 'docker.socket', 'docker.service')
    mounts = [line.split()[4] for line in Path('/proc/self/mountinfo').read_text().splitlines()]
    assert not any(mount.startswith('/srv/') for mount in mounts), 'Active mount beneath old /srv'
    run('rsync', '-aHAXx', '--numeric-ids', '/srv/', str(temporary_mount) + '/')
    save('copied.json', {'uuid': uuid, 'source': '/srv', 'copy': str(temporary_mount)})
    previous_srv = Path('/srv.before-replacement-' + stamp)
    assert not previous_srv.exists()
    Path('/srv').rename(previous_srv)
    Path('/srv').mkdir(mode=0o755)
    run('umount', str(temporary_mount))
    temporary_mount.rmdir()
    lines = Path('/etc/fstab').read_text().splitlines()
    lines = [f'UUID={uuid} /srv ext4 defaults,noatime,nofail,x-systemd.device-timeout=10s 0 2'
             if not line.lstrip().startswith('#') and len(line.split()) >= 2 and line.split()[1] == '/srv'
             else line for line in lines]
    Path('/etc/fstab').write_text('\n'.join(lines) + '\n')
    dropin = Path('/etc/systemd/system/docker.service.d/10-data-disk.conf')
    dropin.parent.mkdir(parents=True, exist_ok=True)
    dropin.write_text('[Unit]\nRequiresMountsFor=/srv/docker\nAssertPathIsMountPoint=/srv\n')
    run('systemctl', 'daemon-reload')
    run('mount', '/srv')
    assert capture('findmnt', '--noheadings', '--output', 'UUID', '--target', '/srv') == uuid
    run('findmnt', '--verify', '--verbose')
    run('systemctl', 'reset-failed', 'docker.service', 'flc-bi-supabase.service')
    run('systemctl', 'start', 'docker.service')
    assert capture('docker', 'info', '--format', '{{.DockerRootDir}}') == '/srv/docker'
    save('completed.json', {'device': str(disk), 'serial': SERIAL, 'bytes': SIZE,
                            'partition': str(partition), 'uuid': uuid, 'filesystem': 'ext4',
                            'mount': '/srv', 'preserved_os_disk_copy': str(previous_srv),
                            'docker_active': True, 'supabase_started': False})
    print('SSD prepared and mounted at /srv; Docker is active. Supabase remains stopped.', flush=True)


if __name__ == '__main__':
    main()
