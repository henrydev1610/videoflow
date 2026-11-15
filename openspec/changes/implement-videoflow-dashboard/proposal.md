# Proposta — Interface operacional do VideoFlow

## Why

Visitantes precisam gerenciar todo o ciclo de mídia em um dashboard profissional e responsivo. Uma interface isolada ou com números fictícios não atende ao produto solicitado.

## What Changes

- Criar shell CRM com sidebar, header, navegação e temas claro e escuro.
- Implementar Dashboard, Novo Download, Gerenciador, Histórico e Configurações locais.
- Integrar metadados, criação, acompanhamento, cancelamento, repetição e download à API real.
- Incluir acessibilidade, feedback de erros, modais, toasts, skeletons e estados vazios.
- Manter preferências locais sem contas e sem expor capacidades anônimas ao JavaScript.

## Capabilities

### New Capabilities

- `dashboard-experience`: navegação, indicadores, criação e gerenciamento de solicitações.
- `browser-preferences`: preferências locais de tema, formato, qualidade e apresentação.

### Modified Capabilities

Nenhuma.

## Impact

Cria `apps/web` usando React, Vite, TypeScript, Tailwind CSS, shadcn/ui, React Router, TanStack Query, React Hook Form, Zod e Lucide. Depende dos contratos de `define-videoflow-architecture`; os fluxos completos dependem de `implement-media-processing`. Zustand não será incluído sem necessidade demonstrada.
