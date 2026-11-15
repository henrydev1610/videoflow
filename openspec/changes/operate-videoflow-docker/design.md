# Design — Docker, testes e operação

## Context

Não existem Dockerfiles, Compose, aplicação ou scripts no repositório. O alvo é Windows + Docker Desktop + WSL2, com execução futura em Ubuntu. A auditoria e os contratos base estão na mudança de fundação. Nenhuma execução Docker ou teste de aplicação foi realizada nesta etapa de planejamento.

## Goals / Non-Goals

**Objetivos:** uma entrada HTTP, dependências prontas antes de uso, ferramentas isoladas e verificação integral reproduzível.

**Fora do escopo:** deploy remoto, alteração de serviços externos, exposição de banco/fila, Docker socket, remoção de volumes e alegações de disponibilidade sem execução.

## Decisions

### Serviços e redes

| Serviço | Responsabilidade | Redes/volumes |
|---|---|---|
| videoflow-frontend | build Vite servido por Nginx não root | frontend; sem dados privados |
| videoflow-api | Fastify, contratos e entrega autorizada | app/dados; artefatos RO |
| videoflow-worker | BullMQ, coordenação, publicação e limpeza | dados; comandos/resultados/temp/artefatos |
| videoflow-postgres | banco persistente | dados interna; pg-data |
| videoflow-redis | fila, limites compartilhados | dados interna; redis-data |
| videoflow-proxy | rota /api e frontend | entrada/app/frontend; porta 127.0.0.1:8080 |
| videoflow-migrate | prisma migrate deploy, execução única | dados; sem porta |
| videoflow-egress | gateway HTTP/CONNECT com DNS seguro | media interna e saída; sem porta publicada |
| videoflow-media-sandbox | execução yt-dlp/FFmpeg em imagem de mídia compartilhada | apenas media interna; comandos RO, resultados/temp RW |

Seis serviços obrigatórios mais três auxiliares justificados: migrations ordenadas, gateway contra SSRF e separação das ferramentas da rede de dados. Worker e sandbox usam imagem com Node, yt-dlp, FFmpeg e ffprobe; worker coordena, sandbox executa. Não usar container_name, IPs estáticos universais ou portas de banco no host. Gateway não participa de dados; ferramentas não participam de app/dados. Cada rede usa somente membros necessários.

Proxy publica apenas loopback por padrão local. Nginx encaminha /api sem remover prefixo e sobrescreve forwarding headers; trustProxy da API fica restrito ao salto/rede do proxy, com teste de spoofing. Gateway valida endereços no momento da conexão e pinna IP; negar destinos não públicos também quando host for um serviço Docker. Nenhuma regra de permissão global a redes privadas em produção.

### Build e runtime

Dockerfiles multi-stage: dependências com npm ci, geração Prisma, builds TS e frontend, runtime mínimo. Fixar versões exatas e digests após verificação na implementação; não inventar matriz aprovada nesta etapa. Node/Python e bibliotecas de sistema devem corresponder à versão escolhida de yt-dlp/FFmpeg e Prisma. `.dockerignore` exclui node_modules, .git, segredos, mídia temporária e relatórios pesados.

Processos contínuos executam como UID não root; inicialização de volume pode usar root apenas para permissões e abandonar privilégio. Usar init:true, cap_drop ALL, no-new-privileges, filesystem read-only quando possível, tmpfs para /tmp e gravações somente nos volumes necessários. Sem privileged ou Docker socket. Imagens de ferramentas incluem verificação de versão no build e smoke test no container final.

Valores iniciais de memória: frontend/proxy 128 MiB cada, API 512 MiB, worker 512 MiB, sandbox 2 GiB, PostgreSQL 512 MiB, Redis 256 MiB, gateway 256 MiB. Sandbox até 2 CPUs e 128 PIDs; API/worker até 1 CPU cada. Ajustes por ambiente, sem diminuir os testes de limites. Documentar recomendação de 8 GiB de RAM disponível ao Docker e espaço para imagens + quotas de mídia. Margem e reservas de disco impedem admissão sem capacidade.

Redis usa AOF everysec e maxmemory-policy noeviction; perda máxima de janela AOF é tolerada por outbox/reconciliação do banco, não considerada garantia de durabilidade absoluta da fila. PostgreSQL usa volume dedicado e migration versionada. Logs JSON limitados por tamanho/rotação; não armazenar stdout bruto de ferramentas ou URLs sensíveis.

### Inicialização e saúde

Postgres e Redis usam health checks reais. Migrate depende de banco saudável; API/worker dependem de migrate com service_completed_successfully e Redis saudável. Migrate usa restart:no; demais serviços usam unless-stopped. Gateway e sandbox precisam estar saudáveis para inspeção/processamento.

API health verifica banco/Redis com timeout curto, sem bootstrap de contexto. Worker registra heartbeat interno; health command verifica heartbeat recente e conectividade, sem servidor HTTP público. Sandbox verifica heartbeat, binários e spool; gateway verifica listener e política carregada sem depender de site externo; frontend/proxy verificam HTTP local. Saúde verde não substitui teste de conversão.

Migrations não executam concorrendo em cada réplica. Em falha, preservar banco e diagnóstico. Valores locais padrão do Compose permitem subir com um comando; `.env.example` documenta overrides de porta/origem, credenciais de desenvolvimento, limites, retenção e allowlists. Valores inválidos devem falhar na inicialização. Nenhum segredo real no código.

### Desenvolvimento e testes

`compose.dev.yaml` adiciona bind mounts de fontes, volumes separados de node_modules por workspace e watch polling quando necessário no Windows. Vite/API continuam atrás do proxy, com rota de WebSocket para HMR. Não exigir Node no host. Script PowerShell operacional e equivalente shell, ambos delegando a Compose.

`compose.test.yaml` usa projeto próprio, banco/fila/volumes exclusivos e fixture de mídia sintética gerada com FFmpeg. Fixture não publica porta no host. Gateway de teste permite exclusivamente o host e porta dessa fixture por regra explícita só no override de testes; manter testes separados que comprovem negação de outros IPs privados e inexistência dessa exceção no Compose de produção. Nunca habilitar bypass genérico de SSRF por variável pública.

Serviço quality executa npm ci, lint, prettier check, typecheck, Vitest e builds; serviço E2E usa imagem Playwright compatível com versão fixada. Testes de integração iniciam API, banco, fila, sandbox e gateway reais. Geração de fixtures é determinística e documentada como conteúdo sintético autorizado. Capturar relatórios, logs sanitizados e versões em `docs/verification/`, indicando comando e exit code. Testes de falhas usam exclusivamente containers do projeto Compose de teste.

### Plano de execução por dependência

1. Aprovar os quatro conjuntos de artefatos.
2. Aplicar fundação: workspaces, contratos, modelo, API e testes unitários.
3. Aplicar infraestrutura básica desta mudança: imagens, banco/fila, migration, volumes, proxy, gateway e sandbox.
4. Aplicar processamento: inspeção, conversão, lifecycle, retries e limpeza.
5. Aplicar frontend: navegação, integração completa e preferências.
6. Concluir esta mudança com suíte integrada, E2E, reinícios, backup/restore e saúde.
7. Conferir tarefas e matriz de evidências; sincronizar e arquivar somente mudanças totalmente verificadas.

Alternar apply entre mudanças é intencional; não cria ciclo de requisitos. Infraestrutura pode ficar com tarefas finais pendentes enquanto mídia e interface são implementadas. Nenhum item é marcado concluído por existir somente um stub ou mock.

### Operação e futura VPS

README conterá `docker compose up -d --build`, `docker compose ps`, `docker compose logs -f <serviço>`, `docker compose stop`, reconstrução e reinício de serviços específicos. Migração manual usa o serviço migrate. Limpeza usa comando da aplicação que respeita leases e retenção; nunca rm recursivo em volumes de dados. Backup via pg_dump e restauração ensaiada em projeto isolado; documentar consistência entre backup do banco e artefatos em snapshot ou janela de manutenção. `down -v` não faz parte do fluxo normal.

Guia futuro de Ubuntu: instalar Docker/Compose, configurar DNS, segredos e origem HTTPS, habilitar TLS no proxy, abrir apenas 80/443 e SSH restrito, validar redes de saída, configurar backups externos e restauração, rotação de logs, alertas de disco/filas/falhas e atualização de imagens com rollback. Sem executar estes passos remotamente. Endpoints de métricas detalhadas apenas internos ou coletados operacionalmente, nunca listagem pública global.

## Risks / Trade-offs

- Docker Desktop pode estar parado → registrar impedimento real, não afirmar teste aprovado.
- Desempenho de bind mount Windows → watch polling configurável e dependências Linux em volume.
- Fixture privada poderia mascarar SSRF → override de teste mínimo, isolamento e teste do Compose de produção obrigatório.
- Limites de recurso variam pelo host → validar configuração efetiva via inspect e observar OOM, disco e latência.
- Arquivamento prematuro → somente após evidências e tarefas concluídas; OpenSpec validate comprova estrutura dos artefatos, não funcionamento do software.

## Migration Plan

Primeiro build cria volumes e aplica migration inicial. Atualizações futuras exigem backup e compatibilidade entre imagens/schema; restauração não é automática. Nenhuma operação desta entrega apaga volumes ou altera outros projetos Docker.

## Referências verificadas

- [Docker: ordem de inicialização](https://docs.docker.com/compose/how-tos/startup-order/) e [serviços Compose](https://docs.docker.com/reference/compose-file/services/) fundamentam dependências por saúde e conclusão de migrations.
