# VideoFlow

Painel CRM de mídia sem contas. React e Fastify usam uma única origem; jobs pertencem ao contexto anônimo do navegador. Processamento por BullMQ/Redis, yt-dlp e FFmpeg isolados da rede de dados.

## Iniciar localmente

Docker Desktop em modo Linux/WSL2 e Compose 2.24.4 ou superior. Recomenda-se disponibilizar ao Docker 8 GiB de RAM e espaço para imagens e arquivos de mídia. Nenhuma instalação de Node, Python, PostgreSQL, Redis ou FFmpeg no host é necessária.

```powershell
docker compose up -d --build
docker compose ps
```

Abra **http://localhost:8080**. Não use `127.0.0.1` como origem da interface: a validação Origin usa o endereço configurado. O primeiro build instala dependências dentro da imagem. Migrations executam antes de API/worker; nenhum volume anterior é apagado. `.env` é opcional: os defaults funcionam localmente. Para alterar porta, altere também ORIGIN conforme `.env.example`.

```powershell
docker compose logs --tail 100 videoflow-api videoflow-worker
docker compose stop
docker compose up -d
```

`stop` preserva containers, banco, fila e arquivos. Não utilize comandos de remoção de volumes no fluxo normal.

## Desenvolvimento em containers

Pare a composição normal antes de usar a mesma porta:

```powershell
docker compose stop
docker compose -f compose.yaml -f compose.dev.yaml up -d --build
```

Fontes ficam em bind mounts, dependências Linux em volumes próprios e HMR passa pelo proxy. A API usa polling de arquivos para suportar bind mounts Windows. Para retornar, pare o projeto de desenvolvimento e inicie o normal. Nunca monte node_modules do Windows.

## Verificação isolada

```powershell
docker compose -f compose.yaml -f compose.test.yaml --profile tools build
docker compose -f compose.yaml -f compose.test.yaml up -d
docker compose -f compose.yaml -f compose.test.yaml run --rm quality
docker compose -f compose.yaml -f compose.test.yaml run --rm e2e
```

Os mesmos comandos funcionam em shell POSIX. `quality` reinstala dependências via lockfile e executa lint, formatação, tipos, build, audit, regressão e os nove testes especializados de mídia, mais um cenário de manifesto malicioso. `e2e` usa Chromium na imagem própria e frontend estático em container, sem Vite. O projeto `videoflow-acceptance` possui volumes distintos; sua fixture sintética não publica portas. Apenas o entrypoint de gateway de teste permite `fixture:80`. A origem interna dos testes é `http://videoflow-proxy:8080`; a porta 8081 serve diagnóstico, não uso interativo com outra origem.

Relatórios são gravados em `docs/verification/docker`. As falhas retornam código diferente de zero. Evidências e tarefas verificadas estão no [relatório operacional](docs/verification/operate-videoflow-docker.md).

## Documentação

- [Operação, redes, volumes, backups e troubleshooting](docs/operations.md)
- [Preparação futura de VPS Ubuntu](docs/vps.md)
- [Dashboard e acesso anônimo](docs/dashboard.md)
- [Arquitetura](docs/architecture.md), [segurança](docs/security.md), [pipeline](docs/media-pipeline.md)

Nenhuma mudança OpenSpec é arquivada automaticamente. Esta entrega não executa deploy remoto.

## Dependências e verificações no host

Para trabalhar fora dos containers, use Node 22.20 (ou uma versão compatível com `engines` do package.json) e npm. Na raiz:

```powershell
npm ci --ignore-scripts
npm run db:generate
npm run typecheck
npm run lint
npm run format:check
npm run build
npm test
```

`npm test` executa os testes que não exigem serviços externos; suites de integração permanecem desabilitadas sem seus flags explícitos. Use o fluxo Docker de verificação acima para PostgreSQL, Redis, sandbox e mídia reais.

Copie `.env.example` para `.env` se precisar de overrides locais. O exemplo e os Compose de teste contêm exclusivamente valores fictícios de desenvolvimento. Eles não são credenciais adequadas para ambientes públicos. Nunca adicione `.env`, cookies, dumps ou dados de volumes ao Git.

O frontend e a API iniciam juntos pelo Compose. Para acompanhar cada componente:

```powershell
docker compose logs --tail 100 videoflow-frontend videoflow-api
```

O overlay `compose.dev.yaml` executa o frontend com Vite e a API com atualização das fontes. Para desenvolvimento manual, os comandos são `npm run dev --workspace @videoflow/web` e `npm run dev --workspace @videoflow/api`; a API requer DATABASE_URL, REDIS_URL e a infraestrutura descrita em `docs/architecture.md`. A interface usa a origem `http://localhost:8080` e encaminha `/api` para a API local na porta 3000. Prefira Compose para reproduzir todo o processamento isolado.

## OpenSpec e estado de verificação

Propostas, designs, requisitos e checklists estão em `openspec/changes/<mudanca>/`. As especificações consolidadas ficam em `openspec/specs/`; a publicação não consolida nem arquiva mudanças. Com OpenSpec 2.0 instalado:

```powershell
openspec list
openspec validate --all --strict
```

A mudança `improve-source-rate-limiting` permanece incluída com suas tarefas pendentes. A aceitação operacional Docker também permanece em andamento. Os relatórios em `docs/verification/` registram verificações anteriores e suas limitações; logs, traces, screenshots e backups locais são excluídos da publicação. A publicação do código não equivale à aprovação final das mudanças nem à prontidão para produção.
