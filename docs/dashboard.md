# Dashboard VideoFlow

## Execução local e fronteira de implantação

O frontend em `apps/web` usa React, TypeScript, Vite, Tailwind, shadcn/ui (Radix), TanStack Query, React Router, React Hook Form, Zod e Lucide. Não existe autenticação ou painel global.

```powershell
npm ci
npm run build --workspace @videoflow/shared
docker compose -f compose.media.yaml -f compose.media.fixture.yaml -f compose.web-test.yaml up -d --no-deps api
npm run dev --workspace @videoflow/web
```

O comando Compose acima pressupõe os serviços de mídia previamente inicializados conforme `docs/verification/implement-media-processing.md`. Acessar `http://localhost:8080`; o Vite encaminha `/api` para `127.0.0.1:3000`. O override expõe somente a API na interface loopback para testes. Não representa a composição final de produção: imagem estática do frontend, proxy de produção, políticas de cache/headers e smoke tests de reinicialização pertencem a `operate-videoflow-docker`.

## Páginas e comportamento

- `/`: cinco indicadores calculados pelo backend para o contexto inteiro, cinco atividades recentes e ação de criação. Falhas não viram zeros; dados já obtidos são identificados como desatualizados.
- `/new`: URL HTTP(S), inspeção, metadados/miniatura local autorizada, formatos disponíveis, três qualidades e confirmação de direitos. Mudar a URL invalida a inspeção. Duplo clique é bloqueado; reenvio da mesma operação conserva a chave idempotente.
- `/downloads` e `/history`: consultas paginadas, busca com debounce de 300 ms, status/formato/ordenação na URL, cancelamento confirmado, retry permitido pelo backend, download nativo por streaming e detalhes com tentativas/validade. Colunas secundárias ficam nos detalhes em telas menores.
- `/settings`: tema claro/escuro/sistema, MP3/MP4, qualidade, densidade e tamanho da página. Preferências versionadas, validadas e restritas a essas propriedades. Storage bloqueado mantém o uso em memória.

MP3 oferece alvos de 96/192/320 kbps; MP4 de 360/720/1080p. Não há promessa de melhorar uma fonte inferior. Mídia sem áudio não oferece MP3; a API determina disponibilidade e mensagens seguras. Inspeções expiram e precisam ser refeitas. O usuário confirma autorização; isso não afirma verificação jurídica automática.

## Acesso anônimo e integração

POST `/api/context` antecede as consultas. O cookie HttpOnly é emitido pelo servidor; não é lido nem copiado para localStorage. Todas as chamadas e downloads usam a mesma origem. Query keys contêm geração local, não capacidade. CONTEXT_REQUIRED cancela consultas, limpa cache, remove a interface privada e pede ação explícita para iniciar novo espaço. Respostas atrasadas de uma geração anterior são rejeitadas. Web Locks coordena bootstrap entre abas quando disponível.

Endpoints consumidos: contexto, inspeção, listagem/criação, detalhes, cancelamento, retry, miniatura e arquivo. Contratos de jobs/listas/erros vêm de `@videoflow/shared`; inspeção valida a resposta atual do Fastify. Nenhum módulo de banco, fila ou subprocesso entra no bundle.

Polling de 2 s somente com ativos e aba visível; para no estado terminal. A expiração visual do arquivo utiliza um timer local, sem novo polling contínuo. Download usa link `/api/downloads/:id/file`, nunca Blob integral. Autorização, Range, expiração e isolamento continuam no backend. Limpar cookies perde acesso aos trabalhos anteriores; arquivos duram até 24 h e histórico até 30 dias, sujeito à validade do contexto.

## Componentes e acessibilidade

Shell/sidebar/header, JobsTable, JobStatus, JobDetails, Loading, ErrorBox e Empty são reutilizáveis. Primitivas shadcn em `src/components/ui` fornecem Button, Input, Dialog, Sheet, Table, Badge, Skeleton, Tooltip e Sonner. Os seletores são HTML nativos com rótulos, teclado e tokens compartilhados; tabela/status especializados preservam semântica HTML e textos de estado. As primitivas Table/Badge estão disponíveis para extensões, sem impor wrappers desnecessários.

Tokens em `src/styles.css`: superfícies, texto, muted, bordas, primary, sucesso, atenção e erro, com variantes `.dark`. Fonte de sistema Segoe UI; números tabulares; foco visível; redução de movimento; ações nomeadas; diálogo com retorno de foco; progressbar determinado/indeterminado; anúncios de status e notificações. Veja `apps/web/DESIGN.md` para o inventário visual.

## Verificação reproduzível

```powershell
npm test -- tests/web.test.ts
$env:RUN_WEB_REAL='1'
npx playwright test --config apps/web/playwright.config.ts
npm run lint
npm run format:check
npm run typecheck
npm run build
openspec validate --all --strict
```

Não executar build de shared simultaneamente com Playwright/Vite: a reconstrução dispara hot reload durante o teste. Os mocks HTTP existem exclusivamente em `e2e/dashboard.spec.ts`; `real.spec.ts` não intercepta HTTP e usa API/worker/PostgreSQL/Redis/gateway/FFmpeg reais com fixture autorizada. Estados FAILED e histórico volumoso são preparados explicitamente no banco de teste; retry e cancelamento seguintes percorrem os serviços reais. Expiração é antecipada apenas nos registros desse teste. Nenhum volume é excluído.
