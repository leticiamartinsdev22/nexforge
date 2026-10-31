#!/usr/bin/env bash
set -Eeuo pipefail

python3 - <<'PY'
import json
import os
import platform
import shutil
import socket
import time

def cpu_sample():
    with open('/proc/stat', encoding='utf-8') as stream:
        values = list(map(int, stream.readline().split()[1:]))
    return sum(values), values[3] + (values[4] if len(values) > 4 else 0)

total_before, idle_before = cpu_sample()
time.sleep(0.25)
total_after, idle_after = cpu_sample()
total_delta = max(total_after - total_before, 1)
cpu = round(max(0.0, min(100.0, 100 * (1 - (idle_after - idle_before) / total_delta))), 1)

memory = {}
with open('/proc/meminfo', encoding='utf-8') as stream:
    for line in stream:
        key, value = line.split(':', 1)
        memory[key] = int(value.strip().split()[0]) * 1024
ram_total = memory['MemTotal']
ram_available = memory.get('MemAvailable', memory.get('MemFree', 0))
ram_used = max(0, ram_total - ram_available)
ram = round(ram_used * 100 / ram_total, 1) if ram_total else 0

disk = shutil.disk_usage('/')
disk_percent = round(disk.used * 100 / disk.total, 1) if disk.total else 0

network = {'rx': 0, 'tx': 0}
with open('/proc/net/dev', encoding='utf-8') as stream:
    for line in list(stream)[2:]:
        interface, counters = line.split(':', 1)
        if interface.strip() == 'lo':
            continue
        values = list(map(int, counters.split()))
        network['rx'] += values[0]
        network['tx'] += values[8]

state_path = '/tmp/nexforge-wsl-network.json'
now = time.time()
net_mbs = 0.0
try:
    with open(state_path, encoding='utf-8') as stream:
        previous = json.load(stream)
    elapsed = max(now - previous['time'], 0.1)
    byte_delta = max(0, network['rx'] - previous['rx']) + max(0, network['tx'] - previous['tx'])
    net_mbs = round(byte_delta / elapsed / 1_000_000, 2)
except (OSError, ValueError, KeyError, TypeError):
    pass
try:
    with open(state_path, 'w', encoding='utf-8') as stream:
        json.dump({'time': now, **network}, stream)
except OSError:
    pass

try:
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.connect(('1.1.1.1', 80))
    ip = sock.getsockname()[0]
    sock.close()
except OSError:
    ip = '—'

with open('/proc/uptime', encoding='utf-8') as stream:
    uptime_seconds = float(stream.read().split()[0])
uptime_days = int(uptime_seconds // 86400)
hours = int((uptime_seconds % 86400) // 3600)
minutes = int((uptime_seconds % 3600) // 60)
os_info = platform.freedesktop_os_release()
ram_used_gb = ram_used / 1_000_000_000
ram_total_gb = ram_total / 1_000_000_000
disk_used_gb = disk.used / 1_000_000_000
disk_total_gb = disk.total / 1_000_000_000

payload = {
    'generatedAt': time.strftime('%Y-%m-%dT%H:%M:%S+00:00', time.gmtime(now)),
    'name': socket.gethostname(),
    'ip': ip,
    'os': os_info.get('PRETTY_NAME', 'Ubuntu Linux'),
    'cpu': cpu,
    'ram': ram,
    'disk': disk_percent,
    'vcpu': os.cpu_count() or 1,
    'load': os.getloadavg()[0] if hasattr(os, 'getloadavg') else 0,
    'ramUsed': f'{ram_used_gb:.1f}',
    'ramTotal': f'{ram_total_gb:.1f}',
    'diskUsed': f'{disk_used_gb:.1f}',
    'diskTotal': f'{disk_total_gb:.1f}',
    'uptime': f'{uptime_days}d {hours}h',
    'uptimeFull': f'{uptime_days}d {hours}h {minutes}m',
    'uptimeDays': uptime_days,
    'netMBs': net_mbs,
    'pendingReboot': os.path.exists('/var/run/reboot-required'),
    'bootAt': int((now - uptime_seconds) * 1000),
    'source': 'Ubuntu WSL host',
}
print(json.dumps(payload, separators=(',', ':')))
PY
