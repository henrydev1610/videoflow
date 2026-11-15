# Tarefas — Fundação

## 1. Base e contratos

- [x] 1.1 Verificar versões e compatibilidade de Node, bibliotecas e ferramentas em fontes oficiais, fixar dependências/lockfile e entregar matriz em docs/dependencies.md com engines, peer dependencies e instalação npm ci comprovada em container.
- [x] 1.2 Criar npm workspaces, TypeScript strict, ESLint, Prettier e scripts comuns; verificar resolução de packages e build dos contratos compartilhados.
- [x] 1.3 Implementar schemas Zod de entrada, saída, estados, erros e paginação; executar testes de entradas inválidas, campos extras, datas, bigint serializado e respostas sem segredos.
- [x] 1.4 Implementar máquina de estados pura e documentar tabela de transições; executar testes tabelados de todas as transições permitidas e proibidas.

## 2. Persistência

- [x] 2.1 Criar schema Prisma, índices e migrations para contextos, inspeções, trabalhos, tentativas, artefatos, outbox, idempotência e contadores de quota; verificar migrate deploy e integridade referencial em PostgreSQL de teste.
- [x] 2.2 Implementar repositories obrigatoriamente escopados por contexto e serialização de DTOs; testar que listagem, detalhes e agregações de dois contextos nunca se misturam.
- [x] 2.3 Implementar criação transacional com outbox, idempotência e reservas; testar criações concorrentes, reenvio da mesma chave, chave com corpo diferente e limites por contexto/global.
- [x] 2.4 Documentar modelo, retenção e limites em docs/architecture.md; conferir exemplos contra os schemas e migrations aplicadas.

## 3. Capacidade e proteção HTTP

- [x] 3.1 Implementar POST /api/context, cookie opaco e hash persistido; testar criação, reuso, expiração, atributos do cookie e ausência de token no corpo/logs.
- [x] 3.2 Implementar autorização em todas as rotas privadas e expiração do contexto; executar testes de capacidade ausente, adulterada, vencida e IDs estrangeiros com 403/404 adequados.
- [x] 3.3 Implementar CORS/Origin estritos, headers de segurança, limite de corpo, trustProxy restrito e rate limiting Redis; testar CSRF, X-Forwarded-For forjado, 413, 429 com Retry-After e falha fechada do limitador.
- [x] 3.4 Implementar logger sanitizado e erros padronizados; testar que URLs completas, cookies, capabilities, stacks e stderr bruto não aparecem em respostas/logs; documentar códigos públicos.

## 4. API e armazenamento

- [x] 4.1 Implementar rotas/handlers/services de criação, lista, detalhes, cancelamento e retry sobre adaptadores reais; testar contratos HTTP, estados conflitantes, busca, filtros, paginação e summary independente da página.
- [x] 4.2 Implementar streaming autorizado de artefatos com Range, expiração, MIME e filename seguro; testar 200/206/416, acesso cruzado, ausência de arquivo, symlink e traversal.
- [x] 4.3 Implementar /api/health e /api/openapi.json com validação de saída; testar saúde degradada, ausência de informações privadas e conformidade entre OpenAPI e respostas.
- [x] 4.4 Implementar política compartilhada de URLs/hosts/IPs, allowlists e limites; testar IPv4/IPv6, endereços mapeados, DNS misto, protocolos e credenciais proibidos; documentar configuração em docs/security.md.

## 5. Verificação integrada da fundação

- [x] 5.1 Com infraestrutura e mídia reais disponíveis, executar testes API/PostgreSQL/Redis de persistência após reinício, criação fora da janela de inspeção e isolamento em todas as ações; registrar comandos e resultados.
- [x] 5.2 Executar lint, formatação, typecheck, testes e build da área; comparar anonymous-access, download-api e media-security à implementação e vincular evidências na matriz de aceite.

## Workflow follow-up

- Após aprovação, usar openspec-apply-change; alternar com a infraestrutura básica quando testes precisarem de serviços reais.
- Sincronizar e arquivar somente após implementação completa e evidências, sem commit/push automáticos.
