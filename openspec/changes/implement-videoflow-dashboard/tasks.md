# Tarefas — Interface

## 1. Shell e preferências

- [x] 1.1 Criar app React/Vite/TypeScript com Tailwind, shadcn/ui, Router, Query, RHF, Zod e Lucide nas versões verificadas; confirmar build sem dependências de backend no bundle.
- [x] 1.2 Implementar sidebar, header, rotas, drawer mobile e componentes reutilizáveis; testar rotas diretas, foco, teclado e navegação nos cinco destinos.
- [x] 1.3 Implementar tema claro/escuro/sistema e preferências versionadas de formato, qualidade, densidade e página; testar persistência, matchMedia, JSON inválido e localStorage indisponível.
- [x] 1.4 Documentar tokens semânticos, componentes e decisões de interação; verificar contraste AA e aplicação consistente dos temas nas páginas e diálogos.

## 2. Dados e criação

- [x] 2.1 Implementar cliente API tipado, bootstrap de contexto, Query keys e tratamento de CONTEXT_REQUIRED; testar cache descartado e ausência de segredo em storage/JavaScript.
- [x] 2.2 Implementar Dashboard com indicadores e atividades reais; testar contexto vazio, carregamento, falha, dados desatualizados e summary que ultrapassa a página visível.
- [x] 2.3 Implementar formulário de URL e inspeção com metadados, miniatura e indisponibilidades; testar URL inválida, timeout, metadados parciais e troca de URL invalidando inspectionId.
- [x] 2.4 Implementar opções de formato/qualidade, confirmação de direitos e criação idempotente; testar duplo clique, opção indisponível, inspeção vencida e navegação para job criado.
- [x] 2.5 Documentar o fluxo de criação e limites de qualidade no auxílio da interface; verificar textos em pt-BR e correspondência com erros reais.

## 3. Gerenciador e histórico

- [x] 3.1 Implementar tabela, badges, progresso, tamanho e datas com polling condicional; testar estado indeterminado, atualização após conclusão e suspensão em aba oculta.
- [x] 3.2 Implementar cancelamento com diálogo, retry e download como stream same-origin; testar ações por estado, erro 409, expirado e respostas que não autorizam ação.
- [x] 3.3 Implementar pesquisa, filtros, ordenação, paginação e detalhes com tentativas/expiração; testar query params, reset de página, busca sem resultados e títulos longos.
- [x] 3.4 Implementar toasts, skeletons, estados vazios/erro e anúncios acessíveis; testar foco de diálogo, restauração de foco e informação independente da cor.
- [x] 3.5 Documentar perda de acesso por limpeza de cookies, retenção e preferências locais; verificar ajuda visível nas páginas pertinentes sem sugerir contas.

## 4. Aceitação da experiência

- [x] 4.1 Executar Playwright contra API/worker reais com fixture autorizada: criar, acompanhar, cancelar, repetir, baixar e consultar histórico; registrar relatórios sem usar mocks como substituto do backend.
- [x] 4.2 Executar E2E com dois contextos de navegador, expiração, filtros/paginação e preferências persistentes; confirmar isolamento e funcionamento de rotas diretas.
- [x] 4.3 Revisar em 360/768/1440 pixels, claro/escuro e teclado, corrigir defeitos e confirmar acessibilidade e ausência de cortes; registrar screenshots dos estados relevantes.
- [x] 4.4 Executar lint, formatação, typecheck, testes e build web; conferir dashboard-experience e browser-preferences contra evidências.

## Workflow follow-up

- Aplicar após contratos aprovados; testes ponta a ponta exigem mídia e infraestrutura funcionais.
- Sincronizar e arquivar somente com todas as tarefas verificadas.
