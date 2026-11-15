# Proposta — Fundação do VideoFlow

## Why

O repositório não possui implementação nem contratos de produto. É necessário estabelecer isolamento anônimo, contratos REST e persistência antes de processar mídias em uma aplicação pública sem contas.

## What Changes

- Criar monorepo TypeScript strict com contratos Zod, API Fastify modular, Prisma e PostgreSQL.
- Implementar capacidades anônimas com expiração, isolamento de consultas e entrega segura de arquivos.
- Definir limites de abuso, validação de URLs, saída de rede controlada, erros e OpenAPI.
- Fixar política de retenção, modelo de dados e contratos usados pelas mudanças seguintes.
- Proibir login, cadastro, JWT, OAuth, contorno de DRM, commits automáticos e deploy remoto.

## Capabilities

### New Capabilities

- `anonymous-access`: contexto anônimo, expiração e isolamento entre visitantes.
- `download-api`: contratos REST, persistência, paginação e entrega de arquivos.
- `media-security`: validação de fontes e controles de abuso e rede.

### Modified Capabilities

Nenhuma. `openspec/specs/` contém apenas `.gitkeep`.

## Impact

Cria `apps/api`, `packages/shared`, `packages/config`, migrations e testes de contratos. Introduz dependências Fastify, Zod, Prisma, PostgreSQL e Redis. É pré-requisito de `implement-media-processing` e `implement-videoflow-dashboard`; a infraestrutura de execução pertence a `operate-videoflow-docker`. As quatro mudanças serão implementadas incrementalmente após revisão das especificações.
