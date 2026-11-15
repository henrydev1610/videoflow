# Proposal

## Why

Durante a validacao manual do VideoFlow, o YouTube retornou HTTP 429
(Too Many Requests) e exigiu verificacao adicional.

O sistema precisava diferenciar limitacoes temporarias de falhas de
autenticacao e impedir requisicoes repetidas durante periodos de
restricao, preservando a disponibilidade das demais fontes.

## What Changes

- Identificar HTTP 429 retornado por plataformas externas.
- Introduzir o codigo SOURCE_RATE_LIMITED.
- Preservar SOURCE_AUTH_REQUIRED para exigencias de autenticacao.
- Registrar cooldown temporario e compartilhado no Redis.
- Impedir novas inspecoes da fonte limitada durante o cooldown.
- Retornar HTTP 429 com Retry-After correspondente ao prazo restante.
- Manter fontes independentes, como Instagram, sem bloqueio indevido.
- Tratar indisponibilidade do Redis de maneira segura.
- Definir controle de concorrencia para inspecoes simultaneas.
- Manter diagnosticos internos sanitizados.
- Criar testes unitarios e de integracao.
- Documentar a compatibilidade do extrator com yt-dlp-ejs e Node.js.

Nenhuma alteracao de contrato incompativel e prevista.

## Capabilities

### New Capabilities

- `source-rate-limiting`: Controla limitacoes temporarias impostas
  por fontes externas, incluindo classificacao de erros, cooldown,
  isolamento entre fontes, Retry-After e concorrencia.

### Modified Capabilities

Nenhuma capability oficial consolidada sera modificada diretamente.

A nova capability complementa `media-inspection`, definida na mudanca
`implement-media-processing`, e respeita `media-security`, definida
na mudanca `define-videoflow-architecture`.

As dependencias deverao ser reconciliadas antes do arquivamento.

## Impact

Componentes afetados:

- workers/media-worker/src/supervisor.ts
- workers/media-worker/src/pipeline.ts
- apps/api/src/infra/source-cooldown.ts
- apps/api/src/main.ts
- apps/api/src/app.ts
- apps/api/src/modules/media/routes.ts
- infra/docker/runtime.Dockerfile
- Redis
- Testes unitarios e de integracao
- Documentacao operacional e OpenSpec

A implementacao deve preservar:

- Acesso anonimo por contexto.
- Isolamento entre visitantes.
- Gateway de saida.
- Sandbox de processamento.
- Limitacoes de recursos.
- Downloads de fontes nao afetadas.
- Ausencia de credenciais pessoais de plataformas externas.

O cooldown nao remove verificacoes antibot nem garante que uma
plataforma externa disponibilize a midia apos sua expiracao.