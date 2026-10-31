#!/usr/bin/env bash
set -Eeuo pipefail

action_dir=${1:?informe o diretório compartilhado de ações}
request_file="$action_dir/request.json"
status_file="$action_dir/status.json"
log_file="$action_dir/update.log"
mkdir -p "$action_dir"
exec 9>"$action_dir/.host-action.lock"
flock -n 9 || exit 0

if [[ ! -f "$request_file" ]]; then exit 0; fi
mapfile -t request < <(python3 - "$request_file" <<'PY'
import json, re, sys
try:
    data = json.load(open(sys.argv[1], encoding='utf-8'))
    request_id = str(data.get('id', ''))
    action = str(data.get('action', ''))
    if not re.fullmatch(r'[0-9a-fA-F-]{36}', request_id) or action not in {'check', 'upgrade'}:
        raise ValueError('invalid request')
    print(request_id)
    print(action)
except (OSError, ValueError, TypeError, json.JSONDecodeError):
    sys.exit(2)
PY
)
if [[ ${#request[@]} -ne 2 ]]; then
  rm -f "$request_file"
  exit 2
fi
request_id=${request[0]}
action=${request[1]}

write_status() {
  local state=$1 pending=${2:-} message=${3:-}
  python3 - "$status_file" "$request_id" "$action" "$state" "$pending" "$message" <<'PY'
import json, os, sys, tempfile, time
path, request_id, action, state, pending, message = sys.argv[1:]
payload = {
    'id': request_id,
    'action': action,
    'status': state,
    'updatedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
    'message': message,
}
if pending:
    payload['packagesPending'] = int(pending)
directory = os.path.dirname(path)
fd, temporary = tempfile.mkstemp(prefix='.status-', dir=directory)
try:
    with os.fdopen(fd, 'w', encoding='utf-8') as stream:
        json.dump(payload, stream)
    os.replace(temporary, path)
finally:
    if os.path.exists(temporary):
        os.unlink(temporary)
PY
}

write_status running '' 'Executando no Ubuntu WSL.'
rm -f "$request_file"
pending_count() {
  apt list --upgradable 2>/dev/null | awk 'NR > 1 && /\// { count++ } END { print count + 0 }'
}

if ! timeout 900 apt-get update >"$log_file" 2>&1; then
  write_status failed '' 'Não foi possível atualizar o índice de pacotes. Consulte a rede e o log do host.'
  exit 0
fi

if [[ "$action" == check ]]; then
  write_status done "$(pending_count)" 'Verificação concluída no Ubuntu WSL.'
  exit 0
fi

if ! timeout 1800 env DEBIAN_FRONTEND=noninteractive apt-get upgrade -y >>"$log_file" 2>&1; then
  write_status failed '' 'A atualização falhou no Ubuntu WSL. Consulte o log do host.'
  exit 0
fi

write_status done "$(pending_count)" 'Pacotes do Ubuntu WSL atualizados com apt-get upgrade.'
