# Verificação — operate-videoflow-docker

Rodada iniciada em 2026-11-15. **EM EXECUÇÃO: este documento não declara aceitação final.** As quatro mudanças permanecem abertas, sem arquivamento, commit, push ou deploy. Nenhum volume foi excluído.

## Evidências já observadas

- Stack `videoflow`: oito serviços contínuos saudáveis; initialize/migrate terminaram com código 0. A aceitação completa ainda depende das verificações abaixo.
- `docker/production-inspect.json`: usuários não root nos serviços contínuos, root somente no inicializador sem rede, limites CPU/memória/PIDs, read-only, cap_drop ALL, logs rotacionados, sem privileged ou socket Docker. Somente proxy publica porta no host.
- `docker/runtime-versions.log`: Node 22.20.0, yt-dlp 2026.10.26, FFmpeg/ffprobe 5.1.9; entrypoint de gateway de teste ausente no sandbox de produção.
- `docker/redis-config.txt`: AOF yes, appendfsync everysec e maxmemory-policy noeviction.
- Build da imagem quality concluído com código 0 (`docker/build-quality.log`); build do proxy concluído (`docker/build-proxy.log`).
- Lint, formatação e typecheck concluídos dentro do container, com código 0 nos respectivos logs em `docker/`.
- Script POSIX de status executado no Ubuntu/WSL (`docker/shell-status.log`).
- Guia futuro de VPS revisado em `../vps.md`, sem executar ações remotas.
- `docker/migration-result.json`: migration inválida terminou com código 1; API/worker não iniciaram e registros de migrations permaneceram no banco.
- `docker/http-proxy.log`: navegação SPA direta, cache estático, cabeçalhos defensivos, health e rejeição de tentativa de evasão por forwarding headers passaram.
- `docker/network.log`: conexões diretas do sandbox ao host, Internet, fixture, PostgreSQL e Redis foram bloqueadas, inclusive pelos IPs reais da rede de dados.
- `docker/restore.json`: pg_dump/pg_restore concluídos em banco isolado; dez contextos foram preservados. Nova rodada com jobs/artefatos será registrada após o processamento.

## Problemas encontrados e correções

- Chown recursivo durante build causava cópia por arquivo no overlayfs: substituído por COPY --chown e ajuste apenas da raiz. A tentativa anterior interrompida não conta como aprovação; o build corrigido terminou com código 0.
- Linha final CRLF em script POSIX: normalizada para LF e acrescentada regra em .gitattributes.
- Captura de stderr no Windows PowerShell confundia progresso do Docker com exceção: scripts verificam explicitamente exit code e mantêm stderr no console.
- Pools automáticos de rede esgotados: removidos containers/redes dos antigos projetos de teste VideoFlow, preservando todos os volumes. Nenhuma rede de outro projeto foi removida.
- Audit aponta três vulnerabilidades baixas nas dependências de ferramentas; não se aplicou downgrade incompatível automático. Resultado final do audit em container ainda será registrado.
- Regressão teve timeouts sob I/O de build: uma tentativa passou 131/132, outra 131/132 com falha em teste diferente. Falhas ainda não são consideradas resolvidas até a rodada final.
- Docker cp não acessou arquivos em tmpfs: backups usam leitura por exec, Base64 validado no PowerShell e bytes diretos no shell. SQL de conferência passa por stdin para preservar identificadores no Windows PowerShell.
- A revisão automática rejeitou o comando de ensaio de gateway indisponível com yt-dlp, sem motivo específico informado. O comando não foi executado; esse cenário permanece não verificado nesta rodada.

## Verificações pendentes

Suíte completa, mídia real, E2E contra frontend estático, HMR/watch, testes adversariais, reinícios, indisponibilidade, limpeza, backup/restore, migration inválida, comando final de inicialização, matriz de 49 requisitos e OpenSpec Verify. Checkboxes serão atualizados somente com evidências correspondentes.

## Arquivos envolvidos

Composições base/dev/test/restore/migration-test; infra/docker/runtime.Dockerfile; infra/nginx; infra/health; infra/scripts; .dockerignore/.gitattributes/.env.example/.gitignore; configuração de confiança do proxy na API; entrypoint operacional de limpeza no worker; configuração Playwright e testes/fixtures; README e documentação operacional, de arquitetura, segurança e VPS. Contratos do produto e autenticação não foram alterados.
