# Verificação — implement-media-processing

Data: 15/11/2026. Workflow `openspec-apply-change` seguido de `openspec-verify-change`; schema spec-driven, raiz local. Os resultados abaixo são execuções observadas, não inferidos do status de planejamento do CLI.

## Implementação e integração

API agenda inspeções BullMQ e persiste resultados no PostgreSQL. Worker consome IDs/gerações, adquire lease/slot transacional e envia comandos estritos ao sandbox por spool. yt-dlp/FFmpeg/ffprobe reais executam sem shell e sem rede de dados. Gateway valida cada destino e conecta ao IP aprovado; sandbox não tem saída direta. Cancelamento, deadlines, retry, outbox, reconciliação e retenção são persistidos. Publicação exige resultado validado, SHA-256 e CAS; a API mantém streaming autorizado com Range.

Sem autenticação, deploy, commits, push ou arquivamento. Não foram excluídos volumes. A exceção para a fixture privada existe somente no entrypoint de teste, separado do gateway de produção.

## Matriz de requisitos OpenSpec Verify

Todos os 13 requisitos são ADDED; não há remoções ou renomeações.

| Domínio / requisito | Implementação | Evidência |
|---|---|---|
| media-inspection: Consulta de metadados | modules/media/routes.ts; inspection.ts; metadata.ts | media-api: 200, campos/expiração, timeout 504; gateway: campos ausentes |
| Disponibilidade honesta | metadata.ts; pipeline.ts | áudio/silencioso reais, fonte protegida 422; playlists/lives/DRM/duração em testes de normalização |
| Miniaturas seguras | thumbnail.ts; rota local autorizada | PNG real; MIME/tamanho/SVG/destino privado; estrangeiro 404 e vencida 410 |
| media-processing: Saída MP4 compatível | pipeline.ts | seis combinações, ffprobe, 480p sem upscale, redução para 360 e faststart binário |
| Saída MP3 honesta | pipeline.ts; metadata.ts | 96/192/320 kbps; FORMAT_UNAVAILABLE sem áudio; SOURCE_QUALITY_LIMIT |
| Seleção e revalidação | pipeline.ts | remux/redução, fonte sem áudio, HLS e chunked reais |
| Publicação íntegra | evidence.ts; lifecycle.ts | checksum/codecs/duração; quatro janelas de publicação/cancelamento em PostgreSQL |
| Limites durante execução | gateway.ts; pipeline.ts; supervisor.ts | quota acumulada entre conexões, limites de disco/entradas/prazo, processo e filho resistentes, mídia inválida sem artefato |
| job-lifecycle: Máquina de estados | shared/index.ts; execution.ts | 89 testes de contratos/políticas; atualização antiga, lease vencida e estado terminal |
| Execução única efetiva | queue.ts; execution.ts | dois consumidores BullMQ reais, duplicação, crash após enqueue e teto global 2 |
| Cancelamento durável | repository.ts; client.ts; sandbox.ts | cancelamento real durante download e conversão, repetição, corrida com publicação |
| Tentativas e recuperação limitadas | lifecycle.ts; repository.ts | backoffs 5/20 s, 3/ciclo e 9/total, quota e retry concorrente; SIGKILL real |
| Retenção e limpeza | lifecycle.ts; API artifacts.ts | datas controladas, arquivo/inspeção/contexto/controle expirados; lease preservada; API 410 imediato |

## Evidências reais

- Matriz inicial: MP3 low/medium/high = 49.049 / 97.949 / 163.151 bytes; MP4 = 302.640 / 626.478 / 626.478 bytes. Todos os outputs passaram por ffprobe. Auditoria confirmou `moov` antes de `mdat`.
- HLS: job `a2bc5aeb-493d-4406-90ed-02f8faf2d0e1`, 303.813 bytes, SHA-256 `41b9921fce30ed4efe43847afd27a7bc8512083f4825cdf979e7aa2113e778ad`.
- HTTP sem Content-Length: job `b907c357-c70f-4f61-af1f-8f86173e7bfc`, 302.640 bytes, COMPLETED.
- Cancelamento em DOWNLOADING: job `7b78da09-645d-4348-a1b2-cb1cfa6c630b`, 1.321 ms. Em PROCESSING: `a7612478-16b7-493f-912b-d0c084dae275`, 1.375 ms. Tentativa encerrada, lease liberada e nenhum artefato.
- Worker morto por `docker compose ... kill -s SIGKILL worker`: job `0059abd6-3bae-497a-9cd4-b25a1a75a4c3`; geração 1 WORKER_INTERRUPTED, geração 2 COMPLETED; recuperação em 71.637 ms após start.
- API parada/iniciada: job `8d9d17e1-47a5-497c-b0de-287fe268890a`; mesmo cookie consultou o trabalho COMPLETED após reinício, sem expor o cookie no log.
- Retry real: job `226b6a09-3ccd-4847-93af-611ef9bd192f`, duas falhas NETWORK_ERROR e conclusão na terceira tentativa. Intervalos medidos respeitaram pelo menos 5 e 20 segundos.
- Network probe no sandbox: 32 conexões diretas a host, banco, Redis, fixture, Internet e IPs das redes de dados bloqueadas; conexão ao gateway 3128 permitida. Inspect confirmou rede isolada, comandos RO, rootfs RO, usuário node, cap_drop ALL, no-new-privileges, 2 CPU, 2 GiB RAM e 128 PIDs.
- Redirect real para 169.254.169.254 terminou SOURCE_BLOCKED, sem artefato nem retry; invalid.mp4 terminou PROCESS_FAILED, também sem artefato.

## Comandos e resultados

```powershell
docker build -f infra/docker/media.Dockerfile -t videoflow-media:development .
docker compose -f compose.foundation.yaml -f compose.quality.yaml run --rm --no-deps quality
docker compose -f compose.media.yaml -f compose.media.fixture.yaml run --rm --no-deps quality npm test -- --configLoader runner tests/media.integration.test.ts tests/media-api.integration.test.ts tests/media-lifecycle.integration.test.ts
npm run lint
npm run format:check
npm run typecheck
npm run build
openspec validate --all --strict
```

Build Docker executou npm ci, Prisma generate e builds dos três workspaces de backend/contratos/worker. Node 22.20.0; yt-dlp 2026.10.26; FFmpeg/ffprobe 5.1.9 Debian. A imagem mais recente de implementação tem manifest list `sha256:b8d17833c6d0cbf580bfb24a58b8393a6e4e9bf926879f64ba98c401dcb4a20c`.

Regressão Docker às 16:35 UTC: **126 aprovados**, nove testes de mídia ignorados deliberadamente nessa composição; são executados na composição de mídia separada. Rodadas anteriores de mídia aprovaram a matriz, API e sete casos de lifecycle. Lint, formatação e typecheck passaram no host; build passou no container. OpenSpec strict: quatro mudanças válidas, zero falhas. Resultado da rodada final será acrescentado abaixo.

## Problemas corrigidos e limites da evidência

- Corrigidos timeout de inspeção classificado como 422, entrega de SOURCE_BLOCKED, symlink em diretório pai, corrida de conexão Redis e consulta de estado BullMQ após remover mensagem.
- Testes de crash de publicação usam checkpoints controlados com PostgreSQL/filesystem reais. O crash de worker usa SIGKILL real. Esses são tipos distintos de evidência.
- Testes de disco/quota usam limites de política controlados; não enchem o disco do host nem transferem 2 GiB por execução. Limites reais permanecem fixos no código de produção.
- Tests/compose.fixture montam fontes somente leitura para iteração. A imagem foi construída separadamente; isso não equivale a aceite da composição final com frontend.
- Três alertas baixos transitivos em deepmerge/shadcn permanecem registrados em docs/dependencies.md. Sem vulnerabilidades altas/críticas reportadas pelo npm audit executado.
- Aceite de navegador CRM, Nginx, composição final e operação completa pertencem às mudanças dashboard/Docker. Não foram declarados implementados aqui.

## Rodadas finais e rastreabilidade

A rodada conjunta iniciada às 16:36 UTC sofreu interrupção prolongada de relógio/execução e uma tentativa terminou CANCELLED; o container de testes foi encerrado explicitamente, sem apagar volumes. Essa rodada não conta como aprovação global. Seus sete casos de lifecycle e a API já tinham terminado com sucesso; a matriz foi repetida separadamente.

Às 17:20 UTC a matriz repetida passou em 29,9 segundos: seis combinações padrão, HLS, chunked e fonte MP3 de 64 kbps convertida ao alvo de 320 kbps. Último job: `488823c3-1a75-4d6b-b695-4e079b982fc3`, SHA-256 `508c837a13488f79e0a4b40c22eac59fc3fa9d451fe9acf35d4e27bf2eb543fd`. O aviso SOURCE_QUALITY_LIMIT permanece na inspeção; não se afirma melhoria da fonte.

Heartbeat foi alinhado ao intervalo de cinco segundos do design. Reteste real às 17:20 UTC: dois casos aprovados, cancelamento em 1.816 ms (download) e 1.294 ms (conversão). Build final passou com manifest list `sha256:091c3436017ef9099fd4982077fdad93c13150c0dbe89d34cc1709990e32fcdc`. As alterações posteriores são testes/documentação, não código executável de produção.

## Inventário de arquivos

- Worker: workers/media-worker/package.json, tsconfig.json e src/{protocol,spool,supervisor,queue,execution,gateway,gateway-main,metadata,pipeline,thumbnail,sandbox,client,lifecycle,evidence,inspection,main,download-progress}.ts.
- API: apps/api/package.json, src/app.ts e src/modules/media/routes.ts.
- Dependências/preparação: package.json, package-lock.json, tsconfig.json, vitest.config.ts, apps/web/{package.json,check-dependencies.mjs,dependency-entry.ts}.
- Infra: infra/docker/{foundation,media}.Dockerfile; compose.media.yaml, compose.media.fixture.yaml, compose.quality.yaml.
- Testes: worker, gateway, queue.integration, cleanup.integration, publication.integration, thumbnail, download-progress, resource-limits, retry-limits.integration, media.integration, media-api.integration e media-lifecycle.integration; fixtures/{media-server,gateway-test,network-probe,recovery,api-restart,artifact-audit}.ts.
- Docs: dependencies.md, change-dependencies.md, media-pipeline.md e relatórios de verificação. Checkboxes das duas mudanças atualizados conforme evidências. Especificações permanecem em openspec/changes/<mudança>/specs/<domínio>/spec.md.

## Parecer final — OpenSpec Verify

| Dimensão | Resultado |
|---|---|
| Completude | 22/22 tarefas; 13/13 requisitos ADDED mapeados; nenhuma remoção/renomeação |
| Correção | Cenários revisados com testes unitários, PostgreSQL/Redis, ferramentas e processos reais; nenhum requisito sem implementação identificado |
| Coerência | Contratos/modularidade/spool/redes/retencão e heartbeat de 5 s alinhados ao design; padrões TypeScript/lint revisados |

**Zero achados críticos de implementação.** Um aviso de dependência: três alertas baixos derivados de deepmerge na ferramenta shadcn, sem correção compatível disponível na consulta. Ação: atualizar a dependência quando upstream publicar correção e repetir audit/probe. Não é uma dispensa de requisito de mídia. Nenhuma verificação obrigatória omitida; os limites dos métodos de teste estão explicitados acima (especialmente disco, quota e crash por checkpoint). Não houve teste destrutivo de esgotamento físico do disco do host.

Às 17:21 UTC, o teste API completo passou em 35,6 s, incluindo artefato de mídia real expirado (410 FILE_EXPIRED), inspeção real vencida (409 INSPECTION_EXPIRED), miniatura estrangeira/vencida, aviso SOURCE_QUALITY_LIMIT e timeout. Resultado agregado sem contar repetições: 126 testes de regressão e 9 testes de mídia aprovados em composições/rodadas separadas. Não se apresenta a rodada interrompida como aprovação.

Critérios desta mudança atendidos pelas evidências relacionadas; nenhuma tarefa pendente. Mudança permanece aberta, sem arquivamento por instrução do usuário. Próximas dependências: dashboard CRM e integração/aceite final Docker, com suas tarefas ainda não concluídas. O VideoFlow completo não está declarado pronto.
