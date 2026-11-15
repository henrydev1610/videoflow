# Design — Fundação e contratos

## Context

Auditoria em 15/11/2026: somente `.agents/skills/` e `openspec/` existiam; não havia `.git`, AGENTS.md, package.json, código, testes ou infraestrutura. `openspec/config.yaml` define `spec-driven` sem contexto adicional. `openspec list --json` e `openspec list --specs` retornaram inventários vazios. A mudança citada pelo pedido não existia. CLI local verificada: OpenSpec 2.0.0.

Skills disponíveis: propose, update-change, apply-change, explore, sync-specs e archive-change. Não existe skill verify-change instalada; a verificação usará validação estrita do CLI e evidências de testes. Não há decisões antigas a corrigir ou código a preservar; os arquivos existentes de configuração e skills permanecem intactos. Motivação e limites de produto estão em proposal.md.

## Goals / Non-Goals

**Objetivos:** contratos únicos, consultas com escopo obrigatório, transações consistentes e infraestrutura intercambiável por adaptadores.

**Fora do escopo:** autenticação, administração de usuários, recuperação de acesso perdido, processamento de fontes protegidas e deploy remoto. Especificação pronta não equivale a implementação concluída ou aprovada.

## Decisions

### Organização e stack

Monorepo npm workspaces: `apps/web`, `apps/api`, `workers/media-worker`, `packages/shared`, `packages/config`, `infra/docker`, `infra/proxy`, `tests` e `docs`. Shared conterá contratos Zod, enums e máquina de estados pura, sem Prisma no bundle web. API terá módulos context, media, downloads e health, cada um com routes, schemas, handlers, services e repositories. Infraestrutura contém Prisma, Redis, fila e armazenamento. Preferência por workspaces simples em vez de ferramenta adicional de orquestração.

Versões exatas ainda não estão instaladas nem verificadas. A primeira tarefa de implementação consultará documentação oficial, engines e peer dependencies, escolherá uma linha Node LTS suportada e fixará versões e lockfile. Incluirá React/Vite, Tailwind/shadcn, Router/Query/RHF, Fastify e plugins compatíveis, Zod, Prisma, BullMQ, Redis, PostgreSQL, Vitest/Playwright, ESLint/Prettier, yt-dlp e FFmpeg. Não usar `latest` em imagens finais nem declarar compatibilidade antes de executar build e testes.

### Capacidade anônima

`POST /api/context` inicializa/reutiliza cookie host-only com Path=/api, HttpOnly e SameSite=Strict. Em HTTP local, Secure=false; ambiente HTTPS exige Secure e configuração coerente de origem. Token de 32 bytes aleatórios em base64url; hash SHA-256 único no banco. Contexto expira em 30 dias fixos. O token não trafega em URLs, corpo de respostas, localStorage ou logs. Novo contexto não recupera trabalhos de cookie perdido.

Não usar JWT: uma capacidade opaca permite revogação e retenção sem identidade pessoal. Todas as consultas passam `contextId` validado; repository não expõe método de listagem global para rotas públicas. Acesso cruzado usa 404, capacidade inválida usa 403. A aplicação é same-origin; Origin exato obrigatório nos POSTs e headers de segurança em ambos proxy/API. Nenhum endpoint público de administração ou métricas globais.

### Dados

| Entidade | Campos principais e restrições |
|---|---|
| AnonymousContext | id UUID, tokenHash unique, createdAt, expiresAt |
| MediaInspection | id, contextId, sourceUrl, metadados JSON validados, createdAt, expiresAt |
| DownloadJob | id, contextId, sourceUrl, title, source, duration, format, quality, status, progress, progressIndeterminate, attemptCount, generation, cancelRequestedAt, leaseOwner, leaseExpiresAt, createdAt, updatedAt, completedAt, historyExpiresAt, errorCode, errorMessage |
| DownloadAttempt | id, jobId, sequence unique por job, cycle, generation, startedAt, finishedAt, outcome, errorCode, erro sanitizado |
| FileArtifact | id, jobId unique, storageKey gerada, mime, bytes bigint, checksum, createdAt, expiresAt |
| OutboxEvent | id, jobId, generation, type, deliveredAt, createdAt; chave única por job/geração/evento |
| IdempotencyRecord | contextId+key unique, requestHash, jobId; retenção igual ao histórico |

Índices: jobs(contextId,createdAt,id), (contextId,status,createdAt), (status,leaseExpiresAt); artifacts(expiresAt); contexts(expiresAt); inspections(expiresAt); outbox(deliveredAt,createdAt). Exclusões em cascata somente pela rotina de retenção após limpeza física. URLs são necessárias à execução, mas nunca logadas integralmente. Binários permanecem em volumes.

Quota por contexto e global é reservada em transação serializada com locks de linha em registros de contador; liberar apenas uma vez em estado terminal. Contadores são reconciliáveis a partir dos estados do banco. Trabalho e outbox são gravados na mesma transação: Redis indisponível não perde trabalho confirmado. Ao atingir capacidade global, responder 503 CAPACITY_EXCEEDED; por contexto, 429 ACTIVE_LIMIT. Previsão de espaço reserva no máximo 3 GiB por execução e exige margem mínima de 1 GiB no volume.

### Contratos públicos

Enums: format=`mp4|mp3`, quality=`low|medium|high`; traduções apenas na interface. DTO DownloadJob contém id, title, source, format, quality, status, progress, progressIndeterminate, createdAt, updatedAt, completedAt, fileSizeBytes (string decimal ou null), fileExpiresAt, historyExpiresAt, error (code/message ou null), canRetry e attemptCount. Detalhes acrescentam attempts; nunca incluem storageKey, hash de capacidade ou argumentos internos. Lista retorna `{items,total,page,pageSize,summary}`; demais sucessos usam `{data:...}`. Summary agrega todos os trabalhos retidos do contexto; active soma PENDING, DOWNLOADING e PROCESSING.

| Rota | Sucesso | Erros relevantes |
|---|---|---|
| POST /api/context | 201 novo / 200 existente | 403 origem, 429 |
| POST /api/media/inspect | 200 inspeção | 400,403,422,429,503,504 |
| GET /api/media/inspections/:id/thumbnail | 200 imagem | 403,404,410 |
| POST /api/downloads | 202 trabalho | 400,403,404,409,429,503 |
| GET /api/downloads | 200 lista | 400,403,429,503 |
| GET /api/downloads/:id | 200 detalhe | 400,403,404 |
| GET /api/downloads/:id/file | 200 / 206 | 403,404,409,410,416 |
| POST /api/downloads/:id/cancel | 202 / 200 já cancelado | 403,404,409 |
| POST /api/downloads/:id/retry | 202 | 403,404,409,429,503 |
| GET /api/health | 200 | 503 |
| GET /api/openapi.json | 200 | — |

Retry também exige Idempotency-Key; transação bloqueia duas repetições concorrentes. Inspeção estrangeira retorna 404. URL inválida é 400; destino proibido retorna 422 SOURCE_BLOCKED. Corpo excedente retorna 413. Arquivo inesperadamente ausente antes de expirar retorna 410 FILE_UNAVAILABLE e evento operacional seguro. OpenAPI é gerado dos schemas e testado contra respostas reais; validação de saída rejeita vazamento acidental.

### Segurança de rede e armazenamento

Política padrão permite hosts públicos HTTP/HTTPS, com allowlists opcionais exatas para entrada e sub-recursos; lista vazia significa todos os hosts públicos elegíveis, nunca todos os endereços. Sem promessa de suporte universal a plataformas. Não aceitar headers, cookies, proxies ou argumentos yt-dlp fornecidos pelo visitante.

Apenas redes internas do Compose não bastam: ferramentas também precisam ser impedidas de alcançar banco/fila. Worker coordena jobs; ferramentas executam em serviço auxiliar `videoflow-media-sandbox`, sem credenciais nem rede de dados, ligado somente à rede interna de saída. Troca com worker por spool de arquivos em volumes, sem portas de comando públicas. Sandbox usa a mesma imagem de ferramentas do worker. Gateway HTTP/CONNECT é o único serviço ligado dessa rede à rede externa; resolve DNS, classifica todos os A/AAAA e conecta ao IP validado sem segunda resolução. Cada nova conexão valida novamente; portas limitadas a 80/443; timeout de conexão 10 s, idle 30 s. TLS mantém validação de certificado e hostname. Falha de política é fechada.

FFmpeg recebe arquivos locais para conversão, com protocolos restritos a file/pipe. yt-dlp recebe proxy explícito, ignore-config, no-playlist e argumentos estruturados. Nenhum componente abre URLs extraídas diretamente sem o gateway. Revalidar redirects e todos os segmentos. O gateway não tem rede de dados e bloqueia endereços não globais, inclusive host.docker.internal e interfaces bridge. A inspeção usa o mesmo sandbox e política. Essa separação acrescenta serviços, mas evita dar rede de dados a ferramentas que interpretam conteúdo não confiável.

Paths derivam de UUID/geração, nunca título/URL. Abrir sem seguir symlink, validar caminho real sob raiz e sanitizar filename de Content-Disposition. API monta artefatos somente leitura; temporários não são servidos. Log Pino com requestId/jobId, sem URL completa, tokens, cookies, cabeçalhos de autorização ou stderr bruto. Rate limits em Redis; se o controle compartilhado estiver indisponível, mutações retornam 503.

## Risks / Trade-offs

- Perda de cookie perde acesso → mensagem explícita; não introduzir recuperação de conta.
- Contextos são baratos de recriar → limitar também por IP, capacidade global e disco; não apresentar anonimato como proteção total contra abuso.
- Gateway/spool acrescentam complexidade → contratos de mensagens versionados, testes de DNS/rebinding e isolamento real obrigatórios.
- Fontes mudam → erros claros e versões de ferramentas fixadas, sem contorno de restrições.
- Credenciais locais de desenvolvimento → somente rede interna; documentação exigirá substituição antes de qualquer futura exposição remota.

## Migration Plan

Após aprovação: fixar dependências, criar shared/config, migrations e contratos; construir Compose básico; aplicar serviços e testes incrementalmente. Não existe migração de dados legados. Rollback futuro usa imagem anterior compatível e backup; nunca reset automático de volumes. Arquivamento somente após todas as tarefas e evidências correspondentes.

## Referências verificadas

- [OWASP: SSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html): fundamenta defesa em camadas e validação de destinos; os parâmetros acima são decisões do VideoFlow.
