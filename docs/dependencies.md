# Dependências da fundação

Versões fixadas no package.json e package-lock.json. Consulta ao registro oficial npm e documentação em 15/11/2026. Instalação usa npm ci --ignore-scripts, seguida de geração explícita do cliente Prisma; nenhuma instalação global no host é requisito para executar os testes Docker.

| Componente | Versão selecionada |
|---|---|
| Node da imagem de teste | 22.20.0, Debian bookworm-slim |
| TypeScript | 5.9.3 |
| Fastify | 5.12.8 |
| Zod | 4.6.7 |
| Prisma CLI / Client / adapter-pg | 7.10.1 |
| pg | 8.23.1 |
| ioredis | 6.0.0 |
| PostgreSQL de teste | 17.6 |
| Redis de teste | 7.4.6 |
| fastify-type-provider-zod | 7.0.0 |
| @fastify/cookie / cors / helmet / swagger | 11.1.5 / 11.4.3 / 13.2.0 / 9.9.4 |
| Vitest | 5.1.0 |
| ESLint / typescript-eslint | 10.15.0 / 8.72.2 |
| Prettier | 3.10.1 |
| ipaddr.js | 2.5.0 |

## Compatibilidade

Node 22.20 atende aos engines consultados de Prisma 7, Vitest 5, ESLint 10 e ioredis 6. TypeScript 5.9.3 permanece na interseção de Prisma (>=5.4) e typescript-eslint (>=4.8.4 <6.1). Evitou-se TypeScript 7, fora dessa faixa, e Prisma CLI 8 RC; CLI/Client/adapter foram fixados juntos. O provider Zod requer Fastify ^5.5, Zod >=4.1.5 e Swagger >=9.5.1, atendidos pelas versões selecionadas.

Referências: [Node: releases](https://nodejs.org/en/about/previous-releases), [Fastify: LTS](https://fastify.dev/docs/v5.7.x/Reference/LTS/), [Prisma: requisitos](https://docs.prisma.io/docs/orm/reference/system-requirements). O lockfile registra integridade e versões transitivas; os resultados executados ficam no relatório de verificação.

## Correção transitiva

A instalação inicial apontou GHSA-g3hv-75wg-m249 em minimatch, dependência do parser ESLint. Aplicado override restrito a `@typescript-eslint/typescript-estree` para minimatch 11.0.1, cujos exports CommonJS/ESM e engines foram consultados. A reinstalação reportou zero vulnerabilidades; lint, typecheck, build e 104 testes passaram em Docker após a alteração. Não foi aplicado npm audit fix --force.

## Dependências de etapas seguintes

### Processamento — reconciliação em 15/11/2026

BullMQ 5.81.5 foi fixado no lockfile: engine Node >=12.22, dependência própria ioredis 5.11.1. O worker usa opções de conexão, sem compartilhar a instância ioredis 6 da API. npm install reportou zero vulnerabilidades; existem avisos de depreciação transitivos para cron-parser 4.9 e node-abort-controller. A linha 5 foi mantida deliberadamente para o contrato de fila empregado. Referência: https://docs.bullmq.io/guide/connections.

Imagem de mídia: mesmo Node 22.20 por digest da fundação, Python Debian 3.11.2, pacote ffmpeg `7:5.1.9-0+deb12u1` e yt-dlp `2026.10.26` (Python >=3.11, consultado no registro PyPI oficial). Build executou npm ci, Prisma generate, builds TypeScript e comandos de versão de yt-dlp/FFmpeg/ffprobe. Smoke test `docker run --rm --network none videoflow-media:development yt-dlp --version` retornou `2026.10.26`. Isso ainda não comprova as conversões integradas. Fontes oficiais: https://github.com/yt-dlp/yt-dlp e https://ffmpeg.org/ffmpeg.html.

### Frontend — preparação de dependências

O workspace web contém somente manifesto e probe de compatibilidade; não representa dashboard implementado. Versões/engines/peers foram consultados com npm view no registro oficial em 15/11/2026, sem forçar instalação de peers incompatíveis.

| Pacote | Versão | Compatibilidade relevante |
|---|---|---|
| React / React DOM | 19.3.1 | Par exato; tipos 19.3.0 |
| Vite | 8.3.8 | Node ^20.19 ou >=22.12; imagem 22.20 atende |
| plugin-react | 6.3.0 | Vite ^8 |
| Tailwind / plugin Vite | 4.3.5 | Integração fixada na mesma versão |
| shadcn CLI | 4.23.0 | Node >=20.18.1; apenas ferramenta de desenvolvimento |
| React Router DOM | 7.18.5 | Node >=20; React >=18 |
| TanStack React Query | 5.107.1 | React 18 ou 19 |
| React Hook Form | 7.92.0 | Node >=18; React 16–19 |
| resolvers | 7.0.6 | RHF ^7.55; Zod 3.25/4, atende Zod 4.6.7 |
| Playwright test | 1.65.1 | Node >=20; execução de navegador pertence ao aceite do dashboard |
| lucide-react / CVA / clsx / tailwind-merge | 1.73.0 / 0.7.1 / 2.1.1 / 3.7.0 | Dependências de composição visual, fixadas no lockfile |

O build Docker de mídia executou npm ci --ignore-scripts com todos os workspaces, Prisma generate e builds TypeScript. Probe apps/web/check-dependencies.mjs verifica imports, render React, compilação Tailwind e build Vite em memória. Não usa browser nem afirma E2E da interface.

Audit atualizado: três alertas baixos transitivos associados a deepmerge 4.3.1 em shadcn/@shadcn/registry (GHSA-gcqx-w48m-w2h4). O registro não oferecia versão mais nova de deepmerge; não foi aplicado downgrade de shadcn sugerido pelo audit. Esse caminho é ferramenta de geração, não serviço de mídia. Override restrito a @ts-morph/common elimina o minimatch vulnerável; npm update minimatch atualizou o lockfile e reduziu os seis alertas iniciais para três baixos. Mantém-se registrada esta limitação até correção upstream.
