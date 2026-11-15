# Design — Interface operacional

## Context

Não existe interface, identidade visual, tokens ou componentes no repositório. O pedido define um produto CRM/SaaS completo em português brasileiro; não define marca visual detalhada. Este artefato fixa comportamento e estrutura para revisão, sem simular dados ou apresentar um layout ainda não implementado como validado. Motivação em proposal.md e contratos em dashboard-experience e browser-preferences.

## Goals / Non-Goals

**Objetivos:** completar tarefas de mídia, compreender estados e encontrar histórico com pouco esforço. Público: visitante que possui autorização para a mídia e precisa converter ou obter arquivo local. Modo da interface: operação.

**Fora do escopo:** marketing, landing page, perfis, configurações de conta e painéis globais. Detalhes cosméticos poderão ser refinados sem alterar contratos após aprovação.

## Decisions

### Estrutura de interação

Sidebar persistente no desktop, recolhida em drawer no mobile; header mostra título da área, ação Novo Download e tema. Dashboard usa indicadores compactos e tabela de atividades como conteúdo principal. Ação primária única por contexto. Sem gráficos decorativos ou comparações percentuais sem dados reais.

Novo Download em sequência URL → inspeção → opções e autorização → processamento. Metadados são uma confirmação visual do recurso escolhido, não dados digitáveis. Formato e qualidade vêm das preferências, mas opções incompatíveis são desabilitadas e explicadas. Mudança da URL descarta inspectionId; chave idempotente é mantida para reenvio da mesma operação. Confirmação de direitos usa texto claro sem representar verificação legal automática.

Gerenciador mostra todos os trabalhos com destaque aos ativos. Histórico acrescenta controles completos de pesquisa, ordenação, paginação e drawer de detalhes. A tabela tem título, formato/qualidade, status/progresso, data, tamanho e ações; em mobile, prioriza título, estado e ação, levando campos secundários aos detalhes. Textos longos truncam visualmente com conteúdo completo acessível; placeholders não fingem título de mídia real.

### Componentes e aparência

React/Vite/TypeScript, Tailwind e componentes shadcn/ui mantidos no código: Button, Input, Select, Dialog, Sheet, Table, Badge, Skeleton, Tooltip e Toast. Lucide para ícones com rótulo acessível. Definir tokens semânticos de superfície, texto, borda, ação, sucesso, atenção e erro para claro/escuro; tipografia de sistema legível, números tabulares, escala consistente de espaçamento e contraste AA. Direção proposta: interface sóbria e densa o suficiente para gestão, com hierarquia clara; cores finais são escolha de implementação revisável.

Botões de cancelar/repetir refletem permissões retornadas e estado, mas backend permanece autoridade. Cancelamento pede confirmação em diálogo com foco restaurado. Sucesso e erro usam mensagens específicas; download expirado explica prazo e não mostra botão funcional. Estados vazios convidam criar solicitação ou limpar filtros conforme a causa. Erros de rede mantêm dados anteriores identificados como desatualizados, sem contadores artificiais.

### Dados e cache

React Router define cinco rotas e fallback de 404; proxy serve index.html para navegação direta. TanStack Query faz consultas, invalida listas/detalhes após mutações e atualiza a cada 2 s com ativos; reduz polling quando a aba está oculta e interrompe quando não há ativos. Query keys incluem uma geração local do contexto, nunca o segredo. POST /api/context acontece antes de consultas privadas; em CONTEXT_REQUIRED, limpar cache e pedir ação de novo contexto para evitar perda silenciosa de referências. Cookie só é manipulado pelo servidor.

React Hook Form + Zod compartilha validação de formato; validação de rede existe apenas no backend. Filtros persistem em search params, busca com debounce 300 ms, mudança de filtro volta à página 1. Summary é retornado pelo servidor independente da página, sem cálculos parciais. Tamanhos bigint chegam como strings; exibição usa conversão segura. Horários são localizados no navegador e expiração usa data absoluta e tempo restante sem criar decisões de autorização no cliente.

Preferências versionadas em localStorage, com fallback em memória quando indisponível. React context basta para tema/preferências; não há justificativa para Zustand. Arquivo é obtido por navegação same-origin autenticada pela capacidade; não carregar arquivos grandes inteiros em Blob na memória.

### Verificação

Vitest cobre formulário, preferências inválidas e componentes de estado. Playwright cobre rotas diretas, fluxo completo com fixture real, pesquisa/paginação, tema persistente, teclado, foco em diálogos, duplo clique, expiração e dois contextos isolados. Revisão visual em 360, 768 e 1440 pixels, claro/escuro, tabela vazia e cheia, títulos longos e falhas de rede. Fazer revisão agrupada, corrigir defeitos encontrados e confirmar; não substituir testes funcionais por screenshots.

## Risks / Trade-offs

- Polling gera carga → intervalos condicionais e paginação; SSE fica fora da arquitetura inicial por não ser necessário ao contrato.
- Preferências locais podem ser bloqueadas → fallback explícito sem impedir o fluxo.
- Dados expirados em cache → limpar ao perder contexto e invalidar por mutação.
- Múltiplas abas podem criar contexto simultaneamente → bootstrap idempotente por cookie e coordenação local; nunca mesclar históricos de capacidades distintas.

## Migration Plan

Construir shared client e shell depois dos contratos, integrar fluxo real depois do worker, executar E2E no Compose. Preferências têm versão e migração defensiva; evolução não altera trabalhos existentes. Mock de desenvolvimento/teste permanece restrito ao ambiente de teste.
