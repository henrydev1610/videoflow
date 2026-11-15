# Arquitetura VideoFlow

Monorepo TypeScript com frontend React, API Fastify, PostgreSQL, Redis/BullMQ e worker de mídia. A entrada HTTP única é o proxy Nginx; frontend estático e API compartilham origem. A aplicação não tem autenticação nem contas. As especificações aprovadas permanecem em `openspec/changes/`, sem arquivamento automático.

## Módulos

- `packages/shared`: DTOs Zod, estados/limites e política de fontes em export separado para não incluir APIs Node no browser.
- `apps/api`: rotas de contexto, inspeção, downloads e saúde; services/repositories; Prisma, Redis, logs seguros e streaming.
- `apps/web`: shell CRM, cinco páginas, cliente tipado, TanStack Query, preferências locais e componentes acessíveis.
- `workers/media-worker`: outbox, fila, leases, inspeção, coordenação, publicação e retenção; sandbox executa ferramentas via spool; gateway valida cada conexão.
- `infra`: imagens multi-stage, Nginx, health checks e scripts operacionais.

## Dados e consistência

AnonymousContext guarda UUID, hash SHA-256 da capacidade e expiração fixa de 30 dias. MediaInspection guarda metadados reais por 10 minutos. DownloadJob guarda opções, estado, progresso, timestamps, lease e geração. DownloadAttempt preserva tentativas. FileArtifact guarda storageKey, MIME, bytes bigint, checksum e validade. OutboxEvent é criado na transação do trabalho. IdempotencyRecord é único por contexto/chave; QuotaCounter serializa reservas.

Criação, cancelamento e retry exigem contexto válido e bloqueiam contador global antes do contexto. Worker usa leases e geração; publicação exige compare-and-swap e evidência de saída válida. Cancelamento persiste estado/evento e sinaliza encerramento do processo pelo spool. Retry preserva o job e incrementa geração/ciclo, limitado a nove tentativas totais. Outbox e reconciliação toleram mensagens duplicadas/perdidas e reinícios.

Criação usa inspectionId, formato, qualidade, direitos e chave UUID idempotente. Reenvio idêntico retorna o mesmo trabalho; corpo divergente retorna 409. Consultas filtram contextId/historyExpiresAt e leem página+summary em RepeatableRead. Arquivos vencidos são bloqueados imediatamente, sem depender de limpeza física.

## Isolamento e operação

Worker não executa downloads na rede de dados. Sandbox só participa da rede de mídia isolada, não recebe credenciais de banco/fila, lê comandos e escreve resultados/temporários. Gateway conecta ao IP público aprovado; valida redirects e recursos secundários. API monta artefatos RO; frontend/proxy/gateway não recebem arquivos privados. Diagramas, redes, volumes e procedimentos em [operations.md](operations.md).

Três jobs ativos por contexto, cem globais, duas execuções; entrada até 2 GiB, saída até 1 GiB, duração até 2 h, tentativa até 30 min. Artefatos 24 h e histórico até 30 dias, sujeito à expiração do contexto. Reserva de disco, CPU/memória/PIDs, deadlines, encerramento de grupos e limpeza com leases complementam esses limites.

## Contratos e verificação

OpenAPI em `/api/openapi.json`; Zod valida entrada e saída. Lista `{items,total,page,pageSize,summary}`, individuais `{data:...}`, erros `{error:{code,message,requestId}}`. Respostas privadas usam no-store; arquivos usam streaming com Range autorizado. Cookies são HttpOnly e nunca são transferidos para storage do frontend.

Os três relatórios de fundação, mídia e dashboard registram verificações anteriores. O relatório `docs/verification/operate-videoflow-docker.md` e a matriz de 49 requisitos nas dez capabilities registram o aceite da composição integrada, com seus resultados e limites reais.
