#!/usr/bin/env bash
set -Eeuo pipefail

secrets_path="${1:-/opt/nexforge/secrets}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Execute como root: sudo bash scripts/initialize-secrets.sh" >&2
  exit 1
fi

if ! command -v openssl >/dev/null 2>&1; then
  echo "openssl é necessário para gerar os segredos." >&2
  exit 1
fi

install -d -o root -g 1000 -m 0750 "$secrets_path"

write_random_secret() {
  local name="$1"
  local bytes="$2"
  local target="$secrets_path/$name"
  if [[ ! -s "$target" ]]; then
    openssl rand -hex "$bytes" > "$target"
  fi
}

write_random_secret nexforge_db_password 32
write_random_secret panel_secret 48
write_random_secret restic_password 48

panel_password_file="$secrets_path/panel_password"
if [[ ! -s "$panel_password_file" ]]; then
  while true; do
    IFS= read -r -s -p "Crie a senha do painel (mínimo 16 caracteres): " panel_password
    printf '\n'
    IFS= read -r -s -p "Confirme a senha: " panel_password_confirmation
    printf '\n'
    if [[ "$panel_password" != "$panel_password_confirmation" ]]; then
      echo "As senhas não coincidem. Tente novamente." >&2
    elif [[ "${#panel_password}" -lt 16 ]]; then
      echo "A senha precisa ter pelo menos 16 caracteres." >&2
    else
      printf '%s\n' "$panel_password" > "$panel_password_file"
      unset panel_password panel_password_confirmation
      break
    fi
    unset panel_password panel_password_confirmation
  done
fi

if [[ ! -s "$secrets_path/aws_credentials" ]]; then
  printf '[default]\n' > "$secrets_path/aws_credentials"
fi

for name in nexforge_db_password panel_password panel_secret restic_password aws_credentials; do
  chown root:1000 "$secrets_path/$name"
  chmod 0440 "$secrets_path/$name"
done

echo "Segredos criados em $secrets_path; os valores não foram exibidos."
