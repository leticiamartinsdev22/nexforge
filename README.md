# NexForge

Painel de infraestrutura (React + Vite + Tailwind v4) com login, 12 telas e **dados reais atualizados a cada 60s**.

## Pré-requisitos

- Node.js 20.19 ou superior na linha 20, ou Node.js 22.12–24.x; o painel e o agente usam a mesma faixa.
- npm 10 ou superior.
- Docker é opcional para desenvolver a interface; ele é necessário para listar containers e coletar métricas do Docker.

```
nexforge/
├── src/        painel (front)
└── server/     agente (Node/Express) que coleta os dados reais
```

## 1) Frontend local conectado ao agente

```bash
npm install
npm run dev
```
Abra http://localhost:5173. O painel usa somente dados do agente; sem conexão, exibe o estado do servidor offline e não inventa métricas.

## 2) Agente e dados ao vivo (atualização a cada 60s)

### Agente (`server/`)
```bash
cd server
npm install
cp .env.example .env              # edite: PANEL_PASSWORD e PANEL_SECRET (openssl rand -hex 32)
cp config.example.json config.json   # edite: nome do servidor, domínios, apps, backups...
npm start
```
O agente coleta **a cada 60s** (`POLL_MS`) e guarda o resultado em cache. Escuta só em `127.0.0.1:3001`.

### Painel (front)
Na raiz do projeto, crie o `.env.local`:
```
VITE_LIVE=true
```
```bash
npm run dev
```
No dev, o Vite encaminha `/api` para `http://127.0.0.1:3001`. A senha de login é a `PANEL_PASSWORD` do agente.
O painel busca `/api/snapshot` a cada 60s (`VITE_POLL_MS`); o botão ↻ no topo atualiza na hora.

No Windows, `npm run build` grava em `%LOCALAPPDATA%\NexForge\build-dist` e o cache do Vite em `%LOCALAPPDATA%\NexForge\vite-cache`, para não depender de gravação em pastas protegidas dentro de Documentos. `npm run preview` usa o mesmo build; no Docker/Linux, os arquivos continuam em `dist`.

### Subir o NexForge com Docker Compose

O Compose deste repositório é independente do `docker-compose.yml` da pasta do usuário. Ele sobe o painel, o agente e um PostgreSQL privado na rede do Compose. No PowerShell, na raiz do projeto, inicialize os arquivos somente se ainda não existirem:

```powershell
if (!(Test-Path .env)) { Copy-Item compose.env.example .env }
powershell -ExecutionPolicy Bypass -File .\scripts\initialize-secrets.ps1
if (!(Test-Path server/config.json)) { Copy-Item server/config.example.json server/config.json }
# Edite NEXFORGE_SECRETS_PATH no .env para apontar para a pasta criada acima.
# Os arquivos de segredo ficam fora do projeto e protegidos por ACL do Windows.
docker compose up -d --build
```

A interface local fica em `http://127.0.0.1:4173`; agente, proxy do Docker e PostgreSQL não publicam portas no host. O agente e o frontend executam sem root, com filesystem somente leitura, capacidades removidas e `no-new-privileges`. O agente não recebe o socket Docker: um proxy isolado aceita somente chamadas HTTP GET necessárias à leitura de containers, métricas e logs. O volume do PostgreSQL é privado. Métricas e cópias locais são retidas por 30 dias por padrão (`NEXFORGE_METRICS_RETENTION_DAYS` e `NEXFORGE_BACKUP_RETENTION_DAYS`). O endpoint autenticado `/api/metrics?range=1h|24h|7d|30d|all` consulta o histórico retido e agrega pontos para manter a resposta pequena.

#### Oracle Cloud Always Free (sem depender do PC)

O agente Docker do NexForge já está neste projeto; para manter a coleta com o PC desligado, ele precisa rodar em uma VM remota. A Oracle oferece Ampere A1 Always Free com até 2 OCPUs e 12 GB de memória, mas a VM deve ser criada na região principal da conta e pode não haver capacidade. A Oracle também pode recolher VMs gratuitas consideradas ociosas após 7 dias (CPU P95 abaixo de 20%, rede abaixo de 20% e, em A1, memória abaixo de 20%). Portanto, esse caminho não garante disponibilidade ininterrupta. Consulte os [limites e a política oficial de recursos Always Free](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm).

Crie uma VM Ubuntu ARM64 na Oracle e instale [Docker Engine](https://docs.docker.com/engine/install/ubuntu/), o [plugin Docker Compose](https://docs.docker.com/compose/install/linux/) e [Tailscale para Linux](https://tailscale.com/kb/1031/install-linux) seguindo os guias oficiais. No PowerShell, na raiz deste projeto, gere um pacote de implantação que exclui `.env`, `config.json`, chaves, dependências, backups e dados locais:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\package-remote.ps1 -OutputPath "$env:TEMP\nexforge-deploy.zip"
scp -i "<caminho-da-chave-SSH>" "$env:TEMP\nexforge-deploy.zip" ubuntu@<IP-PUBLICO>:/tmp/
ssh -i "<caminho-da-chave-SSH>" ubuntu@<IP-PUBLICO>
```

Na sessão SSH da VM, extraia e configure o projeto:

```bash
sudo install -d -o ubuntu -g ubuntu /opt/nexforge
unzip -o /tmp/nexforge-deploy.zip -d /opt/nexforge
cd /opt/nexforge
cp compose.env.example .env
sed -i 's|^NEXFORGE_SECRETS_PATH=.*|NEXFORGE_SECRETS_PATH=/opt/nexforge/secrets|' .env
sed -i 's|^NEXFORGE_BACKUPS_PATH=.*|NEXFORGE_BACKUPS_PATH=/opt/nexforge/backups|' .env
sed -i 's|^NEXFORGE_HOST_METRICS_PATH=.*|NEXFORGE_HOST_METRICS_PATH=/opt/nexforge/host-metrics|' .env
DOCKER_GID="$(getent group docker | cut -d: -f3)"
printf '\nNEXFORGE_DOCKER_GID=%s\n' "$DOCKER_GID" >> .env
cp server/config.example.json server/config.json
sudo bash scripts/initialize-secrets.sh
sudo install -d -o 1000 -g 1000 /opt/nexforge/backups /opt/nexforge/host-metrics
sudo docker compose -f docker-compose.yml -f docker-compose.linux.yml config --quiet
sudo docker compose -f docker-compose.yml -f docker-compose.linux.yml up -d --build
sudo docker compose -f docker-compose.yml -f docker-compose.linux.yml ps
```

O script de segredos pedirá para você criar a senha do painel e não a exibirá. Depois, entre na VM com Tailscale (`sudo tailscale up`) e exponha o painel apenas à sua tailnet: `sudo tailscale serve --bg 4173`. Instale Tailscale também no celular e entre na mesma conta; abra a URL HTTPS `.ts.net` mostrada pelo comando. O Tailscale Serve mantém essa publicação após reinicializações e não exige domínio próprio. Não abra a porta `4173` na rede pública. O plano pessoal do Tailscale é gratuito, com dispositivos ilimitados; veja [planos atuais](https://tailscale.com/pricing) e a [documentação do Serve](https://tailscale.com/docs/reference/tailscale-cli/serve).

Esse painel mostrará os recursos Linux e containers da VM Oracle. O coletor Windows do PC é independente e deixa de enviar novas amostras quando o PC está desligado.

#### Hospedar 24/7 em uma VPS Ubuntu

Para acessar o NexForge enquanto este computador estiver desligado, rode a aplicação numa VPS que permaneça ligada. O Compose de produção adiciona Caddy como proxy público com HTTPS automático; o painel continua na rede interna e a porta local `4173` permanece restrita a `127.0.0.1`. O agente, o PostgreSQL e o proxy Docker não ficam expostos à internet. O coletor passa a mostrar métricas do servidor Linux; métricas deste Windows param quando o computador é desligado.

Pré-requisitos: VPS Ubuntu, um domínio/subdomínio apontando para o IP público da VPS, e as portas TCP `80` e `443` abertas no firewall da VPS/provedor. Caddy emite e renova certificados automaticamente para um domínio público quando DNS e portas estão configurados. Consulte a [documentação de HTTPS automático do Caddy](https://caddyserver.com/docs/automatic-https) e o [uso do Compose em produção](https://docs.docker.com/compose/how-tos/production/).

Na VPS, copie o projeto para `/opt/nexforge`, entre nessa pasta e rode:

```bash
sudo systemctl enable --now docker
cp compose.vps.env.example .env
# Edite .env: use seu domínio e o GID mostrado por `getent group docker | cut -d: -f3` em NEXFORGE_DOCKER_GID.
sudo bash scripts/initialize-secrets.sh
cp server/config.example.json server/config.json
# Edite server/config.json para definir os serviços, domínios e backups que o painel deve acompanhar.
sudo install -d -o 1000 -g 1000 /opt/nexforge/backups /opt/nexforge/host-metrics
docker compose -f docker-compose.yml -f docker-compose.vps.yml config --quiet
docker compose -f docker-compose.yml -f docker-compose.vps.yml up -d --build
docker compose -f docker-compose.yml -f docker-compose.vps.yml ps
```

A senha do painel será solicitada sem aparecer na tela. Os demais segredos são gerados sem serem impressos; o script permite que o agente (UID 1000) os leia. Proteja o acesso SSH da VPS e mantenha `.env`, `server/config.json` e a pasta de segredos fora de repositórios públicos. O volume PostgreSQL mantém os dados entre reinícios; configure também backup fora da VPS para cobrir perda do servidor.

Depois da implantação, abra `https://<seu-domínio>`. Docker Engine e as políticas `unless-stopped` mantêm os containers iniciados em segundo plano e os reiniciam com o serviço após reinicializações do Linux. O computador local e o Docker Desktop podem ficar desligados. Para atualizar o projeto, transfira a versão nova e rode novamente `docker compose -f docker-compose.yml -f docker-compose.vps.yml up -d --build`.

#### VM Ubuntu remota com acesso privado por Tailscale

Use este caminho com uma VM Ubuntu de qualquer provedor, sem Oracle e sem publicar o painel na internet. A VM continua funcionando com o PC desligado. O Tailscale Serve disponibiliza o painel somente aos dispositivos conectados à mesma tailnet; instale o Tailscale também no celular. A documentação do Tailscale explica a [instalação no Linux](https://tailscale.com/docs/install/linux) e o [comando Serve](https://tailscale.com/docs/reference/tailscale-cli/serve).

Na VM, instale Docker Engine e o plugin Compose seguindo a [documentação oficial para Ubuntu](https://docs.docker.com/engine/install/ubuntu/), e instale o Tailscale seguindo a [documentação oficial para Linux](https://tailscale.com/docs/install/linux). Deixe as portas de entrada `4173`, `3001`, `5432` e `2375` fechadas no firewall. Mantenha SSH restrito ao seu IP ou à tailnet.

No PowerShell, na pasta do projeto, crie um pacote que exclui arquivos de configuração, segredos, chaves, métricas e dados locais:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\package-remote.ps1 -OutputPath "$env:TEMP\nexforge-deploy.zip"
scp -i "<caminho-da-chave-SSH>" "$env:TEMP\nexforge-deploy.zip" <usuario>@<IP-PUBLICO>:/tmp/
ssh -i "<caminho-da-chave-SSH>" <usuario>@<IP-PUBLICO>
```

Na sessão SSH da VM, configure o projeto. Substitua `<usuario>` pelo usuário Ubuntu da VM e preserve a chave privada somente no seu PC:

```bash
sudo systemctl enable --now docker
sudo install -d -o "$USER" -g "$USER" /opt/nexforge
unzip -o /tmp/nexforge-deploy.zip -d /opt/nexforge
cd /opt/nexforge
cp compose.env.example .env
sed -i 's|^NEXFORGE_SECRETS_PATH=.*|NEXFORGE_SECRETS_PATH=/opt/nexforge/secrets|' .env
sed -i 's|^NEXFORGE_BACKUPS_PATH=.*|NEXFORGE_BACKUPS_PATH=/opt/nexforge/backups|' .env
sed -i 's|^NEXFORGE_HOST_METRICS_PATH=.*|NEXFORGE_HOST_METRICS_PATH=/opt/nexforge/host-metrics|' .env
DOCKER_GID="$(getent group docker | cut -d: -f3)"
printf '\nNEXFORGE_DOCKER_GID=%s\n' "$DOCKER_GID" >> .env
cp server/config.example.json server/config.json
# Ajuste server/config.json com o nome real do provedor e a região da VM.
sudo bash scripts/initialize-secrets.sh
sudo install -d -o 1000 -g 1000 /opt/nexforge/backups /opt/nexforge/host-metrics /opt/nexforge/host-actions
sudo docker compose -f docker-compose.yml -f docker-compose.linux.yml config --quiet
sudo docker compose -f docker-compose.yml -f docker-compose.linux.yml up -d --build
sudo tailscale up
sudo tailscale serve --bg 4173
sudo tailscale serve status
```

O comando `tailscale up` mostra um link para autorizar a VM. Depois, conecte o celular à mesma tailnet e abra a URL HTTPS `.ts.net` exibida por `tailscale serve status`. O painel continuará acessível enquanto a VM e o provedor estiverem ativos. Esses backups ficam no disco da VM; sem uma cópia externa, a perda da VM também pode levar os backups locais.

#### Métricas do Ubuntu no WSL

Quando o NexForge roda no Docker Desktop do Windows, o agente está em um container Alpine. Para o painel mostrar o servidor Ubuntu usado no WSL, deixe `NEXFORGE_HOST_METRICS_PATH` no `.env` apontando para `%LOCALAPPDATA%\NexForge\host-metrics` e instale o coletor abaixo no PowerShell **na raiz do projeto**:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\ubuntu-wsl-host-metrics.ps1 -Install
```

Ele lê a distro WSL chamada `Ubuntu`, grava a amostra em `host.json` a cada 15 segundos e inicia no logon. A instalação desativa a tarefa do coletor Windows para que as fontes não se sobrescrevam. A mesma tarefa processa, como `root` no Ubuntu WSL, apenas as ações fixas de consultar e instalar atualizações do Ubuntu. O painel não aceita comandos livres. O agente aceita a amostra por até 2 minutos; sem amostras novas, mostra o ambiente Linux do container e apresenta um aviso.

Por padrão, a fila de ações fica ao lado da pasta de métricas: `%LOCALAPPDATA%/NexForge/host-actions`. Se `NEXFORGE_HOST_METRICS_PATH` for alterado, ajuste `NEXFORGE_HOST_ACTIONS_PATH` para o diretório equivalente. A instalação marca o executor depois de confirmar que a tarefa está rodando; sem essa tarefa, a interface mantém as ações de atualização desabilitadas.

Para usar as métricas do Windows em vez da distro Ubuntu, instale o outro coletor; cada instalação desativa a tarefa anterior:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows-host-metrics.ps1 -Install
```

Ambos os coletores usam `%LOCALAPPDATA%\NexForge\host-metrics\host.json`, montado pelo agente somente para leitura. Para removê-los, execute o script correspondente com `-Uninstall`.

#### HTTPS privado pelo Tailscale

O Compose mantém a porta local restrita a `127.0.0.1`. No Ubuntu, publique o painel com certificado Tailscale dentro da tailnet:

```bash
sudo tailscale serve --bg 4173
sudo tailscale serve status
```

Abra a URL `https://<nome-da-maquina>.<tailnet>.ts.net` exibida pelo status. Isso não ativa acesso público; para HTTPS público é necessário configurar um domínio e certificado confiável. O cookie da sessão recebe a flag `Secure` ao entrar pela URL HTTPS.

O agendador usa `TZ` do serviço; o Compose assume `America/Cuiaba`. Para outro fuso ou porta, defina `TZ` ou `NEXFORGE_PORT` no `.env` da raiz.

Para ver o estado e os logs: `docker compose ps` e `docker compose logs -f`. `docker compose down` para e remove os containers do projeto NexForge, sem remover os volumes de banco e estado. O Compose não inicia, altera ou remove containers de outros projetos.

### O que é real e de onde vem
| Tela | Fonte |
|---|---|
| Servidor (CPU, RAM, disco, rede, uptime, SO, IP) | Coletor Ubuntu WSL quando ativo; senão `systeminformation` no ambiente do agente. |
| Aplicações / containers / bancos | Docker (containers agrupados pelo projeto do Docker Compose) |
| Domínios / SSL | verificação TLS real (porta 443) dos domínios cadastrados no painel ou no `config.json` |
| Backups | arquivos encontrados diretamente em `backups.dir/<projeto>/` (isso não valida integridade nem restauração) |
| Alertas / eventos | mudanças de estado dos apps entre uma coleta e outra (PostgreSQL no Compose; arquivo JSON no modo independente) |
| Segurança | pacotes pendentes consultados no Ubuntu WSL, reboot pendente, portas escutando em 0.0.0.0, checks (docker/disco/ram/SSL) |
| Logs | `docker logs` (180 linhas) dos containers |
| Gráficos | histórico das últimas 30 coletas (30 min), persistido no PostgreSQL no Compose |
| Hardening / off-site | definidos por você no `config.json` (não dá pra medir de fora) |

> Registro do domínio (`registryExpires`) é informado no `config.json` — não há consulta automática ao Registro.br.

Os dados de provedor/localização e a lista de domínios podem ser editados na interface e ficam no volume persistente do agente. Remover uma aplicação do painel apenas oculta seu monitoramento; não para nem exclui containers. O painel permite restaurar a aplicação depois.

### Alertas
O agente registra um alerta quando um app **cai** ou **volta**, quando **disco/memória** passam do limite (padrão 90%, ajuste em `thresholds` no `config.json`; registra de novo ao voltar 5 pontos abaixo) e quando um **backup** termina ou falha. Eles aparecem no sino e na tela Alertas.

### Backups (manual e agendado)
O Compose inclui backup do PostgreSQL, `config.json` e estado do agente em `/backups/nexforge/`. O `pg_dump` usado no agente acompanha a versão principal do PostgreSQL para que o arquivo possa ser restaurado pelo servidor 16 do Compose. O arquivo combinado é validado antes de ser publicado. Cópias locais mais antigas que `NEXFORGE_BACKUP_RETENTION_DAYS` são removidas após um backup bem-sucedido. O backup não inclui outros containers. Em modo agente independente, defina no `config.json` um comando de backup (array, sem shell). Scripts adicionais do Compose ficam em `server/scripts/`; o diretório local de destino é `backups/` (ajustável por `NEXFORGE_BACKUPS_PATH` no `.env` raiz):
```json
"backups": { "dir": "/backups", "command": ["/bin/sh", "/scripts/backup.sh"], "timeoutMs": 1800000 }
```
- **Executar backup agora** (Servidores e Backups) roda esse comando uma vez (409 se já houver um rodando).
- **Salvar agendamento** (Diária / Semanal aos domingos / A cada 12h + horário) chama esse mesmo comando único pelo agente, no **horário do servidor**, enquanto ele estiver rodando. No Compose, o agendamento fica no PostgreSQL; sem banco, usa `server/data/schedule.json`. Não há execução automática antes de deploy.
- Para cópia externa cifrada, configure `NEXFORGE_RESTIC_REPOSITORY` e `NEXFORGE_OFFSITE_REGION` no `.env` raiz; adicione as credenciais S3 ao arquivo `aws_credentials` na pasta externa de segredos e mantenha a senha Restic em `restic_password`. O repositório pode ser S3 ou compatível, no formato `s3:https://<endpoint>/<bucket>/nexforge`; crie antes o bucket e limite a chave IAM a esse bucket. O Restic cifra o conteúdo antes de enviar. Retenção remota: 30 diárias, 8 semanais e 12 mensais (ajustável pelas variáveis `NEXFORGE_RESTIC_KEEP_*`). Sem repositório e credenciais, só há cópias locais.
- O arquivo local é verificado como tar; isso não substitui um ensaio periódico de restauração. Restic verifica a integridade dos snapshots enviados. A tela mostra o resultado do último envio externo quando configurado.
- O backup executa apenas o comando fixo definido em `backups.command` no `config.json`; o navegador não pode enviar comandos.
- Na tela Segurança, a verificação executa `apt-get update` e a instalação, após confirmação, executa `apt-get upgrade -y` no Ubuntu WSL como `root`. Não usa `dist-upgrade`, `autoremove` nem aceita comandos personalizados. A tarefa Ubuntu WSL precisa estar instalada e o computador precisa estar ligado.

### Filtros, busca e sino
- **Período** (1h / 24h / 7d / 30d / tudo) filtra alertas e eventos; **ambiente** (Produção / Desenvolvimento) filtra as aplicações.
- A **busca** do topo filtra Aplicações, Domínios e Bancos (`?q=`).
- O **sino** mostra os alertas recentes e a contagem de críticos das últimas 24h; **↻** força uma coleta na hora.

### API do agente
`POST /api/login` · `GET /api/snapshot` · `GET /api/metrics?range=1h|24h|7d|30d|all` · `POST /api/refresh` · `GET /api/logs/:container` · `POST /api/actions/backup` · `PUT /api/backup-schedule` · `PUT /api/server-config` · `POST/DELETE /api/domains` · `PUT /api/apps/:key/visibility` · `GET /api/host-updates` · `POST /api/host-updates/check|upgrade` · `GET /api/health` (todas, exceto login e health, exigem `Authorization: Bearer <token>`).

### Docker no WSL2
Com Docker Desktop: ative a integração com a sua distro (Settings → Resources → WSL integration).
Com Docker Engine na distro: `sudo usermod -aG docker $USER` e reabra o terminal.

### Injetar dados de outra fonte
O front só consome o JSON de `GET /api/snapshot` (header `Authorization: Bearer <token>`).
Qualquer backend que devolva esse formato serve. Campos (todos opcionais; o que faltar vira vazio):

```
generatedAt, warnings[]
server:   { name,id,region,provider,ip,os, cpu,ram,disk (0-100), vcpu,load,
            ramUsed,ramTotal,diskUsed,diskTotal (GB, string), uptime,uptimeFull,uptimeDays,
            netMBs, pendingReboot }
apps:     [{ name,icon,env('Produção'|'Desenvolvimento'),status('ok'|'off'|'bad'),cpu,mem(MB),cont('2/3') }]
domains:  [{ domain,app,icon,ssl(dias|null),days(dias|null),expiresAt(ISO|null) }]
dbs:      [{ name,engine,app,size,conns,status('ok'|'bad') }]
backups:  [{ app,icon,mb,hasBackup,last,lastTs,copies }]
alerts:   [{ ts,level('ok'|'bad'),msg,source }]
events:   [{ ts,title,detail,tag }]
hardening:[[titulo,descricao],...]
security: { packages (null quando não disponível),rebootPending,lastBoot,publicPorts (binds wildcard; firewall não verificado),checksOk,checksTotal }
offsite:  { destination,lastSync,encryption } | null
logSources: [nomes]            (e GET /api/logs/:fonte -> { lines:[{t,lvl,msg}] })
history:  { cpu:[],ram:[],disk:[],net:[] }   (séries das últimas coletas)
```

## Segurança — leia antes de expor

- **HTTPS obrigatório** se sair do localhost (nginx + Let's Encrypt ou Cloudflare Tunnel). Sem HTTPS a senha e o token trafegam em claro.
- O login limita **5 tentativas erradas por IP a cada 15 min**; a sessão expira em 4h, pode ser revogada ao sair e usa cookie `HttpOnly`, `SameSite=Strict` e `Secure` em HTTPS. A senha nunca é guardada no navegador.
- Definir `PANEL_SECRET` forte e **nunca** commitar `.env`/`config.json` (já estão no `.gitignore`).
- O NexForge não recebe o `docker.sock`: usa um proxy interno que só permite `GET` de containers, métricas e logs. Dar acesso direto ao socket em outros agentes continua equivalente a root na máquina.
- Em produção atrás de proxy, defina `TRUST_PROXY=true` (para o rate limit ver o IP real) e `CORS_ORIGIN` com o domínio do painel.

## Produção (resumo)

```bash
npm run build           # gera dist/ (use VITE_LIVE=true e VITE_API_URL=https://api.seudominio.com)
cd server && npx pm2 start "npm start" --name nexforge-agent
```
Sirva `dist/` pelo nginx e faça proxy de `/api` para `127.0.0.1:3001`.

## Onde mexer
- `src/config.js` — nome do painel e flags do modo ao vivo
- `src/store.jsx` — busca/normalização dos dados e polling
- `src/index.css` — todo o visual
- `src/components/Logo.jsx` — logo (hexágono com N)
- `server/src/collector.js` — coleta dos dados reais
